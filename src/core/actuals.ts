import type { OrderItem } from './runningOrder';
import type { OrderActual, OrderTiming } from './retime';

// ───────────────────────────────────────────────────────────────────────────
// DAS IST MIT EINEM GRIFF ERFASSEN (Bedarf 56, P2).
//
// Woertlich aus der Bedarfs-Datenbank:
//
//   > Capture actual start and end times with a ONE-TAP action, so the
//   > post-event report and next year's plan are built from the OUTCOME
//   > rather than from the plan.
//
// Und, im selben Eintrag, der Satz, an dem sich entscheidet, ob das etwas
// wird:
//
//   > It lives or dies on INTERACTION SPEED, not on the data model.
//
// Deshalb ist die Schreibseite dieses Moduls ein einziger Aufruf mit einem
// einzigen Argument (`griff`), und deshalb hat sie keine Rueckfrage, keine
// Pflichtfelder und keinen Dialog. Wer waehrend der Show erst ein Formular
// ausfuellen muss, fuellt es nicht aus — und dann gibt es das Ist nicht,
// und der Bedarf ist genau der, dass es das Ist nicht gibt.
//
// HERKUNFT DES BEDARFS, weil es beim Bauen einen Unterschied macht: er ist
// als INFERENCE eingestuft, aus dem Korpus abgeleitet und ohne
// Erstquelle. Die Bruchstelle („niemand wird fuer die Stunde bezahlt,
// nachdem der LKW weg ist") ist belegt, die Ein-Griff-Forderung ist die
// Schlussfolgerung der Auswertung. Was hier gebaut ist, steht also auf einer
// schwaecheren Grundlage als etwa Bedarf 132, und wer es spaeter umbaut,
// soll das wissen und nicht gegen eine Nutzerstimme zu argumentieren
// glauben, die es nicht gibt.
//
// ═══════════════════════════════════════════════════════════════════════════
// EIN IST-ZEITPUNKT IST EIN AUGENBLICK, KEINE MINUTE AUF EINER ACHSE
// ═══════════════════════════════════════════════════════════════════════════
//
// `retime.ts` rechnet in MINUTEN auf einer Achse, deren Nullpunkt der
// Aufrufer setzt — bewusst, damit dort keine Uhr steht. Gespeichert wird das
// Ist hier aber als ISO-Zeitpunkt, und das ist kein Widerspruch, sondern der
// Grund, warum es zwei Darstellungen gibt:
//
//   Der Plan ist relativ. „Der Song dauert zwoelf Minuten" gilt, egal wann
//   die Show beginnt; verschiebt jemand den Beginn, bleibt der Plan richtig.
//
//   Das Ist ist absolut. „Der Song begann um 20:14" ist eine Tatsache ueber
//   einen Abend. Speicherte man sie als Minute-nach-Beginn, haenge sie am
//   Anker — und wer den Anker spaeter korrigiert (die Show fing doch eine
//   Stunde spaeter an), verschoebe damit still jede erfasste Tatsache.
//   Der Plan wuerde das Ist umschreiben; genau die Richtung, die
//   `retime.ts` in seinem Kopf ausschliesst.
//
// `zeitachse()` rechnet vom einen ins andere, an genau einer Stelle.
//
// ═══════════════════════════════════════════════════════════════════════════
// DER GRIFF UEBERSCHREIBT NIE EINE TATSACHE
// ═══════════════════════════════════════════════════════════════════════════
//
// Ein zweiter Druck auf „Beginn" ist im Saal wahrscheinlicher als ein
// richtiger: der Daumen rutscht, das Geraet meldet nichts zurueck, man
// drueckt nochmal. Wuerde der zweite Druck den ersten ueberschreiben, waere
// der erfasste Beginn nicht der Beginn, sondern der Zeitpunkt des letzten
// Zweifels — und niemand merkte es je.
//
// Deshalb: `erfassen` schreibt einen belegten Zeitpunkt NICHT um. Es meldet
// zurueck, dass nichts passiert ist, und WARUM. Wer wirklich korrigieren
// will, nimmt `korrigieren` — einen anderen Aufruf, mit einem ausdruecklich
// genannten Zeitpunkt. Das ist die Trennung zwischen einem Griff und einer
// Entscheidung.
//
// ═══════════════════════════════════════════════════════════════════════════
// EIN ENDE OHNE BEGINN WIRD ERFASST, NICHT ABGEWIESEN
// ═══════════════════════════════════════════════════════════════════════════
//
// Der haeufigste Fehlerfall im Saal ist nicht der Doppeldruck, sondern der
// vergessene Beginn: es lief schon, keiner hat gedrueckt, und jetzt ist es
// vorbei. Wer das Ende dann abweist, weil der Beginn fehlt, wirft die
// einzige Tatsache weg, die noch zu haben ist.
//
// Also wird es geschrieben UND gemeldet (ADR-005, „verlustfrei oder laut").
// Der Widerspruch selbst hat schon einen Ort: `retime.ts` nennt ihn
// `ended-without-start`. Hier wird er nicht ein zweites Mal beurteilt —
// `erfassen` sagt nur, dass es so einer ist, damit die Oberflaeche sofort
// etwas anzeigen kann, ohne den ganzen Ablauf neu zu takten.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Was tatsaechlich passiert ist — als Augenblick, nicht als Minute.
 *
 * ISO-8601-Zeitpunkt (`new Date().toISOString()`). Fehlt ein Feld, ist es
 * nicht erfasst; das ist etwas anderes als „null Minuten".
 */
export interface SceneActual {
  startedAt?: string;
  endedAt?: string;
}

/** Der eine Griff. Mehr Auswahl hat der Nutzer waehrend der Show nicht. */
export type Griff = 'start' | 'ende';

/** Warum ein Griff etwas — oder nichts — bewirkt hat. */
export type ErfassungsGrund =
  | 'erfasst'
  | 'schon-gestartet'
  | 'schon-beendet'
  | 'ende-ohne-start';

export interface Erfassung {
  /** Der Stand NACH dem Griff. Bei `geaendert: false` der unveraenderte. */
  actual: SceneActual;
  geaendert: boolean;
  grund: ErfassungsGrund;
}

const istZeitpunkt = (wert: string | undefined): wert is string =>
  typeof wert === 'string' && Number.isFinite(Date.parse(wert));

/**
 * Der Ein-Griff-Aufruf: ein Zeitpunkt, ein Feld, kein Formular.
 *
 * `jetzt` wird HEREINGEGEBEN und nicht hier gelesen — dieselbe Regel wie in
 * `retime.ts`. Ein `new Date()` an dieser Stelle machte das Modul
 * unpruefbar und die Erfassung vom Rechner abhaengig, auf dem sie lief.
 */
export function erfassen(
  vorher: SceneActual | undefined,
  griff: Griff,
  jetzt: string,
): Erfassung {
  const stand: SceneActual = { ...(vorher ?? {}) };

  if (griff === 'start') {
    // Nicht ueberschreiben: siehe Kopf. Der zweite Druck ist der wahrscheinliche.
    if (istZeitpunkt(stand.startedAt)) {
      return { actual: stand, geaendert: false, grund: 'schon-gestartet' };
    }
    return { actual: { ...stand, startedAt: jetzt }, geaendert: true, grund: 'erfasst' };
  }

  if (istZeitpunkt(stand.endedAt)) {
    return { actual: stand, geaendert: false, grund: 'schon-beendet' };
  }
  const neu: SceneActual = { ...stand, endedAt: jetzt };
  // Geschrieben UND gemeldet. Beurteilt wird der Widerspruch in `retime.ts`.
  const grund: ErfassungsGrund = istZeitpunkt(stand.startedAt) ? 'erfasst' : 'ende-ohne-start';
  return { actual: neu, geaendert: true, grund };
}

/**
 * Was der eine Knopf in diesem Zustand tut — oder dass er nichts tut.
 *
 * Die Oberflaeche fragt hier und entscheidet es nicht selbst: sonst gaebe es
 * die Regel zweimal, einmal in `erfassen` und einmal in der Beschriftung,
 * und die Beschriftung waere die, die irgendwann etwas anderes verspricht,
 * als der Griff tut.
 *
 * `null` in zwei verschiedenen Lagen, und beide mit Grund:
 *
 *   * Beginn UND Ende erfasst — es gibt nichts mehr zu greifen.
 *   * Ende OHNE Beginn — hier waere „Beginn" der gefaehrlichste aller
 *     Knoepfe: er schriebe den JETZIGEN Augenblick als Beginn, also einen,
 *     der nach dem Ende liegt. Aus einer erkennbaren Luecke im Protokoll
 *     wuerde eine unsinnige Messung, die wie eine Messung aussieht. Der
 *     Beginn ist vorbei; ihn nachzutragen ist eine Entscheidung ueber einen
 *     Zeitpunkt und gehoert deshalb nach `korrigieren`.
 */
export function naechsterGriff(actual: SceneActual | undefined): Griff | null {
  if (istZeitpunkt(actual?.endedAt)) return null;
  if (istZeitpunkt(actual?.startedAt)) return 'ende';
  return 'start';
}

/**
 * Der ausdrueckliche Weg: einen erfassten Zeitpunkt setzen oder loeschen.
 *
 * `null` loescht. Das ist der Unterschied zu `erfassen`, und er ist Absicht:
 * eine Tatsache zu verwerfen soll eine Entscheidung sein und kein Griff.
 */
export function korrigieren(
  vorher: SceneActual | undefined,
  griff: Griff,
  zeitpunkt: string | null,
): SceneActual {
  const stand: SceneActual = { ...(vorher ?? {}) };
  const feld = griff === 'start' ? 'startedAt' : 'endedAt';
  if (zeitpunkt === null) {
    delete stand[feld];
    return stand;
  }
  return { ...stand, [feld]: zeitpunkt };
}

/**
 * Woher der Nullpunkt der Achse kommt.
 *
 * WARUM `genannt` UND NICHT `erklaert`, obwohl ADR-002 „erklaert" sagt: der
 * ASCII-Drift-Waechter (`scripts/ascii-drift-check.ts`) sieht String-Literale
 * und kann einem Unterscheidungswert nicht ansehen, dass er Code ist und
 * keine Anzeige. „erklaert" und „frueheste" in seine HARMLOS-Liste zu
 * schreiben waere die teurere Loesung gewesen — sie machte ihn genau fuer
 * die Woerter blind, bei denen er in einer Oberflaechen-Zeichenkette recht
 * haette. Ein interner Unterscheidungswert kostet beim Umbenennen nichts,
 * eine stumpfe Regel kostet auf Dauer alles.
 */
export type AnkerHerkunft = 'genannt' | 'erste-erfassung' | 'keine';

export interface Zeitachse {
  /** In der Form, die `retime()` liest: Minuten seit dem Anker. */
  actuals: Record<string, OrderActual>;
  /** Der Nullpunkt als ISO-Zeitpunkt, oder `null`, wenn es keinen gibt. */
  anker: string | null;
  herkunft: AnkerHerkunft;
}

/**
 * Erfasste Augenblicke in die Minuten-Achse umrechnen, die `retime()` liest.
 *
 * Der Anker wird ERKLAERT, wenn der Aufrufer einen kennt (ADR-002). Kennt er
 * keinen, nimmt diese Funktion die frueheste Erfassung — und sagt es ueber
 * `herkunft`, statt es zu verschweigen. Der Unterschied zaehlt: bei
 * `erste-erfassung` beginnt der erste erfasste Eintrag per Konstruktion
 * bei Minute 0, seine Verschiebung gegen den Plan ist also keine Messung.
 *
 * Nachkommastellen bleiben stehen. Das Runden gehoert in die Anzeige — wer
 * hier rundete, summierte den Rundungsfehler ueber den ganzen Abend auf.
 */
export function zeitachse(
  actuals: Readonly<Record<string, SceneActual>>,
  erklaerterAnker?: string,
): Zeitachse {
  const zeitpunkte: number[] = [];
  for (const a of Object.values(actuals)) {
    if (istZeitpunkt(a?.startedAt)) zeitpunkte.push(Date.parse(a.startedAt));
  }

  const ankerMs = istZeitpunkt(erklaerterAnker)
    ? Date.parse(erklaerterAnker)
    : zeitpunkte.length > 0
      ? Math.min(...zeitpunkte)
      : null;

  const herkunft: AnkerHerkunft = istZeitpunkt(erklaerterAnker)
    ? 'genannt'
    : ankerMs === null
      ? 'keine'
      : 'erste-erfassung';

  const umgerechnet: Record<string, OrderActual> = {};
  if (ankerMs !== null) {
    for (const [id, a] of Object.entries(actuals)) {
      const eintrag: OrderActual = {};
      if (istZeitpunkt(a?.startedAt)) eintrag.startedAt = (Date.parse(a.startedAt) - ankerMs) / 60000;
      if (istZeitpunkt(a?.endedAt)) eintrag.endedAt = (Date.parse(a.endedAt) - ankerMs) / 60000;
      // Ein leerer Eintrag traegt nichts und liesse `retime` glauben, hier
      // sei etwas erfasst worden.
      if (eintrag.startedAt !== undefined || eintrag.endedAt !== undefined) umgerechnet[id] = eintrag;
    }
  }

  return { actuals: umgerechnet, anker: ankerMs === null ? null : new Date(ankerMs).toISOString(), herkunft };
}

/**
 * Die gemessene Dauer eines Eintrags, in Minuten — oder `null`, wenn sie
 * nicht gemessen wurde.
 *
 * `null` und `0` sind zwei verschiedene Auskuenfte: „nicht erfasst" und
 * „dauerte keine Minute". Ein `0` fuer das Erste machte aus einer Luecke im
 * Protokoll eine Behauptung ueber den Abend.
 */
export function istDauer(actual: SceneActual | undefined): number | null {
  if (!actual || !istZeitpunkt(actual.startedAt) || !istZeitpunkt(actual.endedAt)) return null;
  const dauer = (Date.parse(actual.endedAt) - Date.parse(actual.startedAt)) / 60000;
  // Ein negatives Ergebnis ist keine Dauer. `retime` meldet den Widerspruch
  // als `ended-before-start`; hier gibt es dafuer keine Zahl.
  return dauer < 0 ? null : dauer;
}

/** Eine Zeile der Nachbetrachtung: Plan gegen Ist, je Eintrag. */
export interface AuswertungsZeile {
  id: string;
  name: string;
  /** Geplante Dauer, wenn eine erklaert wurde. */
  planMinuten: number | null;
  /** Gemessene Dauer, wenn Beginn und Ende erfasst sind. */
  istMinuten: number | null;
  /** Ist minus Plan. `null`, sobald eine der beiden Seiten fehlt. */
  abweichungMinuten: number | null;
}

export interface Auswertung {
  zeilen: AuswertungsZeile[];
  /** Wie viele Eintraege eine gemessene Dauer haben. */
  gemessen: number;
  /**
   * Summe der Abweichungen ueber die Eintraege, die BEIDE Seiten haben.
   *
   * Ausdruecklich nicht ueber alle: eine fehlende Messung als 0 zu zaehlen
   * hiesse, einen nicht erfassten Programmpunkt als punktgenau zu melden.
   */
  abweichungSumme: number;
  /** Wie viele Eintraege in `abweichungSumme` eingegangen sind. */
  abweichungBasis: number;
}

/**
 * Die Nachbetrachtung, aus der die Planung des naechsten Jahres lebt:
 * was war geplant, was ist gemessen, und wie weit lag das auseinander.
 *
 * Das ist eine ANDERE Frage als die von `retime()`. Dort geht es um die
 * Vorschau waehrend der Show („wo landen wir"), hier um die gemessene Dauer
 * hinterher („wie lange hat es wirklich gebraucht"). `retime` gibt die
 * gemessene Dauer nicht her, und diese Funktion rechnet keine Vorschau —
 * sonst gaebe es die Show zweimal ausgerechnet, und die zweite Rechnung
 * waere die, die irgendwann abweicht.
 *
 * Eltern-Eintraege bleiben aussen vor: ihre Dauer ist laut `retime.ts` die
 * Summe ihrer Kinder, und sie hier noch einmal gemessen aufzufuehren hiesse,
 * dieselben Minuten zweimal zu zaehlen.
 */
export function auswertung<T extends OrderItem>(
  items: readonly T[],
  timing: Readonly<Record<string, OrderTiming>>,
  actuals: Readonly<Record<string, SceneActual>>,
): Auswertung {
  const hatKinder = new Set(
    items.map((i) => i.parentId).filter((p): p is string => typeof p === 'string'),
  );

  const zeilen: AuswertungsZeile[] = [];
  let abweichungSumme = 0;
  let abweichungBasis = 0;
  let gemessen = 0;

  for (const item of items) {
    if (hatKinder.has(item.id)) continue;
    const plan = timing[item.id]?.plannedMinutes;
    const planMinuten = typeof plan === 'number' && Number.isFinite(plan) ? plan : null;
    const istMinuten = istDauer(actuals[item.id]);
    if (istMinuten !== null) gemessen += 1;
    const abweichungMinuten =
      planMinuten !== null && istMinuten !== null ? istMinuten - planMinuten : null;
    if (abweichungMinuten !== null) {
      abweichungSumme += abweichungMinuten;
      abweichungBasis += 1;
    }
    zeilen.push({ id: item.id, name: item.name, planMinuten, istMinuten, abweichungMinuten });
  }

  return { zeilen, gemessen, abweichungSumme, abweichungBasis };
}
