// ───────────────────────────────────────────────────────────────────────────
// Der Rückweg vom Pult (Bedarf 137, P4).
// Lauf: `npm run patch:check`
//
//   > Nothing flows back. The console show file holds the only accurate
//   > record after load-in; the plot on the designer's laptop still shows
//   > three-week-old intent.
//
// Belege: die Nicht-Ziel-Liste von MVR-xchange selbst („no real-time, live
// change synchronisation", „no mandatory import rules (no single source of
// truth)"), und dass der einzige Weg aus einer ETC-Eos-Show-Datei heraus eine
// Community-Bibliothek ist, ausdrücklich „not official ETC software".
//
// WAS HIER GEPRUEFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. TOLERANT LESEN, ABER MIT ANSAGE. Ein Pult-Export kommt mit Semikolon
//     oder Tabulator, mit BOM, mit „Fixture Type" oder „fixture_type". Wer
//     das nicht verkraftet, bekommt keine Daten; wer es still verkraftet und
//     dabei eine Spalte fallen lässt, bekommt falsche. Beides wird geprüft:
//     die Deutung UND die Meldung über das, was nicht gedeutet wurde.
//
//  2. KEINE ERFUNDENEN WERTE. Eine unlesbare Adresse ergibt eine Warnung mit
//     Zeilennummer, nicht die Adresse 0. Eine fehlende Kanalnummer macht die
//     Zeile unzuordenbar — und sie steht trotzdem auf dem Blatt.
//
//  3. DIE ENGSTELLE: MEHRERE LEUCHTEN AUF EINEM KANAL. Das ist im Licht der
//     Normalfall. Ein Vergleich, der sich dann eine Zeile aussucht, behauptet
//     eine Abweichung, die es vielleicht nicht gibt. Geprüft wird, dass in
//     diesem Fall KEIN Feldvergleich entsteht, sondern eine benannte Auskunft.
//
//  4. NICHT VERGLICHEN IST NICHT GLEICH. Liefert die Datei keine Typ-Spalte,
//     darf kein „umgetauscht" entstehen — und auch kein stilles „passt".
//
//  5. EINBAHNSTRASSE. Das Modul schreibt nichts in den Plan. Geprüft am
//     Ergebnis: die Leuchten, die hineingehen, kommen unverändert wieder
//     heraus. Eine Absichtserklärung im Kommentar wäre keine Zusicherung.
//
//  6. DER WEG IST VERDRAHTET. Die Punkte 1-5 können alle stimmen und trotzdem
//     nie etwas zu tun bekommen — die Form, die diese Repos mehrfach
//     hervorgebracht haben: gebaut, begründet, unerreichbar.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NOT_PATCHED,
  NO_LABEL,
  parseAddress,
  parseConsolePatch,
  patchReturn,
  returnFindings,
  returnTable,
} from '../src/core/consolePatch.ts';
import type { PlacedFixture } from '../src/types.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** Eine Leuchte mit genau den Feldern, die der Vergleich anfasst. */
const leuchte = (
  id: string,
  channel: number | undefined,
  universe: number | undefined,
  dmxAddress: number | undefined,
  name: string,
  purpose?: string,
): PlacedFixture => ({
  id,
  fixture: {
    id: `t-${name}`, name, manufacturer: 'ETC', category: 'spot',
    wattage: 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp',
  },
  x: 0, y: 0, mountingHeight: 6, aimX: 0, aimY: 0, bodyRotation: 0, dimming: 100,
  channel, universe, dmxAddress, purpose,
} as PlacedFixture);

// ─── 1. Tolerant lesen, aber mit Ansage ────────────────────────────────────
{
  const semikolon = parseConsolePatch('Channel;Address;Fixture Type;Label\n1;1/25;Source Four 26;Front SL\n');
  assert.equal(semikolon.delimiter, ';');
  assert.equal(semikolon.rows.length, 1);
  assert.deepEqual(semikolon.rows[0], {
    line: 2, channel: 1, universe: 1, address: 25, label: 'Front SL', type: 'Source Four 26',
  });

  const tab = parseConsolePatch('Chan\tDMX\tType\n7\t1/100\tMac Aura\n');
  assert.equal(tab.delimiter, '\t');
  assert.equal(tab.rows[0].channel, 7);

  // Schreibweisen der Ueberschrift: Gross/klein, Unterstrich, Leerzeichen.
  for (const kopf of ['fixture_type', 'FIXTURE TYPE', 'Fixture-Type']) {
    const p = parseConsolePatch(`Channel,${kopf}\n3,S4\n`);
    assert.ok(p.mapping.some((m) => m.column === 'type'), `"${kopf}" nicht als Typ erkannt`);
  }

  // BOM aus Excel, vor der ersten Ueberschrift.
  //
  // Fuer die DEUTUNG faengt `normHeader` sie schon ab (das Zeichen faellt aus
  // dem erlaubten Satz). Nicht abgefangen ist, was der Mensch LIEST: die
  // Ueberschrift wird woertlich zurueckgegeben — in `mapping` und in
  // `ignored` — und ein unsichtbares Zeichen in „nicht gedeutet: <BOM>Gobo" macht
  // aus einer klaren Auskunft ein Raetsel. Deshalb wird beides geprueft.
  // Die BOM steht als ESCAPE im Quelltext, nicht als Zeichen. Ein
  // unsichtbares Zeichen in einer Datei, die gegen unsichtbare Zeichen
  // prueft, ist zu komisch, um es stehen zu lassen — und `eslint` verbietet
  // es ohnehin (`no-irregular-whitespace`).
  const BOM = '\uFEFF';
  const mitBom = parseConsolePatch(`${BOM}Channel,Address\n5,1/9\n`);
  assert.ok(mitBom.mapping.some((m) => m.column === 'channel'), 'BOM macht die Kanal-Spalte unsichtbar');
  assert.equal(mitBom.mapping[0].header, 'Channel', 'die gemeldete Ueberschrift traegt noch die BOM');

  const bomFremd = parseConsolePatch(`${BOM}Gobo,Channel\n-,5\n`);
  assert.deepEqual(bomFremd.ignored, ['Gobo'], 'die nicht gedeutete Ueberschrift traegt noch die BOM');

  // Was nicht gedeutet wurde, wird BENANNT statt geschluckt.
  const fremd = parseConsolePatch('Channel,Address,Gobo,Notes\n1,1/1,Breakup,egal\n');
  assert.deepEqual(fremd.ignored, ['Gobo', 'Notes']);

  // Zwei Spalten derselben Bedeutung: die zweite wird nicht still genommen.
  const doppelt = parseConsolePatch('Channel,Name,Label\n1,A,B\n');
  assert.equal(doppelt.warnings.length, 1);
  assert.match(doppelt.warnings[0].message, /es gilt die erste/);
  assert.equal(doppelt.rows[0].label, 'A');
  // Und die zweite steht NICHT in der Deutung. Ohne diese Zeile ueberlebt ein
  // Fehler, bei dem beide Spalten in `mapping` landen: `find` liefert dann
  // zufaellig die erste, das Blatt behauptet aber, beide gelesen zu haben.
  const proSpalte = new Map<string, number>();
  for (const m of doppelt.mapping) proSpalte.set(m.column, (proSpalte.get(m.column) ?? 0) + 1);
  for (const [spalte, n] of proSpalte) {
    assert.equal(n, 1, `Spalte "${spalte}" ${n}-mal gedeutet — es darf nur eine gelten`);
  }
  assert.deepEqual(doppelt.ignored, ['Label']);

  // Ohne Kanal-Spalte gibt es eine Warnung -- ohne sie laesst sich nichts
  // zuordnen, und das muss jemand erfahren, bevor er ein leeres Blatt sieht.
  const ohneKanal = parseConsolePatch('Address,Type\n1/1,S4\n');
  assert.ok(ohneKanal.warnings.some((w) => /Kanal-Spalte/.test(w.message)));

  // Kein Trennzeichen -- keine erfundene Spalte.
  const einspaltig = parseConsolePatch('Channel\n1\n');
  assert.equal(einspaltig.rows.length, 0);
  assert.match(einspaltig.warnings[0].message, /Kein Trennzeichen/);

  // Leere Datei.
  assert.match(parseConsolePatch('').warnings[0].message, /leer/);

  // Anfuehrungszeichen: ein Trennzeichen im Feld zerlegt die Zeile nicht.
  const zitiert = parseConsolePatch('Channel;Label\n4;"Front, warm"\n');
  assert.equal(zitiert.rows[0].label, 'Front, warm');
}

// ─── 2. Keine erfundenen Werte ─────────────────────────────────────────────
{
  assert.deepEqual(parseAddress('1/25'), { universe: 1, address: 25 });
  assert.deepEqual(parseAddress('2.100'), { universe: 2, address: 100 });
  // Absolute Adresse: 600 liegt im zweiten Universe.
  assert.deepEqual(parseAddress('600'), { universe: 2, address: 88 });
  assert.deepEqual(parseAddress('512'), { universe: 1, address: 512 });
  assert.deepEqual(parseAddress('513'), { universe: 2, address: 1 });
  // Was keine Adresse ist, ist keine.
  for (const kaputt of ['', 'x', '0', '1/0', '1/513', '-5', '1/', 'A/1']) {
    assert.equal(parseAddress(kaputt), null, `"${kaputt}" haette null ergeben muessen`);
  }

  const p = parseConsolePatch('Channel,Address\n1,gruen\n2,1/9\n');
  assert.equal(p.rows[0].address, undefined, 'unlesbare Adresse wurde erfunden');
  assert.equal(p.warnings.length, 1);
  assert.equal(p.warnings[0].line, 2, 'die Warnung nennt die Zeile nicht');
  assert.match(p.warnings[0].message, /Adresse "gruen"/);
  assert.equal(p.rows[1].address, 9, 'eine kaputte Zeile reisst die naechste mit');

  // Kanal, der keine Zahl ist: die Zeile bleibt, unzugeordnet und benannt.
  const q = parseConsolePatch('Channel,Address\nA,1/1\n');
  assert.equal(q.rows[0].channel, undefined);
  const r = patchReturn([], q);
  assert.equal(r.counts['no-channel'], 1);
  assert.equal(r.entries[0].label, NO_LABEL, 'die namenlose Zeile bekommt keinen Namen erfunden');
}

// ─── 3. Mehrere Leuchten auf einem Kanal ───────────────────────────────────
{
  const plan = [
    leuchte('a', 12, 1, 1, 'Source Four 26'),
    leuchte('b', 12, 1, 5, 'Source Four 26'),
  ];
  const pult = parseConsolePatch('Channel,Address,Type\n12,1/1,Source Four 26\n');
  const r = patchReturn(plan, pult);

  assert.equal(r.counts['ambiguous-channel'], 1);
  assert.equal(r.counts.changed, 0, 'ein mehrfach belegter Kanal wurde trotzdem verglichen');
  assert.equal(r.compared, 0, 'ein nicht vergleichbarer Kanal wurde als verglichen gezaehlt');
  const eintrag = r.entries.find((e) => e.kind === 'ambiguous-channel')!;
  assert.deepEqual(eintrag.differences, [{ field: 'Einträge', from: '2 im Plan', to: '1 am Pult' }]);

  // Auch andersherum: eine Leuchte im Plan, zwei Zeilen am Pult.
  const r2 = patchReturn([leuchte('a', 12, 1, 1, 'S4')],
    parseConsolePatch('Channel,Address\n12,1/1\n12,1/5\n'));
  assert.equal(r2.counts['ambiguous-channel'], 1);
  assert.equal(r2.compared, 0);
}

// ─── 4. Nicht verglichen ist nicht gleich ──────────────────────────────────
{
  // Keine Typ-Spalte in der Datei -> kein "umgetauscht".
  const ohneTyp = patchReturn(
    [leuchte('a', 1, 1, 25, 'Source Four 26')],
    parseConsolePatch('Channel,Address\n1,1/25\n'),
  );
  assert.equal(ohneTyp.counts.unchanged, 1);
  assert.deepEqual(ohneTyp.entries[0].differences, []);

  // Mit Typ-Spalte und anderem Typ -> genau ein Unterschied.
  const mitTyp = patchReturn(
    [leuchte('a', 1, 1, 25, 'Source Four 26')],
    parseConsolePatch('Channel,Address,Type\n1,1/25,Mac Aura\n'),
  );
  assert.equal(mitTyp.counts.changed, 1);
  assert.deepEqual(mitTyp.entries[0].differences, [{ field: 'Typ', from: 'Source Four 26', to: 'Mac Aura' }]);

  // Derselbe Typ, andere Schreibweise -> KEIN Unterschied. Sonst meldete das
  // Blatt jede Leuchte als umgetauscht, und niemand liest es ein zweites Mal.
  for (const schreibweise of ['source four 26', 'Source-Four 26', 'ETC Source Four 26']) {
    const gleich = patchReturn(
      [leuchte('a', 1, 1, 25, 'Source Four 26')],
      parseConsolePatch(`Channel,Address,Type\n1,1/25,${schreibweise}\n`),
    );
    assert.equal(gleich.counts.changed, 0, `"${schreibweise}" wurde als anderer Typ gelesen`);
  }

  // Die Umadressierung -- der Fall aus dem Beleg.
  const umadressiert = patchReturn(
    [leuchte('a', 1, 1, 25, 'S4')],
    parseConsolePatch('Channel,Address\n1,2/100\n'),
  );
  assert.deepEqual(umadressiert.entries[0].differences, [{ field: 'Adresse', from: '1/25', to: '2/100' }]);

  // Nie gepatcht: benannt, nicht leer.
  const nieGepatcht = patchReturn(
    [leuchte('a', 1, undefined, undefined, 'S4')],
    parseConsolePatch('Channel,Address\n1,1/9\n'),
  );
  assert.deepEqual(nieGepatcht.entries[0].differences, [{ field: 'Adresse', from: NOT_PATCHED, to: '1/9' }]);

  // Nur am Pult / nur im Plan.
  const beides = patchReturn(
    [leuchte('a', 1, 1, 1, 'S4'), leuchte('b', 2, 1, 5, 'S4')],
    parseConsolePatch('Channel,Address\n1,1/1\n9,1/50\n'),
  );
  assert.equal(beides.counts['only-in-plan'], 1);
  assert.equal(beides.counts['only-in-console'], 1);
  assert.equal(beides.counts.unchanged, 1);

  // Eine Leuchte ohne Kanalnummer verschwindet nicht.
  const ohneKanal = patchReturn([leuchte('a', undefined, 1, 1, 'S4', 'Gegenlicht')], parseConsolePatch('Channel,Address\n'));
  assert.equal(ohneKanal.counts['no-channel'], 1);
  assert.equal(ohneKanal.entries[0].label, 'Gegenlicht');

  // Das Blatt zeigt nur, was jemanden angeht -- die Zahl der Unveraenderten
  // bleibt aber sichtbar. Das ist der Unterschied zwischen "nichts gefunden"
  // und "nichts angesehen".
  const gemischt = patchReturn(
    [leuchte('a', 1, 1, 1, 'S4'), leuchte('b', 2, 1, 5, 'S4')],
    parseConsolePatch('Channel,Address\n1,1/1\n2,1/99\n'),
  );
  assert.equal(returnFindings(gemischt).length, 1);
  assert.equal(gemischt.counts.unchanged, 1);
  assert.equal(gemischt.compared, 2);

  // Die Tabelle: eine Zeile je Unterschied, mit Richtung.
  const tabelle = returnTable(gemischt);
  assert.deepEqual(tabelle.header, ['Kanal', 'Was', 'Bezeichnung', 'Feld', 'Im Plan', 'Am Pult']);
  assert.equal(tabelle.rows.length, 1);
  assert.deepEqual(tabelle.rows[0].slice(3), ['Adresse', '1/5', '1/99']);
}

// ─── 5. Einbahnstrasse ─────────────────────────────────────────────────────
{
  const plan = [leuchte('a', 1, 1, 25, 'Source Four 26', 'Front SL')];
  const vorher = JSON.stringify(plan);
  patchReturn(plan, parseConsolePatch('Channel,Address,Type,Label\n1,2/100,Mac Aura,Anders\n'));
  assert.equal(JSON.stringify(plan), vorher, 'der Vergleich hat den Plan angefasst');

  // Und das Modul kennt gar keinen Schreibweg: kein Export heisst "apply",
  // "commit" oder "merge". Am Quelltext geprueft, nicht an der Absicht.
  const quelle = lies('../src/core/consolePatch.ts');
  const exporte = [...quelle.matchAll(/^export (?:function|const|interface|type) (\w+)/gm)].map((m) => m[1]);
  for (const name of exporte) {
    assert.doesNotMatch(name, /^(apply|commit|merge|write|import)/,
      `"${name}" klingt nach einem Schreibweg -- der Rueckweg ist eine Einbahnstrasse`);
  }
}

// ─── 6. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = lies('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /parseConsolePatch\(/, 'Der Dialog liest keinen Patch ein');
  assert.match(dialog, /patchReturn\(fixtures/, 'Der Dialog vergleicht nicht gegen die Leuchten des Plans');
  assert.match(dialog, /type="file"/, 'Es gibt keinen Weg, die Datei auszuwaehlen');
  assert.match(dialog, /id: 'return'/, 'Der Reiter fehlt -- gebaut und unerreichbar');

  // Der Reiter darf nicht nur in der Liste stehen, sondern muss auch ein
  // Panel bekommen. Genau diese Haelfte fehlt leicht.
  assert.match(dialog, /return: returnPanel/, 'Der Reiter zeigt kein Panel');

  // Nichts im Dialog schreibt das Ergebnis zurueck in den Plan.
  assert.doesNotMatch(dialog, /onUpdateFixture\([^)]*rueckweg/, 'Der Dialog uebernimmt den Pult-Stand in den Plan');

  // Der Pruef-Lauf steht in package.json -- sonst faengt ihn `ci:complete` nie.
  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['patch:check'], 'patch:check fehlt in package.json');
}

console.log('OK console-patch-check: der Pult-Patch kommt herein, wird benannt verglichen — und schreibt nichts zurueck.');
