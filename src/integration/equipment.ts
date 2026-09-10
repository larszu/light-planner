// ───────────────────────────────────────────────────────────────────────────
// Fixture → Cable-Planner Equipment mapping
//
// Produces equipment in Cable-Planner's exact shape (mirrors
// cable-planner/src/renderer/types/equipment.ts: EquipmentItem, Port,
// ConnectorType) so a placed light drops straight into the cable plan as a
// device with DMX (in + thru) and power ports — cable it, tally the load, BOM
// it. Pure data transform — no UI, no store.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture } from '../core';
import { footprint, footprintOrNull, modeOf, modesOf } from '../core/patch';

// Subset of Cable-Planner's ConnectorType that lighting fixtures use. The host
// union is a superset, so these string literals are assignable to it.
export type CpConnectorType =
  | 'DMX 5-pol (XLR)' | 'DMX 3-pol (XLR)'
  | 'PowerCON' | 'IEC 230V' | 'Schuko 230V' | 'CEE16' | 'CEE32' | 'Kleeblatt';

// Mirrors Cable-Planner Port (only the fields we populate).
export interface CpPort {
  id: string;
  name: string;
  type: string;                 // signal type, e.g. 'DMX', 'Power'
  connectorType: CpConnectorType;
  side?: 'left' | 'right';
  contentLabel?: string;        // shown as the canvas label when set
}

// Mirrors Cable-Planner EquipmentItem (the fields a fixture fills in).
export interface CpEquipmentItem {
  id: string;
  name: string;
  subtitle?: string;
  category: string;             // host category — 'Licht'
  icon?: string;
  inputs: CpPort[];
  outputs: CpPort[];
  x: number; y: number; width: number; height: number;   // canvas px
  powerConsumptionWatts?: number;
  powerWatts?: number;
  weightKg?: number;
  notes?: string;
  // Category-specific data — surfaces in Properties + travels with the file.
  categoryProps?: Record<string, string | number | boolean>;
}

const PX_PER_M = 40;

/** Map a fixture's power connector string to a Cable-Planner ConnectorType. */
export function powerConnectorToCp(connector?: string): CpConnectorType {
  const c = (connector ?? '').toLowerCase();
  if (c.includes('powercon')) return 'PowerCON';
  if (c.includes('schuko')) return 'Schuko 230V';
  if (c.includes('cee32')) return 'CEE32';
  if (c.includes('cee')) return 'CEE16';
  if (c.includes('iec') || c.includes('c13') || c.includes('c14')) return 'IEC 230V';
  if (c.includes('klee') || c.includes('c7')) return 'Kleeblatt';
  return 'PowerCON';
}

/**
 * Convert a placed fixture into a Cable-Planner equipment item. DMX patch
 * (universe.address / footprint) and power draw carry over so the host can
 * route DMX + power cables and tally the load.
 */
export function fixtureToEquipment(pf: PlacedFixture): CpEquipmentItem {
  const f = pf.fixture;
  // BEFUND (Defektformen-Sweep, Form `zwei-rechnungen`, 2026-09-07): hier
  // stand `f.dmxChannels && f.dmxChannels > 0 ? f.dmxChannels : 1` — dieselbe
  // Frage wie `footprint()` in `core/patch.ts`, aber mit der ANDEREN Antwort
  // im Nein-Fall: 1 statt 0. Und die 0 ist im Planer keine Rundungsfrage,
  // sondern die Kodierung fuer „konventionelle Leuchte am Dimmer, bekommt
  // eine Kanalnummer, aber keine DMX-Adresse" — `autoPatch` ueberspringt
  // solche Einheiten, `rigCheck` verlangt fuer sie keine Adresse,
  // `preflight` meldet sie, wenn die Kategorie elektronisch ist.
  //
  // Der Export uebergab dem Kabel-Planer damit einen DMX-Fussabdruck von 1
  // fuer Einheiten, die gar keinen haben — plus eine DMX-Eingangs- und eine
  // Thru-Buchse, die es an einer Dimmerleuchte nicht gibt. Wer den Plan
  // uebernahm, bekam eine DMX-Leitung zum 1-kW-Stufenlinsenscheinwerfer.
  const channels = footprint(pf);
  // Ein Geraet, dessen Modus nur nicht gewaehlt ist, HAT eine DMX-Ansteuerung
  // — sein Fussabdruck ist bloss unbekannt. Es allein an `channels > 0` zu
  // haengen, haette ihm im Kabelplan die DMX-Buchsen genommen, und der
  // Kabelzug haette eine Leitung weniger vorgesehen als das Rig braucht.
  const modusFehlt = footprintOrNull(pf) === null;
  const hatDmx = channels > 0 || modusFehlt;
  const patch = pf.universe != null && pf.dmxAddress != null ? `U${pf.universe}.${pf.dmxAddress}` : undefined;
  const inputs: CpPort[] = [];
  if (hatDmx) {
    inputs.push({
      id: `${pf.id}:dmx-in`, name: patch ? `DMX In (${patch})` : 'DMX In', type: 'DMX',
      connectorType: 'DMX 5-pol (XLR)', side: 'left', contentLabel: patch,
    });
  }
  inputs.push({
    id: `${pf.id}:power`, name: 'Power', type: 'Power',
    connectorType: powerConnectorToCp(f.powerConnector), side: 'left',
  });
  const outputs: CpPort[] = hatDmx
    ? [{ id: `${pf.id}:dmx-thru`, name: 'DMX Thru', type: 'DMX', connectorType: 'DMX 5-pol (XLR)', side: 'right' }]
    : [];
  // Der Modus faehrt mit. Der Kabel-Planer fuehrt seit 2026-09-10 dasselbe
  // Modell (`dmxProfil`/`dmxModusId`, Paket `@avplan/dmx-core`) — reicht der
  // Export nur die Kanalzahl herueber, kommt drueben eine Zahl an, deren
  // Modus niemand mehr kennt, und die dortige Adressvergabe rechnet mit
  // einem Fussabdruck, dessen Herkunft verloren ist.
  const modus = modeOf(pf);
  const categoryProps: Record<string, string | number | boolean> = {
    'Lichtstrom (lm)': f.lumens,
    'Beam (°)': f.beamAngle,
    'Field (°)': f.fieldAngle,
    'DMX-Footprint': modusFehlt ? 'unbekannt' : channels,
    'Dimmer (%)': pf.dimming,
    'Höhe (m)': pf.mountingHeight,
  };
  if (modus) {
    categoryProps['DMX-Modus'] = modus.name;
    categoryProps['DMX-Modus-Herkunft'] = modus.origin;
    if (modus.evidence) categoryProps['DMX-Modus-Beleg'] = modus.evidence;
  } else if (modusFehlt) {
    categoryProps['DMX-Modus'] = `nicht gewählt (${modesOf(f).length} zur Auswahl)`;
  }
  if (pf.universe != null) categoryProps['DMX-Universe'] = pf.universe;
  if (pf.dmxAddress != null) categoryProps['DMX-Adresse'] = pf.dmxAddress;
  if (pf.channel != null) categoryProps['Kanal'] = pf.channel;
  if (f.colorTemp) categoryProps['CCT (K)'] = f.colorTemp;

  return {
    id: pf.id,
    name: pf.unitNumber ? `${pf.unitNumber} · ${f.name}` : f.name,
    subtitle: f.manufacturer,
    category: 'Licht',
    icon: '💡',
    inputs,
    outputs,
    x: Math.round(pf.x * PX_PER_M),
    y: Math.round(pf.y * PX_PER_M),
    width: 200,
    height: 96,
    powerConsumptionWatts: f.wattage,
    powerWatts: f.wattage,
    weightKg: f.weight,
    notes: pf.purpose,
    categoryProps,
  };
}

/** All placed fixtures as Cable-Planner equipment items. */
export function fixturesToEquipment(fixtures: PlacedFixture[]): CpEquipmentItem[] {
  return fixtures.map(fixtureToEquipment);
}

/** Total connected load in watts (rated draw, dimming-independent). */
export function totalRatedPowerW(fixtures: PlacedFixture[]): number {
  return fixtures.reduce((sum, pf) => sum + (pf.fixture.wattage || 0), 0);
}
