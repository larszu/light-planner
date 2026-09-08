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
// ERSTE HAELFTE (2026-09-07): OB sich etwas geaendert hat, laesst sich ohne
// jede Produktentscheidung feststellen — ein Vergleich der Werte. Die
// Oberflaeche sagte seither „Szenen unterscheiden sich" statt zu schweigen.
//
// ZWEITE HAELFTE (2026-09-08): jetzt auch das WAS. Alle vierzehn Kategorien
// werden Feld fuer Feld verglichen. Die Feldlisten folgen EINER Regel, damit
// es keine Geschmacksfrage bleibt: aufgezaehlt wird, was der Nutzer setzen
// kann, mit dem Namen, den die Oberflaeche dafuer benutzt. `layers`, `floor`
// und `sun` sind keine Listen — dafuer gibt es `diffSingle`, dieselbe
// Ergebnisform mit genau einer moeglichen Zeile.
//
// `unnamed` bleibt und meint jetzt etwas anderes: den REST. Kommt eine
// fuenfzehnte Kategorie in `ProjectData` dazu, faellt sie dort auf, statt
// still durchzufallen.
//
// Lauf: `npm run diff:check`
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { fixtureLibrary } from '../src/core/fixtureLibrary';
import type { ProjectData, PlacedFixture } from '../src/types';
import { diffProjects, unnamedDifferences, ALLE_KATEGORIEN, KATEGORIE_NAMEN } from '../src/core/diff';
import type { CategoryDiff, ProjectDiff } from '../src/core/diff';

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

// ── 3. Jede der acht nachgezogenen Kategorien wird AUFGESCHLUESSELT ──────
//
// Das ist der Kern von B-21. Vor der ersten Haelfte war `total` in allen acht
// Faellen 0 und die Oberflaeche sagte „Keine Unterschiede". Seit der zweiten
// steht daneben, WAS anders ist.
{
  const shape = (o: Record<string, unknown> = {}) =>
    ({ id: 's1', type: 'rect', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], label: 'A', color: '#fff', ...o } as never);
  const gruppe = (o: Record<string, unknown> = {}) =>
    ({ id: 'g1', label: 'G', fixtureIds: ['f1'], ...o } as never);
  const szene = (o: Record<string, unknown> = {}) =>
    ({ id: 'sc1', name: 'S', states: { f1: { dimming: 50 } }, ...o } as never);
  const kamera = (o: Record<string, unknown> = {}) =>
    ({ id: 'c1', x: 0, y: 0, height: 1.6, aimX: 1, aimY: 1, fov: 45, label: 'C', ...o } as never);
  const ebenen = (o: Record<string, unknown> = {}) =>
    ({
      fixtures: { visible: true, locked: false }, persons: { visible: true, locked: false },
      trusses: { visible: true, locked: false }, stage: { visible: true, locked: false },
      shapes: { visible: true, locked: false }, ceilings: { visible: true, locked: false },
      walls: { visible: true, locked: false }, floorPlan: { visible: true, locked: false },
      ...o,
    } as never);
  const boden = (o: Record<string, unknown> = {}) => ({ preset: 'parquet', color: '#8a5', ...o } as never);
  const sonne = (o: Record<string, unknown> = {}) =>
    ({ enabled: true, latitude: 52.5, longitude: 13.4, date: '2026-06-30', time: '12:00',
       northDeg: 0, intensity: 100000, ...o } as never);

  // (a) HINZUGEFUEGT: die Kategorie war leer, jetzt steht etwas darin.
  const zugang: { name: string; anders: Partial<ProjectData>; kat: keyof ProjectDiff }[] = [
    { name: 'Formen', kat: 'shapes', anders: { shapes: [shape()] } },
    { name: 'Eigene Leuchten', kat: 'customFixtures', anders: { customFixtures: [fix] } },
    { name: 'Gruppen', kat: 'fixtureGroups', anders: { fixtureGroups: [gruppe()] } },
    { name: 'Szenen', kat: 'scenes', anders: { scenes: [szene()] } },
    { name: 'Kameras', kat: 'cameras', anders: { cameras: [kamera()] } },
    { name: 'Ebenen', kat: 'layers', anders: { layers: ebenen() } },
    { name: 'Boden', kat: 'floor', anders: { floor: boden() } },
    { name: 'Sonne', kat: 'sun', anders: { sun: sonne() } },
  ];
  for (const f of zugang) {
    const d = diffProjects(base(), base(f.anders));
    const c = d[f.kat] as CategoryDiff;
    assert.equal(c.added.length, 1, `${f.name}: als hinzugefuegt gemeldet`);
    assert.ok(d.total > 0, `${f.name}: zaehlt in total mit`);
    assert.deepEqual(d.unnamed, [], `${f.name}: nichts bleibt unbenannt`);
  }

  // (b) GEAENDERT: dasselbe Stueck, ein anderes Feld — mit FELDNAMEN.
  const aenderung: { name: string; kat: keyof ProjectDiff; vorher: Partial<ProjectData>;
                     nachher: Partial<ProjectData>; feld: string }[] = [
    { name: 'Formen', kat: 'shapes', feld: 'Farbe',
      vorher: { shapes: [shape()] }, nachher: { shapes: [shape({ color: '#000' })] } },
    { name: 'Gruppen', kat: 'fixtureGroups', feld: 'Leuchten',
      vorher: { fixtureGroups: [gruppe()] }, nachher: { fixtureGroups: [gruppe({ fixtureIds: ['f1', 'f2'] })] } },
    { name: 'Szenen', kat: 'scenes', feld: 'Werte',
      vorher: { scenes: [szene()] }, nachher: { scenes: [szene({ states: { f1: { dimming: 10 } } })] } },
    { name: 'Kameras', kat: 'cameras', feld: 'Bildwinkel',
      vorher: { cameras: [kamera()] }, nachher: { cameras: [kamera({ fov: 60 })] } },
    { name: 'Ebenen', kat: 'layers', feld: 'Leuchten',
      vorher: { layers: ebenen() }, nachher: { layers: ebenen({ fixtures: { visible: false, locked: true } }) } },
    { name: 'Boden', kat: 'floor', feld: 'Vorlage',
      vorher: { floor: boden() }, nachher: { floor: boden({ preset: 'concrete' }) } },
    { name: 'Sonne', kat: 'sun', feld: 'Uhrzeit',
      vorher: { sun: sonne() }, nachher: { sun: sonne({ time: '18:30' }) } },
  ];
  for (const f of aenderung) {
    const d = diffProjects(base(f.vorher), base(f.nachher));
    const c = d[f.kat] as CategoryDiff;
    assert.equal(c.changed.length, 1, `${f.name}: als geaendert gemeldet`);
    const felder = c.changed[0].fields.map((x) => x.field);
    assert.ok(felder.includes(f.feld), `${f.name}: Feld „${f.feld}" benannt, gefunden: ${felder.join(', ')}`);
    assert.deepEqual(d.unnamed, [], `${f.name}: nichts bleibt unbenannt`);
  }

  // (c) ENTFERNT — bei den drei Einzelstuecken ist das der Fall, den eine
  //     Liste nicht kennt: das Stueck war gesetzt und ist es nicht mehr.
  for (const [kat, wert] of [['layers', ebenen()], ['floor', boden()], ['sun', sonne()]] as const) {
    const d = diffProjects(base({ [kat]: wert } as Partial<ProjectData>), base());
    assert.equal((d[kat as keyof ProjectDiff] as CategoryDiff).removed.length, 1,
      `${kat}: Wegfall gemeldet`);
  }

  // (d) GEGENPROBE: eine Umsortierung in einer Gruppe ist KEINE Aenderung.
  //     Die Reihenfolge in `fixtureIds` bedeutet nichts; sie zu melden waere
  //     ein Fehlalarm, und Fehlalarme kosten den Dialog seine Glaubwuerdigkeit.
  {
    const d = diffProjects(
      base({ fixtureGroups: [gruppe({ fixtureIds: ['f1', 'f2'] })] }),
      base({ fixtureGroups: [gruppe({ fixtureIds: ['f2', 'f1'] })] }),
    );
    assert.equal(d.total, 0, 'Umsortierung innerhalb einer Gruppe ist kein Unterschied');
  }
}

// ── 3b. Die Kategorie-Liste ist vollstaendig ──────────────────────────────
//
// `total` zaehlt ueber `ALLE_KATEGORIEN`. Faehlt dort ein Eintrag, ist `total`
// wieder kleiner als die Wahrheit — derselbe Defekt eine Ebene tiefer.
{
  const d = diffProjects(base(), base());
  const imErgebnis = Object.keys(d).filter((k) => k !== 'total' && k !== 'unnamed').sort();
  assert.deepEqual([...ALLE_KATEGORIEN].sort(), imErgebnis,
    'ALLE_KATEGORIEN deckt jede Kategorie im Ergebnis ab');
  for (const k of ALLE_KATEGORIEN) {
    assert.ok(KATEGORIE_NAMEN[k], `Anzeigename fuer ${k} fehlt`);
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
  // Und die Kategorie-Liste steht dort NICHT ein zweites Mal: sie war um acht
  // Eintraege kuerzer als der Vergleich, und niemand hat es gesehen.
  assert.match(view, /ALLE_KATEGORIEN\.map/,
    'DiffView nimmt die Kategorien aus core/diff, statt sie noch einmal aufzuzaehlen');
  assert.doesNotMatch(view, /key: 'fixtures'/,
    'keine zweite Kategorie-Liste in der Ansicht');
}

console.log('diff:check ok — der Versions-Vergleich behauptet nicht mehr, als er prueft (B-21)');
