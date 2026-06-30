// ───────────────────────────────────────────────────────────────────────────
// Venue-Austauschformat (`venue-exchange` v1)
//
// Domaenen-neutrales Format fuer den Raum/das Venue (Floor-Plan, Waende,
// Stage-Objekte, Personen). Erlaubt, ein Venue in der einen App zu exportieren
// und in der anderen zu importieren — z. B. denselben Raum in MultiCam (Kameras)
// und Light (Licht) zu planen.
//
// Schema-identisch zu multicam-planner src/utils/venueExchange.ts. Reine Daten,
// keine DOM-/State-Abhaengigkeit (FloorPlan ohne das Runtime-`image`) →
// headless testbar (scripts/venue-exchange-check.ts).
// ───────────────────────────────────────────────────────────────────────────
import type { Person, Wall, StageElement, FloorPlan } from '../types';

export const VENUE_EXCHANGE_KIND = 'venue-exchange' as const;
export const VENUE_EXCHANGE_VERSION = 1 as const;

export interface VenueExchangePerson {
  id: string; x: number; y: number; height: number; label: string;
  width?: number; objectType?: string; pose?: 'standing' | 'sitting'; facing?: number; color?: string;
}
export interface VenueExchangeWall {
  id: string; x1: number; y1: number; x2: number; y2: number; height: number;
  label?: string; cx?: number; cy?: number; reflectance?: number; color?: string;
}
export interface VenueExchangeStageObject {
  id: string; x: number; y: number; width: number; height: number;
  depth?: number; height2?: number; rotation?: number; points?: { x: number; y: number }[]; label?: string;
}
export interface VenueExchangeFloorPlan {
  src: string; name?: string; naturalWidth: number; naturalHeight: number;
  widthMeters: number; heightMeters: number;
  offsetX: number; offsetY: number; opacity: number;
  locked?: boolean; kind?: 'image' | 'pdf'; pageCount?: number; pageIndex?: number;
}
export interface VenueExchange {
  kind: typeof VENUE_EXCHANGE_KIND;
  formatVersion: typeof VENUE_EXCHANGE_VERSION;
  app: string;
  appVersion: string;
  exportedAt: string;
  venue: {
    name: string;
    widthM?: number;
    heightM?: number;
    persons: VenueExchangePerson[];
    walls: VenueExchangeWall[];
    stageObjects: VenueExchangeStageObject[];
    floorPlan?: VenueExchangeFloorPlan;
  };
}

export type LightFloorPlan = Omit<FloorPlan, 'image'>;

export interface LightVenueInput {
  venueName?: string;
  persons: Person[];
  walls: Wall[];
  stageElements: StageElement[];
  floorPlan: LightFloorPlan | null;
  appVersion: string;
  exportedAt: string;
}

function fpToExchange(fp: LightFloorPlan): VenueExchangeFloorPlan {
  return {
    src: fp.src, name: fp.name,
    naturalWidth: fp.naturalWidth, naturalHeight: fp.naturalHeight,
    widthMeters: fp.widthMeters, heightMeters: fp.heightMeters,
    offsetX: fp.offsetX, offsetY: fp.offsetY, opacity: fp.opacity,
    locked: fp.locked, kind: fp.kind, pageCount: fp.pageCount, pageIndex: fp.pageIndex,
  };
}

/** Light-Venue → neutrales Austauschformat. */
export function toVenueExchange(input: LightVenueInput): VenueExchange {
  return {
    kind: VENUE_EXCHANGE_KIND,
    formatVersion: VENUE_EXCHANGE_VERSION,
    app: 'light-planner',
    appVersion: input.appVersion,
    exportedAt: input.exportedAt,
    venue: {
      name: input.venueName || 'Venue',
      persons: input.persons.map((p) => ({
        id: p.id, x: p.x, y: p.y, height: p.height, label: p.label, pose: p.pose, facing: p.facing,
      })),
      walls: input.walls.map((w) => ({
        id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, height: w.height,
        label: w.label, cx: w.cx, cy: w.cy, reflectance: w.reflectance, color: w.color,
      })),
      stageObjects: input.stageElements.map((s) => ({
        id: s.id, x: s.x, y: s.y, width: s.width, depth: s.depth,
        height: s.height, height2: s.height2, rotation: s.rotation, points: s.points, label: s.label,
      })),
      floorPlan: input.floorPlan ? fpToExchange(input.floorPlan) : undefined,
    },
  };
}

export interface LightVenueResult {
  persons: Person[];
  walls: Wall[];
  stageElements: StageElement[];
  floorPlan: LightFloorPlan | null;
}

function exchangeToFp(fp: VenueExchangeFloorPlan): LightFloorPlan {
  return {
    src: fp.src, name: fp.name ?? '',
    widthMeters: fp.widthMeters, heightMeters: fp.heightMeters,
    naturalWidth: fp.naturalWidth, naturalHeight: fp.naturalHeight,
    offsetX: fp.offsetX, offsetY: fp.offsetY, opacity: fp.opacity,
    locked: fp.locked ?? false, kind: fp.kind ?? 'image',
    pageCount: fp.pageCount, pageIndex: fp.pageIndex,
  };
}

/** Neutrales Austauschformat → Light-Venue (Fixtures/Licht-Layer bleibt unberuehrt). */
export function fromVenueExchange(ex: VenueExchange): LightVenueResult {
  const v = ex.venue;
  return {
    persons: (v.persons ?? []).map((p) => ({
      id: p.id, x: p.x, y: p.y, height: p.height, label: p.label,
      pose: p.pose ?? 'standing', facing: p.facing ?? 270,
    })),
    walls: (v.walls ?? []).map((w) => ({
      id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, height: w.height,
      label: w.label ?? '', cx: w.cx, cy: w.cy,
      reflectance: w.reflectance ?? 0.5, color: w.color ?? '#cccccc',
    })),
    stageElements: (v.stageObjects ?? []).map((s) => ({
      id: s.id, type: 'custom' as const, x: s.x, y: s.y, width: s.width,
      depth: s.depth ?? s.width, height: s.height ?? 0.2, height2: s.height2,
      rotation: s.rotation ?? 0, points: s.points, label: s.label ?? '',
    })),
    floorPlan: v.floorPlan ? exchangeToFp(v.floorPlan) : null,
  };
}

/** Parst + validiert eine Austauschdatei. Wirft bei falschem Format. */
export function parseVenueExchange(text: string): VenueExchange {
  const data = JSON.parse(text) as Partial<VenueExchange>;
  if (!data || data.kind !== VENUE_EXCHANGE_KIND) {
    throw new Error('Keine gueltige Venue-Austauschdatei (kind != venue-exchange).');
  }
  if (data.formatVersion !== VENUE_EXCHANGE_VERSION) {
    throw new Error(`Nicht unterstuetzte Venue-Austausch-Version: ${data.formatVersion}`);
  }
  if (!data.venue) throw new Error('Venue-Austauschdatei ohne venue-Block.');
  return data as VenueExchange;
}
