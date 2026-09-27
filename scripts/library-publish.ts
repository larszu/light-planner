// ───────────────────────────────────────────────────────────────────────────
// Den eingebauten Leuchtenkatalog in die Geraetebibliothek stellen.
// Lauf: `DEVICE_LIBRARY_KEY=dlk_… npm run library:publish`
//        (optional `DEVICE_LIBRARY_URL`, Vorgabe https://devices.zumpelars.de)
//
// WARUM ES DAS GIBT (2026-09-27). Eigentuemer-Vorgabe: alle Daten aus allen
// Planern stehen auch auf devices.zumpelars.de. Der Katalog in
// `src/core/fixtureLibrary.ts` ist der groesste Teil davon und gehoert
// keinem Nutzerkonto — er geht mit einem API-Schluessel hoch (Admin, nur
// lesen + upload, sofort freigegeben), aus `library-publish.yml` bei jedem
// Push auf main, der den Katalog aendert.
//
// Hochgeladen wird NUR, was einen Datenblatt-Link traegt: ohne Beleg lehnt
// die Bibliothek ab, und ein erfundener Link waere schlimmer als keiner. Die
// Profile ohne Link werden aufgelistet — das ist die Arbeitsliste.
//
// Ohne Schluessel: nur die Liste, Ende mit Erfolg. Mit Schluessel: Ende mit
// Fehler, sobald ein Profil `blocked` oder `error` zurueckbekommt.
// Der Schluessel wird nie ausgegeben.
// ───────────────────────────────────────────────────────────────────────────
import { fixtureLibrary } from '../src/core/fixtureLibrary.ts';
import { fixtureToUploadItem } from '../src/core/deviceLibrary.ts';
import { validateFixtureProfile } from '../src/core/fixtureProfile.ts';
import { DEFAULT_DEVICE_LIBRARY_URL, LibraryError, upload } from '../src/core/deviceLibraryClient.ts';

const key = process.env.DEVICE_LIBRARY_KEY?.trim() ?? '';
const server = (process.env.DEVICE_LIBRARY_URL?.trim() || DEFAULT_DEVICE_LIBRARY_URL).replace(/\/+$/, '');

const ungueltig = fixtureLibrary.filter((f) => !validateFixtureProfile(f).ok);
if (ungueltig.length) {
  console.error(`FEHLER: ${ungueltig.length} Katalog-Eintraege bestehen die Profilpruefung nicht: ${ungueltig.map((f) => f.id).join(', ')}`);
  process.exit(1);
}

const items = fixtureLibrary.map(fixtureToUploadItem).filter((i) => i !== null);
const ohneLink = fixtureLibrary.filter((f) => !fixtureToUploadItem(f));

console.log(`Katalog: ${fixtureLibrary.length} Profile, ${items.length} mit Datenblatt-Link, ${ohneLink.length} ohne.`);
if (ohneLink.length) {
  console.log('\nOhne Datenblatt-Link (werden nicht hochgeladen — `datasheetUrl` im Katalog nachtragen):');
  for (const f of ohneLink) console.log(`  - ${f.id}  (${f.manufacturer} ${f.name})`);
}

if (!key) {
  console.log('\nDEVICE_LIBRARY_KEY ist nicht gesetzt — nichts hochgeladen. Einen Schluessel legt ein Admin unter Konto → Sicherheit an.');
  process.exit(0);
}
if (!key.startsWith('dlk_')) {
  console.error('FEHLER: DEVICE_LIBRARY_KEY ist kein API-Schluessel der Bibliothek (erwartet dlk_…).');
  process.exit(1);
}
if (items.length === 0) {
  console.log('\nNichts hochzuladen.');
  process.exit(0);
}

try {
  const results = await upload(server, key, 'light', items);
  const zaehl = new Map<string, number>();
  for (const r of results) zaehl.set(r.state, (zaehl.get(r.state) ?? 0) + 1);
  console.log(`\n${server}: ${[...zaehl].map(([s, n]) => `${n} ${s}`).join(', ')}`);
  const schlecht = results.filter((r) => r.state === 'blocked' || r.state === 'error');
  for (const r of schlecht) console.error(`  ${r.state}: ${r.localId}${r.error ? ` (${r.error})` : ''}${r.findings ? ` ${JSON.stringify(r.findings)}` : ''}`);
  if (results.length !== items.length) {
    console.error(`FEHLER: ${items.length} gesendet, ${results.length} Ergebnisse.`);
    process.exit(1);
  }
  process.exit(schlecht.length ? 1 : 0);
} catch (e) {
  console.error(`FEHLER beim Hochladen: ${e instanceof LibraryError ? `${e.code} (HTTP ${e.status})` : String(e)}`);
  process.exit(1);
}
