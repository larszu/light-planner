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

// ── ADR-005, Regel 3: der MVR-Export verschweigt die Traversen nicht ─────────
//
// `buildSceneDescription` nimmt eine Traversen-Liste entgegen und schreibt
// nichts davon — der Parameter heisst deshalb `_trusses`. Das ist als Grenze
// vertretbar (MVR ist ein reiner Ausgabeweg, es gibt keinen Importer, lights
// eigene Traversen bleiben in der Projektdatei). Nicht vertretbar war die
// Zusage darueber: die Oberflaeche bewarb „Rig mit Positionen & Patch", und
// die Traverse IST das Rig.
//
// Dieser Check haelt fest, was die Datei WIRKLICH enthaelt, damit die Zusage
// nicht wieder auseinanderlaeuft.
{
  const withTruss = buildSceneDescription(
    [] as never,
    [{ id: 't1', x1: 0, y1: 0, x2: 5, y2: 0, height: 6 }] as never,
    'Testanlage',
  );
  assert.ok(!/Truss/i.test(withTruss), 'die Szene behauptet keine Traverse');
  assert.ok(
    withTruss.includes('<ChildList>'),
    'die Szene bleibt strukturell gueltig, auch ohne Traversen',
  );
  console.log('✓ ADR-005: der MVR-Export erfindet keine Traversen-Geometrie');
}
