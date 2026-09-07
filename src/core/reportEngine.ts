// ───────────────────────────────────────────────────────────────────────────
// Zwoelf Blaetter, ein Modell (Bedarf 143, P4).
//
//   > Twelve report types must stay consistent by hand: Channel Hookup,
//   > Dimmer Schedule, Circuit List, DMX Addresses, Power Summary, Color
//   > Schedule, Gobo Schedule and an Infrastructure List in five variants —
//   > all sorts and groupings of the same fields.
//
// Beleg: `jkarp7/showstack#48` (2025-12-29), dazu `#41` und `#45`.
//
// ─── EIN BLATT IST EINE BESCHREIBUNG, KEIN CODE ────────────────────────────
//
// Ein Bericht nennt: welche Felder, in welcher Reihenfolge sortiert, wonach
// gruppiert. Mehr nicht. Er bringt keinen eigenen Zugriff mit — der steht im
// Katalog (`reportFields.ts`) — und keine eigene Sortierung.
//
// Das ist die Engstelle: wer eine Spalte aendert, aendert sie einmal, und
// alle Blaetter, die sie fuehren, aendern sich mit. Zwoelf handgepflegte
// Tabellen haetten zwoelf Stellen, und beim naechsten Mal fasst jemand elf an.
//
// ─── SORTIEREN IST TEIL DES DOKUMENTS ──────────────────────────────────────
//
// Dieselben Leuchten muessen zweimal dasselbe Blatt ergeben, sonst meldet der
// Stand-Stempel (ADR-004) Abweichungen, die niemand gemacht hat. Die
// Sortierung ist deshalb VOLLSTAENDIG: nach den genannten Feldern, und wo die
// gleich sind, nach der Leuchten-Kennung. Zwei Leuchten koennen in jedem
// sichtbaren Feld uebereinstimmen; ihre Kennung ist der letzte Unterschied.
//
// ─── WAS NICHT GEHT, WIRD BENANNT ──────────────────────────────────────────
//
// Von den zwoelf Blaettern des Belegs sind nicht alle aus diesem Modell
// schreibbar: es gibt kein Gobo-Feld. `reportGaps` sagt das — BERECHNET aus
// dem Katalog und nicht aufgezaehlt. Eine Aufzaehlung waere der Kenntnisstand
// ihres Autors, und das naechste fehlende Feld fiele niemandem auf.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture } from '../types';
import type { StampCell } from './documentStamp';
import {
  ALL_FIELDS, FIELDS, NOT_SET, cell, type FieldContext, type FieldId,
} from './reportFields';

export interface ReportDef {
  id: string;
  /** Der Name auf dem Blatt, deutsch (Quell-Sprache). */
  label: string;
  /** Wozu es dient — steht in der Auswahl, damit niemand raten muss. */
  purpose: string;
  columns: FieldId[];
  /** Wonach sortiert wird, in dieser Reihenfolge. */
  sort: FieldId[];
  /** Wonach gruppiert wird, oder nichts. */
  groupBy?: FieldId;
}

export interface ReportGroup {
  /** Der Wert, nach dem gruppiert wurde — oder `NOT_SET`. */
  key: string;
  rows: StampCell[][];
}

export interface RenderedReport {
  def: ReportDef;
  header: string[];
  /** Alle Zeilen, in Sortierreihenfolge — auch bei Gruppierung. */
  rows: StampCell[][];
  /** Eine Gruppe je Wert; ohne `groupBy` genau eine mit leerem `key`. */
  groups: ReportGroup[];
}

/**
 * Sortier-Schluessel einer Leuchte fuer ein Feld.
 *
 * Ein leerer Wert sortiert ans ENDE und nicht an den Anfang: was fehlt, ist
 * das, was noch zu tun ist, und es gehoert dorthin, wo man es findet — nicht
 * ueber die erste Zeile des Blattes verteilt.
 */
const sortKey = (id: FieldId, f: PlacedFixture, ctx: FieldContext): [number, number | string] => {
  const v = FIELDS[id].value(f, ctx);
  if (v === null) return [1, FIELDS[id].numeric ? Number.POSITIVE_INFINITY : '￿'];
  return [0, v];
};

const compare = (
  a: PlacedFixture,
  b: PlacedFixture,
  fields: readonly FieldId[],
  ctx: FieldContext,
): number => {
  for (const id of fields) {
    const [fehltA, va] = sortKey(id, a, ctx);
    const [fehltB, vb] = sortKey(id, b, ctx);
    if (fehltA !== fehltB) return fehltA - fehltB;
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return va - vb;
    } else {
      const c = String(va).localeCompare(String(vb), 'de');
      if (c !== 0) return c;
    }
  }
  // Der letzte Unterschied. Ohne ihn haetten zwei in allen sichtbaren Feldern
  // gleiche Leuchten keine feste Reihenfolge, und dasselbe Blatt zwei
  // Fingerabdruecke.
  return a.id.localeCompare(b.id);
};

export function renderReport(
  def: ReportDef,
  fixtures: readonly PlacedFixture[],
  ctx: FieldContext,
): RenderedReport {
  const sortiert = [...fixtures].sort((a, b) => compare(a, b, def.sort, ctx));
  const zeile = (f: PlacedFixture): StampCell[] => def.columns.map((id) => cell(id, f, ctx));
  const rows = sortiert.map(zeile);

  let groups: ReportGroup[];
  if (!def.groupBy) {
    groups = [{ key: '', rows }];
  } else {
    const gid = def.groupBy;
    // Reihenfolge der Gruppen = Reihenfolge ihres ersten Auftretens in der
    // sortierten Liste. Eine eigene Gruppen-Sortierung waere eine zweite
    // Ordnung neben der genannten, und die beiden koennten sich widersprechen.
    const m = new Map<string, StampCell[][]>();
    for (const f of sortiert) {
      const k = String(FIELDS[gid].value(f, ctx) ?? NOT_SET);
      const arr = m.get(k) ?? [];
      arr.push(zeile(f));
      m.set(k, arr);
    }
    groups = [...m].map(([key, r]) => ({ key, rows: r }));
  }

  return { def, header: def.columns.map((id) => FIELDS[id].label), rows, groups };
}

/**
 * Die Blaetter aus dem Beleg, als Beschreibungen.
 *
 * Jeder Eintrag nennt den Namen aus der Quelle. Wer eines vermisst, sieht in
 * `reportGaps` nach — dort steht, WARUM es fehlt.
 */
export const REPORTS: readonly ReportDef[] = [
  {
    id: 'hookup',
    label: 'Channel Hookup',
    purpose: 'Kanal für Kanal: was hängt wo, mit welcher Farbe und welchem Zweck.',
    columns: ['channel', 'unit', 'type', 'truss', 'position', 'purpose', 'gel', 'dmx'],
    sort: ['channel'],
  },
  {
    id: 'dimmer',
    label: 'Dimmer- / Kreis-Plan',
    purpose: 'Nach Steckplatz sortiert — die Reihenfolge, in der jemand am Steckfeld arbeitet.',
    columns: ['circuit', 'phase', 'channel', 'unit', 'type', 'watt'],
    sort: ['circuit', 'channel'],
    groupBy: 'circuit',
  },
  {
    id: 'dmx',
    label: 'DMX-Adressen',
    purpose: 'Nach Universe und Adresse — für den Patch am Pult und die Kontrolle am Node.',
    columns: ['universe', 'address', 'footprint', 'channel', 'type', 'dmx'],
    sort: ['universe', 'address'],
    groupBy: 'universe',
  },
  {
    id: 'color',
    label: 'Farb-Plan',
    purpose: 'Nach Folie gruppiert — was zu schneiden ist und wohin es kommt.',
    columns: ['gel', 'channel', 'unit', 'type', 'truss', 'purpose'],
    sort: ['gel', 'channel'],
    groupBy: 'gel',
  },
  {
    id: 'positions',
    label: 'Positions-Liste',
    purpose: 'Nach Traverse gruppiert — die Liste, mit der aufgebaut wird.',
    columns: ['truss', 'unit', 'channel', 'type', 'position', 'height', 'weight'],
    sort: ['truss', 'unit'],
    groupBy: 'truss',
  },
  {
    id: 'focus',
    label: 'Fokus-Liste',
    purpose: 'Was noch einzurichten ist — Unfokussiertes steht oben.',
    columns: ['channel', 'unit', 'type', 'purpose', 'focused', 'focusNote'],
    sort: ['focused', 'channel'],
  },
];

/**
 * Blatt-Arten aus dem Beleg, die dieses Modell (noch) nicht schreiben kann.
 *
 * BERECHNET, nicht aufgezaehlt: der Eintrag nennt das Feld, das fehlt, und
 * die Pruefung ist, ob es im Katalog vorkommt. Wer das Feld nachtraegt,
 * bekommt das Blatt automatisch — und muss diese Liste nicht pflegen.
 */
export interface ReportGap {
  /** Der Name aus der Quelle. */
  label: string;
  /** Die Feld-Kennung, die es dafuer braeuchte. */
  needs: string;
  message: string;
}

const GEFORDERT: readonly { label: string; needs: string }[] = [
  { label: 'Channel Hookup', needs: 'channel' },
  { label: 'Dimmer- / Kreis-Plan', needs: 'circuit' },
  { label: 'DMX-Adressen', needs: 'address' },
  { label: 'Farb-Plan', needs: 'gel' },
  { label: 'Positions-Liste', needs: 'truss' },
  { label: 'Gobo-Plan', needs: 'gobo' },
  { label: 'Leistungs-Übersicht', needs: 'watt' },
];

export function reportGaps(): ReportGap[] {
  const vorhanden = new Set<string>(ALL_FIELDS);
  return GEFORDERT
    .filter((g) => !vorhanden.has(g.needs))
    .map((g) => ({
      ...g,
      message: `„${g.label}" braucht ein Feld „${g.needs}" — das Modell führt es nicht. `
        + 'Das Blatt entsteht, sobald das Feld da ist; erfunden wird es nicht.',
    }));
}

export const findReport = (id: string): ReportDef | undefined => REPORTS.find((r) => r.id === id);

/**
 * Ein Bericht als flache Tabelle fuer den CSV-Weg.
 *
 * Bei Gruppierung geht die Gruppen-Ueberschrift als eigene Zeile mit: eine
 * CSV ohne sie waere eine ANDERE Ansicht als die auf dem Bildschirm, und
 * genau das Auseinanderlaufen von Bildschirm und Ausdruck ist der Bedarf.
 */
export function reportTable(r: RenderedReport): { header: string[]; rows: StampCell[][] } {
  if (!r.def.groupBy) return { header: r.header, rows: r.rows };
  const rows: StampCell[][] = [];
  for (const g of r.groups) {
    rows.push([`${FIELDS[r.def.groupBy].label}: ${g.key}`, ...Array(r.header.length - 1).fill('')]);
    rows.push(...g.rows);
  }
  return { header: r.header, rows };
}
