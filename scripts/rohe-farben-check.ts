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
// Gemessen werden `background`, `background-color` und `color`: die FLAECHEN
// und die SCHRIFT — an JEDER Stelle der Zeile, nicht nur am Anfang. Nicht
// gemessen werden `border-color`, `box-shadow`, `fill` und Freunde — ein
// Waechter, der mehr verspricht als er prueft, ist schlimmer als einer mit
// engem Zuschnitt.
//
// „AN JEDER STELLE DER ZEILE" ist eine Korrektur vom 2026-09-11 und kein
// Feinschliff. Die erste Fassung verankerte am Zeilenanfang (`^\s*`). Ein
// Stilblatt schreibt aber massenhaft Einzeiler —
// `.sp-ist-start { background: rgba(…); color: #8fe0ac; }` —, und die sah
// sie nicht. Dahinter lagen ELF echte Stellen, darunter
// `.tb-btn.primary { … color: #132040; }`: im Hell-Thema wird `--accent`
// genau dieses Navy, der Primaerknopf stand also navy auf navy. Der achte
// unlesbare Zustand, gefunden vom Waechter, nachdem er sehen durfte.
//
// Derselbe blinde Fleck sass im Selektor-Finder: er suchte die letzte Zeile,
// die auf `{` ENDET, und fand bei einem Einzeiler gar nichts — die
// Ausnahmeliste griff dort also nie. Das erklaert auch die alte Notiz, die
// Liste sei „laenger als ihre Ausbeute": sie war es nicht, sie wurde nur
// nicht gefragt.
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

/**
 * Eine Flaechen- oder Schrift-Deklaration mit rohem Hex, irgendwo in der
 * Zeile.
 *
 * `(?<![\w-])` vor dem Namen ist der Unterschied zwischen `color` und
 * `border-color`: ohne die Absicherung faende das Muster in `border-color:
 * #333` das Wort `color` und schluege an — eine falsche Anschuldigung, und
 * die kostet einen Waechter sein Ansehen schneller als ein Durchrutscher.
 */
export const ROH = /(?<![\w-])(?:background(?:-color)?|color)\s*:\s*#[0-9a-fA-F]{3,8}\b/;

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

/**
 * Der Selektor, zu dem eine Zeile gehoert — grob, aber ausreichend.
 *
 * ZUERST die Zeile selbst: steht auf ihr eine oeffnende Klammer, ist der
 * Selektor der Teil davor. Das ist der Einzeiler-Fall
 * (`.gel-type-ctb { … }`), und ohne ihn lief die Suche nach oben weiter,
 * fand ein `}` und gab '' zurueck — die Ausnahmeliste wurde dann gar nicht
 * erst gefragt.
 */
export function selektorVon(zeilen: string[], index: number): string {
  const eigen = zeilen[index];
  const auf = eigen.indexOf('{');
  if (auf >= 0 && eigen.slice(0, auf).trim()) return eigen.slice(0, auf).trim();
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
assert.ok(ROH.test('.x { background: rgba(0,0,0,.1); color: #8fe0ac; }'), 'das Muster sieht den Einzeiler nicht');
assert.ok(ROH.test('  background-color: #123456;'), 'das Muster sieht `background-color` nicht');
assert.ok(!ROH.test('  background: var(--panel);'), 'das Muster schlaegt auf eine Variable an');
assert.ok(!ROH.test('  border-color: #333;'), 'das Muster misst mehr, als der Kopf zusagt');
assert.ok(!ROH.test('.y { border-color: #3f9d63; }'), 'das Muster liest `color` aus `border-color` heraus');
assert.ok(!ROH.test('  outline-color: #333;'), 'das Muster liest `color` aus `outline-color` heraus');

// 2. Die Ausnahmen greifen wirklich — sonst waere die Liste Zierde.
//
//    Gemessen am 2026-09-11, NACH der Korrektur an Muster und
//    Selektor-Finder: ELF. Vorher waren es drei, und daneben stand die
//    Erklaerung, die Ausnahmeliste sei „laenger als ihre Ausbeute", weil
//    Gel- und Strahlen-Regeln ihre Werte in Einzeilern setzen. Die
//    Beobachtung stimmte, die Erklaerung war falsch herum: nicht die Liste
//    war zu lang, der Waechter war zu blind. Jetzt greifen die Eintraege,
//    fuer die sie geschrieben wurden.
//
//    Die untere Schranke steht bewusst unter der gemessenen Zahl: sie soll
//    anschlagen, wenn die Ausnahmen GAR NICHT mehr greifen, und nicht bei
//    jeder Gel-Farbe, die jemand ergaenzt.
assert.ok(inErlaubt >= 6, `nur ${inErlaubt} erlaubte Stellen erkannt — die Ausnahmen greifen nicht`);

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
  // Der Einzeiler — der Fall, an dem die Ausnahmeliste vorher vorbeilief.
  assert.equal(selektorVon(['.gel-type-ctb { background: #4488ff; }'], 0), '.gel-type-ctb');
  // Und er darf die mehrzeilige Form nicht kaputtmachen: eine Zeile, die MIT
  // `{` endet, hat vor der Klammer den Selektor und danach nichts.
  assert.equal(selektorVon(['.c {', '  color: #fff;'], 1), '.c');
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
