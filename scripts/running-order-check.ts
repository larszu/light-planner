// ───────────────────────────────────────────────────────────────────────────
// Der Ablauf ist ein Baum, keine Liste (Bedarf 132, P4).
// Lauf: `npm run order:check`
//
//   > Each song or segment carries its own sub-cues (intro, verse, chorus).
//   > Changing the setlist means MANUALLY REORDERING EVERY COMPONENT, not just
//   > the parents.
//
// Beleg: `cpvalente/ontime#204` (2022-09-15), seit vier Jahren offen. Die
// Empfehlung der Bedarfs-Datenbank ist eine über den Zeitpunkt: „A schedule
// data model should be a tree, not a list, FROM DAY ONE."
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. VERSCHIEBEN NIMMT DIE KINDER MIT. Das ist der ganze Bedarf. Wer den Song
//     verschiebt und die Teil-Stimmungen stehen lässt, hat die Handarbeit nur
//     verschoben — und beim Durchgang steht ein Chorus vor seinem Intro.
//
//  2. VERSCHIEBEN VERLÄSST DIE EIGENE EBENE NICHT. Eine Teil-Stimmung, die
//     beim Verschieben aus ihrem Song fällt, ist die verlorene Teil-Stimmung.
//     Ausrücken ist eine EIGENE Handlung.
//
//  3. AM RAND PASSIERT NICHTS. Der erste Eintrag nach oben ändert nichts — und
//     springt nicht ans andere Ende.
//
//  4. DIE NUMMER WIRD GERECHNET. „2", „2.1", „2.2" — eine gespeicherte Nummer
//     ist ab der ersten Verschiebung falsch, und zwar still.
//
//  5. EIN VERWAISTES KIND WIRD GENANNT, NICHT ENTSORGT. Es steht am Ende und
//     die Lücke wird gemeldet; verschwinden zu lassen wäre Datenverlust ohne
//     Meldung, wortlos hochzuziehen eine Behauptung über den Ablauf.
//
//  6. EIN KREIS IST UNMÖGLICH — und hängt auch die Ableitung nicht auf, wenn
//     einer doch in den Daten steht. Auch nicht bei der FRAGE nach einem
//     Eintrag, der selbst gar nicht im Kreis liegt.
//
//  6b. KEIN EINTRAG VERSCHWINDET, aus keinem Grund. Was unter einem Kreis
//     hängt, ist weder Waise noch selbst im Kreis — und fiel deshalb im
//     ersten Entwurf spurlos heraus. Geprüft wird die Zahl, nicht die Liste
//     der bekannten Fälle.
//
//  7. DERSELBE PLAN ERGIBT DIESELBE REIHENFOLGE. Ohne das zeigt das Panel eine
//     andere als das Papier.
//
//  8. DER WEG IST VERDRAHTET — und die Oberfläche baut weder das Verschieben
//     noch die Kreis-Prüfung nach.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CYCLE_REASON, MISSING_REASON, NO_PLACE, canParent, moveItem, runningOrder,
} from '../src/core/runningOrder.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/**
 * Quelltext OHNE Kommentare.
 *
 * Ein Waechter, den sein eigener Kommentar zufrieden stellt, prueft nichts.
 */
const ohneKommentare = (rel: string): string =>
  lies(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

interface Eintrag { id: string; name: string; parentId?: string }

const e = (id: string, parentId?: string): Eintrag => ({ id, name: id, parentId });

// Zwei Songs mit je zwei Teil-Stimmungen, absichtlich verschraenkt abgelegt:
// die Reihenfolge im Datensatz ist NICHT die des Ablaufs.
const setliste = (): Eintrag[] => [
  e('song1'), e('s1-intro', 'song1'),
  e('song2'), e('s2-intro', 'song2'), e('s2-chorus', 'song2'),
  e('s1-chorus', 'song1'),
];

const folge = (items: Eintrag[]): string[] =>
  runningOrder(items).rows.map((r) => r.item.id);

// ── 1. Verschieben nimmt die Kinder mit ────────────────────────────────────
{
  const vorher = folge(setliste());
  assert.deepEqual(vorher, ['song1', 's1-intro', 's1-chorus', 'song2', 's2-intro', 's2-chorus']);

  const nachher = folge(moveItem(setliste(), 'song2', 'up'));
  assert.deepEqual(nachher, ['song2', 's2-intro', 's2-chorus', 'song1', 's1-intro', 's1-chorus'],
    'der Song ist gewandert, seine Teil-Stimmungen sind stehengeblieben');

  // Und zurueck ist wieder der Anfang: das Verschieben ist umkehrbar.
  assert.deepEqual(folge(moveItem(moveItem(setliste(), 'song2', 'up'), 'song2', 'down')), vorher);
}

// ── 2. Verschieben verlaesst die eigene Ebene nicht ────────────────────────
{
  // Die erste Teil-Stimmung von Song 2 nach oben: sie steht schon vorn in
  // ihrer Ebene, also passiert NICHTS. Sie faellt insbesondere nicht in
  // Song 1 hinueber.
  const nachher = moveItem(setliste(), 's2-intro', 'up');
  assert.deepEqual(folge(nachher), folge(setliste()),
    'die Teil-Stimmung ist aus ihrem Song gefallen');
  for (const i of nachher) {
    const vorbild = setliste().find((v) => v.id === i.id)!;
    assert.equal(i.parentId, vorbild.parentId, `${i.id} hat den Elter gewechselt`);
  }

  // Innerhalb des Songs geht es dagegen sehr wohl.
  assert.deepEqual(folge(moveItem(setliste(), 's2-chorus', 'up')),
    ['song1', 's1-intro', 's1-chorus', 'song2', 's2-chorus', 's2-intro']);
}

// ── 3. Am Rand passiert nichts ─────────────────────────────────────────────
{
  assert.deepEqual(folge(moveItem(setliste(), 'song1', 'up')), folge(setliste()),
    'der erste Eintrag springt nach oben ans Ende');
  assert.deepEqual(folge(moveItem(setliste(), 'song2', 'down')), folge(setliste()),
    'der letzte Eintrag springt nach unten an den Anfang');
  // Und eine Kennung, die es nicht gibt, aendert ebenfalls nichts.
  assert.deepEqual(folge(moveItem(setliste(), 'gibtesnicht', 'up')), folge(setliste()));
}

// ── 4. Die Nummer wird gerechnet ───────────────────────────────────────────
{
  const rows = runningOrder(setliste()).rows;
  const nummern = Object.fromEntries(rows.map((r) => [r.item.id, r.number]));
  assert.deepEqual(nummern, {
    song1: '1', 's1-intro': '1.1', 's1-chorus': '1.2',
    song2: '2', 's2-intro': '2.1', 's2-chorus': '2.2',
  });
  // Nach dem Verschieben stimmt sie SOFORT — ohne dass jemand sie nachzieht.
  const nachher = runningOrder(moveItem(setliste(), 'song2', 'up')).rows;
  assert.equal(nachher.find((r) => r.item.id === 's2-intro')!.number, '1.1');
  assert.equal(nachher.find((r) => r.item.id === 's1-intro')!.number, '2.1');
  // Und die Tiefe stimmt mit der Nummer ueberein.
  for (const r of nachher.filter((x) => x.problem === null)) {
    assert.equal(r.depth, r.number.split('.').length - 1, `Tiefe passt nicht zu ${r.number}`);
  }
}

// ── 5. Ein verwaistes Kind wird genannt, nicht entsorgt ────────────────────
{
  // Song 1 geloescht — seine beiden Teil-Stimmungen haengen ins Leere.
  const ohneSong1 = setliste().filter((i) => i.id !== 'song1');
  const ab = runningOrder(ohneSong1);
  const ids = ab.rows.map((r) => r.item.id);
  assert.equal(ids.length, ohneSong1.length, 'ein Eintrag ist unterwegs verschwunden');
  assert.ok(ids.includes('s1-intro') && ids.includes('s1-chorus'));
  // Sie stehen HINTEN und tragen keine Nummer, die eine Stelle behauptet.
  for (const id of ['s1-intro', 's1-chorus']) {
    const row = ab.rows.find((r) => r.item.id === id)!;
    assert.equal(row.problem, 'orphan', `${id} sieht aus wie ein normaler Eintrag`);
    assert.notEqual(row.number, '1');
  }
  assert.ok(ab.rows.findIndex((r) => r.problem === 'orphan')
    > ab.rows.findIndex((r) => r.item.id === 'song2'));

  const luecke = ab.gaps.find((g) => g.kind === 'orphan');
  assert.ok(luecke, 'die Waisen fallen niemandem auf');
  assert.deepEqual(luecke.ids.sort(), ['s1-chorus', 's1-intro']);
  assert.match(luecke.message, /2 /);

  // Und ein vollstaendiger Ablauf meldet NICHTS: eine Warnung ohne Anlass
  // wird beim zweiten Mal weggeklickt und dann auch die mit Anlass.
  assert.deepEqual(runningOrder(setliste()).gaps, []);
}

// ── 6. Ein Kreis ist unmöglich ─────────────────────────────────────────────
{
  const items = setliste();
  // Direkt unter sich selbst.
  assert.equal(canParent(items, 'song1', 'song1').ok, false);
  assert.equal(canParent(items, 'song1', 'song1').reason, CYCLE_REASON);
  // Und ueber einen eigenen Nachfahren.
  assert.equal(canParent(items, 'song1', 's1-intro').ok, false);
  assert.equal(canParent(items, 'song1', 's1-intro').reason, CYCLE_REASON);
  // Was es nicht gibt, geht auch nicht — mit eigenem Grund.
  assert.equal(canParent(items, 'song1', 'gibtesnicht').reason, MISSING_REASON);
  assert.notEqual(CYCLE_REASON, MISSING_REASON);
  assert.ok(CYCLE_REASON.length > 60 && MISSING_REASON.length > 10);
  // Erlaubt bleibt, was erlaubt sein muss.
  assert.equal(canParent(items, 's2-intro', 'song1').ok, true);
  assert.equal(canParent(items, 's2-intro', null).ok, true);

  // Steht doch ein Kreis in den Daten, haengt die Ableitung nicht — sie
  // benennt ihn. Ein Waechter, der hier in eine Endlosschleife liefe, waere
  // schlimmer als keiner: er meldete nichts und lief ewig.
  const kreis: Eintrag[] = [e('a', 'b'), e('b', 'a'), e('c')];
  const ab = runningOrder(kreis);
  assert.equal(ab.rows.length, 3, 'im Kreis verschwindet ein Eintrag');
  assert.ok(ab.gaps.some((g) => g.kind === 'cycle'), 'der Kreis faellt nicht auf');
  assert.equal(ab.rows.find((r) => r.item.id === 'c')!.number, '1');

  // Und die FRAGE nach einem Eintrag, der selbst nicht im Kreis liegt, darf
  // ebenso wenig haengen: `canParent` laeuft die Elternkette des kuenftigen
  // Elters hoch, und die fuehrt hier im Kreis. Ohne die Abbruchbedingung
  // laeuft diese Zeile ewig — ein Waechter, der ewig laeuft, meldet nichts.
  assert.equal(canParent(kreis, 'c', 'a').ok, true);
}

// ── 6b. Kein Eintrag verschwindet ──────────────────────────────────────────
{
  // Der Fall, den der erste Entwurf verlor: `d` haengt unter `a`, und `a`
  // liegt im Kreis. `d` ist damit weder Waise (den Elter gibt es) noch selbst
  // im Kreis — und der Gang von oben erreicht es nie.
  const items: Eintrag[] = [e('a', 'b'), e('b', 'a'), e('d', 'a'), e('ok')];
  const ab = runningOrder(items);
  assert.equal(ab.rows.length, items.length,
    'ein Eintrag unter einem Kreis faellt spurlos aus der Liste');
  const d = ab.rows.find((r) => r.item.id === 'd')!;
  assert.notEqual(d.problem, null, 'der verlorene Eintrag sieht aus wie ein normaler');
  assert.equal(d.number, NO_PLACE);
  assert.ok(ab.gaps.some((g) => g.ids.includes('d')), 'niemand nennt ihn');
  assert.ok(NO_PLACE.length > 0, 'ohne Zeichen ist die Zelle leer und sagt nichts');

  // Die Zahl in der Meldung stammt aus derselben Rechnung wie die Zeilen.
  const genannt = new Set(ab.gaps.flatMap((g) => g.ids));
  const auffaellig = ab.rows.filter((r) => r.problem !== null).map((r) => r.item.id);
  assert.deepEqual([...genannt].sort(), [...auffaellig].sort(),
    'gemeldet wird etwas anderes als gezeigt');
}

// ── 7. Derselbe Plan, dieselbe Reihenfolge ─────────────────────────────────
{
  assert.deepEqual(folge(setliste()), folge(setliste()));
  // Die Reihenfolge INNERHALB einer Ebene ist die der Liste — und damit die,
  // die der Nutzer mit den Pfeilen aendert. Eine zweite, verborgene Ordnung
  // muesste jemand beim Verschieben mitpflegen, und genau das vergisst man.
  const umgestellt = [...setliste()].reverse();
  assert.notDeepEqual(folge(umgestellt), folge(setliste()));
}

// ── 8. Der Weg ist verdrahtet ──────────────────────────────────────────────
{
  const app = ohneKommentare('../src/App.tsx');
  assert.match(app, /moveItem\(prev, id, direction\)/,
    'das Verschieben ist in der App nachgebaut statt aus dem Kern geholt');
  assert.match(app, /if \(!canParent\(prev, id, parentId\)\.ok\) return prev/,
    'das Umhaengen fragt die Kreis-Pruefung nicht');

  const panel = ohneKommentare('../src/components/ScenePanel.tsx');
  assert.match(panel, /runningOrder\(scenes\)/, 'das Panel rechnet die Reihenfolge nicht');
  assert.match(panel, /ablauf\.rows\.map/, 'das Panel rendert wieder die rohe Liste');
  assert.match(panel, /ablauf\.gaps\.map/, 'das Panel verschweigt die Luecken');
  assert.match(panel, /onMoveScene\(s\.id, 'up'\)/);
  assert.match(panel, /onMoveScene\(s\.id, 'down'\)/);
  assert.match(panel, /canParent\(scenes, s\.id, vorgaenger\(s\.id\)\)\.ok/,
    'der Einrueck-Knopf bietet an, was nicht geht');
  // Die Nummer kommt aus der Ableitung und nicht aus dem Index der Schleife:
  // im GEZEICHNETEN Teil darf keine Schleife ueber die rohe Szenenliste
  // laufen, sonst stuende neben der abgeleiteten Reihenfolge eine zweite.
  //
  // 2026-09-09 GENAUER GEFASST. Hier stand `doesNotMatch(panel, ...)` ueber
  // die GANZE Datei — und das ist eine andere Frage als die, die der Guard
  // stellen will. Bedarf 56 brachte dem Panel eine Nachbetrachtung, die ueber
  // ALLE Szenen rechnet (`auswertung`) und dafuer zweimal `scenes.map`
  // braucht; gezeichnet wird davon nichts. Der Guard wurde daran rot, obwohl
  // die Aenderung richtig war.
  //
  // Ein Waechter, der an einer richtigen Aenderung rot wird, wird geaendert
  // statt gelesen — aber nicht abgeschwaecht: er misst jetzt die FRAGE (was
  // wird gezeichnet) statt eine Zeichenkette in ihrer Naehe. Gemessen wird
  // ab dem `return (` der Komponente; alles davor ist Rechnung, alles danach
  // ist Anzeige.
  const gezeichnet = panel.slice(panel.indexOf('return ('));
  assert.ok(gezeichnet.length > 500, 'der gezeichnete Teil wurde nicht gefunden');
  assert.doesNotMatch(gezeichnet, /scenes\.map\(\(s\)/,
    'im gezeichneten Teil laeuft noch eine Schleife ueber die rohe Szenenliste');

  assert.match(ohneKommentare('../src/types.ts'), /parentId\?: string;/,
    'die Szene traegt keinen Elter');
}

console.log('OK: der Ablauf ist ein Baum — verschieben nimmt die Kinder mit, Waisen werden genannt (Bedarf 132).');
