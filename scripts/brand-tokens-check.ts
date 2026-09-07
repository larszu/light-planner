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

console.log('brand:check ok — Oberflaechen-Regeln (ADR-007) eingehalten');
