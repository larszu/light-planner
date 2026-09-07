// ───────────────────────────────────────────────────────────────────────────
// Ein Feld, viele Blaetter (Bedarf 143, P4).
//
//   > Twelve report types must stay consistent by hand: Channel Hookup,
//   > Dimmer Schedule, Circuit List, DMX Addresses, Power Summary, Color
//   > Schedule, Gobo Schedule and an Infrastructure List in five variants —
//   > ALL SORTS AND GROUPINGS OF THE SAME FIELDS (Channel, Dimmer, Type,
//   > Color, Circuit, Location, Watt…).
//
// Belege: `jkarp7/showstack#48` (2025-12-29) und `#41`; die Bitte um frei
// gestaltbare Spalten steht in `#45`.
//
// ─── DER SATZ, DER DEN GANZEN BEDARF TRAEGT ────────────────────────────────
//
// „all sorts and groupings of the same fields". Zwoelf Blaetter sind nicht
// zwoelf Dokumente, sondern zwoelf SICHTEN. Wer sie als zwoelf Dokumente
// pflegt, pflegt zwoelfmal dieselbe Regel — und beim dreizehnten Mal weicht
// eine ab, weil jemand nur elf angefasst hat.
//
// Deshalb steht hier ein KATALOG und keine Tabelle: je Feld eine Beschriftung
// und genau ein Zugriff. Ein Blatt nennt Feld-Kennungen; es bringt keinen
// eigenen Zugriff mit. Wer den Gel-Code aendert, aendert ihn einmal, und alle
// Blaetter, die ihn fuehren, aendern sich mit.
//
// ─── WAS EIN FELD NICHT DARF ───────────────────────────────────────────────
//
// Raten. `circuit` gibt es nur, wo `circuitBreakdown` die Leuchte wirklich
// einem Kreis zugeteilt hat — eine Leuchte ohne Leistungsangabe liegt in
// keinem, und dann steht hier NICHT_ERFASST und keine erfundene Nummer.
// Dasselbe fuer die Traverse: `nearestTrussId` schnappt nur innerhalb eines
// Meters, und wo es nicht schnappt, steht kein Traversenname.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture, Truss } from '../types';
import { footprint, nearestTrussId } from './patch';
import { gelCodes } from './documentTables';
import { universeReading, type DmxProtocol, DEFAULT_PROTOCOL } from './universeIdentity';
import {
  PHASE_LABEL, circuitByFixture, circuitLabel, distributionFor,
  type CircuitAssignment, type PhaseTemplate, DEFAULT_TEMPLATE,
} from './powerDistribution';

/**
 * Was auf dem Blatt steht, wo es keinen Wert gibt.
 *
 * EIN Zeichen fuer „nichts eingetragen", ueberall dasselbe. Eine leere Zelle
 * liesse offen, ob dort nichts ist oder ob niemand nachgesehen hat — und wer
 * ein Blatt abarbeitet, muss die beiden unterscheiden koennen.
 */
export const NOT_SET = '–';

export type FieldId =
  | 'unit' | 'channel' | 'universe' | 'address' | 'dmx' | 'footprint'
  | 'type' | 'manufacturer' | 'purpose' | 'gel'
  | 'position' | 'height' | 'truss'
  | 'circuit' | 'phase' | 'watt' | 'weight'
  | 'focused' | 'focusNote';

/** Was ein Feld zum Rechnen braucht und nicht an der Leuchte findet. */
export interface FieldContext {
  trusses: readonly Truss[];
  protocol: DmxProtocol;
  template: PhaseTemplate;
  /** Von der Leuchte zu ihrem Kreis — aus der Zuteilung, nicht daneben gerechnet. */
  circuits: Map<string, CircuitAssignment>;
}

/**
 * Der Zusammenhang fuer einen Bestand.
 *
 * EINMAL je Blatt gebaut und nicht je Zeile: `distributionFor` teilt den
 * ganzen Bestand in Kreise auf, und wer das je Zeile taete, bekaeme bei
 * n Leuchten n Verteilungen — dieselbe Antwort, n-mal gerechnet.
 */
export const fieldContext = (
  fixtures: readonly PlacedFixture[],
  trusses: readonly Truss[] = [],
  protocol: DmxProtocol = DEFAULT_PROTOCOL,
  template: PhaseTemplate = DEFAULT_TEMPLATE,
): FieldContext => ({
  trusses,
  protocol,
  template,
  circuits: circuitByFixture(distributionFor(fixtures, template)),
});

export interface FieldSpec {
  /** Die Spaltenueberschrift, deutsch (Quell-Sprache). */
  label: string;
  /** Der eine Zugriff. Gibt `null` zurueck, wo es nichts gibt. */
  value: (f: PlacedFixture, ctx: FieldContext) => string | number | null;
  /** Numerisch sortierbar? Sonst wird die Zeichenkette verglichen. */
  numeric?: boolean;
}

export const FIELDS: Readonly<Record<FieldId, FieldSpec>> = {
  unit: { label: 'Unit', value: (f) => f.unitNumber?.trim() || null },
  channel: { label: 'Kanal', value: (f) => f.channel ?? null, numeric: true },
  universe: { label: 'Universe', value: (f) => f.universe ?? null, numeric: true },
  address: { label: 'Adresse', value: (f) => f.dmxAddress ?? null, numeric: true },
  // Die Adresse SO, wie sie am Geraet steht (Bedarf 147): in Art-Net also
  // „0:0:2.15" und nicht „2.15".
  dmx: {
    label: 'DMX',
    value: (f, c) => (f.universe != null && f.dmxAddress != null
      ? `${universeReading(f.universe, c.protocol).primary}.${f.dmxAddress}`
      : null),
  },
  footprint: { label: 'Kanäle', value: (f) => footprint(f) || null, numeric: true },
  type: { label: 'Typ', value: (f) => f.fixture.name },
  manufacturer: { label: 'Hersteller', value: (f) => f.fixture.manufacturer },
  purpose: { label: 'Zweck', value: (f) => f.purpose?.trim() || null },
  gel: { label: 'Gel', value: (f) => gelCodes(f.gelFilterIds) || null },
  position: { label: 'Position (x,y)', value: (f) => `${f.x},${f.y}` },
  height: { label: 'Höhe (m)', value: (f) => f.mountingHeight, numeric: true },
  // Nur wo die Leuchte wirklich an einer Traverse haengt: `nearestTrussId`
  // schnappt innerhalb eines Meters, und darueber hinaus waere der
  // Traversenname geraten.
  truss: {
    label: 'Traverse',
    value: (f, c) => {
      const id = nearestTrussId(f, [...c.trusses]);
      if (!id) return null;
      const t = c.trusses.find((x) => x.id === id);
      return t?.label || t?.id || null;
    },
  },
  // Punkt-Kreis-Schreibweise „3-2" (Bedarf 141) — die einzige Bezeichnung,
  // die jemand am Steckfeld wiederfindet.
  circuit: { label: 'Kreis', value: (f, c) => { const a = c.circuits.get(f.id); return a ? circuitLabel(a) : null; } },
  phase: { label: 'Phase', value: (f, c) => { const a = c.circuits.get(f.id); return a ? PHASE_LABEL[a.phase] : null; } },
  watt: { label: 'W', value: (f) => f.fixture.wattage || null, numeric: true },
  weight: { label: 'kg', value: (f) => f.fixture.weight || null, numeric: true },
  focused: { label: 'Fokussiert', value: (f) => (f.focused ? 'ja' : null) },
  focusNote: { label: 'Fokus-Notiz', value: (f) => f.focusNote?.trim() || null },
};

export const ALL_FIELDS = Object.keys(FIELDS) as FieldId[];

/** Der Wert einer Zelle, so wie er auf dem Blatt steht. */
export const cell = (
  id: FieldId,
  f: PlacedFixture,
  ctx: FieldContext,
): string | number => FIELDS[id].value(f, ctx) ?? NOT_SET;
