import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  base: './',
  // Single source of truth for the app version (shown in "Über Light Planner").
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
