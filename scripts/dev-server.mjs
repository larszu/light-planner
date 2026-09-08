// ───────────────────────────────────────────────────────────────────────────
// Die eine Wahrheit ueber den Dev-Server-Port, fuer alles, was ihn ansteuert.
//
// WARUM ES DAS GIBT (gemessen 2026-09-08). E-10 hat den Planer auf einen
// festen Port genagelt: `vite.config.ts` sagt seit B-17 `port: 4183,
// strictPort: true`. Die zehn Puppeteer-Skripte unter `scripts/` zielten
// weiterhin auf Port 5174 — den Vite-Ausweichport aus der Zeit davor, jedes
// Skript fuer sich, als eigenes Literal. Der Dev-Server hoerte dort nie;
// `npm run shots` und die neun Nachbarn liefen in einen Verbindungsfehler auf
// einem Port, an dem seit der Umstellung niemand mehr sitzt.
//
// Das ist die Preis-Zeile aus E-10 („cable-planners `dev:electron`, lights
// Screenshot-Skripte") — mechanisch, einmalig und bis heute unbezahlt. Bezahlt
// wird sie nicht durch zehn berichtigte Literale: dann steht die Zahl elfmal
// da, und der elfte Ort ist der, den beim naechsten Mal jemand vergisst.
//
// WOHER DIE ZAHL KOMMT. Aus `vite.config.ts`, per Regex — nicht aus einer
// Konstanten hier. Damit bleibt die Vite-Konfiguration die Quelle: sie ist
// das, was den Server tatsaechlich bindet. Eine Konstante in dieser Datei
// waere eine zweite Wahrheit, und die haette denselben Ausgang wie die zehn
// Literale, nur langsamer.
//
// `strictPort` wird mitgeprueft: ohne die Angabe rueckt Vite bei besetztem
// Port still weiter, und dann stimmt die Zahl in der Konfiguration zwar, der
// laufende Server hoert aber woanders — der Fehler saehe aus wie ein Fehler
// dieser Datei.
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';

const konfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

const treffer = /server:\s*\{[^}]*port:\s*(\d+)/s.exec(konfig);
if (!treffer) {
  throw new Error(
    'vite.config.ts nennt keinen festen server.port. Ohne den nimmt Vite 5173, ' +
      'und kein Skript hier kann wissen, wo der Dev-Server sitzt.',
  );
}
if (!/strictPort:\s*true/.test(konfig)) {
  throw new Error(
    'vite.config.ts setzt server.port ohne strictPort. Vite rueckt dann bei ' +
      'besetztem Port still weiter — die Zahl stimmt, der Server hoert woanders.',
  );
}

/** Der Port, auf dem `npm run dev` bindet. Aus `vite.config.ts` gelesen. */
export const devPort = Number(treffer[1]);

/** `http://localhost:<devPort>` — ohne abschliessenden Schraegstrich. */
export const devBaseUrl = `http://localhost:${devPort}`;

/**
 * Basis-URL fuer ein Skript, das den laufenden Dev-Server ansteuert.
 *
 * Rangfolge: ausdrueckliches Argument (`node scripts/x.mjs http://host:port`)
 * vor `LP_DEV_URL` vor dem Port aus `vite.config.ts`. Der abschliessende
 * Schraegstrich faellt weg, damit `${BASE}/seite.html` nicht `//` erzeugt —
 * ein doppelter Schraegstrich ist bei Vite kein Fehler, aber er taucht in
 * jeder Fehlermeldung auf und schickt die Suche in die falsche Richtung.
 */
export const basisUrl = (argv = process.argv) =>
  (argv[2] || process.env.LP_DEV_URL || devBaseUrl).replace(/\/+$/, '');
