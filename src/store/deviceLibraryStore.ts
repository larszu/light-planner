// ───────────────────────────────────────────────────────────────────────────
// Geraetebibliothek — Zustand, Speicher und Ablauf.
//
// Drei Dinge liegen an drei verschiedenen Orten, und das ist Absicht:
//   · die Server-Adresse  — localStorage (eine Einstellung, kein Geheimnis)
//   · der Bestand (Cache) — localStorage, getrennt vom Projekt: eine Leuchte
//     aus der Bibliothek gelangt erst ins Projekt, wenn sie gesetzt wird, und
//     dann als Kopie (wie jede andere auch), damit der Plan offline lesbar bleibt
//   · das Token           — in Electron ueber die Preload-Bruecke mit
//     `safeStorage` verschluesselt; im Web-Build im localStorage. Es steht
//     nie im zustand-State, nie im Projekt und nie in einer Log-Zeile.
// ───────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import {
  DEFAULT_DEVICE_LIBRARY_URL,
  LibraryError,
  currentUser,
  propose as proposeRemote,
  signIn as signInRemote,
  signOut as signOutRemote,
  sync as syncRemote,
  verifySecondFactor,
  type LibraryErrorCode,
  type LibraryUser,
  type SignInResult,
} from '../core/deviceLibraryClient';
import {
  PLANNER,
  applySync,
  emptyCache,
  fixtureToProposal,
  readCache,
  type LibraryCache,
  type SyncOutcome,
} from '../core/deviceLibrary';
import type { Fixture } from '../types';

const SERVER_KEY = 'light-planner:device-library-server';
const CACHE_KEY = 'light-planner:device-library-cache';
const WEB_TOKEN_KEY = 'light-planner:device-library-token';

interface StoredToken { server: string; token: string }

interface SecretBridge {
  getDeviceLibraryToken: () => Promise<StoredToken | null>;
  setDeviceLibraryToken: (v: StoredToken) => Promise<boolean>;
  clearDeviceLibraryToken: () => Promise<boolean>;
}

const bridge = (): SecretBridge | undefined =>
  (globalThis as { lightPlannerSecrets?: SecretBridge }).lightPlannerSecrets;

const tokenStore = {
  async get(): Promise<StoredToken | null> {
    const b = bridge();
    if (b) return b.getDeviceLibraryToken();
    try {
      const raw = localStorage.getItem(WEB_TOKEN_KEY);
      return raw ? (JSON.parse(raw) as StoredToken) : null;
    } catch {
      return null;
    }
  },
  /** `false`: nicht dauerhaft gespeichert — die Anmeldung haelt bis zum Beenden. */
  async set(v: StoredToken): Promise<boolean> {
    const b = bridge();
    if (b) return b.setDeviceLibraryToken(v);
    try {
      localStorage.setItem(WEB_TOKEN_KEY, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  async clear(): Promise<void> {
    const b = bridge();
    if (b) {
      await b.clearDeviceLibraryToken();
      return;
    }
    try {
      localStorage.removeItem(WEB_TOKEN_KEY);
    } catch {
      // nichts zu tun: ohne Speicher gab es auch kein gespeichertes Token
    }
  },
};

/** Das Token lebt nur in diesem Modul — nicht im State, den DevTools anzeigen. */
let token: string | null = null;

const readServer = (): string => {
  try {
    return localStorage.getItem(SERVER_KEY) || DEFAULT_DEVICE_LIBRARY_URL;
  } catch {
    return DEFAULT_DEVICE_LIBRARY_URL;
  }
};

const loadCache = (server: string): LibraryCache => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return (raw && readCache(JSON.parse(raw), server)) || emptyCache(server);
  } catch {
    return emptyCache(server);
  }
};

/** `false` heisst: der Bestand haelt nur bis zum Neuladen (B-36 — gemeldet, nicht verschluckt). */
const saveCache = (c: LibraryCache): boolean => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
};

export type SessionState = 'unknown' | 'signed-out' | 'signed-in';

interface DeviceLibraryState {
  server: string;
  session: SessionState;
  user: LibraryUser | null;
  /** Token nur fuer diese Sitzung (kein sicherer Speicher verfuegbar). */
  tokenVolatile: boolean;
  cache: LibraryCache;
  cacheSaved: boolean;
  syncing: boolean;
  lastSync: SyncOutcome | null;
  syncError: LibraryErrorCode | null;

  init: () => Promise<void>;
  setServer: (url: string) => Promise<void>;
  signIn: (login: string, password: string) => Promise<SignInResult>;
  verify: (challenge: string, code: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  syncNow: (full?: boolean) => Promise<void>;
  propose: (fixture: Fixture, sourceUrl: string) => Promise<{ slug: string; state: string }>;
}

let initialised = false;

export const useDeviceLibrary = create<DeviceLibraryState>((set, get) => {
  const forgetSession = async () => {
    token = null;
    await tokenStore.clear();
    set({ session: 'signed-out', user: null, tokenVolatile: false });
  };

  const accept = async (r: SignInResult): Promise<SignInResult> => {
    if (r.kind !== 'ok') return r;
    token = r.token;
    const persisted = await tokenStore.set({ server: get().server, token: r.token });
    set({ session: 'signed-in', user: r.user, tokenVolatile: !persisted });
    void get().syncNow();
    return r;
  };

  const server = readServer();
  return {
    server,
    session: 'unknown',
    user: null,
    tokenVolatile: false,
    cache: loadCache(server),
    cacheSaved: true,
    syncing: false,
    lastSync: null,
    syncError: null,

    init: async () => {
      if (initialised) return;
      initialised = true;
      const stored = await tokenStore.get();
      // Ein Token eines anderen Servers ist hier keins.
      if (!stored || stored.server !== get().server) {
        if (stored) await tokenStore.clear();
        set({ session: 'signed-out' });
        return;
      }
      token = stored.token;
      try {
        const user = await currentUser(get().server, stored.token);
        if (!user) {
          await forgetSession();
          return;
        }
        set({ session: 'signed-in', user });
        void get().syncNow();
      } catch {
        // Offline beim Start: angemeldet bleiben, der Bestand steht im Cache.
        set({ session: 'signed-in', user: null });
      }
    },

    setServer: async (url) => {
      const old = get().server;
      if (url === old) return;
      if (token) await signOutRemote(old, token);
      await forgetSession();
      try {
        if (url === DEFAULT_DEVICE_LIBRARY_URL) localStorage.removeItem(SERVER_KEY);
        else localStorage.setItem(SERVER_KEY, url);
      } catch {
        // Die Adresse gilt dann bis zum Neuladen.
      }
      const cache = emptyCache(url);
      set({ server: url, cache, cacheSaved: saveCache(cache), lastSync: null, syncError: null });
    },

    signIn: async (login, password) => accept(await signInRemote(get().server, login, password)),
    verify: async (challenge, code) => accept(await verifySecondFactor(get().server, challenge, code)),

    signOut: async () => {
      if (token) await signOutRemote(get().server, token);
      await forgetSession();
    },

    syncNow: async (full = false) => {
      if (!token || get().syncing) return;
      const { cache, server } = get();
      const after = full ? 0 : cache.latestSeq;
      set({ syncing: true, syncError: null });
      try {
        const res = await syncRemote(server, token, PLANNER, after);
        // Adresse waehrend des Laufs gewechselt: die Antwort gehoert nicht mehr hierher.
        if (get().server !== server) return;
        const out = applySync(get().cache, res, after, new Date());
        set({ cache: out.cache, cacheSaved: saveCache(out.cache), lastSync: out });
      } catch (e) {
        const code: LibraryErrorCode = e instanceof LibraryError ? e.code : 'server';
        if (code === 'not-signed-in' || code === 'wrong-credentials') await forgetSession();
        set({ syncError: code });
      } finally {
        set({ syncing: false });
      }
    },

    propose: async (fixture, sourceUrl) => {
      if (!token) throw new LibraryError('not-signed-in');
      const { core, facet } = fixtureToProposal(fixture, sourceUrl);
      try {
        return await proposeRemote(get().server, token, PLANNER, core, facet as unknown as Record<string, unknown>);
      } catch (e) {
        if (e instanceof LibraryError && e.code === 'not-signed-in') await forgetSession();
        throw e;
      }
    },
  };
});
