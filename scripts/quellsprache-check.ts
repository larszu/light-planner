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
// denselben Check als `scripts/quellsprache.mjs`, der `multicam-planner` als
// `scripts/quellsprache-check.mjs`; die drei Repos teilen keinen Quellbaum.
// Die Suite ist der einzige Ort, an dem die Kopien im selben Baum liegen, und
// haelt sie dort zusammen (`npm run lang:parity`) — dieselbe Bauform wie beim
// `specSource`-Vokabular. Wer hier die Wortlisten oder den Sprachmix-Teil
// aendert, aendert sie drueben mit.
//
// ZWEI MESSUNGEN, ZWEI FRAGEN. Die erste liest die `t()`-Fallbacks und fragt:
// ist der gewickelte Text in der erklaerten Quellsprache? Die zweite (weiter
// unten, `messeSprachmix`) fragt das Gegenteil: steht sichtbarer Text da, den
// niemand gewickelt hat — und zwar in der ANDEREN Sprache? Das ist der
// Sprachmix, den E-17 im `sony-camera-bridge` als Fehler benannt hat, und die
// erste Messung ist dafuer blind: was nicht in `t()` steht, sieht sie nicht.
//
// WAS DIE MESSUNG NICHT KANN. Kurze Beschriftungen ("Aktualisieren",
// "Rack/Gruppe") tragen kein Merkmal und bleiben UNKLAR. Gemessen am
// 2026-09-09: 333 deutsch, 0 englisch, 582 unklar; dazu 152 sichtbare Texte
// ausserhalb von `t()`, davon 0 englisch. Ein gutes Drittel der Fallbacks ist
// erfasst, und das reicht: fuer einen Sprachwechsel muesste jemand hunderte
// Zeilen drehen, und die tragen dann Merkmale.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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

// ── Sprachmix: sichtbarer Text, der GAR NICHT gewickelt ist (B-61/B-63) ────
//
// Die Messung oben sieht nur die Fallbacks in `t()`. Beschriftungen, die
// niemand gewickelt hat, sieht sie nicht — und genau die sind der Sprachmix,
// den E-17 fuer `sony-camera-bridge` als Fehler benannt hat: wer die andere
// Sprache waehlt, bekommt eine Oberflaeche, in der ein Teil umschaltet und
// der Rest stehenbleibt.
//
// ZWEI FEHLER DES LAUFS IM `sony-camera-bridge` SIND HIER VERMIEDEN, weil sie
// drueben Geld gekostet haben:
//   1. Er sah Kommentare fuer Literale. Kommentare werden vor dem Messen
//      entfernt. (Ohne diesen Filter: 47 statt 37 im multicam-planner.)
//   2. Er sah nur Attribute, nicht den JSX-Text. Hier wird beides gelesen.
//      (Ohne die JSX-Messung: 23 statt 37.)

/** Kommentare raus — sie folgen der Repo-Konvention, nicht der Oberflaeche. */
const ohneKommentare = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const SICHTBARE_ATTRIBUTE =
  /\b(?:title|aria-label|placeholder|label|alt|summary|submitLabel|hint)=(?:"([^"]{4,})"|\{\s*'((?:[^'\\]|\\.){4,}?)'\s*\})/g;

/**
 * JSX-Textknoten — und zwar NUR die.
 *
 * Die erste Fassung war `/>([^<>{}]{4,})</g`. Sie trifft in einer .tsx-Datei
 * auch CODE: `>` und `<` sind Vergleichsoperatoren, und dazwischen steht dann
 * ein Stueck Quelltext (`if (clipped.length > 2)`, `arr.filter(n => n.id)`).
 *
 * WARUM DAS IM `multicam-planner` NICHT AUFFIEL — und hier auffallen musste:
 * dort ist die Zielsprache Deutsch, und ein Code-Schnipsel traegt `if`, `for`,
 * `const`, `return` und wird als englisch eingeordnet, nicht als deutsch. Das
 * lockere Muster war dort also ZUFAELLIG ruhig (0 Fehltreffer), in der
 * Gegenrichtung dagegen laut: 6 im multicam-planner, 35 im cable-planner,
 * 12 hier — ausnahmslos Code, kein einziger echter Fund.
 *
 * ZWEI BEDINGUNGEN MACHEN DARAUS EIN TAG-MUSTER:
 *   • Das `>` muss ein Tag-Ende sein: davor ein Bezeichner, ein
 *     Anfuehrungszeichen, eine geschweifte Klammer oder ein Schraegstrich —
 *     nie ein Leerzeichen, `=`, `<` oder `!`. Damit fallen `a > b`, `=>` und
 *     `<=` heraus.
 *   • Das schliessende `<` muss ein Tag beginnen: `</` oder `<Buchstabe`.
 * Was danach noch durchkommt, sind Generics (`useState<Foo>(null)`); die
 * faengt `NACH_CODE`.
 */
const JSX_TEXT = /[^\s=<!>]>([^<>{}]{4,})<[/A-Za-z]/g;

/**
 * Was ein JSX-Textknoten NIE enthaelt, ein Code-Schnipsel dagegen fast immer.
 * Greift ausschliesslich auf JSX-Text, nicht auf Attribute: dort steht
 * durchaus ein `=` in der Oberflaeche („Shift = frei, Mausrad = Stufe").
 */
const NACH_CODE = /[;=]|\b(?:const|let|var|function|await|async)\b/;

/**
 * Auch das Template-Literal, nicht nur die Anfuehrungszeichen. Eine Rueckfrage
 * mit eingesetztem Namen steht praktisch immer im Backtick — ausgerechnet die
 * Form also, die eine erste Fassung nicht kannte (gefunden ueber den
 * `dialogs:native`-Waechter der Suite, nicht ueber diesen Lauf).
 */
const RUFE =
  /\b(?:alert|confirm|prompt)\(\s*(?:(['"])((?:[^\\]|\\.){4,}?)\1|`((?:[^`\\]|\\.){4,}?)`)/g;

/** Sichtbarer Text einer Datei, der NICHT in einem `t()`-Fallback steht. */
export const sichtbareTexte = (quelle: string, jsx: boolean): string[] => {
  const text = ohneKommentare(quelle).replace(fallbackMuster(), ' ');
  const raus: string[] = [];
  for (const m of text.matchAll(SICHTBARE_ATTRIBUTE)) raus.push(m[1] ?? m[2]);
  for (const m of text.matchAll(RUFE)) raus.push(m[2] ?? m[3]);
  if (jsx) {
    for (const m of text.matchAll(JSX_TEXT)) {
      const t = m[1].trim();
      if (t && !t.startsWith('{') && !NACH_CODE.test(t)) raus.push(t);
    }
  }
  return raus;
};

/**
 * Die Obergrenze, nicht das Ziel.
 *
 * GEMESSEN am 2026-09-09 mit dem strengen JSX-Muster: NULL. Das ist ein
 * Ergebnis und keine Selbstverstaendlichkeit — B-63 hat die Frage
 * ausdruecklich offen gelassen („ob dort englische Beschriftungen ungewickelt
 * herumstehen, ist nicht gemessen"), und sie mit „vermutlich nicht" zu
 * beantworten waere dieselbe Behauptung ohne Messung gewesen, gegen die
 * dieses Repo sonst schreibt. Mit dem lockeren Muster stuenden hier 12 — alles
 * Code, kein einziger echter Fund.
 *
 * Sie darf SINKEN und nicht steigen: wer eine englische Beschriftung
 * hinzufuegt, faellt durch; wer uebersetzt und die Zahl stehen laesst,
 * ebenfalls. Auf null bedeutet: JEDE neue Zeichenkette in der anderen
 * Sprache faellt sofort auf.
 */
export const MIX_GRENZE = 0;

/**
 * Ungewickelter sichtbarer Text in der jeweils anderen Sprache.
 *
 * Gibt AUSSERDEM zurueck, wie viel sichtbarer Text ueberhaupt gefunden wurde.
 * Ohne diese zweite Zahl waere eine Null nicht zu deuten: ein kaputtes Muster
 * findet ebenfalls nichts und meldete dann Erfolg. Die Grenze unten prueft
 * deshalb beides — keine Funde in der Fremdsprache UND ueberhaupt Funde.
 */
export const messeSprachmix = (quellsprache: string) => {
  const ziel = quellsprache === 'de' ? 'en' : 'de';
  const funde: { datei: string; text: string }[] = [];
  let gesehen = 0;
  for (const datei of alleDateien(SRC)) {
    const rel = relative(SRC, datei).split(sep).join('/');
    // Das Woerterbuch ist per Definition in der anderen Sprache, Tests sind
    // keine Oberflaeche. Eine Zahl, die niemand auf null bringen kann, liest
    // niemand.
    if (rel.includes('i18n') || rel.includes('__tests__') || rel.includes('.test.')) continue;
    for (const roh of sichtbareTexte(readFileSync(datei, 'utf8'), datei.endsWith('.tsx'))) {
      gesehen += 1;
      if (klassifiziere(roh) === ziel) funde.push({ datei: rel, text: roh.slice(0, 100) });
    }
  }
  return { funde, gesehen };
};

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

// Die Gegenprobe zum Messwerkzeug selbst — an fester Probe, nicht am Repo.
//
// WARUM NICHT AM REPO. Der naheliegende Weg waere eine Untergrenze auf der
// Zahl der gefundenen Texte („mindestens 100"). Der Wert davon faellt aber
// genau dann, wenn die Arbeit gelingt: je mehr gewickelt ist, desto weniger
// ungewickelter Text bleibt uebrig. Eine solche Schwelle muesste bei jedem
// Fortschritt nachgezogen werden und waere nach dem zweiten Nachziehen nur
// noch Zierrat. Die gemessene Zahl steht deshalb in der Ausgabe (152 am
// 2026-09-09) — als Angabe, nicht als Schwelle.
//
// Die Probe dagegen ist unabhaengig von der Repo-Groesse und haelt genau die
// Fehlformen fest, die diesen Zaehler Zeit gekostet haben: der Kommentar als
// Literal, das Vergleichs-`>` als Tag-Ende, die Rueckfrage im Backtick. Ohne
// sie waere ein kaputtes Muster die gefaehrlichste Art gruen: es findet
// nichts, und Nichts sieht hier aus wie ein Ergebnis.
const PROBE = [
  '<button title="Delete this cable">',
  '<span>Not connected yet</span>',
  'window.confirm(`Delete "${name}" and its ${n} shots?`)',
  // Die beiden Kommentar-Zeilen tragen mit Absicht Muster, die OHNE den
  // Kommentarfilter treffen wuerden — eine ohne waere wirkungslos: was kein
  // `>` und kein `title=` enthaelt, findet der Zaehler ohnehin nicht, und die
  // Probe belegte dann nichts.
  '// title="Legacy tooltip, no longer shown"',
  '/* <b>Old markup left in a comment</b> */',
  'if (a.length > 2) return b < c',
  'const n = a>b ? 1 : 2; const m = c<d',
  "t('cable.remove', 'Delete this cable')",
].join('\n');

// Sortiert verglichen: in welcher Reihenfolge Attribute, Rueckfragen und
// Textknoten herausfallen, ist eine Eigenschaft der Schleifen und keine
// Zusicherung — ein Waechter, der bei einer umgestellten Schleife anschlaegt,
// meldet Fehlalarme.
assert.deepEqual(
  sichtbareTexte(PROBE, true).slice().sort(),
  [
    'Delete "${name}" and its ${n} shots?',
    'Delete this cable',
    'Not connected yet',
  ].sort(),
  'Die Probe des Sprachmix-Musters schlaegt fehl: es findet entweder echte ' +
    'Beschriftungen nicht mehr oder wieder Kommentare und Quelltext. Beides ' +
    'macht die gemeldete Null wertlos.',
);

const { funde: mix, gesehen } = messeSprachmix(erklaert);
console.log(
  `Sprachmix: ${mix.length} ungewickelte Zeichenkette(n) in der anderen Sprache ` +
    `(Grenze ${MIX_GRENZE}, ${gesehen} sichtbare Texte geprueft).`,
);

if (mix.length > MIX_GRENZE) {
  console.error(`\n${mix.length - MIX_GRENZE} mehr als erlaubt:`);
  for (const f of mix.slice(0, 40)) console.error(`  ${f.datei}: ${f.text}`);
  if (mix.length > 40) console.error(`  … und ${mix.length - 40} weitere`);
  console.error(
    '\nEntweder wickeln und uebersetzen — oder, wenn es wirklich so bleiben ' +
      'soll, MIX_GRENZE mit Begruendung anheben. Das Anheben ist die Ausnahme; ' +
      'das Senken ist der Normalfall.',
  );
  process.exit(1);
}

// Die Gegenrichtung, und sie ist der Punkt: eine Grenze, die nur nach oben
// faellt, ist ein Deckel. Wer uebersetzt und die Zahl stehen laesst, gibt den
// Platz frei, den der naechste Zuwachs wieder fuellt — unbemerkt, weil gruen.
if (mix.length < MIX_GRENZE) {
  console.error(
    `\nDie Grenze steht auf ${MIX_GRENZE}, gemessen sind ${mix.length}. ` +
      'MIX_GRENZE auf den neuen Wert setzen — eine Grenze ueber dem Ist deckt ' +
      'ab morgen wieder Zuwachs.',
  );
  process.exit(1);
}

// Die Gegenprobe zur Ruhe von eben: ein kaputtes Muster oder leere Wortlisten
// faenden NICHTS, und dieser Check meldete Erfolg. Die Schwelle liegt weit
// unter dem Ist-Stand (333 am 2026-09-09) — sie soll einen Totalausfall
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
