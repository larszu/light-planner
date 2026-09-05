// ───────────────────────────────────────────────────────────────────────────
// Jeder `*:check`-Lauf aus package.json steht auch im CI-Workflow.
//
// WARUM ES DAS GIBT (gemessen 2026-09-04). package.json fuehrt sieben
// Pruef-Laeufe; `.github/workflows/ci.yml` fuehrte sechs davon aus.
// `mvr:check` fehlte — er existierte, war gruen, und lief bei keinem Merge.
//
// Das ist dieselbe Form, die diese Sitzung in mehreren Repos gefunden hat:
// eine Zusicherung ist gebaut, begruendet und unerreichbar. Ein Guard, den
// niemand faehrt, ist keine Zusicherung, sondern eine Notiz.
//
// WARUM ALS BERECHNETE LISTE UND NICHT ALS AUFZAEHLUNG. Eine Liste, die
// jemand hinschreibt, ist der Kenntnisstand ihres Autors am Tag des
// Hinschreibens. Der achte Pruef-Lauf, den jemand in vier Wochen anlegt,
// faellt hier auf, ohne dass er diese Datei kennen muss — genau das hat
// `mvr:check` nicht getan.
//
// Lauf: `npm run ci:complete`
// ───────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts?: Record<string, string>;
};
// Der Workflow-Pfad ist relativ zum Skript. In einer vendorten Kopie (die
// Suite legt `scripts/` unter `apps/light-planner/` ab, `.github/` bleibt beim
// Wirt) gibt es ihn nicht. Ohne diese Abfrage waere die Meldung ein
// ENOENT-Stacktrace auf einen Pfad, den niemand sucht — mit ihr steht da, was
// tatsaechlich fehlt. Der Lauf scheitert in beiden Faellen, und das ist
// Absicht: „Workflow nicht gefunden" heisst „nicht geprueft", und ein nicht
// geprueftes Versprechen darf nicht gruen aussehen.
const workflowPfad = new URL('../.github/workflows/ci.yml', import.meta.url);

if (!existsSync(workflowPfad)) {
  console.error(`FEHLER: ${workflowPfad.pathname} existiert nicht.`);
  console.error('Dieser Guard vergleicht package.json gegen den CI-Workflow desselben');
  console.error('Repos. Liegt das Skript in einer vendorten Kopie ohne eigenes');
  console.error('.github/, hat er nichts zu vergleichen — dann gehoert er dort auch');
  console.error('nicht in die Pruef-Kette, statt still durchzulaufen.');
  process.exit(1);
}

// Ohne reine Kommentarzeilen. Gemessen 2026-09-05 im `cable-planner`: ein
// Kommentar, der `npm run actions:check` bloss ERWAEHNT, hat den dortigen
// Zwilling dieses Guards zufriedengestellt -- der Lauf stand nirgends als
// Schritt und waere bei keinem Merge gefahren. Die Zusicherung, die dieser
// Guard geben soll, war damit von einem Satz Prosa zu haben.
//
// Nur ganze Kommentarzeilen fallen weg; ein `#` mitten in einer Zeile bleibt
// stehen (es steckt in URLs und Shell-Zeilen, und ein zu eifriges Wegschneiden
// waere die naechste stille Fehlerquelle).
const workflow = readFileSync(workflowPfad, 'utf8')
  .split('\n')
  .filter((zeile) => !/^\s*#/.test(zeile))
  .join('\n');

const checks = Object.keys(pkg.scripts ?? {})
  .filter((name) => name.endsWith(':check'))
  .sort();

if (checks.length === 0) {
  console.error('FEHLER: kein einziger *:check-Lauf in package.json gefunden.');
  console.error('Entweder wurden alle entfernt, oder dieser Guard misst nichts mehr.');
  process.exit(1);
}

const fehlend = checks.filter((name) => !workflow.includes(`npm run ${name}`));

if (fehlend.length > 0) {
  console.error(`FEHLER: ${fehlend.length} von ${checks.length} Pruef-Laeufen stehen nicht in ci.yml:\n`);
  for (const name of fehlend) console.error(`  ! ${name}  (in package.json, nicht im Workflow)`);
  console.error('\nEin Guard, den niemand faehrt, ist keine Zusicherung, sondern eine Notiz.');
  console.error('Eintragen als eigener Schritt in .github/workflows/ci.yml:');
  for (const name of fehlend) {
    console.error(`      - name: <was er zusichert>\n        run: npm run ${name}`);
  }
  process.exit(1);
}

console.log(`OK: alle ${checks.length} Pruef-Laeufe stehen im CI-Workflow (${checks.join(', ')}).`);
