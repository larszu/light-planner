// ───────────────────────────────────────────────────────────────────────────
// Etiketten aus denselben Daten wie die Papiere (Bedarf 148, P4).
// Lauf: `npm run labels:check`
//
//   > Dimmer and distro labels have been worth writing dedicated desktop
//   > software for across at least a decade […] Current asks: custom
//   > background colours WITH PRESETS FOR COMMON LABEL STOCKS […]
//   > Label output is A PRINT VIEW OVER THE EXISTING circuit/dimmer/channel
//   > MODEL.
//
// Belege: `Charlie9830/Dimmer-Labels-Wizard` mit `#24` und `#14` (2015,
// Projekt 2017 eingestellt) und `jkarp7/showstack#41` (2025-12-28), das
// denselben Bedarf zehn Jahre spaeter noch einmal stellt.
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. EIN ETIKETT IST EINE SICHT, KEIN ZWEITES MODELL. Jede Zeile nennt eine
//     Feld-Kennung aus dem Katalog (Bedarf 143). Wer hier eigene Zugriffe
//     schreibt, hat das zweite Modell angelegt — und am Ladetag klebt am
//     Verteiler etwas anderes, als auf dem Blatt steht.
//
//  2. NICHTS WIRD GEKÜRZT. Ein abgeschnittener Kreis ist ein FALSCHES
//     Etikett, und ein falsches Etikett am Verteiler ist schlimmer als ein
//     leeres. Was nicht passt, wird gemeldet — nicht beschnitten.
//
//  3. DIE PASSFORM IST EINE SCHÄTZUNG UND SAGT DAS. Ohne Textmessung lässt
//     sich die Breite einer Zeichenkette nicht wissen.
//
//  4. DER BOGEN GEHT AUF. Zeilen × Spalten Zellen je Seite, keine mehr und
//     keine weniger — sonst druckt der Satz versetzt, und der Bogen ist
//     Verbrauchsmaterial.
//
//  5. DAS ERSTE FREIE ETIKETT ZÄHLT AB EINS. Auf einem Bogen zählt niemand
//     bei null. Die schon abgezogenen Stellen bleiben leer, und der Rest auf
//     dem letzten Bogen ist der Startwert fürs nächste Mal.
//
//  6. DERSELBE PLAN ERGIBT ZWEIMAL DENSELBEN BOGEN. Ohne feste Ordnung klebte
//     beim zweiten Druck ein anderes Etikett an derselben Stelle.
//
//  7. DIE BOGEN-MASSE SIND ECHT. Spalten × Breite plus Rand passen auf A4.
//     Ein Bogen, dessen Zahlen nicht auf die Seite passen, druckt garantiert
//     daneben.
//
//  8. DER WEG IST VERDRAHTET — samt Druck-Regeln, ohne die der Dialograhmen
//     über dem ersten Etikett läge.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AVG_GLYPH_RATIO, BODY_MM, FIT_BASIS_NOTE, HEAD_MM, LABEL_DEFS, PADDING_MM, STOCKS,
  buildLabel, findLabelDef, findStock, fitsChars, labelSheet,
} from '../src/core/labelSheet.ts';
import { ALL_FIELDS, NOT_SET, fieldContext } from '../src/core/reportFields.ts';
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

/**
 * Stylesheet OHNE Kommentare.
 *
 * Aus demselben Grund und mit demselben Fund wie `ohneKommentare`: die
 * Begruendung im Kopf des Etiketten-Blocks ZITIERT `@page { margin: 0 }`, und
 * eine Pruefung ueber den ganzen Text war damit gruen, auch nachdem die Regel
 * selbst entfernt war. Ein Waechter, den sein eigener Kommentar zufrieden
 * stellt, prueft nichts.
 */
const cssOhneKommentare = (rel: string): string =>
  lies(rel).replace(/\/\*[\s\S]*?\*\//g, '');

const lampe = (id: string, kanal?: number, typ = 'Source Four 26', zweck?: string): PlacedFixture => ({
  id,
  fixture: {
    id: 't', name: typ, manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp',
  },
  x: 1, y: 2, mountingHeight: 6, aimX: 1, aimY: 3, bodyRotation: 0, dimming: 100,
  ...(kanal !== undefined ? { channel: kanal } : {}),
  ...(zweck !== undefined ? { purpose: zweck } : {}),
} as PlacedFixture);

const gross = STOCKS.find((s) => s.id === 'l7163')!;
const klein = STOCKS.find((s) => s.id === 'l7651')!;

// ─── 1. Ein Etikett ist eine Sicht, kein zweites Modell ────────────────────
{
  const bekannt = new Set<string>(ALL_FIELDS);
  for (const d of LABEL_DEFS) {
    assert.ok(d.lines.length > 0, `${d.id} ohne Zeilen`);
    for (const f of d.lines) {
      assert.ok(bekannt.has(f), `${d.id}: Feld „${f}" gibt es im Katalog nicht`);
    }
    assert.ok(d.purpose.length > 20, `${d.id} ohne Zweck`);
    assert.ok(d.label.length > 2, `${d.id} ohne Namen`);
  }
  assert.equal(new Set(LABEL_DEFS.map((d) => d.id)).size, LABEL_DEFS.length);

  // Und der Wert kommt wirklich aus dem Katalog: dieselbe Kanalnummer, die
  // auf dem Blatt steht.
  const f = lampe('a', 42);
  const ctx = fieldContext([f], [], 'sacn', 'ABC');
  const lab = buildLabel(findLabelDef('channel')!, f, ctx, gross);
  assert.equal(lab.lines[0].text, '42');
  // Ein fehlender Wert traegt dasselbe Zeichen wie auf dem Blatt und nicht
  // eine leere Zelle: wer am Verteiler nichts liest, weiss sonst nicht, ob
  // dort nichts ist oder ob niemand nachgesehen hat.
  const ohne = buildLabel(findLabelDef('channel')!, lampe('b'), ctx, gross);
  assert.equal(ohne.lines[0].text, NOT_SET);
}

// ─── 2. Nichts wird gekuerzt ───────────────────────────────────────────────
{
  // 32 Zeichen: passt (geschaetzt) auf den breiten Bogen und nicht auf den
  // kleinen. Genau dazwischen muss der Test liegen, sonst prueft er nur, dass
  // ueberhaupt irgendetwas ueberlaeuft.
  const langerZweck = 'Frontlicht warm auf den Solisten';
  const f = lampe('a', 1, 'Source Four 26', langerZweck);
  const ctx = fieldContext([f], [], 'sacn', 'ABC');
  const lab = buildLabel(findLabelDef('channel')!, f, ctx, klein);
  const zweckZeile = lab.lines.find((l) => l.field === 'purpose')!;
  // Der Text ist VOLLSTAENDIG da, obwohl er nicht passt.
  assert.equal(zweckZeile.text, langerZweck, 'der Text wurde gekuerzt');
  assert.equal(zweckZeile.fits, false, 'der zu lange Text gilt als passend');
  assert.equal(lab.overflows, true);
  assert.equal(zweckZeile.text.includes('…'), false, 'gekuerzt mit Auslassungszeichen');

  // Und die Gegenprobe: auf dem breiten Bogen passt derselbe Text.
  const weit = buildLabel(findLabelDef('channel')!, f, ctx, gross);
  assert.equal(weit.lines.find((l) => l.field === 'purpose')!.fits, true);
  assert.equal(weit.overflows, false);

  // Der Satz zaehlt, wie viele ueberlaufen — und nicht nur, DASS eines tut.
  const satz = labelSheet(findLabelDef('channel')!, [f, lampe('b', 2)], ctx, klein);
  assert.equal(satz.overflowing, 1);
  assert.equal(satz.count, 2);
}

// ─── 3. Die Passform ist eine Schaetzung und sagt das ──────────────────────
{
  assert.ok(AVG_GLYPH_RATIO > 0.3 && AVG_GLYPH_RATIO < 1, 'unplausible Zeichenbreite');
  assert.ok(HEAD_MM > BODY_MM, 'die erste Zeile ist nicht die grosse');
  // Der Satz steht im Modul und nicht nur im Kommentar, damit die Oberflaeche
  // ihn zeigen kann, ohne ihn ein zweites Mal zu formulieren.
  assert.match(FIT_BASIS_NOTE, /geschätzt/);
  assert.match(FIT_BASIS_NOTE, /gekürzt/);
  assert.ok(FIT_BASIS_NOTE.length > 80);

  // Mehr Platz heisst mehr Zeichen, kleinere Schrift heisst mehr Zeichen.
  assert.ok(fitsChars(gross, BODY_MM) > fitsChars(klein, BODY_MM));
  assert.ok(fitsChars(gross, BODY_MM) > fitsChars(gross, HEAD_MM));
  // Und nie null: eine Zelle, in die kein Zeichen passt, waere kein Etikett.
  for (const st of STOCKS) {
    assert.ok(fitsChars(st, HEAD_MM) >= 1, st.id);
    assert.ok(PADDING_MM * 2 < st.widthMm, `${st.id}: der Innenabstand frisst die Breite`);
  }

  // DER INNENABSTAND ZAEHLT MIT. Der Text steht nicht am Zellenrand, sondern
  // hinter `PADDING_MM` — wer ihn bei der Rechnung weglaesst, haelt ein
  // Etikett fuer passend, das gedruckt beschnitten ist. Nachgerechnet an
  // einem Text, der genau dazwischen liegt: er passt in die volle Breite,
  // aber nicht in die um den Abstand verringerte.
  const volleBreite = Math.floor(gross.widthMm / (BODY_MM * AVG_GLYPH_RATIO));
  const mitAbstand = fitsChars(gross, BODY_MM);
  assert.ok(mitAbstand < volleBreite, 'der Innenabstand aendert die Passform nicht');
  const dazwischen = 'x'.repeat(mitAbstand + 1);
  assert.ok(dazwischen.length <= volleBreite, 'der Testtext liegt nicht zwischen den beiden Breiten');
  const knapp = lampe('knapp', 1, 'Source Four 26', dazwischen);
  const cKnapp = fieldContext([knapp], [], 'sacn', 'ABC');
  assert.equal(
    buildLabel(findLabelDef('channel')!, knapp, cKnapp, gross)
      .lines.find((l) => l.field === 'purpose')!.fits,
    false,
    'ein Text, der nur ohne Innenabstand passt, gilt als passend',
  );
}

// ─── 4. Der Bogen geht auf ─────────────────────────────────────────────────
{
  const ctx = fieldContext([], [], 'sacn', 'ABC');
  const proBogen = gross.columns * gross.rows;
  const lampen = Array.from({ length: proBogen + 3 }, (_, i) => lampe(`f${i}`, i + 1));
  const c = fieldContext(lampen, [], 'sacn', 'ABC');
  const satz = labelSheet(findLabelDef('channel')!, lampen, c, gross);
  assert.equal(satz.pages.length, 2);
  for (const p of satz.pages) {
    assert.equal(p.cells.length, proBogen, 'eine Seite hat die falsche Zellenzahl');
  }
  // Der zweite Bogen ist bis auf drei Etiketten leer — und die leeren Zellen
  // sind wirklich leer und nicht weggelassen.
  assert.equal(satz.pages[1].cells.filter(Boolean).length, 3);
  assert.equal(satz.pages[1].cells.filter((x) => x === null).length, proBogen - 3);
  // Kein Etikett geht verloren.
  assert.equal(satz.pages.flatMap((p) => p.cells).filter(Boolean).length, lampen.length);

  // Ohne Leuchten: kein Bogen, und kein Rest, den es nicht gibt.
  const leer = labelSheet(findLabelDef('channel')!, [], ctx, gross);
  assert.equal(leer.pages.length, 0);
  assert.equal(leer.count, 0);
  assert.equal(leer.leftover, 0, 'ein Rest auf einem Bogen, den es nicht gibt');
}

// ─── 5. Das erste freie Etikett zaehlt ab eins ─────────────────────────────
{
  const lampen = Array.from({ length: 3 }, (_, i) => lampe(`f${i}`, i + 1));
  const ctx = fieldContext(lampen, [], 'sacn', 'ABC');
  const satz = labelSheet(findLabelDef('channel')!, lampen, ctx, gross, 5);
  assert.equal(satz.startAt, 5);
  // Die vier abgezogenen Stellen bleiben leer, dann kommen die drei Etiketten.
  assert.deepEqual(satz.pages[0].cells.slice(0, 4), [null, null, null, null]);
  assert.equal(satz.pages[0].cells[4]?.fixtureId, 'f0');
  // Der Rest auf dem letzten Bogen ist der Startwert fuers naechste Mal.
  const proBogen = gross.columns * gross.rows;
  assert.equal(satz.leftover, proBogen - 7);

  // Null und negative Werte gibt es auf einem Bogen nicht — sie werden auf 1
  // gebracht, statt eine Zelle vor dem Anfang zu belegen.
  assert.equal(labelSheet(findLabelDef('channel')!, lampen, ctx, gross, 0).startAt, 1);
  assert.equal(labelSheet(findLabelDef('channel')!, lampen, ctx, gross, -3).startAt, 1);
  // Und ein Startwert hinter dem letzten Etikett des Bogens ebenso wenig.
  assert.equal(labelSheet(findLabelDef('channel')!, lampen, ctx, gross, 999).startAt, proBogen);

  // Genau aufgehend: der Rest ist ein voller Bogen weniger, nicht null-modulo.
  const voll = Array.from({ length: proBogen }, (_, i) => lampe(`v${i}`, i + 1));
  const c2 = fieldContext(voll, [], 'sacn', 'ABC');
  const genau = labelSheet(findLabelDef('channel')!, voll, c2, gross);
  assert.equal(genau.pages.length, 1);
  assert.equal(genau.leftover, 0, 'ein voller Bogen meldet einen Rest');
}

// ─── 6. Derselbe Plan ergibt zweimal denselben Bogen ───────────────────────
{
  const lampen = [lampe('c', 3), lampe('a', 1), lampe('b', 2)];
  const ctx = fieldContext(lampen, [], 'sacn', 'ABC');
  const eins = labelSheet(findLabelDef('channel')!, lampen, ctx, gross);
  const zwei = labelSheet(findLabelDef('channel')!, [...lampen].reverse(), ctx, gross);
  assert.deepEqual(
    zwei.pages[0].cells.map((c) => c?.fixtureId ?? null),
    eins.pages[0].cells.map((c) => c?.fixtureId ?? null),
    'die Reihenfolge haengt an der Einfuegereihenfolge',
  );
  assert.deepEqual(eins.pages[0].cells.slice(0, 3).map((c) => c!.fixtureId), ['a', 'b', 'c']);

  // Und der letzte Unterschied: zwei Leuchten ohne Kanal haben trotzdem eine
  // feste Reihenfolge, und sie stehen HINTEN — was fehlt, ist das, was noch
  // zu tun ist.
  const ohne = [lampe('z'), lampe('y'), lampe('m', 1)];
  const c3 = fieldContext(ohne, [], 'sacn', 'ABC');
  const a = labelSheet(findLabelDef('channel')!, ohne, c3, gross);
  const b = labelSheet(findLabelDef('channel')!, [...ohne].reverse(), c3, gross);
  assert.deepEqual(
    a.pages[0].cells.slice(0, 3).map((c) => c!.fixtureId),
    b.pages[0].cells.slice(0, 3).map((c) => c!.fixtureId),
  );
  assert.equal(a.pages[0].cells[0]!.fixtureId, 'm', 'die Leuchte mit Kanal steht nicht vorn');
}

// ─── 7. Die Bogen-Masse sind echt ──────────────────────────────────────────
{
  const A4_BREIT = 210;
  const A4_HOCH = 297;
  for (const st of STOCKS) {
    assert.ok(st.columns >= 1 && st.rows >= 1, st.id);
    const breite = st.marginLeftMm + st.columns * st.widthMm;
    const hoehe = st.marginTopMm + st.rows * st.heightMm;
    assert.ok(breite <= A4_BREIT, `${st.id}: ${breite} mm breit — passt nicht auf A4`);
    assert.ok(hoehe <= A4_HOCH, `${st.id}: ${hoehe} mm hoch — passt nicht auf A4`);
    // Und der Rand ist wirklich ein Rand: ohne ihn saesse die erste Zeile am
    // Blattrand, wo kein Drucker hinkommt.
    assert.ok(st.marginLeftMm > 0 && st.marginTopMm > 0, st.id);
    assert.ok(st.note.length > 20, `${st.id} ohne Begruendung`);
  }
  assert.equal(new Set(STOCKS.map((s) => s.id)).size, STOCKS.length);
  assert.equal(findStock('gibtsnicht'), undefined);
}

// ─── 8. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = ohneKommentare('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /labelSheet\(etikettenArt, fixtures, feldKontext, bogen, labelStart\)/,
    'der Satz wird nicht gerechnet oder kennt den Feld-Zusammenhang nicht');
  assert.match(dialog, /etiketten\.overflowing > 0/, 'was nicht passt, wird nicht gemeldet');
  assert.match(dialog, /FIT_BASIS_NOTE/, 'die Schaetzung wird als Tatsache ausgegeben');
  assert.match(dialog, /etiketten\.leftover/, 'der Rest auf dem letzten Bogen steht nirgends');
  // Die Masse kommen aus dem Modell und stehen nicht ein zweites Mal im CSS:
  // ein Bogen ist ein physischer Gegenstand, und zwei Wahrheiten ueber seine
  // Breite waeren eine zu viel.
  assert.match(dialog, /bogen\.marginLeftMm \+ spalte \* bogen\.widthMm/, 'die Spalten werden nicht aus dem Bogen gerechnet');
  assert.match(dialog, /bogen\.marginTopMm \+ zeile \* bogen\.heightMm/, 'die Zeilen werden nicht aus dem Bogen gerechnet');
  // Literale i18n-Schluessel — ein Template waere fuer `i18n:check` unsichtbar.
  assert.doesNotMatch(dialog, /t\(`(dlg\.)?sch\.lbl\./, 'Template-Schluessel — der i18n-Guard sieht sie nicht');
  assert.match(dialog, /'(dlg\.)?sch\.lbl\.stock'/);

  // Die Druck-Regeln. Ohne sie laege der Dialograhmen ueber dem ersten
  // Etikett und der ganze Satz saesse versetzt — und ein versetzter Bogen ist
  // weggeworfen.
  const css = cssOhneKommentare('../src/App.css');
  const druckBlock = /@media print\s*\{([\s\S]*)\}/.exec(css)?.[1];
  assert.ok(druckBlock, 'keine Druck-Regeln');
  // Geprueft wird INNERHALB des Druck-Blocks. Dass der Klassenname
  // irgendwo im Stylesheet vorkommt, sagt nichts: er steht auch in den
  // Bildschirm-Regeln, und eine Pruefung ueber die ganze Datei bliebe gruen,
  // waehrend im Druck nichts mehr sichtbar ist.
  assert.match(druckBlock!, /body \* \{[^}]*visibility:\s*hidden/,
    'im Druck steht der Dialog mit auf dem Bogen');
  assert.match(druckBlock!, /\.label-print-area[^{]*\{[^}]*visibility:\s*visible/,
    'im Druck ist der Bogen selbst unsichtbar');
  assert.match(druckBlock!, /@page\s*\{[^}]*margin:\s*0/, 'der Druckertreiber rueckt zusaetzlich ein');
  assert.match(druckBlock!, /\.label-cell\s*\{\s*border:\s*none/, 'die Schnittmarken werden mitgedruckt');
  // Und der Bereich existiert wirklich in der Ansicht.
  assert.match(dialog, /className="label-print-area"/, 'der Druckbereich ist im Dialog nicht ausgezeichnet');

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['labels:check'], 'labels:check fehlt in package.json');
}

console.log('OK label-sheet-check: die Etiketten lesen dieselben Felder wie die Blaetter — und kuerzen nichts.');
