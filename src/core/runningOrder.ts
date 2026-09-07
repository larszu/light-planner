// ───────────────────────────────────────────────────────────────────────────
// Der Ablauf ist ein Baum, keine Liste (Bedarf 132, P4).
//
//   > Each song or segment carries ITS OWN SUB-CUES (intro, verse, chorus).
//   > Changing the setlist means MANUALLY REORDERING EVERY COMPONENT, not just
//   > the parents.
//
// Beleg: `cpvalente/ontime#204` (2022-09-15) — „When we change the setlist, i
// have to reorder all events by hand… It would make life much easier if i
// could place these in song events under the main song, so i just need to
// reorder the songs and not all of its components." Vier Jahre alt und offen;
// die Sammel-Bearbeitung daneben scheitert an der Laufzeit.
//
// Die Empfehlung der Bedarfs-Datenbank ist ausdrücklich eine über den
// ZEITPUNKT: „A schedule data model should be a tree, not a list, FROM DAY
// ONE. Cheap if designed in, expensive to retrofit."
//
// ─── WAS DAS HIER LÖST ──────────────────────────────────────────────────────
//
// Die Szenen dieses Planers waren eine flache Liste. Wer den dritten Song nach
// vorn zieht, muss seine Teil-Stimmungen einzeln hinterherziehen — und
// vergisst eine. Dann steht im Ablauf ein Chorus vor seinem Intro, und beim
// Durchgang merkt es niemand, weil beide plausibel heißen.
//
// Eine Szene trägt jetzt `parentId`. Wer den Song verschiebt, verschiebt ihn
// MIT ALLEM, was unter ihm hängt — das ist die ganze Sache.
//
// ─── DREI ENTSCHEIDUNGEN, JEDE MIT GRUND ────────────────────────────────────
//
//  * DIE NUMMER WIRD GERECHNET, NICHT GESPEICHERT („2", „2.1", „2.2"). Eine
//    gespeicherte Nummer ist ab der ersten Verschiebung falsch, und zwar
//    still: sie sieht weiter aus wie eine Nummer.
//
//  * EIN VERWAISTES KIND WIRD GENANNT, NICHT ENTSORGT. Wird ein Song
//    gelöscht, hängen seine Teil-Stimmungen an einer Kennung, die es nicht
//    mehr gibt. Sie verschwinden zu lassen, wäre Datenverlust ohne Meldung;
//    sie wortlos nach oben zu ziehen, wäre eine Behauptung über den Ablauf,
//    die niemand aufgestellt hat. Sie stehen am Ende, und die Lücke wird
//    gemeldet.
//
//  * EIN KREIS IST UNMÖGLICH — nicht „unwahrscheinlich". `canParent` weist
//    ab, wer sich selbst oder einen eigenen Nachfahren zum Elter machen
//    will; die Antwort trägt den Grund.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

/** Was der Ablauf von einem Eintrag wissen muss. Mehr braucht er nicht. */
export interface OrderItem {
  id: string;
  name: string;
  /** Der Eintrag, unter dem dieser hängt. Fehlt er, steht der Eintrag oben. */
  parentId?: string;
}

export type OrderProblem = 'orphan' | 'cycle';

export interface OrderGap {
  kind: OrderProblem;
  ids: string[];
  message: string;
}

export interface OrderRow<T extends OrderItem> {
  item: T;
  /** 0 = oberste Ebene. */
  depth: number;
  /** Die gerechnete Nummer: „2", „2.1". */
  number: string;
  /** Warum dieser Eintrag auffällt — sonst `null`. */
  problem: OrderProblem | null;
}

export interface RunningOrder<T extends OrderItem> {
  /** Die Spielreihenfolge, flach — Elter, dann seine Kinder. */
  rows: OrderRow<T>[];
  /** Was nicht stimmt, gerechnet und nicht aufgezählt. */
  gaps: OrderGap[];
}

/**
 * Haengt `id` (mittelbar) unter `maybeAncestor`?
 *
 * Laeuft die Elternkette hoch und bricht bei einer bereits gesehenen Kennung
 * ab: ein bestehender Kreis in den Daten darf diese Funktion nicht aufhaengen.
 * Sie ist genau die Stelle, die Kreise verhindert — sie darf nicht an einem
 * scheitern.
 */
function hasAncestor(items: readonly OrderItem[], id: string, maybeAncestor: string): boolean {
  const byId = new Map(items.map((i) => [i.id, i]));
  const gesehen = new Set<string>();
  let cur = byId.get(id)?.parentId;
  while (cur) {
    if (cur === maybeAncestor) return true;
    if (gesehen.has(cur)) return false;
    gesehen.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  return false;
}

export interface ParentCheck {
  ok: boolean
  /** Warum nicht — steht im Modul, damit die Oberflaeche ihn nicht zweitfasst. */
  reason: string | null
}

export const CYCLE_REASON =
  'Ein Eintrag kann nicht unter sich selbst hängen — weder unmittelbar noch über '
  + 'seine eigenen Teil-Einträge. Sonst hätte der Ablauf kein Ende und keine Spitze.';

export const MISSING_REASON = 'Diesen Eintrag gibt es nicht (mehr).';

/**
 * Was in der Nummern-Spalte steht, wenn der Eintrag keine Stelle im Ablauf hat.
 *
 * Ein Zeichen und keine leere Zelle: auf einem Blatt muss „hat keine Stelle"
 * von „hat noch niemand nachgesehen" unterscheidbar bleiben.
 */
export const NO_PLACE = '—';

/**
 * Darf `id` unter `parentId` haengen?
 *
 * DIE ENGSTELLE fuer jedes Umhaengen. Die Oberflaeche fragt hier und baut die
 * Pruefung nicht nach: eine zweite Fassung waere die, die den Kreis durchlaesst.
 */
export function canParent(
  items: readonly OrderItem[],
  id: string,
  parentId: string | null,
): ParentCheck {
  if (parentId === null) return { ok: true, reason: null };
  if (!items.some((i) => i.id === id) || !items.some((i) => i.id === parentId)) {
    return { ok: false, reason: MISSING_REASON };
  }
  if (id === parentId) return { ok: false, reason: CYCLE_REASON };
  if (hasAncestor(items, parentId, id)) return { ok: false, reason: CYCLE_REASON };
  return { ok: true, reason: null };
}

/**
 * Der Ablauf, wie er gespielt wird.
 *
 * DIE ENGSTELLE. Panel, Blatt und Ausgabe lesen DIESE Reihenfolge; wer sie
 * zweimal rechnet, zeigt am Pult eine andere als auf dem Papier.
 *
 * Die Reihenfolge innerhalb einer Ebene ist die der Eingabeliste. Sie ist
 * damit das, was der Nutzer sieht und mit den Pfeilen aendert — es gibt keine
 * verborgene zweite Ordnung, die man beim Verschieben mitpflegen muesste.
 */
export function runningOrder<T extends OrderItem>(items: readonly T[]): RunningOrder<T> {
  const ids = new Set(items.map((i) => i.id));
  const rows: OrderRow<T>[] = [];

  const kinder = (parent: string | null): T[] =>
    items.filter((i) => (i.parentId ?? null) === parent);

  const gehe = (parent: string | null, depth: number, prefix: string): void => {
    kinder(parent).forEach((item, idx) => {
      const number = prefix ? `${prefix}.${idx + 1}` : String(idx + 1);
      rows.push({ item, depth, number, problem: null });
      gehe(item.id, depth + 1, number);
    });
  };
  gehe(null, 0, '');

  // WAS DER GANG NICHT ERREICHT HAT — gerechnet, nicht aufgezaehlt.
  //
  // Der erste Entwurf zaehlte zwei Faelle auf: Waisen (Elter geloescht) und
  // Eintraege IM Kreis. Beides stimmte, und trotzdem verschwand ein dritter
  // Fall spurlos: ein Eintrag, der UNTER einem Kreis haengt, ist selbst weder
  // Waise noch Teil des Kreises — der Gang von oben erreicht ihn nie, und die
  // beiden Aufzaehlungen kannten ihn nicht. Er fiel aus der Liste, ohne dass
  // es jemand gemeldet haette.
  //
  // Deshalb wird jetzt gegen den GANG gerechnet: was nicht darin vorkommt,
  // taucht hinten auf und wird benannt. Ein vierter Fall, an den heute
  // niemand denkt, faellt damit von selbst auf.
  const erreicht = new Set(rows.map((r) => r.item.id));
  const uebrig = items.filter((i) => !erreicht.has(i.id));

  // Die Art sagt, WORAN es liegt: ein geloeschter Elter ist etwas anderes als
  // ein Kreis, und der Nutzer macht dagegen etwas anderes.
  const art = (i: T): OrderProblem =>
    i.parentId != null && !ids.has(i.parentId) ? 'orphan' : 'cycle';

  for (const item of uebrig) {
    rows.push({ item, depth: 0, number: NO_PLACE, problem: art(item) });
  }

  const gaps: OrderGap[] = [];
  const waisen = uebrig.filter((i) => art(i) === 'orphan');
  const imKreis = uebrig.filter((i) => art(i) === 'cycle');
  if (waisen.length > 0) {
    gaps.push({
      kind: 'orphan',
      ids: waisen.map((i) => i.id),
      message: `${waisen.length} Eintrag/Einträge hängen unter einem gelöschten Eintrag. Sie stehen am Ende — sortiere sie ein oder hänge sie um.`,
    });
  }
  if (imKreis.length > 0) {
    gaps.push({
      kind: 'cycle',
      ids: imKreis.map((i) => i.id),
      message: `${imKreis.length} Eintrag/Einträge hängen im Kreis oder unter einem und haben damit keine Stelle im Ablauf.`,
    });
  }
  return { rows, gaps };
}

export type MoveDirection = 'up' | 'down';

/**
 * Einen Eintrag verschieben — MIT ALLEM, was unter ihm haengt.
 *
 * Das ist der ganze Bedarf: „so i just need to reorder the songs and not all
 * of its components". Verschoben wird innerhalb der EIGENEN Ebene; ein
 * Teil-Eintrag wandert also unter seinem Song und nicht aus ihm heraus. Wer
 * ihn aus dem Song holen will, haengt ihn um — das ist eine andere Handlung
 * und soll auch wie eine aussehen.
 *
 * Gibt die Liste unveraendert zurueck, wenn nichts zu tun ist (erster Eintrag
 * nach oben). Keine Ausnahme, kein stiller Sprung ans andere Ende.
 */
export function moveItem<T extends OrderItem>(
  items: readonly T[],
  id: string,
  direction: MoveDirection,
): T[] {
  const self = items.find((i) => i.id === id);
  if (!self) return [...items];

  const ebene = items.filter((i) => (i.parentId ?? null) === (self.parentId ?? null));
  const pos = ebene.findIndex((i) => i.id === id);
  const zielPos = direction === 'up' ? pos - 1 : pos + 1;
  if (zielPos < 0 || zielPos >= ebene.length) return [...items];
  const nachbar = ebene[zielPos];

  // Getauscht werden GENAU DIE ZWEI Nachbarn — nicht ihre Nachkommen.
  //
  // Der erste Entwurf schob ganze Bloecke: Eintrag samt allem, was unter ihm
  // haengt. Das war Arbeit ohne Wirkung, und zwar beweisbar: die Reihenfolge
  // entsteht in `runningOrder` aus den `parentId`s, nicht aus den Plaetzen im
  // Datensatz. Ein Kind findet seinen Platz ueber seinen Elter, egal wo es in
  // der Liste steht — die Liste entscheidet nur die Reihenfolge UNTER
  // GESCHWISTERN, und die ruehrt ein Tausch zweier Geschwister nicht an.
  //
  // Die Zusicherung des Bedarfs — „reorder the songs and not all of its
  // components" — haelt also das Modell und nicht diese Funktion. Genau
  // deshalb steht sie hier als Satz: wer den Block wieder einbaut, baut ihn
  // fuer nichts, und wer die Ableitung auf Listenplaetze umstellt, hat sie
  // ohne es zu merken gebrochen. `running-order-check.ts` prueft die
  // Wirkung, nicht die Bauform.
  const a = items.indexOf(self);
  const b = items.indexOf(nachbar);
  const out = [...items];
  out[a] = nachbar;
  out[b] = self;
  return out;
}
