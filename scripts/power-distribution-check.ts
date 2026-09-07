// ───────────────────────────────────────────────────────────────────────────
// Kreise, Phasen und Steckreihenfolge (Bedarf 141, P4).
// Lauf: `npm run power:check`
//
//   > […] services feeding racks, AB/AC/ABC PHASE TEMPLATES, PER-PHASE LOAD,
//   > and POINT-CIRCUIT PLUG-ORDER NOTATION ('Circuit 3-2').
//
// Belege: `mvrdevelopment/spec#158` (geschlossen 2024-08-08, Auflösung
// unbestätigt), `jkarp7/showstack#41` und `#39` (beide 2025-12-28).
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. DIE PHASE HÄNGT AM STECKPLATZ. Ein Distro verdrahtet seine Ausgänge
//     reihum. Wer den vierten Ausgang steckt, bekommt L1 — nicht, weil das
//     klug wäre, sondern weil dort L1 anliegt. Ein Planer, der Phasen frei
//     zuteilt, plant ein Steckfeld, das niemand nachbauen kann.
//
//  2. JEDES DISTRO FÄNGT VON VORN AN. Liefe die Phase über ALLE Kreise
//     durch, sähe das zweite Distro eine andere Phasenfolge als das erste —
//     und das Blatt beschriebe ein Gerät, das es nicht gibt.
//
//  3. DIE VORLAGE ENTSCHEIDET, WELCHE PHASEN ES GIBT. Bei `A` liegt alles
//     auf L1. Eine Prüfung, die dort trotzdem durch drei teilt, meldet zwei
//     Drittel der Last als nicht vorhanden.
//
//  4. DIE ANNAHME WIRD BENANNT, NICHT ERSETZT. `totalWatts / (3 * 230)` ist
//     die Last einer AUSGEGLICHENEN Anlage. Sie ist nie grösser als die
//     schwerste Phase — genau deshalb ist sie gefährlich, und genau deshalb
//     steht sie jetzt DANEBEN und nicht mehr an ihrer Stelle.
//
//  5. „3-2" IST DIE BEZEICHNUNG, DIE JEMAND WIEDERFINDET. Distro 3,
//     Ausgang 2. „Kreis 14" sagt niemandem, wo er steht.
//
//  6. EIN GERÄT, DAS IN KEINEN KREIS PASST, FÄLLT AUF. `circuitBreakdown`
//     legt es allein in einen Kreis — der liegt dann ÜBER dem Budget, weil
//     ein Gerät sich nicht teilen lässt. Die Kreis-Zahl stimmt dabei, und
//     genau deshalb fällt es sonst niemandem auf.
//
//  7. DIE ANGABE ÜBERLEBT DAS SPEICHERN (vier ProjectData-Bauplätze, ADR-005).
//
//  8. DER WEG IST VERDRAHTET.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CIRCUIT_AMPS, CIRCUIT_HEADERS, DEFAULT_TEMPLATE, MAINS_VOLTAGE, OUTLETS_PER_DISTRO,
  PHASE_HEADERS, PHASE_LABEL, TEMPLATE_LABEL, TEMPLATE_PHASES, circuitByFixture, circuitLabel,
  circuitTable, distributionFor, distributionPlan, parseCircuitLabel, phaseTable, plugOrder,
  type PhaseTemplate,
} from '../src/core/powerDistribution.ts';
import { CIRCUIT_WATTS, circuitBreakdown, computePower } from '../src/core/patch.ts';
import { rigCheck } from '../src/core/rigCheck.ts';
import type { FixtureCategory, PlacedFixture } from '../src/types.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/**
 * Quelltext OHNE Kommentare.
 *
 * Wer eine abgeschaffte Bauform verbietet, muss sie in der Begruendung
 * zitieren duerfen — sonst steht im Code kein Wort mehr darueber, warum sie
 * weg ist. Also erst die Kommentare weg, dann pruefen.
 */
const ohneKommentare = (rel: string): string =>
  lies(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const lampe = (id: string, watt: number, category: FixtureCategory = 'profile'): PlacedFixture => ({
  id,
  fixture: {
    id: 't', name: 'Testgeraet', manufacturer: 'ETC', category,
    wattage: watt, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp',
  },
  x: 1, y: 2, mountingHeight: 6, aimX: 1, aimY: 3, bodyRotation: 0, dimming: 100,
  channel: 1, unitNumber: '1',
} as PlacedFixture);

/** n Kreise zu je `watt` Watt — ohne Umweg ueber Leuchten. */
const kreise = (n: number, watt = 1000) =>
  Array.from({ length: n }, (_, i) => ({
    index: i + 1, watts: watt, fixtureCount: 1, utilization: watt / CIRCUIT_WATTS,
    fixtureIds: [`k${i + 1}`],
  }));

// ─── 1. Die Phase haengt am Steckplatz ─────────────────────────────────────
{
  const a = plugOrder(kreise(6), 'ABC');
  assert.deepEqual(a.map((x) => x.phase), ['L1', 'L2', 'L3', 'L1', 'L2', 'L3']);
  // Und die Ausgaenge zaehlen ab 1, nicht ab 0: an einem Distro steht keine 0.
  assert.deepEqual(a.map((x) => x.outlet), [1, 2, 3, 4, 5, 6]);
  assert.ok(a.every((x) => x.distro === 1));

  // Zwei Phasen: reihum ueber genau zwei.
  assert.deepEqual(plugOrder(kreise(4), 'AB').map((x) => x.phase), ['L1', 'L2', 'L1', 'L2']);
  assert.deepEqual(plugOrder(kreise(4), 'AC').map((x) => x.phase), ['L1', 'L3', 'L1', 'L3']);
  // Einphasig: alles auf L1, und zwar wirklich alles.
  assert.ok(plugOrder(kreise(7), 'A').every((x) => x.phase === 'L1'));
}

// ─── 2. Jedes Distro faengt von vorn an ────────────────────────────────────
{
  // Sieben Kreise auf Distros zu sechs Ausgaengen: der siebte ist 2-1.
  const a = plugOrder(kreise(7), 'ABC', 6);
  assert.equal(circuitLabel(a[6]), '2-1');
  // UND ER LIEGT AUF L1. Liefe die Phase ueber alle Kreise durch, laege der
  // siebte auf L1 nur zufaellig -- bei einem Distro mit vier Ausgaengen waere
  // es L2, und das Blatt beschriebe ein Geraet, das es nicht gibt.
  assert.equal(a[6].phase, 'L1');
  const vier = plugOrder(kreise(5), 'ABC', 4);
  assert.equal(circuitLabel(vier[4]), '2-1');
  assert.equal(vier[4].phase, 'L1', 'die Phasenfolge laeuft ueber die Distro-Grenze hinweg');
  // Der erste Ausgang jedes Distros traegt dieselbe Phase wie der erste des
  // ersten -- das ist es, was „von vorn anfangen" heisst.
  for (const proDistro of [2, 3, 4, 6, 8]) {
    const b = plugOrder(kreise(proDistro * 3), 'ABC', proDistro);
    const ersten = b.filter((x) => x.outlet === 1).map((x) => x.phase);
    assert.deepEqual([...new Set(ersten)], ['L1'], `Distro-Groesse ${proDistro}`);
  }
}

// ─── 3. Die Vorlage entscheidet, welche Phasen es gibt ─────────────────────
{
  for (const [vorlage, phasen] of Object.entries(TEMPLATE_PHASES) as [PhaseTemplate, readonly string[]][]) {
    const plan = distributionPlan(kreise(6), vorlage);
    assert.deepEqual(plan.phases.map((p) => p.phase), [...phasen], vorlage);
    assert.equal(plan.phases.length, phasen.length);
    assert.ok(TEMPLATE_LABEL[vorlage].length > 3);
  }
  // Auch eine Phase OHNE Last bekommt eine Zeile. Eine fehlende Zeile liesse
  // offen, ob dort nichts liegt oder ob niemand nachgesehen hat — und wer
  // umverteilen will, sucht genau die leere Phase.
  const einKreis = distributionPlan(kreise(1, 3000), 'ABC');
  assert.equal(einKreis.phases.length, 3, 'die leeren Phasen sind aus der Tabelle gefallen');
  assert.deepEqual(einKreis.phases.map((p) => p.watts), [3000, 0, 0]);
  assert.deepEqual(einKreis.phases.map((p) => p.circuits), [1, 0, 0]);
  assert.equal(phaseTable(einKreis).rows.length, 3);

  // Einphasig: die ganze Last auf einer Phase, und die Summe stimmt.
  const einphasig = distributionPlan(kreise(3, 2000), 'A');
  assert.equal(einphasig.phases.length, 1);
  assert.equal(einphasig.phases[0].watts, 6000);
  assert.equal(einphasig.peak!.amps, 6000 / MAINS_VOLTAGE);
  // Die Vorgabe aendert keine vorhandene Zahl: ABC teilt weiter durch drei.
  assert.equal(DEFAULT_TEMPLATE, 'ABC');
  assert.ok(OUTLETS_PER_DISTRO >= 3, 'ein Distro, das keine ganze ABC-Runde fuehrt');
}

// ─── 4. Die Annahme wird benannt, nicht ersetzt ────────────────────────────
{
  // Ausgeglichen: drei gleiche Kreise auf ABC. Dann — und nur dann — stimmt
  // die alte Zahl, und der Waechter sagt das ausdruecklich.
  const glatt = distributionPlan(kreise(3, 1000), 'ABC');
  assert.equal(glatt.imbalanceAmps, 0);
  assert.equal(glatt.understatedAmps, 0);
  assert.equal(glatt.peak!.amps, glatt.assumedAmpsPerPhase);

  // Ungleich: EIN Kreis, also alles auf L1. Die Annahme behauptet ein Drittel.
  const schief = distributionPlan(kreise(1, 3000), 'ABC');
  assert.equal(schief.peak!.phase, 'L1');
  assert.equal(schief.peak!.amps, 3000 / MAINS_VOLTAGE);
  assert.equal(schief.assumedAmpsPerPhase, 3000 / (3 * MAINS_VOLTAGE));
  // Die Annahme ist KLEINER als die Wirklichkeit -- und zwar um den Betrag,
  // den `understatedAmps` nennt. Genau das ist der Fehler aus dem Beleg.
  assert.ok(schief.assumedAmpsPerPhase < schief.peak!.amps);
  assert.equal(
    Number(schief.understatedAmps.toFixed(6)),
    Number((schief.peak!.amps - schief.assumedAmpsPerPhase).toFixed(6)),
  );
  assert.equal(schief.imbalanceAmps, schief.peak!.amps, 'zwei Phasen tragen nichts');

  // Die Annahme kann NIE groesser sein als die schwerste Phase. Waere sie es,
  // gaebe es eine Last, die auf keiner Phase liegt.
  for (const n of [1, 2, 3, 4, 5, 7, 11]) {
    for (const v of ['A', 'AB', 'AC', 'ABC'] as const) {
      const p = distributionPlan(kreise(n), v);
      assert.ok(p.assumedAmpsPerPhase <= p.peak!.amps + 1e-9, `${v}/${n}`);
      assert.ok(p.understatedAmps >= 0);
    }
  }

  // Und die alte Zahl ist wirklich die alte: `computePower` unveraendert.
  const lampen = [lampe('a', 1000), lampe('b', 1000), lampe('c', 1000)];
  assert.equal(
    distributionFor(lampen, 'ABC').assumedAmpsPerPhase,
    computePower(lampen).ampsPerPhase,
  );
  // UND ZWAR IN JEDER VORLAGE. Sie durch die Zahl der Vorlagen-Phasen zu
  // teilen waere nicht mehr die alte Behauptung, sondern eine neue und
  // andere — und dann vergliche der Bericht die Wirklichkeit mit etwas, das
  // nie jemand geglaubt hat. Die Annahme fragte nicht, wie viele Phasen der
  // Anschluss fuehrt; genau das war ja ihr Fehler.
  for (const v of ['A', 'AB', 'AC', 'ABC'] as const) {
    assert.equal(
      distributionFor(lampen, v).assumedAmpsPerPhase,
      computePower(lampen).ampsPerPhase,
      `die Annahme haengt in ${v} an der Vorlage`,
    );
    assert.equal(distributionFor(lampen, v).assumedAmpsPerPhase, 3000 / (3 * MAINS_VOLTAGE));
  }
}

// ─── 5. „3-2" ist die Bezeichnung, die jemand wiederfindet ─────────────────
{
  assert.equal(circuitLabel({ distro: 3, outlet: 2 }), '3-2');
  assert.deepEqual(parseCircuitLabel('3-2'), { distro: 3, outlet: 2 });
  assert.deepEqual(parseCircuitLabel(' 12 - 4 '), { distro: 12, outlet: 4 });
  // Nichts wird zurechtgebogen: eine geratene Beschriftung stuende an einem
  // Ausgang, den es nicht gibt.
  assert.equal(parseCircuitLabel('3-2-1'), null);
  assert.equal(parseCircuitLabel('Kreis 3'), null);
  assert.equal(parseCircuitLabel('0-1'), null);
  assert.equal(parseCircuitLabel('3-0'), null);
  assert.equal(parseCircuitLabel(''), null);
  // Hin und zurueck.
  for (const d of [1, 2, 9, 10]) for (const o of [1, 6, 12]) {
    assert.deepEqual(parseCircuitLabel(circuitLabel({ distro: d, outlet: o })), { distro: d, outlet: o });
  }

  // Das Blatt fuehrt die Schreibweise, nicht die laufende Nummer.
  const tb = circuitTable(distributionPlan(kreise(7), 'ABC', 6));
  assert.deepEqual(tb.header, [...CIRCUIT_HEADERS]);
  assert.equal(tb.rows[6][0], '2-1');
  assert.notEqual(tb.rows[6][0], 7);
  // Beide Phasen-Schreibweisen nebeneinander (L1 und A) -- der Beleg spricht
  // von A/B/C, das Blatt in der Halle von L1/L2/L3.
  assert.match(String(tb.rows[0][1]), /L1/);
  assert.match(String(tb.rows[0][1]), /A/);
  for (const p of ['L1', 'L2', 'L3'] as const) {
    assert.match(PHASE_LABEL[p], /^L[123] \([ABC]\)$/);
  }
  const pt = phaseTable(distributionPlan(kreise(3), 'ABC'));
  assert.deepEqual(pt.header, [...PHASE_HEADERS]);
  assert.equal(pt.rows.length, 3);
}

// ─── 5b. Von der Leuchte zu ihrem Kreis ────────────────────────────────────
{
  // Die Frage, die auf der Buehne wirklich gestellt wird: „an welchem Kreis
  // haengt DIESE Leuchte?" Sie wird AUS der Zuteilung beantwortet und nicht
  // neben ihr gerechnet — es gibt genau eine Fuellregel.
  const lampen = Array.from({ length: 5 }, (_, i) => lampe(`f${i}`, 1000));
  const plan = distributionFor(lampen, 'ABC');
  const zu = circuitByFixture(plan);
  assert.equal(zu.size, 5, 'nicht jede Leuchte findet ihren Kreis');
  // Drei Geraete zu 1000 W passen in einen 3000-W-Kreis, das vierte nicht.
  assert.equal(circuitLabel(zu.get('f0')!), circuitLabel(zu.get('f2')!));
  assert.notEqual(circuitLabel(zu.get('f0')!), circuitLabel(zu.get('f3')!));
  // Und die Zuordnung stimmt mit der Zaehlung ueberein: keine Leuchte zweimal,
  // keine erfunden.
  for (const a of plan.assignments) {
    assert.equal(a.fixtureIds.length, a.fixtureCount, `Kreis ${circuitLabel(a)}`);
  }
  assert.equal(plan.assignments.reduce((n, a) => n + a.fixtureIds.length, 0), 5);

  // Eine Leuchte OHNE Leistungsangabe kommt in keinem Kreis vor — sie fehlt
  // hier, statt einem erfundenen zugeschlagen zu werden.
  const ohne = circuitByFixture(distributionFor([lampe('a', 1000), lampe('leer', 0)], 'ABC'));
  assert.ok(ohne.has('a'));
  assert.equal(ohne.has('leer'), false, 'eine Leuchte ohne Leistung bekam einen erfundenen Kreis');
}

// ─── 6. Ein Geraet, das in keinen Kreis passt, faellt auf ──────────────────
{
  // 5 kW an 230 V sind 21,7 A. `circuitBreakdown` legt das Geraet allein in
  // einen Kreis -- der liegt dann UEBER dem Budget, weil ein Geraet sich
  // nicht teilen laesst.
  const gross = circuitBreakdown([lampe('gross', 5000)]);
  assert.equal(gross.length, 1);
  assert.ok(gross[0].watts > CIRCUIT_WATTS, 'die Annahme dieses Tests stimmt nicht mehr');
  const plan = distributionPlan(gross, 'ABC');
  assert.equal(plan.assignments[0].overloaded, true);
  assert.ok(plan.assignments[0].amps > CIRCUIT_AMPS);

  // Und der Vorflug-Bericht macht daraus einen FEHLER: so geht es nicht auf
  // die Traverse, egal wie sauber der Rest ist.
  const befunde = rigCheck([lampe('gross', 5000)], []);
  assert.ok(befunde.some((i) => i.severity === 'error' && /16 A/.test(i.message)),
    'ein Kreis ueber 16 A bleibt unbeanstandet');

  // Die Gegenprobe: ein normales Geraet erzeugt keine solche Zeile. Eine
  // Pruefliste, die bei jedem PAR meckert, liest beim zweiten Mal niemand.
  assert.ok(distributionFor([lampe('klein', 750)], 'ABC').assignments.every((a) => !a.overloaded));
  assert.ok(!rigCheck([lampe('klein', 750)], []).some((i) => /ueber 16 A/.test(i.message)));
}

// ─── 6b. Die Pruefung nimmt die Vorlage ────────────────────────────────────
{
  // 12 kW: auf ABC verteilt 17,4 A je Phase, einphasig 52,2 A auf L1.
  const viel = Array.from({ length: 16 }, (_, i) => lampe(`f${i}`, 750));
  const aufDrei = rigCheck(viel, [], 'ABC');
  const aufEiner = rigCheck(viel, [], 'A');
  const phasenZeile = (is: ReturnType<typeof rigCheck>) => is.find((i) => /traegt .* A/.test(i.message));
  assert.ok(phasenZeile(aufEiner), 'einphasig faellt die Ueberlast nicht auf');
  assert.match(phasenZeile(aufEiner)!.message, /L1/);
  // Und die Zahl haengt wirklich an der Vorlage.
  assert.notEqual(phasenZeile(aufDrei)?.message, phasenZeile(aufEiner)?.message);

  // Die Schwelle fuer den Ungleich-Hinweis ist EIN GANZER KREIS, kein
  // erfundener Prozentsatz. Ein einzelnes Geraet auf einer von drei Phasen
  // ist rechnerisch „zu 100 % unausgeglichen" und interessiert niemanden:
  // beide Zahlen liegen unter jedem Automaten.
  const ungleich = (is: ReturnType<typeof rigCheck>) => is.filter((i) => /Ungleich verteilt/.test(i.message));
  assert.equal(ungleich(rigCheck([lampe('a', 750)], [])).length, 0,
    'ein einzelner PAR erzeugt einen Ungleich-Hinweis — dann liest ihn keiner mehr');
  // 12 kW auf einer Phase: die Annahme verschweigt 34,8 A, also mehr als
  // zwei ganze Kreise. Das aendert, welchen Anschluss jemand bestellt.
  assert.equal(ungleich(rigCheck(viel, [], 'A')).length, 1,
    'die Annahme verschweigt mehr als einen ganzen Kreis und niemand sagt es');
  // Auf dem Last-Blatt steht der Betrag trotzdem IMMER -- dort sieht man
  // absichtlich nach, hier wird man unterbrochen.
  assert.ok(distributionFor([lampe('a', 750)], 'ABC').understatedAmps > 0);

  // Ohne Angabe gilt die Vorgabe -- nicht das zuletzt Eingestellte.
  assert.deepEqual(
    rigCheck(viel, []).map((i) => i.message),
    rigCheck(viel, [], DEFAULT_TEMPLATE).map((i) => i.message),
  );
}

// ─── 7. Die Angabe ueberlebt das Speichern ─────────────────────────────────
{
  // ADR-005: `App.tsx` baut ein vollstaendiges `ProjectData` an VIER Stellen.
  // Als dort zuletzt Felder fehlten, verlor GENAU DER WEG UEBER SIE sie still.
  const app = ohneKommentare('../src/App.tsx');
  const schreibstellen = [...app.matchAll(/^\s*phaseTemplate,$/gm)];
  assert.equal(schreibstellen.length, 4,
    `phaseTemplate steht an ${schreibstellen.length} von 4 ProjectData-Bauplaetzen`);
  assert.match(app, /setPhaseTemplate\(data\.phaseTemplate \?\? DEFAULT_TEMPLATE\)/,
    'die Vorlage wird beim Laden nicht zurueckgesetzt');
  assert.match(lies('../src/types.ts'), /phaseTemplate\?: PhaseTemplate;/,
    'das Feld ist pflichtig und bricht damit jede vorhandene Datei');
}

// ─── 8. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = ohneKommentare('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /preflight\(fixtures, trusses, dmxProtocol, phaseTemplate\)/,
    'die Pruefung bekommt die Vorlage nicht');
  assert.match(dialog, /distributionFor\(fixtures, phaseTemplate\)/,
    'das Blatt rechnet die Verteilung nicht aus');
  // Die schwerste Phase steht auf einer Karte -- und die Annahme DANEBEN,
  // nicht an ihrer Stelle.
  assert.match(dialog, /verteilung\.peak\?\.amps/, 'die schwerste Phase steht nirgends');
  // Der Schluessel-Namensraum unterscheidet sich zwischen dem eigenstaendigen
  // Planer (`sch.*`) und der Suite-Fassung (`dlg.sch.*`). Der Waechter prueft
  // die FORM, nicht den Namensraum -- sonst braeuchte die vendorte Kopie eine
  // eigene Fassung dieser Datei, und die beiden driften ab dem Tag
  // auseinander, an dem jemand nur eine von beiden anfasst.
  assert.match(dialog, /'(dlg\.)?sch\.pwr\.assumed'/, 'die Annahme ist verschwunden statt benannt');
  assert.match(dialog, /power\.ampsPerPhase/, 'die alte Zahl fehlt zum Danebenhalten');
  // Die alte Beschriftung ist WEG: „pro Phase" als Tatsache war der Fehler.
  assert.doesNotMatch(dialog, /'(dlg\.)?sch\.perPhase'/, 'die alte Beschriftung behauptet weiter eine Tatsache');
  assert.match(dialog, /circuitLabel\(a\)/, 'die Kreisliste fuehrt die laufende Nummer statt „3-2"');
  assert.match(dialog, /onSetPhaseTemplate\(e\.target\.value as PhaseTemplate\)/, 'kein Umschalter');
  // Literale i18n-Schluessel -- ein Template waere fuer `i18n:check` unsichtbar.
  assert.doesNotMatch(dialog, /t\(`(dlg\.)?sch\.pwr\./, 'Template-Schluessel — der i18n-Guard sieht sie nicht');
  assert.match(dialog, /'(dlg\.)?sch\.pwr\.template'/);

  const app = ohneKommentare('../src/App.tsx');
  assert.match(app, /phaseTemplate=\{phaseTemplate\}/, 'die Vorlage erreicht den Dialog nicht');
  assert.match(app, /onSetPhaseTemplate=\{setPhaseTemplate\}/, 'der Umschalter haengt an nichts');

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['power:check'], 'power:check fehlt in package.json');
}

console.log('OK power-distribution-check: die Last steht auf Phasen, nicht auf einem Durchschnitt.');
