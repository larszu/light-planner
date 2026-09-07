// ───────────────────────────────────────────────────────────────────────────
// Gruppen, die die Übergabe überleben (Bedarf 139, P4).
// Lauf: `npm run groups:check`
//
//   > MVR carries no fixture groups. Users 'manually recreate complex grouping
//   > structures in each system they use'. […] it 'would significantly speed
//   > up the process of getting a console or a media server up and running
//   > quicker if you have a lot of complex groups on a rig'.
//
// Beleg: `mvrdevelopment/spec#295` (offen, 2026-01-13); der Spezifikationstext
// bestätigt, dass MVR keine Gruppen-Entität kennt.
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. EINE GRUPPE HAT EINEN NAMEN, UND ZWAR EINEN LESBAREN. „Gruppe 3" ist
//     keiner. Wo keiner gesetzt ist, steht ein benanntes „ohne Namen" — nicht
//     eine leere Zelle, die sich liest, als sei das Feld vergessen worden.
//
//  2. EIN GELÖSCHTES MITGLIED VERSCHWINDET NICHT STILL. Eine Gruppe, die von
//     acht auf sechs schrumpft, ohne dass es jemand sagt, ist am Pult ein
//     Rätsel — und derselbe Fehler, den `staleNotes` bei den Notizen
//     verhindert.
//
//  3. DAS BLATT IST DAS, WAS JEMAND ABTIPPT. Kanal UND Unit in jeder Zeile,
//     die Gruppe in JEDER Zeile (nicht als Überschrift), feste Reihenfolge.
//     Eine leere Gruppe steht trotzdem drauf: sonst sähe das Blatt so aus, als
//     gäbe es sie nicht.
//
//  4. DIE AUSLASSUNGEN SIND BERECHNET, NICHT AUFGEZÄHLT. Vorher nannte der
//     Dialog genau eine — die Traversen —, weil die einmal jemand bemerkt
//     hatte. Eine Liste vom Kenntnisstand ihres Autors lässt die nächste
//     Auslassung wieder durch.
//
//  5. WAS ABSICHT IST, LIEST SICH NICHT WIE EIN MANGEL. Die Notizen bleiben
//     nach Bedarf 71 bewusst im eigenen Projekt; die Meldung sagt das.
//
//  6. DER WEG IST VERDRAHTET. Die Punkte 1-5 können alle stimmen und trotzdem
//     nie etwas zu tun bekommen — die Form, die diese Repos mehrfach
//     hervorgebracht haben: gebaut, begründet, unerreichbar.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GROUP_HEADERS,
  NO_VALUE,
  UNNAMED_GROUP,
  groupLabel,
  groupTable,
  mvrOmissions,
  resolveGroups,
} from '../src/core/fixtureGroups.ts';
import type { FixtureGroup, PlacedFixture, Truss } from '../src/types.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/**
 * Quelltext OHNE Kommentare.
 *
 * Wer eine abgeschaffte Bauform verbietet, muss sie in der Begruendung
 * zitieren duerfen — sonst steht im Code kein Wort mehr darueber, warum sie
 * weg ist. Eine Pruefung ueber den ganzen Text verbietet ausgerechnet die
 * Erklaerung mit. Also erst die Kommentare weg, dann pruefen.
 */
const ohneKommentare = (rel: string): string =>
  lies(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const lampe = (
  id: string,
  name: string,
  channel?: number,
  unitNumber?: string,
  extra: Partial<PlacedFixture> = {},
): PlacedFixture => ({
  id,
  fixture: {
    id: `t-${name}`, name, manufacturer: 'ETC', category: 'spot',
    wattage: 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp',
  },
  x: 0, y: 0, mountingHeight: 6, aimX: 0, aimY: 0, bodyRotation: 0, dimming: 100,
  channel, unitNumber,
  ...extra,
} as PlacedFixture);

const rig: PlacedFixture[] = [
  lampe('f1', 'Source Four 26', 3, '1'),
  lampe('f2', 'Source Four 26', 1, '2'),
  lampe('f3', 'Fresnel 2kW', 7, '3', { gelFilterIds: ['l201'] }),
  lampe('f4', 'Fresnel 2kW', undefined, undefined, { purpose: 'Frontlicht Bühne' }),
];
const traversen: Truss[] = [
  { id: 't1', label: 'Traverse 1' } as Truss,
];

// ─── 1. Ein Name, und zwar ein lesbarer ────────────────────────────────────
{
  assert.equal(groupLabel({ id: 'g', label: 'Front warm', fixtureIds: [] }), 'Front warm');
  // Leer und nur-Leerzeichen ergeben denselben benannten Ausweg.
  assert.equal(groupLabel({ id: 'g', label: '', fixtureIds: [] }), UNNAMED_GROUP);
  assert.equal(groupLabel({ id: 'g', label: '   ', fixtureIds: [] }), UNNAMED_GROUP);
  assert.notEqual(UNNAMED_GROUP, '', 'ein leerer Ausweg ist kein Ausweg');

  // Und es gibt einen Weg, ihn zu setzen. Bis zu diesem Bedarf hiessen
  // Gruppen „Gruppe 3" und liessen sich nirgends umbenennen.
  const app = lies('../src/App.tsx');
  assert.match(app, /handleRenameGroup/, 'kein Umbenennen im Wirt');
  assert.match(app, /onRenameGroup=\{handleRenameGroup\}/, 'das Umbenennen erreicht den Dialog nicht');
  const dialog = lies('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /onRenameGroup\(g\.id, e\.target\.value\)/, 'kein Eingabefeld fuer den Namen');
}

// ─── 2. Ein geloeschtes Mitglied verschwindet nicht still ──────────────────
{
  const gruppen: FixtureGroup[] = [
    { id: 'g1', label: 'Front warm', fixtureIds: ['f1', 'f2', 'weg'] },
  ];
  const [g] = resolveGroups(gruppen, rig);
  assert.equal(g.members.length, 2);
  assert.deepEqual(g.missing, ['weg'], 'das geloeschte Mitglied wurde stillschweigend geschluckt');

  // Und es steht auch in der Oberflaeche.
  const dialog = lies('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /g\.missing\.length > 0/, 'die Oberflaeche zeigt geloeschte Mitglieder nicht');
}

// ─── 3. Das Blatt ist das, was jemand abtippt ──────────────────────────────
{
  const gruppen: FixtureGroup[] = [
    { id: 'g1', label: 'Front warm', fixtureIds: ['f1', 'f2'] },
    { id: 'g2', label: '', fixtureIds: ['f4'] },
    { id: 'g3', label: 'Leer', fixtureIds: [] },
  ];
  const aufgeloest = resolveGroups(gruppen, rig, (id) => (id === 'f1' ? 'Traverse 1' : undefined));

  // Kanal UND Unit: das Pult kennt den Kanal, der Aufbau die Unit-Nummer.
  assert.deepEqual([...GROUP_HEADERS], ['Gruppe', 'Kanal', 'Unit', 'Typ', 'Position']);

  // Feste Reihenfolge nach Kanal — dieselbe wie die Geraeteliste, damit beide
  // Blaetter nebeneinander lesbar bleiben. f2 hat Kanal 1, f1 Kanal 3.
  assert.deepEqual(aufgeloest[0].members.map((m) => m.fixtureId), ['f2', 'f1']);

  const tb = groupTable(aufgeloest);
  // Die Gruppe steht in JEDER Zeile, nicht als Ueberschrift: sonst geht die
  // Zuordnung beim Sortieren oder Einfuegen in eine Tabelle verloren.
  assert.equal(tb.rows.filter((r) => r[0] === 'Front warm').length, 2);
  assert.equal(tb.rows.find((r) => r[1] === 3)?.[4], 'Traverse 1');

  // Ohne Kanal steht ein Strich, keine leere Zelle und keine 0.
  const ohneKanal = tb.rows.find((r) => r[0] === UNNAMED_GROUP);
  assert.ok(ohneKanal, 'die namenlose Gruppe fehlt auf dem Blatt');
  assert.equal(ohneKanal[1], NO_VALUE);
  assert.equal(ohneKanal[2], NO_VALUE);

  // Eine leere Gruppe steht trotzdem drauf.
  assert.ok(tb.rows.some((r) => r[0] === 'Leer'), 'die leere Gruppe fehlt auf dem Blatt');

  // Zweimal dasselbe ergibt dasselbe Blatt.
  assert.deepEqual(groupTable(resolveGroups(gruppen, rig)).rows, groupTable(resolveGroups(gruppen, rig)).rows);
}

// ─── 4. Die Auslassungen sind berechnet ────────────────────────────────────
{
  const gruppen: FixtureGroup[] = [{ id: 'g1', label: 'Front', fixtureIds: ['f1'] }];
  const o = mvrOmissions(rig, traversen, gruppen, 2);
  const nach = (k: string) => o.find((x) => x.kind === k);

  assert.equal(nach('trusses')?.count, 1);
  assert.equal(nach('groups')?.count, 1);
  assert.equal(nach('gels')?.count, 1, 'die Folie an f3 wurde nicht gezaehlt');
  assert.equal(nach('purposes')?.count, 1, 'der Zweck an f4 wurde nicht gezaehlt');
  assert.equal(nach('notes')?.count, 2);

  // Kein Fall ohne Anlass: was nicht vorkommt, steht nicht da.
  const leer = mvrOmissions([], [], [], 0);
  assert.deepEqual(leer, [], 'eine Auslassung ohne Anlass wurde behauptet');

  // Jede Meldung sagt etwas, und zwar mehr als ein Wort.
  for (const x of o) {
    assert.ok(x.message.length > 30, `${x.kind}: keine Begruendung`);
    assert.ok(x.count > 0, `${x.kind}: gemeldet ohne Anlass`);
  }

  // Die Gruppen-Meldung nennt den Ausweg. Eine Auslassung ohne Ausweg ist
  // eine Entschuldigung.
  assert.match(nach('groups')!.message, /Gruppen-Blatt/);
}

// ─── 5. Absicht liest sich nicht wie ein Mangel ────────────────────────────
{
  const notiz = mvrOmissions([], [], [], 1).find((x) => x.kind === 'notes')!;
  assert.match(notiz.message, /absichtlich|Absicht/, 'die bewusste Auslassung liest sich wie ein Fehler');
  assert.match(notiz.message, /71/, 'die Entscheidung ist nicht belegt');
}

// ─── 6. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = lies('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /resolveGroups\(fixtureGroups, fixtures/, 'der Dialog loest die Gruppen nicht auf');
  assert.match(dialog, /mvrOmissions\(fixtures, trusses, fixtureGroups/, 'die Auslassungen werden nicht berechnet');
  assert.match(dialog, /groupTable\(gruppen\)/, 'es gibt kein Gruppen-Blatt');
  assert.match(dialog, /exportGroups/, 'das Blatt laesst sich nicht herunterladen');

  // Die alte, von Hand gepflegte Traversen-Meldung ist WEG — sonst stuende
  // dieselbe Auskunft zweimal da, einmal berechnet und einmal behauptet.
  assert.doesNotMatch(dialog, /trusses\.length > 0 && \(/,
    'die handgepflegte Traversen-Meldung steht noch neben der berechneten');

  // Literale i18n-Schluessel: ein `t(`sch.exp.omit.${kind}`)` waere fuer
  // `i18n:check` unsichtbar, und die englische Fassung fehlte still.
  // Der Schluessel-Namensraum unterscheidet sich zwischen dem eigenstaendigen
  // Planer (`sch.*`) und der Suite-Fassung (`dlg.sch.*`). Der Waechter prueft
  // die FORM, nicht den Namensraum -- sonst braeuchte die vendorte Kopie eine
  // eigene Fassung dieser Datei, und die beiden driften ab dem Tag
  // auseinander, an dem jemand nur eine von beiden anfasst.
  const dialogCode = ohneKommentare('../src/components/ScheduleDialog.tsx');
  assert.doesNotMatch(dialogCode, /t\(`(dlg\.)?sch\.exp\.omit\./, 'Template-Schluessel — der i18n-Guard sieht sie nicht');
  assert.match(dialogCode, /'(dlg\.)?sch\.exp\.omit\.trusses'/);

  const app = lies('../src/App.tsx');
  assert.match(app, /fixtureGroups=\{fixtureGroups\}/, 'die Gruppen erreichen den Dialog nicht');

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['groups:check'], 'groups:check fehlt in package.json');
}

console.log('OK fixture-groups-check: Gruppen haben Namen, ein Blatt und einen Weg — und was die MVR nicht traegt, steht dabei.');
