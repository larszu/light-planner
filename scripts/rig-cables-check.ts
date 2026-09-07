// ───────────────────────────────────────────────────────────────────────────
// Kabel und Steckverbinder als eigene Daten (Bedarf 140, P4).
// Lauf: `npm run cables:check`
//
//   > MVR has NO CABLE ENTITY. Two open spec requests: cables with
//   > cross-sectional area, LENGTH, type and CONNECTION MAPPING; and Wiring
//   > Object / Pin Patch in the node ChildList because „individual cables and
//   > the connections need to be specified in the MVR file".
//
// Belege: `mvrdevelopment/spec#296` (offen, 2026-01-27) und `#288` (offen,
// 2025-10-20).
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. DIE KETTE FOLGT DER TRAVERSE. Eine Liste, die nach Kanal ordnet, ergibt
//     einen Weg, der am Haken hin- und herspringt — und eine Längensumme, die
//     niemand nachmisst.
//
//  2. WO DIE KETTE BRICHT, ENTSCHEIDET DER KREIS UND DAS UNIVERSE — nicht
//     dieses Modul. Zwei Regeln über dieselbe Anlage ergäben eine Kabelliste,
//     die eine Kette zeigt, die es am Verteiler nicht gibt.
//
//  3. DIE ZULEITUNG HAT KEINE LÄNGE, UND DAS BLEIBT SO. Der Plan stellt weder
//     Verteiler noch Nodes auf. Eine Zahl wäre erfunden, und zwar an der
//     Stelle, an der das Kabel am längsten ist.
//
//  4. DIE SUMME VERSCHWEIGT DAS NICHT. Wer die Zuleitungen stillschweigend mit
//     null Metern mitzählt, bestellt genau um das längste Kabel zu wenig.
//
//  5. WOFÜR KEIN WEG ENTSTEHT, WIRD GENANNT — gerechnet, nicht aufgezählt.
//
//  6. DERSELBE PLAN ERGIBT ZWEIMAL DIESELBE LISTE. Ohne totale Ordnung tauschen
//     zwei Leuchten am selben Punkt zwischen zwei Ausgaben die Plätze, und der
//     Stempel (ADR-004) beschreibt zwei verschiedene Dokumente.
//
//  7. DIE AUSLASSUNGS-LISTE NENNT KABEL UND KREISE. Beides rechnet dieser Plan
//     aus, beides trägt das MVR-Format nicht — und eine Ehrlichkeits-Liste, die
//     das verschweigt, ist der Kenntnisstand ihres Autors und keine Auskunft.
//
//  8. DER WEG IST VERDRAHTET. Dass dieser Waechter im CI laeuft, prueft
//     `ci:complete` — an einer Stelle, fuer alle Laeufe.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CABLE_HEADERS, KIND_LABEL, LENGTH_BASIS_NOTE, NOT_SET, cableGaps, cableRuns, cableTable,
  cableTotals,
} from '../src/core/rigCables.ts';
import { mvrOmissions } from '../src/core/fixtureGroups.ts';
import { CIRCUIT_AMPS, MAINS_VOLTAGE } from '../src/core/powerDistribution.ts';
import type { PlacedFixture, Truss } from '../src/types.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/**
 * Quelltext OHNE Kommentare.
 *
 * Ein Waechter, den sein eigener Kommentar zufrieden stellt, prueft nichts:
 * die Begruendung zitiert die Bauform, die sie verbietet.
 */
const ohneKommentare = (rel: string): string =>
  lies(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

// ── Testrig ────────────────────────────────────────────────────────────────
// Eine Traverse und vier Leuchten daran — absichtlich in einer anderen
// Reihenfolge im Datensatz als auf der Traverse.

// Die Traverse laeuft RECHTS nach LINKS. Das ist kein Zufall: liefe sie in
// x-Richtung, waere „der Reihe nach auf der Traverse" nicht von „nach
// x-Koordinate sortiert" zu unterscheiden — und eine Gegenprobe, die die
// Traversen-Ordnung ausbaut, bliebe gruen.
const traverse: Truss = { id: 't1', x1: 12, y1: 4, x2: 0, y2: 4, height: 6, label: 'FOH' };

let lauf = 0;
const lampe = (
  x: number, opts: Partial<PlacedFixture> & { watt?: number } = {},
): PlacedFixture => {
  lauf += 1;
  const { watt, ...rest } = opts;
  return {
    id: `f${lauf}`,
    fixture: {
      id: 'par64', name: 'PAR 64', manufacturer: 'Thomann', category: 'par',
      wattage: watt ?? 1000, lumens: 20000, beamAngle: 12, fieldAngle: 24,
      beamShape: 'circular', beamRatioWH: 1, lensType: 'none', colorTemp: 3200,
      weight: 3, mountType: 'clamp', powerConnector: 'Schuko', dmxChannels: 1,
    },
    x, y: 4, mountingHeight: 6,
    aimX: x, aimY: 0, bodyRotation: 0, dimming: 100,
    channel: lauf, universe: 1, dmxAddress: lauf,
    ...rest,
  } as PlacedFixture;
};

// ── 1. Die Kette folgt der Traverse ────────────────────────────────────────
{
  lauf = 0;
  // Datensatz-Reihenfolge: 9 m, 0 m, 6 m, 3 m. Auf der Traverse: 0, 3, 6, 9.
  const rig = [lampe(9), lampe(0), lampe(6), lampe(3)];
  const wege = cableRuns(rig, [traverse]).filter((r) => r.kind === 'power');

  const kette = wege.map((r) => r.to.fixtureId);
  // Die Traverse faengt bei x = 12 an: f1 (9 m) liegt ihr am naechsten, f2
  // (0 m) am fernsten. Nach x sortiert kaeme genau die umgekehrte Kette
  // heraus — daran haengt die ganze Zusicherung.
  assert.deepEqual(kette, ['f1', 'f3', 'f4', 'f2'],
    'die Kette folgt nicht der Traverse, sondern dem Datensatz');

  // Und die Laengen sind die echten Abstaende: 3 m von Nachbarin zu Nachbarin.
  const mitLaenge = wege.filter((r) => r.lengthM != null);
  for (const r of mitLaenge) {
    assert.equal(r.lengthM, 3, `Abstand falsch gerechnet: ${r.id} -> ${r.lengthM}`);
  }

  // Die Hoehe zaehlt mit. Zwei Leuchten 3 m auseinander, aber 4 m
  // uebereinander, brauchen 5 m Kabel und nicht 3 — und der Unterschied ist
  // genau der, der beim Bestellen fehlt.
  lauf = 0;
  const hoch = [
    lampe(0, { watt: 100 }),
    lampe(3, { mountingHeight: 10, watt: 100 }),
  ];
  const schraeg = cableRuns(hoch, [traverse])
    .filter((r) => r.kind === 'power' && r.lengthM != null);
  assert.equal(schraeg.length, 1);
  assert.equal(schraeg[0].lengthM, 5, 'die Hoehe faellt aus der Laenge heraus');
}

// ── 1b. Ohne Traverse wird keine Kette erfunden ────────────────────────────
{
  lauf = 0;
  // Zwei Stative weit weg von jeder Traverse. Sie stehen nebeneinander, aber
  // NICHT an einem gemeinsamen Traeger: es gibt keine Nachbarin, an die man
  // sich haengen koennte. Eine Kette waere hier eine Behauptung ueber den
  // Aufbau, die niemand aufgestellt hat.
  const stative = [
    lampe(2, { y: 20, watt: 100 }),
    lampe(4, { y: 20, watt: 100 }),
  ];
  const wege = cableRuns(stative, [traverse]).filter((r) => r.kind === 'power');
  assert.equal(wege.length, 2);
  for (const r of wege) {
    assert.equal(r.from.kind, 'source',
      'freistehende Leuchten werden zu einer Kette verbunden, die es nicht gibt');
    assert.equal(r.lengthM, null);
    assert.equal(r.trussLabel, null, 'ein Stativ bekommt eine Traverse angedichtet');
  }
}

// ── 2. Wo die Kette bricht, entscheidet der Kreis ──────────────────────────
{
  lauf = 0;
  // Zwei Leuchten, deren Leistung zusammen einen 16-A-Kreis sprengt: die
  // Verteilung MUSS sie trennen, und die Kabelliste muss dieselbe Trennung
  // zeigen. Ein Kreis traegt 16 A x 230 V.
  const zuViel = CIRCUIT_AMPS * MAINS_VOLTAGE;
  const rig = [lampe(0, { watt: zuViel }), lampe(3, { watt: zuViel })];
  const strom = cableRuns(rig, [traverse]).filter((r) => r.kind === 'power');
  assert.equal(strom.length, 2);
  for (const r of strom) {
    assert.equal(r.from.kind, 'source',
      'zwei volle Kreise, aber die Kabelliste haengt sie aneinander');
  }

  // Umgekehrt: dieselbe Anordnung mit kleiner Last bleibt EINE Kette.
  lauf = 0;
  const klein = [lampe(0, { watt: 100 }), lampe(3, { watt: 100 })];
  const kette = cableRuns(klein, [traverse]).filter((r) => r.kind === 'power');
  assert.equal(kette.filter((r) => r.from.kind === 'source').length, 1,
    'ein Kreis, aber die Liste zieht zwei Zuleitungen');

  // Dasselbe fuer Daten am Universe.
  lauf = 0;
  const zweiUniverses = [lampe(0, { universe: 1 }), lampe(3, { universe: 2 })];
  const daten = cableRuns(zweiUniverses, [traverse]).filter((r) => r.kind === 'data');
  assert.equal(daten.filter((r) => r.from.kind === 'source').length, 2,
    'zwei Universes, aber nur eine Datenleitung');
}

// ── 3. Die Zuleitung hat keine Laenge ──────────────────────────────────────
{
  lauf = 0;
  const rig = [lampe(0, { watt: 100 }), lampe(3, { watt: 100 })];
  const wege = cableRuns(rig, [traverse]);
  const zuleitungen = wege.filter((r) => r.from.kind === 'source');
  assert.ok(zuleitungen.length > 0);
  for (const r of zuleitungen) {
    assert.equal(r.lengthM, null,
      'die Zuleitung traegt eine Laenge — der Plan stellt keine Verteiler auf');
  }
  // Und auf dem Blatt steht dort ein Zeichen, keine Null.
  const tb = cableTable(wege);
  const zeile = tb.rows.find((r) => r[1].startsWith('Verteiler'))!;
  assert.equal(zeile[4], NOT_SET, 'die fehlende Laenge wird zur Zahl');
  assert.ok(NOT_SET.length > 0, 'ohne Zeichen ist die Zelle leer und sagt nichts');
  assert.deepEqual(tb.header, [...CABLE_HEADERS]);
  assert.ok(LENGTH_BASIS_NOTE.length > 80 && /Untergrenze/.test(LENGTH_BASIS_NOTE),
    'die Grundlage der Laengen wird nicht genannt');
}

// ── 4. Die Summe verschweigt das nicht ─────────────────────────────────────
{
  lauf = 0;
  const rig = [lampe(0, { watt: 100 }), lampe(3, { watt: 100 }), lampe(9, { watt: 100 })];
  const wege = cableRuns(rig, [traverse]);
  const summen = cableTotals(wege);
  const strom = summen.find((s) => s.kind === 'power')!;

  assert.equal(strom.runs, 3);
  // 0 -> 3 -> 9: drei plus sechs Meter. Die Zuleitung zaehlt NICHT mit.
  assert.equal(strom.metres, 9);
  assert.equal(strom.unknown, 1, 'die Zuleitung fehlt in der Zaehlung des Unbekannten');
  assert.ok(summen.every((s) => s.runs === s.unknown + wege.filter((r) => r.kind === s.kind && r.lengthM != null).length),
    'Wege ohne Laenge und mit Laenge ergeben zusammen nicht alle Wege');
  assert.deepEqual(Object.keys(KIND_LABEL).sort(), ['data', 'power'],
    'eine Art ohne Beschriftung erscheint als leere Spalte');
}

// ── 5. Was keinen Weg bekommt, wird genannt ────────────────────────────────
{
  lauf = 0;
  const rig = [lampe(0, { watt: 100 }), lampe(3, { universe: undefined, watt: 100 })];
  const wege = cableRuns(rig, [traverse]);
  const luecken = cableGaps(rig, wege);
  const ohneUniverse = luecken.find((l) => l.kind === 'no-universe');
  assert.ok(ohneUniverse, 'die Leuchte ohne Universe faellt nicht auf');
  assert.equal(ohneUniverse.count, 1);
  assert.match(ohneUniverse.message, /1 /);

  // Und ein vollstaendiger Plan meldet nichts: eine Warnung ohne Anlass wird
  // beim zweiten Mal weggeklickt und dann auch die mit Anlass.
  lauf = 0;
  const voll = [lampe(0, { watt: 100 }), lampe(3, { watt: 100 })];
  assert.deepEqual(cableGaps(voll, cableRuns(voll, [traverse])), []);
}

// ── 6. Derselbe Plan, dieselbe Liste ───────────────────────────────────────
{
  lauf = 0;
  // Zwei Leuchten am GENAU selben Punkt: nur die id unterscheidet sie noch.
  const a = lampe(5, { watt: 100 });
  const b = lampe(5, { watt: 100 });
  const einmal = cableRuns([a, b], [traverse]).map((r) => r.id);
  const nochmal = cableRuns([b, a], [traverse]).map((r) => r.id);
  assert.deepEqual(einmal, nochmal,
    'dieselben Leuchten in anderer Eingabereihenfolge ergeben eine andere Liste');
}

// ── 7. Die Auslassungs-Liste nennt Kabel und Kreise ────────────────────────
{
  lauf = 0;
  const rig = [lampe(0, { watt: 100 }), lampe(3, { watt: 100 })];
  const o = mvrOmissions(rig, [traverse], [], 0);
  const arten = o.map((x) => x.kind);
  assert.ok(arten.includes('cables'), 'MVR traegt keine Kabel, und niemand sagt es');
  assert.ok(arten.includes('circuits'), 'MVR traegt keine Kreise, und niemand sagt es');

  const kabel = o.find((x) => x.kind === 'cables')!;
  assert.equal(kabel.count, cableRuns(rig, [traverse]).length,
    'die genannte Zahl stammt nicht aus derselben Rechnung wie die Liste');
  assert.match(kabel.message, /Kabelliste/);

  // Ein leerer Plan meldet auch hier nichts.
  const leer = mvrOmissions([], [], [], 0).map((x) => x.kind);
  assert.ok(!leer.includes('cables') && !leer.includes('circuits'),
    'der leere Plan meldet Auslassungen, die es nicht gibt');
}

// ── 8. Der Weg ist verdrahtet ──────────────────────────────────────────────
{
  const dialog = ohneKommentare('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /cableRuns\(fixtures, trusses, phaseTemplate\)/,
    'der Dialog rechnet die Wege nicht aus dem Plan');
  assert.match(dialog, /cableTotals\(kabelWege\)/, 'die Summen fehlen');
  assert.match(dialog, /cableGaps\(fixtures, kabelWege\)/, 'die Luecken fehlen');
  assert.match(dialog, /LENGTH_BASIS_NOTE/,
    'die Grundlage der Laengen steht nicht am Blatt');
  assert.match(dialog, /'kabelliste\.csv'/, 'die Liste laesst sich nicht ausgeben');
  // Der Export geht ueber `exportTable` und traegt damit denselben Stempel wie
  // die anderen Blaetter (ADR-004) — ein eigener Download-Weg umginge ihn.
  assert.match(dialog, /exportTable\(\s*'kabelliste\.csv'/,
    'die Kabelliste geht an der Stempel-Engstelle vorbei');

  // Dass DIESER Waechter im CI laeuft, prueft `ci:complete` — an EINER
  // Stelle, fuer alle Laeufe. Hier stand die Zusicherung ein zweites Mal,
  // und zwei Orte fuer dieselbe Regel heisst: einer wird irgendwann
  // vergessen. Nebenwirkung war, dass die Datei den Workflow-Pfad des
  // eigenstaendigen Planers las und in der vendorierten Fassung deshalb
  // gar nicht lief.
}

console.log('OK: Kabelwege — Kette an der Traverse, Bruch am Kreis, Zuleitung ohne erfundene Laenge (Bedarf 140).');
