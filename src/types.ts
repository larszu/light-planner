// ── Fixture categories following real event-tech conventions ──
export type FixtureCategory =
  | 'profile'        // Profilscheinwerfer / Ellipsoidal (ETC Source Four, Selecon)
  | 'fresnel'        // Stufenlinsenscheinwerfer
  | 'par'            // PAR-Scheinwerfer (PAR56, PAR64)
  | 'wash'           // LED-Wash (Flächenlicht)
  | 'spot'           // LED-Spot / PC-Spot
  | 'beam'           // Beam-Effekt (Sharpy etc.)
  | 'moving-wash'    // Moving Head Wash
  | 'moving-spot'    // Moving Head Spot
  | 'moving-beam'    // Moving Head Beam / BSW
  | 'blinder'        // Blinder / Strobe
  | 'cyc'            // Horizontleuchte / Cyclorama
  | 'flood'          // Fluter / Floodlight
  | 'followspot'     // Verfolger
  | 'led-panel'      // LED-Flächenleuchte (Aputure, ARRI Skypanel)
  | 'custom';

// ── Beam shape – not all fixtures project a circle ──
export type BeamShape =
  | 'circular'       // Profile, Moving Heads, PAR mit CP62
  | 'elliptical'     // PAR64 CP61/CP60, bestimmte Wash-Linsen
  | 'linear'         // Cyc-Leuchten, LED-Bars
  | 'rectangular';   // Blinder, Fluter

// ── Lens type describes optics ──
export type LensType =
  | 'fixed'          // feste Optik
  | 'zoom'           // variabler Zoom
  | 'interchangeable' // wechselbare Linsentuben (Source Four)
  | 'fresnel'        // Fresnellinse
  | 'pc'             // Plano-Convex
  | 'reflector';     // reiner Reflektor (PAR)

// ── Mount type for attachment compatibility ──
export type MountType =
  | 'bowens'         // Bowens S-Mount (Aputure LS, Godox, etc.)
  | 'prolock-bowens' // Aputure ProLock Bowens (backward compat w/ bowens)
  | 'junior'         // 1-1/8" Junior Pin
  | 'baby'           // 5/8" Baby Pin
  | 'clamp'          // Bügelklemme / C-Clamp
  | 'yoke'           // integriertes Joch (Moving Heads)
  | 'none';          // Kein austauschbarer Ansatz

// ── Photometric reference measurement ──
export interface PhotometricData {
  lux: number;         // measured illuminance
  distance: number;    // meters at which measured
  beamAngle?: number;  // beam angle at which measured (for zoom fixtures)
  colorTemp?: number;  // CCT at which measured
}

// ── Attachment / Modifier that mounts on a fixture ──
export interface Attachment {
  id: string;
  name: string;
  type: 'fresnel' | 'softbox' | 'reflector' | 'spotlight' | 'barndoors' | 'gel-frame' | 'diffusion' | 'snoot' | 'lantern';
  mountType: MountType;
  // Overrides when attached
  beamAngleOverride?: number;
  fieldAngleOverride?: number;
  zoomRangeOverride?: [number, number];
  beamShapeOverride?: BeamShape;
  lensTypeOverride?: LensType;
  photometricOverride?: PhotometricData; // measured with attachment on reference fixture
  weightAdditional: number; // kg added
}

export interface Fixture {
  id: string;
  name: string;
  manufacturer: string;
  category: FixtureCategory;
  wattage: number;
  lumens: number;
  // ── Photometric reference (lux at specific distance) ──
  photometric?: PhotometricData;           // bare/with standard reflector
  // ── Beam geometry ──
  beamAngle: number;      // 50 % peak (degrees) – the bright core (FWHM)
  fieldAngle: number;     // 10 % peak (degrees) – the usable beam edge
  cutoffAngle?: number;   // 2.5 % peak (degrees) – where the light effectively ends
  beamShape: BeamShape;
  beamRatioWH: number;    // width / height ratio for elliptical (1.0 = circular)
  lensType: LensType;
  zoomRange?: [number, number]; // min/max beam angle if zoom
  // ── Color ──
  colorTempRange?: [number, number]; // [min, max] Kelvin for bi-color / tunable white
  colorTemp: number;      // single CCT for fixed, 0 = full RGBW
  cri?: number;           // Color Rendering Index
  tlci?: number;          // Television Lighting Consistency Index
  // ── Physical ──
  weight: number;         // kg
  mountType: MountType;
  ipRating?: string;
  powerConnector?: string;
  dmxChannels?: number;
  // ── Attachments ──
  compatibleAttachments?: Attachment[];
}

export interface PlacedFixture {
  id: string;
  fixture: Fixture;
  x: number;              // plan position meters
  y: number;
  mountingHeight: number; // meters above floor
  // ── Aim / Direction ──
  aimX: number;           // target on floor meters
  aimY: number;
  bodyRotation: number;   // housing rotation in degrees – controls elliptical beam orientation
  // ── Intensity ──
  dimming: number;        // 0–100 %
  currentBeamAngle?: number; // zoom override
  // ── Active modifier ──
  activeAttachmentId?: string; // id of currently mounted attachment
  // ── Color temperature setting ──
  currentColorTemp?: number;   // current CCT for tunable fixtures
  // ── Gel filters ──
  gelFilterIds?: string[];     // ids of mounted gel filters (from gelLibrary)
  // ── Patch / paperwork (instrument schedule, channel hookup) ──
  channel?: number;            // control / dimmer channel number
  unitNumber?: string;         // unit (instrument) number on its position
  universe?: number;           // DMX universe (1-based)
  dmxAddress?: number;         // DMX start address within the universe (1–512)
  purpose?: string;            // focus / purpose note ("Frontlicht Bühne")
}

// ── Person on stage ──
export interface Person {
  id: string;
  x: number;            // meters
  y: number;            // meters
  height: number;       // meters (default 1.75)
  label: string;
}

// ── Stage elements (Podeste) ──
export type StageElementType = 'podest-1x1' | 'podest-2x1' | 'custom';

export interface StageElement {
  id: string;
  type: StageElementType;
  x: number;            // meters (top-left corner)
  y: number;
  width: number;        // meters
  depth: number;        // meters
  height: number;       // meters (podest height, e.g. 0.2, 0.4, 0.6, 0.8, 1.0)
  rotation: number;     // degrees
  label: string;
}

export interface Shape {
  id: string;
  type: 'rect' | 'line' | 'measure';
  points: { x: number; y: number }[];
  label: string;
  color: string;
}

// ── Wall (architecture) – reflects light back into the room ──
export interface Wall {
  id: string;
  x1: number; y1: number;   // endpoints on the floor (meters)
  x2: number; y2: number;
  // Optional quadratic-Bézier control point → curved wall. Absent = straight.
  cx?: number; cy?: number;
  height: number;           // wall height (meters)
  reflectance: number;      // 0..1 diffuse reflectance (Reflexionsgrad)
  color: string;            // surface colour (hex)
  label: string;
}

// ── Ceiling – a horizontal surface at a height that bounces light down ──
export interface Ceiling {
  id: string;
  points: { x: number; y: number }[]; // polygon outline (meters)
  height: number;           // height above the floor (meters)
  reflectance: number;      // 0..1 diffuse reflectance
  color: string;
  label: string;
}

// ── Truss / hanging position (rigging) ──
export interface Truss {
  id: string;
  x1: number;           // start point (meters)
  y1: number;
  x2: number;           // end point (meters)
  y2: number;
  height: number;       // trim height above floor (meters)
  label: string;
}

export type Tool = 'select' | 'pan' | 'rect' | 'line' | 'measure' | 'person' | 'stage' | 'truss' | 'wall';
export type ViewMode = '2d' | '3d';

export interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number; // pixels per meter
}

export interface FloorPlan {
  image: HTMLImageElement;
  src: string;             // data-URL of the rendered bitmap (for persistence / re-render)
  name: string;            // source file name
  widthMeters: number;     // real-world width the bitmap represents
  heightMeters: number;    // derived from width × aspect ratio
  naturalWidth: number;    // bitmap pixel width
  naturalHeight: number;   // bitmap pixel height
  offsetX: number;         // world position of the top-left corner (m)
  offsetY: number;
  opacity: number;         // 0..1
  locked: boolean;         // ignore pointer interaction when true
  // ── PDF source (optional) ──
  kind: 'image' | 'pdf';
  pageCount?: number;      // total pages for a PDF source
  pageIndex?: number;      // 0-based page currently shown
}

// ── Gel Filters (CTO, CTB, Frost) ──
export type GelType = 'CTO' | 'CTB' | 'frost' | 'diffusion' | 'color';

export interface GelFilter {
  id: string;
  name: string;
  brand: 'LEE' | 'Rosco';
  code: string;
  type: GelType;
  transmissionFactor: number;
  miredShift?: number;
  diffusionLevel?: number;
}

// ── Project save/load ──
export interface ProjectMeta {
  name: string;
  author: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface ProjectData {
  meta: ProjectMeta;
  fixtures: PlacedFixture[];
  shapes: Shape[];
  persons: Person[];
  stageElements: StageElement[];
  customFixtures: Fixture[];
  fixtureGroups?: FixtureGroup[];
  trusses?: Truss[];
  walls?: Wall[];
  ceilings?: Ceiling[];
  // Imported building plan incl. its calibration; the bitmap is stored as a
  // data-URL (`src`) so the live HTMLImageElement can be rebuilt on load.
  floorPlan?: Omit<FloorPlan, 'image'>;
}

export interface FixtureGroup {
  id: string;
  label: string;
  fixtureIds: string[];
}
