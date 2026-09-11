// ───────────────────────────────────────────────────────────────────────────
// Die Kopfzeile bleibt im Schnitt der Suite (ADR-007 Abschnitt 6).
// Lauf: `npm run kopfzeile:check`
//
// NUTZER-AUFTRAG 2026-09-11: „Stelle sicher das in allen repos uebergreifend
// das Einstellungen Menue an der gleichen Stelle ist wie im Cable planner und
// das die obere Menueleiste gleich aufgebaut ist. Passe an den Cable planner
// stand an, wenn noetig und vereinheitliche Komponenten."
//
// ─── WOGEGEN DIESER LAUF STEHT ────────────────────────────────────────────
//
// Nicht gegen das Bauen — das ist einmal passiert und steht im Diff. Gegen
// das ZURUECKRUTSCHEN: gegen den naechsten Hamburger, der „auf schmalen
// Fenstern spart"; gegen eine Kopfzeile, die beim naechsten Umbau wieder
// 52 px bekommt, weil das eine Tailwind-Stufe war; gegen einen
// Einstellungen-Knopf, der nach links wandert, weil dort gerade Platz war.
// Das faellt niemandem auf, der nur diese App benutzt — es faellt dem auf,
// der zwischen zwei Werkzeugen der Suite wechselt und die Bedienung an
// derselben Stelle sucht.
//
// Und er steht gegen die Rueckkehr der zweiten Liste. Bis zum 2026-09-11
// standen die Menue-Eintraege doppelt: als Modell in `menuModel.ts` (fuer die
// Kommandopalette) und ein zweites Mal getippt im Hamburger von `TopBar.tsx`.
// Die beiden waren laengst auseinander — .avplan, Venue und der
// Lichtplan-Druck standen nur im Hamburger. Die Defektform heisst in dieser
// Suite `zwei-rechnungen`.
//
// ─── WAS ER NICHT KANN ────────────────────────────────────────────────────
//
// Er liest Quelltext. Ob der Knopf im gerenderten Fenster wirklich rechts
// aussen sitzt, sieht er nicht: ein `order`-Wert im Stilblatt wuerde ihn
// taeuschen. Und er misst die Reihenfolge der Menues im MODELL, nicht die im
// Bild — ein `flex-direction: row-reverse` an der Leiste bliebe ihm verborgen.
//
// Der uebergreifende Massstab liegt in der Suite
// (`scripts/chrome-parity.mjs`) und misst alle sechs Apps im selben Baum;
// dieser Lauf ist die Haelfte, die MITWANDERT und schon vor dem Vendorieren
// faellt.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const lies = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const css = lies('src/App.css');
const topbar = lies('src/components/TopBar.tsx');
const modell = lies('src/components/menuModel.ts');
const menue = lies('src/components/TopMenu.tsx');
const einstellungen = lies('src/components/SettingsDialog.tsx');

// ── 1. Die Masse ─────────────────────────────────────────────────────────
const topbarBlock = css.slice(css.indexOf('.topbar {'), css.indexOf('.topbar {') + 700);
assert.ok(topbarBlock.includes('height: 40px'), '.topbar ist nicht 40 px hoch');
// `flex: none` gehoert dazu: ohne das schrumpft die Zeile, sobald der Inhalt
// darunter waechst, und die 40 waeren eine Wunschzahl.
assert.ok(topbarBlock.includes('flex: none'), '.topbar darf nicht schrumpfen duerfen');
assert.match(css, /grid-template-rows:\s*40px 1fr 24px/, '.app fuehrt nicht 40 px Kopf und 24 px Fuss');

// ── 2. Kein Hamburger auf dem Desktop ────────────────────────────────────
//
// Gemessen an der IKONE, nicht am Wort: `<Icon name="menu" />` ist der
// Hamburger dieser App. Ein Lauf, der nach „hamburger" sucht, fande nichts —
// so heisst er im Quelltext nirgends.
assert.ok(
  !/<Icon name="menu"/.test(topbar),
  'Der Hamburger ist zurueck in der Kopfzeile (ADR-007 Abschnitt 6: Menues links, kein Hamburger auf dem Desktop)',
);
assert.ok(topbar.includes('<TopMenu groups={menus} />'), 'Die Menueleiste ist nicht gemountet');

// ── 3. Die Menues und ihre Reihenfolge ───────────────────────────────────
const ROLLEN = ['file', 'edit', 'tools', 'view', 'help'];
const stellen = ROLLEN.map((r) => {
  const i = modell.indexOf(`id: '${r}'`);
  assert.ok(i > 0, `Es gibt kein ${r}-Menue`);
  return i;
});
assert.deepEqual(
  stellen,
  [...stellen].sort((a, b) => a - b),
  'Die Menues stehen nicht in der Folge des Cable Planners (File · Edit · Tools · View · Help)',
);

// Der gemeinsame Grundstock im Datei-Menue. Gemessen an den Schluesseln und
// nicht an den Woertern: die Beschriftung ist uebersetzbar, der Schluessel
// nicht.
for (const schluessel of ['menu.new', 'menu.load', 'menu.save', 'menu.saveFile']) {
  assert.ok(modell.includes(`'${schluessel}'`), `Das Datei-Menue fuehrt kein '${schluessel}'`);
}
assert.ok(modell.includes("'menu.about'"), 'Das Hilfe-Menue fuehrt kein „Ueber"');

// „Save as…" darf nicht derselbe Aufruf sein wie „Save": zwei Eintraege mit
// einem Verhalten waeren einer zu viel — genau der Fehler, der am selben Tag
// im facility-planner gefunden wurde.
assert.ok(
  modell.includes('onClick: p.onSave }') && modell.includes('onClick: p.onSaveToFile }'),
  '„Speichern" und „Speichern unter" rufen dasselbe auf',
);

// ── 4. Eine Liste, zwei Wege ─────────────────────────────────────────────
assert.match(topbar, /buildMenus\(/, 'Die Kopfzeile baut ihre Menues nicht aus dem Modell');
assert.ok(
  topbar.includes('<CommandPalette groups={menus} />'),
  'Die Kommandopalette liest nicht dieselbe Liste (oder ist gar nicht gemountet)',
);
assert.match(menue, /import type \{ MenuGroup \} from '\.\/menuModel'/, 'Die Leiste liest nicht das Modell');
// Eine zweite, getippte Liste in der Leiste selbst waere der Rueckfall.
assert.ok(!/t\('menu\./.test(menue), 'Die Menueleiste tippt Eintraege selbst, statt das Modell zu lesen');

// ── 5. Die Einstellungen rechts aussen, als LETZTER Bedienpunkt ──────────
const rechtsBlock = topbar.slice(topbar.indexOf('topbar-right'), topbar.indexOf('</header>'));
const knopf = rechtsBlock.indexOf("t('settings.title', 'Settings')");
assert.ok(knopf > 0, 'Kein Einstellungen-Knopf in der rechten Gruppe');
// Nach ihm darf in der rechten Gruppe kein weiterer `<button` mehr aufgehen.
const danach = rechtsBlock.slice(knopf, rechtsBlock.indexOf('</div>', knopf));
assert.ok(
  !danach.includes('<button'),
  'Nach den Einstellungen steht noch ein Bedienpunkt — sie sind nicht mehr rechts aussen',
);

// Der Sprachschalter steht IM Dialog und nicht mehr im Hilfe-Menue.
assert.match(einstellungen, /setLanguage\(/, 'Der Einstellungen-Dialog schaltet die Sprache nicht');
assert.ok(!/setLanguage/.test(modell), 'Der Sprachschalter ist zurueck im Menue-Modell');

// ── 6. Was der Dialog NICHT hat, steht begruendet darin ──────────────────
//
// Der gemeinsame Grundstock der Suite ist Sprache, Thema und Ueber. Das Thema
// fehlt hier mit Messung (ein einziges dunkles Stilblatt, dazu der 2D-Canvas
// und die 3D-Szene). Faellt diese Zeile, weil jemand die Umstellung gebaut
// hat: dann gehoert der Umschalter hinein, und sie wird GEAENDERT statt
// geloescht.
assert.ok(einstellungen.includes('B-70'), 'Der Grund fuer das fehlende Thema fehlt im Dialog');

// ── 7. Die tote Zweitleiste ist weg ──────────────────────────────────────
assert.ok(
  !existsSync(new URL('../src/components/MenuBar.tsx', import.meta.url)),
  'MenuBar.tsx ist zurueck — eine zweite Menue-Implementierung, die niemand rendert, driftet lautlos',
);

console.log('kopfzeile:check ok — 40 px, kein Hamburger, File/Edit/Tools/View/Help, Einstellungen rechts aussen');
