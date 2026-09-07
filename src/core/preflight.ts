// ───────────────────────────────────────────────────────────────────────────
// Vorflug-Prüfung: bevor irgendetwas hängt (Bedarf 142, P4).
//
//   > Checks are done by eye or discovered on site. Named wanted checks:
//   > overlapping DMX addresses in a universe, duplicate channel numbers,
//   > power overload on circuits/dimmers/phases, MISSING REQUIRED FIELDS,
//   > SEMANTIC INCONSISTENCIES SUCH AS LED FIXTURES ON DIMMER CIRCUITS.
//
// Beleg: `jkarp7/showstack#31` (2025-12-27). Die Quelle nennt daneben zwei
// verwandte Klassen stiller Fehlschläge, und beide sind hier zuhause:
// Vectorworks-Auswertungen, die Geräte mit unvollständigem Datensatz
// „quietly omit", und Braceworks, das mit Standardgewichten „produces
// confident, wrong numbers".
//
// ─── DER TEURE TEIL IST NICHT DIE PRÜFUNG, SONDERN DAS SELBSTBEWUSSTSEIN ───
//
// `rigCheck` prüfte Überlappung, doppelte Kanäle und Traglast schon. Was
// fehlte, ist die Frage, WORAUF die Zahlen beruhen: `computePower` summiert
// `f.fixture.wattage || 0`, `trussLoads` summiert `f.fixture.weight || 0`, und
// wo keine Traglast eingetragen ist, gilt ein Standardwert. Eine Traverse, die
// nur deshalb im grünen Bereich liegt, weil drei Geräte ohne Gewicht
// mitfliegen, wurde als „keine Probleme gefunden" gemeldet.
//
// Deshalb hat dieser Bericht ein VIERTES Urteil: nicht nur „bereit",
// „prüfen" und „blockiert", sondern auch „nicht beurteilbar". Ein Plan, dessen
// Last-Zahlen auf fehlenden Angaben beruhen, ist nicht bereit — er ist
// unbeantwortet, und das ist etwas anderes als in Ordnung.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture, Truss, FixtureCategory } from '../types';
import { footprint } from './patch';
import { rigCheck, type IssueBasis, type IssueSeverity, type RigIssue } from './rigCheck';

/**
 * Gerätearten, die NIE an einem Dimmer hängen dürfen.
 *
 * Ein Moving Head oder ein LED-Panel an einem Phasenanschnitt-Dimmer zieht
 * im besten Fall nicht an und im schlechteren raucht das Netzteil. Die Liste
 * ist ABSICHTLICH kurz: sie führt nur, was der Typname eindeutig macht.
 * `wash`, `spot` und `custom` heißen in dieser Bibliothek mal LED und mal
 * konventionell — ein Befund darüber wäre geraten, und eine Prüfliste mit
 * geratenen Zeilen liest beim zweiten Mal niemand mehr.
 */
const ELEKTRONISCH: ReadonlySet<FixtureCategory> = new Set<FixtureCategory>([
  'moving-wash', 'moving-spot', 'moving-beam', 'beam', 'led-panel',
]);

export type PreflightVerdict =
  /** Mindestens ein Fehler. So geht es nicht auf die Traverse. */
  | 'blocked'
  /**
   * Etwas fehlt, worauf die Zahlen beruhen. KEIN „bereit": ein Urteil über
   * eine Last, deren Gewichte niemand kennt, ist keines.
   */
  | 'unknown'
  /** Hinweise und Warnungen, aber alles beruht auf eingetragenen Werten. */
  | 'check'
  /** Nichts gefunden, und die Zahlen stehen auf eigenen Beinen. */
  | 'ready';

export const VERDICT_LABEL: Readonly<Record<PreflightVerdict, string>> = {
  blocked: 'So nicht — mindestens ein Fehler',
  unknown: 'Nicht beurteilbar — es fehlen Angaben, auf denen die Zahlen beruhen',
  check: 'Durchsehen — Hinweise vorhanden',
  ready: 'Bereit',
};

export const BASIS_LABEL: Readonly<Record<IssueBasis, string>> = {
  measured: 'eingetragen',
  assumed: 'angenommen',
};

export const SEVERITY_LABEL: Readonly<Record<IssueSeverity, string>> = {
  error: 'Fehler',
  warning: 'Warnung',
  info: 'Hinweis',
};

export interface PreflightReport {
  issues: RigIssue[];
  verdict: PreflightVerdict;
  /** Wie viele Befunde auf Annahmen beruhen. */
  assumed: number;
  counts: Record<IssueSeverity, number>;
}

/**
 * Die zusätzlichen, semantischen Prüfungen.
 *
 * Getrennt von `rigCheck`, damit sich beides einzeln lesen lässt — aber
 * `preflight` unten führt sie zusammen, und der Dialog nimmt NUR das
 * Ergebnis. Zwei Listen, die derselbe Mensch nebeneinander lesen muss, sind
 * eine zu viel.
 */
export function semanticIssues(fixtures: readonly PlacedFixture[]): RigIssue[] {
  const out: RigIssue[] = [];
  if (fixtures.length === 0) return out;

  // 1) Elektronik am Dimmer. Der Fall, den der Beleg ausdruecklich nennt.
  //    Kein DMX-Fussabdruck heisst in diesem Modell: das Geraet haengt an
  //    einem Dimmerkanal (`core/patch.ts`, `footprint`).
  const amDimmer = fixtures.filter(
    (f) => ELEKTRONISCH.has(f.fixture.category) && footprint(f) === 0,
  );
  if (amDimmer.length > 0) {
    out.push({
      severity: 'error',
      message:
        `${amDimmer.length} elektronische(s) Gerät(e) ohne DMX-Fußabdruck – als Dimmerlast gepatcht. ` +
        'Ein Moving Head oder LED-Panel am Phasenanschnitt zieht nicht an oder nimmt Schaden.',
      ids: amDimmer.map((f) => f.id),
    });
  }

  // 2) Fehlende Pflichtangaben. „Missing required fields" aus dem Beleg —
  //    und zwar getrennt: ohne Kanal laesst sich das Geraet nicht rufen, ohne
  //    Unit-Nummer nicht finden. Das sind zwei verschiedene Probleme fuer
  //    zwei verschiedene Menschen.
  const ohneKanal = fixtures.filter((f) => f.channel == null);
  if (ohneKanal.length > 0) {
    out.push({
      severity: 'warning',
      message: `${ohneKanal.length} Leuchte(n) ohne Kanalnummer – am Pult nicht aufrufbar`,
      ids: ohneKanal.map((f) => f.id),
    });
  }
  const ohneUnit = fixtures.filter((f) => !(f.unitNumber ?? '').trim());
  if (ohneUnit.length > 0) {
    out.push({
      severity: 'info',
      message: `${ohneUnit.length} Leuchte(n) ohne Unit-Nummer – auf der Traverse nicht eindeutig zu finden`,
      ids: ohneUnit.map((f) => f.id),
    });
  }

  return out;
}

/**
 * Der Vorflug-Bericht: alles an einer Stelle, mit einem Urteil.
 *
 * Das Urteil ist die Engstelle. `unknown` steht VOR `check` und `ready`:
 * sobald ein Befund auf Annahmen beruht, ist der Plan nicht beurteilbar, und
 * zwar auch dann, wenn sonst nichts gefunden wurde. Genau der Fall — nichts
 * gefunden, weil die fehlenden Werte als Null durchgingen — ist der, den der
 * Beleg als „confident, wrong numbers" beschreibt.
 */
export function preflight(
  fixtures: readonly PlacedFixture[],
  trusses: readonly Truss[] = [],
): PreflightReport {
  const issues = [
    ...rigCheck([...fixtures], [...trusses]),
    ...semanticIssues(fixtures),
  ];
  const rank: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const counts: Record<IssueSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity] += 1;
  const assumed = issues.filter((i) => i.basis === 'assumed').length;

  const verdict: PreflightVerdict =
    counts.error > 0 ? 'blocked'
      : assumed > 0 ? 'unknown'
        : issues.length > 0 ? 'check'
          : 'ready';

  return { issues, verdict, assumed, counts };
}

export const PREFLIGHT_HEADERS = ['Schwere', 'Grundlage', 'Befund', 'Betroffen'] as const;

/** Was in der Spalte steht, wo kein Gerät betroffen ist. */
export const NO_TARGET = '—';

/**
 * Der Bericht als Tabelle.
 *
 * Die Spalte „Grundlage" steht VOR dem Befund, nicht dahinter: wer die Liste
 * überfliegt, soll sehen, welche Zeilen auf eingetragenen Werten beruhen,
 * bevor er den Text liest.
 */
export function preflightTable(
  report: PreflightReport,
): { header: string[]; rows: (string | number)[][] } {
  return {
    header: [...PREFLIGHT_HEADERS],
    rows: report.issues.map((i) => [
      SEVERITY_LABEL[i.severity],
      BASIS_LABEL[i.basis ?? 'measured'],
      i.message,
      i.ids?.length ? String(i.ids.length) : NO_TARGET,
    ]),
  };
}
