// ───────────────────────────────────────────────────────────────────────────
// Arbeits-Notizen aus der Technischen Probe (Bedarf 71, P2).
//
//   > Entering notes on the console during a live rehearsal is 'cumbersome',
//   > so a separate desktop app exists purely to write notes into an Eos show
//   > file over OSC, with right-click-editable quick-note buttons and keyboard
//   > shortcuts. An open request asks for the opposite — store notes locally
//   > rather than in the show file.
//
// Belege: douglasfinlay/cue-note (README), Issues #11 und #7 (2023-2024). Der
// Bedarf nennt den Weg selbst: „A work-notes / focus-notes list attached to
// fixtures and positions, offline, owned by the user's own project file,
// syncable later — not written into somebody else's show file."
//
// ─── WAS ES SCHON GAB, UND WAS FEHLTE ──────────────────────────────────────
//
// Die LEUCHTEN-Haelfte war gebaut: `PlacedFixture.focusNote` plus `focused`,
// die Fokus-Liste im Ablauf-Dialog und die Marker im Plan. Was fehlte:
//
//   - MEHRERE Notizen je Leuchte. `focusNote` ist ein Feld; der zweite Zuruf
//     ueberschreibt den ersten.
//   - Notizen an der POSITION (Traverse). Der Bedarf sagt „fixtures AND
//     positions", und eine Anmerkung wie „Traverse 2 haengt 20 cm zu tief"
//     hat keine Leuchte.
//   - Ein AUTOR und ein ZEITPUNKT. Genau daran haengt der Beleg: cue-note
//     schreibt in die Show-Datei des Pults, und dort gehoert die Notiz
//     niemandem.
//
// `focusNote` bleibt deshalb, wo es ist. Es ist die Beschreibung des Fokus und
// gehoert zur Leuchte wie ihr Aim; eine Arbeits-Notiz ist ein Vorgang. Die
// eine in die andere zu pressen waere kein Aufraeumen, sondern Datenverlust
// beim zweiten Zuruf.
//
// ─── EINE NOTIZ WIRD NIE STILL WEGGEWORFEN ─────────────────────────────────
//
// Wer eine Leuchte aus dem Plan nimmt, nimmt ihr die Notiz nicht die
// Beobachtung. `staleNotes` sammelt die verwaisten und BENENNT sie; sie
// verschwinden erst, wenn ein Mensch sie wegraeumt. Eine Notiz, die mit ihrem
// Ziel verschwindet, ist genau der Verlust, gegen den der Bedarf geschrieben
// ist.
//
// REIN: keine Uhr, kein Store, kein IO. Der Zeitpunkt kommt vom Aufrufer.
// ───────────────────────────────────────────────────────────────────────────
import type { PlacedFixture, Truss, WorkNote, WorkNoteTarget } from '../types.ts';

/** Gleiches Ziel? Verglichen wird die Art PLUS die Id, nie die Id allein. */
export const sameTarget = (a: WorkNoteTarget, b: WorkNoteTarget): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'fixture' && b.kind === 'fixture') return a.fixtureId === b.fixtureId;
  if (a.kind === 'truss' && b.kind === 'truss') return a.trussId === b.trussId;
  return true;
};

/**
 * Haengt eine Notiz an. Gibt eine NEUE Liste zurueck — der Aufrufer haelt
 * weiter seine.
 *
 * Ein leerer Text wird nicht angelegt: eine Notiz ohne Inhalt steht in der
 * Liste und sagt nichts, und beim Durcharbeiten kostet sie einen Blick.
 */
export function addNote(
  notes: readonly WorkNote[],
  note: Omit<WorkNote, 'id'> & { id: string },
): WorkNote[] {
  const text = note.text.trim();
  if (!text) return [...notes];
  return [...notes, { ...note, text }];
}

/** Kippt den Erledigt-Haken. Der TEXT bleibt — er ist der Beleg. */
export const toggleNote = (notes: readonly WorkNote[], id: string): WorkNote[] =>
  notes.map((n) => (n.id === id ? { ...n, done: !n.done } : n));

/** Entfernt eine Notiz. Ausdrueckliche Handlung, nie Nebenwirkung. */
export const removeNote = (notes: readonly WorkNote[], id: string): WorkNote[] =>
  notes.filter((n) => n.id !== id);

/** Die Notizen zu einem Ziel, aelteste zuerst. */
export const notesFor = (notes: readonly WorkNote[], target: WorkNoteTarget): WorkNote[] =>
  notes.filter((n) => sameTarget(n.target, target)).sort((a, b) => a.at.localeCompare(b.at));

/** Was noch offen ist. */
export const openNotes = (notes: readonly WorkNote[]): WorkNote[] => notes.filter((n) => !n.done);

/**
 * Notizen, deren Ziel es nicht mehr gibt.
 *
 * KEIN Fehler und kein Grund zum Loeschen: die Beobachtung bleibt wahr, auch
 * wenn die Leuchte weg ist. Die Liste ist da, damit jemand sie durchgeht.
 */
export function staleNotes(
  notes: readonly WorkNote[],
  fixtures: readonly PlacedFixture[],
  trusses: readonly Truss[],
): WorkNote[] {
  const fids = new Set(fixtures.map((f) => f.id));
  const tids = new Set(trusses.map((t) => t.id));
  return notes.filter((n) =>
    n.target.kind === 'fixture'
      ? !fids.has(n.target.fixtureId)
      : n.target.kind === 'truss'
        ? !tids.has(n.target.trussId)
        : false,
  );
}

export interface NoteGroup {
  /** Menschenlesbarer Kopf: „Traverse 2", „Kanal 12 · ARRI S60", „Ganzer Plan". */
  label: string;
  target: WorkNoteTarget;
  notes: WorkNote[];
  open: number;
}

/** Beschriftung einer Leuchte, so wie sie in der Liste steht. */
export const fixtureLabel = (f: PlacedFixture): string =>
  [f.channel != null ? `Kanal ${f.channel}` : f.unitNumber, f.fixture?.name]
    .filter(Boolean)
    .join(' · ') || f.id;

/**
 * Die Notizen in der Reihenfolge, in der eine Probe sie abarbeitet: erst der
 * ganze Plan, dann die Positionen, dann die Leuchten.
 *
 * Verwaiste Ziele stehen NICHT hier drin — sie haben keine Beschriftung mehr
 * und kaemen als „undefined" ins Blatt. `staleNotes` fuehrt sie getrennt.
 */
export function groupNotes(
  notes: readonly WorkNote[],
  fixtures: readonly PlacedFixture[],
  trusses: readonly Truss[],
  labels: { plan: string; truss: string } = { plan: 'Ganzer Plan', truss: 'Traverse' },
): NoteGroup[] {
  const fById = new Map(fixtures.map((f) => [f.id, f]));
  const tById = new Map(trusses.map((t) => [t.id, t]));
  const groups: NoteGroup[] = [];

  const push = (label: string, target: WorkNoteTarget, list: WorkNote[]) => {
    if (list.length === 0) return;
    groups.push({
      label,
      target,
      notes: [...list].sort((a, b) => a.at.localeCompare(b.at)),
      open: list.filter((n) => !n.done).length,
    });
  };

  push(labels.plan, { kind: 'plan' }, notes.filter((n) => n.target.kind === 'plan'));

  for (const t of trusses) {
    push(
      t.label || labels.truss,
      { kind: 'truss', trussId: t.id },
      notes.filter((n) => n.target.kind === 'truss' && n.target.trussId === t.id),
    );
  }

  for (const f of fixtures) {
    push(
      fixtureLabel(f),
      { kind: 'fixture', fixtureId: f.id },
      notes.filter((n) => n.target.kind === 'fixture' && n.target.fixtureId === f.id),
    );
  }

  // Nur die Fund-Reihenfolge oben ist die Ordnung; innerhalb bleibt der Plan
  // sortiert wie der Nutzer ihn gebaut hat. Die verwaisten fehlen bewusst.
  void fById;
  void tById;
  return groups;
}

export interface WorkNotesTable {
  header: string[];
  rows: string[][];
}

/**
 * Das Blatt fuer die Probe. Der Zeitpunkt steht drauf, weil „was war zuerst"
 * genau die Frage ist, die eine Woche spaeter gestellt wird.
 */
export function workNotesTable(
  notes: readonly WorkNote[],
  fixtures: readonly PlacedFixture[],
  trusses: readonly Truss[],
): WorkNotesTable {
  const groups = groupNotes(notes, fixtures, trusses);
  const rows: string[][] = [];
  for (const g of groups) {
    for (const n of g.notes) {
      rows.push([g.label, n.done ? 'erledigt' : 'offen', n.text, n.by ?? '', n.at]);
    }
  }
  for (const n of staleNotes(notes, fixtures, trusses)) {
    rows.push(['Ziel entfernt', n.done ? 'erledigt' : 'offen', n.text, n.by ?? '', n.at]);
  }
  return { header: ['Ziel', 'Stand', 'Notiz', 'Von', 'Wann'], rows };
}

/**
 * Normalisiert die Notizen beim Laden.
 *
 * Verworfen wird nur, was unlesbar ist — ohne Text oder ohne Ziel gibt es
 * nichts zu lesen. Eine Notiz auf ein Ziel, das es nicht mehr gibt, BLEIBT:
 * dafuer ist `staleNotes` da, und sie hier wegzuwerfen waere genau der stille
 * Verlust, gegen den der Bedarf geschrieben ist.
 */
export function normalizeWorkNotes(raw: unknown): WorkNote[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkNote[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const n = item as Partial<WorkNote>;
    const id = typeof n.id === 'string' ? n.id.trim() : '';
    const text = typeof n.text === 'string' ? n.text.trim() : '';
    const at = typeof n.at === 'string' ? n.at.trim() : '';
    const t = n.target as WorkNoteTarget | undefined;
    const targetOk =
      !!t &&
      ((t.kind === 'fixture' && typeof t.fixtureId === 'string' && !!t.fixtureId) ||
        (t.kind === 'truss' && typeof t.trussId === 'string' && !!t.trussId) ||
        t.kind === 'plan');
    if (!id || !text || !at || !targetOk || seen.has(id)) continue;
    seen.add(id);
    const note: WorkNote = { id, text, at, target: t };
    if (typeof n.by === 'string' && n.by.trim()) note.by = n.by.trim();
    if (n.done === true) note.done = true;
    out.push(note);
  }
  return out;
}
