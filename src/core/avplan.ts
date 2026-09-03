// ───────────────────────────────────────────────────────────────────────────
// .avplan — gemeinsames, VERLUSTFREIES Gesamtprojektformat fuer alle drei Apps
//
// Eine .avplan-Datei haelt den geteilten Raum (`venue`) plus drei Domaenen-
// Slots. Jede App bearbeitet ihren eigenen Slot nativ und reicht die fremden
// Slots 1:1 unveraendert durch — so geht beim Hin- und Her-Wandern zwischen
// Light-, MultiCam- und Cable-Planner KEIN Detail verloren (z. B. behalten
// Lampen all ihre Eigenschaften, auch wenn die Datei durch MultiCam/Cable lief).
//
// Schema-identisch in allen drei Repos.
//   light-planner:    src/core/avplan.ts          (Slot "lighting")
//   multicam-planner: src/utils/avplan.ts         (Slot "cameras")
//   cable-planner:    src/renderer/lib/avplan.ts  (Slot "cabling")
// ───────────────────────────────────────────────────────────────────────────
import type { VenueExchange } from './venueExchange';

export const AVPLAN_KIND = 'avplan' as const;
export const AVPLAN_VERSION = 1 as const;

/** Geteilter Raum — gleiche Form wie venue-exchange `.venue`. */
export type AvVenue = VenueExchange['venue'];

export type AvDomainId = 'cameras' | 'lighting' | 'cabling';

export interface AvPlan {
  kind: typeof AVPLAN_KIND;
  formatVersion: typeof AVPLAN_VERSION;
  /** Letzter Schreiber (Info). */
  app: string;
  appVersion: string;
  exportedAt: string;
  venue: AvVenue;
  /**
   * Die Domaenen-Slots. Die drei bekannten sind benannt; der Index-Zugang
   * daneben ist die eigentliche Aenderung.
   *
   * VORHER ging ein vierter Slot — eine kuenftige Audio- oder Rigging-Domaene,
   * eine App, die es noch nicht gibt — in JEDER der drei Richtungen verloren:
   * `parseAvPlan` nahm die Datei an, die App baute `domains` beim Export aus
   * genau den Slots neu, die sie kennt, und der Rest verschwand. Weder bewahrt
   * noch verweigert noch gemeldet — alle drei Auswege aus ADR-005 Regel 3
   * verfehlt.
   */
  domains: {
    cameras?: unknown;
    lighting?: unknown;
    cabling?: unknown;
    [slot: string]: unknown;
  };
}

/**
 * Die Slots, die dieses Format benennt. Als Daten, nicht als Prosa: nur so
 * kann `unknownDomainSlots` die Frage „was kenne ich hier nicht?" ueberhaupt
 * stellen, und nur so faellt ein Guard auf, wenn ein vierter Slot benannt
 * wird, ohne die Liste nachzuziehen.
 */
export const KNOWN_DOMAIN_SLOTS = ['cameras', 'lighting', 'cabling'] as const;

/** Slot-Namen in dieser Datei, die das Format nicht benennt. */
export const unknownDomainSlots = (plan: AvPlan): string[] =>
  Object.keys(plan.domains ?? {})
    .filter((slot) => !(KNOWN_DOMAIN_SLOTS as readonly string[]).includes(slot))
    .filter((slot) => plan.domains[slot] !== undefined)
    .sort();

/** Die unbekannten Slots als eigenes Objekt — so wandern sie ins Projektfile. */
export const pickUnknownDomains = (plan: AvPlan): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const slot of unknownDomainSlots(plan)) out[slot] = plan.domains[slot];
  return out;
};


export function makeAvPlan(args: {
  app: string;
  appVersion: string;
  exportedAt: string;
  venue: AvVenue;
  domains: AvPlan['domains'];
}): AvPlan {
  return {
    kind: AVPLAN_KIND,
    formatVersion: AVPLAN_VERSION,
    app: args.app,
    appVersion: args.appVersion,
    exportedAt: args.exportedAt,
    venue: args.venue,
    domains: { ...args.domains },
  };
}

export function parseAvPlan(text: string): AvPlan {
  const data = JSON.parse(text) as Partial<AvPlan>;
  if (!data || data.kind !== AVPLAN_KIND) {
    throw new Error('Keine gueltige .avplan-Datei (kind != avplan).');
  }
  if (data.formatVersion !== AVPLAN_VERSION) {
    throw new Error(`Nicht unterstuetzte .avplan-Version: ${data.formatVersion}`);
  }
  if (!data.venue || !data.domains) throw new Error('.avplan ohne venue/domains.');
  return data as AvPlan;
}

/**
 * ADR-005 — Fremde .avplan-Domaenen als Feld fuer die Projektdatei.
 *
 * Eine eigene Funktion, weil die Bedingung die eigentliche Entscheidung ist:
 * geschrieben wird nur, wenn es wirklich etwas zu bewahren gibt. Ein
 * `avForeign: {}` in jeder Datei waere Ballast — und die Behauptung, es habe
 * eine Fremd-Domaene gegeben.
 */
export function foreignDomainsField(preserved: {
  cameras?: unknown;
  cabling?: unknown;
  unknownDomains?: Record<string, unknown>;
}): {
  avForeign?: {
    cameras?: unknown;
    cabling?: unknown;
    unknownDomains?: Record<string, unknown>;
  };
} {
  // Ein leeres `unknownDomains` ist keine Aussage und gehoert nicht ins File.
  const hasUnknown = Object.keys(preserved.unknownDomains ?? {}).length > 0;
  return preserved.cameras !== undefined || preserved.cabling !== undefined || hasUnknown
    ? {
        avForeign: {
          ...(preserved.cameras !== undefined ? { cameras: preserved.cameras } : {}),
          ...(preserved.cabling !== undefined ? { cabling: preserved.cabling } : {}),
          ...(hasUnknown ? { unknownDomains: preserved.unknownDomains } : {}),
        },
      }
    : {};
}

// ───────────────────────────────────────────────────────────────────────────
// ADR-005, Regel 3 — was der .avplan-Import mit dem aktuellen Stand macht.
//
// Der Import ersetzt das offene Projekt. Traegt die Datei KEINE lighting-
// Domaene, ersetzt er es durch ein LEERES: der Nutzer oeffnet einen geteilten
// Plan aus dem Cable-Planner, um sich die Verkabelung anzusehen, und sein
// Rig ist weg. Kein Hinweis, keine Rueckfrage, kein Undo (der Import leert
// die History).
//
// „Datei oeffnen ersetzt das Dokument" ist fuer sich genommen richtig. Falsch
// war das Schweigen: `handleNew` in derselben Datei fragt seit jeher nach,
// bevor es Inhalt verwirft — der gefaehrlichere Weg fragte nicht.
//
// Als reine Funktion, weil die Entscheidung pruefbar sein muss; der
// light-planner hat kein vitest, also haengt die Pruefung an
// scripts/avplan-check.ts (laeuft in ci.yml).
// ───────────────────────────────────────────────────────────────────────────

/** Was im offenen Projekt steht und beim Import verloren ginge. */
export interface AvPlanCurrentContent {
  fixtures: number;
  trusses: number;
  scenes: number;
  walls: number;
  stageElements: number;
  shapes: number;
  ceilings: number;
  persons: number;
  hasFloorPlan: boolean;
}

export const avPlanContentCount = (c: AvPlanCurrentContent): number =>
  c.fixtures + c.trusses + c.scenes + c.walls + c.stageElements + c.shapes +
  c.ceilings + c.persons + (c.hasFloorPlan ? 1 : 0);

/**
 * Der Text, den der Nutzer VOR dem Import sehen muss — oder `null`, wenn es
 * nichts zu verlieren gibt.
 *
 * Zwei Faelle, bewusst unterschiedlich scharf:
 *  - Die Datei bringt eine lighting-Domaene mit: normales Oeffnen, das
 *    Dokument wird ersetzt. Nachfrage wie bei `handleNew`.
 *  - Die Datei bringt KEINE mit: das Ergebnis ist ein leerer Lichtplan. Das
 *    ist der Fall, den niemand erwartet, und er wird ausdruecklich benannt.
 */
export function avPlanImportWarning(
  hasLightingDomain: boolean,
  current: AvPlanCurrentContent,
): string | null {
  if (avPlanContentCount(current) === 0) return null;
  const bestand = `${current.fixtures} Lampen, ${current.trusses} Trussen, ${current.scenes} Szenen`;
  return hasLightingDomain
    ? `Diese .avplan ersetzt das offene Projekt (${bestand}). Nicht gespeicherte Aenderungen gehen verloren. Fortfahren?`
    : `Diese .avplan enthaelt KEINE Licht-Domaene. Der offene Lichtplan (${bestand}) wird durch einen leeren ersetzt. Fortfahren?`;
}
