// ───────────────────────────────────────────────────────────────────────────
// Keine rohe Flaechenfarbe mehr in `App.css` — gemessen, nicht zugesagt
// (B-70). Lauf: `npm run farben:check`.
//
// ─── WOGEGEN DIESER LAUF STEHT ────────────────────────────────────────────
//
// Nicht gegen den Umbau — der ist passiert und steht im Diff. Gegen das
// ZURUECKRUTSCHEN, und zwar gegen eine besonders stille Form davon.
//
// Solange die App nur dunkel war, war ein `background: #1d1d2c` zufaellig
// richtig; man sah ihm nichts an. Mit dem Hell-Thema ist jede solche Stelle
// ein Defekt, der sich NICHT von selbst meldet: die Variablen springen um,
// der Hexwert nicht, und das Ergebnis ist eine dunkle Insel auf hellem
// Grund. Wer im Dunkel-Thema arbeitet — also fast jeder, der hier etwas
// baut — sieht es nie.
//
// ─── WAS ER PRUEFT UND WAS NICHT ──────────────────────────────────────────
//
// Gemessen werden `background` und `color`: die FLAECHEN und die SCHRIFT.
// Nicht gemessen werden `border-color`, `box-shadow`, `fill` und Freunde —
// dort steht heute ohnehin nichts Rohes, und ein Waechter, der mehr
// verspricht als er prueft, ist schlimmer als einer mit engem Zuschnitt.
//
// AUSGENOMMEN, und jede Ausnahme mit Grund:
//
//   Der :root-Block          dort STEHEN die Werte. Sie zu verbieten hiesse,
//                            das Thema zu verbieten.
//   Der Hell-Block           dasselbe, fuer den zweiten Satz.
//   `.gel-*`                 Gel-Farben bedeuten etwas. Ein CTB-Filter ist
//                            blau, auch auf weissem Grund.
//   `.label-sheet` & Druck   Papier ist weiss, auch nachts.
//   `.ba-cut`, `.beam-*`     Strahlen-Darstellung: Inhalt, nicht Verpackung.
//
// Was der Lauf NICHT kann: er liest Zeichen. Ob die Farbe hinter einer
// Variablen im Hell-Thema lesbar ist, sieht er nicht — Kontrast misst er
// nicht. Genau daran ist er auch vorbeigelaufen, als sieben Zustaende
// weisse Schrift auf die Off-White-Aktionsflaeche schrieben: das waren
// gueltige Hexwerte an der richtigen Stelle, nur unlesbar.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8');

/** Eine Zeile, die eine Flaeche oder Schrift mit rohem Hex setzt. */
export const ROH = /^\s*(?:background|color)\s*:\s*#[0-9a-fA-F]{3,8}\b/;

/**
 * Die Bloecke, in denen rohes Hex richtig ist — mit Grund, siehe Kopf.
 *
 * Als Praefix des SELEKTORS, nicht als Zeilennummer: eine Zeilennummer
 * veraltet beim naechsten Einschub, und dann steht die Ausnahme auf einer
 * Regel, die sie nie gemeint hat.
 */
export const ERLAUBT = [
  ':root',
  '.gel-',
  '.label-',
  '.ba-',
  '.beam-',
  '@media print',
  '@page',
];

/** Der Selektor, zu dem eine Zeile gehoert — grob, aber ausreichend. */
export function selektorVon(zeilen: string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    const z = zeilen[i].trim();
    if (z.endsWith('{')) return z.slice(0, -1).trim();
    if (z === '}') return '';
  }
  return '';
}

const zeilen = css.split('\n');
const funde: string[] = [];
let inErlaubt = 0;

for (let i = 0; i < zeilen.length; i += 1) {
  if (!ROH.test(zeilen[i])) continue;
  const sel = selektorVon(zeilen, i);
  if (ERLAUBT.some((e) => sel.includes(e))) {
    inErlaubt += 1;
    continue;
  }
  funde.push(`App.css:${i + 1}  ${zeilen[i].trim()}   (in \`${sel || '?'}\`)`);
}

// ─── Gegenproben ───────────────────────────────────────────────────────────

// 0. Es wurde ueberhaupt gelesen. Ohne diese Zeile waere ein leerer Pfad
//    still gruen — die schlimmste Sorte gruen, weil sie nach Arbeit aussieht.
assert.ok(css.length > 40_000, `App.css ist nur ${css.length} Zeichen gross — wurde die Datei gelesen?`);
assert.ok(zeilen.length > 1_000, `nur ${zeilen.length} Zeilen — der Scan ist kaputt`);

// 1. Das Muster faengt wirklich, wonach es sucht. Ein Muster, das nichts
//    mehr findet, meldet ebenfalls null Funde.
assert.ok(ROH.test('  background: #1d1d2c;'), 'das Muster faengt keine rohe Flaeche');
assert.ok(ROH.test('  color: #fff;'), 'das Muster faengt keine rohe Schrift');
assert.ok(!ROH.test('  background: var(--panel);'), 'das Muster schlaegt auf eine Variable an');
assert.ok(!ROH.test('  border-color: #333;'), 'das Muster misst mehr, als der Kopf zusagt');

// 2. Die Ausnahmen greifen wirklich — sonst waere die Liste Zierde.
//
//    Gemessen am 2026-09-11: DREI (das Etikettenblatt und sein Druckbereich,
//    `.label-sheet` und `.label-print-area`). Die erste Fassung dieser Zeile
//    verlangte „mehr als 20" — eine Zahl aus dem Gefuehl, und sie fiel
//    sofort. Die Ausnahmeliste ist laenger als ihre Ausbeute, weil die
//    Gel-Farben und die Strahlen-Regeln ihre Werte in EINZEILERN setzen
//    (`.gel-type-ctb { background: …; color: …; }`), die das Muster gar
//    nicht erst sieht. Die Eintraege bleiben trotzdem stehen: sie sagen, was
//    erlaubt WAERE, und genau das ist beim naechsten Einzeiler die Auskunft,
//    die jemand braucht.
assert.ok(inErlaubt >= 3, `nur ${inErlaubt} erlaubte Stellen erkannt — die Ausnahmen greifen nicht`);

// 3. Der Selektor-Finder findet den Selektor und nicht irgendetwas.
{
  const probe = ['.a {', '  color: #fff;', '}', '.b {', '  background: #000;', '}'];
  assert.equal(selektorVon(probe, 1), '.a');
  assert.equal(selektorVon(probe, 4), '.b');
}

if (funde.length > 0) {
  console.error(`\n${funde.length} rohe Flaechen-/Schriftfarbe(n) ausserhalb der Token-Bloecke:`);
  for (const f of funde) console.error(`  ${f}`);
  console.error(
    '\nDie Variablen springen mit dem Thema um, ein Hexwert nicht — im Hell-Thema ' +
      'steht dort eine dunkle Insel auf hellem Grund. Die Rollen stehen oben in App.css.',
  );
  process.exit(1);
}

console.log(
  `farben:check ok — keine rohe Flaeche ausserhalb der Token-Bloecke (${inErlaubt} erlaubte Stellen).`,
);
