// ── DMX patch, channel numbering & electrical-load helpers ────────────
//
// Mirrors the "Spotlight Numbering" + "Generate Paperwork" workflow of
// professional plots: number the rig in reading order, assign DMX addresses
// respecting each fixture's footprint, and total up the electrical load.

import type { PlacedFixture, Truss } from '../types';
import { gelLibrary } from './gelLibrary';

const UNIVERSE_SIZE = 512;

// DMX footprint of a fixture; 0 / undefined means a conventional unit that
// lives on a dimmer (gets a channel number but no DMX address).
export function footprint(f: PlacedFixture): number {
  return f.fixture.dmxChannels && f.fixture.dmxChannels > 0 ? f.fixture.dmxChannels : 0;
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
      if (fp > 0) {
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
      cur = { index: circuits.length + 1, watts: 0, fixtureCount: 0, utilization: 0 };
      circuits.push(cur);
    }
    cur.watts += w; cur.fixtureCount += 1;
  }
  circuits.forEach((c) => { c.utilization = budget > 0 ? c.watts / budget : 0; });
  return circuits;
}
