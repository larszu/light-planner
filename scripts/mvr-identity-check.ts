// ───────────────────────────────────────────────────────────────────────────
// Austauschdateien, die an einer Umbenennung nicht zerbrechen (Bedarf 144, P4).
// Lauf: `npm run identity:mvr`
//
//   > Documented failure modes, all mundane and all silent: renaming the .vwx
//   > leaves the paperwork reading a stale .xml; NON-UNIQUE UIDS MAKE A DELETED
//   > FIXTURE REAPPEAR; 'one undefined or corrupted character in a data field
//   > can invalidate the whole exchange .xml'.
//
// Belege: `showstack`-Datenblatt zu Lightwright (John McKernon Software,
// 2026-08-17), `PeramatoG/Perastage#2157` und `#2233`.
//
// ZWEI GEMESSENE DEFEKTE (2026-09-06), die dieser Lauf festhält:
//
//  1. Derselbe Plan ergab zweimal verschiedene UUIDs — `fixtureXml` rief bei
//     jedem Export `uuid()` neu auf. Ein Nachimport war damit keine
//     Aktualisierung, sondern eine Verdopplung.
//  2. „Source/Four" und „Source:Four" fielen beide auf
//     `ETC_Source_Four.gdtf`: zwei Geräte, ein Bezug, kein Wort darüber.
//
// WAS SONST NOCH GEPRÜFT WIRD:
//
//  3. Die Identität überlebt das NEULADEN. Das ist der Kern der Empfehlung
//     („stable internal UUIDs surviving reload"): abgeleitet aus der id, die
//     das Projekt ohnehin führt, nicht aus einem Zufallswert im Speicher.
//  4. Verschiedene Projekte teilen keine Identität. Sonst sieht ein
//     Visualisierer, der zwei Pläne lädt, eine Lampe statt zweier.
//  5. Die Versionsziffer sagt die Wahrheit: Version 8 (RFC 9562,
//     herstellerdefiniert), nicht 4 („zufällig erzeugt").
//  6. Die Datei ist reproduzierbar — bis in die Bytes des Archivs.
//  7. Der Weg ist verdrahtet: der Dialog reicht die Projekt-Kennung durch und
//     zeigt die Kollisionen.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMvr, buildSceneDescription } from '../src/core/mvrExport.ts';
import { fixtureUuid, gdtfSpecNames, layerUuid, stableUuid } from '../src/core/mvrIdentity.ts';
import type { PlacedFixture } from '../src/types.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const lampe = (id: string, name: string, manufacturer = 'ETC'): PlacedFixture => ({
  id,
  fixture: {
    id: `t-${manufacturer}-${name}`, name, manufacturer, category: 'spot',
    wattage: 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp',
  },
  x: 1, y: 2, mountingHeight: 6, aimX: 1, aimY: 3, bodyRotation: 0, dimming: 100,
  channel: 1, unitNumber: '1', universe: 1, dmxAddress: 1,
} as PlacedFixture);

const uuidsIn = (xml: string): string[] => [...xml.matchAll(/uuid="([^"]+)"/g)].map((m) => m[1]);
const specsIn = (xml: string): string[] => [...xml.matchAll(/<GDTFSpec>([^<]+)</g)].map((m) => m[1]);

// ─── 1. Derselbe Plan, dieselbe Datei ──────────────────────────────────────
{
  const rig = [lampe('a', 'Source Four 26'), lampe('b', 'Source Four 26')];
  const x1 = buildSceneDescription(rig, [], 'Show', 'p1');
  const x2 = buildSceneDescription(rig, [], 'Show', 'p1');
  assert.equal(x1, x2, 'zweimal derselbe Plan ergab zwei verschiedene Dateien');

  // Der Kern: die UUIDs sind gleich. Ohne diese Zeile ginge ein Test durch,
  // der nur zufaellig identische Zeichenketten vergleicht.
  assert.deepEqual(uuidsIn(x1), uuidsIn(x2));
  assert.ok(uuidsIn(x1).length >= 3, 'zu wenige UUIDs im Ergebnis — pruefen wir ueberhaupt etwas?');
}

// ─── 2. Zwei Typen, zwei Dateinamen ────────────────────────────────────────
{
  const rig = [lampe('a', 'Source/Four'), lampe('b', 'Source:Four')];
  const specs = specsIn(buildSceneDescription(rig, [], 'Show', 'p1'));
  assert.equal(new Set(specs).size, 2, 'zwei Geraetetypen teilen sich einen GDTF-Bezug');

  // Der erste behaelt seinen Namen — sonst verschoeben sich die Bezuege eines
  // vorhandenen Plans, sobald jemand einen zweiten Typ anlegt.
  assert.equal(specs[0], 'ETC_Source_Four.gdtf');

  // Gross-/Kleinschreibung zaehlt als Kollision: auf einem Mac-Dateisystem
  // sind `S4.gdtf` und `s4.gdtf` dieselbe Datei, und der Export ueberschriebe
  // sich selbst.
  const gross = gdtfSpecNames([
    { manufacturer: 'ETC', name: 'S4' },
    { manufacturer: 'etc', name: 's4' },
  ]);
  assert.equal(new Set(gross.byType.values()).size, 2);
  assert.equal(gross.collisions.length, 1, 'die Kollision wurde still aufgeloest');
  assert.equal(gross.collisions[0].types.length, 2);

  // Ohne Kollision keine Meldung.
  assert.deepEqual(
    gdtfSpecNames([{ manufacturer: 'ETC', name: 'S4' }, { manufacturer: 'ETC', name: 'Fresnel' }]).collisions,
    [],
  );

  // Derselbe Typ zweimal ist KEINE Kollision — sonst meldete jeder Plan mit
  // zwei gleichen Lampen einen Fehler, den es nicht gibt.
  assert.deepEqual(
    gdtfSpecNames([{ manufacturer: 'ETC', name: 'S4' }, { manufacturer: 'ETC', name: 'S4' }]).collisions,
    [],
  );
}

// ─── 3. Die Identitaet ueberlebt das Neuladen ──────────────────────────────
{
  // „Neu geladen" heisst hier: dieselbe Leuchte, frisch aus einer Datei
  // gebaut, ein anderes Objekt im Speicher. Genau daran scheiterte die alte
  // Fassung — ihre UUID hing am Aufruf, nicht an der Leuchte.
  const vorher = fixtureUuid('p1', 'fix-7');
  const nachher = fixtureUuid('p1', 'fix-7');
  assert.equal(vorher, nachher);
  const x1 = buildSceneDescription([lampe('fix-7', 'S4')], [], 'Show', 'p1');
  const x2 = buildSceneDescription([lampe('fix-7', 'S4')], [], 'Show', 'p1');
  assert.equal(x1, x2, 'eine neu geladene Leuchte bekam eine andere Identitaet');

  // Die Identitaet haengt an der LEUCHTE, nicht an ihrer Stelle in der Liste.
  // Ohne diese Zeile geht eine Fassung durch, die den Index als Kennung
  // nimmt: dann bekommt jede Lampe eine neue UUID, sobald jemand eine andere
  // loescht oder umsortiert — und der Nachimport verdoppelt wieder alles.
  //
  // Verglichen wird die ZUORDNUNG Leuchte -> UUID, nicht die Menge der UUIDs:
  // beim blossen Vergleich zweier sortierter Listen kaeme eine
  // index-basierte Fassung durch, weil sie dieselben zwei Werte vergibt --
  // nur eben ueber Kreuz.
  const zuordnung = (xml: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const m of xml.matchAll(/<Fixture name="([^"]+)" uuid="([^"]+)"/g)) out[m[1]] = m[2];
    return out;
  };
  const vorwaerts = buildSceneDescription([lampe('a', 'S4'), lampe('b', 'Fresnel')], [], 'Show', 'p1');
  const rueckwaerts = buildSceneDescription([lampe('b', 'Fresnel'), lampe('a', 'S4')], [], 'Show', 'p1');
  assert.equal(Object.keys(zuordnung(vorwaerts)).length, 2, 'die Zuordnung ist leer -- pruefen wir etwas?');
  assert.deepEqual(
    zuordnung(vorwaerts),
    zuordnung(rueckwaerts),
    'die UUID haengt an der Reihenfolge statt an der Leuchte',
  );

  // Und zwei verschiedene Leuchten teilen sie nicht.
  assert.notEqual(fixtureUuid('p1', 'a'), fixtureUuid('p1', 'b'));
  const viele = new Set<string>();
  for (let i = 0; i < 2000; i += 1) viele.add(fixtureUuid('p1', `f${i}`));
  assert.equal(viele.size, 2000, 'zwei Leuchten bekamen dieselbe UUID');
}

// ─── 4. Verschiedene Projekte teilen keine Identitaet ──────────────────────
{
  assert.notEqual(fixtureUuid('p1', 'fix-7'), fixtureUuid('p2', 'fix-7'));
  assert.notEqual(layerUuid('p1', 'Show'), layerUuid('p2', 'Show'));
  // Und die Ebene ist keine Leuchte.
  assert.notEqual(fixtureUuid('p1', 'Show'), layerUuid('p1', 'Show'));
}

// ─── 5. Die Versionsziffer sagt die Wahrheit ───────────────────────────────
{
  const u = stableUuid('irgendwas');
  assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  // Version 8 = herstellerdefiniert (RFC 9562). Eine 4 hineinzuschreiben
  // waere eine Aussage ueber die Herkunft dieser Bytes, die nicht stimmt.
  assert.equal(u[14], '8', 'die Versionsziffer behauptet etwas anderes als die Herkunft');
  assert.ok(['8', '9', 'a', 'b'].includes(u[19]), 'falsche Variante');

  // Der Hash sieht das GANZE Zeichen, nicht nur sein unteres Byte. „A"
  // (U+0041) und „Ł" (U+0141) haben dasselbe untere Byte; eine Fassung, die
  // nur `charCodeAt(i) & 0xff` einrechnet, haelt sie fuer gleich — und dann
  // teilen sich zwei verschiedene Leuchten eine Identitaet.
  assert.notEqual(stableUuid('A'), stableUuid('\u0141'), 'nur das untere Byte geht in den Hash ein');
  assert.notEqual(stableUuid('Röhre'), stableUuid('Rhre'));
  assert.notEqual(stableUuid('a'), stableUuid('b'));
  // Und alle vier Bloecke sind verschieden — ein einzelner 32-Bit-Hash,
  // viermal wiederholt, ergaebe vier gleiche Vierergruppen.
  const roh = stableUuid('abc').replace(/-/g, '');
  const bloecke = [roh.slice(0, 8), roh.slice(8, 16), roh.slice(16, 24), roh.slice(24, 32)];
  assert.equal(new Set(bloecke).size, 4, 'die UUID besteht aus vier gleichen Bloecken');
}

// ─── 6. Reproduzierbar bis in die Bytes ────────────────────────────────────
{
  const rig = [lampe('a', 'S4'), lampe('b', 'Fresnel')];
  const a = buildMvr(rig, [], 'Show', 'p1');
  const b = buildMvr(rig, [], 'Show', 'p1');
  assert.deepEqual([...a], [...b], 'dasselbe Rig ergab zwei verschiedene Archive');

  // Der Zeitstempel im Archiv haengt nicht an der Uhr. Ohne diese Zusicherung
  // waere die Gleichheit oben ein Zufall zweier Aufrufe in derselben Sekunde.
  const quelle = lies('../src/core/mvrExport.ts');
  assert.doesNotMatch(quelle, /const now = new Date\(\)/, 'die Uhr steckt wieder im Archiv');
  assert.match(quelle, /DOS_EPOCH_DATE/);

  // Und der Zufalls-Erzeuger ist weg.
  assert.doesNotMatch(quelle, /getRandomValues/, 'der Zufalls-UUID-Erzeuger ist zurueck');
  assert.doesNotMatch(quelle, /Math\.random/, 'der Zufalls-UUID-Erzeuger ist zurueck');
}

// ─── 7. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = lies('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /buildMvr\(fixtures, trusses, projectName, projectId\)/,
    'der Dialog gibt die Projekt-Kennung nicht mit — dann teilen zwei Projekte ihre Identitaeten');
  assert.match(dialog, /gdtfSpecNames\(/, 'die Kollisionen werden nicht ermittelt');
  // Nicht nur „der Aufruf steht da": er muss an der LISTE haengen. Ein
  // `{false && …}` liesse den Aufruf im Text stehen und zeigte trotzdem nie
  // etwas an — die Bauform, die diese Repos schon mehrfach hervorgebracht
  // haben.
  assert.match(dialog, /\{specKollisionen\.length > 0 && \(/, 'die Kollisionen stehen nirgends');
  assert.match(dialog, /specKollisionen\.map\(/);

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['identity:mvr'], 'identity:mvr fehlt in package.json');
}

console.log('OK mvr-identity-check: dieselbe Anlage ergibt dieselbe Datei, und zwei Typen teilen keinen Bezug.');
