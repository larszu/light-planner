// Headless-Check fuer die Auffindbarkeit der Dokumentation.
// Lauf: `npm run docs:check`  (node --experimental-strip-types).
//
// WORUM ES GEHT. Am 2026-09-04 wurde ueber alle acht Repos gemessen, wie viele
// Dokumente von einer Einstiegsseite aus ueberhaupt erreichbar sind. Das
// Ergebnis: in `av-planner-suite` 0 von 67, in `cable-planner` 1 von 13, in
// `multicam-planner` 0 von 2, in `Broadcast-intercom` 0 von 3. Hier ist es
// `INTEGRATION.md` — das Dokument, das beschreibt, wie dieser Planer in den
// cable-planner eingebettet wird, also genau das, was jemand sucht, der die
// Einbettung anfasst.
//
// Es ist dieselbe Form wie der Sprachschalter, der existierte, aber in einer
// nie gerenderten Datei lag: die Sache ist da, sie ist sorgfaeltig gemacht, und
// sie liegt ausserhalb des Weges, der zu ihr fuehrt. Ein Dokument, das nur
// findet, wer den Ordner durchblaettert, ist praktisch nicht vorhanden.
//
// WIE GEPRUEFT WIRD. Nicht „steht jedes Dokument im README" — dann waere das
// README selbst die Liste, die veraltet. Der Check laeuft den LINK-GRAPHEN von
// den Einstiegsseiten ab: erreichbar ist, worauf irgendein erreichbares
// Dokument verlinkt. Ein Link auf ein VERZEICHNIS erschliesst die Dokumente
// darin, damit ein spaeterer Unter-Index nicht jede Datei einzeln aufzaehlen
// muss.
//
// WAS ER NICHT PRUEFT: ob der Linktext zum Ziel passt oder das Dokument
// inhaltlich stimmt. Nur, dass ein Weg dorthin existiert.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Wo ein Leser anfaengt. Alles andere muss von hier aus verlinkt sein. */
const EINSTIEGE = ['README.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'TESTING.md', 'SECURITY.md'];

/** Verzeichnisse, die kein Leser durchsucht und in denen fremder Text liegt. */
const UEBERSPRINGEN = new Set(['node_modules', 'dist', 'build', 'release', 'coverage']);

const alleDokumente = (): string[] => {
  const treffer: string[] = [];
  const lauf = (verzeichnis: string) => {
    for (const eintrag of readdirSync(verzeichnis)) {
      if (UEBERSPRINGEN.has(eintrag) || eintrag.startsWith('.')) continue;
      const pfad = join(verzeichnis, eintrag);
      if (statSync(pfad).isDirectory()) {
        lauf(pfad);
        continue;
      }
      if (!/\.md$/i.test(eintrag)) continue;
      const rel = relative(ROOT, pfad);
      if (EINSTIEGE.includes(rel)) continue;
      treffer.push(rel);
    }
  };
  lauf(ROOT);
  return treffer.sort();
};

const zieleIn = (relativerPfad: string): string[] => {
  const voll = join(ROOT, relativerPfad);
  if (!existsSync(voll) || statSync(voll).isDirectory()) return [];
  const inhalt = readFileSync(voll, 'utf8');
  const ziele: string[] = [];
  for (const treffer of inhalt.matchAll(/\]\(([^)\s]+?)(?:#[^)]*)?\)/g)) {
    const ziel = treffer[1];
    if (/^[a-z]+:\/\//i.test(ziel) || ziel.startsWith('#')) continue;
    ziele.push(normalize(relative(ROOT, resolve(join(ROOT, dirname(relativerPfad)), ziel))));
  }
  return ziele;
};

const erreichbar = (): Set<string> => {
  const gesehen = new Set<string>();
  const offen = EINSTIEGE.filter((e) => existsSync(join(ROOT, e)));
  while (offen.length > 0) {
    const aktuell = offen.pop()!;
    if (gesehen.has(aktuell)) continue;
    gesehen.add(aktuell);
    const voll = join(ROOT, aktuell);
    if (!existsSync(voll)) continue;
    if (statSync(voll).isDirectory()) {
      // Nicht rekursiv: wer `docs/` verlinkt, hat dessen Unterordner nicht mit
      // erschlossen — die brauchen einen eigenen Index.
      for (const eintrag of readdirSync(voll)) {
        if (/\.md$/i.test(eintrag)) gesehen.add(relative(ROOT, join(voll, eintrag)));
      }
      continue;
    }
    offen.push(...zieleIn(aktuell));
  }
  return gesehen;
};

const maengel: string[] = [];

// Ohne README liefe der Graph ins Leere und der Lauf waere gruen und wertlos.
if (!existsSync(join(ROOT, 'README.md'))) {
  maengel.push('README.md fehlt — ohne sie prueft dieser Check ins Leere.');
}

const dokumente = alleDokumente();
const gesehen = erreichbar();
for (const w of dokumente.filter((d) => !gesehen.has(d))) maengel.push(`verwaist: ${w}`);

// Ein toter Link macht ein Dokument genauso unerreichbar wie gar kein Link,
// sieht im Verzeichnis aber nach Vollstaendigkeit aus.
for (const quelle of [...EINSTIEGE.filter((e) => existsSync(join(ROOT, e))), ...dokumente]) {
  for (const ziel of zieleIn(quelle)) {
    if (!/\.md$/i.test(ziel)) continue;
    if (!existsSync(join(ROOT, ziel))) maengel.push(`toter Link: ${quelle} -> ${ziel}`);
  }
}

if (maengel.length === 0) {
  console.log(`OK: ${dokumente.length} Dokument(e) ausserhalb der Einstiegsseiten, alle erreichbar.`);
  process.exit(0);
}

console.error('Dokumentation nicht auffindbar:\n');
for (const m of maengel) console.error(`  - ${m}`);
console.error(
  '\nEin Dokument, das nur findet, wer den Ordner durchblaettert, ist praktisch\n' +
    'nicht vorhanden. Vom README aus verlinken (oder von einem Index, der selbst\n' +
    'verlinkt ist).',
);
process.exit(1);
