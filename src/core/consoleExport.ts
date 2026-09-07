// ───────────────────────────────────────────────────────────────────────────
// Den Patch ans Pult schicken statt abtippen (Bedarf 146, P4).
//
//   > 'Professional lighting electricians must manually transfer fixture and
//   > patch data between [tool] and their consoles — a time-consuming,
//   > error-prone process.' Where a file route exists it is brittle: EOS FILE
//   > IMPORT WANTS TAB-SEPARATED .txt WITH WINDOWS LINE ENDINGS and imports
//   > ONLY ROWS WHOSE DEVICE TYPE [matches the console's library].
//
// Belege: `jkarp7/showstack#51` (2025-12-29) und die showstack-Datei
// `lightwright.yaml`, die ETCs „Importing Lightwright Data Into Eos Family
// Consoles" zitiert.
//
// ─── DIE EMPFEHLUNG DER QUELLE IST EIN SATZ ÜBER WARNUNGEN ─────────────────
//
//   > Warn explicitly about the device-type filter and the line-ending
//   > requirement RATHER THAN LETTING THE USER DISCOVER IT AT LOAD-IN.
//
// Deshalb ist der Kern dieses Moduls nicht der Schreiber, sondern
// `exportPreflight`: es sagt VOR dem Speichern, welche Zeilen die Datei gar
// nicht erst enthält und warum. Eine Datei, die stillschweigend die Hälfte
// verliert, ist schlimmer als keine — am Pult sieht man ihr nicht an, dass
// sie unvollständig ist, und gesucht wird dann beim Gerät.
//
// ─── WAS WIR NICHT WISSEN KÖNNEN, BEHAUPTEN WIR NICHT ──────────────────────
//
// Eos nimmt nur Zeilen an, deren Device Type in SEINER Bibliothek steht.
// Welche das ist, weiß dieser Rechner nicht. Also verspricht dieses Modul
// nicht, dass eine Zeile ankommt: es zählt, wie viele Zeilen davon abhängen,
// und sagt es. Das ist etwas anderes als „geht schon".
//
// ─── AUF PAPIER EIN STRICH, IN EINER MASCHINEN-DATEI NICHTS ────────────────
//
// Der Feld-Katalog (Bedarf 143) schreibt „–", wo nichts eingetragen ist:
// auf einem Blatt muss man „nichts da" von „nicht nachgesehen" unterscheiden
// können. In einer Datei, die ein Pult einliest, wäre derselbe Strich eine
// Lüge — dort steht ein leeres Feld, oder die Zeile geht gar nicht erst mit.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture } from '../types';
import { FIELDS, type FieldContext, type FieldId } from './reportFields';

export type ConsoleTarget = 'eos-lightwright' | 'csv';

export interface ConsoleFormat {
  id: ConsoleTarget;
  label: string;
  /** Dateiendung OHNE Punkt. */
  extension: string;
  /** Trennzeichen zwischen den Feldern. */
  separator: string;
  /** Zeilenende. */
  newline: string;
  /** Spalten aus dem Feld-Katalog (Bedarf 143) — kein zweiter Zugriff. */
  columns: FieldId[];
  /**
   * Die Kopfzeile, so wie das Ziel sie erwartet.
   *
   * NICHT die Beschriftungen aus dem Katalog: die sind deutsch und fürs
   * Blatt. Ein Pult liest englische Spaltennamen, und zwar genau die.
   */
  header: string[];
  /** Warum genau so — mit Beleg, damit niemand daran „aufräumt". */
  note: string;
}

/** CRLF, ausgeschrieben: `\r\n` in einer Zeichenkette übersieht man beim Lesen. */
const CRLF = '\r\n';
const TAB = '\t';

export const FORMATS: Readonly<Record<ConsoleTarget, ConsoleFormat>> = {
  'eos-lightwright': {
    id: 'eos-lightwright',
    label: 'ETC Eos (Lightwright-Import, .txt)',
    extension: 'txt',
    separator: TAB,
    newline: CRLF,
    columns: ['channel', 'type', 'purpose', 'truss', 'unit', 'universe', 'address'],
    header: ['Channel', 'Type', 'Purpose', 'Position', 'Unit Number', 'Universe', 'Address'],
    note: 'Tabulator-getrennt, Windows-Zeilenenden (CRLF), Endung .txt — so und '
      + 'nicht anders nimmt Eos die Datei an. Und: Eos übernimmt NUR Zeilen, deren '
      + 'Device Type in seiner Bibliothek steht. Welche das ist, weiß dieser Rechner nicht.',
  },
  csv: {
    id: 'csv',
    label: 'CSV (kleinster gemeinsamer Nenner)',
    extension: 'csv',
    separator: ',',
    newline: CRLF,
    columns: ['channel', 'type', 'purpose', 'truss', 'unit', 'universe', 'address', 'watt'],
    header: ['Channel', 'Type', 'Purpose', 'Position', 'Unit Number', 'Universe', 'Address', 'Watts'],
    note: 'Komma-getrennt und CRLF — nicht das Semikolon der deutschen Excel-Ausgaben: '
      + 'diese Datei liest eine Maschine, kein Tabellenblatt.',
  },
};

export const TARGETS = Object.keys(FORMATS) as ConsoleTarget[];

/**
 * Warum eine Zeile nicht mitgeht.
 *
 * Benannt, nie stillschweigend. Genau das Stillschweigen ist der Fehler aus
 * dem Beleg: die Datei kommt am Pult an, und was fehlt, faellt erst auf,
 * wenn ein Geraet nicht anzieht.
 */
export type DropReason = 'no-channel' | 'no-address' | 'no-type';

export const DROP_LABEL: Readonly<Record<DropReason, string>> = {
  'no-channel': 'ohne Kanalnummer – das Pult spricht Geräte über den Kanal an',
  'no-address': 'ohne DMX-Adresse – es gibt nichts zu patchen',
  'no-type': 'ohne Gerätetyp – Eos verwirft solche Zeilen beim Import, ohne es zu sagen',
};

export interface DroppedRow {
  id: string;
  reason: DropReason;
}

export interface ExportPreflight {
  target: ConsoleTarget;
  /** Zeilen, die die Datei enthaelt. */
  written: number;
  /** Zeilen, die sie NICHT enthaelt, mit Grund. */
  dropped: DroppedRow[];
  /**
   * Wie viele der geschriebenen Zeilen davon abhaengen, dass das Pult den
   * Geraetetyp kennt.
   *
   * KEINE Behauptung, dass sie ankommen — eine Zahl darueber, wie viel dieser
   * Rechner nicht wissen kann. Bei einem Ziel ohne Typ-Filter ist sie 0.
   */
  unverifiable: number;
  /** Was der Nutzer VOR dem Speichern lesen soll. */
  note: string;
}

/** Ziele, die Zeilen nach dem Geraetetyp verwerfen. */
const FILTERT_NACH_TYP: ReadonlySet<ConsoleTarget> = new Set<ConsoleTarget>(['eos-lightwright']);

/**
 * Was mit dieser Zeile passiert — die eine Entscheidung.
 *
 * Sie steht hier und nicht im Schreiber: sonst gaebe es zwei Regeln darueber,
 * was in die Datei kommt, und die Warnung koennte sich vom Ergebnis
 * unterscheiden. Genau das waere der Fehler aus dem Beleg noch einmal.
 */
export function dropReason(f: PlacedFixture): DropReason | null {
  if (f.channel == null) return 'no-channel';
  if (f.universe == null || f.dmxAddress == null) return 'no-address';
  if (!f.fixture.name?.trim()) return 'no-type';
  return null;
}

export function exportPreflight(
  fixtures: readonly PlacedFixture[],
  target: ConsoleTarget,
): ExportPreflight {
  const dropped: DroppedRow[] = [];
  let written = 0;
  for (const f of fixtures) {
    const r = dropReason(f);
    if (r) dropped.push({ id: f.id, reason: r });
    else written += 1;
  }
  const unverifiable = FILTERT_NACH_TYP.has(target) ? written : 0;
  return {
    target,
    written,
    dropped,
    unverifiable,
    note: FORMATS[target].note,
  };
}

/**
 * Eine Zelle fuer die Maschine.
 *
 * Auf Papier steht ein Strich, wo nichts eingetragen ist (Bedarf 143). Hier
 * steht NICHTS: derselbe Strich waere in einer Datei, die ein Pult einliest,
 * eine Luege — und in einer Zahlenspalte schlicht unlesbar.
 *
 * Trennzeichen und Zeilenumbrueche im Wert werden ERSETZT und nicht
 * gequotet: Eos liest die Lightwright-Datei feldweise ueber den Tabulator,
 * ein Anfuehrungszeichen ist ihm kein Schutzzeichen. Ein Zweck mit
 * Tabulator darin verschoebe alle folgenden Spalten dieser Zeile.
 */
export const machineCell = (
  id: FieldId,
  f: PlacedFixture,
  ctx: FieldContext,
  fmt: ConsoleFormat,
): string => {
  const v = FIELDS[id].value(f, ctx);
  if (v === null) return '';
  return String(v).split(fmt.separator).join(' ').replace(/[\r\n]+/g, ' ');
};

/**
 * Die Datei — und nur die Zeilen, die `exportPreflight` angekuendigt hat.
 *
 * Dieselbe Entscheidung (`dropReason`) fuer beide: was gewarnt wurde, ist
 * auch das, was fehlt.
 */
export function buildConsoleFile(
  fixtures: readonly PlacedFixture[],
  target: ConsoleTarget,
  ctx: FieldContext,
): string {
  const fmt = FORMATS[target];
  const zeilen = [fmt.header.join(fmt.separator)];
  for (const f of [...fixtures].sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0) || a.id.localeCompare(b.id))) {
    if (dropReason(f)) continue;
    zeilen.push(fmt.columns.map((id) => machineCell(id, f, ctx, fmt)).join(fmt.separator));
  }
  // Abschliessendes Zeilenende: eine Datei ohne es verliert bei manchen
  // Einlesern die letzte Zeile — und das waere wieder ein stiller Verlust.
  return zeilen.join(fmt.newline) + fmt.newline;
}

export const consoleFileName = (projectName: string, target: ConsoleTarget): string =>
  `${(projectName || 'lichtplan').replace(/[^\w.-]+/g, '_')}-patch.${FORMATS[target].extension}`;
