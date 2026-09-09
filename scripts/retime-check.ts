// ───────────────────────────────────────────────────────────────────────────
// Den Ablauf aus dem Ist neu takten (Bedarf 53, P2 — und Bedarf 56).
// Lauf: `npm run retime:check`
//
//   > A schedule object that recalculates downstream times from actuals, with
//   > a preview of the resulting finish time, is THE SINGLE MOST-REQUESTED
//   > UNMET CAPABILITY FOUND. It is also why the running order lives in a
//   > spreadsheet: it is a calculation, not a record.
//
// `runningOrder.ts` hatte den Baum (Bedarf 132) und keine einzige Zeit.
//
// WAS HIER GEPRUEFT WIRD, und warum jede Zeile davon noetig ist:
//
//  1. DER PLAN BLEIBT STEHEN. Ohne ihn gaebe es kein „zwoelf Minuten hinten",
//     sondern nur ein neues Jetzt. Plan und Ist sind zwei Tatsachen.
//
//  2. EIN UEBERZOGENER EINTRAG SCHIEBT ALLES DAHINTER. Das ist der Bedarf.
//
//  3. DIE UMBAUPAUSE BLEIBT. „preserving changeover gaps" steht woertlich im
//     Bedarf, und es ist der Unterschied zwischen brauchbar und gefaehrlich:
//     wer die Restzeiten stumpf zusammenschiebt, plant einen Umbau in null
//     Minuten.
//
//  4. WAS LAEUFT, ENDET NICHT IN DER VERGANGENHEIT. Eine Vorhersage, die
//     schon vorbei ist, widerlegt sich selbst — und der Rest der Show haengt
//     daran.
//
//  5. DER BLOCK IST DIE SUMME SEINER TEILE, und zwar nur einmal gerechnet.
//     Eine eigene Dauer am Elter waere die zweite Antwort auf dieselbe Frage;
//     sie wird gemeldet statt bevorzugt.
//
//  6. DAS ENDE DER SHOW STEHT DA. Der Bedarf verlangt es ausdruecklich:
//     „preview of the resulting finish time".
//
//  7. WIDERSPRUECHE WERDEN GENANNT, NICHT GEHEILT. Ein Ende ohne Beginn sagt
//     nicht, wie lange etwas lief.
//
//  8. GERECHNET WIRD, NICHT UEBERNOMMEN. „show the consequence BEFORE
//     committing" — eine Funktion, die den Plan gleich umschreibt, hat die
//     Vorschau abgeschafft.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { retime, type OrderActual, type OrderTiming } from '../src/core/retime.ts';

const hier = dirname(fileURLToPath(import.meta.url));
const lies = (p: string) => readFileSync(join(hier, p), 'utf8');

type Item = { id: string; name: string; parentId?: string };
const el = (id: string, parentId?: string): Item => ({ id, name: id.toUpperCase(), parentId });

/** Drei Blöcke à 30 Minuten, dazwischen 10 Minuten Umbau. */
const show: Item[] = [el('a'), el('b'), el('c')];
const zeiten: Record<string, OrderTiming> = {
  a: { plannedMinutes: 30, changeoverMinutes: 10 },
  b: { plannedMinutes: 30, changeoverMinutes: 10 },
  // DER LETZTE EINTRAG TRAEGT BEWUSST EINE UMBAUPAUSE. Ohne sie war der
  // Waechter blind: eine Pause von 0 nach dem letzten Eintrag mitzuzaehlen
  // aendert nichts, und die Gegenprobe blieb gruen. Eine Pause liegt ZWISCHEN
  // zwei Dingen — nach dem letzten kommt nichts mehr, und das Ende der Show
  // darf sich nicht um einen Umbau verschieben, der nie stattfindet.
  c: { plannedMinutes: 30, changeoverMinutes: 12 },
};
const von = (r: ReturnType<typeof retime<Item>>, id: string) => {
  const row = r.rows.find((x) => x.item.id === id);
  assert.ok(row, `${id} fehlt in der Ausgabe`);
  return row;
};

// ─── 1. Ohne Ist ist die Vorhersage der Plan ───────────────────────────────
{
  const r = retime(show, zeiten, {}, 0);
  assert.equal(von(r, 'a').plannedStart, 0);
  assert.equal(von(r, 'b').plannedStart, 40, 'die Umbaupause fehlt im Plan');
  assert.equal(von(r, 'c').plannedStart, 80);
  assert.equal(r.plannedFinish, 110);
  assert.equal(r.projectedFinish, 110, 'ohne Ist darf die Vorhersage nicht vom Plan abweichen');
  assert.equal(r.finishDeltaMinutes, 0);
  for (const row of r.rows) assert.equal(row.state, 'upcoming');
}

// ─── 2. Ein ueberzogener Eintrag schiebt alles dahinter ────────────────────
{
  // A lief statt 30 volle 45 Minuten.
  const ist: Record<string, OrderActual> = { a: { startedAt: 0, endedAt: 45 } };
  const r = retime(show, zeiten, ist, 45);
  assert.equal(von(r, 'a').state, 'done');
  assert.equal(von(r, 'a').plannedEnd, 30, 'der Plan wurde vom Ist ueberschrieben');
  // GEMESSEN AN EINEM EINTRAG, DESSEN IST VOM PLAN ABWEICHT. Die erste
  // Fassung prueft A — und A begann planmaessig bei 0, also blieb der
  // Waechter gruen, als die Gegenprobe den Plan durch das Ist ersetzte. Ein
  // Wert, den beide Rechnungen zufaellig teilen, misst nichts.
  const spaet = retime(show, zeiten, { a: { startedAt: 0, endedAt: 45 }, b: { startedAt: 60 } }, 70);
  assert.equal(von(spaet, 'b').plannedStart, 40, 'der Plan von B wurde vom Ist ueberschrieben');
  assert.equal(von(spaet, 'b').projectedStart, 60);
  assert.equal(von(r, 'a').projectedEnd, 45);
  assert.equal(von(r, 'b').projectedStart, 55, 'B startet nicht 15 Minuten spaeter');
  assert.equal(von(r, 'b').deltaMinutes, 15);
  assert.equal(von(r, 'c').deltaMinutes, 15, 'die Verschiebung erreicht das Ende nicht');
  assert.equal(r.projectedFinish, 125);
  assert.equal(r.finishDeltaMinutes, 15, 'das Ende der Show verschiebt sich nicht mit');
}

// ─── 3. Die Umbaupause bleibt ──────────────────────────────────────────────
{
  const ist: Record<string, OrderActual> = { a: { startedAt: 0, endedAt: 45 } };
  const r = retime(show, zeiten, ist, 45);
  const luecke = von(r, 'b').projectedStart - von(r, 'a').projectedEnd;
  assert.equal(luecke, 10, 'der Umbau wurde beim Neutakten zusammengeschoben');
}

// ─── 4. Was laeuft, endet nicht in der Vergangenheit ───────────────────────
{
  // B laeuft seit Minute 55 und sollte 30 dauern — aber es ist schon Minute
  // 100. Ein vorhergesagtes Ende bei 85 waere eine Vorhersage, die schon
  // widerlegt ist, und C stuende auf einer Zahl aus der Vergangenheit.
  const ist: Record<string, OrderActual> = { a: { startedAt: 0, endedAt: 45 }, b: { startedAt: 55 } };
  const r = retime(show, zeiten, ist, 100);
  assert.equal(von(r, 'b').state, 'running');
  assert.equal(von(r, 'b').projectedEnd, 100, 'das laufende Stueck endet in der Vergangenheit');
  assert.equal(von(r, 'c').projectedStart, 110);

  // Und solange es NICHT ueberzogen ist, gilt die geplante Dauer.
  const frueh = retime(show, zeiten, ist, 60);
  assert.equal(von(frueh, 'b').projectedEnd, 85, 'die geplante Dauer wird ignoriert');
}

// ─── 5. Der Block ist die Summe seiner Teile — einmal gerechnet ────────────
{
  //
  // DAS LETZTE KIND TRAEGT HIER BEWUSST EINE UMBAUPAUSE. Ohne sie war der
  // Waechter blind: eine Pause von 0 nach dem letzten Kind mitzuzaehlen
  // aendert nichts, und die Gegenprobe blieb gruen. Die Pause NACH dem
  // letzten Teil liegt zwischen dem Block und dem, was danach kommt — sie
  // gehoert nicht in die Summe des Blocks, sonst waere er sieben Minuten zu
  // lang und `b` staende zweimal verschoben.
  const mitKindern: Item[] = [el('a'), el('a1', 'a'), el('a2', 'a'), el('b')];
  const z: Record<string, OrderTiming> = {
    a1: { plannedMinutes: 10, changeoverMinutes: 5 },
    a2: { plannedMinutes: 20, changeoverMinutes: 7 },
    a: { changeoverMinutes: 10 },
    b: { plannedMinutes: 30 },
  };
  const r = retime(mitKindern, z, {}, 0);
  assert.equal(von(r, 'a').plannedEnd, 35, 'der Block rechnet seine Kinder nicht zusammen');
  assert.equal(von(r, 'a2').plannedStart, 15, 'die Pause zwischen den Teilen fehlt');
  assert.equal(von(r, 'b').plannedStart, 45, 'die Pause nach dem Block fehlt');
  assert.deepEqual(r.contradictions, [], 'ohne Anlass wird ein Widerspruch behauptet');

  // Eine eigene Dauer am Elter ist die zweite Antwort auf dieselbe Frage.
  const doppelt = retime(mitKindern, { ...z, a: { plannedMinutes: 99, changeoverMinutes: 10 } }, {}, 0);
  assert.equal(von(doppelt, 'a').plannedEnd, 35, 'die eigene Dauer des Elters hat gewonnen');
  assert.equal(doppelt.contradictions.length, 1, 'der Widerspruch wird verschwiegen');
  assert.equal(doppelt.contradictions[0].reason, 'parent-has-own-duration');
  assert.equal(doppelt.contradictions[0].id, 'a');
}

// ─── 6. Widersprueche werden genannt, nicht geheilt ────────────────────────
{
  const r = retime(show, zeiten, { a: { endedAt: 45 } }, 45);
  assert.ok(
    r.contradictions.some((c) => c.reason === 'ended-without-start' && c.id === 'a'),
    'ein Ende ohne Beginn geht durch',
  );
  const rueckwaerts = retime(show, zeiten, { a: { startedAt: 40, endedAt: 10 } }, 50);
  assert.ok(
    rueckwaerts.contradictions.some((c) => c.reason === 'ended-before-start'),
    'ein Ende vor dem Beginn geht durch',
  );
  // Und es kippt die Rechnung nicht: die Vorhersage bleibt benutzbar.
  assert.equal(typeof rueckwaerts.projectedFinish, 'number');
}

// ─── 7. Gerechnet, nicht uebernommen ───────────────────────────────────────
{
  const eingabe: Record<string, OrderTiming> = JSON.parse(JSON.stringify(zeiten));
  const vorher = JSON.stringify(eingabe);
  const items = show.map((i) => ({ ...i }));
  retime(items, eingabe, { a: { startedAt: 0, endedAt: 45 } }, 45);
  assert.equal(JSON.stringify(eingabe), vorher, 'die Neutaktung hat den Plan umgeschrieben');
  assert.deepEqual(items, show, 'die Neutaktung hat die Eintraege veraendert');

  // Die Quelle sagt es auch: keine Uhr im Modul.
  const src = lies('../src/core/retime.ts');
  const code = src
    .split('\n')
    .filter((z) => !/^\s*(\/\/|\*|\/\*)/.test(z))
    .join('\n');
  assert.doesNotMatch(code, /Date\.now\(\)|new Date\(/, 'das Modul hat eine eigene Uhr');
}

// ─── 8. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['retime:check'], 'retime:check fehlt in package.json');
  // Dass der Lauf auch im CI-Workflow steht, prueft `ci:complete` — fuer JEDEN
  // `*:check`, aus einer gerechneten Liste. Hier eine zweite Pruefung
  // aufzuschreiben waere die zweite Rechnung derselben Frage, und die
  // aufgezaehlte Fassung waere die, die beim naechsten Lauf veraltet.
  assert.ok(pkg.scripts?.['ci:complete'], 'ci:complete fehlt — dann prueft niemand den Workflow');
}

console.log('OK retime-check: aus dem Ist gerechnet, mit Umbaupausen, als Vorschau — nicht uebernommen.');
