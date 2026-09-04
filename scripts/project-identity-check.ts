// Headless-Check fuer die Projekt-Identitaet (`projectId`).
// Lauf: `npm run identity:check`  (node --experimental-strip-types).
//
// WAS HIER SCHIEFGING. `projectId` wurde bei JEDEM Laden neu erzeugt
// (`'proj-' + Date.now()`), auch beim Laden eines bereits gespeicherten
// Projekts und beim Wiederherstellen einer Version. An dieser Id haengen aber
// zwei Dinge:
//
//   versionStore.saveVersion(projectId, …)   die Schnappschuesse
//   saveProjectToStorage(projectId, …)       dedupliziert NUR ueber die Id
//
// Das kostete drei Dinge auf einmal:
//
//   1. Eine Version wiederherstellen machte alle uebrigen Versionen desselben
//      Projekts sofort unerreichbar -- in derselben Sitzung, ohne Neustart.
//   2. Nach jedem App-Start waren saemtliche Schnappschuesse verwaist.
//   3. Laden + Bearbeiten + Speichern legte einen ZWEITEN Eintrag in der
//      Geraete-Liste an, statt den bestehenden zu aktualisieren -- die Liste
//      fuellte sich mit Dubletten desselben Projekts und lief schneller in die
//      localStorage-Quota (fuer die ProjectDialog eigens eine Fehlermeldung
//      hat).
//
// Der Check prueft beide Richtungen: dass die Identitaet dort MITGEHT, wo es
// dasselbe Projekt ist -- und dass sie dort NICHT mitgeht, wo wirklich ein
// neues Projekt entsteht (.avplan-Import, Datei-Import). Ein Guard, der nur
// die erste Haelfte prueft, wuerde eine Ueberkorrektur durchwinken, bei der
// jeder Import im vorigen Projekt landet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../src/components/ProjectDialog.tsx', import.meta.url), 'utf8');
const versionStore = readFileSync(new URL('../src/utils/versionStore.ts', import.meta.url), 'utf8');

// ── 1. Der Dialog reicht die gespeicherte Id durch ──────────────────────────
assert.match(
  dialog,
  /onLoad:\s*\(project:\s*ProjectData,\s*id:\s*string\)\s*=>\s*void/,
  'ProjectDialog.onLoad nimmt die Projekt-Id nicht mehr entgegen — ohne sie kann der Aufrufer die Identitaet gar nicht erhalten',
);
assert.match(
  dialog,
  /onLoad\(p\.data,\s*p\.id\)/,
  'Die Projektliste ruft onLoad ohne p.id auf — die gespeicherte Identitaet geht schon hier verloren',
);

// ── 2. handleLoadProject kann eine Identitaet uebernehmen ───────────────────
assert.match(
  app,
  /const handleLoadProject = useCallback\(\(data: ProjectData, keepId\?: string\)/,
  'handleLoadProject nimmt keine bestehende Id mehr entgegen',
);
assert.match(
  app,
  /setProjectId\(keepId \?\? 'proj-' \+ Date\.now\(\)\)/,
  'handleLoadProject erzeugt wieder bedingungslos eine neue Id, statt eine mitgegebene zu behalten',
);
// Es darf keine zweite, unbedingte Neuvergabe daneben stehen.
const unbedingt = [...app.matchAll(/setProjectId\((?!keepId)/g)];
assert.equal(
  unbedingt.length,
  0,
  `setProjectId wird an ${unbedingt.length} Stelle(n) ohne keepId-Fallback gerufen — jede davon kann die Identitaet still fallen lassen`,
);

// ── 3. Version wiederherstellen bleibt dasselbe Projekt ─────────────────────
//
// Die erste Fassung dieser Zusicherung war ein Regex auf die EINZEILIGE
// Schreibweise `onRestore={(doc) => { handleLoadProject(doc, projectId);`.
// Als der Aufruf beim naechsten Fix mehrzeilig wurde, meldete sie "laedt ohne
// projectId" -- obwohl die Id uebergeben wurde. Ein Guard, der Formatierung
// pinnt statt Bedeutung, meldet frueher oder spaeter das Falsche. Deshalb wird
// jetzt der Block ausgeschnitten und auf seinen Inhalt geprueft.
const onRestoreBlock = (() => {
  const i = app.indexOf('onRestore={');
  assert.notEqual(i, -1, 'onRestore in App.tsx nicht gefunden — der Check prueft sonst nichts');
  return app.slice(i, i + 900);
})();

assert.match(
  onRestoreBlock,
  /handleLoadProject\(\s*\{[\s\S]*?\}\s*,\s*projectId\s*,?\s*\)|handleLoadProject\(\s*doc\s*,\s*projectId\s*,?\s*\)/,
  'VersionDialog.onRestore laedt ohne die aktuelle projectId — damit macht das Wiederherstellen einer Version daraus ein anderes Projekt und die uebrigen Versionen sind weg',
);

// ── 3b. Der Grundriss ueberlebt das Wiederherstellen ────────────────────────
//
// `versionStore.saveVersion` laesst `floorPlan` BEWUSST aus dem Schnappschuss
// weg (das Bitmap wuerde den Speicher sprengen). `handleLoadProject` liest ein
// fehlendes `floorPlan` aber als "keiner vorhanden" und setzt auf null. Beide
// Entscheidungen sind fuer sich richtig; zusammen loeschten sie bei jedem
// Wiederherstellen den importierten und kalibrierten Gebaeudeplan. Der
// Aufrufer fuellt die Auslassung, weil nur er weiss, dass sein Dokument
// schlank ist.
assert.match(
  onRestoreBlock,
  /serializeFloorPlan\(floorPlan\)/,
  'onRestore gibt den aktuellen Grundriss nicht mit — dann wirft jedes Wiederherstellen einer Version den importierten und kalibrierten Gebaeudeplan weg',
);
assert.match(
  versionStore,
  /floorPlan:\s*undefined/,
  'versionStore legt den Grundriss offenbar doch in den Schnappschuss — dann ist die Ergaenzung in onRestore ueberfluessig und dieser Check irrefuehrend',
);

// ── 4. Gegenrichtung: echte Importe bekommen KEINE geerbte Id ───────────────
// `.avplan`-Import und Datei-Import sind neue Projekte. Wuerden sie eine Id
// erben, landete jeder Import im zuvor geoeffneten Projekt und ueberschriebe
// beim naechsten Speichern dessen Eintrag.
/**
 * Findet fuer jeden `handleLoadProject(`-Aufruf heraus, ob er ein ZWEITES
 * Argument hat -- also ein Komma auf oberster Klammerebene.
 *
 * Ein simples `/handleLoadProject\(([^)]*)\)/` genuegt hier nicht: zwei der
 * Aufrufe uebergeben ein Objektliteral, dessen eigene Kommas jeden naiven
 * Test sofort falsch positiv machen. (Die erste Fassung dieses Checks tat
 * genau das und meldete 3 statt 1 -- ein Guard, der zu viel meldet, ist so
 * unbrauchbar wie einer, der zu wenig meldet.)
 */
function argumente(src: string, start: number): string[] {
  let tiefe = 0;
  let quote: string | null = null;
  let stueck = '';
  const out: string[] = [];
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      stueck += c;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; stueck += c; continue; }
    if (c === '(' || c === '[' || c === '{') tiefe += 1;
    if (c === ')' && tiefe === 0) { out.push(stueck.trim()); return out; }
    if (c === ')' || c === ']' || c === '}') tiefe -= 1;
    if (c === ',' && tiefe === 0) { out.push(stueck.trim()); stueck = ''; continue; }
    stueck += c;
  }
  return out;
}

const importAufrufe: string[][] = [];
for (const m of app.matchAll(/handleLoadProject\(/g)) {
  importAufrufe.push(argumente(app, (m.index ?? 0) + m[0].length));
}
const mitId = importAufrufe.filter((a) => a.length > 1).map((a) => a.join(', '));
assert.equal(
  mitId.length,
  1,
  `Genau EIN handleLoadProject-Aufruf darf eine Id mitgeben (das Wiederherstellen einer Version); gefunden: ${mitId.length} — ${JSON.stringify(mitId)}`,
);
// Geprueft wird das ZWEITE Argument, nicht das erste: seit der Grundriss
// mitgegeben wird, ist das erste ein Objektliteral. Auch diese Zusicherung war
// zuerst an die Schreibweise gebunden und meldete daraufhin das Falsche.
assert.match(
  mitId[0],
  /,\s*projectId\s*,?\s*$/,
  `Der Aufruf mit Id uebergibt nicht projectId als zweites Argument: ${mitId[0]}`,
);

console.log('✓ Projekt-Identitaet: uebernommen wo dasselbe Projekt, frisch wo ein neues');
console.log(`  handleLoadProject-Aufrufe: ${importAufrufe.length}, davon mit Id: ${mitId.length}`);
console.log('\nAlle Projekt-Identitaets-Checks bestanden.');
