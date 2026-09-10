// ── DMX patch, channel numbering & electrical-load helpers ────────────
//
// Mirrors the "Spotlight Numbering" + "Generate Paperwork" workflow of
// professional plots: number the rig in reading order, assign DMX addresses
// respecting each fixture's footprint, and total up the electrical load.

import type { DmxMode, Fixture, PlacedFixture, Truss } from '../types';
import { gelLibrary } from './gelLibrary';

/** Kanäle je DMX-Universe. Mehr passt nicht hinein — das ist keine Konvention,
 *  sondern die Größe des Datenpakets. */
export const UNIVERSE_SIZE = 512;

// ── Betriebsmodi ────────────────────────────────────────────────────────────
//
// BEFUND (gemessen 2026-09-10). `footprint()` las bis hierher EINE Zahl je
// Gerätetyp — `fixture.dmxChannels`. Ein Moving Head hat aber je Betriebsart
// einen anderen Fußabdruck; der Robin MegaPointe steht im Katalog mit 30
// Kanälen, was für höchstens einen seiner Modi stimmt. Wer am Pult einen
// anderen fährt, bekommt eine Adressliste, in der ab dem ZWEITEN Gerät jede
// Adresse um die Differenz der beiden Modi daneben liegt.
//
// Diese drei Funktionen sind die ganze Umstellung. Alles Weitere in dieser
// Datei rechnet unverändert weiter — nur eben mit der Zahl des Modus, den das
// Gerät wirklich fährt.

/**
 * Die Modi eines Gerätetyps, so wie sie zu lesen sind.
 *
 * Sind keine erklärt, gilt die alte Angabe `dmxChannels` als EIN Modus — und
 * zwar als `estimated`, mit Beleg. Das ist die ehrliche Lesart: über die
 * Herkunft dieser Zahl steht in den 47 Katalogeinträgen nichts, und eine Zahl
 * ohne Quelle ist von einer abgelesenen nicht zu unterscheiden. Sie hier
 * stillschweigend als gemessen durchzureichen wäre der bequeme Weg und genau
 * die Defektform, gegen die `specSource` und `Task #111` stehen.
 *
 * Ein `dmxChannels: 0` (konventionelle Leuchte am Dimmer) ergibt KEINEN Modus:
 * das Gerät hat keinen Fußabdruck, es hat gar keine DMX-Ansteuerung.
 */
export function modesOf(f: Fixture): DmxMode[] {
  if (f.dmxModes && f.dmxModes.length > 0) return f.dmxModes;
  if (f.dmxChannels && f.dmxChannels > 0) {
    return [{
      id: LEGACY_MODE_ID,
      name: 'Unspecified',
      channels: f.dmxChannels,
      origin: 'estimated',
      evidence: 'Fixture.dmxChannels — Herkunft nicht festgehalten (Stand 2026-09-10)',
    }];
  }
  return [];
}

/** Id des aus `dmxChannels` erzeugten Ersatz-Modus. */
export const LEGACY_MODE_ID = 'legacy-dmxChannels';

/** Der gefahrene Modus, oder `undefined`, wenn keiner feststeht. */
export function modeOf(f: PlacedFixture): DmxMode | undefined {
  const modes = modesOf(f.fixture);
  if (modes.length === 0) return undefined;
  // Genau ein Modus: der ist es. Ohne diese Zeile müsste jede der 47
  // Katalog-Leuchten erst von Hand „ihren" einzigen Modus zugewiesen
  // bekommen, bevor irgendetwas patchbar wäre.
  if (modes.length === 1) return modes[0];
  return modes.find((m) => m.id === f.dmxModeId);
}

/**
 * Der Fußabdruck, wenn er BEKANNT ist — sonst `null`.
 *
 * Drei Zustände, und das ist der Kern:
 *   `0`     konventionelle Leuchte am Dimmer. Kein DMX, mit Absicht.
 *   `n > 0` so viele Kanäle im gefahrenen Modus.
 *   `null`  das Gerät hat mehrere Modi und es steht keiner fest.
 *
 * `null` zu `0` zu machen wäre die teure Vereinfachung: `autoPatch` überspringt
 * beides, aber `rigCheck` verlangt für eine 0 keine Adresse — die Leuchte
 * stünde also unpatchbar und unbeanstandet im Plan, und am Pult fehlt sie.
 */
export function footprintOrNull(f: PlacedFixture): number | null {
  const modes = modesOf(f.fixture);
  if (modes.length === 0) return 0;
  const m = modeOf(f);
  return m ? Math.max(1, Math.round(m.channels)) : null;
}

/** `true`, wenn das Gerät Modi hat, aber keiner feststeht. */
export const modeMissing = (f: PlacedFixture): boolean => footprintOrNull(f) === null;

// DMX footprint of a fixture; 0 / undefined means a conventional unit that
// lives on a dimmer (gets a channel number but no DMX address).
//
// ACHTUNG: Diese Funktion beantwortet „unbekannt" mit 0 und ist damit für
// jede ANZEIGE die falsche — dort gehört `footprintOrNull()` hin, sonst
// steht an einer Leuchte ohne gewählten Modus „Dimmer". Zum RECHNEN ist sie
// richtig: wer keinen Modus hat, belegt auch keine Kanäle.
export function footprint(f: PlacedFixture): number {
  return footprintOrNull(f) ?? 0;
}

// Reading order: top-to-bottom in ~1 m rows, then left-to-right.
function readingOrder(fixtures: PlacedFixture[]): PlacedFixture[] {
  return [...fixtures].sort((a, b) => {
    const ra = Math.round(a.y), rb = Math.round(b.y);
    if (ra !== rb) return ra - rb;
    return a.x - b.x;
  });
}

export interface PatchOptions {
  startUniverse: number;
  startAddress: number;
  number: boolean;   // (re)assign channel + unit numbers
  patch: boolean;    // (re)assign DMX universe/address
}

// Returns a new fixtures array with channel/unit numbers and DMX addresses.
export function autoPatch(fixtures: PlacedFixture[], opts: PatchOptions): PlacedFixture[] {
  const ordered = readingOrder(fixtures);
  const patchById = new Map<string, Partial<PlacedFixture>>();

  let universe = Math.max(1, opts.startUniverse);
  let address = Math.min(Math.max(1, opts.startAddress), UNIVERSE_SIZE);

  ordered.forEach((f, i) => {
    const patch: Partial<PlacedFixture> = {};
    if (opts.number) {
      patch.channel = i + 1;
      patch.unitNumber = String(i + 1);
    }
    if (opts.patch) {
      const fp = footprint(f);
      if (fp > UNIVERSE_SIZE) {
        // BEFUND (Defektformen-Sweep, Form `fixture-erreicht-grenze-nicht`,
        // gemessen 2026-09-08): hier wurde eine Adresse vergeben, die es
        // nicht geben kann. Ein Profil mit mehr als 512 Kanälen bekam
        // `universe = n, address = 1` — und belegte damit rechnerisch 513…fp
        // eines Universes, das an dieser Stelle aufhört. Kein Fehler, keine
        // Warnung: der Patch-Zettel sah aus wie jeder andere.
        //
        // Solche Profile gibt es (große Pixel-Matrizen, LED-Wände als ein
        // Gerät). Was der Planer NICHT kann, ist sie automatisch auf mehrere
        // Universes aufteilen — das ist eine Entscheidung über die Verkabelung,
        // keine Rechnung. Also wird nichts vergeben, und `rigCheck` meldet die
        // Leuchte als ungepatcht mit eigener Begründung.
        patch.universe = undefined;
        patch.dmxAddress = undefined;
      } else if (fp > 0) {
        if (address + fp - 1 > UNIVERSE_SIZE) { universe += 1; address = 1; }
        patch.universe = universe;
        patch.dmxAddress = address;
        address += fp;
      } else {
        patch.universe = undefined;
        patch.dmxAddress = undefined;
      }
    }
    patchById.set(f.id, patch);
  });

  return fixtures.map((f) => ({ ...f, ...patchById.get(f.id) }));
}

// Ids of fixtures whose DMX address ranges overlap another in the same universe.
export function findPatchConflicts(fixtures: PlacedFixture[]): Set<string> {
  const conflicts = new Set<string>();
  const withAddr = fixtures.filter((f) => f.universe != null && f.dmxAddress != null);
  for (let i = 0; i < withAddr.length; i++) {
    for (let j = i + 1; j < withAddr.length; j++) {
      const a = withAddr[i], b = withAddr[j];
      if (a.universe !== b.universe) continue;
      const aEnd = a.dmxAddress! + Math.max(1, footprint(a)) - 1;
      const bEnd = b.dmxAddress! + Math.max(1, footprint(b)) - 1;
      if (a.dmxAddress! <= bEnd && b.dmxAddress! <= aEnd) {
        conflicts.add(a.id); conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}

export interface PowerSummary {
  totalWatts: number;
  amps1ph: number;        // total current on a single 230 V phase
  ampsPerPhase: number;   // balanced over 3 phases (line-to-neutral 230 V)
  circuits16A: number;    // 16 A / 230 V circuits needed (at 100 % load)
}

const MAINS_VOLTAGE = 230;

// Worst-case electrical load (every fixture at full). Useful to avoid tripping
// breakers when speccing the power distro.
export function computePower(fixtures: PlacedFixture[]): PowerSummary {
  const totalWatts = fixtures.reduce((sum, f) => sum + (f.fixture.wattage || 0), 0);
  const amps1ph = totalWatts / MAINS_VOLTAGE;
  return {
    totalWatts,
    amps1ph,
    ampsPerPhase: totalWatts / (3 * MAINS_VOLTAGE),
    circuits16A: Math.ceil(amps1ph / 16),
  };
}

// Group fixtures by type for an equipment count (inventory).
export interface FixtureCount {
  name: string;
  manufacturer: string;
  count: number;
  watts: number;     // per unit
  weight: number;    // per unit
}

export function fixtureCounts(fixtures: PlacedFixture[]): FixtureCount[] {
  const map = new Map<string, FixtureCount>();
  for (const f of fixtures) {
    const key = `${f.fixture.manufacturer}|${f.fixture.name}`;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, {
      name: f.fixture.name,
      manufacturer: f.fixture.manufacturer,
      count: 1,
      watts: f.fixture.wattage || 0,
      weight: f.fixture.weight || 0,
    });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ── Colour cut list (gel consumption) ────────────────────────────────────────
// Counts every gel "cut" across the rig (a fixture with two gels = two cuts),
// the Lightwright "Color Count" paperwork used for ordering and prep.
export interface ColorCount {
  id: string;
  code: string;
  brand: string;
  name: string;
  type: string;
  count: number;
}

export function colorCounts(fixtures: PlacedFixture[]): ColorCount[] {
  const map = new Map<string, ColorCount>();
  for (const f of fixtures) for (const gid of f.gelFilterIds ?? []) {
    const ex = map.get(gid);
    if (ex) { ex.count += 1; continue; }
    const g = gelLibrary.find((x) => x.id === gid);
    if (!g) continue;
    map.set(gid, { id: g.id, code: g.code, brand: g.brand, name: g.name, type: g.type, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

// ── Rigging: load per truss ──────────────────────────────────────────────────
// Conservative default safe-working-load for a truss when none is set. Real
// trusses vary widely (a 3 m span of 30 cm box truss is good for far more);
// this is a deliberately cautious default so the warning errs on the safe side.
export const DEFAULT_TRUSS_CAPACITY = 150; // kg

// Shortest distance from point (px,py) to segment (ax,ay)-(bx,by).
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// The truss a fixture is hung on (nearest segment within `snap` m), or null
// for floor stands / booms. Used for load totals and focus-session grouping.
export function nearestTrussId(f: PlacedFixture, trusses: Truss[], snap = 1.0): string | null {
  let bestId: string | null = null, bestD = Infinity;
  for (const t of trusses) {
    const d = distToSegment(f.x, f.y, t.x1, t.y1, t.x2, t.y2);
    if (d < bestD) { bestD = d; bestId = t.id; }
  }
  return bestId && bestD <= snap ? bestId : null;
}

export interface TrussLoad {
  id: string;
  label: string;
  fixtureCount: number;
  weightKg: number;     // sum of fixtures hung on this truss
  capacityKg: number;
  utilization: number;  // weightKg / capacityKg
  overloaded: boolean;
}

// Assign each fixture to the nearest truss within `snap` metres (it is hung on
// it) and total the load. Fixtures not near any truss (floor stands, booms) are
// reported separately.
export function trussLoads(
  fixtures: PlacedFixture[], trusses: Truss[], snap = 1.0,
): { perTruss: TrussLoad[]; unassigned: { count: number; weightKg: number } } {
  const totals = new Map<string, { count: number; weight: number }>();
  trusses.forEach((t) => totals.set(t.id, { count: 0, weight: 0 }));
  let unCount = 0, unWeight = 0;

  for (const f of fixtures) {
    let bestId: string | null = null, bestD = Infinity;
    for (const t of trusses) {
      const d = distToSegment(f.x, f.y, t.x1, t.y1, t.x2, t.y2);
      if (d < bestD) { bestD = d; bestId = t.id; }
    }
    const w = f.fixture.weight || 0;
    if (bestId && bestD <= snap) {
      const acc = totals.get(bestId)!; acc.count += 1; acc.weight += w;
    } else { unCount += 1; unWeight += w; }
  }

  const perTruss = trusses.map((t) => {
    const acc = totals.get(t.id)!;
    const cap = t.capacity && t.capacity > 0 ? t.capacity : DEFAULT_TRUSS_CAPACITY;
    return {
      id: t.id, label: t.label || 'Traverse', fixtureCount: acc.count, weightKg: acc.weight,
      capacityKg: cap, utilization: cap > 0 ? acc.weight / cap : 0, overloaded: acc.weight > cap,
    };
  });
  return { perTruss, unassigned: { count: unCount, weightKg: unWeight } };
}

// ── Power: distribution into circuits ────────────────────────────────────────
// A 16 A / 230 V circuit carries 3680 W; plan to ~80 % (3000 W) for headroom.
export const CIRCUIT_WATTS = 3000;

export interface Circuit {
  index: number;
  watts: number;
  fixtureCount: number;
  utilization: number; // watts / CIRCUIT_WATTS
  /**
   * BEDARF 143 — WELCHE Leuchten in diesem Kreis liegen.
   *
   * Bis 2026-09-07 stand hier nur die Anzahl. Damit liess sich die Kreis-Zahl
   * aufs Blatt schreiben, aber nicht die Frage beantworten, die jeder auf der
   * Buehne stellt: „an welchem Kreis haengt DIESE Leuchte?" Wer sie ohne
   * diese Liste beantworten wollte, musste die Fuellregel unten ein zweites
   * Mal nachbauen — und ein Nachbau driftet von seinem Vorbild weg, still.
   */
  fixtureIds: string[];
}

// Greedy first-fit in reading/patch order: keep filling a circuit until the
// next fixture would exceed the budget, then start a new one.
export function circuitBreakdown(fixtures: PlacedFixture[], budget = CIRCUIT_WATTS): Circuit[] {
  const ordered = readingOrder(fixtures).filter((f) => (f.fixture.wattage || 0) > 0);
  const circuits: Circuit[] = [];
  let cur: Circuit | null = null;
  for (const f of ordered) {
    const w = f.fixture.wattage || 0;
    if (!cur || cur.watts + w > budget) {
      cur = { index: circuits.length + 1, watts: 0, fixtureCount: 0, utilization: 0, fixtureIds: [] };
      circuits.push(cur);
    }
    cur.watts += w; cur.fixtureCount += 1; cur.fixtureIds.push(f.id);
  }
  circuits.forEach((c) => { c.utilization = budget > 0 ? c.watts / budget : 0; });
  return circuits;
}
