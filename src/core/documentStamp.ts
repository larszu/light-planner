// ───────────────────────────────────────────────────────────────────────────
// Ein Ausdruck sagt seinen Stand (ADR-004, Roadmap-Initiative 4).
//
// DAS PROBLEM. Zwei Blätter derselben Geräteliste, eine Woche auseinander
// gedruckt, sehen identisch aus. Auf der Baustelle entscheidet dann, wer das
// jüngere Blatt in der Hand hält — und niemand kann es einem Blatt ansehen.
//
// Papier ist dabei ausdrücklich NICHT das Problem. Die Rollen-Recherche ist an
// der Stelle eindeutig: Papier wird behalten, weil es ohne Akku funktioniert
// und sich nicht unter der Hand ändert. Wer den Zettel wegnimmt, nimmt genau
// die Eigenschaft weg, wegen der er da ist. Der Fehler ist, dass er unsichtbar
// veraltet.
//
// WARUM KEIN KRYPTO-HASH. Der Stempel schützt vor Verwechslung, nicht vor
// Fälschung. Acht Hex-Zeichen (FNV-1a, 32 Bit) kann ein Mensch am Telefon
// vorlesen und mit dem Bildschirm vergleichen — der Rückweg vom Papier
// funktioniert damit ohne Scanner, ohne App und ohne Netz, also unter genau
// den Bedingungen, unter denen Papier überhaupt gewählt wurde. Ein SHA-256
// wären 64 Zeichen, die niemand vorliest.
//
// GLEICHE ABLEITUNG WIE IM CABLE-PLANNER. Dieselben Trennzeichen, dieselbe
// Hash-Funktion, dasselbe Zeilenformat (dort `src/renderer/lib/documentStamp.ts`).
// Zwei Apps, die verschiedene Stände desselben Projekts verschieden benennen,
// wären schlimmer als gar kein Stempel.
// ───────────────────────────────────────────────────────────────────────────

export interface DocumentStamp {
  /** Projektname, wie er im Plan steht. */
  project: string;
  /** Label eines festgeschriebenen Standes, sonst nicht gesetzt. */
  revision?: string;
  /**
   * Der Plan weicht vom festgeschriebenen Stand ab. Ohne Revision IMMER
   * `false`: keine Behauptung ohne Bezugspunkt — eine erfundene Abweichung ist
   * derselbe Schaden wie ein erfundener Zustand.
   */
  drifted: boolean;
  /** Zeitpunkt der Erzeugung (ISO). */
  printedAt: string;
  /** 8 Hex-Zeichen über den Inhalt — der eigentliche Vergleichswert. */
  fingerprint: string;
}

/** FNV-1a, 32 Bit, als 8 Hex-Zeichen. */
export const fingerprint = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    // FNV-Prime 16777619, in 32-Bit-Arithmetik ohne BigInt.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/**
 * Trenner zwischen Zellen und Zeilen.
 *
 * Unit-/Record-Separator und kein Semikolon: Zellen enthalten Semikolons,
 * Kommas und Zeilenumbrüche. Ein Trenner, der im Inhalt vorkommen kann, macht
 * zwei verschiedene Dokumente gleich — genau das, was ein Fingerabdruck nicht
 * darf.
 */
const SEP = '\u001F';
const ROW_SEP = '\u001E';

export type StampCell = string | number | null | undefined;

const joinRows = (headers: string[], rows: StampCell[][]): string =>
  [headers, ...rows]
    .map((row) => row.map((c) => (c === null || c === undefined ? '' : String(c))).join(SEP))
    .join(ROW_SEP);

/** Fingerabdruck über den Inhalt eines Zeilen-Dokuments (CSV-Listen). */
export const documentFingerprint = (headers: string[], rows: StampCell[][]): string =>
  fingerprint(joinRows(headers, rows));

/**
 * Der Stempel selbst.
 *
 * `atRevision` ist der Fingerabdruck DESSELBEN Dokuments zum festgeschriebenen
 * Stand. Fehlt er, gibt es nichts, wovon abgewichen werden könnte.
 */
export const buildStamp = (args: {
  project: string;
  revision?: string;
  current: string;
  atRevision?: string;
  now: Date;
}): DocumentStamp => ({
  project: args.project || '—',
  ...(args.revision ? { revision: args.revision } : {}),
  drifted: !!args.revision && !!args.atRevision && args.atRevision !== args.current,
  printedAt: args.now.toISOString(),
  fingerprint: args.current,
});

/**
 * Der uebliche Weg zum Stempel: Fingerabdruck jetzt, Fingerabdruck zum Stand.
 *
 * `buildStamp` laesst eine Revision ohne Vergleichswert zu — dann stuende
 * „Rev 3" auf einem Blatt, das seit Rev 3 zwoelf Aenderungen gesehen hat, und
 * der Stempel behauptete den Stand, statt ihn zu pruefen. Hier haengen Label
 * und Vergleichswert am selben Objekt: wer den Stand nennt, liefert ihn auch.
 *
 * Der Vergleichswert ist DERSELBE Fingerabdruck, aus dem festgeschriebenen
 * Schnappschuss gerechnet — nicht der zum Zeitpunkt des Festschreibens
 * gespeicherte. Sonst waere jede spaetere Aenderung an der Spaltenauswahl eine
 * flaechendeckende Abweichungs-Meldung fuer Dokumente, die sich nicht geaendert
 * haben.
 */
export const stampForStand = (args: {
  project: string;
  /** Fingerabdruck des Dokuments, so wie es gerade gedruckt wird. */
  current: string;
  /** Label des festgeschriebenen Standes und derselbe Fingerabdruck daraus. */
  committed?: { label: string; fingerprint: string };
  now: Date;
}): DocumentStamp =>
  buildStamp({
    project: args.project,
    revision: args.committed?.label,
    current: args.current,
    atRevision: args.committed?.fingerprint,
    now: args.now,
  });

/** Datum/Uhrzeit kurz und lesbar (lokal), für die Fußzeile. */
const fmtStampDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Eine Zeile für Fußzeilen und Titelblöcke.
 *
 * Der Revisions-Teil ist der Punkt: steht nur „Rev 2" auf dem Blatt, liest sich
 * das als *dieser Ausdruck ist Rev 2*. Weicht der Plan ab, sagt der Stempel das
 * hin — sonst behauptet das Papier einen Stand, den es nicht hat.
 */
export const stampLine = (stamp: DocumentStamp): string => {
  const parts = [stamp.project];
  if (stamp.revision) parts.push(stamp.drifted ? `${stamp.revision} + Änderungen` : stamp.revision);
  parts.push(fmtStampDate(stamp.printedAt));
  parts.push(`#${stamp.fingerprint}`);
  return parts.join('  ·  ');
};

/**
 * Fußzeile für ein CSV: eine Zeile *nach* den Daten, mit `#` beginnend.
 *
 * Bewusst nicht davor: eine Zeile vor der Kopfzeile verschiebt jede Auswertung,
 * die die erste Zeile als Header liest — Excel-Pivot, Import-Skript,
 * `pandas.read_csv`. Hinten steht sie da, wo eine Fußzeile hingehört.
 */
export const csvStampRow = (stamp: DocumentStamp, columns: number): StampCell[] => {
  const row: StampCell[] = [`# ${stampLine(stamp)}`];
  while (row.length < Math.max(1, columns)) row.push('');
  return row;
};

/**
 * Fingerabdruck über das, was auf dem PLAN-Ausdruck zu sehen ist.
 *
 * ADR-004 Regel 1 unterscheidet hier bewusst: für eine Liste zählt ihr Inhalt,
 * für den Plan-Ausdruck zählen auch Positionen — sie sind auf dem Blatt
 * sichtbar. Eine verschobene Leuchte macht ein anderes Blatt, eine geänderte
 * Fokus-Notiz nicht.
 */
export const planContentFingerprint = (input: {
  fixtures: {
    id: string;
    x: number;
    y: number;
    mountingHeight: number;
    aimX: number;
    aimY: number;
    bodyRotation: number;
    dimming: number;
    unitNumber?: string;
    channel?: number;
    fixture: { id: string; name: string };
  }[];
  // Beschriftungen zaehlen mit: sie stehen auf dem Blatt. Eine Traverse, die
  // aus „FOH" zu „FOH oben" wird, ist ein anderer Ausdruck, auch wenn sie an
  // derselben Stelle haengt.
  trusses?: { id: string; x1: number; y1: number; x2: number; y2: number; label?: string }[];
  walls?: { id: string; x1: number; y1: number; x2: number; y2: number; label?: string }[];
  persons?: { id: string; x: number; y: number; label?: string }[];
  // `rotation` und `depth` bestimmen den Grundriss des Podests; ohne sie waere
  // ein gedrehtes Podest vom ungedrehten nicht zu unterscheiden.
  stageElements?: {
    id: string; x: number; y: number; width: number; height: number;
    depth?: number; rotation?: number; label?: string;
  }[];
}): string => {
  // Nach `id` sortiert, je Gruppe. Die Reihenfolge im Array ist eine
  // Bearbeitungs-Reihenfolge, kein Bild: wer eine Leuchte loescht und wieder
  // anlegt, hat denselben Plan vor sich. Ohne Sortierung meldete der Stempel
  // genau dann eine Abweichung, wenn keine da ist -- und ein Hinweis, der
  // falsch anschlaegt, wird nach dem zweiten Mal ignoriert.
  const nachId = <T extends { id: string }>(xs: T[] | undefined): T[] =>
    [...(xs ?? [])].sort((a, b) => a.id.localeCompare(b.id));

  const zeilen: StampCell[][] = [
    ...nachId(input.fixtures).map((f) => [
      'f', f.id, f.fixture.id, f.fixture.name, f.x, f.y, f.mountingHeight,
      f.aimX, f.aimY, f.bodyRotation, f.dimming, f.unitNumber ?? '', f.channel ?? '',
    ]),
    ...nachId(input.trusses).map((t) => ['t', t.id, t.x1, t.y1, t.x2, t.y2, t.label ?? '']),
    ...nachId(input.walls).map((w) => ['w', w.id, w.x1, w.y1, w.x2, w.y2, w.label ?? '']),
    ...nachId(input.persons).map((p) => ['p', p.id, p.x, p.y, p.label ?? '']),
    ...nachId(input.stageElements).map((s) => [
      's', s.id, s.x, s.y, s.width, s.height, s.depth ?? '', s.rotation ?? '', s.label ?? '',
    ]),
  ];
  return documentFingerprint(['plan'], zeilen);
};
