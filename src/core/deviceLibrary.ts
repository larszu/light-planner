// ───────────────────────────────────────────────────────────────────────────
// Die Geraetebibliothek (devices.zumpelars.de) aus Sicht des Lichtplaners.
//
// Der Transport steht in `deviceLibraryClient.ts` — eine unveraenderte Kopie
// aus larszu/av-device-library. Hier steht, was nur dieser Planer weiss: wie
// aus einem Bibliothekseintrag ein Leuchtenprofil wird und zurueck, und wie
// ein Abgleich den lokalen Bestand fortschreibt. Rein: kein fetch, kein
// Speicher — das haelt `npm run library:check` ohne Netz pruefbar.
//
// ─── DAS FACET-FORMAT `planners.light` ─────────────────────────────────────
//
// Das Facet IST das native Leuchtenprofil dieses Planers: ein `Fixture` aus
// `src/types.ts`, so wie der Leuchten-Editor es speichert — Photometrie,
// Streuwinkel, Optik, Farbe, `dmxModes` (mit `origin`/`evidence`) und
// `specSource` (die Datenblatt-Belege je Feld). Kein Uebersetzungsformat:
// ein zweites Schema waere eine zweite Stelle, an der ein Feld verloren geht,
// und genau das ist `specSource` schon einmal passiert.
//
// Drei Festlegungen:
//   1. `id` geht NICHT mit. Der Server entfernt es ohnehin (private Felder),
//      und eine lokale Id wie `custom-1727…` bedeutet auf einem fremden
//      Rechner nichts. Beim Import bekommt das Profil `devlib:<slug>` — stabil
//      ueber alle Versionen, damit eine gesetzte Leuchte ihren Typ behaelt.
//   2. Hersteller und Name kommen beim Import aus dem Kern (`manufacturer`,
//      `model`): den kuratiert die Moderation, und er ist fuer alle Planer
//      derselbe. Leistung und Gewicht kommen aus dem Facet und nur, wo es sie
//      nicht nennt, aus `powerWatts`/`weightKg` des Kerns.
//   3. Der Datenblatt-Link steht am Profil (`datasheetUrl`) und geht als
//      `core.sourceUrl` hoch; beim Import faellt ein Profil ohne eigenen Link
//      auf `core.sourceUrl` zurueck.
//   4. Hochladen und Import benutzen DIESELBEN Funktionen
//      (`fixtureToProposal`/`fixtureToUploadItem`, `deviceToFixture`); der
//      Rundlauf ist geprueft.
// ───────────────────────────────────────────────────────────────────────────
import type { Fixture } from '../types';
import type { LibraryPlanner, ProposalCore, SyncDevice, SyncResponse, UploadItem, UploadResult, UploadState } from './deviceLibraryClient';
import { validateFixtureProfile } from './fixtureProfile';

export const PLANNER: LibraryPlanner = 'light';

/** Kategorie im gemeinsamen Kern. Die feine Einteilung steht im Facet (`category`). */
export const CORE_CATEGORY = 'Lighting';

/** Prefix der Ids importierter Profile — daran erkennt der Planer „schreibgeschuetzt". */
export const LIBRARY_ID_PREFIX = 'devlib:';

export type LightFacet = Omit<Fixture, 'id'>;

export const isLibraryFixture = (f: Pick<Fixture, 'id'>): boolean => f.id.startsWith(LIBRARY_ID_PREFIX);

/** Ein Link, den die Bibliothek als Beleg annimmt (dieselbe Regel wie `isLink` dort). */
export const isDatasheetLink = (s: string): boolean => /^https?:\/\/\S+\.\S+$/i.test(s.trim());

/** Eigenes Profil -> Vorschlag. `sourceUrl` ist Pflicht: ohne Beleg nimmt die Bibliothek nichts an. */
export function fixtureToProposal(f: Fixture, sourceUrl: string): { core: ProposalCore; facet: LightFacet } {
  const { id: _id, ...facet } = f;
  return {
    core: {
      manufacturer: f.manufacturer.trim(),
      model: f.name.trim(),
      category: CORE_CATEGORY,
      sourceUrl: sourceUrl.trim(),
      ...(f.wattage > 0 ? { powerWatts: f.wattage } : {}),
      ...(f.weight > 0 ? { weightKg: f.weight } : {}),
    },
    facet: JSON.parse(JSON.stringify(facet)) as LightFacet,
  };
}

/** Bibliothekseintrag -> gepruefte Leuchte, oder die Gruende, warum nicht. */
export function deviceToFixture(d: SyncDevice): { ok: true; fixture: Fixture } | { ok: false; problems: string[] } {
  if (!d.facet) return { ok: false, problems: ['no light-planner facet'] };
  const facet = d.facet as Record<string, unknown>;
  const candidate: Record<string, unknown> = {
    ...facet,
    id: `${LIBRARY_ID_PREFIX}${d.slug}`,
    manufacturer: d.core.manufacturer || facet.manufacturer,
    name: d.core.model || facet.name,
    wattage: facet.wattage ?? d.core.powerWatts,
    weight: facet.weight ?? d.core.weightKg,
  };
  const link = facet.datasheetUrl ?? d.core.sourceUrl;
  if (link) candidate.datasheetUrl = link;
  return validateFixtureProfile(candidate);
}

export interface LibraryEntry {
  slug: string;
  version: number;
  seq: number;
  status: SyncDevice['status'];
  confirmations: number;
  sourceUrl?: string;
  fixture: Fixture;
}

export interface InvalidEntry {
  slug: string;
  version: number;
  label: string;
  problems: string[];
}

/**
 * Der lokale Bestand. Er gehoert zu EINEM Server: wechselt die Adresse,
 * beginnt er leer (`emptyCache`) — Eintraege zweier Bibliotheken mit
 * derselben Folgenummer zu mischen hiesse, beim naechsten Abgleich die
 * Haelfte zu ueberspringen.
 */
export interface LibraryCache {
  format: 'light-planner-device-library-cache';
  version: 1;
  server: string;
  latestSeq: number;
  syncedAt: string | null;
  entries: LibraryEntry[];
  invalid: InvalidEntry[];
}

export const emptyCache = (server: string): LibraryCache => ({
  format: 'light-planner-device-library-cache',
  version: 1,
  server,
  latestSeq: 0,
  syncedAt: null,
  entries: [],
  invalid: [],
});

/** Gelesener Cache — `null`, wenn er nicht zu diesem Server gehoert oder kaputt ist. */
export function readCache(raw: unknown, server: string): LibraryCache | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<LibraryCache>;
  if (c.format !== 'light-planner-device-library-cache' || c.version !== 1 || c.server !== server) return null;
  if (!Array.isArray(c.entries) || !Array.isArray(c.invalid) || typeof c.latestSeq !== 'number') return null;
  // Auch der eigene Cache wird geprueft: er liegt im localStorage, und den
  // kann eine aeltere Fassung dieses Planers geschrieben haben.
  const entries = c.entries.filter((e) => e && typeof e.slug === 'string' && validateFixtureProfile(e.fixture).ok);
  return { ...(c as LibraryCache), entries };
}

export interface SyncOutcome {
  cache: LibraryCache;
  added: number;
  updated: number;
  removed: number;
  invalid: number;
}

/**
 * Schreibt einen Abgleich fort. `after === 0` ist ein Vollabgleich: dann
 * beginnt der Bestand leer, damit nichts ueberlebt, was der Server nicht mehr
 * nennt.
 */
export function applySync(cache: LibraryCache, res: SyncResponse, after: number, now: Date): SyncOutcome {
  if (res.planner !== PLANNER) throw new Error(`sync answered for planner "${res.planner}"`);
  const base = after === 0 ? emptyCache(cache.server) : cache;
  const entries = new Map(base.entries.map((e) => [e.slug, e]));
  const invalid = new Map(base.invalid.map((e) => [e.slug, e]));
  let added = 0;
  let updated = 0;
  let removed = 0;

  for (const d of [...res.devices].sort((a, b) => a.seq - b.seq)) {
    if (d.removed) {
      if (entries.delete(d.slug)) removed++;
      invalid.delete(d.slug);
      continue;
    }
    const r = deviceToFixture(d);
    if (!r.ok) {
      // Die alte gueltige Fassung faellt mit weg: sie gaebe sich sonst als
      // aktueller Stand aus, und der Status daneben gehoerte zur neuen.
      if (entries.delete(d.slug)) removed++;
      invalid.set(d.slug, {
        slug: d.slug,
        version: d.version,
        label: `${d.core.manufacturer} ${d.core.model}`.trim(),
        problems: r.problems,
      });
      continue;
    }
    invalid.delete(d.slug);
    if (entries.has(d.slug)) updated++;
    else added++;
    entries.set(d.slug, {
      slug: d.slug,
      version: d.version,
      seq: d.seq,
      status: d.status,
      confirmations: d.confirmations,
      ...(d.core.sourceUrl ? { sourceUrl: d.core.sourceUrl } : {}),
      fixture: r.fixture,
    });
  }

  const byName = (a: { fixture: Fixture }, b: { fixture: Fixture }) =>
    `${a.fixture.manufacturer} ${a.fixture.name}`.localeCompare(`${b.fixture.manufacturer} ${b.fixture.name}`);
  return {
    cache: {
      ...base,
      latestSeq: Math.max(base.latestSeq, res.latestSeq),
      syncedAt: now.toISOString(),
      entries: [...entries.values()].sort(byName),
      invalid: [...invalid.values()].sort((a, b) => a.label.localeCompare(b.label)),
    },
    added,
    updated,
    removed,
    invalid: invalid.size,
  };
}

// ─── Die Server-Adresse ────────────────────────────────────────────────────

export type ServerUrlCheck = { ok: true; url: string } | { ok: false; reason: 'invalid' | 'insecure' };

/** https Pflicht; http nur fuer einen Server auf diesem Rechner (Entwicklung). */
export function normalizeServerUrl(input: string): ServerUrlCheck {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    return { ok: false, reason: u.protocol === 'http:' ? 'insecure' : 'invalid' };
  }
  if (u.search || u.hash || u.username || u.password) return { ok: false, reason: 'invalid' };
  return { ok: true, url: `${u.origin}${u.pathname}`.replace(/\/+$/, '') };
}

/**
 * Laesst die Content-Security-Policy eine Verbindung zu `url` zu?
 *
 * WARUM DER PLANER DAS SELBST FRAGT. Die Richtlinie steht als <meta> in
 * `index.html` und nennt nur die Werks-Bibliothek. Eine andere Adresse
 * blockiert der Browser, und `fetch` meldet dann dasselbe wie „kein Netz" —
 * wer eine eigene Bibliothek eintraegt, suchte den Fehler am falschen Ende.
 * Also wird die Adresse beim Eintragen gegen die WIRKLICH geladene Richtlinie
 * gehalten, nicht gegen eine Liste, die neben ihr auseinanderlaufen kann.
 */
export function connectSrcAllows(csp: string, url: string, selfOrigin: string): boolean {
  const directive = csp.split(';').map((s) => s.trim().split(/\s+/)).find((d) => d[0] === 'connect-src')
    ?? csp.split(';').map((s) => s.trim().split(/\s+/)).find((d) => d[0] === 'default-src');
  if (!directive) return true;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  return directive.slice(1).some((src) => {
    if (src === '*') return true;
    if (src === "'self'") return target.origin === selfOrigin;
    if (/^[a-z][a-z0-9+.-]*:$/i.test(src)) return target.protocol === src.toLowerCase();
    const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^:/]+)(?::(\d+|\*))?/i.exec(src);
    if (!m) return false;
    const [, scheme, wildcard, host, port] = m;
    if (scheme && `${scheme.toLowerCase()}:` !== target.protocol) return false;
    const hostOk = wildcard ? target.hostname.endsWith(`.${host}`) : target.hostname === host.toLowerCase();
    const defaultPort = target.protocol === 'https:' ? '443' : '80';
    const portOk = port === '*' || (port ?? defaultPort) === (target.port || defaultPort);
    return hostOk && portOk;
  });
}

// ─── Hochladen eigener Profile ─────────────────────────────────────────────
//
// Jedes eigene Profil wird mit einem Fingerabdruck seines Upload-Inhalts
// gemerkt. Hochgeladen wird nur, was sich seit dem letzten Mal geaendert hat
// — oder was beim letzten Mal an einem Fehler scheiterte, der nicht am Profil
// lag. Ein `blocked` mit unveraendertem Inhalt wird NICHT wiederholt: die
// Bibliothek wuerde es wieder ablehnen, und jeder Start kostete eine Anfrage.

/** Zustand je Profil: der des Servers, oder was lokal noch fehlt. */
export type LocalUploadState = UploadState | 'needs-source';

export interface UploadRecord {
  hash: string;
  state: LocalUploadState;
  /** Stand in der Moderation, wie der Server ihn meldet — auch bei `in-sync`. */
  moderation?: 'pending' | 'approved';
  slug?: string;
  at: string;
  error?: string;
  findings?: string[];
}

/** Wie der Bestand gehoert auch das Upload-Protokoll zu genau einem Server. */
export interface UploadLog {
  format: 'light-planner-device-library-uploads';
  version: 1;
  server: string;
  items: Record<string, UploadRecord>;
}

export const emptyUploadLog = (server: string): UploadLog => ({
  format: 'light-planner-device-library-uploads',
  version: 1,
  server,
  items: {},
});

export function readUploadLog(raw: unknown, server: string): UploadLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Partial<UploadLog>;
  if (l.format !== 'light-planner-device-library-uploads' || l.version !== 1 || l.server !== server) return null;
  return l.items && typeof l.items === 'object' ? (l as UploadLog) : null;
}

/** `null`: ohne gueltigen Datenblatt-Link nimmt die Bibliothek das Profil nicht an. */
export function fixtureToUploadItem(f: Fixture): UploadItem | null {
  if (!f.datasheetUrl || !isDatasheetLink(f.datasheetUrl)) return null;
  const { core, facet } = fixtureToProposal(f, f.datasheetUrl);
  return { localId: f.id, core, facet: facet as unknown as Record<string, unknown> };
}

const stabil = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stabil).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${stabil((v as Record<string, unknown>)[k])}`).join(',')}}`
      : JSON.stringify(v);

/** FNV-1a ueber die schluesselsortierte Form — gleiche Daten, gleicher Abdruck, egal in welcher Feldreihenfolge. */
export function uploadHash(item: Pick<UploadItem, 'core' | 'facet'>): string {
  let h = 0x811c9dc5;
  const s = stabil({ core: item.core, facet: item.facet });
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Zustaende, nach denen ein unveraendertes Profil nicht erneut hochgeht. */
const ERLEDIGT: ReadonlySet<LocalUploadState> = new Set(['created', 'edit-proposed', 'pending-updated', 'approved', 'in-sync', 'blocked']);

export interface UploadPlan {
  items: UploadItem[];
  /** Eigene Profile ohne Datenblatt-Link — gehen nicht hoch, werden aber gemeldet. */
  needsSource: string[];
}

export function planUpload(fixtures: Fixture[], log: UploadLog, force = false): UploadPlan {
  const items: UploadItem[] = [];
  const needsSource: string[] = [];
  for (const f of fixtures) {
    if (isLibraryFixture(f)) continue;
    const item = fixtureToUploadItem(f);
    if (!item) {
      needsSource.push(f.id);
      continue;
    }
    const prev = log.items[f.id];
    // Unveraendert, aber noch in der Moderation: mitschicken — der Server
    // antwortet `in-sync` und sagt dabei, ob es inzwischen freigegeben ist.
    // Anders erfuehre der Planer nie, dass aus „wartet" „live" geworden ist.
    const wartet = prev?.moderation === 'pending';
    if (!force && !wartet && prev && prev.hash === uploadHash(item) && ERLEDIGT.has(prev.state)) continue;
    items.push(item);
  }
  return { items, needsSource };
}

const befundText = (f: unknown): string[] | undefined => {
  if (!Array.isArray(f)) return f === undefined ? undefined : [JSON.stringify(f)];
  return f.map((x) => (x && typeof x === 'object' && 'kind' in x ? String((x as { kind: unknown }).kind)
    : x && typeof x === 'object' && 'message' in x ? String((x as { message: unknown }).message) : JSON.stringify(x)));
};

export function applyUploadResults(
  log: UploadLog,
  plan: UploadPlan,
  results: UploadResult[],
  now: Date,
): UploadLog {
  const items = { ...log.items };
  const at = now.toISOString();
  for (const id of plan.needsSource) items[id] = { hash: '', state: 'needs-source', at };
  const byId = new Map(results.map((r) => [r.localId, r]));
  for (const item of plan.items) {
    const r = byId.get(item.localId);
    items[item.localId] = r
      ? {
          hash: uploadHash(item),
          state: r.state,
          at,
          ...(r.slug ? { slug: r.slug } : items[item.localId]?.slug ? { slug: items[item.localId].slug } : {}),
          ...(r.moderation ? { moderation: r.moderation } : {}),
          ...(r.error ? { error: r.error } : {}),
          ...(r.findings !== undefined ? { findings: befundText(r.findings) } : {}),
        }
      : { hash: uploadHash(item), state: 'error', at, error: 'no-result' };
  }
  return { ...log, items };
}

/** Wie ein Profil gerade dasteht — inklusive „seit dem letzten Hochladen geaendert". */
export type DisplayUploadState = LocalUploadState | 'changed' | 'new' | 'awaiting';

export function uploadStatus(f: Fixture, log: UploadLog): DisplayUploadState {
  const item = fixtureToUploadItem(f);
  if (!item) return 'needs-source';
  const prev = log.items[f.id];
  if (!prev || prev.state === 'needs-source') return 'new';
  if (prev.hash !== uploadHash(item)) return 'changed';
  // Der Moderationsstand geht vor dem Upload-Ergebnis: ein `in-sync` kann
  // „wartet noch" oder „ist live" heissen, und nur das zweite sieht jemand.
  if (prev.state !== 'blocked' && prev.state !== 'error') {
    if (prev.moderation === 'approved') return 'approved';
    if (prev.moderation === 'pending') return 'awaiting';
  }
  return prev.state;
}
