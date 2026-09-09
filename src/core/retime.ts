import { runningOrder, type OrderItem, type OrderRow } from './runningOrder';

// ───────────────────────────────────────────────────────────────────────────
// DEN ABLAUF AUS DEM IST NEU TAKTEN (Bedarf 53, P2 — und Bedarf 56).
//
// Woertlich aus der Bedarfs-Datenbank, und sie sagt es so deutlich wie an
// keiner anderen Stelle:
//
//   > A schedule object that recalculates downstream times from actuals, with
//   > a preview of the resulting finish time, is THE SINGLE MOST-REQUESTED
//   > UNMET CAPABILITY FOUND. It is also why the running order lives in a
//   > spreadsheet: IT IS A CALCULATION, NOT A RECORD.
//
// `runningOrder.ts` hat den Baum (Bedarf 132) und keine einzige Zeit. Dieses
// Modul legt die Zeitachse darueber — und nur die.
//
// ═══════════════════════════════════════════════════════════════════════════
// PLAN UND IST SIND ZWEI TATSACHEN, NIE EINE
// ═══════════════════════════════════════════════════════════════════════════
//
// Der Plan wird vom Ist nicht ueberschrieben. Er ist der Vergleichsmassstab;
// ohne ihn gaebe es kein „wir sind zwoelf Minuten hinten", sondern nur ein
// neues Jetzt. Dieselbe Trennung wie „soll gegen ist" im Verkabelungsplan und
// wie Tastenlage gegen Gruppenzugehoerigkeit im Intercom-Slot.
//
// Und deshalb RECHNET dieses Modul und UEBERNIMMT nichts: der Bedarf verlangt
// „show the consequence BEFORE committing". Eine Funktion, die den Plan
// gleich mit umschreibt, hat die Vorschau abgeschafft.
//
// ═══════════════════════════════════════════════════════════════════════════
// UMBAUPAUSEN BLEIBEN STEHEN
// ═══════════════════════════════════════════════════════════════════════════
//
// „preserving changeover gaps" steht im Bedarf, und es ist der Unterschied
// zwischen einer brauchbaren und einer gefaehrlichen Neurechnung: wer die
// Restzeiten stumpf zusammenschiebt, plant einen Umbau in null Minuten und
// schickt die Crew in eine Show, die auf dem Papier aufgeht und im Saal nicht.
//
// ═══════════════════════════════════════════════════════════════════════════
// KEINE UHR, KEINE UHRZEIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Alles sind MINUTEN auf einer Achse, deren Nullpunkt der Aufrufer setzt. Das
// haelt das Modul rein (wie `runningOrder`, `rigMerge`, `powerDistribution`)
// und laesst Zeitzonen und Sommerzeit dort, wo sie hingehoeren: in die
// Anzeige. Ein `Date` hier drin hiesse, dass dieselbe Show je nach Rechner
// anders ausgeht.
// ───────────────────────────────────────────────────────────────────────────

/** Die geplanten Zeiten eines Eintrags, in Minuten. */
export interface OrderTiming {
  /**
   * Geplante Dauer. Bei einem Eintrag MIT Kindern wird sie nicht gelesen,
   * sondern aus den Kindern gerechnet — siehe `contradictions`.
   */
  plannedMinutes?: number;
  /** Umbaupause NACH diesem Eintrag. Fehlt sie, ist sie 0. */
  changeoverMinutes?: number;
}

/** Was tatsaechlich passiert ist (Bedarf 56: mit einem Griff erfasst). */
export interface OrderActual {
  /** Ist-Beginn. */
  startedAt?: number;
  /** Ist-Ende. Ohne Beginn bedeutungslos — siehe `contradictions`. */
  endedAt?: number;
}

/** Wo ein Eintrag steht, wenn `now` gilt. */
export type ItemState = 'done' | 'running' | 'upcoming';

export interface RetimedRow<T extends OrderItem> extends OrderRow<T> {
  state: ItemState;
  /** Wann der Eintrag nach PLAN laufen sollte. */
  plannedStart: number;
  plannedEnd: number;
  /** Wann er nach heutigem Stand laeuft. */
  projectedStart: number;
  projectedEnd: number;
  /**
   * Verschiebung gegenueber dem Plan, in Minuten. Positiv = spaeter.
   *
   * Das ist die Zahl, wegen der der Bedarf existiert: „zwoelf Minuten hinten"
   * ist die Auskunft, die heute in der Tabellenkalkulation von Hand entsteht.
   */
  deltaMinutes: number;
}

/** Ein Widerspruch in den Eingaben — gemeldet, nicht stillschweigend geheilt. */
export interface TimingContradiction {
  id: string;
  reason: 'parent-has-own-duration' | 'ended-without-start' | 'ended-before-start';
  message: string;
}

export interface Retimed<T extends OrderItem> {
  rows: RetimedRow<T>[];
  /**
   * Das voraussichtliche Ende der ganzen Show — die zweite Zahl, die der
   * Bedarf ausdruecklich verlangt („preview of the resulting finish time").
   * `null`, wenn es nichts zu takten gibt.
   */
  projectedFinish: number | null;
  plannedFinish: number | null;
  /** Verschiebung des Endes. Positiv = die Show wird laenger. */
  finishDeltaMinutes: number;
  contradictions: TimingContradiction[];
}

const WIDERSPRUCH: Record<TimingContradiction['reason'], string> = {
  'parent-has-own-duration':
    'Dieser Eintrag hat Kinder UND eine eigene Dauer. Gerechnet wird aus den Kindern; die eigene Angabe bleibt ungelesen stehen.',
  'ended-without-start':
    'Dieser Eintrag hat ein Ist-Ende ohne Ist-Beginn. Ein Ende allein sagt nicht, wie lange er lief.',
  'ended-before-start': 'Dieser Eintrag endet vor seinem Beginn.',
};

const min = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Den Ablauf neu takten.
 *
 * `now` ist die aktuelle Minute auf derselben Achse. Sie wird fuer genau eine
 * Sache gebraucht: ein Eintrag, der laeuft und seine geplante Dauer schon
 * ueberschritten hat, darf nicht in der Vergangenheit enden. Ein Ende, das
 * bereits vorbei ist, waere eine Vorhersage, die sich selbst widerlegt — und
 * der Rest der Show haenge daran.
 */
export function retime<T extends OrderItem>(
  items: readonly T[],
  timing: Readonly<Record<string, OrderTiming>>,
  actuals: Readonly<Record<string, OrderActual>>,
  now: number,
): Retimed<T> {
  const { rows } = runningOrder(items);
  const contradictions: TimingContradiction[] = [];

  const hatKinder = new Set(items.map((i) => i.parentId).filter((p): p is string => !!p));

  // ── Geplante Dauer je Eintrag: EINE Rechnung ──────────────────────────────
  //
  // Ein Blatt traegt seine eigene Dauer. Ein Eintrag MIT Kindern bekommt die
  // Summe seiner Kinder samt deren Umbaupausen — sonst gaebe es fuer denselben
  // Block zwei Antworten, und die zweite waere die, die stillschweigend
  // gewinnt. Wer trotzdem eine eigene Dauer eintraegt, bekommt es gesagt.
  const dauer = new Map<string, number>();
  const kinderVon = new Map<string, T[]>();
  for (const it of items) {
    if (!it.parentId) continue;
    const liste = kinderVon.get(it.parentId) ?? [];
    liste.push(it);
    kinderVon.set(it.parentId, liste);
  }
  // Tiefste zuerst: die Reihenfolge aus `runningOrder` ist Elter-vor-Kind,
  // also rueckwaerts durchlaufen.
  for (let i = rows.length - 1; i >= 0; i--) {
    const id = rows[i].item.id;
    const eigene = timing[id]?.plannedMinutes;
    if (!hatKinder.has(id)) {
      dauer.set(id, min(eigene));
      continue;
    }
    if (typeof eigene === 'number') {
      contradictions.push({ id, reason: 'parent-has-own-duration', message: WIDERSPRUCH['parent-has-own-duration'] });
    }
    const kinder = kinderVon.get(id) ?? [];
    let summe = 0;
    kinder.forEach((k, idx) => {
      summe += dauer.get(k.id) ?? 0;
      // Die Umbaupause NACH dem letzten Kind gehoert nicht mehr in den Block:
      // sie liegt zwischen dem Block und dem, was danach kommt.
      if (idx < kinder.length - 1) summe += min(timing[k.id]?.changeoverMinutes);
    });
    dauer.set(id, summe);
  }

  // ── Die Zeitachse ─────────────────────────────────────────────────────────
  //
  // Gerechnet wird ueber die OBERSTE Ebene; Kinder liegen innerhalb ihres
  // Elters. Sonst zaehlte jede Minute doppelt — einmal im Kind und einmal in
  // der Summe des Elters.
  const plannedStart = new Map<string, number>();
  const projectedStart = new Map<string, number>();
  const projectedEnde = new Map<string, number>();

  const legeAus = (liste: readonly T[], planCursor: number, projCursor: number): void => {
    let plan = planCursor;
    let proj = projCursor;
    liste.forEach((it) => {
      const id = it.id;
      const d = dauer.get(id) ?? 0;
      const ist = actuals[id] ?? {};
      const hatBeginn = typeof ist.startedAt === 'number';
      const hatEnde = typeof ist.endedAt === 'number';
      if (hatEnde && !hatBeginn) {
        contradictions.push({ id, reason: 'ended-without-start', message: WIDERSPRUCH['ended-without-start'] });
      }
      if (hatBeginn && hatEnde && (ist.endedAt as number) < (ist.startedAt as number)) {
        contradictions.push({ id, reason: 'ended-before-start', message: WIDERSPRUCH['ended-before-start'] });
      }

      plannedStart.set(id, plan);
      const pStart = hatBeginn ? (ist.startedAt as number) : proj;
      projectedStart.set(id, pStart);

      const kinder = kinderVon.get(id) ?? [];
      if (kinder.length > 0) {
        legeAus(kinder, plan, pStart);
      }

      // Ende: gemessen, wenn es gemessen wurde. Laeuft der Eintrag noch, ist
      // das fruehestmoegliche Ende `jetzt` — eine Vorhersage, die schon
      // vorbei ist, waere keine.
      let pEnde: number;
      if (hatEnde && hatBeginn && (ist.endedAt as number) >= (ist.startedAt as number)) pEnde = ist.endedAt as number;
      else if (hatBeginn) pEnde = Math.max(pStart + d, now);
      else pEnde = pStart + d;

      projectedEnde.set(id, pEnde);
      plan += d;
      proj = pEnde;
      // Die Umbaupause zaehlt fuer den NAECHSTEN Eintrag. Nach dem letzten
      // kommt keiner mehr — der Zeiger laeuft dann ins Leere, und niemand
      // liest ihn.
      //
      // HIER STAND EIN `if (idx < liste.length - 1)`. Es sah aus wie der
      // Schutz dagegen, dass eine Pause nach dem letzten Eintrag die Show
      // verlaengert — und es war wirkungslos: das Ende der Show wird aus
      // `projectedEnd` der letzten Zeile gelesen, nicht aus diesem Zeiger.
      // Eine Gegenprobe, die das `if` entfernte, blieb gruen. Ein Schutz, der
      // nichts schuetzt, ist schlimmer als keiner: der naechste Leser
      // verlaesst sich darauf.
      //
      // Wo dieselbe Regel WIRKT, steht sie oben: in der Summe eines Elters
      // wird die Pause nach dem letzten Kind nicht mitgezaehlt, und die
      // Gegenprobe dazu wird rot.
      const pause = min(timing[id]?.changeoverMinutes);
      plan += pause;
      proj += pause;
    });
  };

  const oberste = items.filter((i) => !i.parentId);
  legeAus(oberste, 0, 0);

  const zustand = (id: string): ItemState => {
    const ist = actuals[id] ?? {};
    if (typeof ist.endedAt === 'number' && typeof ist.startedAt === 'number') return 'done';
    if (typeof ist.startedAt === 'number') return 'running';
    return 'upcoming';
  };

  const out: RetimedRow<T>[] = rows.map((r) => {
    const id = r.item.id;
    const pS = plannedStart.get(id) ?? 0;
    const d = dauer.get(id) ?? 0;
    const projS = projectedStart.get(id) ?? 0;
    const projE = projectedEnde.get(id) ?? projS + d;
    return {
      ...r,
      state: zustand(id),
      plannedStart: pS,
      plannedEnd: pS + d,
      projectedStart: projS,
      projectedEnd: projE,
      deltaMinutes: projS - pS,
    };
  });

  const obersteRows = out.filter((r) => r.depth === 0);
  const letzte = obersteRows[obersteRows.length - 1];
  return {
    rows: out,
    projectedFinish: letzte ? letzte.projectedEnd : null,
    plannedFinish: letzte ? letzte.plannedEnd : null,
    finishDeltaMinutes: letzte ? letzte.projectedEnd - letzte.plannedEnd : 0,
    contradictions,
  };
}
