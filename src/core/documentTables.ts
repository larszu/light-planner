// ───────────────────────────────────────────────────────────────────────────
// Die drei gedruckten Listen als reine Funktionen (ADR-004, Initiative 4).
//
// WARUM SIE HIER STEHEN UND NICHT IM DIALOG. Ein Stempel behauptet „dieses
// Blatt weicht vom festgeschriebenen Stand ab". Diese Behauptung ist nur so
// viel wert wie der Vergleich dahinter: es muss DASSELBE Dokument sein, einmal
// aus den aktuellen Leuchten und einmal aus denen des Schnappschusses. Solange
// die Zeilen im Dialog zusammengebaut werden, gibt es die zweite Seite des
// Vergleichs gar nicht — man koennte sie nur nachbauen, und ein Nachbau driftet
// still von seinem Vorbild weg.
//
// Der zweite Grund ist der Waechter: `scripts/stamp-check.ts` laeuft unter
// node ohne JSX-Uebersetzung. Was in einer `.tsx` steht, kann er nicht
// anfassen — also stuende die Regel im Test und der Code daneben.
//
// SPALTEN SIND TEIL DES DOKUMENTS. Wer hier eine Spalte ergaenzt, aendert jeden
// Fingerabdruck. Das ist richtig so (das Blatt sieht anders aus), aber es
// bedeutet auch: bereits gedruckte Blaetter melden sich danach einmalig als
// abweichend. Kein Grund, es zu lassen — ein Grund, es nicht nebenbei zu tun.
// ───────────────────────────────────────────────────────────────────────────
import type { PlacedFixture } from '../types';
import { fixtureCounts, colorCounts } from './patch';
import { gelLibrary } from './gelLibrary';
import { csvStampRow, type DocumentStamp, type StampCell } from './documentStamp';

export interface DocumentTable {
  header: string[];
  rows: StampCell[][];
}

/** Gel-Codes einer Leuchte, wie sie auf dem Blatt stehen (`L201+R132`). */
export const gelCodes = (ids?: string[]): string =>
  (ids ?? []).map((id) => gelLibrary.find((g) => g.id === id)?.code ?? '').filter(Boolean).join('+');

/**
 * Reihenfolge der Geraeteliste — Kanal, dann Position.
 *
 * Sie steht sichtbar auf dem Blatt und geht deshalb in den Fingerabdruck ein.
 * Ohne feste Sortierung haetten dieselben Leuchten je nach Einfuegereihenfolge
 * zwei Fingerabdruecke, und der Stempel meldete Abweichungen, die niemand
 * gemacht hat.
 */
export const scheduleOrder = (fixtures: PlacedFixture[]): PlacedFixture[] =>
  [...fixtures].sort((a, b) => (a.channel ?? 1e9) - (b.channel ?? 1e9) || a.y - b.y || a.x - b.x);

/** Instrument Schedule — eine Zeile je Leuchte. */
export const scheduleTable = (fixtures: PlacedFixture[]): DocumentTable => ({
  header: ['Unit', 'Kanal', 'Universe', 'Adresse', 'Typ', 'Hersteller', 'X (m)', 'Y (m)', 'Höhe (m)', 'Gel', 'Zweck', 'Fokussiert', 'Fokus-Notiz', 'W', 'kg'],
  rows: scheduleOrder(fixtures).map((f) => [
    f.unitNumber ?? '', f.channel ?? '', f.universe ?? '', f.dmxAddress ?? '',
    f.fixture.name, f.fixture.manufacturer, f.x, f.y, f.mountingHeight,
    gelCodes(f.gelFilterIds), f.purpose ?? '', f.focused ? 'ja' : '', f.focusNote ?? '',
    f.fixture.wattage, f.fixture.weight,
  ]),
});

/** Geraeteliste — eine Zeile je Typ, mit Stueckzahl. */
export const inventoryTable = (fixtures: PlacedFixture[]): DocumentTable => ({
  header: ['Anzahl', 'Hersteller', 'Typ', 'W/Stk', 'kg/Stk', 'W gesamt', 'kg gesamt'],
  rows: fixtureCounts(fixtures).map((c) => [
    c.count, c.manufacturer, c.name, c.watts, c.weight, c.count * c.watts, (c.count * c.weight).toFixed(1),
  ]),
});

/** Farbliste — eine Zeile je Folie, mit Stueckzahl. */
export const colorTable = (fixtures: PlacedFixture[]): DocumentTable => ({
  header: ['Anzahl', 'Marke', 'Code', 'Name', 'Typ'],
  rows: colorCounts(fixtures).map((c) => [c.count, c.brand, c.code, c.name, c.type]),
});

/**
 * Eine Tabelle als CSV, optional mit Stempel-Fusszeile.
 *
 * Ohne Stempel ist das Ergebnis zeichengleich mit der Fassung vor ADR-004 —
 * ein Waechter haelt das fest. Der Stempel ist optional, weil ein
 * Zwischenexport nach Excel keine Fussnote braucht; waere die Einfuehrung eine
 * stille Formataenderung, braeche sie jedes Import-Skript, das jemand darauf
 * gebaut hat.
 *
 * Trennzeichen ist das Semikolon (deutsches Excel), Zeilenende CRLF. Die
 * Byte-Order-Mark setzt erst der Download-Weg: sie gehoert zur Datei, nicht
 * zum Dokument.
 */
export const tableToCsv = (table: DocumentTable, stamp?: DocumentStamp): string => {
  const esc = (v: StampCell) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const zeilen: StampCell[][] = [table.header, ...table.rows];
  if (stamp) zeilen.push(csvStampRow(stamp, table.header.length));
  return zeilen.map((r) => r.map(esc).join(';')).join('\r\n');
};
