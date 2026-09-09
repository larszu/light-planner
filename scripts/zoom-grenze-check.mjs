#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Zoomt der Plan oder die Seite? — Lauf: `npm run zoom:check`
//
// Nutzer-Meldung 2026-09-09: „man kann zu leicht die ganze Website und nicht
// nur canvas zoomen".
//
// DER DEFEKT, den dieser Lauf kuenftig verhindert, sah im Quelltext RICHTIG
// aus. Er stand so da:
//
//     const handleWheel = (e: React.WheelEvent) => {
//       e.preventDefault();
//       ... zoomt den Plan ...
//     };
//     <canvas onWheel={handleWheel} />
//
// React haengt `wheel` seit Version 17 als PASSIVEN Listener an die Wurzel.
// In einem passiven Listener ist `preventDefault()` wirkungslos: der Browser
// ignoriert ihn und meldet es hoechstens in der Konsole. Der Aufruf stand
// also da, las sich wie eine Zusage und tat nichts — Strg+Rad ueber dem Plan
// vergroesserte die ganze Website.
//
// Das ist genau die Sorte Fehler, die eine Pruefung braucht: nichts an ihm
// ist beim Lesen auffaellig. Man sieht ihn nur, wenn man weiss, wo React die
// Listener anhaengt.
//
// DREI DINGE GEHOEREN ZUSAMMEN, und dieser Lauf haelt alle drei fest:
//   1. kein `preventDefault()` in einem React-`onWheel` (wirkungslos),
//   2. ein eigener `wheel`-Listener mit `{ passive: false }` am Canvas,
//   3. `touch-action: none` am Canvas — sonst nimmt der Browser die
//      Pinch-Geste auf Tablets vorweg, bevor Punkt 2 ueberhaupt drankommt.
// Fehlt eines davon, zoomt wieder die Seite. Zwei von drei genuegen nicht.
//
// WAS DIESER LAUF NICHT KANN: Er liest Quelltext. Ob im laufenden Browser
// wirklich der Plan und nicht die Seite groesser wird, misst er nicht — dazu
// braeuchte es ein echtes Fenster und eine echte Geste. Er prueft die drei
// Voraussetzungen, ohne die es sicher falsch ist.
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');

const dateien = [];
const gehe = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') gehe(p); }
    else if (/\.tsx?$/.test(e)) dateien.push(p);
  }
};
gehe(join(WURZEL, 'src'));

// ── Regel 1: `preventDefault()` in einem React-`onWheel` ──────────────────
//
// Zwei Schreibweisen kommen vor: die Funktion steht direkt im JSX, oder sie
// steht darueber und wird beim Namen genannt. Beide werden geprueft — die
// zweite ist die haeufigere und die unauffaelligere.
const passiveFalle = (quelle) => {
  const treffer = [];
  // a) inline: onWheel={(e) => { ... preventDefault() ... }}
  for (const m of quelle.matchAll(/onWheel=\{([\s\S]{0,400}?)\}\}/g)) {
    if (/preventDefault\s*\(/.test(m[1])) treffer.push({ index: m.index, name: '(inline)' });
  }
  // b) benannt: onWheel={handleWheel} — dann den Rumpf jener Funktion lesen.
  for (const m of quelle.matchAll(/onWheel=\{(\w+)\}/g)) {
    const name = m[1];
    const def = new RegExp(`const\\s+${name}\\s*=\\s*\\([\\s\\S]{0,4000}?\\n\\s*\\};`).exec(quelle);
    if (def && /preventDefault\s*\(/.test(def[0])) treffer.push({ index: m.index, name });
  }
  return treffer;
};

const fehler = [];
let geprüfteCanvas = 0;

for (const datei of dateien) {
  const quelle = readFileSync(datei, 'utf8');
  const kurz = datei.replace(WURZEL + '/', '');
  for (const t of passiveFalle(quelle)) {
    const zeile = quelle.slice(0, t.index).split('\n').length;
    fehler.push(
      `${kurz}:${zeile} — \`onWheel=${t.name === '(inline)' ? '{...}' : `{${t.name}}`}\` ruft ` +
        '`preventDefault()`. React haengt `wheel` passiv an; der Aufruf ist wirkungslos ' +
        'und die Seite zoomt mit. Eigener Listener mit `{ passive: false }`.',
    );
  }
  if (/<canvas\b/.test(quelle)) geprüfteCanvas += 1;
}

// ── Regel 2: der eigene Listener am Plan-Canvas ──────────────────────────
const plan = readFileSync(join(WURZEL, 'src/components/PlanCanvas.tsx'), 'utf8');
if (!/addEventListener\(\s*'wheel'[\s\S]{0,200}?passive:\s*false/.test(plan)) {
  fehler.push(
    'src/components/PlanCanvas.tsx registriert kein `wheel` mit `{ passive: false }`. ' +
      'Ohne das kann der Plan den Seiten-Zoom nicht abfangen.',
  );
}
// Safari schickt auf dem Trackpad `gesture*` statt Strg+Rad. Ohne die zoomt
// dort weiter die Seite, und zwar nur dort — der unangenehmste Fall.
for (const g of ['gesturestart', 'gesturechange', 'gestureend']) {
  if (!plan.includes(`'${g}'`)) {
    fehler.push(`src/components/PlanCanvas.tsx faengt \`${g}\` nicht ab (Safari-Trackpad).`);
  }
}

// ── Regel 3: `touch-action` am Canvas ───────────────────────────────────
// Die Kommentare RAUS, bevor gemessen wird. Der erste Anlauf hier las den
// Block mitsamt Kommentar — und der Kommentar erklaert `touch-action: none`,
// also fand die Pruefung ihre eigene Begruendung und war gruen, auch nachdem
// die Regel geloescht war. Genau die Gegenprobe unten hat das aufgedeckt.
const css = readFileSync(join(WURZEL, 'src/App.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const canvasBlock = (() => {
  const i = css.indexOf('.plan-canvas {');
  if (i < 0) return null;
  const auf = css.indexOf('{', i);
  const zu = css.indexOf('}', auf);
  return auf < 0 || zu < 0 ? null : css.slice(auf + 1, zu);
})();
if (canvasBlock === null) {
  fehler.push('`.plan-canvas` steht nicht mehr in src/App.css — dann misst Regel 3 nichts.');
} else if (!/touch-action\s*:\s*none/.test(canvasBlock)) {
  fehler.push(
    '`.plan-canvas` hat kein `touch-action: none`. Der Browser nimmt die Pinch-Geste ' +
      'dann vorweg, und der nicht-passive Radhandler kommt gar nicht erst dran.',
  );
}

// ── Regel 4: kein `frame-ancestors` in der <meta>-Richtlinie ─────────────
//
// Browser ignorieren `frame-ancestors` ausdruecklich, wenn die Richtlinie per
// <meta> kommt. Die Zeile schuetzte vor nichts und sah aus, als tue sie es —
// und haette der Browser sie befolgt, haette sie die Einbettung des Planers
// in die Suite verboten. Echter Schutz braucht den HTTP-Kopf.
const html = readFileSync(join(WURZEL, 'index.html'), 'utf8');
const metaCsp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
if (!metaCsp) {
  fehler.push('index.html hat keine <meta>-Content-Security-Policy mehr — Regel 4 misst nichts.');
} else if (metaCsp[1].includes('frame-ancestors')) {
  fehler.push(
    'index.html: `frame-ancestors` steht in der <meta>-Richtlinie. Browser ignorieren es ' +
      'dort — es schuetzt nichts und bricht, wo es befolgt wuerde, die Einbettung in die Suite.',
  );
}

// ── Die Gegenprobe zum Lauf selbst ───────────────────────────────────────
//
// Eine Pruefung, die nicht fehlschlagen KANN, ist keine. Beide Muster werden
// an einer festen Probe vorgefuehrt; findet eines davon seinen eigenen
// Defekt nicht mehr, faellt der Lauf hier — nicht erst beim naechsten Nutzer.
const probeInline = `<canvas onWheel={(e) => { e.preventDefault(); zoom(e); }} />`;
const probeBenannt = [
  'const handleWheel = (e: React.WheelEvent) => {',
  '  e.preventDefault();',
  '};',
  '<canvas onWheel={handleWheel} />',
].join('\n');
if (passiveFalle(probeInline).length === 0) {
  fehler.push('Gegenprobe: die Inline-Schreibweise wird nicht mehr erkannt.');
}
if (passiveFalle(probeBenannt).length === 0) {
  fehler.push('Gegenprobe: die benannte Schreibweise wird nicht mehr erkannt.');
}
if (passiveFalle('<div onWheel={scrollListe} />').length !== 0) {
  // Ein `onWheel` OHNE `preventDefault` ist voellig in Ordnung — wer das
  // meldet, treibt Leute dazu, den Lauf abzuschalten.
  fehler.push('Gegenprobe: ein harmloses `onWheel` wird faelschlich gemeldet.');
}
if (geprüfteCanvas === 0) {
  fehler.push('Kein einziges <canvas> gefunden — dann passt das Muster nicht mehr.');
}

if (fehler.length > 0) {
  console.error('FEHLER: der Zoom greift ueber den Canvas hinaus:\n' +
    fehler.map((f) => `  · ${f}`).join('\n'));
  process.exit(1);
}

console.log(
  `OK: ${geprüfteCanvas} Datei(en) mit <canvas>, kein passives \`preventDefault\`, ` +
    'eigener Radhandler mit `{ passive: false }`, `touch-action: none` gesetzt, ' +
    'kein `frame-ancestors` in der <meta>-Richtlinie.',
);
console.log(
  'Gelesen wurde Quelltext. Ob im laufenden Browser wirklich nur der Plan ' +
    'zoomt, misst dieser Lauf nicht — er prueft die drei Voraussetzungen, ' +
    'ohne die es sicher falsch ist.',
);
