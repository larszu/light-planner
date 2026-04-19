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
  beamAngle: number;      // 50 % peak (degrees)
  fieldAngle: number;     // 10 % peak (degrees)
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

export type Tool = 'select' | 'pan' | 'rect' | 'line' | 'measure' | 'person' | 'stage';
export type ViewMode = '2d' | '3d';

export interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number; // pixels per meter
}

export interface FloorPlan {
  image: HTMLImageElement;
  widthMeters: number;
  heightMeters: number;
}
