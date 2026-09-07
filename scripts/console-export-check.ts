// ───────────────────────────────────────────────────────────────────────────
// Den Patch ans Pult schicken statt abtippen (Bedarf 146, P4).
// Lauf: `npm run console:check`
//
//   > […] EOS FILE IMPORT WANTS TAB-SEPARATED .txt WITH WINDOWS LINE ENDINGS
//   > and imports ONLY ROWS WHOSE DEVICE TYPE [matches the console's library].
//   > Warn explicitly about the device-type filter and the line-ending
//   > requirement RATHER THAN LETTING THE USER DISCOVER IT AT LOAD-IN.
//
// Belege: `jkarp7/showstack#51` (2025-12-29) und `lightwright.yaml` aus dem
// showstack-Datensatz, das ETCs „Importing Lightwright Data Into Eos Family
// Consoles" zitiert.
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. DAS FORMAT IST DAS FORMAT. Tabulator, CRLF, .txt. Jedes einzelne davon
//     ist die Bedingung dafür, dass Eos die Datei überhaupt annimmt. Wer hier
//     „aufräumt" (LF statt CRLF, Semikolon statt Tabulator), baut eine Datei,
//     die am Pult wortlos abgelehnt wird.
//
//  2. GEWARNT WIRD VOR DEM SPEICHERN. `exportPreflight` sagt, was fehlen
//     wird, und `buildConsoleFile` lässt GENAU DAS weg — eine Entscheidung,
//     nicht zwei. Zwei Regeln könnten auseinanderlaufen, und dann warnte die
//     eine, während die andere etwas anderes tut.
//
//  3. WAS WIR NICHT WISSEN, BEHAUPTEN WIR NICHT. Ob Eos eine Zeile annimmt,
//     hängt an SEINER Bibliothek. Also wird nicht versprochen, dass sie
//     ankommt: es wird gezählt, wie viele davon abhängen.
//
//  4. AUF PAPIER EIN STRICH, IN DER DATEI NICHTS. Der Feld-Katalog schreibt
//     „–", wo nichts eingetragen ist. In einer Datei, die ein Pult einliest,
//     wäre derselbe Strich eine Lüge — und in einer Zahlenspalte unlesbar.
//
//  5. EIN TABULATOR IM WERT VERSCHIEBT KEINE SPALTE. Eos liest feldweise
//     über den Tabulator; ein Anführungszeichen ist ihm kein Schutzzeichen.
//     Also wird ersetzt und nicht gequotet.
//
//  6. DER WEG IST VERDRAHTET — und die Datei geht NICHT über `downloadCsv`,
//     denn dort hängt eine Byte-Order-Mark vorn, die im ersten Spaltennamen
//     landen würde.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DROP_LABEL, FORMATS, TARGETS, buildConsoleFile, consoleFileName, dropReason,
  exportPreflight, machineCell, type ConsoleTarget,
} from '../src/core/consoleExport.ts';
import { NOT_SET, cell, fieldContext } from '../src/core/reportFields.ts';
import type { PlacedFixture } from '../src/types.ts';

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

const lampe = (
  id: string,
  opts: { kanal?: number; universe?: number; adresse?: number; typ?: string; zweck?: string } = {},
): PlacedFixture => ({
  id,
  fixture: {
    id: 't', name: opts.typ ?? 'Source Four 26', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp', dmxChannels: 1,
  },
  x: 1, y: 2, mountingHeight: 6, aimX: 1, aimY: 3, bodyRotation: 0, dimming: 100,
  ...(opts.kanal !== undefined ? { channel: opts.kanal } : {}),
  ...(opts.universe !== undefined ? { universe: opts.universe } : {}),
  ...(opts.adresse !== undefined ? { dmxAddress: opts.adresse } : {}),
  ...(opts.zweck !== undefined ? { purpose: opts.zweck } : {}),
} as PlacedFixture);

const voll = (id: string, kanal: number, extra: Record<string, unknown> = {}) =>
  lampe(id, { kanal, universe: 1, adresse: kanal, ...extra });

// ─── 1. Das Format ist das Format ──────────────────────────────────────────
{
  const eos = FORMATS['eos-lightwright'];
  assert.equal(eos.separator, '\t', 'Eos will Tabulatoren');
  assert.equal(eos.newline, '\r\n', 'Eos will Windows-Zeilenenden');
  assert.equal(eos.extension, 'txt', 'Eos will .txt');
  // Und die Begruendung steht dabei, damit niemand daran „aufraeumt".
  assert.match(eos.note, /CRLF/);
  assert.match(eos.note, /Device Type/i);

  // Die CSV ist NICHT die deutsche Excel-CSV: diese Datei liest eine
  // Maschine, kein Tabellenblatt.
  assert.equal(FORMATS.csv.separator, ',');
  assert.notEqual(FORMATS.csv.separator, ';');
  assert.equal(FORMATS.csv.newline, '\r\n');

  // Die Kopfzeile ist die des Ziels und nicht die deutsche Blatt-Beschriftung:
  // ein Pult liest englische Spaltennamen.
  for (const id of TARGETS) {
    const f = FORMATS[id];
    assert.equal(f.header.length, f.columns.length, `${id}: Kopf und Spalten verschieden lang`);
    assert.ok(f.note.length > 40, `${id} ohne Begruendung`);
    assert.ok(f.label.length > 3, `${id} ohne Namen`);
  }
  assert.deepEqual(FORMATS['eos-lightwright'].header.slice(0, 2), ['Channel', 'Type']);

  // Und im Ergebnis stehen sie wirklich so.
  const lampen = [voll('a', 1)];
  const datei = buildConsoleFile(lampen, 'eos-lightwright', fieldContext(lampen, [], 'sacn', 'ABC'));
  assert.ok(datei.startsWith('Channel\tType\t'), 'die Kopfzeile ist nicht tabgetrennt');
  assert.ok(datei.endsWith('\r\n'), 'die Datei endet ohne Zeilenende — manche Einleser verlieren die letzte Zeile');
  assert.doesNotMatch(datei.replace(/\r\n/g, ''), /\n/, 'es steht ein nacktes LF in der Datei');
  assert.equal(datei.split('\r\n').filter(Boolean).length, 2, 'Kopf plus eine Zeile');
  assert.match(consoleFileName('Demo Show', 'eos-lightwright'), /\.txt$/);
  assert.match(consoleFileName('Demo Show', 'csv'), /\.csv$/);
}

// ─── 2. Gewarnt wird vor dem Speichern — und zwar dasselbe ─────────────────
{
  const lampen = [
    voll('gut', 1),
    lampe('ohneKanal', { universe: 1, adresse: 5 }),
    lampe('ohneAdresse', { kanal: 2 }),
    lampe('ohneTyp', { kanal: 3, universe: 1, adresse: 9, typ: '   ' }),
  ];
  const ctx = fieldContext(lampen, [], 'sacn', 'ABC');
  const vor = exportPreflight(lampen, 'eos-lightwright');
  assert.equal(vor.written, 1);
  assert.equal(vor.dropped.length, 3);
  assert.deepEqual(vor.dropped.map((d) => d.reason).sort(),
    ['no-address', 'no-channel', 'no-type']);
  // Jeder Grund hat einen Satz, und keiner ist leer.
  for (const r of ['no-channel', 'no-address', 'no-type'] as const) {
    assert.ok(DROP_LABEL[r].length > 20, r);
  }
  assert.match(DROP_LABEL['no-type'], /ohne es zu sagen/);

  // UND DIE DATEI ENTHAELT GENAU DAS ANGEKUENDIGTE. Zwei Regeln — eine fuers
  // Warnen, eine fuers Schreiben — koennten auseinanderlaufen, und dann
  // warnte die eine, waehrend die andere etwas anderes tut. Das ist der
  // Fehler aus dem Beleg noch einmal, nur eine Ebene hoeher.
  const datei = buildConsoleFile(lampen, 'eos-lightwright', ctx);
  const zeilen = datei.split('\r\n').filter(Boolean);
  assert.equal(zeilen.length - 1, vor.written, 'die Datei enthaelt etwas anderes als angekuendigt');
  for (const d of vor.dropped) {
    assert.equal(datei.includes(d.id), false, `${d.id} steht doch in der Datei`);
  }
  // Und die eine Entscheidung ist wirklich EINE Funktion.
  assert.equal(dropReason(lampen[0]), null);
  assert.equal(dropReason(lampen[1]), 'no-channel');
  assert.equal(dropReason(lampen[2]), 'no-address');
  assert.equal(dropReason(lampen[3]), 'no-type');
}

// ─── 3. Was wir nicht wissen, behaupten wir nicht ──────────────────────────
{
  const lampen = [voll('a', 1), voll('b', 2)];
  const eos = exportPreflight(lampen, 'eos-lightwright');
  // Eos filtert nach dem Geraetetyp — also haengen ALLE geschriebenen Zeilen
  // daran, und die Zahl sagt das.
  assert.equal(eos.unverifiable, eos.written);
  assert.equal(eos.unverifiable, 2);
  // Ein Ziel ohne Typ-Filter behauptet keine Ungewissheit, die es nicht gibt.
  assert.equal(exportPreflight(lampen, 'csv').unverifiable, 0);
  // Und die Zahl ist nie groesser als das, was ueberhaupt geschrieben wird.
  for (const id of TARGETS) {
    const p = exportPreflight(lampen, id as ConsoleTarget);
    assert.ok(p.unverifiable <= p.written, id);
  }
}

// ─── 4. Auf Papier ein Strich, in der Datei nichts ─────────────────────────
{
  const ohneZweck = voll('a', 1);
  const ctx = fieldContext([ohneZweck], [], 'sacn', 'ABC');
  // Auf dem Blatt: der Strich.
  assert.equal(cell('purpose', ohneZweck, ctx), NOT_SET);
  // In der Datei: nichts.
  assert.equal(machineCell('purpose', ohneZweck, ctx, FORMATS['eos-lightwright']), '');

  const datei = buildConsoleFile([ohneZweck], 'eos-lightwright', ctx);
  assert.equal(datei.includes(NOT_SET), false, 'der Papier-Strich steht in der Maschinen-Datei');
  // Zwei Trennzeichen hintereinander: genau so sieht ein leeres Feld aus.
  assert.match(datei, /\t\t/);
}

// ─── 5. Ein Tabulator im Wert verschiebt keine Spalte ──────────────────────
{
  // Eos liest feldweise ueber den Tabulator; ein Anfuehrungszeichen ist ihm
  // kein Schutzzeichen. Also wird ERSETZT und nicht gequotet.
  const boese = voll('a', 1, { zweck: 'Front\tWarm' });
  const ctx = fieldContext([boese], [], 'sacn', 'ABC');
  const wert = machineCell('purpose', boese, ctx, FORMATS['eos-lightwright']);
  assert.equal(wert.includes('\t'), false, 'der Tabulator steht noch im Wert');
  assert.equal(wert, 'Front Warm');
  assert.equal(wert.includes('"'), false, 'gequotet statt ersetzt — Eos versteht das nicht');

  const datei = buildConsoleFile([boese], 'eos-lightwright', ctx);
  const zeile = datei.split('\r\n')[1].split('\t');
  assert.equal(zeile.length, FORMATS['eos-lightwright'].columns.length,
    'die Zeile hat eine andere Spaltenzahl als der Kopf');

  // Dasselbe fuer einen Zeilenumbruch im Wert: er wuerde die Zeile spalten.
  const umbruch = voll('b', 2, { zweck: 'Front\r\nWarm' });
  const c2 = fieldContext([umbruch], [], 'sacn', 'ABC');
  const d2 = buildConsoleFile([umbruch], 'eos-lightwright', c2);
  assert.equal(d2.split('\r\n').filter(Boolean).length, 2, 'ein Umbruch im Wert hat die Zeile gespalten');

  // Und in der CSV wird das Komma ersetzt, nicht der Tabulator.
  const kommaZweck = voll('c', 3, { zweck: 'Front, warm' });
  const c3 = fieldContext([kommaZweck], [], 'sacn', 'ABC');
  assert.equal(machineCell('purpose', kommaZweck, c3, FORMATS.csv), 'Front  warm');
  assert.equal(
    buildConsoleFile([kommaZweck], 'csv', c3).split('\r\n')[1].split(',').length,
    FORMATS.csv.columns.length,
  );
}

// ─── 6. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = ohneKommentare('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /exportPreflight\(fixtures, consoleTarget\)/,
    'die Vorschau wird nicht gerechnet');
  assert.match(dialog, /buildConsoleFile\(fixtures, consoleTarget, feldKontext\)/,
    'die Datei wird nicht gebaut oder kennt den Feld-Zusammenhang nicht');
  assert.match(dialog, /pultVorschau\.dropped\.length > 0/, 'was fehlt, wird nicht gezeigt');
  assert.match(dialog, /pultVorschau\.unverifiable > 0/, 'die Ungewissheit wird verschwiegen');
  assert.match(dialog, /DROP_LABEL\[r\]/, 'die Gruende stehen nicht dabei');
  // NICHT ueber `downloadCsv`: dort haengt eine Byte-Order-Mark vorn, und die
  // stuende in einer Datei, die ein Pult feldweise liest, im ersten
  // Spaltennamen.
  assert.doesNotMatch(dialog, /downloadCsv\([^)]*consoleFileName/, 'die Pult-Datei geht ueber den CSV-Weg mit BOM');
  assert.match(dialog, /consoleFileName\(projectName, consoleTarget\)/, 'der Dateiname kommt nicht aus dem Modul');
  // Literale i18n-Schluessel — ein Template waere fuer `i18n:check` unsichtbar.
  assert.doesNotMatch(dialog, /t\(`(dlg\.)?sch\.exp\.console/, 'Template-Schluessel — der i18n-Guard sieht sie nicht');
  assert.match(dialog, /'(dlg\.)?sch\.exp\.console'/);

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['console:check'], 'console:check fehlt in package.json');
}

console.log('OK console-export-check: die Pult-Datei sagt vorher, was sie nicht enthaelt.');
