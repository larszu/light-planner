// ───────────────────────────────────────────────────────────────────────────
// EINE ABLAUFLISTE, ROLLENWEISE SPALTEN (Bedarf 54, P2).
//
// Die Bedarfsdatenbank nennt diese Zeile „the most precisely user-specified
// request in the whole evidence base - built to spec rather than inferred".
// Sie ist deshalb nach der Vorlage gebaut und nicht nach Gutdünken:
//
//   > One shared running order with per-role column visibility and edit rights
//   > scoped to your own column, read-only for observers, lockable once the
//   > show is live
//
// DER ZUSTAND HEUTE, den sie beschreibt: „The document everyone must read is
// the document everyone can change" — also mailt die Regie PDFs oder nimmt
// versehentliche Änderungen in Kauf, und jede Abteilung führt ihre eigene
// Kopie, die auseinanderläuft.
//
// ═══════════════════════════════════════════════════════════════════════════
// SEHEN UND ÄNDERN SIND ZWEI FRAGEN
// ═══════════════════════════════════════════════════════════════════════════
//
// Der Beleg (`cpvalente/ontime#90`) sagt das Sehen als WUNSCH: „if I am audio,
// i would hide the video, lighting". Das Ändern sagt der Bedarf als REGEL:
// „edit rights scoped to your own column".
//
// Sie zusammenzulegen wäre der bequeme Fehler: dann schützte das Ausblenden,
// und eine eingeblendete Spalte wäre eine freigegebene. Wer als Ton die
// Licht-Spalte einblendet, um mitzulesen, dürfte sie damit ändern — und genau
// das ist der Zustand, aus dem der Bedarf herausführen soll.
//
// ═══════════════════════════════════════════════════════════════════════════
// EIN RECHT WIRD ERKLÄRT, NIE ABGELEITET (ADR-002)
// ═══════════════════════════════════════════════════════════════════════════
//
// Eine Spalte ohne erklärten Eigentümer gehört NIEMANDEM — und das heisst
// „niemand ändert sie", nicht „jeder darf". Die Vorgabe muss die vorsichtige
// sein: eine Spalte, die versehentlich ohne Eigentümer angelegt wurde, ist
// sonst ab dem ersten Tag für alle offen, und es fällt niemandem auf.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Der Zustand der Show.
 *
 * `live` ist der Riegel aus dem Bedarf („lockable once the show is live"). Er
 * steht ÜBER der Rolle: auch die Regie ändert dann nichts mehr. Sonst wäre
 * „gesperrt" ein Ratschlag und keine Sperre — und der eine Griff, gegen den
 * die Sperre gebaut ist, ist der der Person mit den meisten Rechten.
 */
export type ShowState = 'planning' | 'live';

/** Wer schaut. `null` = Zuschauer ohne Rolle. */
export type RoleId = string | null;

export interface ColumnDef {
  id: string;
  label: string;
  /**
   * Die Rolle, der diese Spalte gehört. Fehlt sie, gehört die Spalte
   * niemandem — und niemand ändert sie (siehe Kopf).
   */
  ownerRole?: string;
}

export interface AccessCheck {
  ok: boolean;
  reason: string | null;
}

export const OBSERVER_REASON =
  'Zuschauer lesen mit und ändern nichts. Wer eintragen soll, braucht eine Rolle.';

export const FOREIGN_COLUMN_REASON =
  'Diese Spalte gehört einer anderen Rolle. Mitlesen ja, ändern nein — sonst '
  + 'wäre die gemeinsame Liste wieder die, die jeder überschreibt.';

export const UNOWNED_REASON =
  'Für diese Spalte ist keine Rolle erklärt. Ohne erklärten Eigentümer ändert '
  + 'sie niemand — eine Spalte, die versehentlich ohne Eigentümer entstand, '
  + 'wäre sonst für alle offen.';

export const LIVE_REASON =
  'Die Show läuft. Ab hier wird nichts mehr geändert — auch nicht von der '
  + 'Regie. Eine Sperre, die für den Wichtigsten nicht gilt, ist keine.';

export const UNKNOWN_COLUMN_REASON = 'Diese Spalte gibt es nicht (mehr).';

/**
 * Darf `role` die Spalte `columnId` ändern?
 *
 * DIE ENGSTELLE für jede Eingabe. Die Oberfläche fragt hier und baut die
 * Prüfung nicht nach — eine zweite Fassung wäre die, die den fremden Eintrag
 * durchlässt. Dieselbe Rolle wie `canParent` beim Umhängen.
 *
 * Die Reihenfolge der Prüfungen ist Absicht: der Riegel zuerst. Er gilt für
 * alle, und ihn nach der Rollenprüfung zu stellen hiesse, dass die Antwort
 * für die eigene Spalte während der Show von der Rolle abhinge.
 */
export function canEditColumn(
  columns: readonly ColumnDef[],
  role: RoleId,
  columnId: string,
  show: ShowState,
): AccessCheck {
  if (show === 'live') return { ok: false, reason: LIVE_REASON };
  const col = columns.find((c) => c.id === columnId);
  if (!col) return { ok: false, reason: UNKNOWN_COLUMN_REASON };
  if (role === null) return { ok: false, reason: OBSERVER_REASON };
  if (col.ownerRole === undefined) return { ok: false, reason: UNOWNED_REASON };
  if (col.ownerRole !== role) return { ok: false, reason: FOREIGN_COLUMN_REASON };
  return { ok: true, reason: null };
}

/**
 * Welche Spalten sieht diese Rolle?
 *
 * SICHTBARKEIT IST EINE ANSICHTSSACHE und keine Berechtigung: `hidden` ist,
 * was die Person selbst weggeklickt hat. Wer nichts weggeklickt hat, sieht
 * alles — die gemeinsame Liste ist gemeinsam, und ein Ton-Mensch, der die
 * Licht-Spalte mitlesen will, darf das.
 *
 * Was er dort NICHT darf, sagt `canEditColumn` — und die beiden Antworten
 * dürfen nie aus derselben Angabe kommen.
 */
export function visibleColumns(
  columns: readonly ColumnDef[],
  hidden: readonly string[],
): ColumnDef[] {
  const weg = new Set(hidden);
  return columns.filter((c) => !weg.has(c.id));
}

/**
 * Die Spalten, die diese Rolle ändern DARF — für die Oberfläche, damit sie
 * nicht je Zelle fragen muss.
 *
 * Gerechnet aus `canEditColumn` und nicht danebengeschrieben: zwei Fassungen
 * derselben Regel liefen auseinander, und die zweite wäre die, die eine
 * fremde Spalte offen lässt.
 */
export function editableColumns(
  columns: readonly ColumnDef[],
  role: RoleId,
  show: ShowState,
): ColumnDef[] {
  return columns.filter((c) => canEditColumn(columns, role, c.id, show).ok);
}
