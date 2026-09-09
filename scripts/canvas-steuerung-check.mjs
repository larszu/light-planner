#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Ist die Canvas-Steuerung dieselbe wie im cable-planner? — `npm run canvas:check`
//
// NUTZER-MELDUNG 2026-09-09: „in light planner gibt es verschieben und
// auswahl. bei cable planner und multicam planner ist die canvas steuerung
// intuitiver. mache das einheitlich wie bei cable planner"
//
// WAS DER UNTERSCHIED WAR. Im cable-planner steht am ReactFlow-Canvas
// `panOnDrag={true}` und `selectionKeyCode='Shift'`: ein Zug auf leerer
// Flaeche SCHIEBT, Shift+Zug zieht den Auswahlrahmen. Im light-planner war es
// andersherum — ein Zug zog den Rahmen, und wer schieben wollte, musste erst
// das Hand-Werkzeug waehlen oder die Leertaste halten. Zwei Zustaende fuer
// das, was nebenan eine Geste ist.
//
// WAS DIESER LAUF PRUEFT: dass die Belegung so bleibt. Drei Dinge, und jedes
// davon ist eine Zeile, die jemand beim naechsten Umbau versehentlich dreht:
//
//   1. Der leere-Flaeche-Zweig im Auswahl-Werkzeug beginnt einen `pan`.
//   2. Der Rahmen haengt an `e.shiftKey`.
//   3. Die additive Auswahl kennt Shift (nicht nur Ctrl/Meta) — sonst
//      wechselt man staendig den Modifier, und genau das nennt der
//      cable-planner in seinem eigenen Kommentar als Grund.
//
// WAS ER AUSDRUECKLICH NICHT KANN: er liest Quelltext, keine Maus. Ob sich
// das Schieben gut ANFUEHLT, sagt er nicht — dafuer gibt es kein Skript. Und
// er prueft NICHT, ob der cable-planner seine Seite der Abmachung haelt: das
// Repo liegt nicht neben diesem. Wer dort `panOnDrag` dreht, faellt hier
// nicht auf. Die Abmachung steht deshalb im Kopf dieser Datei ausgeschrieben,
// damit sie beim Lesen wiederfindbar ist und nicht nur in einem fremden Repo.
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATEI = join(WURZEL, 'src/components/PlanCanvas.tsx');

const quelle = readFileSync(DATEI, 'utf8');
// Kommentare weg, bevor gemessen wird. Sonst ist der Lauf gruen, weil im Kopf
// der Datei steht, was der Code tun SOLL — derselbe Fehler, den
// `zoom-grenze-check.mjs` schon einmal gemacht hat.
const code = quelle
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const fehler = [];

// ── 1. Der Zweig fuer die leere Flaeche ───────────────────────────────────
//
// Er ist das Ende des `activeTool === 'select'`-Blocks. Gesucht wird der
// letzte `dragRef.current = { type: 'pan'` der Datei, denn die frueheren
// gehoeren zum Hand-Werkzeug und zur mittleren Maustaste.
const panStellen = [...code.matchAll(/dragRef\.current = \{ type: 'pan'/g)];
if (panStellen.length < 2) {
  fehler.push(
    'Auf leerer Flaeche wird kein Schub begonnen — es gibt nur ' +
      `${panStellen.length} \`type: 'pan'\`-Stelle(n). Damit zieht ein einfacher ` +
      'Zug wieder den Auswahlrahmen, und das war die gemeldete Sache.',
  );
}
// Der Schub aus dem Auswahl-Werkzeug traegt das Flag, das den Klick ohne
// Bewegung weiterhin die Auswahl aufheben laesst.
if (!/type: 'pan'[^}]*deselectOnClick: true/.test(code)) {
  fehler.push(
    'Der Schub auf leerer Flaeche traegt kein `deselectOnClick` — dann hebt ' +
      'ein Klick ins Leere die Auswahl nicht mehr auf. Vorher erledigte das ' +
      'der Rahmen-Zweig.',
  );
}

// ── 2. Der Rahmen haengt an Shift ─────────────────────────────────────────
if (!/if \(e\.shiftKey\) \{[\s\S]{0,400}?type: 'marquee'/.test(code)) {
  fehler.push(
    "Der Auswahlrahmen haengt nicht an Shift. Der cable-planner setzt " +
      "`selectionKeyCode='Shift'`; eine andere Taste hier heisst, dass die " +
      'beiden Planer wieder verschieden bedient werden.',
  );
}

// ── 3. Additive Auswahl kennt Shift ───────────────────────────────────────
if (!/const ctrl = e\.shiftKey \|\| e\.ctrlKey \|\| e\.metaKey/.test(code)) {
  fehler.push(
    'Die additive Auswahl kennt Shift nicht. Im cable-planner steht ' +
      "`multiSelectionKeyCode={['Shift','Control','Meta']}` — mit der " +
      'Begruendung, dass man sonst staendig den Modifier wechselt.',
  );
}

// ── 4. Die Gegenprobe zum Lauf selbst ─────────────────────────────────────
//
// Ohne sie waere ein Lauf, der die Datei nicht findet oder eine leere liest,
// gruen — und genau so sieht ein kaputtes Muster aus.
if (code.length < 1000 || !code.includes("activeTool === 'select'")) {
  fehler.push(
    'In der gelesenen Datei steht kein `activeTool === \'select\'`. Entweder ' +
      'ist der Pfad falsch, oder der Canvas ist umgebaut — dann gehoert ' +
      'dieser Lauf nachgezogen, nicht ueberlesen.',
  );
}

if (fehler.length > 0) {
  console.error(
    'FEHLER: Die Canvas-Steuerung weicht vom cable-planner ab:\n' +
      fehler.map((f) => `  · ${f}`).join('\n'),
  );
  process.exit(1);
}

console.log(
  'OK: Zug auf leerer Flaeche schiebt, Shift+Zug zieht den Rahmen, ' +
    'Shift/Ctrl/Meta waehlen additiv — wie im cable-planner.',
);
console.log(
  'Gemessen wurde am Quelltext dieses Repos. Ob der cable-planner seine ' +
    'Seite haelt, sieht dieser Lauf nicht: das Repo liegt nicht daneben.',
);
