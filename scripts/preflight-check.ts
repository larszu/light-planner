// ───────────────────────────────────────────────────────────────────────────
// Vorflug-Prüfung: bevor irgendetwas hängt (Bedarf 142, P4).
// Lauf: `npm run preflight:check`
//
//   > Checks are done by eye or discovered on site. Named wanted checks:
//   > overlapping DMX addresses in a universe, duplicate channel numbers,
//   > power overload on circuits/dimmers/phases, MISSING REQUIRED FIELDS,
//   > SEMANTIC INCONSISTENCIES SUCH AS LED FIXTURES ON DIMMER CIRCUITS.
//
// Beleg: `jkarp7/showstack#31` (2025-12-27), plus zwei benannte Klassen
// stiller Fehlschläge: Vectorworks-Auswertungen, die unvollständige
// Datensätze „quietly omit", und Braceworks, das mit Standardgewichten
// „produces confident, wrong numbers".
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. ELEKTRONIK AM DIMMER. Der Fall, den der Beleg ausdrücklich nennt. Und
//     die Gegenprobe dazu: konventionelle Geräte am Dimmer sind der
//     NORMALFALL und dürfen keine Zeile erzeugen — eine Prüfliste, die bei
//     jedem PAR meckert, liest beim zweiten Mal niemand mehr.
//
//  2. GERATEN WIRD NICHT. `wash`, `spot` und `custom` heißen in dieser
//     Bibliothek mal LED und mal konventionell. Ein Befund darüber wäre
//     geraten, und eine geratene Zeile ist schlimmer als keine.
//
//  3. FEHLENDE PFLICHTANGABEN, GETRENNT. Ohne Kanal lässt sich das Gerät
//     nicht rufen, ohne Unit-Nummer nicht finden — zwei Probleme für zwei
//     verschiedene Menschen.
//
//  4. WORAUF DIE ZAHLEN BERUHEN. `computePower` summiert `wattage || 0`,
//     `trussLoads` summiert `weight || 0`, und wo keine Traglast eingetragen
//     ist, gilt ein Standardwert. Eine Traverse, die nur deshalb im grünen
//     Bereich liegt, weil drei Geräte ohne Gewicht mitfliegen, wurde als
//     „keine Probleme gefunden" gemeldet.
//
//  5. DAS VIERTE URTEIL. „Nicht beurteilbar" ist etwas anderes als „bereit".
//     Ohne diesen Zustand gäbe es für den gefährlichsten Fall — nichts
//     gefunden, weil die fehlenden Werte als Null durchgingen — kein Wort.
//
//  6. DER WEG IST VERDRAHTET.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASIS_LABEL, NO_TARGET, PREFLIGHT_HEADERS, VERDICT_LABEL,
  preflight, preflightTable, semanticIssues,
} from '../src/core/preflight.ts';
import type { FixtureCategory, PlacedFixture, Truss } from '../src/types.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const lampe = (
  id: string,
  category: FixtureCategory,
  opts: { dmx?: number; kanal?: number; unit?: string; watt?: number; kg?: number } = {},
): PlacedFixture => ({
  id,
  fixture: {
    id: `t-${category}`, name: category, manufacturer: 'ETC', category,
    wattage: opts.watt ?? 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: opts.kg ?? 8, mountType: 'clamp',
    ...(opts.dmx !== undefined ? { dmxChannels: opts.dmx } : {}),
  },
  x: 1, y: 2, mountingHeight: 6, aimX: 1, aimY: 3, bodyRotation: 0, dimming: 100,
  channel: opts.kanal ?? 1,
  unitNumber: opts.unit ?? '1',
  ...(opts.dmx ? { universe: 1, dmxAddress: 1 } : {}),
} as PlacedFixture);

const traverse = (id: string, capacity?: number): Truss =>
  ({ id, label: id, x1: 0, y1: 0, x2: 10, y2: 0, height: 6, capacity } as Truss);

const hat = (issues: ReturnType<typeof semanticIssues>, teil: string): boolean =>
  issues.some((i) => i.message.includes(teil));

// ─── 1. Elektronik am Dimmer ───────────────────────────────────────────────
{
  // Ein Moving Head ohne DMX-Fussabdruck haengt in diesem Modell an einem
  // Dimmerkanal. Am Phasenanschnitt zieht er nicht an oder nimmt Schaden.
  const i = semanticIssues([lampe('a', 'moving-spot', { dmx: 0 })]);
  assert.ok(hat(i, 'elektronische'), 'Elektronik am Dimmer wurde nicht gemeldet');
  assert.equal(i.find((x) => x.message.includes('elektronische'))?.severity, 'error');

  // Alle eindeutig elektronischen Arten, einzeln.
  for (const c of ['moving-wash', 'moving-spot', 'moving-beam', 'beam', 'led-panel'] as const) {
    assert.ok(hat(semanticIssues([lampe('a', c, { dmx: 0 })]), 'elektronische'), c);
  }

  // Mit DMX-Fussabdruck ist alles in Ordnung — das ist der Normalfall.
  assert.ok(!hat(semanticIssues([lampe('a', 'moving-spot', { dmx: 16 })]), 'elektronische'));

  // GEGENPROBE: konventionelle Geraete am Dimmer sind der Normalfall und
  // duerfen KEINE Zeile erzeugen. Ohne diese Pruefung ginge eine Fassung
  // durch, die bei jedem PAR meckert — und die liest niemand zweimal.
  for (const c of ['profile', 'fresnel', 'par', 'cyc', 'flood', 'followspot'] as const) {
    assert.ok(!hat(semanticIssues([lampe('a', c, { dmx: 0 })]), 'elektronische'),
      `${c} am Dimmer wurde faelschlich gemeldet`);
  }
}

// ─── 2. Geraten wird nicht ─────────────────────────────────────────────────
{
  // `wash`, `spot` und `custom` heissen mal LED und mal konventionell. Ein
  // Befund darueber waere geraten.
  for (const c of ['wash', 'spot', 'custom'] as const) {
    assert.ok(!hat(semanticIssues([lampe('a', c, { dmx: 0 })]), 'elektronische'),
      `${c} wurde geraten`);
  }
}

// ─── 3. Fehlende Pflichtangaben, getrennt ──────────────────────────────────
{
  const ohneKanal = semanticIssues([{ ...lampe('a', 'profile'), channel: undefined } as PlacedFixture]);
  assert.ok(hat(ohneKanal, 'ohne Kanalnummer'));
  assert.ok(hat(ohneKanal, 'nicht aufrufbar'), 'die Folge steht nicht dabei');

  const ohneUnit = semanticIssues([lampe('a', 'profile', { unit: '' })]);
  assert.ok(hat(ohneUnit, 'ohne Unit-Nummer'));

  // Und zwar getrennt: zwei Probleme fuer zwei verschiedene Menschen.
  const beides = semanticIssues([
    { ...lampe('a', 'profile', { unit: '' }), channel: undefined } as PlacedFixture,
  ]);
  assert.equal(beides.filter((i) => i.message.includes('ohne')).length, 2);

  // Kanal 0 ist eine Kanalnummer. Ein `!f.channel` statt `f.channel == null`
  // haette sie verschluckt.
  assert.ok(!hat(semanticIssues([lampe('a', 'profile', { kanal: 0 })]), 'ohne Kanalnummer'));

  // Ohne Leuchten keine Befunde — eine leere Liste ist kein Mangel.
  assert.deepEqual(semanticIssues([]), []);
}

// ─── 4. Worauf die Zahlen beruhen ──────────────────────────────────────────
{
  // Eine Traverse mit eingetragener Traglast und Geraeten mit Gewicht:
  // nichts ist angenommen.
  const sauber = preflight([lampe('a', 'profile', { kg: 8, watt: 750 })], [traverse('t1', 500)]);
  assert.equal(sauber.assumed, 0, `unerwartete Annahme: ${JSON.stringify(sauber.issues)}`);

  // Ein Geraet ohne Gewicht geht als 0 kg in die Traglast ein — und das steht
  // jetzt da, als Warnung und nicht als Fussnote.
  const ohneGewicht = preflight([lampe('a', 'profile', { kg: 0 })], [traverse('t1', 500)]);
  assert.ok(ohneGewicht.issues.some((i) => i.message.includes('ohne Gewicht')));
  assert.ok(ohneGewicht.assumed > 0);

  // Dasselbe fuer die Leistung.
  const ohneWatt = preflight([lampe('a', 'profile', { watt: 0 })], [traverse('t1', 500)]);
  assert.ok(ohneWatt.issues.some((i) => i.message.includes('ohne Leistungsangabe')));
  assert.ok(ohneWatt.assumed > 0);

  // GEGENPROBE zur Strom-Grundlage: eine Anlage ueber 16 A, aber mit
  // vollstaendigen Leistungsangaben, meldet ihre Last als EINGETRAGEN. Ohne
  // diese Zeile ginge eine Fassung durch, die einfach jede Strom-Zeile als
  // „angenommen" markiert — und dann bedeutet die Markierung nichts mehr.
  const vielStrom = preflight(
    Array.from({ length: 20 }, (_, k) => ({
      ...lampe(`p${k}`, 'profile', { watt: 1000, kg: 8, kanal: k + 1 }),
      x: k % 10, y: 0,
    })),
    [traverse('t1', 5000)],
  );
  const stromZeile = vielStrom.issues.find((i) => i.message.includes('Gesamtlast'));
  assert.ok(stromZeile, 'die Stromlast wurde nicht gemeldet');
  assert.notEqual(stromZeile.basis, 'assumed', 'eine vollstaendige Angabe wurde als Annahme markiert');
  assert.equal(vielStrom.assumed, 0, `unerwartete Annahme: ${JSON.stringify(vielStrom.issues)}`);

  // Eine Traverse ohne eingetragene Traglast macht die Traglast-Befunde zu
  // Annahmen — auch die, die „alles gut" sagen wuerden.
  const geraten = preflight([lampe('a', 'profile', { kg: 400 })], [traverse('t1')]);
  assert.ok(geraten.issues.some((i) => i.basis === 'assumed'));

  // Ein Ueberlast-Befund auf geratener Grundlage ist als solcher markiert.
  // Die Leuchten muessen AN der Traverse haengen (`trussLoads` ordnet nur
  // innerhalb eines Meters zu), sonst zaehlt ihr Gewicht als „nicht
  // zugeordnet" und die Traverse bleibt leer.
  const ueberlast = preflight(
    Array.from({ length: 80 }, (_, k) => ({
      ...lampe(`f${k}`, 'profile', { kg: 20, kanal: k + 1 }),
      x: k % 10, y: 0,
    })),
    [traverse('t1')],
  );
  const fehler = ueberlast.issues.find((i) => i.message.includes('über Traglast'));
  assert.ok(fehler, 'die Ueberlast wurde nicht gemeldet');
  assert.equal(fehler.basis, 'assumed', 'die geratene Traglast wurde als gemessen ausgegeben');
}

// ─── 5. Das vierte Urteil ──────────────────────────────────────────────────
{
  const sauber = preflight([lampe('a', 'profile')], [traverse('t1', 500)]);
  assert.equal(sauber.verdict, 'ready', `unerwartetes Urteil: ${JSON.stringify(sauber.issues)}`);

  // DER GEFAEHRLICHE FALL: sonst nichts gefunden, aber die Zahlen beruhen auf
  // fehlenden Angaben. Das ist NICHT „bereit".
  const unklar = preflight([lampe('a', 'profile', { kg: 0 })], [traverse('t1', 500)]);
  assert.equal(unklar.verdict, 'unknown', 'ein Plan mit fehlenden Gewichten galt als bereit');
  assert.notEqual(unklar.verdict, 'ready');

  // Ein Fehler schlaegt alles.
  const blockiert = preflight([lampe('a', 'moving-spot', { dmx: 0, kg: 0 })], [traverse('t1', 500)]);
  assert.equal(blockiert.verdict, 'blocked');

  // Hinweise ohne Annahmen: durchsehen, nicht blockiert.
  const durchsehen = preflight([lampe('a', 'profile', { unit: '' })], [traverse('t1', 500)]);
  assert.equal(durchsehen.verdict, 'check');

  // Jedes Urteil hat einen Text, und „unknown" sagt WARUM.
  for (const v of ['blocked', 'unknown', 'check', 'ready'] as const) {
    assert.ok(VERDICT_LABEL[v].length > 3, v);
  }
  assert.match(VERDICT_LABEL.unknown, /fehl/i);
}

// ─── Das Blatt ─────────────────────────────────────────────────────────────
{
  const r = preflight([lampe('a', 'profile', { kg: 0 })], [traverse('t1', 500)]);
  const tb = preflightTable(r);
  assert.deepEqual(tb.header, [...PREFLIGHT_HEADERS]);
  // Die Grundlage steht VOR dem Befund: wer ueberfliegt, soll sie sehen,
  // bevor er den Text liest.
  assert.equal(tb.header[1], 'Grundlage');
  assert.ok(tb.rows.some((z) => z[1] === BASIS_LABEL.assumed));
  // Wo kein Geraet betroffen ist, steht ein Strich und keine leere Zelle.
  const ohneZiel = tb.rows.find((z) => z[3] === NO_TARGET);
  assert.ok(ohneZiel !== undefined || tb.rows.every((z) => z[3] !== ''), 'leere Zelle statt Strich');
}

// ─── 6. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = lies('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /preflight\(fixtures, trusses\)/, 'der Dialog nimmt den Bericht nicht');
  assert.match(dialog, /verdictText\(t, bericht\.verdict\)/, 'das Urteil steht nirgends');
  assert.match(dialog, /bericht\.assumed > 0/, 'die Annahmen bleiben unerwaehnt');
  assert.match(dialog, /i\.basis === 'assumed'/, 'die einzelne Zeile sagt ihre Grundlage nicht');
  assert.match(dialog, /preflightTable\(bericht\)/, 'der Bericht laesst sich nicht ausgeben');
  // Literale i18n-Schluessel — ein Template waere fuer `i18n:check` unsichtbar.
  assert.doesNotMatch(dialog, /t\(`sch\.check\./);

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['preflight:check'], 'preflight:check fehlt in package.json');
}

console.log('OK preflight-check: die Pruefung meldet, was fehlt — und sagt, wenn sie kein Urteil faellen kann.');
