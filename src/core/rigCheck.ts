// Rig validation — the "check your plot for common mistakes" pass that tools
// like Lightwright run: overlapping DMX, duplicate channels, un-patched movers,
// overloaded trusses and an electrical-load sanity check. Pure data in, a flat
// list of issues out (sorted worst-first) for a report panel.
import type { PlacedFixture, Truss } from '../types';
import { findPatchConflicts, footprint, computePower, trussLoads, DEFAULT_TRUSS_CAPACITY, UNIVERSE_SIZE } from './patch';
import {
  CIRCUIT_AMPS, DEFAULT_TEMPLATE, PHASE_LABEL, distributionFor, type PhaseTemplate,
} from './powerDistribution';

export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Worauf ein Befund beruht (Bedarf 142).
 *
 *   > Braceworks with default weights 'produces confident, wrong numbers'.
 *
 * Das ist keine fremde Beobachtung: die Traglast-Pruefung hier rechnet mit
 * `f.fixture.weight || 0` und mit einer Standard-Traglast, wo keine
 * eingetragen ist. Eine Traverse als „sicher" zu melden, weil die unbekannten
 * Gewichte als Null in die Summe gingen, ist genau dieselbe Zahl mit
 * demselben Selbstbewusstsein.
 *
 * Deshalb traegt jeder Befund, der auf Annahmen beruht, `basis: 'assumed'` —
 * und der Vorflug-Bericht (`core/preflight.ts`) faellt daraufhin kein Urteil,
 * sondern sagt, dass er keines faellen kann.
 */
export type IssueBasis = 'measured' | 'assumed';

export interface RigIssue {
  severity: IssueSeverity;
  message: string;
  ids?: string[]; // affected fixture ids (for highlighting later)
  /** Fehlt = 'measured'. Nur wer annimmt, sagt es. */
  basis?: IssueBasis;
}

const RANK: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

export function rigCheck(
  fixtures: PlacedFixture[],
  trusses: Truss[] = [],
  /**
   * BEDARF 141 — welche Phasen der Anschluss fuehrt. Ohne diese Angabe laesst
   * sich nicht sagen, wie sich die Kreise verteilen, und die Stromlast bliebe
   * die ausgeglichene Annahme, die sie bisher war.
   */
  template: PhaseTemplate = DEFAULT_TEMPLATE,
): RigIssue[] {
  const issues: RigIssue[] = [];
  if (fixtures.length === 0) return issues;

  // BEDARF 142 — worauf die Last-Zahlen unten beruhen. Ein Geraet ohne
  // eingetragenes Gewicht geht als NULL in die Summe (`f.fixture.weight || 0`),
  // eines ohne Leistung ebenso. Wer das nicht weiss, liest eine Zahl, die
  // kleiner ist als die Wirklichkeit — und ausgerechnet bei der Traglast ist
  // das die gefaehrliche Richtung.
  const ohneGewicht = fixtures.filter((f) => !(f.fixture.weight > 0));
  const ohneLeistung = fixtures.filter((f) => !(f.fixture.wattage > 0));
  const traglastGeraten = trusses.some((t) => !(t.capacity && t.capacity > 0));
  const lastBasis: IssueBasis =
    (ohneGewicht.length > 0 || traglastGeraten) ? 'assumed' : 'measured';
  const stromBasis: IssueBasis = ohneLeistung.length > 0 ? 'assumed' : 'measured';

  // 1) Overlapping DMX addresses (same universe, ranges intersect).
  const conflicts = findPatchConflicts(fixtures);
  if (conflicts.size > 0) {
    issues.push({ severity: 'error', message: `${conflicts.size} Leuchte(n) mit überlappender DMX-Adresse`, ids: [...conflicts] });
  }

  // 2) Duplicate channel numbers.
  const byChannel = new Map<number, string[]>();
  for (const f of fixtures) if (f.channel != null) {
    const arr = byChannel.get(f.channel) ?? []; arr.push(f.id); byChannel.set(f.channel, arr);
  }
  const dupChannels = [...byChannel.entries()].filter(([, ids]) => ids.length > 1);
  if (dupChannels.length > 0) {
    const ids = dupChannels.flatMap(([, i]) => i);
    issues.push({ severity: 'warning', message: `${dupChannels.length} doppelte Kanalnummer(n) (${dupChannels.map(([c]) => c).join(', ')})`, ids });
  }

  // 3a) Profile, die nicht in ein Universe passen. Vor der allgemeinen
  //     „ohne Patch-Adresse"-Warnung, weil sie deren Grund NENNT: `autoPatch`
  //     vergibt für sie mit Absicht nichts, und ohne diese Zeile stünde die
  //     Leuchte nur unter „ungepatcht" und niemand wüsste, warum sie es
  //     bleibt, egal wie oft man auf Auto-Patch drückt.
  const ueberUniverse = fixtures.filter((f) => footprint(f) > UNIVERSE_SIZE);
  if (ueberUniverse.length > 0) {
    issues.push({
      severity: 'error',
      message: `${ueberUniverse.length} Leuchte(n) belegen mehr als ${UNIVERSE_SIZE} Kanäle und passen in kein Universe – sie müssen von Hand auf mehrere aufgeteilt werden`,
      ids: ueberUniverse.map((f) => f.id),
    });
  }

  // 3) DMX fixtures (footprint > 0) without an assigned address.
  const ueberUniverseIds = new Set(ueberUniverse.map((f) => f.id));
  const unpatched = fixtures.filter(
    (f) => footprint(f) > 0 && !ueberUniverseIds.has(f.id) && (f.universe == null || f.dmxAddress == null),
  );
  if (unpatched.length > 0) {
    issues.push({ severity: 'warning', message: `${unpatched.length} DMX-Leuchte(n) ohne Patch-Adresse`, ids: unpatched.map((f) => f.id) });
  }

  // 4) Truss overload.
  const { perTruss } = trussLoads(fixtures, trusses);
  for (const t of perTruss) {
    if (t.overloaded) {
      issues.push({ severity: 'error', message: `${t.label}: ${t.weightKg.toFixed(1)} kg über Traglast (${t.capacityKg} kg)`, basis: lastBasis });
    } else if (t.utilization >= 0.8 && t.fixtureCount > 0) {
      issues.push({ severity: 'warning', message: `${t.label}: ${Math.round(t.utilization * 100)} % der Traglast (${t.weightKg.toFixed(1)}/${t.capacityKg} kg)`, basis: lastBasis });
    }
  }
  if (trusses.length === 0 && fixtures.length > 0) {
    issues.push({ severity: 'info', message: 'Keine Traverse definiert – Rigging-Last wird nicht geprüft' });
  } else if (traglastGeraten) {
    issues.push({ severity: 'info', message: `Traglast teils unbekannt – Standardwert ${DEFAULT_TRUSS_CAPACITY} kg/Traverse angenommen`, basis: 'assumed' });
  }

  // BEDARF 142 — was in der Summe FEHLT, und zwar als Warnung und nicht als
  // Fussnote: eine Traverse, die nur deshalb im gruenen Bereich liegt, weil
  // drei Geraete ohne Gewicht mitfliegen, ist nicht im gruenen Bereich.
  if (ohneGewicht.length > 0) {
    issues.push({
      severity: 'warning',
      message: `${ohneGewicht.length} Leuchte(n) ohne Gewicht – sie gehen als 0 kg in die Traglast ein`,
      ids: ohneGewicht.map((f) => f.id),
      basis: 'assumed',
    });
  }
  if (ohneLeistung.length > 0) {
    issues.push({
      severity: 'warning',
      message: `${ohneLeistung.length} Leuchte(n) ohne Leistungsangabe – sie gehen als 0 W in die Stromlast ein`,
      ids: ohneLeistung.map((f) => f.id),
      basis: 'assumed',
    });
  }

  // 5) Electrical-load sanity (single-phase headroom).
  const power = computePower(fixtures);
  if (power.amps1ph > 16) {
    issues.push({ severity: 'info', message: `Gesamtlast ${power.amps1ph.toFixed(1)} A – auf mind. ${power.circuits16A} Stromkreise (16 A) verteilen`, basis: stromBasis });
  }

  // 6) BEDARF 141 — die Last je Phase, gerechnet statt angenommen.
  //
  //    `power.ampsPerPhase` ist `totalWatts / (3 * 230)` — die Last einer
  //    AUSGEGLICHENEN Anlage, also des Zustands, den niemand hat. Kreise
  //    haengen an Steckplaetzen, Steckplaetze an Phasen, und den Automaten
  //    wirft die schwerste Phase und nicht der Durchschnitt. Die angenommene
  //    Zahl ist deshalb systematisch zu klein.
  const verteilung = distributionFor(fixtures, template);
  const spitze = verteilung.peak;
  if (spitze && spitze.amps > CIRCUIT_AMPS) {
    issues.push({
      severity: 'warning',
      message: `${PHASE_LABEL[spitze.phase]} trägt ${spitze.amps.toFixed(1)} A `
        + `(${spitze.circuits} Kreis(e)) – über ${CIRCUIT_AMPS} A je Phase`,
      basis: stromBasis,
    });
  }
  // Und der Betrag, um den der Plan zu gut aussah — aber nur, wenn er eine
  // Entscheidung aendern koennte.
  //
  // DIE SCHWELLE IST EIN GANZER KREIS, kein erfundener Prozentsatz. Ein
  // Einzelgeraet auf einer von drei Phasen ist rechnerisch „zu 100 %
  // unausgeglichen" und interessiert niemanden: beide Zahlen liegen unter
  // jedem Automaten. Erst wenn die Annahme mehr als einen vollen 16-A-Kreis
  // verschweigt, spezifiziert jemand daraufhin einen zu kleinen Anschluss.
  //
  // Auf dem Last-Blatt steht der Betrag TROTZDEM immer — dort sieht man
  // absichtlich nach. Hier unterbricht er, und was unterbricht, muss es wert
  // sein: eine Liste, die bei jedem Plan meckert, liest beim zweiten Mal
  // niemand mehr.
  if (verteilung.understatedAmps >= CIRCUIT_AMPS) {
    issues.push({
      severity: 'info',
      message: `Ungleich verteilt: die schwerste Phase trägt ${verteilung.understatedAmps.toFixed(1)} A `
        + `mehr als die ausgeglichene Annahme (${verteilung.assumedAmpsPerPhase.toFixed(1)} A) – `
        + `Unterschied zwischen schwerster und leichtester Phase ${verteilung.imbalanceAmps.toFixed(1)} A`,
      basis: stromBasis,
    });
  }
  // Ein einzelnes Geraet, das groesser ist als das Kreis-Budget, bekommt von
  // `circuitBreakdown` einen eigenen Kreis — und der liegt dann UEBER dem
  // Budget, weil ein Geraet sich nicht teilen laesst. Das faellt sonst
  // niemandem auf: die Kreis-Zahl stimmt ja.
  const zuGross = verteilung.assignments.filter((a) => a.overloaded);
  if (zuGross.length > 0) {
    issues.push({
      severity: 'error',
      message: `${zuGross.length} Kreis(e) über ${CIRCUIT_AMPS} A `
        + `(${zuGross.map((a) => `${a.distro}-${a.outlet}: ${a.amps.toFixed(1)} A`).join(', ')}) – `
        + 'ein Gerät passt in keinen 16-A-Kreis',
      basis: stromBasis,
    });
  }

  return issues.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export function issueCounts(issues: RigIssue[]): { errors: number; warnings: number; infos: number } {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
}
