// ───────────────────────────────────────────────────────────────────────────
// Geraetebibliothek — Zustand, Speicher und Ablauf.
//
// Vier Dinge liegen an verschiedenen Orten, und das ist Absicht:
//   · die Server-Adresse und „automatisch hochladen" — localStorage
//     (Einstellungen, keine Geheimnisse)
//   · der Bestand (Cache) — localStorage, getrennt vom Projekt: eine Leuchte
//     aus der Bibliothek gelangt erst ins Projekt, wenn sie gesetzt wird, und
//     dann als Kopie (wie jede andere auch), damit der Plan offline lesbar bleibt.
//     Ein Platz je Server-Adresse (`CacheAblage`); geaendert wird er NUR durch
//     eine erfolgreiche Antwort — offline, Zeitueberschreitung, Serverfehler,
//     abgelaufene Anmeldung, Abmelden und Adresswechsel lassen ihn stehen
//     (Vertrag in `syncFrom`, `deviceLibraryClient.ts`).
//   · das Upload-Protokoll (Fingerabdruck + Zustand je eigenem Profil) —
//     localStorage, je Server
//   · das Token — beim Host, wenn er einen Schluesselbund durchreicht
//     (eingebettet im cable-planner), sonst in Electron ueber die
//     Preload-Bruecke mit `safeStorage`, sonst (Web-Build) im localStorage.
//     Es steht nie im zustand-State, nie im Projekt und nie in einer Log-Zeile.
//
// Abgleich heisst: erst hoch, dann runter. Andersherum kaeme ein gerade
// geaendertes eigenes Profil beim Herunterladen noch in der alten Fassung an.
// ───────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import {
  DEFAULT_DEVICE_LIBRARY_URL,
  currentUser,
  signIn as signInRemote,
  signOut as signOutRemote,
  syncFrom,
  upload as uploadRemote,
  verifySecondFactor,
  type LibraryUser,
  type SignInResult,
} from '../core/deviceLibraryClient';
import {
  PLANNER,
  applySyncResult,
  applyUploadResults,
  cacheFor,
  emptyUploadLog,
  errorKind,
  leereAblage,
  planUpload,
  readCacheAblage,
  readUploadLog,
  withCache,
  type LibraryCache,
  type LibraryErrorKind,
  type SyncOutcome,
  type UploadLog,
} from '../core/deviceLibrary';
import type { DeviceLibraryTokenVault } from '../integration/hostAdapter';
import type { Fixture } from '../types';

const SERVER_KEY = 'light-planner:device-library-server';
const CACHE_KEY = 'light-planner:device-library-cache';
const UPLOADS_KEY = 'light-planner:device-library-uploads';
const AUTO_KEY = 'light-planner:device-library-auto-upload';
const WEB_TOKEN_KEY = 'light-planner:device-library-token';

/** Nach Anlegen/Aendern so lange warten, bevor hochgeladen wird. */
export const UPLOAD_DEBOUNCE_MS = 2000;

interface StoredToken { server: string; token: string }

interface SecretBridge {
  getDeviceLibraryToken: () => Promise<StoredToken | null>;
  setDeviceLibraryToken: (v: StoredToken) => Promise<boolean>;
  clearDeviceLibraryToken: () => Promise<boolean>;
}

const webVault: DeviceLibraryTokenVault = {
  async get() {
    try {
      const raw = localStorage.getItem(WEB_TOKEN_KEY);
      return raw ? (JSON.parse(raw) as StoredToken) : null;
    } catch {
      return null;
    }
  },
  async set(v) {
    try {
      localStorage.setItem(WEB_TOKEN_KEY, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  async clear() {
    try {
      localStorage.removeItem(WEB_TOKEN_KEY);
    } catch {
      // nichts zu tun: ohne Speicher gab es auch kein gespeichertes Token
    }
  },
};

/** Host-Schluesselbund > eigene Electron-Bruecke > localStorage. */
function pickVault(host?: DeviceLibraryTokenVault): DeviceLibraryTokenVault {
  if (host) return host;
  const b = (globalThis as { lightPlannerSecrets?: SecretBridge }).lightPlannerSecrets;
  if (b) {
    return {
      get: () => b.getDeviceLibraryToken(),
      set: (v) => b.setDeviceLibraryToken(v),
      clear: async () => { await b.clearDeviceLibraryToken(); },
    };
  }
  return webVault;
}

let vault: DeviceLibraryTokenVault = webVault;
/** Das Token lebt nur in diesem Modul — nicht im State, den DevTools anzeigen. */
let token: string | null = null;
let uploadTimer: ReturnType<typeof setTimeout> | null = null;
/** Waehrend eines Laufs angefragt: danach noch einmal (sonst ginge die Aenderung verloren). */
let rerun: { only?: Fixture[] } | null = null;

const lies = <T>(key: string, parse: (raw: unknown) => T | null, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return (raw && parse(JSON.parse(raw))) || fallback;
  } catch {
    return fallback;
  }
};

/** `false` heisst: gilt nur bis zum Neuladen (B-36 — gemeldet, nicht verschluckt). */
const schreib = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/** Liest die Ablage frisch und legt `cache` auf seinen Platz — die Plaetze
 *  der anderen Server bleiben, wie sie sind. */
const schreibCache = (cache: LibraryCache): boolean =>
  schreib(CACHE_KEY, withCache(lies(CACHE_KEY, readCacheAblage, leereAblage()), cache));

const readServer = (): string => {
  try {
    return localStorage.getItem(SERVER_KEY) || DEFAULT_DEVICE_LIBRARY_URL;
  } catch {
    return DEFAULT_DEVICE_LIBRARY_URL;
  }
};

const readAuto = (): boolean => {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off';
  } catch {
    return true;
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
  /** `false`: Bestand oder Upload-Protokoll konnten nicht gespeichert werden. */
  cacheSaved: boolean;
  syncing: boolean;
  lastSync: SyncOutcome | null;
  syncError: LibraryErrorKind | null;

  autoUpload: boolean;
  /** Die eigenen Profile des offenen Projekts — der Planer meldet sie hierher. */
  localFixtures: Fixture[];
  uploads: UploadLog;
  uploading: boolean;
  uploadError: LibraryErrorKind | null;

  init: (hostVault?: DeviceLibraryTokenVault) => Promise<void>;
  setServer: (url: string) => Promise<void>;
  signIn: (login: string, password: string) => Promise<SignInResult>;
  verify: (challenge: string, code: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  syncNow: (full?: boolean) => Promise<void>;
  setAutoUpload: (on: boolean) => void;
  setLocalFixtures: (fixtures: Fixture[]) => void;
  /** Hochladen, was sich geaendert hat — oder genau diese Profile, auch unveraendert. */
  uploadNow: (only?: Fixture[]) => Promise<void>;
  /** Erst hoch, dann runter. */
  syncAll: (full?: boolean) => Promise<void>;
}

let initialised = false;

export const useDeviceLibrary = create<DeviceLibraryState>((set, get) => {
  const forgetSession = async () => {
    token = null;
    if (uploadTimer) clearTimeout(uploadTimer);
    await vault.clear();
    set({ session: 'signed-out', user: null, tokenVolatile: false });
  };

  const handleError = async (e: unknown): Promise<LibraryErrorKind> => {
    const code = errorKind(e);
    if (code === 'not-signed-in' || code === 'wrong-credentials') await forgetSession();
    return code;
  };

  const afterSignIn = () => {
    void (get().autoUpload ? get().syncAll() : get().syncNow());
  };

  const accept = async (r: SignInResult): Promise<SignInResult> => {
    if (r.kind !== 'ok') return r;
    token = r.token;
    const persisted = await vault.set({ server: get().server, token: r.token });
    set({ session: 'signed-in', user: r.user, tokenVolatile: !persisted });
    afterSignIn();
    return r;
  };

  const server = readServer();
  return {
    server,
    session: 'unknown',
    user: null,
    tokenVolatile: false,
    cache: cacheFor(lies(CACHE_KEY, readCacheAblage, leereAblage()), server),
    cacheSaved: true,
    syncing: false,
    lastSync: null,
    syncError: null,
    autoUpload: readAuto(),
    localFixtures: [],
    uploads: lies(UPLOADS_KEY, (raw) => readUploadLog(raw, server), emptyUploadLog(server)),
    uploading: false,
    uploadError: null,

    init: async (hostVault) => {
      if (initialised) return;
      initialised = true;
      vault = pickVault(hostVault);
      const stored = await vault.get();
      // Ein Token eines anderen Servers ist hier keins.
      if (!stored || stored.server !== get().server) {
        if (stored) await vault.clear();
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
        afterSignIn();
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
      // Der Bestand des alten Servers bleibt auf seinem Platz; wer
      // zurueckwechselt, hat ihn wieder. Der neue Server bringt seinen
      // eigenen mit, sofern er schon einmal abgeglichen wurde.
      const cache = cacheFor(lies(CACHE_KEY, readCacheAblage, leereAblage()), url);
      const uploads = emptyUploadLog(url);
      set({
        server: url, cache, uploads, lastSync: null, syncError: null, uploadError: null,
        cacheSaved: schreib(UPLOADS_KEY, uploads),
      });
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
        // Ob der Server noch derselbe ist (kleinerer `latestSeq`), entscheidet
        // `syncFrom` — dieselbe Regel in jedem Planner. Scheitert irgendetwas,
        // bleibt der Bestand unberuehrt: geschrieben wird erst unten.
        const res = await syncFrom(server, token, PLANNER, after);
        // Adresse waehrend des Laufs gewechselt: die Antwort gehoert nicht mehr hierher.
        if (get().server !== server) return;
        const out = applySyncResult(get().cache, res, after, new Date());
        set({ cache: out.cache, cacheSaved: schreibCache(out.cache), lastSync: out });
      } catch (e) {
        set({ syncError: await handleError(e) });
      } finally {
        set({ syncing: false });
      }
    },

    setAutoUpload: (on) => {
      try {
        if (on) localStorage.removeItem(AUTO_KEY);
        else localStorage.setItem(AUTO_KEY, 'off');
      } catch {
        // gilt dann bis zum Neuladen
      }
      set({ autoUpload: on });
      if (on && get().session === 'signed-in') void get().uploadNow();
    },

    setLocalFixtures: (fixtures) => {
      set({ localFixtures: fixtures });
      if (!get().autoUpload || get().session !== 'signed-in') return;
      if (uploadTimer) clearTimeout(uploadTimer);
      uploadTimer = setTimeout(() => {
        uploadTimer = null;
        void get().uploadNow();
      }, UPLOAD_DEBOUNCE_MS);
    },

    uploadNow: async (only) => {
      if (!token) return;
      if (get().uploading) {
        rerun = { only: only && rerun?.only ? [...rerun.only, ...only] : only };
        return;
      }
      const { server, uploads, localFixtures } = get();
      const plan = planUpload(only ?? localFixtures, uploads, !!only);
      if (plan.items.length === 0 && plan.needsSource.every((id) => uploads.items[id]?.state === 'needs-source')) return;
      set({ uploading: true, uploadError: null });
      try {
        const results = plan.items.length ? await uploadRemote(server, token, PLANNER, plan.items) : [];
        if (get().server !== server) return;
        const next = applyUploadResults(get().uploads, plan, results, new Date());
        set({ uploads: next, cacheSaved: schreib(UPLOADS_KEY, next) });
      } catch (e) {
        set({ uploadError: await handleError(e) });
      } finally {
        set({ uploading: false });
        if (rerun) {
          const r = rerun;
          rerun = null;
          void get().uploadNow(r.only);
        }
      }
    },

    syncAll: async (full = false) => {
      await get().uploadNow();
      await get().syncNow(full);
    },
  };
});
