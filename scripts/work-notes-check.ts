// ───────────────────────────────────────────────────────────────────────────
// Arbeits-Notizen aus der Technischen Probe (Bedarf 71, P2).
// Lauf: `npm run notes:check`
//
//   > Entering notes on the console during a live rehearsal is 'cumbersome',
//   > so a separate desktop app exists purely to write notes into an Eos show
//   > file over OSC […]. An open request asks for the opposite — store notes
//   > locally rather than in the show file.
//
// Belege: douglasfinlay/cue-note (README), Issues #11 und #7 (2023-2024).
//
// WAS HIER GEPRUEFT WIRD, und warum jede Zeile davon noetig ist:
//
//  1. Mehrere Notizen je Ziel. `focusNote` ist EIN Feld; der zweite Zuruf
//     ueberschreibt den ersten. Genau das ist der Grund, warum es diese Liste
//     ueberhaupt gibt — ein Test, der nur eine Notiz anlegt, pruefte den alten
//     Zustand.
//
//  2. Notizen an der POSITION. Der Bedarf sagt „fixtures AND positions", und
//     „Traverse 2 haengt 20 cm zu tief" hat keine Leuchte.
//
//  3. Eine Notiz verschwindet NIE still. Wer eine Leuchte loescht, loescht
//     die Beobachtung nicht. `staleNotes` benennt die verwaisten; das Blatt
//     fuehrt sie unter „Ziel entfernt" statt sie fallenzulassen.
//
//  4. DIE NOTIZ BLEIBT IM EIGENEN PROJEKT. Das ist der Kern des Belegs:
//     cue-note schreibt in die Show-Datei des Pults, und dort gehoert die
//     Notiz niemandem. Geprueft wird das am ERGEBNIS zweier Fremdformat-
//     Exporte (MVR, Venue-Austausch) — nicht daran, dass heute niemand die
//     Notizen weiterreicht, sondern daran, dass die Bytes sie nicht tragen.
//
//  5. Die Wege sind verdrahtet. Punkte 1-4 koennen alle stimmen und trotzdem
//     nie etwas zu pruefen bekommen — die Form, die in diesen Repos mehrfach
//     gefunden wurde: gebaut, begruendet, unerreichbar.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addNote,
  fixtureLabel,
  groupNotes,
  normalizeWorkNotes,
  notesFor,
  openNotes,
  removeNote,
  sameTarget,
  staleNotes,
  toggleNote,
  workNotesTable,
} from '../src/core/workNotes.ts';
import { buildMvr } from '../src/core/mvrExport.ts';
import { toVenueExchange } from '../src/core/venueExchange.ts';
import type { PlacedFixture, Truss, WorkNote } from '../src/types.ts';

const lampe = (id: string, channel?: number): PlacedFixture =>
  ({
    id,
    fixture: { id: 'f', name: 'ARRI S60', manufacturer: 'ARRI', wattage: 450, weight: 12 },
    x: 1, y: 2, mountingHeight: 5, aimX: 1, aimY: 0, bodyRotation: 0, dimming: 100,
    ...(channel != null ? { channel } : {}),
  }) as unknown as PlacedFixture;

const truss = (id: string, label: string): Truss =>
  ({ id, x1: 0, y1: 0, x2: 10, y2: 0, height: 6, label });

const note = (id: string, text: string, target: WorkNote['target'], at: string, over: Partial<WorkNote> = {}): WorkNote =>
  ({ id, text, at, target, ...over });

// ── 1. Mehrere Notizen je Ziel ─────────────────────────────────────────────
{
  const ziel = { kind: 'fixture', fixtureId: 'l1' } as const;
  let notes: WorkNote[] = [];
  notes = addNote(notes, note('n1', 'zu heiss auf der SL-Wand', ziel, '2026-09-06T18:00:00.000Z'));
  notes = addNote(notes, note('n2', 'CTO rein', ziel, '2026-09-06T18:05:00.000Z'));
  assert.equal(notes.length, 2, 'Die zweite Notiz darf die erste nicht ersetzen');
  assert.deepEqual(
    notesFor(notes, ziel).map((n) => n.id),
    ['n1', 'n2'],
    'Notizen stehen in der Reihenfolge, in der sie gerufen wurden',
  );

  // Leerer Text wird nicht angelegt: er steht in der Liste und sagt nichts.
  assert.equal(addNote(notes, note('n3', '   ', ziel, '2026-09-06T18:06:00.000Z')).length, 2);

  // Der Haken kippt, der Text bleibt — er ist der Beleg.
  const gehakt = toggleNote(notes, 'n1');
  assert.equal(gehakt.find((n) => n.id === 'n1')?.done, true);
  assert.equal(gehakt.find((n) => n.id === 'n1')?.text, 'zu heiss auf der SL-Wand');
  assert.deepEqual(openNotes(gehakt).map((n) => n.id), ['n2']);

  assert.deepEqual(removeNote(notes, 'n1').map((n) => n.id), ['n2']);

  // Der Aufrufer haelt weiter SEINE Liste. Gegen eine EIGENE Referenz
  // geprueft, nicht gegen `notes` — das wird bei jedem Schritt neu zugewiesen,
  // und eine Zusicherung darauf ueberlebte ein `push` (Gegenprobe
  // `add-mutates` blieb gruen).
  const vorher: readonly WorkNote[] = [note('m1', 'unveraendert', ziel, '2026-09-06T18:00:00.000Z')];
  const kopie = JSON.stringify(vorher);
  addNote(vorher, note('m2', 'neu', ziel, '2026-09-06T18:01:00.000Z'));
  toggleNote(vorher, 'm1');
  removeNote(vorher, 'm1');
  assert.equal(vorher.length, 1, 'addNote haengt an die Eingabe an, statt eine neue Liste zu geben');
  assert.equal(JSON.stringify(vorher), kopie, 'Eine der Funktionen aendert die uebergebene Liste');
}

// ── 2. Notizen an der Position, und Ziele werden nicht verwechselt ─────────
{
  assert.equal(sameTarget({ kind: 'fixture', fixtureId: 'x' }, { kind: 'truss', trussId: 'x' }), false,
    'Gleiche Id, andere Art — das ist NICHT dasselbe Ziel');
  assert.equal(sameTarget({ kind: 'plan' }, { kind: 'plan' }), true);

  const fixtures = [lampe('l1', 12)];
  const trusses = [truss('t1', 'Traverse 2')];
  const notes = [
    note('a', 'haengt 20 cm zu tief', { kind: 'truss', trussId: 't1' }, '2026-09-06T18:00:00.000Z'),
    note('b', 'Blende pruefen', { kind: 'fixture', fixtureId: 'l1' }, '2026-09-06T18:01:00.000Z'),
    note('c', 'Saalpult zu hell', { kind: 'plan' }, '2026-09-06T17:00:00.000Z'),
  ];
  const groups = groupNotes(notes, fixtures, trusses);
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Ganzer Plan', 'Traverse 2', 'Kanal 12 · ARRI S60'],
    'Reihenfolge einer Probe: erst der ganze Plan, dann die Positionen, dann die Leuchten',
  );
  assert.equal(groups[0].open, 1);
  assert.equal(fixtureLabel(lampe('l9')), 'ARRI S60', 'Ohne Kanal traegt die Zeile wenigstens den Typ');
}

// ── 3. Eine Notiz verschwindet nie still ───────────────────────────────────
{
  const notes = [
    note('weg', 'war zu heiss', { kind: 'fixture', fixtureId: 'geloescht' }, '2026-09-06T18:00:00.000Z'),
    note('da', 'ok', { kind: 'fixture', fixtureId: 'l1' }, '2026-09-06T18:01:00.000Z'),
    note('plan', 'global', { kind: 'plan' }, '2026-09-06T18:02:00.000Z'),
  ];
  const verwaist = staleNotes(notes, [lampe('l1')], []);
  assert.deepEqual(verwaist.map((n) => n.id), ['weg'], 'Nur das verwaiste Ziel, nicht der ganze Plan');

  // Sie stehen NICHT in den Gruppen (dort fehlt die Beschriftung) ...
  const groups = groupNotes(notes, [lampe('l1')], []);
  assert.equal(groups.flatMap((g) => g.notes).some((n) => n.id === 'weg'), false);
  // ... aber sie stehen auf dem BLATT, unter einem eigenen Namen.
  const tabelle = workNotesTable(notes, [lampe('l1')], []);
  const zeile = tabelle.rows.find((r) => r[2] === 'war zu heiss');
  assert.ok(zeile, 'Die verwaiste Notiz fehlt auf dem Blatt');
  assert.equal(zeile[0], 'Ziel entfernt');
  assert.deepEqual(tabelle.header, ['Ziel', 'Stand', 'Notiz', 'Von', 'Wann']);

  // Der Lade-Pfad wirft nur weg, was unlesbar ist — nicht, was verwaist ist.
  const geladen = normalizeWorkNotes([
    { id: 'weg', text: 'war zu heiss', at: '2026-09-06T18:00:00.000Z', target: { kind: 'fixture', fixtureId: 'geloescht' } },
    { id: 'ohneText', text: '  ', at: '2026-09-06T18:00:00.000Z', target: { kind: 'plan' } },
    { id: 'ohneZiel', text: 'x', at: '2026-09-06T18:00:00.000Z' },
    { id: 'weg', text: 'doppelt', at: '2026-09-06T18:00:00.000Z', target: { kind: 'plan' } },
  ]);
  assert.deepEqual(geladen.map((n) => n.id), ['weg'], 'Verwaist bleibt, unlesbar und doppelt fliegen');
  assert.equal(geladen[0].target.kind, 'fixture');
}

// ── 4. Die Notiz bleibt im eigenen Projekt ─────────────────────────────────
//
// Am ERGEBNIS geprueft, nicht an der Absicht: die Bytes duerfen den Text nicht
// tragen.
{
  const GEHEIM = 'NOTIZ-DIE-NICHT-RAUSGEHEN-DARF';
  const fixtures = [lampe('l1', 12)];
  const trusses = [truss('t1', 'Traverse 2')];
  const notes = [note('n', GEHEIM, { kind: 'fixture', fixtureId: 'l1' }, '2026-09-06T18:00:00.000Z')];

  const mvr = buildMvr(fixtures, trusses, `Show ${GEHEIM.slice(0, 0)}`);
  const alsText = Buffer.from(mvr).toString('latin1');
  assert.equal(alsText.includes(GEHEIM), false, 'Der MVR-Export traegt eine Arbeits-Notiz');

  const austausch = JSON.stringify(
    toVenueExchange({
      appVersion: '0.0.0',
      exportedAt: '2026-09-06T18:00:00.000Z',
      venue: { name: 'Halle A' },
      persons: [],
      walls: [],
      stageElements: [],
      shapes: [],
      ceilings: [],
    } as never),
  );
  assert.equal(austausch.includes(GEHEIM), false, 'Der Venue-Austausch traegt eine Arbeits-Notiz');

  // Und die Gegenprobe zur Gegenprobe: der Text IST in der eigenen Liste.
  assert.equal(
    workNotesTable(notes, fixtures, trusses).rows.some((r) => r[2] === GEHEIM),
    true,
    'Wenn der Text nirgends steht, prueft der Vergleich oben nichts',
  );
}

// ── 5. Die Wege sind verdrahtet ────────────────────────────────────────────
{
  const lies = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

  const typen = lies('../src/types.ts');
  assert.match(typen, /workNotes\?: WorkNote\[\]/, 'ProjectData traegt die Notizen nicht');

  const dialog = lies('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /groupNotes\(/, 'Der Ablauf-Dialog zeigt die Notizen nicht');
  assert.match(dialog, /onAddNote\(/, 'Es gibt keinen Weg, eine Notiz anzulegen');
  assert.match(dialog, /onToggleNote\(/, 'Es gibt keinen Weg, eine Notiz abzuhaken');

  // `LightPlanner.tsx` ist nur die Huelle; der Zustand liegt in `App.tsx`.
  const app = lies('../src/App.tsx');
  assert.match(app, /const \[workNotes, setWorkNotes\]/, 'App haelt die Notizen nicht');
  assert.match(app, /setWorkNotes\(normalizeWorkNotes\(data\.workNotes\)\)/,
    'Der Lade-Pfad normalisiert die Notizen nicht');

  // ALLE Bauplaetze fuer ein ProjectData. Genau hier wurde in diesem Repo
  // schon einmal ein Feld vergessen (die Kommentare in App.tsx halten es
  // fest): drei Stellen bauen dasselbe Objekt, und die vierte, die jemand
  // anlegt, faellt hier auf. Gezaehlt, nicht aufgezaehlt -- eine Liste waere
  // der Kenntnisstand ihres Autors.
  const bauplaetze = (app.match(/satisfies ProjectData|const data: ProjectData = \{|\}, \[projectMeta, fixtures/g) ?? []).length;
  const mitNotizen = (app.match(/\.\.\.\(workNotes\.length > 0 \? \{ workNotes \} : \{\}\)/g) ?? []).length;
  assert.equal(mitNotizen, 4,
    `Nicht jeder ProjectData-Bauplatz traegt die Notizen (${mitNotizen} von 4 gefunden, ${bauplaetze} Kandidaten)`);

  // Der Pruef-Lauf steht in package.json — sonst faengt ihn `ci:complete` nie.
  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['notes:check'], 'notes:check fehlt in package.json');
}

console.log('OK work-notes-check: Notizen sind mehrfach, ortsgebunden, unverlierbar — und bleiben im eigenen Projekt.');
