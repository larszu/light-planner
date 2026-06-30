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
  /** Pro Domaene das volle native Projekt der jeweiligen App. Fremde Slots
   *  werden von einer App nie interpretiert, nur unveraendert durchgereicht. */
  domains: {
    cameras?: unknown;
    lighting?: unknown;
    cabling?: unknown;
  };
}

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
