// ───────────────────────────────────────────────────────────────────────────
// Keine Datei nennt eine Dev-Server-Adresse, an der niemand hoert.
//
// WARUM ES DAS GIBT (gemessen 2026-09-08). B-17 hat den Planer auf 4183
// festgenagelt (`vite.config.ts`, `strictPort: true`); zehn Skripte unter
// `scripts/` zielten weiter auf Port 5174, jedes mit einem eigenen Literal.
// Der Fehler war stumm: `npm run shots` startete, holte sich einen
// Verbindungsfehler und sah aus wie ein Puppeteer-Problem. Kein Lauf, keine
// Pruefung und keine Doku hat die Abweichung gemeldet — die Zahl stand
// zehnmal da, und keine der zehn Stellen wusste von den neun anderen.
//
// Und ja, diese Datei haelt sich selbst an ihre Regel: die alte Adresse steht
// hier als ZAHL und nicht als waehlbares `localhost:`-Literal. Der erste
// Versuch tat das nicht — der Wachter hat sich beim ersten CI-Lauf selbst
// gemeldet (Lauf 34194046486). Das ist kein Schoenheitsfehler, sondern der
// Beleg, dass er auch Dateien prueft, die niemand als „Doku" durchgehen
// laesst. Lokal war er blind dafuer, weil er nur VERSIONIERTE Dateien liest
// und er selbst da noch nicht versioniert war.
//
// WAS ER PRUEFT, und warum genau das. Nicht „importieren die Skripte
// `basisUrl`" — das waere ein Wachter auf die Aufrufform, und der wird bei der
// naechsten richtigen Aenderung geaendert statt gelesen (ein Skript, das
// `page.goto` durch etwas anderes ersetzt, aber weiter den richtigen Port
// nimmt, waere rot, ohne dass etwas kaputt ist). Geprueft wird die
// Zusicherung: **jede WAEHLBARE localhost-Adresse in einer versionierten Datei
// nennt den Port, den Vite tatsaechlich bindet.** Waehlbar heisst: sie hat die
// Form `localhost:<zahl>`, also die Form, die jemand kopieren und in einen
// Browser oder ein Skript stecken kann. Eine blosse Zahl in einem Fliesstext
// („Vite nimmt sonst 5173") ist keine Adresse und faellt nicht darunter —
// sonst waere die Begruendung im Code nicht mehr aufschreibbar.
//
// Die Quelle ist `vite.config.ts`, gelesen ueber `scripts/dev-server.mjs`,
// nicht eine Zahl in dieser Datei. Ein Wachter mit eigener Konstante prueft
// gegen sich selbst und geht mit derselben Umstellung kaputt, die er finden
// soll.
//
// Lauf: `npm run devport:check`
// ───────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { devPort } from './dev-server.mjs';

// Nur versionierte Dateien: was nicht im Repo liegt, kann auch niemanden
// fehlleiten. `git ls-files` haelt zugleich `node_modules/`, `dist/` und
// `release/` heraus, ohne dass hier eine Ausschlussliste stuende, die
// veraltet.
const dateien = execFileSync('git', ['ls-files'], {
  cwd: new URL('..', import.meta.url).pathname,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const TEXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|md|ya?ml|html|css|txt)$/;
const ADRESSE = /localhost:(\d+)/g;

const fehler: string[] = [];

for (const datei of dateien) {
  if (!TEXT.test(datei)) continue;
  let inhalt: string;
  try {
    inhalt = readFileSync(new URL(`../${datei}`, import.meta.url), 'utf8');
  } catch {
    // Symlink oder geloescht-aber-noch-indiziert: keine Aussage moeglich,
    // also auch keine Beschwerde.
    continue;
  }
  const zeilen = inhalt.split('\n');
  zeilen.forEach((zeile, i) => {
    for (const treffer of zeile.matchAll(ADRESSE)) {
      const port = Number(treffer[1]);
      if (port === devPort) continue;
      fehler.push(
        `${datei}:${i + 1} nennt localhost:${port}, der Dev-Server bindet auf ${devPort}`,
      );
    }
  });
}

if (fehler.length) {
  console.error('devport:check FEHLGESCHLAGEN:');
  for (const f of fehler) console.error(`  - ${f}`);
  console.error(
    '\nDer Port steht in vite.config.ts und nirgends sonst. Skripte holen ihn ' +
      'ueber `basisUrl()` aus scripts/dev-server.mjs; Doku schreibt ihn nicht ab, ' +
      'sondern verweist auf `npm run dev`.',
  );
  process.exit(1);
}

console.log(
  `devport:check ok — keine waehlbare localhost-Adresse weicht von ${devPort} ab (E-10, B-17)`,
);
