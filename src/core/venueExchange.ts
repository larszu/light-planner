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

/**
 * ADR-005 — Personen-Felder, die light-planner nicht modelliert.
 *
 * Lights `Person` ist eine menschliche Figur: Position, Hoehe, Pose,
 * Blickrichtung. MultiCam kennt an derselben Stelle ein allgemeines
 * Buehnen-Objekt — ein Schlagzeug, ein Rednerpult, ein Stuhl — mit `width`,
 * `objectType` und `color`.
 *
 * Light liess die drei beim Import fallen und schrieb sie beim Export nicht.
 * MultiCams Import setzt dann seine Standards ein (`objectType: 'person'`,
 * `width: 0.5`): aus einem Schlagzeug wurde nach einem Round-Trip durch light
 * eine 0,5 m breite Person. Wieder ein falscher Wert, kein fehlender.
 */
export interface ForeignPersonFields {
  width?: number;
  objectType?: string;
  color?: string;
}

export interface LightVenueInput {
  venueName?: string;
  persons: Person[];
  walls: Wall[];
  stageElements: StageElement[];
  floorPlan: LightFloorPlan | null;
  appVersion: string;
  exportedAt: string;
  /**
   * ADR-005 — Raum-Masse UND Raum-Name, die light nicht modelliert, aber
   * eingelesen hat.
   * Fehlen sie, schreibt der Export sie wie bisher nicht: light erfindet keine
   * Raumgroesse, es gibt nur zurueck, was es bekommen hat.
   */
  venueForeign?: { widthM?: number; heightM?: number; name?: string };
  /** Siehe ForeignPersonFields, je Personen-Id. */
  personForeign?: Record<string, ForeignPersonFields>;
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
      // ADR-005 — Light kennt keinen Raum-Namen: `venueName` ist sein
      // PROJEKTname. Hat es einen echten Raum-Namen eingelesen, gibt es ihn
      // unveraendert zurueck, statt ihn mit dem Projektnamen zu ueberschreiben —
      // aus „Grosse Halle" wurde sonst „Lichtplan Show A".
      name: input.venueForeign?.name || input.venueName || 'Venue',
      ...(input.venueForeign?.widthM !== undefined ? { widthM: input.venueForeign.widthM } : {}),
      ...(input.venueForeign?.heightM !== undefined ? { heightM: input.venueForeign.heightM } : {}),
      persons: input.persons.map((p) => {
        // ADR-005 — was light an dieser Person nicht modelliert, geht
        // unveraendert wieder mit hinaus.
        const f = input.personForeign?.[p.id];
        return {
          id: p.id, x: p.x, y: p.y, height: p.height, label: p.label,
          pose: p.pose, facing: p.facing,
          ...(f?.width !== undefined ? { width: f.width } : {}),
          ...(f?.objectType !== undefined ? { objectType: f.objectType } : {}),
          ...(f?.color !== undefined ? { color: f.color } : {}),
        };
      }),
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
  /** Siehe LightVenueInput.venueForeign. Leer, wenn die Datei keine Masse trug. */
  venueForeign: { widthM?: number; heightM?: number; name?: string };
  /** Siehe ForeignPersonFields. Nur Personen mit wirklich fremden Werten. */
  personForeign: Record<string, ForeignPersonFields>;
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
    // Nur aufheben, was wirklich dastand: ein Feld mit `undefined` in jeder
    // Datei waere Ballast, und der Export wuerde dann behaupten, light habe
    // eine Raumgroesse — hat es nicht.
    venueForeign: {
      ...(typeof v.widthM === 'number' ? { widthM: v.widthM } : {}),
      ...(typeof v.heightM === 'number' ? { heightM: v.heightM } : {}),
      // 'Venue' ist der Platzhalter, den beide Apps schreiben, wenn sie nichts
      // wissen — ihn aufzuheben hiesse zu behaupten, jemand habe ihn gewaehlt.
      ...(v.name && v.name !== 'Venue' ? { name: v.name } : {}),
    },
    personForeign: collectPersonForeign(v.persons ?? []),
  };
}

/** Hebt je Person auf, was light nicht modelliert. Eine Person ohne solche
 *  Werte bekommt keinen Eintrag; `objectType: 'person'` ebenfalls nicht — das
 *  ist MultiCams Standard und damit nichts, was jemand gesetzt haette. */
function collectPersonForeign(
  persons: VenueExchangePerson[],
): Record<string, ForeignPersonFields> {
  const out: Record<string, ForeignPersonFields> = {};
  for (const p of persons) {
    const f: ForeignPersonFields = {};
    if (typeof p.width === 'number') f.width = p.width;
    if (p.objectType !== undefined && p.objectType !== 'person') f.objectType = p.objectType;
    if (p.color !== undefined) f.color = p.color;
    if (Object.keys(f).length > 0) out[p.id] = f;
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Der Venue-Block wird auf seine BEDEUTUNG geprüft, nicht auf Feldnamen.
//
// BEFUND (Defektformen-Sweep, Form `vertrag-nur-feldnamen`, gemessen
// 2026-09-07). `parseVenueExchange` prüfte `kind`, `formatVersion` und dass
// ein `venue` dasteht — und gab dann `data as VenueExchange` zurück. Der Cast
// war die ganze Zusicherung. `venue: 42` kam durch (`!data.venue` ist für 42
// falsch), und `persons: [{ id: 'p1' }]` erst recht.
//
// Der Guard dazu (`scripts/venue-exchange-check.ts`) fror die Feldnamen ein
// und prüfte den Round-Trip. Über die Bedeutung eines Feldes stand nichts.
//
// Was dahinter liegt, verzeiht das nicht: `fromVenueExchange` ist sorgfältig
// bei den OPTIONALEN Feldern (`?? 0.5`, `?? ''`, `?? 270`) und vertraut den
// PFLICHT-Feldern blind — `p.x`, `p.y`, `p.height`, `w.x1`… gehen ungeprüft
// weiter. Eine Person ohne Koordinaten wird damit zu `{ x: undefined }`, und
// die Lichtrechnung rechnet ab da mit NaN: die Lux-Werte im Plan sind dann
// leer oder „—", ohne dass irgendwo stünde, warum. Eine Wand ohne
// Koordinaten zeichnet nirgends und wirft trotzdem Schatten in der Rechnung.
//
// Geprüft wird deshalb genau das, was `fromVenueExchange` ungeprüft benutzt.
// Abgelehnt wird die DATEI, nicht der Eintrag: ein Raum, aus dem
// stillschweigend eine Wand fehlt, ist schlimmer als einer, der gar nicht
// erst lädt.
//
// DIESELBE Lässigkeit steht in den Schwester-Kopien (multicam-planner
// `src/utils/venueExchange.ts`, cable-planner) und in `parseAvPlan` /
// `parseInventory`. Das Schema ändert sich hier nicht — ein strengerer Leser
// nimmt jede wohlgeformte Datei weiterhin an —, aber die anderen Leser sind
// weiterhin lax. Steht als nächster Schritt derselben Form im Backlog (B-36).
// ───────────────────────────────────────────────────────────────────────────

/** Wirft, wenn das Feld keine endliche Zahl ist. */
const zahl = (o: Record<string, unknown>, feld: string, wo: string): void => {
  if (!Number.isFinite(o[feld])) {
    throw new Error(`${wo}: Feld „${feld}" ist keine endliche Zahl.`);
  }
};

/** Wirft, wenn das Feld kein nicht-leerer Text ist. */
const text = (o: Record<string, unknown>, feld: string, wo: string): void => {
  if (typeof o[feld] !== 'string' || (o[feld] as string).trim() === '') {
    throw new Error(`${wo}: Feld „${feld}" fehlt oder ist leer.`);
  }
};

const objekt = (roh: unknown, wo: string): Record<string, unknown> => {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    throw new Error(`${wo}: kein Objekt.`);
  }
  return roh as Record<string, unknown>;
};

const liste = (roh: unknown, wo: string): unknown[] => {
  if (roh === undefined) return [];
  if (!Array.isArray(roh)) throw new Error(`${wo}: kein Array.`);
  return roh;
};

/** Parst + validiert eine Austauschdatei. Wirft bei falschem Format. */
export function parseVenueExchange(text_: string): VenueExchange {
  const data = JSON.parse(text_) as Partial<VenueExchange>;
  if (!data || data.kind !== VENUE_EXCHANGE_KIND) {
    throw new Error('Keine gültige Venue-Austauschdatei (kind != venue-exchange).');
  }
  if (data.formatVersion !== VENUE_EXCHANGE_VERSION) {
    throw new Error(`Nicht unterstützte Venue-Austausch-Version: ${data.formatVersion}`);
  }
  if (!data.venue) throw new Error('Venue-Austauschdatei ohne venue-Block.');
  pruefeVenue(data.venue);
  return data as VenueExchange;
}

/**
 * Der geteilte Raum, geprüft auf das, was `fromVenueExchange` ungeprüft
 * benutzt. Exportiert, weil `parseAvPlan` denselben Block trägt und ihn
 * bisher überhaupt nicht ansah.
 */
export function pruefeVenue(roh: unknown): void {
  const v = objekt(roh, 'venue');
  text(v, 'name', 'venue');
  for (const feld of ['widthM', 'heightM'] as const) {
    if (v[feld] !== undefined) zahl(v, feld, 'venue');
  }

  liste(v.persons, 'venue.persons').forEach((roh_, i) => {
    const wo = `venue.persons[${i}]`;
    const p = objekt(roh_, wo);
    text(p, 'id', wo);
    for (const feld of ['x', 'y', 'height'] as const) zahl(p, feld, wo);
  });

  liste(v.walls, 'venue.walls').forEach((roh_, i) => {
    const wo = `venue.walls[${i}]`;
    const w = objekt(roh_, wo);
    text(w, 'id', wo);
    for (const feld of ['x1', 'y1', 'x2', 'y2', 'height'] as const) zahl(w, feld, wo);
  });

  liste(v.stageObjects, 'venue.stageObjects').forEach((roh_, i) => {
    const wo = `venue.stageObjects[${i}]`;
    const o = objekt(roh_, wo);
    text(o, 'id', wo);
    for (const feld of ['x', 'y', 'width'] as const) zahl(o, feld, wo);
  });

  if (v.floorPlan !== undefined) {
    const fp = objekt(v.floorPlan, 'venue.floorPlan');
    text(fp, 'src', 'venue.floorPlan');
    for (const feld of ['naturalWidth', 'naturalHeight', 'widthMeters', 'heightMeters',
      'offsetX', 'offsetY', 'opacity'] as const) {
      zahl(fp, feld, 'venue.floorPlan');
    }
  }
}

/**
 * ADR-005, Regel 2 — eine Projektion darf den vollen Stand nicht ueberschreiben.
 *
 * `fromVenueExchange` liefert den geteilten Raum. Der ist fuer Existenz und
 * Geometrie kanonisch: hat eine Nachbar-App eine Wand verschoben oder geloescht,
 * gilt das. Er kann aber nur die Felder tragen, die alle drei Apps teilen —
 * `Wall.material`, `Wall.windows` und `StageElement.type` gehoeren nicht dazu.
 *
 * Ohne diese Zusammenfuehrung zerstoerte light-planner sie beim Oeffnen einer
 * .avplan, die es selbst geschrieben hatte: der eigene, vollstaendige Stand lag
 * in `domains.lighting` derselben Datei und wurde von der Projektion
 * ueberschrieben. Fenster tragen `transmittance` und `tint` und gehen in die
 * Lichtrechnung ein — das ist kein kosmetischer Verlust.
 *
 * Zusammengefuehrt wird ueber die Id. Was die Projektion nicht kennt, existiert
 * nicht mehr; was sie kennt, behaelt ihre Geometrie und bekommt die eigenen
 * Felder zurueck, sofern es sie hatte.
 */
export function mergeOwnVenueFields(
  projected: LightVenueResult,
  own: { walls?: Wall[]; stageElements?: StageElement[] },
): LightVenueResult {
  const ownWalls = new Map((own.walls ?? []).map((w) => [w.id, w]));
  const ownStages = new Map((own.stageElements ?? []).map((s) => [s.id, s]));
  return {
    ...projected,
    walls: projected.walls.map((w) => {
      const mine = ownWalls.get(w.id);
      if (!mine) return w;
      return {
        ...w,
        ...(mine.material !== undefined ? { material: mine.material } : {}),
        ...(mine.windows !== undefined ? { windows: mine.windows } : {}),
      };
    }),
    stageElements: projected.stageElements.map((s) => {
      const mine = ownStages.get(s.id);
      // `type` wird in der Projektion auf 'custom' gesetzt, weil das
      // Austauschformat die Podest-Typen nicht kennt. Der eigene Stand weiss es.
      return mine ? { ...s, type: mine.type } : s;
    }),
  };
}
