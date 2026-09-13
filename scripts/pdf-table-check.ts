// ───────────────────────────────────────────────────────────────────────────
// Die Listen als PDF (#123).
// Lauf: `npm run pdf:check`
//
// NUTZER-MELDUNG: „Man muss Patchlisten und alle anderen, die man aktuell nur
// als CSV exportieren kann, auch als schoen aufbereitete PDF exportieren
// koennen."
//
// WAS HIER GEPRUEFT WIRD, und warum jede Zeile davon noetig ist:
//
//  1. ES IST EIN PDF. Beginnt mit `%PDF-`, endet mit `%%EOF`. Ohne diese
//     Zeile koennte die Datei alles sein — sie traegt ja die Endung, nicht
//     der Inhalt.
//
//  2. DER TEXT STEHT DRIN, NICHT EIN BILD DAVON. Jede Kopfzeile und
//     Stichproben aus den Daten sind als Zeichenkette auffindbar. Das ist der
//     eigentliche Unterschied zur vorhandenen `jpegToPdfBlob`: die schreibt
//     ein Foto der Seite, und darin steht kein einziges Wort.
//
//  3. LANGE LISTEN BEKOMMEN MEHRERE SEITEN. Eine Liste, die nach der ersten
//     Seite aufhoert, ist die gefaehrlichste Form von „exportiert": sie sieht
//     vollstaendig aus. Geprueft wird an der Seitenzahl im Katalog UND an
//     einem Wert aus der letzten Zeile.
//
//  4. KEINE ZEILE LAEUFT UEBER DEN RAND. Die Spalten werden auf die
//     Seitenbreite gekuerzt; geprueft an einer Tabelle mit absurd langen
//     Zellen. Eine Zeile, die ueber den Rand laeuft, ist im PDF nicht
//     abgeschnitten — sie steht dort weiter und ueberdruckt den Rand.
//
//  5. SONDERZEICHEN BRECHEN DIE DATEI NICHT. Klammern und Gegenschraegstrich
//     beenden in einem PDF ein Text-Literal. Eine Zelle „Front (L)" haette
//     ohne Maskierung die Seite zerlegt — und zwar still: der Leser zeigt
//     dann eine leere oder halbe Seite.
//
//  6. DER STEMPEL STEHT AUF DEM BLATT (ADR-004). Wer eine Liste ausdruckt und
//     mitnimmt, muss sehen, aus welchem Stand sie stammt.
//
//  7. DER WEG IST VERDRAHTET. Die Oberflaeche bietet neben jeder CSV-Liste
//     auch die PDF an — sonst waere die Funktion gebaut und unerreichbar.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tableToPdfBlob } from '../src/utils/pdfTable.ts';
import { buildStamp } from '../src/core/documentStamp.ts';

const text = async (b: Blob): Promise<string> => {
  // Latin-1 lesen: der Zeichenstrom ist kein UTF-8, und `toString('utf8')`
  // wuerde aus jedem Oktal-Escape ein Ersatzzeichen machen.
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return s;
};

const stamp = buildStamp({
  project: 'Sommershow',
  revision: 'v3',
  current: 'aaaaaaaa',
  atRevision: 'aaaaaaaa',
  now: new Date('2026-09-13T10:00:00Z'),
});

/* ── 1 + 2: es ist ein PDF, und der Text steht drin ───────────────────────*/
const klein = await text(await Promise.resolve(tableToPdfBlob(
  { header: ['Ch', 'Fixture', 'Position'], rows: [[1, 'ETC S4', 'FOH links'], [2, 'Mac Aura', 'Truss 1']] },
  { title: 'Instrument schedule', subtitle: 'Sommershow', stamp },
)));
assert.ok(klein.startsWith('%PDF-'), 'Die Datei beginnt nicht mit %PDF-.');
assert.ok(klein.trimEnd().endsWith('%%EOF'), 'Die Datei endet nicht mit %%EOF.');
for (const wort of ['Ch', 'Fixture', 'Position', 'ETC S4', 'Mac Aura', 'FOH links']) {
  assert.ok(klein.includes(wort), `„${wort}" steht nicht als Text im PDF — ist es ein Bild geworden?`);
}
assert.ok(klein.includes('Instrument schedule'), 'Die Ueberschrift fehlt.');

/* ── 3: lange Listen bekommen mehrere Seiten ──────────────────────────────*/
const vieleZeilen = Array.from({ length: 400 }, (_, i) => [i + 1, `Fixture ${i + 1}`, `Pos ${i + 1}`]);
const gross = await text(tableToPdfBlob(
  { header: ['Ch', 'Fixture', 'Position'], rows: vieleZeilen },
  { title: 'Instrument schedule', stamp },
));
const seiten = Number(/\/Type \/Pages \/Kids \[([^\]]*)\] \/Count (\d+)/.exec(gross)?.[2] ?? 0);
assert.ok(seiten > 1, `400 Zeilen ergaben ${seiten} Seite(n) — die Liste bricht nicht um.`);
assert.ok(gross.includes('Fixture 400'), 'Die letzte Zeile fehlt — die Liste bricht ab statt umzubrechen.');
assert.ok(gross.includes(`1 / ${seiten}`), 'Die Seitenzahl steht nicht auf dem Blatt.');

/* ── 4: keine Zeile laeuft ueber den Rand ─────────────────────────────────*/
const breit = await text(tableToPdfBlob(
  {
    header: ['Kanal', 'Sehr langer Spaltenname fuer den Zweck', 'Noch einer', 'Und noch einer'],
    rows: [[1, 'X'.repeat(300), 'Y'.repeat(300), 'Z'.repeat(300)]],
  },
  { title: 'Breit', stamp },
));
// Die gesetzten Textzeilen stehen zwischen `(` und `) Tj`. Die laengste darf
// die Seitenbreite bei 8 pt Courier (0,6 em) nicht ueberschreiten.
const A4_LANG = 841.89;
const RAND = 34;
const maxZeichen = Math.floor((A4_LANG - 2 * RAND) / (8 * 0.6));
const zeilen = [...breit.matchAll(/\((.*?)\) Tj/g)].map((m) => m[1]);
assert.ok(zeilen.length > 0, 'Es wurde ueberhaupt kein Text gesetzt.');
const laengste = Math.max(...zeilen.map((z) => z.replace(/\\\d{3}/g, '.').replace(/\\(.)/g, '$1').length));
assert.ok(
  laengste <= maxZeichen,
  `Die laengste Zeile hat ${laengste} Zeichen, auf die Seite passen ${maxZeichen}.`,
);

/* ── 5: Sonderzeichen brechen die Datei nicht ─────────────────────────────*/
const heikel = await text(tableToPdfBlob(
  { header: ['Pos'], rows: [['Front (L)'], ['Back \\ Side'], ['Grad 45°'], ['Gruen & Weiss'], ['Umlaut: ä ö ü ß']] },
  { title: 'Sonderzeichen', stamp },
));
assert.ok(heikel.startsWith('%PDF-') && heikel.trimEnd().endsWith('%%EOF'), 'Sonderzeichen haben die Datei zerlegt.');
assert.ok(heikel.includes('Front \\(L\\)'), 'Die Klammer wurde nicht maskiert — das Literal endet dort.');
assert.ok(heikel.includes('Back \\\\ Side'), 'Der Gegenschraegstrich wurde nicht maskiert.');
// Umlaute als Oktal-Escape (Latin-1): ä = 228 = \344.
assert.ok(heikel.includes('\\344'), 'Der Umlaut steht nicht als WinAnsi-Oktalfolge — er faellt im Leser aus.');
// Jedes Text-Literal muss ausgeglichene, maskierte Klammern haben.
for (const z of [...heikel.matchAll(/\((.*?)\) Tj/g)].map((m) => m[1])) {
  const roh = z.replace(/\\[()\\]/g, '').replace(/\\\d{3}/g, '');
  assert.ok(!/[()]/.test(roh), `Unmaskierte Klammer im Text-Literal: ${z}`);
}

/* ── 6: der Stempel steht auf dem Blatt ───────────────────────────────────*/
assert.ok(klein.includes('Sommershow'), 'Der Projektname aus dem Stempel fehlt.');
assert.ok(klein.includes('v3'), 'Der Stand aus dem Stempel fehlt.');
assert.ok(klein.includes('aaaaaaaa'), 'Der Fingerabdruck aus dem Stempel fehlt.');

/* ── 7: der Weg ist verdrahtet ────────────────────────────────────────────*/
const dialog = readFileSync(new URL('../src/components/ScheduleDialog.tsx', import.meta.url), 'utf8');
assert.ok(dialog.includes('tableToPdfBlob'), 'ScheduleDialog ruft den PDF-Satz nicht auf.');
const pdfKnoepfe = (dialog.match(/exportTablePdf\(/g) ?? []).length;
const csvKnoepfe = (dialog.match(/exportTable\(/g) ?? []).length;
assert.ok(
  pdfKnoepfe >= csvKnoepfe,
  `${csvKnoepfe} Listen als CSV, aber nur ${pdfKnoepfe} als PDF — eine Liste hat keinen PDF-Weg.`,
);

console.log(
  `pdf:check ok — PDF-Satz belegt: Text statt Bild, ${seiten} Seiten bei 400 Zeilen, ` +
  `laengste Zeile ${laengste}/${maxZeichen} Zeichen, Sonderzeichen maskiert, Stempel auf dem Blatt, ` +
  `${pdfKnoepfe} PDF-Wege in der Oberflaeche.`,
);
console.log(
  'NICHT gemessen: wie das Blatt AUSSIEHT. Dieser Lauf liest Bytes; ob die Spalten ' +
  'im Leser angenehm stehen, sagt er nicht.',
);
