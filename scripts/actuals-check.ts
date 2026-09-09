// Headless-Check zu Bedarf 56: das Ist mit einem Griff erfassen.
// Lauf: `npm run actuals:check`  (node --experimental-strip-types).
//
// Was hier zugesichert wird, und warum jede Regel einzeln steht:
//
//   1. Der Griff erfasst ueberhaupt etwas.
//   2. Der ZWEITE Griff ueberschreibt die erfasste Tatsache nicht — der
//      wahrscheinlichste Fehlbedienungsfall im Saal.
//   3. Ein Ende ohne Beginn wird GESCHRIEBEN und GEMELDET, nicht abgewiesen.
//   4. Der ausdrueckliche Weg (`korrigieren`) kann, was der Griff nicht darf.
//   4b. Was der Knopf gerade tut, sagt EIN Ort — und er bietet nach einem
//       Ende ohne Beginn keinen „Beginn" mehr an.
//   5. Die Umrechnung auf die Minuten-Achse nimmt den ERKLAERTEN Anker, wenn
//      es einen gibt, und sagt sonst, dass sie geraten hat.
//   6. Was `zeitachse` liefert, passt in `retime` — die beiden Module sind
//      aneinander geprueft und nicht nur je fuer sich.
//   7. „Nicht gemessen" ist nicht „null Minuten": weder bei der Dauer noch in
//      der Summe der Nachbetrachtung.
//   8. Im Modul steht keine Uhr.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  auswertung,
  erfassen,
  istDauer,
  korrigieren,
  naechsterGriff,
  zeitachse,
  type SceneActual,
} from '../src/core/actuals.ts';
import { retime, type OrderTiming } from '../src/core/retime.ts';

const T = (hhmm: string) => `2026-09-09T${hhmm}:00.000Z`;

// ─── 1. Der Griff erfasst ──────────────────────────────────────────────────
{
  const e = erfassen(undefined, 'start', T('19:00'));
  assert.equal(e.geaendert, true, 'ein leerer Eintrag muss den Beginn annehmen');
  assert.equal(e.actual.startedAt, T('19:00'), 'der erfasste Zeitpunkt ist der uebergebene');
  assert.equal(e.grund, 'erfasst');
  assert.equal(e.actual.endedAt, undefined, 'ein Beginn setzt kein Ende');
}

// ─── 2. Der zweite Griff ueberschreibt nicht ───────────────────────────────
{
  const erst = erfassen(undefined, 'start', T('19:00')).actual;
  const nochmal = erfassen(erst, 'start', T('19:07'));
  assert.equal(
    nochmal.actual.startedAt,
    T('19:00'),
    'der zweite Druck darf den erfassten Beginn nicht ueberschreiben',
  );
  assert.equal(nochmal.geaendert, false, 'und er muss melden, dass nichts passiert ist');
  assert.equal(nochmal.grund, 'schon-gestartet');

  const beendet = erfassen(erst, 'ende', T('19:20')).actual;
  const nochmalEnde = erfassen(beendet, 'ende', T('19:31'));
  assert.equal(nochmalEnde.actual.endedAt, T('19:20'), 'dasselbe fuer das Ende');
  assert.equal(nochmalEnde.geaendert, false);
  assert.equal(nochmalEnde.grund, 'schon-beendet');
}

// ─── 3. Ende ohne Beginn: geschrieben UND gemeldet ─────────────────────────
{
  const e = erfassen(undefined, 'ende', T('19:20'));
  assert.equal(
    e.actual.endedAt,
    T('19:20'),
    'die einzige noch zu habende Tatsache darf nicht verworfen werden',
  );
  assert.equal(e.geaendert, true);
  assert.equal(e.grund, 'ende-ohne-start', 'aber sie muss als unvollstaendig gemeldet werden');

  // Und der Widerspruch ist derselbe, den `retime` kennt -- er wird hier
  // gemeldet, nicht ein zweites Mal beurteilt.
  const achse = zeitachse({ a: e.actual }, T('19:00'));
  const r = retime([{ id: 'a', name: 'A' }], { a: { plannedMinutes: 10 } }, achse.actuals, 60);
  assert.ok(
    r.contradictions.some((c) => c.id === 'a' && c.reason === 'ended-without-start'),
    'retime muss denselben Fall als Widerspruch fuehren',
  );
}

// ─── 4. Korrigieren kann, was der Griff nicht darf ─────────────────────────
{
  const stand: SceneActual = { startedAt: T('19:00'), endedAt: T('19:20') };
  const verschoben = korrigieren(stand, 'start', T('18:55'));
  assert.equal(verschoben.startedAt, T('18:55'), 'der ausdrueckliche Weg setzt neu');
  assert.equal(verschoben.endedAt, T('19:20'), 'und fasst das andere Feld nicht an');

  const geloescht = korrigieren(stand, 'ende', null);
  assert.equal(geloescht.endedAt, undefined, 'null loescht');
  assert.ok(!('endedAt' in geloescht), 'und zwar das Feld, nicht nur seinen Wert');
  assert.equal(geloescht.startedAt, T('19:00'));
}

// ─── 4b. Was der eine Knopf gerade tut ─────────────────────────────────────
{
  assert.equal(naechsterGriff(undefined), 'start', 'unberuehrt: der Beginn');
  assert.equal(naechsterGriff({}), 'start', 'ein leerer Eintrag ist unberuehrt');
  assert.equal(naechsterGriff({ startedAt: T('19:00') }), 'ende', 'laeuft: das Ende');
  assert.equal(
    naechsterGriff({ startedAt: T('19:00'), endedAt: T('19:20') }),
    null,
    'fertig: nichts mehr zu greifen',
  );
  // Der gefaehrliche Fall: das Ende steht, der Beginn fehlt. Ein „Beginn"
  // hier truege den JETZIGEN Augenblick ein -- also einen nach dem Ende.
  assert.equal(
    naechsterGriff({ endedAt: T('19:20') }),
    null,
    'nach einem Ende ohne Beginn darf kein Beginn mehr angeboten werden',
  );
  // Und die Oberflaeche entscheidet das nicht selbst: sie fragt hier.
  const panel = readFileSync(new URL('../src/components/ScenePanel.tsx', import.meta.url), 'utf8');
  assert.ok(
    /naechsterGriff\s*\(/.test(panel),
    'ScenePanel muss `naechsterGriff` fragen statt die Regel nachzubauen',
  );
}

// ─── 5. Der Anker: erklaert schlaegt geraten ───────────────────────────────
{
  // Der erklaerte Anker liegt BEWUSST nicht auf der fruehesten Erfassung --
  // sonst gaeben beide Wege dieselbe Zahl, und die Probe wiese nichts nach.
  const actuals = {
    a: { startedAt: T('19:10'), endedAt: T('19:25') },
    b: { startedAt: T('19:25') },
  };

  const erklaert = zeitachse(actuals, T('19:00'));
  assert.equal(erklaert.herkunft, 'genannt');
  assert.equal(erklaert.anker, T('19:00'));
  assert.equal(erklaert.actuals.a.startedAt, 10, 'gemessen wird ab dem erklaerten Anker');
  assert.equal(erklaert.actuals.a.endedAt, 25);
  assert.equal(erklaert.actuals.b.startedAt, 25);

  const geraten = zeitachse(actuals);
  assert.equal(geraten.herkunft, 'erste-erfassung', 'ohne Anker muss die Herkunft es sagen');
  assert.equal(geraten.anker, T('19:10'), 'geraten wird die frueheste Erfassung');
  assert.equal(geraten.actuals.a.startedAt, 0, 'die liegt dann per Konstruktion auf 0');
  assert.equal(geraten.actuals.b.startedAt, 15);

  const leer = zeitachse({});
  assert.equal(leer.herkunft, 'keine');
  assert.equal(leer.anker, null);
  assert.deepEqual(leer.actuals, {}, 'ohne Erfassung gibt es nichts umzurechnen');

  // Ein Eintrag ohne jede Erfassung darf nicht als leeres Objekt auftauchen --
  // `retime` hielte ihn sonst fuer erfasst.
  const luecke = zeitachse({ a: { startedAt: T('19:10') }, b: {} }, T('19:00'));
  assert.ok(!('b' in luecke.actuals), 'ein unerfasster Eintrag steht nicht in der Achse');
}

// ─── 6. Die Achse passt in retime, und die Vorschau bewegt sich ────────────
{
  const items = [
    { id: 'a', name: 'Begruessung' },
    { id: 'b', name: 'Hauptteil' },
  ];
  const timing: Record<string, OrderTiming> = {
    a: { plannedMinutes: 10, changeoverMinutes: 5 },
    b: { plannedMinutes: 30 },
  };

  const nurPlan = retime(items, timing, {}, 0);
  // a: 0..10, Umbau 5, b: 15..45
  assert.equal(nurPlan.plannedFinish, 45);
  assert.equal(nurPlan.projectedFinish, 45, 'ohne Ist ist die Vorschau der Plan');

  // Erfasst: a lief zwoelf statt zehn Minuten.
  const actuals = { a: { startedAt: T('19:00'), endedAt: T('19:12') } };
  const achse = zeitachse(actuals, T('19:00'));
  const mitIst = retime(items, timing, achse.actuals, 12);
  assert.equal(
    mitIst.projectedFinish,
    47,
    'zwei Minuten Ueberzug muessen sich bis ans Ende durchschlagen',
  );
  assert.equal(mitIst.finishDeltaMinutes, 2);
  assert.equal(mitIst.plannedFinish, 45, 'und der Plan bleibt unangetastet daneben stehen');
}

// ─── 7. „Nicht gemessen" ist nicht „null Minuten" ──────────────────────────
{
  assert.equal(istDauer(undefined), null, 'gar nichts erfasst');
  assert.equal(istDauer({ startedAt: T('19:00') }), null, 'nur Beginn ist keine Dauer');
  assert.equal(istDauer({ endedAt: T('19:20') }), null, 'nur Ende ist keine Dauer');
  assert.equal(istDauer({ startedAt: T('19:00'), endedAt: T('19:20') }), 20);
  assert.equal(
    istDauer({ startedAt: T('19:20'), endedAt: T('19:00') }),
    null,
    'ein Ende vor dem Beginn ergibt keine Dauer, auch keine negative',
  );

  const items = [
    { id: 'block', name: 'Block' },
    { id: 'a', name: 'A', parentId: 'block' },
    { id: 'b', name: 'B', parentId: 'block' },
    { id: 'c', name: 'C' },
  ];
  const timing: Record<string, OrderTiming> = {
    block: { plannedMinutes: 99 },
    a: { plannedMinutes: 10 },
    b: { plannedMinutes: 20 },
    c: { plannedMinutes: 15 },
  };
  const actuals: Record<string, SceneActual> = {
    a: { startedAt: T('19:00'), endedAt: T('19:14') }, // 14, also +4
    b: { startedAt: T('19:20'), endedAt: T('19:38') }, // 18, also -2
    c: { startedAt: T('19:40') }, // nicht zu Ende erfasst
  };

  const aus = auswertung(items, timing, actuals);
  assert.deepEqual(
    aus.zeilen.map((z) => z.id),
    ['a', 'b', 'c'],
    'ein Eintrag mit Kindern zaehlt seine Minuten nicht noch einmal mit',
  );
  assert.equal(aus.gemessen, 2, 'zwei von drei Zeilen sind zu Ende erfasst');
  assert.equal(aus.abweichungBasis, 2, 'die dritte hat keine Abweichung, nicht die Abweichung 0');
  assert.equal(aus.abweichungSumme, 2, '+4 und -2, und die unfertige Zeile geht nicht ein');

  const offen = aus.zeilen.find((z) => z.id === 'c');
  assert.equal(offen?.istMinuten, null);
  assert.equal(offen?.abweichungMinuten, null, 'eine offene Zeile weicht nicht um 0 ab');
  assert.equal(offen?.planMinuten, 15, 'ihr Plan steht trotzdem da');

  // Ein Plan, den niemand erklaert hat, ist kein Plan von 0 Minuten.
  const ohnePlan = auswertung([{ id: 'x', name: 'X' }], {}, {
    x: { startedAt: T('19:00'), endedAt: T('19:05') },
  });
  assert.equal(ohnePlan.zeilen[0].planMinuten, null);
  assert.equal(ohnePlan.zeilen[0].istMinuten, 5);
  assert.equal(ohnePlan.zeilen[0].abweichungMinuten, null, 'ohne Plan gibt es keine Abweichung');
  assert.equal(ohnePlan.abweichungBasis, 0);
}

// ─── 8. Im Modul steht keine Uhr ───────────────────────────────────────────
{
  const quelle = readFileSync(new URL('../src/core/actuals.ts', import.meta.url), 'utf8');
  const ohneKommentare = quelle
    .split('\n')
    .filter((z) => !/^\s*(\/\/|\*|\/\*)/.test(z))
    .join('\n');
  // `new Date(wert)` ist eine Umrechnung und erlaubt; `new Date()` und
  // `Date.now()` sind das Ablesen einer Uhr und machen dasselbe Modul auf
  // zwei Rechnern verschieden.
  assert.ok(
    !/\bDate\.now\s*\(/.test(ohneKommentare),
    'Date.now() im Modul — der Zeitpunkt gehoert hereingegeben',
  );
  assert.ok(
    !/\bnew\s+Date\s*\(\s*\)/.test(ohneKommentare),
    'new Date() ohne Argument im Modul — dasselbe',
  );
  assert.ok(
    /new\s+Date\s*\(\s*ankerMs\s*\)/.test(ohneKommentare),
    'die Gegenprobe braucht die erlaubte Umrechnung — sonst prueft die Regel nichts',
  );
}

console.log(
  'OK actuals-check: ein Griff erfasst, ein zweiter ueberschreibt nichts, ' +
    'ein Ende ohne Beginn wird gemeldet statt verworfen, und was nicht ' +
    'gemessen wurde, zaehlt nirgends als null.',
);
