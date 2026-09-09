// Headless-Check fuer die i18n-Abdeckung der ERREICHBAREN Oberflaeche.
// Lauf: `npm run i18n:check`  (node --experimental-strip-types).
//
// WAS HIER SCHIEFLIEF. Das englische Woerterbuch hatte 42 Eintraege, und
// **40 davon bedienten toten Code**:
//
//   src/components/MenuBar.tsx   24 t()-Aufrufe   wird nirgends importiert
//   src/components/Toolbar.tsx   12 t()-Aufrufe   wird nirgends importiert
//
// `App.tsx` rendert stattdessen TopBar und ToolRail. Der einzige substanzielle
// Dialog mit uebersetzten Strings -- `inventory/InventoryDialog.tsx` mit 37
// Aufrufen -- hatte KEINE einzige englische Fassung.
//
// Die Uebersetzungsarbeit war also vollstaendig in Code geflossen, den niemand
// sieht, waehrend die sichtbare Oberflaeche unuebersetzt blieb. Eine reine
// Zaehlung ("42 Schluessel, sieht gut aus") haette das nie gezeigt. Dieser
// Check zaehlt deshalb nicht Schluessel, sondern gleicht ab, welche Aufrufe
// von einer GERENDERTEN Komponente kommen.
//
// Der Sprachschalter ist bis heute nicht freigelegt (B-13). Das ist die
// richtige Reihenfolge: erst die erreichbaren Strings uebersetzen, dann den
// Schalter. Umgekehrt bekaeme ein Nutzer, der Englisch waehlt, ueberwiegend
// Deutsch zu sehen -- und hielte die Funktion fuer kaputt, zu Recht.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

function alleDateien(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) alleDateien(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const dateien = alleDateien(SRC);
const inhalt = new Map(dateien.map((f) => [f, readFileSync(f, 'utf8')]));

/** Wird die Komponente aus dieser Datei irgendwo importiert? */
function wirdImportiert(datei: string): boolean {
  const name = datei.split('/').pop()!.replace(/\.tsx?$/, '');
  for (const [f, s] of inhalt) {
    if (f === datei) continue;
    if (new RegExp(`from\\s+'[^']*/${name}'|import\\(\\s*'[^']*/${name}'`).test(s)) return true;
  }
  return false;
}

/** Alle t('key', 'Deutsch')-Aufrufe einer Datei. */
const aufrufe = (s: string) => [...s.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);

/**
 * Die Schluessel der UEBERSETZUNG — seit E-28 ist das Deutsch.
 *
 * Bis zum 2026-09-09 stand hier `en`: Deutsch war die Quellsprache, Englisch
 * die Uebersetzung. Mit der Drehung ist es umgekehrt, und dieser Check misst
 * seither dasselbe in der anderen Richtung: hat jeder erreichbare Schluessel
 * eine deutsche Fassung?
 *
 * EINE FORM, seit dem 2026-09-09 auch in der Suite-Kopie. Das Woerterbuch
 * steht in `i18n/de.ts`, ein Schluessel je Zeile.
 *
 * Vorher zerlegte die Suite-Kopie das ENGLISCHE Woerterbuch in sechs
 * Domaenen-Teildicts unter `i18n/en/` (base, topbar, panels, app, dialogs,
 * inventory) und komponierte per Spread; dieser Check musste beide Formen
 * kennen. Mit der Drehung sind die Teildicts weggefallen — der englische
 * Text steht jetzt an der Aufrufstelle. Der Schnitt nach Domaenen haette
 * sich sonst fuer Deutsch wiederholt und fuer jede weitere Sprache noch
 * einmal.
 *
 * Der Zweig fuer die Teildicts bleibt trotzdem stehen: er kostet nichts und
 * faengt eine Kopie ab, die spaeter wieder so gebaut wird.
 *
 * Der Check liest deshalb beide Formen. Sonst haette er in der Suite ein
 * leeres Woerterbuch gesehen und JEDEN erreichbaren Schluessel als fehlend
 * gemeldet -- ein Guard, der in der einen Kopie das Falsche meldet, ist so
 * unbrauchbar wie einer, der schweigt.
 */
const uebersetzt = (() => {
  /** Schluessel -> die Datei(en), die ihn definieren. */
  const herkunft = new Map<string, string[]>();
  const merken = (k: string, f: string) => herkunft.set(k, [...(herkunft.get(k) ?? []), f]);

  const hauptDatei = 'i18n/de.ts';
  const s = readFileSync(join(SRC, hauptDatei), 'utf8');
  const m = /const de[^=]*=\s*\{([\s\S]*?)\n\};/.exec(s);
  assert.ok(m, 'Das de-Woerterbuch wurde nicht gefunden — der Check prueft sonst nichts');
  for (const x of m[1].matchAll(/^\s*'([^']+)':/gm)) merken(x[1], hauptDatei);
  // Teildicts, falls vorhanden.
  for (const f of dateien) {
    if (!/\/i18n\/de\/[^/]+\.ts$/.test(f)) continue;
    for (const x of inhalt.get(f)!.matchAll(/^\s*'([^']+)':/gm)) merken(x[1], relative(SRC, f));
  }

  // Ein Schluessel in ZWEI Teildicts ist stiller Verlust: `{ ...a, ...b }`
  // nimmt kommentarlos den aus dem letzten Spread. Innerhalb eines
  // Objektliterals faengt tsc das ab (TS1117) -- ueber die Spreads hinweg
  // fangt es niemand, und das ist genau die Luecke, die die Aufteilung in
  // Teildicts aufgemacht hat. Solange nur ein Woerterbuch existiert, ist
  // diese Zusicherung inert.
  const doppelt = [...herkunft.entries()]
    .filter(([, fs]) => fs.length > 1)
    .map(([k, fs]) => `${k} (${fs.join(', ')})`)
    .sort();
  assert.deepEqual(
    doppelt,
    [],
    `Mehrfach definierte Schluessel: ${doppelt.join(' | ')}. Beim Spread gewinnt der ` +
      'letzte, die anderen Fassungen sind wirkungslos — ohne dass es jemand meldet.',
  );

  const keys = new Set(herkunft.keys());
  assert.ok(
    keys.size > 20,
    `Nur ${keys.size} deutsche Schluessel gefunden — das Muster passt vermutlich nicht mehr, ` +
      'und der Check wuerde gleich reihenweise Fehltreffer melden.',
  );
  return keys;
})();

const erreichbar = new Set<string>();
const tot: Array<[string, number]> = [];

for (const [f, s] of inhalt) {
  if (f.endsWith('i18n/index.ts')) continue; // Beispiel im Kopfkommentar
  const ks = aufrufe(s);
  if (!ks.length) continue;
  // `App.tsx` ist die Wurzel und wird von main.tsx gerendert.
  const lebt = f.endsWith('App.tsx') || wirdImportiert(f);
  if (lebt) ks.forEach((k) => erreichbar.add(k));
  else tot.push([relative(SRC, f), ks.length]);
}

// ── 1. Jeder erreichbare Schluessel hat eine deutsche Fassung ───────────────
const fehlend = [...erreichbar].filter((k) => !uebersetzt.has(k)).sort();
assert.deepEqual(
  fehlend,
  [],
  `Ohne deutsche Fassung, obwohl die Stelle gerendert wird: ${fehlend.join(', ')}. ` +
    'Genau so entstand der Zustand, den dieser Check verhindert: uebersetzt wurde, ' +
    'was tot ist, waehrend die sichtbare Oberflaeche in der Quellsprache blieb.',
);

// ── 2. (entfallen mit E-28) ────────────────────────────────────────────────
//
// Hier stand: „kein deutscher Fallback ist in Wahrheit englisch". Die Frage
// gibt es nicht mehr — seit der Drehung IST der Fallback englisch. Die
// Gegenrichtung („steht deutscher Text ungewickelt herum?") misst
// `lang:check` mit dem Sprachmix-Zaehler, und zwar gruendlicher: er sieht
// auch, was gar nicht in `t()` steht. Diesen Abschnitt umzudrehen hiesse,
// zwei Laeufe fuer dieselbe Frage zu fuehren — und zwei Laeufe fuer dieselbe
// Frage laufen auseinander.

// ── 3. Der Sprachschalter ist erreichbar ────────────────────────────────────
//
// WARUM ES DAS GIBT (B-13, gemessen 2026-09-04). Die i18n-Infrastruktur war
// vollstaendig, `setLanguage` existierte, das englische Woerterbuch war
// gepflegt -- und trotzdem konnte kein Nutzer die Sprache wechseln: der
// einzige Aufruf stand in `components/MenuBar.tsx`, einer Datei, die niemand
// importiert und die `App.tsx` nie rendert. Dieselbe Form wie in Abschnitt 1,
// nur eine Ebene hoeher: gebaut, begruendet, unerreichbar.
//
// Geprueft wird deshalb nicht "gibt es `setLanguage`", sondern "ruft es
// jemand aus einer GERENDERTEN Datei". Ohne diese Unterscheidung waere der
// Check die ganze Zeit gruen gewesen.
const schalterStellen: string[] = [];
for (const [f, s] of inhalt) {
  if (f.endsWith('store/uiStore.ts') || f.endsWith('i18n/index.ts')) continue; // Definition, nicht Aufruf
  if (!/setLanguage\s*\(/.test(s)) continue;
  if (f.endsWith('App.tsx') || wirdImportiert(f)) schalterStellen.push(relative(SRC, f));
}
assert.ok(
  schalterStellen.length > 0,
  'Kein gerenderter Aufruf von setLanguage gefunden. Der Sprachschalter mag ' +
    'existieren -- erreichbar ist er dann nicht, und genau dieser Zustand ' +
    '(Schalter nur in der nicht gerenderten MenuBar.tsx) war B-13.',
);
console.log(`  Sprachschalter erreichbar in: ${schalterStellen.join(', ')}`);

// ── 4. Was dieser Check NICHT sagt ──────────────────────────────────────────
//
// Er prueft die Abdeckung der Schluessel, die es GIBT. Ueber Text, den nie
// jemand in `t()` gewickelt hat, sagt er nichts -- und genau so laesst sich
// seine gruene Zeile missverstehen.
//
// Gemessen 2026-09-04: upstream sassen fast alle sichtbaren Textstellen in
// Dateien mit **null** `t()`-Aufrufen (TopBar, PropertyPanel, ScheduleDialog,
// FixtureEditor …). „34 von 34 abgedeckt" und „die Oberflaeche ist
// uebersetzt" sind also zwei sehr verschiedene Aussagen. Nach #62 sind es
// hier noch 10 Komponenten mit ~365 Stellen; in der Suite-Kopie, wo der
// Sprachschalter erreichbar ist, noch eine einzige.
//
// Deshalb steht die Zahl ab jetzt unter jedem Lauf. Zusichern laesst sie sich
// nicht: es gibt keine Schwelle, die heute schon gilt.
const SICHTBAR = /(?:>[^<>{}\n]*[A-Za-zÄÖÜäöüß]{3,}[^<>{}\n]*<)|(?:(?:title|placeholder|aria-label|label)="[^"]{3,}")/g;

/**
 * Die erste Fassung zaehlte alles zwischen `>` und `<` -- und traf damit
 * TypeScript-Vergleiche:
 *
 *     if (xhr.status >= 200 && xhr.status < 300)
 *     if (x > bMaxX) bMaxX = x; if (y < bMinY) …
 *
 * `Scene3D.tsx` und `PlanCanvas.tsx` standen deshalb mit 7 bzw. 4 angeblich
 * deutschen Textstellen im Bericht. Sie haben **keine einzige**. Die Zahl,
 * die eine ueberschaetzende Zusicherung ersetzen sollte, hat selbst
 * ueberschaetzt.
 *
 * Ausgeschlossen wird, was Code-Marken traegt: `=`, `;`, `&&`, `||`, ein
 * `bezeichner.feld`, oder eine oeffnende Klammer am Anfang. Gegengeprueft an
 * den 98 Stellen, die #62 gewickelt hat: 97 davon erkennt die Regel weiter,
 * und alle 11 Falschtreffer sind weg.
 */
const CODE_MARKE = /[=;]|&&|\|\||\b\w+\.\w+/;
const sichtbareStellen = (s: string): number => {
  let n = 0;
  for (const treffer of s.match(SICHTBAR) ?? []) {
    if (treffer.startsWith('>')) {
      const innen = treffer.slice(1, -1);
      if (CODE_MARKE.test(innen) || /^\s*\(/.test(innen)) continue;
    }
    n++;
  }
  return n;
};

const ohneT: Array<[string, number]> = [];
for (const [f, s] of inhalt) {
  if (!f.endsWith('.tsx')) continue;
  if (!(f.endsWith('App.tsx') || wirdImportiert(f))) continue;
  if (aufrufe(s).length) continue;
  const stellen = sichtbareStellen(s);
  if (stellen) ohneT.push([relative(SRC, f), stellen]);
}
ohneT.sort((a, b) => b[1] - a[1]);
const stellenGesamt = ohneT.reduce((n, [, v]) => n + v, 0);

console.log(`✓ i18n: alle ${erreichbar.size} erreichbaren Schluessel haben eine deutsche Fassung`);
if (tot.length) {
  console.log('  nicht gerendert, aber uebersetzt (B-13):');
  for (const [f, n] of tot) console.log(`    ${f} — ${n} t()-Aufrufe`);
}
if (ohneT.length) {
  console.log(
    `  gerendert, aber ganz ohne t(): ${ohneT.length} Komponente(n), ` +
      `~${stellenGesamt} sichtbare Textstellen bleiben deutsch (grob geschaetzt):`,
  );
  for (const [f, n] of ohneT.slice(0, 8)) console.log(`    ${f} — ~${n}`);
  if (ohneT.length > 8) console.log(`    … ${ohneT.length - 8} weitere`);
}
console.log('\nAlle i18n-Erreichbarkeits-Checks bestanden.');
