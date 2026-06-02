// ───────────────────────────────────────────────────────────────────────────
// Fixture ↔ Equipment mapping
//
// The bridge that lets a host like Cable-Planner treat a placed light as a
// normal piece of equipment with DMX + power ports, so it can be cabled and
// fed into the cable BOM. Pure data transform — no UI, no store.
//
// The shapes below mirror a typical equipment/port model (EquipmentItem,
// EquipmentPort). When wiring into Cable-Planner, map these onto its own
// `types/equipment.ts` (EquipmentItem / Template / Port) — the field names are
// chosen to line up.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture } from '../core';

export type PortKind = 'dmx' | 'power' | 'data' | 'network' | 'video' | 'audio' | 'other';
export type PortDirection = 'in' | 'out' | 'bi';

export interface EquipmentPort {
  id: string;
  name: string;
  kind: PortKind;
  direction: PortDirection;
  connector?: string;                                    // e.g. "XLR-5 (DMX)", "powerCON TRUE1"
  dmx?: { universe?: number; address?: number; channels?: number };
  power?: { watts?: number };
}

export interface EquipmentItem {
  id: string;
  templateId?: string;                                   // fixture-library id
  name: string;
  manufacturer?: string;
  category: string;                                      // host category (here: 'lighting')
  x: number;
  y: number;
  z?: number;                                            // mounting height (m)
  rotation?: number;                                     // body rotation (deg)
  weightKg?: number;
  powerW?: number;
  ports: EquipmentPort[];
  domain: 'lighting';
  // Keep the lighting specifics intact so nothing is lost in the round-trip.
  lighting?: {
    fixtureId: string;
    mountingHeight: number;
    aimX: number;
    aimY: number;
    dimming: number;
    channel?: number;
    unitNumber?: string;
    purpose?: string;
  };
}

const DMX_CONNECTOR = 'XLR-5 (DMX)';

/**
 * Convert a placed fixture into an equipment item with DMX (in + thru) and a
 * power port. DMX patch (universe / address / channels) and power draw carry
 * over so the host can route cables and tally load.
 */
export function fixtureToEquipment(pf: PlacedFixture): EquipmentItem {
  const f = pf.fixture;
  const channels = f.dmxChannels && f.dmxChannels > 0 ? f.dmxChannels : 1;
  const ports: EquipmentPort[] = [
    {
      id: `${pf.id}:dmx-in`, name: 'DMX In', kind: 'dmx', direction: 'in', connector: DMX_CONNECTOR,
      dmx: { universe: pf.universe, address: pf.dmxAddress, channels },
    },
    { id: `${pf.id}:dmx-thru`, name: 'DMX Thru', kind: 'dmx', direction: 'out', connector: DMX_CONNECTOR },
    {
      id: `${pf.id}:power`, name: 'Power', kind: 'power', direction: 'in',
      connector: f.powerConnector ?? 'powerCON', power: { watts: f.wattage },
    },
  ];
  return {
    id: pf.id,
    templateId: f.id,
    name: pf.unitNumber ? `${pf.unitNumber} · ${f.name}` : f.name,
    manufacturer: f.manufacturer,
    category: 'lighting',
    x: pf.x,
    y: pf.y,
    z: pf.mountingHeight,
    rotation: pf.bodyRotation,
    weightKg: f.weight,
    powerW: f.wattage,
    ports,
    domain: 'lighting',
    lighting: {
      fixtureId: f.id,
      mountingHeight: pf.mountingHeight,
      aimX: pf.aimX,
      aimY: pf.aimY,
      dimming: pf.dimming,
      channel: pf.channel,
      unitNumber: pf.unitNumber,
      purpose: pf.purpose,
    },
  };
}

/** All placed fixtures as equipment items (e.g. to hand the cable planner). */
export function fixturesToEquipment(fixtures: PlacedFixture[]): EquipmentItem[] {
  return fixtures.map(fixtureToEquipment);
}

/** Total connected load in watts (dimming-independent rated draw). */
export function totalRatedPowerW(fixtures: PlacedFixture[]): number {
  return fixtures.reduce((sum, pf) => sum + (pf.fixture.wattage || 0), 0);
}
