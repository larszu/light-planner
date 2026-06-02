// ── DMX patch, channel numbering & electrical-load helpers ────────────
//
// Mirrors the "Spotlight Numbering" + "Generate Paperwork" workflow of
// professional plots: number the rig in reading order, assign DMX addresses
// respecting each fixture's footprint, and total up the electrical load.

import type { PlacedFixture } from '../types';

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
