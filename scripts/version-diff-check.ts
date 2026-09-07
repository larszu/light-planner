// ───────────────────────────────────────────────────────────────────────────
// B-21 — „Der Versions-Vergleich sieht 6 von 14 Kategorien".
//
// `diffProjects` vergleicht sechs Kategorien Feld fuer Feld. `ProjectData` hat
// vierzehn inhaltliche. Wer nur Formen verschiebt, eine Szene aendert, eine
// Kamera umstellt oder die Sonne dreht, bekam im Versions-Dialog „Keine
// Unterschiede zum aktuellen Stand".
//
// DAS IST KEINE LUECKE IN DER ANZEIGE, SONDERN EINE FALSCHAUSSAGE. Der Nutzer
// verwirft daraufhin eine Version, die sich sehr wohl unterscheidet — und die
// Version ist danach weg.
//
// Was dieser Fix NICHT tut: die acht fehlenden Kategorien aufschluesseln. Das
// braucht je Kategorie eine Beschriftungsfunktion und eine Feldliste — welche
// Felder eine Aenderung AUSMACHEN und wie sie heissen, ist eine
// Produktentscheidung, und `layers`, `floor` und `sun` sind ueberdies keine
// Listen, auf die `diffList` passt (Backlog E-14).
//
// Was er tut: OB sich etwas geaendert hat, laesst sich ohne jede
// Produktentscheidung feststellen — ein Vergleich der Werte. Nur das WAS
// bleibt offen. Also sagt die Oberflaeche genau das, statt zu schweigen.
//
// Lauf: `npm run diff:check`
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { fixtureLibrary } from '../src/core/fixtureLibrary';
import type { ProjectData, PlacedFixture } from '../src/types';
import { diffProjects, unnamedDifferences } from '../src/core/diff';

const fix = fixtureLibrary[0];
const mk = (id: string, o: Partial<PlacedFixture> = {}): PlacedFixture => ({
  id, fixture: fix, x: 1, y: 1, mountingHeight: 6, aimX: 1, aimY: 5,
  bodyRotation: 0, dimming: 100, ...o,
});
const meta = { name: 'P', author: '', version: '1', createdAt: '', updatedAt: '' };
const base = (o: Partial<ProjectData> = {}): ProjectData => ({
  meta, fixtures: [mk('f1', { channel: 1 })], shapes: [], persons: [],
  stageElements: [], customFixtures: [], ...o,
});

// ── 1. Die sechs verglichenen Kategorien arbeiten wie bisher ──────────────
{
  const A = base({ fixtures: [mk('f1', { channel: 1 }), mk('f2', { channel: 2 }), mk('f3', { channel: 3 })] });
  const B = base({ fixtures: [
    mk('f1', { channel: 1 }),
    mk('f2', { channel: 2, dimming: 60, x: 4, gelFilterIds: ['lee-205'] }),
    mk('f4', { channel: 4 }),
  ] });
  const d = diffProjects(A, B);
  assert.equal(d.fixtures.added.length, 1, 'hinzugefuegte Leuchte erkannt');
  assert.equal(d.fixtures.removed.length, 1, 'entfernte Leuchte erkannt');
  assert.equal(d.fixtures.changed.length, 1, 'geaenderte Leuchte erkannt');
  const felder = d.fixtures.changed[0].fields.map((f) => f.field);
  for (const f of ['Dimmer', 'Position', 'Gel']) {
    assert.ok(felder.includes(f), `Feld ${f} gemeldet`);
  }
  assert.equal(d.total, 3, 'total = 3');
  assert.deepEqual(d.unnamed, [], 'nichts Unbenanntes, wenn nur Leuchten anders sind');
}

// ── 2. Gleiche Projekte sind gleich — in beiden Haelften ──────────────────
{
  const A = base();
  const d = diffProjects(A, A);
  assert.equal(d.total, 0);
  assert.deepEqual(d.unnamed, [], 'identische Projekte melden keinen Unterschied');
}

// ── 3. Jede der acht nicht aufgeschluesselten Kategorien wird BEMERKT ─────
//
// Das ist der Kern von B-21. Vor dem Fix war `total` in allen acht Faellen 0
// und die Oberflaeche sagte „Keine Unterschiede".
{
  const faelle: { name: string; anders: Partial<ProjectData> }[] = [
    { name: 'Formen', anders: { shapes: [{ id: 's1', kind: 'rect', x: 0, y: 0, w: 1, h: 1 } as never] } },
    { name: 'Eigene Leuchten', anders: { customFixtures: [fix] } },
    { name: 'Gruppen', anders: { fixtureGroups: [{ id: 'g1', name: 'G', fixtureIds: [] } as never] } },
    { name: 'Szenen', anders: { scenes: [{ id: 'sc1', name: 'S', levels: {} } as never] } },
    { name: 'Kameras', anders: { cameras: [{ id: 'c1', name: 'C' } as never] } },
    { name: 'Ebenen', anders: { layers: { fixtures: false } as never } },
    { name: 'Boden', anders: { floor: 'concrete' as never } },
    { name: 'Sonne', anders: { sun: { azimuthDeg: 90, altitudeDeg: 30 } as never } },
  ];
  for (const f of faelle) {
    const d = diffProjects(base(), base(f.anders));
    assert.equal(d.total, 0, `${f.name}: bleibt ohne Feld-Detail (das ist E-14)`);
    assert.deepEqual(d.unnamed, [f.name], `${f.name}: wird beim Namen genannt`);
    assert.deepEqual(unnamedDifferences(base(), base(f.anders)), [f.name]);
  }
}

// ── 4. Schluesselreihenfolge ist kein Unterschied ─────────────────────────
//
// Ein naiver JSON-Vergleich meldete hier eine Aenderung, wo keine ist — und
// eine Falschmeldung in die andere Richtung ist genauso schlimm: wer bei
// jeder Version „etwas ist anders" liest, glaubt der Anzeige nicht mehr.
{
  const A = base({ sun: { altitudeDeg: 30, azimuthDeg: 90 } as never });
  const B = base({ sun: { azimuthDeg: 90, altitudeDeg: 30 } as never });
  assert.deepEqual(diffProjects(A, B).unnamed, [],
    'dieselben Werte in anderer Schluesselreihenfolge sind kein Unterschied');
}

// ── 5. Die Oberflaeche behauptet nicht mehr, als der Vergleich abdeckt ────
{
  const { readFileSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const hier = dirname(fileURLToPath(import.meta.url));
  const lies = (rel: string) => readFileSync(resolve(hier, '..', rel), 'utf8');

  const version = lies('src/components/VersionDialog.tsx');
  assert.match(version, /diff\.total === 0 && diff\.unnamed\.length === 0/,
    'VersionDialog: „Keine Unterschiede" nur, wenn auch die acht gleich sind');
  const changes = lies('src/components/ChangesDialog.tsx');
  assert.match(changes, /diff!\.total === 0 && diff!\.unnamed\.length === 0/,
    'ChangesDialog: dieselbe Bedingung');
  const view = lies('src/components/DiffView.tsx');
  assert.match(view, /diff\.unnamed\.length > 0/,
    'DiffView zeigt die nicht aufgeschluesselten Kategorien');
}

console.log('diff:check ok — der Versions-Vergleich behauptet nicht mehr, als er prueft (B-21)');
