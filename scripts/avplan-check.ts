// Headless-Check fuer das .avplan-Gesamtformat (verlustfrei).
// Lauf: `npm run avplan:check`  (node --experimental-strip-types).
import assert from 'node:assert/strict';
import { makeAvPlan, parseAvPlan, AVPLAN_KIND } from '../src/core/avplan.ts';

// Eine reichhaltige Lighting-Domaene (so wuerde light sie schreiben).
const lighting = {
  meta: { name: 'Show', author: 'me', version: '1.0', createdAt: 't', updatedAt: 't' },
  fixtures: [{
    id: 'f1', x: 3, y: 4, mountingHeight: 5, aimX: 3, aimY: 1, dimming: 0.8,
    bodyRotation: 0, channel: 1, unitNumber: 1, universe: 1, dmxAddress: 1,
    gelFilterIds: ['L201'], barnDoors: { top: 10, bottom: 0, left: 0, right: 0 },
    currentBeamAngle: 19, currentColorTemp: 3200, purpose: 'Key', focused: true,
    fixture: { id: 'etc-s4', name: 'ETC S4 19°', manufacturer: 'ETC', category: 'spot', wattage: 750, beamAngle: 19 },
  }],
  scenes: [{ id: 's1', label: 'Blackout', fixtureStates: {} }],
  sun: { lat: 52.5, lon: 13.4, date: '2026-06-30', time: '12:00', northDeg: 0, intensity: 1 },
};

const venue = {
  name: 'Halle', widthM: 20, heightM: 12,
  persons: [{ id: 'p1', x: 1, y: 1, height: 1.8, label: 'A' }],
  walls: [], stageObjects: [],
};

// 1) Round-Trip durch JSON erhaelt alle Domaenen 1:1.
const ex = makeAvPlan({
  app: 'light-planner', appVersion: '1.0.0', exportedAt: 't', venue,
  domains: { lighting, cameras: { mcplan: true }, cabling: { equipment: [] } },
});
assert.equal(ex.kind, AVPLAN_KIND);
const back = parseAvPlan(JSON.stringify(ex));
assert.deepEqual(back.domains.lighting, lighting);
assert.deepEqual(back.domains.cameras, { mcplan: true });
console.log('✓ Round-Trip erhaelt alle Domaenen 1:1');

// 2) Passthrough: eine Fremd-App (z. B. Cable) laedt, aendert NUR ihren Slot,
//    reicht "lighting" unveraendert durch → kein Lampen-Detail geht verloren.
const loaded = parseAvPlan(JSON.stringify(ex));
const reexported = makeAvPlan({
  app: 'cable-planner', appVersion: '8.2.0', exportedAt: 't2', venue: loaded.venue,
  domains: {
    lighting: loaded.domains.lighting,           // unveraendert durchgereicht
    cameras: loaded.domains.cameras,             // unveraendert durchgereicht
    cabling: { equipment: [{ id: 'e1', name: 'ATEM' }] }, // eigener Slot bearbeitet
  },
});
const afterTrip = parseAvPlan(JSON.stringify(reexported));
assert.deepEqual(afterTrip.domains.lighting, lighting, 'Lampen exakt erhalten nach Reise durch Cable');
assert.deepEqual((afterTrip.domains.cabling as { equipment: unknown[] }).equipment.length, 1);
console.log('✓ Passthrough: Lampen mit allen Details ueberstehen die Reise durch eine Fremd-App');

// 3) Fremde / inkompatible Dateien werden abgelehnt.
assert.throws(() => parseAvPlan('{"kind":"lightplan"}'));
assert.throws(() => parseAvPlan(JSON.stringify({ ...ex, formatVersion: 99 })));
console.log('✓ Fremde / inkompatible Dateien werden abgelehnt');

console.log('\nAlle .avplan-Verlustfreiheits-Checks bestanden.');
