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

const en = (() => {
  const s = readFileSync(join(SRC, 'i18n/index.ts'), 'utf8');
  const m = /const en[^=]*=\s*\{([\s\S]*?)\n\};/.exec(s);
  assert.ok(m, 'Das en-Woerterbuch wurde nicht gefunden — der Check prueft sonst nichts');
  return new Set([...m[1].matchAll(/^\s*'([^']+)':/gm)].map((x) => x[1]));
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

// ── 1. Jeder erreichbare Schluessel hat eine englische Fassung ──────────────
const fehlend = [...erreichbar].filter((k) => !en.has(k)).sort();
assert.deepEqual(
  fehlend,
  [],
  `Ohne englische Fassung, obwohl die Stelle gerendert wird: ${fehlend.join(', ')}. ` +
    'Genau so entstand der Zustand, den dieser Check verhindert: uebersetzt wurde, ' +
    'was tot ist, waehrend die sichtbare Oberflaeche deutsch blieb.',
);

// ── 2. Kein deutscher Fallback ist in Wahrheit englisch ─────────────────────
//
// Deutsch ist die QUELLSPRACHE und steht inline als Fallback. Steht dort ein
// englisches Wort, sieht ein deutscher Nutzer Englisch -- und der Schalter
// aendert daran nichts, weil der Fallback greift. Genau das war bei
// `t('common.edit', 'Edit')` der Fall.
const ENGLISCH = /^(Edit|Save|Cancel|Delete|Close|Import|Export|Code|Item|Model|New|Add|Search|Filter)$/;
const englischeFallbacks: string[] = [];
for (const [f, s] of inhalt) {
  for (const m of s.matchAll(/\bt\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) {
    if (ENGLISCH.test(m[2])) englischeFallbacks.push(`${relative(SRC, f)}: t('${m[1]}', '${m[2]}')`);
  }
}
/** Woerter, die im Deutschen und Englischen wirklich gleich sind. */
const GLEICH_ERLAUBT = new Set(['Code', 'Import', 'Export']);
const echteEnglische = englischeFallbacks.filter((z) => {
  const w = /'([^']+)'\)$/.exec(z)?.[1] ?? '';
  return !GLEICH_ERLAUBT.has(w);
});
assert.deepEqual(
  echteEnglische,
  [],
  `Englischer Text als deutsche Quellsprache: ${echteEnglische.join(' | ')}. ` +
    'Der Sprachschalter hilft dagegen nicht — der Fallback greift in beiden Sprachen.',
);

// ── 3. Toter Code wird benannt, nicht uebersehen ────────────────────────────
//
// Keine Zusicherung, sondern ein Bericht: solange MenuBar und Toolbar
// existieren und uebersetzt sind, ohne gerendert zu werden, soll das bei jedem
// Lauf sichtbar sein statt in einer Zaehlung zu verschwinden.
console.log(`✓ i18n: alle ${erreichbar.size} erreichbaren Schluessel haben eine englische Fassung`);
if (tot.length) {
  console.log('  nicht gerendert, aber uebersetzt (B-13):');
  for (const [f, n] of tot) console.log(`    ${f} — ${n} t()-Aufrufe`);
}
console.log('\nAlle i18n-Erreichbarkeits-Checks bestanden.');
