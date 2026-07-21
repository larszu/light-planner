// Headless-Check fuer den MVR-Export (GeneralSceneDescription.xml).
// Lauf: `npm run mvr:check`  (node --experimental-strip-types).
//
// Prueft die Fixture-Typ-Identitaet: Instanzen desselben Fixture-Typs teilen
// sich dieselbe <FixtureTypeId>, verschiedene Typen bekommen verschiedene Ids
// (1-basiert, keine konstante 0 mehr), und jede Instanz traegt ein eindeutiges
// uuid.
import assert from 'node:assert/strict';
import type { Fixture, PlacedFixture } from '../src/types.ts';
import { buildSceneDescription } from '../src/core/mvrExport.ts';

const mkType = (id: string, name: string): Fixture => ({
  id, name, manufacturer: 'ETC',
  category: 'spot', wattage: 750, lumens: 12000,
  beamAngle: 26, fieldAngle: 36, beamShape: 'round', beamRatioWH: 1,
  lensType: 'ellipsoidal', colorTemp: 3200, weight: 8, mountType: 'clamp',
  dmxChannels: 1,
} as Fixture);

const s4 = mkType('etc-s4-26', 'Source Four 26');
const fresnel = mkType('etc-fresnel-1kw', 'Fresnel 1kW');

const place = (id: string, fixture: Fixture, ch: number): PlacedFixture => ({
  id, fixture, x: ch, y: 2, mountingHeight: 6,
  aimX: ch, aimY: 0, bodyRotation: 0, dimming: 100,
  channel: ch, universe: 1, dmxAddress: ch,
} as PlacedFixture);

// Rig: S4, Fresnel, S4 — die beiden S4 teilen den Typ, der Fresnel ist eigen.
const fixtures = [
  place('a', s4, 1),
  place('b', fresnel, 2),
  place('c', s4, 3),
];

const xml = buildSceneDescription(fixtures, [], 'Testplan');

const typeIds = [...xml.matchAll(/<FixtureTypeId>(\d+)<\/FixtureTypeId>/g)].map((m) => Number(m[1]));
assert.equal(typeIds.length, 3, 'drei Fixtures → drei FixtureTypeId-Eintraege');

// (1) gleicher Typ → gleiche Id
assert.equal(typeIds[0], typeIds[2], 'beide Source Four teilen dieselbe FixtureTypeId');
// (2) verschiedener Typ → verschiedene Id
assert.notEqual(typeIds[0], typeIds[1], 'Source Four und Fresnel unterscheiden sich');
// (3) 1-basiert, kein konstantes 0 mehr
assert.ok(typeIds.every((n) => n >= 1), 'FixtureTypeId ist 1-basiert (nie 0)');
assert.deepEqual([...new Set(typeIds)].sort(), [1, 2], 'Typ-Ids sind fortlaufend ab 1');

// (4) jede Instanz hat ein eindeutiges uuid
const uuids = [...xml.matchAll(/<Fixture name="[^"]*" uuid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(uuids.length, 3, 'drei Fixture-uuids');
assert.equal(new Set(uuids).size, 3, 'alle Fixture-uuids sind eindeutig');

console.log('✓ MVR FixtureTypeId-Identitaet ok (S4↔S4 gleich, Fresnel eigen, 1-basiert, uuids eindeutig)');
