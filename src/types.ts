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
  // ── Barn doors (Flügeltore) – four flaps, closure 0 (open) … 1 (fully closed).
  //    Each flap cuts one side of the beam in the fixture's own frame. ──
  barnDoors?: { top: number; bottom: number; left: number; right: number };
  // ── Where the gels/diffusion physically sit ──
  //   'frame' – in the colour-frame runners at the lens (behind the doors):
  //             the barn-door cut stays crisp, but the gel sits closest to the
  //             lamp and runs hottest (shortest gel life).
  //   'front' – hung in front of the barn doors: the illuminated diffusion
  //             becomes the new, larger light source, so the cut is softened
  //             (with real frost it is largely defeated); the gel runs cooler
  //             and lasts longer. Defaults to 'frame'.
  gelPlacement?: 'frame' | 'front';
  // ── Patch / paperwork (instrument schedule, channel hookup) ──
  channel?: number;            // control / dimmer channel number
  unitNumber?: string;         // unit (instrument) number on its position
  universe?: number;           // DMX universe (1-based)
  dmxAddress?: number;         // DMX start address within the universe (1–512)
  purpose?: string;            // focus / purpose note ("Frontlicht Bühne")
  // ── Temporarily mute a single lamp without deleting it: it stops
  //    contributing to the heatmap and is drawn ghosted (still selectable). ──
  hidden?: boolean;
  // ── Focus session (Einleuchten): a per-fixture note ("Gesicht Solist, harte
  //    Kante") and a done flag, tracked live during the focus call. ──
  focusNote?: string;
  focused?: boolean;
}

// ── Scene / Look ─────────────────────────────────────────────────────
// A saved lighting state. Captures the adjustable per-fixture look (intensity,
// colour, zoom, gels, barn doors, mute) keyed by fixture id, so it can be
// recalled later. Focus/position (x, y, aim, height) belongs to the rig, not
// the look, and is intentionally not stored.
export interface SceneFixtureState {
  dimming: number;
  hidden?: boolean;
  currentColorTemp?: number;
  currentBeamAngle?: number;
  gelFilterIds?: string[];
  gelPlacement?: 'frame' | 'front';
  barnDoors?: { top: number; bottom: number; left: number; right: number };
}

export interface Scene {
  id: string;
  name: string;
  states: Record<string, SceneFixtureState>; // by fixture id
}

// ── Person on stage ──
export type PersonPose = 'standing' | 'sitting';

export interface Person {
  id: string;
  x: number;            // meters
  y: number;            // meters
  height: number;       // meters (default 1.75)
  label: string;
  pose?: PersonPose;    // standing (default) or sitting (3D photo figure)
  facing?: number;      // direction the person looks, degrees in plan (0 = +X). Default 270 (−Y / downstage)
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
  height: number;       // meters – podest height (front edge for a ramp)
  height2?: number;     // meters – height at the far (back) edge; ≠ height ⇒ ramp/slope
  rotation: number;     // degrees
  // Free polygon stage: world-space outline. When present the element is drawn
  // as this polygon (x/y/width/depth are kept as its bounding box for picking).
  points?: { x: number; y: number }[];
  label: string;
}

export interface Shape {
  id: string;
  type: 'rect' | 'line' | 'measure';
  points: { x: number; y: number }[];
  label: string;
  color: string;
}

// ── Surface materials (floor & walls) – standard, tileable texture templates
//    tinted around a chosen base colour, used by the realistic (Render) view. ──
export type FloorPresetId = 'solid' | 'parquet' | 'planks' | 'concrete' | 'tiles' | 'carpet';
export type WallPresetId = 'solid' | 'plaster' | 'woodchip' | 'concrete' | 'brick';

// The room's floor finish (global). 'color' tints the chosen template.
export interface FloorMaterial {
  preset: FloorPresetId;
  color: string; // hex
}

// ── Window / glass opening cut into a wall ──
// An opening is positioned by its distance from the wall's (x1,y1) end and its
// vertical extent above the floor. Light (fixtures and the sun) passes through
// the opening; the glass pane is drawn translucent in the 3D view. A full-wall
// opening (start 0, width = wall length, sill 0, top = wall height) makes a
// glass front ("Glasfront").
export interface WallWindow {
  id: string;
  start: number;          // distance along the wall from (x1,y1) (meters)
  width: number;          // opening width along the wall run (meters)
  sill: number;           // bottom edge height above the floor (meters)
  top: number;            // top edge height above the floor (meters)
  transmittance: number;  // 0..1 fraction of light let through (clear glass ≈ 0.9)
  tint: string;           // glass colour (hex)
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
  color: string;            // surface colour (hex) – tints the material template
  material?: WallPresetId;  // finish template (Render view); absent = 'plaster'
  // Window/glass openings cut into the wall. Absent/empty = solid wall.
  windows?: WallWindow[];
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

// ── Placeable camera (a viewpoint you can "look through" in 3D) ──
export interface CameraView {
  id: string;
  x: number;            // position on the floor plan (meters)
  y: number;
  height: number;       // eye height above floor (meters)
  aimX: number;         // look-at point on the floor (meters)
  aimY: number;
  fov: number;          // vertical field of view (degrees) – the "focal length"
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
  capacity?: number;    // safe working load (kg); absent ⇒ a conservative default
  label: string;
}

export type Tool = 'select' | 'pan' | 'rect' | 'line' | 'measure' | 'person' | 'stage' | 'stagepoly' | 'truss' | 'wall' | 'camera';
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

// ── Global sun (daylight) ──
// Drives a directional "sun" light in the 3D render and casts daylight onto the
// floor through the room's windows in the heat-map. The sun's position is
// computed from the location, date and time; `northDeg` says how the plan is
// oriented relative to true North.
export interface SunSettings {
  enabled: boolean;
  latitude: number;   // degrees (− south)
  longitude: number;  // degrees (− west)
  date: string;       // 'YYYY-MM-DD'
  time: string;       // 'HH:MM' local clock time
  northDeg: number;   // 0..360 — compass rotation of the plan ("up" = North at 0)
  intensity: number;  // direct-normal illuminance at full sun (lux)
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
  scenes?: Scene[];
  cameras?: CameraView[];
  layers?: Layers;
  floor?: FloorMaterial; // room floor finish (Render view)
  sun?: SunSettings;     // global daylight (issue #28)
  // Imported building plan incl. its calibration; the bitmap is stored as a
  // data-URL (`src`) so the live HTMLImageElement can be rebuilt on load.
  floorPlan?: Omit<FloorPlan, 'image'>;
}

export interface FixtureGroup {
  id: string;
  label: string;
  fixtureIds: string[];
}

// ── Layers (Ebenen) – per-category visibility & lock, like Photoshop/Vectorworks.
//    Visibility is visual only (hidden walls/ceilings still affect the light calc);
//    a locked layer cannot be selected or edited on the canvas. ──
export type LayerKey =
  | 'fixtures' | 'persons' | 'trusses' | 'stage' | 'shapes' | 'ceilings' | 'walls' | 'floorPlan';

export interface LayerInfo { visible: boolean; locked: boolean }
export type Layers = Record<LayerKey, LayerInfo>;
