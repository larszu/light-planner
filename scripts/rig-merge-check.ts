// ───────────────────────────────────────────────────────────────────────────
// Zwei auseinandergelaufene Kopien desselben Rigs (Bedarf 138, P4).
// Lauf: `npm run merge:check`
//
//   > Designer exports a file, sends it to assistant or programmer, both edit
//   > independently. […] 'NO WAY to reconcile differences -> data loss or
//   > manual re-entry'.
//
// Belege: `jkarp7/showstack#38` (2025-12-28) und `#32`; strukturell garantiert
// vom Nicht-Ziel „no single source of truth" der MVR-xchange-Spezifikation.
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. OHNE GEMEINSAMEN STAND KEIN ABGLEICH. Fehlt der Ursprung, lässt sich
//     „neu angelegt" nicht von „gelöscht" unterscheiden — und die falsche der
//     beiden Antworten IST der Datenverlust aus dem Beleg. Geprüft wird, dass
//     das Modul absagt statt zu raten.
//
//  2. GELÖSCHT GEGEN GEÄNDERT IST EIN KONFLIKT. Genau hier entsteht der
//     Verlust: wer die Löschung still übernimmt, wirft die Arbeit der anderen
//     Seite weg.
//
//  3. EINIGKEIT IST KEINE FRAGE. Was beide gleich getan haben, taucht nicht
//     als Konflikt auf — sonst wird die Liste so lang, dass niemand sie liest,
//     und dann klickt jemand alles durch.
//
//  4. OHNE WAHL PASSIERT NICHTS. Ein Eintrag ohne Entscheidung lässt meine
//     Fassung stehen. Eine Vorbelegung wäre eine Entscheidung, die niemand
//     getroffen hat.
//
//  5. GANZE OBJEKTE, KEINE FELDER. Ein feldweise verschmolzenes Objekt hat es
//     auf keiner der beiden Seiten je gegeben.
//
//  6. WAS NICHT ANGEFASST WIRD, STEHT DA. Eine Zusammenführung, die schweigt,
//     wird für vollständig gehalten.
//
//  7. DER WEG IST VERDRAHTET.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MERGE_REFUSAL_LABEL,
  applyMerge,
  mergePlan,
  openCount,
  type MergeEntry,
  type MergePlan,
} from '../src/core/rigMerge.ts';
import type { PlacedFixture, ProjectData } from '../src/types.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const lampe = (id: string, kanal: number, x = 1): PlacedFixture => ({
  id,
  fixture: {
    id: 't-s4', name: 'Source Four 26', manufacturer: 'ETC', category: 'spot',
    wattage: 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp',
  },
  x, y: 2, mountingHeight: 6, aimX: 1, aimY: 3, bodyRotation: 0, dimming: 100,
  channel: kanal, unitNumber: String(kanal),
} as PlacedFixture);

const doc = (fixtures: PlacedFixture[], rest: Partial<ProjectData> = {}): ProjectData => ({
  meta: { name: 'Show', author: '', version: '1.0', createdAt: '', updatedAt: '' },
  fixtures, shapes: [], persons: [], stageElements: [], customFixtures: [],
  fixtureGroups: [], trusses: [], walls: [], ceilings: [], scenes: [],
  ...rest,
} as ProjectData);

const alsPlan = (p: MergePlan | { refusal: string }): MergePlan => {
  assert.ok(!('refusal' in p), `unerwartete Absage: ${'refusal' in p ? p.refusal : ''}`);
  return p as MergePlan;
};
const finde = (p: MergePlan, id: string): MergeEntry => {
  const e = p.entries.find((x) => x.id === id);
  assert.ok(e, `"${id}" steht nicht im Vorschlag: ${p.entries.map((x) => x.id).join(', ')}`);
  return e;
};

// ─── 1. Ohne gemeinsamen Stand kein Abgleich ───────────────────────────────
{
  const leer = doc([]);
  const p = mergePlan(leer, doc([lampe('a', 1)]), doc([lampe('b', 2)]));
  assert.ok('refusal' in p, 'ein leerer Stand wurde als Ursprung akzeptiert');
  assert.equal(p.refusal, 'empty-base');

  // Ein Stand, der mit keiner der beiden Fassungen ein Objekt teilt, ist
  // nicht ihr Ursprung — jeder Vorschlag daraus waere geraten.
  const fremd = mergePlan(doc([lampe('x', 9)]), doc([lampe('a', 1)]), doc([lampe('b', 2)]));
  assert.ok('refusal' in fremd);
  assert.equal(fremd.refusal, 'unrelated-base');

  // Und jede Absage hat einen Text, der sagt, was zu tun ist.
  for (const grund of ['empty-base', 'unrelated-base'] as const) {
    assert.ok(MERGE_REFUSAL_LABEL[grund].length > 40, grund);
  }

  // Teilt der Stand mit EINER Seite Objekte, ist er brauchbar: die andere
  // Seite kann alles geloescht und neu angelegt haben.
  const halb = mergePlan(doc([lampe('a', 1)]), doc([lampe('a', 1)]), doc([lampe('b', 2)]));
  assert.ok(!('refusal' in halb));
}

// ─── 2. Geloescht gegen geaendert ist ein Konflikt ─────────────────────────
{
  const base = doc([lampe('a', 1), lampe('b', 2)]);
  const mine = doc([lampe('a', 1)]);                       // ich habe b geloescht
  const theirs = doc([lampe('a', 1), lampe('b', 7)]);      // sie haben b umgepatcht
  const p = alsPlan(mergePlan(base, mine, theirs));
  assert.equal(finde(p, 'b').kind, 'conflict', 'die Loeschung haette die Arbeit der anderen Seite verworfen');

  // Umgekehrt genauso.
  const q = alsPlan(mergePlan(base, theirs, mine));
  assert.equal(finde(q, 'b').kind, 'conflict');

  // Eine Loeschung OHNE Gegenaenderung ist kein Konflikt, nur eine Frage.
  const r = alsPlan(mergePlan(base, mine, doc([lampe('a', 1), lampe('b', 2)])));
  assert.equal(finde(r, 'b').kind, 'removed');
  assert.equal(finde(r, 'b').side, 'mine');
}

// ─── 3. Einigkeit ist keine Frage ──────────────────────────────────────────
{
  const base = doc([lampe('a', 1)]);
  // Beide haben dieselbe Lampe gleich umgepatcht.
  const gleich = alsPlan(mergePlan(base, doc([lampe('a', 5)]), doc([lampe('a', 5)])));
  assert.equal(gleich.entries.length, 0, 'Einigkeit wurde als Unterschied gemeldet');

  // Beide haben dieselbe Lampe geloescht. Achtung: dann teilt KEINE Seite
  // mehr ein Objekt mit dem Stand — und trotzdem ist das ein gueltiger
  // Zustand und keine falsche Wahl des Standes. Ein Modul, das hier absagt,
  // saegt ausgerechnet dem Fall ab, in dem beide sich einig sind.
  const beideWeg = alsPlan(mergePlan(base, doc([]), doc([])));
  assert.equal(beideWeg.entries.length, 0);

  // Und was gar niemand angefasst hat, steht auch nicht drin.
  const nichts = alsPlan(mergePlan(base, doc([lampe('a', 1)]), doc([lampe('a', 1)])));
  assert.equal(nichts.entries.length, 0);

  // Verschieden geaendert ist dagegen sehr wohl ein Konflikt.
  const streit = alsPlan(mergePlan(base, doc([lampe('a', 5)]), doc([lampe('a', 9)])));
  assert.equal(finde(streit, 'a').kind, 'conflict');
  assert.ok(streit.entries[0].fields.length > 0, 'der Konflikt nennt kein einziges Feld');
}

// ─── 4. Ohne Wahl passiert nichts ──────────────────────────────────────────
{
  const base = doc([lampe('a', 1)]);
  const mine = doc([lampe('a', 5)]);
  const theirs = doc([lampe('a', 9), lampe('neu', 3)]);
  const p = alsPlan(mergePlan(base, mine, theirs));
  assert.equal(openCount(p.entries), p.entries.length, 'es gibt eine Vorbelegung');

  // Ohne Entscheidung bleibt alles, wie es hier ist.
  const ohne = applyMerge(mine, theirs, p.entries);
  assert.deepEqual(ohne.fixtures, mine.fixtures);

  // Mit Entscheidung genau das Gewaehlte — und nur das.
  const gewaehlt: MergeEntry[] = p.entries.map((e) =>
    (e.id === 'neu' ? { ...e, choice: 'theirs' as const } : e));
  const mit = applyMerge(mine, theirs, gewaehlt);
  assert.equal(mit.fixtures.length, 2);
  assert.equal(mit.fixtures.find((f) => f.id === 'a')?.channel, 5, 'die unentschiedene Lampe wurde mit uebernommen');
  assert.ok(mit.fixtures.some((f) => f.id === 'neu'));

  // „meine" waehlen aendert nichts — und loescht auch nichts.
  const meins = applyMerge(mine, theirs, p.entries.map((e) => ({ ...e, choice: 'mine' as const })));
  assert.deepEqual(meins.fixtures, mine.fixtures);

  // Eine geloeschte Lampe von der anderen Seite zu uebernehmen heisst,
  // sie hier ebenfalls zu entfernen.
  const weg = alsPlan(mergePlan(doc([lampe('a', 1)]), doc([lampe('a', 1)]), doc([])));
  const nachher = applyMerge(doc([lampe('a', 1)]), doc([]), weg.entries.map((e) => ({ ...e, choice: 'theirs' as const })));
  assert.equal(nachher.fixtures.length, 0);
}

// ─── 5. Ganze Objekte, keine Felder ────────────────────────────────────────
{
  const base = doc([lampe('a', 1, 1)]);
  const mine = doc([lampe('a', 5, 1)]);     // ich: Kanal 5
  const theirs = doc([lampe('a', 1, 9)]);   // sie: verschoben
  const p = alsPlan(mergePlan(base, mine, theirs));
  const ihres = applyMerge(mine, theirs, p.entries.map((e) => ({ ...e, choice: 'theirs' as const })));
  const f = ihres.fixtures[0];
  // Ihre Fassung, GANZ: Kanal 1 und x 9 — nicht Kanal 5 mit x 9. Ein
  // feldweise verschmolzenes Objekt hat es nirgends gegeben.
  assert.equal(f.channel, 1);
  assert.equal(f.x, 9);

  // Und die Quelle kennt keinen feldweisen Weg.
  const quelle = lies('../src/core/rigMerge.ts');
  assert.doesNotMatch(quelle, /mergeFields|fieldChoice|perField/,
    'es gibt einen feldweisen Weg — der erzeugt Objekte, die es nie gab');
}

// ─── 6. Was nicht angefasst wird, steht da ─────────────────────────────────
{
  const base = doc([lampe('a', 1)]);
  const p = alsPlan(mergePlan(
    base,
    doc([lampe('a', 5)], { scenes: [{ id: 's1' }] as never }),
    doc([lampe('a', 9)]),
  ));
  assert.ok(p.untouched.includes('Szenen'), 'die nicht angefassten Szenen werden verschwiegen');

  // Ohne Anlass keine Meldung: was es nicht gibt, wird nicht als Auslassung
  // behauptet.
  const ohne = alsPlan(mergePlan(base, doc([lampe('a', 5)]), doc([lampe('a', 9)])));
  assert.deepEqual(ohne.untouched, []);
}

// ─── 7. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = lies('../src/components/VersionDialog.tsx');
  assert.match(dialog, /mergePlan\(selected\.doc, currentDoc, licht\)/,
    'der gewaehlte Stand ist nicht der Ursprung des Abgleichs');
  assert.match(dialog, /applyMerge\(currentDoc, theirDoc, plan\.entries\)/, 'nichts wird uebernommen');
  assert.match(dialog, /MERGE_REFUSAL_LABEL\[p\.refusal\]/, 'die Absage bleibt stumm');
  assert.match(dialog, /type="file"/, 'es gibt keinen Weg, die andere Fassung zu laden');
  // Der Uebernehmen-Knopf ist gesperrt, solange niemand etwas gewaehlt hat.
  assert.match(dialog, /disabled=\{plan\.entries\.every\(\(e\) => !e\.choice\)\}/,
    'man kann uebernehmen, ohne etwas gewaehlt zu haben');

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['merge:check'], 'merge:check fehlt in package.json');
}

console.log('OK rig-merge-check: ein Vorschlag zum Durchgehen, keine Uebernahme — und ohne gemeinsamen Stand gar nichts.');
