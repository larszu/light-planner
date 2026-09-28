// ───────────────────────────────────────────────────────────────────────────
// Die Kopien der Suite-Pakete sind zeichengleich mit ihrem Manifest (ADR-015).
// Lauf: `npm run kopien:check`
//
// WARUM ES DAS GIBT. Gemeinsamer Code der AV-Planner lebt in
// `av-planner-suite/packages/<name>/src`. Ein Planer traegt davon eine
// Kopie unter `src/**/avplan/<name>/` mit einem `MANIFEST.json`, das je Datei
// den SHA-256 nennt; `npm run pakete:verteilen` in der Suite schreibt beides.
//
// Vor ADR-015 gab es drei `venueExchange.ts` und vier Plan-Lader, deren
// Kommentare sich „byte-gleich" nannten und es nicht waren: geprueft wurden
// ueberall nur Schluessellisten, nie Bytes. Eine kleine Korrektur in EINER
// Kopie ist der Anfang genau dieser Drift — sie sieht vernuenftig aus, und
// beim naechsten Verteilen ist sie entweder still weg oder der Grund, warum
// jemand das Verteilen nicht mehr laufen laesst.
//
// Deshalb wird hier gerechnet, nicht verglichen: jede gelistete Datei muss
// ihren Hash treffen, und eine .ts/.tsx im Ordner, die das Manifest nicht
// nennt, ist ebenso ein Fehler — sonst waere „neue Datei daneben legen" der
// Weg um den Waechter herum.
//
// Ohne jede Kopie scheitert der Lauf ebenfalls: dann misst er nichts, und
// ein Waechter, der nichts misst, darf nicht gruen aussehen.
// ───────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const src = join(wurzel, 'src');

interface Manifest {
  paket?: string;
  dateien?: Record<string, string>;
}

const sha256 = (pfad: string): string => createHash('sha256').update(readFileSync(pfad, 'utf8'), 'utf8').digest('hex');

/** Alle Ordner namens `avplan` unter `dir`, rekursiv. */
function avplanOrdner(dir: string): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    if (!eintrag.isDirectory()) continue;
    const pfad = join(dir, eintrag.name);
    if (eintrag.name === 'avplan') treffer.push(pfad);
    treffer.push(...avplanOrdner(pfad));
  }
  return treffer;
}

/** Alle Dateien unter `dir`, relativ zu `dir`, mit `/` als Trenner. */
function dateienUnter(dir: string, basis = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const pfad = join(dir, name);
    if (statSync(pfad).isDirectory()) out.push(...dateienUnter(pfad, basis));
    else out.push(relative(basis, pfad).split(sep).join('/'));
  }
  return out;
}

const fehler: string[] = [];
const geprueft: string[] = [];

for (const ordner of avplanOrdner(src)) {
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    if (!eintrag.isDirectory()) continue;
    const kopie = join(ordner, eintrag.name);
    const anzeige = relative(wurzel, kopie).split(sep).join('/');
    const name = eintrag.name;
    const manifestPfad = join(kopie, 'MANIFEST.json');
    if (!existsSync(manifestPfad)) {
      fehler.push(`${anzeige}: kein MANIFEST.json — eine Kopie ohne Manifest laesst sich nicht pruefen.`);
      continue;
    }
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPfad, 'utf8')) as Manifest;
    } catch (e) {
      fehler.push(`${anzeige}/MANIFEST.json: kein gueltiges JSON (${e instanceof Error ? e.message : String(e)}).`);
      continue;
    }
    const gelistet = manifest.dateien ?? {};
    if (Object.keys(gelistet).length === 0) {
      fehler.push(`${anzeige}/MANIFEST.json: listet keine einzige Datei.`);
      continue;
    }
    const hinweis = `Kopie eines Suite-Pakets (ADR-015) — Aenderung gehoert nach av-planner-suite/packages/${name}, dann npm run pakete:verteilen`;
    for (const [datei, soll] of Object.entries(gelistet)) {
      const pfad = join(kopie, datei);
      if (!existsSync(pfad)) {
        fehler.push(`${anzeige}/${datei}: fehlt, steht aber im Manifest.\n    ${hinweis}`);
        continue;
      }
      const ist = sha256(pfad);
      if (ist !== soll) {
        fehler.push(`${anzeige}/${datei}: geaendert (sha256 ${ist.slice(0, 12)}…, Manifest ${soll.slice(0, 12)}…).\n    ${hinweis}`);
      }
    }
    for (const datei of dateienUnter(kopie)) {
      if (!/\.tsx?$/.test(datei)) continue;
      if (!(datei in gelistet)) {
        fehler.push(`${anzeige}/${datei}: nicht im Manifest.\n    ${hinweis}`);
      }
    }
    geprueft.push(`${anzeige} (${manifest.paket ?? name}, ${Object.keys(gelistet).length} Dateien)`);
  }
}

if (geprueft.length === 0 && fehler.length === 0) {
  console.error('FEHLER: keine Paket-Kopie unter src/**/avplan/<name>/ gefunden.');
  console.error('Entweder wurde die Kopie entfernt (dann auch diesen Lauf), oder er misst nichts mehr.');
  process.exit(1);
}

if (fehler.length > 0) {
  console.error(`FEHLER: ${fehler.length} Abweichung(en) in den Paket-Kopien:\n`);
  for (const f of fehler) console.error(`  ! ${f}`);
  process.exit(1);
}

for (const g of geprueft) console.log(`✓ ${g} — zeichengleich mit dem Manifest`);
