// Waechter fuer die Oberflaechen-Regeln (ADR-007 der av-planner-suite).
// Lauf: `npm run brand:check`  (node --experimental-strip-types).
//
// ─── WARUM DIESE DATEI DIE WERTE EIN ZWEITES MAL TRAEGT ─────────────────────
//
// Sie stehen maschinenlesbar in `@avplan/ui` (`src/brand.ts`) — aber der
// Light-Planer haengt nicht an diesem Paket: er wird in die Suite vendoriert,
// nicht umgekehrt. Ohne diesen Check waere der Rueckweg in die alte
// Blau-Grau-Welt eine Zeile, die niemandem auffaellt. Regeln, die nur in
// einem Dokument stehen, driften.
//
// Was er NICHT prueft: ob die Werte gut sind. Das entscheidet das
// Marken-Handbuch, nicht ein Skript.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(hier, '..', 'src/App.css'), 'utf8');

const token = (name: string): string => {
  const m = css.match(new RegExp(`\\${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : '';
};

// ── 1. Die Palette ist die der Marke ──────────────────────────────────────
assert.equal(token('--bg'), '#132040', 'Grund ist Deep Navy');
assert.equal(token('--panel'), '#1D324F', 'Flaeche ist Zumpe Navy');
assert.equal(token('--text'), '#E1ECEF', 'Fliesstext ist Eisblau');
assert.equal(token('--text2'), '#8C9CB3', 'Gedaempft ist Stahlblau');
assert.equal(token('--accent'), '#F6F5F0', 'Aktionsflaeche ist Off-White');

// ── 2. Status ist nicht Signal ────────────────────────────────────────────
assert.equal(token('--danger'), '#B04A3F', 'Fehlerrot ist der Status-Ton');
assert.equal(token('--success'), '#2F7D5C');
assert.equal(token('--warn'), '#C8892B');
assert.equal(token('--signal'), '#D6402E', 'Tally-Rot ist das Signal');
assert.notEqual(token('--danger'), token('--signal'), 'zwei Toene, zwei Zwecke');

// ── 3. Rot kommt genau einmal vor: in der Definition des Signals ──────────
const rotZeilen = css
  .split('\n')
  .map((z) => z.trim())
  .filter((z) => z.toUpperCase().includes('#D6402E'));
assert.ok(
  rotZeilen.every((z) => z.startsWith('--signal:') || z.includes('var(--signal)')),
  `Tally-Rot steht ausserhalb von --signal: ${rotZeilen.join(' | ')}`,
);

// ── 4. Der Fokusring ist das Signal ───────────────────────────────────────
assert.ok(css.includes('outline: 2px solid var(--signal)'), 'Fokusring fehlt');
assert.ok(css.includes('outline-offset: 3px'), 'Fokus-Abstand fehlt');

// ── 5. Keine Rundungen, keine Verlaeufe, keine Schatten ───────────────────
assert.equal(token('--radius'), '0', 'Radius ist null');
assert.ok(!/border-radius:\s*(50%|[1-9])/.test(css), 'harter Radius gefunden');
assert.ok(!/linear-gradient|radial-gradient/.test(css), 'Verlauf gefunden');
// Der Lookahead sitzt DIREKT hinter dem Doppelpunkt: mit `\s*` davor
// koennte das Muster ein Leerzeichen weniger nehmen und `none` doch noch
// als Treffer lesen.
assert.ok(!/box-shadow:(?!\s*none\s*;)[^;]+;/.test(css), 'Schatten gefunden');

// ── 6. Der Rahmen: Kopfzeile 40 px, Statusleiste 24 px, Kopflinie ────────
//
// ADR-007 Abschnitt 6 nennt Zahlen, und Zahlen kann man messen. Vorher war
// die Menueleiste 30 px hoch (eine Zahl aus keiner Regel) und die
// Statusleiste hatte gar keine — sie ergab sich aus ihrem Inhalt. Ohne
// diesen Check waeren beide beim naechsten Umbau wieder ein Zufall.
const regel = (klasse: string): string => {
  const m = css.match(new RegExp(`\\.${klasse}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `Regel .${klasse} fehlt in src/App.css`);
  return m![1];
};
assert.match(regel('menubar'), /height:\s*40px/, 'Kopfzeile ist 40 px');
assert.match(regel('menubar'), /flex:\s*none/, 'Kopfzeile schrumpft nicht mit');
assert.match(regel('statusbar'), /height:\s*24px/, 'Statusleiste ist 24 px');
assert.match(regel('statusbar'), /flex:\s*none/, 'Statusleiste schrumpft nicht mit');
assert.match(
  regel('panel-head'),
  /border-bottom:\s*1px solid var\(--accent\)/,
  'Kopflinie ist der Akzent',
);
// Die Rail steht im Raster der App und nicht in einer eigenen Regel.
assert.match(css, /grid-template-columns:\s*56px/, 'Rail ist 56 px');

// ── 7. Die Kommandopalette liegt auf Strg/Cmd + K ────────────────────────
//
// „Derselbe Griff ueberall" ist die halbe Zusage; die andere Haelfte ist,
// dass die Palette dieselben Befehle anbietet wie das Menue. Deshalb prueft
// der Waechter beides: die Tastenkombination UND dass die Liste aus
// `menuModel.ts` kommt statt ein zweites Mal getippt zu sein.
const lies = (rel: string): string => readFileSync(resolve(hier, '..', rel), 'utf8');
const palette = lies('src/components/CommandPalette.tsx');
assert.match(palette, /ctrlKey \|\| e\.metaKey/, 'Palette hoert nicht auf Strg/Cmd');
assert.match(palette, /e\.key === 'k' \|\| e\.key === 'K'/, 'Palette hoert nicht auf K');
assert.match(palette, /import type \{ MenuGroup \} from '\.\/menuModel'/, 'Palette liest nicht das Menue-Modell');
//
// GEMESSEN WIRD JETZT `TopBar.tsx` UND NICHT MEHR `MenuBar.tsx`. Bis zum
// 2026-09-11 las dieser Waechter eine Datei, die `App.tsx` nie rendert: die
// Palette war dort gemountet, in der laufenden App tat Strg/Cmd+K also
// nichts — und diese Zeile war trotzdem gruen. Der Waechter stand an der
// falschen Tuer. `MenuBar.tsx` ist geloescht; die Leiste und die Palette
// haengen in `TopBar.tsx`, das `App.tsx` wirklich rendert.
//
// DIE PRUEFUNG „wird gerendert" LEISTET DIESER LAUF NICHT SELBST — sie
// gehoert `i18n-reachable-check.ts`, der dem Importgraphen von `App.tsx`
// folgt. Hier steht nur, WAS in der Datei stehen muss.
const topbar = lies('src/components/TopBar.tsx');
assert.match(topbar, /buildMenus\(/, 'Menueleiste baut nicht aus dem Modell');
assert.ok(topbar.includes('<TopMenu groups={menus} />'), 'Menueleiste ist nicht gemountet');
assert.ok(topbar.includes('<CommandPalette groups={menus} />'), 'Palette ist nicht gemountet');

console.log('brand:check ok — Oberflaechen-Regeln (ADR-007) eingehalten');
