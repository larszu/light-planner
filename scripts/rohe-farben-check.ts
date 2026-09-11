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
// ZWEITENS, seit dem 2026-09-11: eine Eigenschaft, die SICH SELBST nennt.
// `--overlay: var(--overlay)` ist laut Spezifikation zyklisch und damit
// ungueltig; jedes `var(--overlay)` faellt danach auf „keine Farbe" zurueck.
// Genau das ist beim Umbau entstanden — der Lauf, der die Hexwerte aus den
// Regeln in die Token zog, hat die eben geschriebene Definition gleich mit
// ersetzt. Der Befund traf das Dunkel-Thema, also das, in dem gearbeitet
// wird, und war trotzdem unsichtbar: eine transparente Flaeche sieht nicht
// nach Defekt aus, sondern nach Absicht.
//
// Diese Form gehoert hierher und nicht in einen eigenen Lauf: sie entsteht
// bei derselben Arbeit, an derselben Stelle, und wird von der :root-Ausnahme
// dieses Waechters ausdruecklich gedeckt — er hatte also die Tuer offen, an
// der sie hereinkam.
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

/**
 * Eigenschaften, die sich selbst als Wert nennen.
 *
 * Als eigene Funktion, damit die Gegenprobe sie mit einem erfundenen
 * Stilblatt aufrufen kann statt mit dem echten — ein Waechter, der nur am
 * gesunden Zustand gemessen wird, ist nicht gemessen.
 */
export function selbstbezuege(quelle: string): string[] {
  const treffer: string[] = [];
  quelle.split('\n').forEach((zeile, i) => {
    const m = /^\s*--([a-z0-9-]+)\s*:\s*(.*)$/i.exec(zeile);
    if (!m) return;
    if (new RegExp(`var\\(\\s*--${m[1]}\\s*[,)]`, 'i').test(m[2])) {
      treffer.push(`App.css:${i + 1}  ${zeile.trim()}`);
    }
  });
  return treffer;
}

const zyklen = selbstbezuege(css);

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

// 2b. Die Zyklus-Messung faengt wirklich, wonach sie sucht — an einem
//     erfundenen Stilblatt, nicht am echten. Der Fall, der sie ausgeloest
//     hat, steht als erste Probe drin.
{
  assert.deepEqual(
    selbstbezuege(':root {\n  --overlay: var(--overlay);\n}').length,
    1,
    'die Zyklus-Messung sieht den Fall nicht, der sie ausgeloest hat',
  );
  assert.equal(
    selbstbezuege('  --a: var(--a, #fff);').length,
    1,
    'ein Selbstbezug mit Rueckfallwert ist genauso zyklisch und muss auffallen',
  );
  assert.equal(selbstbezuege('  --a: var(--b);').length, 0, 'die Messung schlaegt auf eine FREMDE Variable an');
  assert.equal(selbstbezuege('  --accent: #132040;').length, 0, 'die Messung schlaegt auf einen Hexwert an');
  // Der Praefix-Fall: `--a` darf nicht in `--accent` hineinlesen.
  assert.equal(selbstbezuege('  --a: var(--accent);').length, 0, 'die Messung vergleicht Namen nur als Praefix');
}

// 3. Der Selektor-Finder findet den Selektor und nicht irgendetwas.
{
  const probe = ['.a {', '  color: #fff;', '}', '.b {', '  background: #000;', '}'];
  assert.equal(selektorVon(probe, 1), '.a');
  assert.equal(selektorVon(probe, 4), '.b');
}

if (zyklen.length > 0) {
  console.error(`\n${zyklen.length} Eigenschaft(en) nennen sich selbst als Wert:`);
  for (const z of zyklen) console.error(`  ${z}`);
  console.error(
    '\nDas ist laut Spezifikation zyklisch und damit ungueltig: jedes `var(...)` ' +
      'darauf faellt auf „keine Farbe" zurueck. Der Wert gehoert ausgeschrieben hin.',
  );
  process.exit(1);
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
  `farben:check ok — keine rohe Flaeche ausserhalb der Token-Bloecke (${inErlaubt} erlaubte Stellen), kein Selbstbezug.`,
);
