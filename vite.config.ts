import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  base: './',
  // Suite-Einbettung (Backlog B-17): Die Shell erwartet den Licht-Planer im
  // Entwicklungsbetrieb auf 4183 — so steht es in ihrer `registry.ts` und in
  // ihrer README. Ohne feste Angabe landete er auf dem Vite-Standard 5173, wo
  // ihn dort niemand sucht; startete daneben ein zweiter Planer, rueckte einer
  // von beiden still auf 5174 weiter, und die Shell zeigte „Licht-Planer ist
  // gerade nicht erreichbar" — ein Fehler, der aussah wie einer der Shell.
  //
  // `strictPort`, damit ein besetzter Port ABBRICHT statt weiterzuruecken.
  // Genau das stille Weiterruecken ist der Defekt; ein Startfehler mit
  // Portnummer ist die bessere Meldung.
  server: { port: 4183, strictPort: true },
  // Single source of truth for the app version (shown in "Über Light Planner").
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
