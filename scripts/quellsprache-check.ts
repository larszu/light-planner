// Die Quellsprache messen — statt sie zu behaupten (E-17/E-20).
// Lauf: `npm run lang:check`  (node --experimental-strip-types).
//
// WAS DIE QUELLSPRACHE IST. Der Text, der im JSX steht und bei fehlendem
// Schluessel erscheint: das zweite Argument von `t('key', 'Fallback')`. Nicht
// die Sprache der Oberflaeche (die waehlt der Nutzer, sobald B-13 den Schalter
// freilegt), nicht die des Woerterbuchs (das ist die Uebersetzung).
//
// DIE ENTSCHEIDUNG (Eigentuemer, 2026-09-08, E-17/E-20): die Quellsprache ist
// eine Eigenschaft des REPOS, nicht der Suite. `light-planner` und
// `cable-planner` sind deutsch-quellig; `multicam-planner` und
// `sony-camera-bridge` englisch-quellig.
//
// WARUM SIE GEMESSEN UND NICHT NUR ERKLAERT WIRD. Der Backlog vermisst den
// Schaden: ohne Festlegung "vereinheitlicht" der naechste Durchgang die
// Abweichung und fasst ~500 Zeichenketten an, weil eine andere Stelle etwas
// anderes nahelegt. Eine Zeile in einer Doku verhindert das nicht — sie wird
// gelesen oder ueberlesen. Diese Messung faellt.
//
// ZWEITE KOPIE — UND WER SIE ZUSAMMENHAELT. Der `cable-planner` fuehrt
// denselben Check als `scripts/quellsprache.mjs`; beide Repos teilen keinen
// Quellbaum. Die Suite ist der einzige Ort, an dem beide Kopien im selben Baum
// liegen, und haelt sie dort zusammen (`npm run lang:parity`) — dieselbe
// Bauform wie beim `specSource`-Vokabular. Wer hier die Wortlisten aendert,
// aendert sie drueben mit.
//
// WAS DIE MESSUNG NICHT KANN. Kurze Beschriftungen ("Aktualisieren",
// "Rack/Gruppe") tragen kein Merkmal und bleiben UNKLAR. Gemessen am
// 2026-09-08: 329 deutsch, 0 englisch, 578 unklar. Ein gutes Drittel ist
// erfasst, und das reicht: fuer einen Sprachwechsel muesste jemand hunderte
// Zeilen drehen, und die tragen dann Merkmale.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/**
 * Woerter, die es NUR im Deutschen gibt.
 *
 * `a`, `an`, `was`, `will`, `also`, `in`, `so`, `man` und `only` fehlen in
 * beiden Listen mit Absicht: sie kommen in beiden Sprachen vor (oder in
 * Fachbegriffen wie "read-only") und haben in einer fruehen Fassung deutsche
 * Zeilen als englisch gemeldet. Ein Waechter, der bei richtigen Zeilen
 * anschlaegt, wird abgeschaltet und nicht gelesen.
 */
const DEUTSCH = [
  'der', 'die', 'das', 'den', 'dem', 'des', 'und', 'oder', 'nicht', 'kein',
  'keine', 'keinen', 'ist', 'sind', 'wird', 'werden', 'wurde', 'für', 'fuer',
  'mit', 'von', 'vom', 'zum', 'zur', 'beim', 'aus', 'eine', 'einen', 'einem',
  'einer', 'nur', 'noch', 'schon', 'wenn', 'dann', 'auch', 'kann', 'muss',
  'darf', 'soll', 'sollen', 'steht', 'gibt', 'sich', 'dieser', 'diese',
  'dieses', 'nach', 'bei', 'über', 'ueber', 'ohne', 'durch', 'gegen', 'sowie',
  'damit', 'wieder', 'immer', 'jede', 'jeder', 'jedes', 'alle', 'allen',
];

/** Woerter, die es NUR im Englischen gibt. */
const ENGLISCH = [
  'the', 'and', 'not', 'with', 'for', 'from', 'this', 'that', 'these',
  'those', 'your', 'you', 'are', 'been', 'have', 'has', 'if', 'then', 'than',
  'when', 'which', 'what', 'who', 'how', 'there', 'into', 'about', 'before',
  'after', 'each', 'every', 'any', 'some', 'please', 'cannot', 'does',
  'doesn', 'isn', 'aren', 'would', 'should', 'could', 'must', 'select',
  'missing', 'unknown',
];

const wortMuster = (woerter: string[]) =>
  new RegExp(`(^|[^\\p{L}])(${woerter.join('|')})([^\\p{L}]|$)`, 'iu');

const DE_MUSTER = wortMuster(DEUTSCH);
const EN_MUSTER = wortMuster(ENGLISCH);
const UMLAUTE = /[äöüßÄÖÜ]/;

/**
 * Die Sprache EINER Zeichenkette — oder `null`, wenn sie kein Merkmal traegt.
 *
 * Traegt eine Zeile Merkmale BEIDER Sprachen, ist sie ebenfalls `null` und
 * nicht etwa "gemischt": das sind fast immer deutsche Saetze mit einem
 * englischen Fachbegriff darin, und die als Verstoss zu melden hiesse,
 * Fachsprache zu verbieten.
 *
 * Platzhalter fallen vorher weg: `{from} → {to}` ist keine englische Zeile,
 * sondern zwei Feldnamen.
 */
export function klassifiziere(roh: string): 'de' | 'en' | null {
  const text = String(roh).replace(/\{[^}]*\}/g, ' ');
  if (text.trim().length < 4) return null;
  const de = UMLAUTE.test(text) || DE_MUSTER.test(text);
  const en = EN_MUSTER.test(text);
  if (de && !en) return 'de';
  if (en && !de) return 'en';
  return null;
}

/**
 * Das Muster, an dem ein Fallback erkannt wird.
 *
 * Als Funktion, weil ein `/g`-Ausdruck seinen Suchstand mitschleppt und ein
 * geteiltes Exemplar bei der zweiten Datei mitten im Text weitersuchen wuerde.
 */
export const fallbackMuster = () =>
  /\b(?:t|translate)\(\s*(?:[A-Za-z]+\s*,\s*)?(['"])[^'"]+\1\s*,\s*(['"])((?:[^\\]|\\.)*?)\2/g;

function alleDateien(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) alleDateien(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const paket = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  avplan?: { sourceLanguage?: string };
};

const erklaert = paket.avplan?.sourceLanguage;
assert.ok(erklaert, 'package.json: avplan.sourceLanguage fehlt — die Quellsprache ist nicht erklaert');
assert.ok(
  erklaert === 'de' || erklaert === 'en',
  `package.json: avplan.sourceLanguage ist "${erklaert}" — erlaubt sind "de" und "en"`,
);

// Die zweite Stelle, an der es steht: die README, die ein Mensch liest. Gehen
// beide auseinander, glaubt jede Seite etwas anderes — schlimmer als eine
// fehlende Angabe.
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const inReadme = /\*\*Source language:\*\*\s*`([a-z]{2})`/.exec(readme);
assert.ok(inReadme, 'README.md nennt die Quellsprache nicht');
assert.equal(
  inReadme[1],
  erklaert,
  `README.md sagt "${inReadme[1]}", package.json sagt "${erklaert}"`,
);

let de = 0;
let en = 0;
let unklar = 0;
const abweichend: string[] = [];

for (const datei of alleDateien(SRC)) {
  const quelle = readFileSync(datei, 'utf8');
  for (const m of quelle.matchAll(fallbackMuster())) {
    const sprache = klassifiziere(m[3]);
    if (!sprache) {
      unklar += 1;
      continue;
    }
    if (sprache === 'de') de += 1;
    else en += 1;
    if (sprache !== erklaert) {
      abweichend.push(`${relative(SRC, datei)}: ${m[3].slice(0, 100)}`);
    }
  }
}

console.log(`Quellsprache "${erklaert}": ${de} deutsch, ${en} englisch, ${unklar} ohne Merkmal`);

if (abweichend.length) {
  console.error(`\n${abweichend.length} Fallback(s) nicht in der Quellsprache:`);
  for (const z of abweichend) console.error(`  ${z}`);
  console.error(
    '\nEntweder die Zeile uebersetzen — oder, wenn die Quellsprache wirklich ' +
      'wechseln soll, die Deklaration in package.json UND README.md aendern.',
  );
  process.exit(1);
}

// Die Gegenprobe zur Ruhe von eben: ein kaputtes Muster oder leere Wortlisten
// faenden NICHTS, und dieser Check meldete Erfolg. Die Schwelle liegt weit
// unter dem Ist-Stand (329 am 2026-09-08) — sie soll einen Totalausfall
// fangen, nicht bei jeder Umformulierung anschlagen.
assert.ok(
  de + en >= 200,
  `Nur ${de + en} Zeichenketten liessen sich einer Sprache zuordnen (erwartet: >= 200). ` +
    'Das Muster oder die Wortlisten sind kaputt — der Check prueft sonst nichts.',
);

// Und die Gegenprobe zum Klassifizierer selbst, an Zeilen, die frueher falsch
// eingeordnet wurden.
assert.equal(klassifiziere('Kabel konnte nicht angelegt werden'), 'de');
assert.equal(klassifiziere('Please select a fixture before continuing.'), 'en');
assert.notEqual(klassifiziere('Was funkt'), 'en');
assert.notEqual(klassifiziere('gepinnt an'), 'en');
assert.equal(klassifiziere('{from} → {to}'), null);

console.log('Alle Quellsprachen-Checks bestanden.');
