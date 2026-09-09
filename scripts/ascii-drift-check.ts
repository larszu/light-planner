// Headless-Check: Meldungstexte in richtigem Deutsch, nicht in ASCII-Ersatz.
// Lauf: `npm run ascii:check`  (node --experimental-strip-types).
//
// ANLASS. Nutzer-Rueckmeldung vom 2026-09-07 an der Oberflaeche des
// Kabel-Planers: die Anwendung schrieb ihre eigene Sprache als „Geraet",
// „Domaene", „traegt", „Laenge". Nachgemessen fand sich dieselbe Drift hier —
// „gueltige", „unterstuetzte", „traegt", „ueber", „Aenderungen", „Domaene",
// „enthaelt", „rueckweg". Das stand nicht in Kommentaren, sondern in
// Meldungen und Beschriftungen.
//
// DIE BEWEISLAST IST UMGEDREHT. Eine Liste falscher Woerter waere immer
// unvollstaendig und liesse das naechste neue Wort still durch. Dieser Check
// kennt stattdessen die Woerter, in denen „ae/oe/ue" KEIN Umlaut-Ersatz ist:
// englische Begriffe, deutsche Woerter mit echter Vokalfolge („neue",
// „Manuell", „Lebensdauer", „schauen") und Hex-Ziffernfolgen. Alles andere
// ist ein Befund.
//
// AUSGENOMMEN, und jedes mit Grund:
//   * KOMMENTARE — sie bleiben ASCII wie im ganzen Repo und stehen in keiner
//     Oberflaeche. Der Check sieht nur String-Literale und JSX-Text.
//   * MODUL-PFADE und Bezeichner in `${...}` — das ist Code, kein Text.
//   * PLATZHALTER in geschweiften Klammern — sie werden als SCHLUESSEL
//     nachgeschlagen; ein Umlaut darin bringt die Klammer in den Dialog.
//   * DIE ALIAS-LISTE in `consolePatch` — sie NIMMT „geraetetyp" von fremden
//     Pult-Exporten ENTGEGEN. Wer sie „korrigiert", verliert die Spalte.
//   * ZWEI DATEINAMEN von Ausgaben (`geraeteliste.csv`, `rueckweg-pult.csv`).
//     Ein Umlaut im Dateinamen laeuft ueber drei Betriebssysteme
//     unterschiedlich; sie sind Kennungen, keine Anzeige.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const SRC = new URL('../src/', import.meta.url).pathname;

function alleDateien(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) alleDateien(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const INNEN: Partial<Record<ts.SyntaxKind, [number, number]>> = {
  [ts.SyntaxKind.StringLiteral]: [1, -1],
  [ts.SyntaxKind.NoSubstitutionTemplateLiteral]: [1, -1],
  [ts.SyntaxKind.TemplateHead]: [1, -2],
  [ts.SyntaxKind.TemplateMiddle]: [1, -2],
  [ts.SyntaxKind.TemplateTail]: [1, -1],
  [ts.SyntaxKind.JsxText]: [0, 0],
};

/** Woerter, in denen „ae/oe/ue" kein Umlaut-Ersatz ist. */
const HARMLOS = new Set(
  [
    // Deutsch mit echter Vokalfolge
    'neu', 'neue', 'neuer', 'neues', 'neuen', 'aktuell', 'aktuelle', 'aktuellem',
    'manuell', 'manuelle', 'lebensdauer', 'dauer', 'schauen',
    // 2026-09-09: „Zuschauer" kam mit `orderAccess.ts` dazu. Zu-schauen, nicht
    // „Zuschueren" — die Silbengrenze faellt zwischen u und e, genau wie bei
    // „schauen" und „Lebensdauer" darueber. Der Waechter wurde rot an einer
    // richtigen Aenderung; deshalb steht das Wort hier und nicht der Umlaut
    // im Quelltext.
    'zuschauer', 'quelle',
    'quellen', 'steuer', 'steuerung', 'sequenz', 'frequenz', 'zuerst', 'quer',
    'aktuellen', 'aktueller', 'aktuelles', 'aktuell',
    // Englisch, Bezeichner und Farben, die als Text auftauchen
    'marquee', 'parquet', 'colvalue', 'value', 'values', 'venue', 'venues',
    'venueexchange', 'issues',
    'exportvenue', 'exportvenuehint', 'importvenue', 'importvenuehint',
    'coefficient', 'rogue', 'blue', 'true', 'due', 'issue', 'unique', 'query',
    'request', 'does', 'goes', 'guess', 'continue', 'sequence',
    // Ein Paar fuer sich ist nie ein deutsches Wort — es kommt aus einer UUID,
    // einer Farbe oder einem Pfad.
    'ae', 'oe', 'ue',
  ],
);

/** Kennungen: Dateinamen von Ausgaben und Alias-Eintraege fremder Formate. */
const KENNUNGEN = new Set(['geraeteliste.csv', 'rueckweg-pult.csv', 'geraetetyp']);

const istHex = (wort: string) => /^[0-9a-f]+$/i.test(wort);

const befunde: string[] = [];
let literale = 0;
for (const datei of alleDateien(SRC)) {
  const src = readFileSync(datei, 'utf8');
  const kurz = relative(SRC, datei);
  const kind = kurz.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(kurz, src, ts.ScriptTarget.Latest, true, kind);
  const lauf = (node: ts.Node): void => {
    const eltern = node.parent as ts.Node | undefined;
    const modulPfad =
      !!eltern &&
      (ts.isImportDeclaration(eltern) || ts.isExportDeclaration(eltern)) &&
      eltern.moduleSpecifier === node;
    const spanne = modulPfad ? undefined : INNEN[node.kind];
    if (spanne) {
      const text = src.slice(node.getStart(sf) + spanne[0], node.getEnd() + spanne[1]);
      literale += 1;
      if (!KENNUNGEN.has(text.trim())) {
        const ohnePlatzhalter = text.replace(/\{[^}]*\}/g, ' ');
        for (const wort of ohnePlatzhalter.match(/[A-Za-zÄÖÜäöüß]+/g) ?? []) {
          if (!/ae|oe|ue|Ae|Oe|Ue|AE|OE|UE/.test(wort)) continue;
          if (HARMLOS.has(wort.toLowerCase()) || istHex(wort)) continue;
          const zeile = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          befunde.push(`${kurz}:${zeile} „${wort}" in "${text.slice(0, 70)}"`);
        }
      }
    }
    ts.forEachChild(node, lauf);
  };
  lauf(sf);
}

// Der Check selbst muss etwas gesehen haben — sonst prueft er nichts und
// sieht trotzdem gruen aus.
assert.ok(literale > 500, `nur ${literale} Literale gescannt — der Scan greift nicht`);
assert.deepEqual(befunde, [], `ASCII-Ersatzformen:\n  ${befunde.join('\n  ')}`);
console.log(`ascii:check ok — ${literale} Literale, keine ASCII-Ersatzform`);
