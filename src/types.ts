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

export interface Fixture {
  id: string;
  name: string;
  manufacturer: string;
  category: FixtureCategory;
  wattage: number;
  lumens: number;
  // ── Beam geometry ──
  beamAngle: number;      // 50 % peak (degrees)
  fieldAngle: number;     // 10 % peak (degrees)
  beamShape: BeamShape;
  beamRatioWH: number;    // width / height ratio for elliptical (1.0 = circular)
  lensType: LensType;
  zoomRange?: [number, number]; // min/max beam angle if zoom
  // ── Photometric ──
  colorTemp: number;      // Kelvin (0 = RGBW variable)
  cri?: number;           // Color Rendering Index
  ipRating?: string;
  // ── Physical ──
  weight: number;         // kg
  powerConnector?: string;
  dmxChannels?: number;
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
