// ───────────────────────────────────────────────────────────────────────────
// Kreise, Phasen und Steckreihenfolge (Bedarf 141, P4).
//
//   > Circuit name/number was raised against the MVR spec; the current spec
//   > text still shows no circuit entity […] The real-world need is fully
//   > specified elsewhere: services feeding racks, AB/AC/ABC PHASE TEMPLATES,
//   > PER-PHASE LOAD, and POINT-CIRCUIT PLUG-ORDER NOTATION ('Circuit 3-2').
//
// Belege: `mvrdevelopment/spec#158` (geschlossen 2024-08-08, Auflösung
// unbestätigt), `jkarp7/showstack#41` und `#39` (beide 2025-12-28).
//
// ─── DIE ZAHL, DIE ES BISHER GAB, WAR EINE ANNAHME ─────────────────────────
//
// `computePower` liefert `ampsPerPhase = totalWatts / (3 * 230)`. Das ist die
// Last einer AUSGEGLICHENEN Anlage — also der Zustand, den niemand hat.
// Kreise hängen an Steckplätzen, Steckplätze an Phasen, und die schwerste
// Phase ist die, die den Automaten wirft. Die ausgeglichene Zahl ist deshalb
// systematisch zu klein: sie kann nie grösser sein als die schwerste Phase,
// und sie ist genau dann gleich, wenn sich die Anlage von selbst verteilt
// hätte.
//
// Das ist derselbe Fehler, den Bedarf 142 an den Traglasten benannt hat —
// „confident, wrong numbers". Dieses Modul rechnet ihn nicht schön, es rechnet
// ihn nach: es sagt, was auf jeder Phase liegt, und es sagt, um wie viel die
// ausgeglichene Annahme danebenlag.
//
// ─── WARUM DIE PHASE AM STECKPLATZ HÄNGT UND NICHT AM KREIS ────────────────
//
// Ein Distro verdrahtet seine Ausgänge reihum: L1, L2, L3, L1, L2, L3 … Wer
// den vierten Kreis steckt, bekommt L1 — nicht, weil das klug wäre, sondern
// weil dort L1 anliegt. Ein Planer, der Phasen frei zuteilt, plant etwas, das
// am Steckfeld niemand nachbauen kann. Die Zuordnung folgt hier also der
// STECKREIHENFOLGE, und wer umverteilen will, steckt um — das ist die
// Handlung, die es in der Halle wirklich gibt.
//
// Die „Phasen-Vorlage" sagt, welche Phasen der Anschluss überhaupt führt:
// eine Baustellen-Steckdose mit 16 A einphasig kennt nur A, ein CEE-16-Anschluss
// ABC. AB und AC gibt es, weil eine Phase ausgefallen oder belegt sein kann.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture } from '../types';
import { CIRCUIT_WATTS, circuitBreakdown, type Circuit } from './patch';

/** Die drei Aussenleiter. `L1` heisst in angelsaechsischer Schreibweise `A`. */
export type Phase = 'L1' | 'L2' | 'L3';

/**
 * Beide Schreibweisen nebeneinander — aus demselben Grund wie bei den
 * Universe-Lesarten (Bedarf 147): der Beleg spricht von A/B/C, das Blatt in
 * der Halle von L1/L2/L3, und wer nur eine kennt, liest die andere falsch.
 */
export const PHASE_LABEL: Readonly<Record<Phase, string>> = {
  L1: 'L1 (A)',
  L2: 'L2 (B)',
  L3: 'L3 (C)',
};

/**
 * Welche Phasen der Anschluss fuehrt.
 *
 * Genau die vier aus dem Beleg. KEINE frei zusammenstellbare Menge: eine
 * Vorlage ist eine Aussage ueber einen realen Anschluss, und „L2+L3 ohne L1"
 * ist keiner, den jemand vorfindet — wohl aber „eine Phase ist belegt".
 */
export type PhaseTemplate = 'A' | 'AB' | 'AC' | 'ABC';

export const TEMPLATE_PHASES: Readonly<Record<PhaseTemplate, readonly Phase[]>> = {
  A: ['L1'],
  AB: ['L1', 'L2'],
  AC: ['L1', 'L3'],
  ABC: ['L1', 'L2', 'L3'],
};

export const TEMPLATE_LABEL: Readonly<Record<PhaseTemplate, string>> = {
  A: 'A — einphasig (nur L1)',
  AB: 'AB — zwei Phasen (L1, L2)',
  AC: 'AC — zwei Phasen (L1, L3)',
  ABC: 'ABC — Drehstrom (L1, L2, L3)',
};

/**
 * Was gilt, solange niemand etwas gesagt hat.
 *
 * ABC, weil `computePower` seit jeher durch drei teilt — die Vorgabe aendert
 * damit KEINE vorhandene Zahl, sie macht nur nachpruefbar, worauf sie beruhte.
 * Eine andere Vorgabe wuerde alte Plaene stillschweigend anders bewerten.
 */
export const DEFAULT_TEMPLATE: PhaseTemplate = 'ABC';

/**
 * Ausgaenge je Distro.
 *
 * Sechs, weil das die kleinste Bauform ist, die eine ganze ABC-Runde zweimal
 * fuehrt — jeder Phase zwei Ausgaenge. Ueberschreibbar, weil die Zahl eine
 * Eigenschaft des vorhandenen Geraets ist und keine Wahrheit.
 */
export const OUTLETS_PER_DISTRO = 6;

/** Spannung Aussenleiter gegen Neutralleiter. */
export const MAINS_VOLTAGE = 230;

/** Nennstrom eines Kreises. */
export const CIRCUIT_AMPS = 16;

/**
 * Ein Kreis, wie er am Steckfeld heisst: Distro und Ausgang.
 *
 * Der Beleg nennt die Schreibweise „Circuit 3-2" — Distro 3, Ausgang 2. Sie
 * ist keine Verzierung: sie ist die einzige Bezeichnung, die jemand am
 * Steckfeld WIEDERFINDET. „Kreis 14" sagt nichts darueber, wo man steht.
 */
export interface PointCircuit {
  distro: number;
  outlet: number;
}

export const circuitLabel = ({ distro, outlet }: PointCircuit): string => `${distro}-${outlet}`;

/**
 * Die Schreibweise zurueck in ihre zwei Zahlen.
 *
 * `null` statt geraten: „3-2-1" oder „Kreis 3" sind keine Punkt-Kreise, und
 * ein zurechtgebogener Wert stuende als Beschriftung an einem Ausgang, den es
 * nicht gibt.
 */
export function parseCircuitLabel(s: string): PointCircuit | null {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(s);
  if (!m) return null;
  const distro = Number(m[1]);
  const outlet = Number(m[2]);
  if (distro < 1 || outlet < 1) return null;
  return { distro, outlet };
}

export interface CircuitAssignment extends PointCircuit {
  /** Laufende Nummer aus `circuitBreakdown` — die Verbindung zur Last. */
  index: number;
  phase: Phase;
  watts: number;
  amps: number;
  fixtureCount: number;
  /** Anteil am Kreis-Budget. */
  utilization: number;
  /** Ueber dem Nennstrom des Kreises. */
  overloaded: boolean;
}

/**
 * Kreise auf Distros, Ausgaenge und Phasen — in Steckreihenfolge.
 *
 * Die Phase folgt dem AUSGANG, nicht dem Kreis: ein Distro verdrahtet seine
 * Ausgaenge reihum ueber die Phasen der Vorlage. Wer den vierten Ausgang eines
 * ABC-Distros steckt, bekommt L1, ob ihm das passt oder nicht.
 */
export function plugOrder(
  circuits: readonly Circuit[],
  template: PhaseTemplate = DEFAULT_TEMPLATE,
  outletsPerDistro: number = OUTLETS_PER_DISTRO,
): CircuitAssignment[] {
  const phasen = TEMPLATE_PHASES[template];
  const proDistro = Math.max(1, Math.floor(outletsPerDistro));
  return circuits.map((c, i) => {
    const outlet = (i % proDistro) + 1;
    const amps = c.watts / MAINS_VOLTAGE;
    return {
      index: c.index,
      distro: Math.floor(i / proDistro) + 1,
      outlet,
      // Reihum ueber die Ausgaenge des Distros, nicht ueber alle Kreise: sonst
      // saehe ein zweites Distro eine andere Phasenfolge als das erste, und
      // das Blatt beschriebe ein Steckfeld, das es nicht gibt.
      phase: phasen[(outlet - 1) % phasen.length],
      watts: c.watts,
      amps,
      fixtureCount: c.fixtureCount,
      utilization: c.utilization,
      overloaded: amps > CIRCUIT_AMPS,
    };
  });
}

export interface PhaseLoad {
  phase: Phase;
  watts: number;
  amps: number;
  circuits: number;
}

export interface DistributionPlan {
  template: PhaseTemplate;
  assignments: CircuitAssignment[];
  /** Eine Zeile je Phase der Vorlage — auch fuer die mit Last null. */
  phases: PhaseLoad[];
  /** Die schwerste Phase. Sie wirft den Automaten, nicht der Durchschnitt. */
  peak: PhaseLoad | null;
  /** Schwerste minus leichteste Phase, in Ampere. */
  imbalanceAmps: number;
  /**
   * Was die ausgeglichene Annahme behauptet (`totalWatts / (3 * 230)`).
   *
   * Steht hier NUR zum Danebenhalten. Sie ist nie groesser als die schwerste
   * Phase, und je ungleicher gesteckt wird, desto weiter liegt sie darunter.
   */
  assumedAmpsPerPhase: number;
  /**
   * Um wie viel Ampere die Annahme die schwerste Phase unterschaetzt.
   *
   * Null heisst: die Anlage ist ausgeglichen, die alte Zahl stimmte. Alles
   * darueber ist der Betrag, um den ein Plan zu gut aussah.
   */
  understatedAmps: number;
}

/**
 * Der Verteilungs-Plan: was auf welcher Phase liegt, und was die Annahme
 * darueber behauptet hatte.
 *
 * Die Engstelle. Beide Zahlen — die gerechnete und die angenommene — kommen
 * aus DIESER Funktion, damit sie nicht an zwei Stellen verschieden entstehen
 * koennen.
 */
export function distributionPlan(
  circuits: readonly Circuit[],
  template: PhaseTemplate = DEFAULT_TEMPLATE,
  outletsPerDistro: number = OUTLETS_PER_DISTRO,
): DistributionPlan {
  const assignments = plugOrder(circuits, template, outletsPerDistro);
  const phases: PhaseLoad[] = TEMPLATE_PHASES[template].map((phase) => {
    const eigene = assignments.filter((a) => a.phase === phase);
    const watts = eigene.reduce((s, a) => s + a.watts, 0);
    return { phase, watts, amps: watts / MAINS_VOLTAGE, circuits: eigene.length };
  });

  const totalWatts = assignments.reduce((s, a) => s + a.watts, 0);
  // Die alte Zahl, unveraendert nachgebildet: durch DREI, nicht durch die Zahl
  // der Phasen der Vorlage. Genau das war ja die Annahme — sie fragte nicht,
  // wie viele Phasen der Anschluss fuehrt.
  const assumedAmpsPerPhase = totalWatts / (3 * MAINS_VOLTAGE);

  const peak = phases.length > 0
    ? phases.reduce((a, b) => (b.amps > a.amps ? b : a))
    : null;
  const min = phases.length > 0
    ? phases.reduce((a, b) => (b.amps < a.amps ? b : a))
    : null;

  return {
    template,
    assignments,
    phases,
    peak,
    imbalanceAmps: peak && min ? peak.amps - min.amps : 0,
    assumedAmpsPerPhase,
    understatedAmps: peak ? Math.max(0, peak.amps - assumedAmpsPerPhase) : 0,
  };
}

/** Bequemer Einstieg vom Leuchten-Bestand aus. */
export const distributionFor = (
  fixtures: readonly PlacedFixture[],
  template: PhaseTemplate = DEFAULT_TEMPLATE,
  budget: number = CIRCUIT_WATTS,
  outletsPerDistro: number = OUTLETS_PER_DISTRO,
): DistributionPlan => distributionPlan(circuitBreakdown([...fixtures], budget), template, outletsPerDistro);

export const CIRCUIT_HEADERS = ['Kreis', 'Phase', 'Leuchten', 'W', 'A', 'Auslastung'] as const;

/**
 * Die Kreis-Liste — eines der zwoelf Blaetter aus Bedarf 143, und das erste,
 * das ohne die Phasen-Zuordnung gar nicht schreibbar war.
 */
export function circuitTable(
  plan: DistributionPlan,
): { header: string[]; rows: (string | number)[][] } {
  return {
    header: [...CIRCUIT_HEADERS],
    rows: plan.assignments.map((a) => [
      circuitLabel(a),
      PHASE_LABEL[a.phase],
      a.fixtureCount,
      Math.round(a.watts),
      a.amps.toFixed(1),
      `${Math.round(a.utilization * 100)} %`,
    ]),
  };
}

export const PHASE_HEADERS = ['Phase', 'Kreise', 'W', 'A'] as const;

export function phaseTable(
  plan: DistributionPlan,
): { header: string[]; rows: (string | number)[][] } {
  return {
    header: [...PHASE_HEADERS],
    rows: plan.phases.map((p) => [
      PHASE_LABEL[p.phase],
      p.circuits,
      Math.round(p.watts),
      p.amps.toFixed(1),
    ]),
  };
}
