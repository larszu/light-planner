import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// Flat-Config fuer ESLint v10. Bislang war kein Linter eingerichtet; damit das
// Aufsetzen den bestehenden Code nicht blockiert, laufen vorbestehende
// Verstoesse zunaechst als WARNUNGEN (Lint bleibt gruen), nur echte JS-Fehler
// bleiben Errors. Schrittweise verschaerfbar.
export default defineConfig([
  globalIgnores(['dist', 'release', 'build', 'node_modules']),
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Pragmatisch in der three.js-/Render-Glue-Schicht.
      '@typescript-eslint/no-explicit-any': 'warn',
      // react-hooks v7: neue, teils experimentelle Regeln markieren
      // bestehenden Code. Vorerst als Warnung, nicht blockierend.
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      // Bestehende Stilverstoesse vorerst nicht blockierend.
      'react-refresh/only-export-components': 'warn',
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
    },
  },
  {
    // Build-/Tooling-Skripte. Die Playwright-Skripte evaluieren Code im
    // Browser-Kontext (page.evaluate), daher node + browser Globals.
    files: ['*.config.{js,ts}', 'scripts/**/*.{js,mjs,ts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    files: ['electron/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
]);
