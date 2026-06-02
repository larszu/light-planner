import type { Fixture, Attachment } from '../types';

// ═══════════════════════════════════════════════════════════
// ATTACHMENTS (reusable modifiers, referenced by fixtures)
// ═══════════════════════════════════════════════════════════

export const attachmentLibrary: Attachment[] = [
  // ── Aputure Bowens-Mount Attachments ──
  {
    id: 'aputure-f10-fresnel',
    name: 'Aputure F10 Fresnel',
    type: 'fresnel',
    mountType: 'bowens',
    beamAngleOverride: 15,
    fieldAngleOverride: 45,
    zoomRangeOverride: [15, 45],
    lensTypeOverride: 'fresnel',
    // Measured with LS 600x Pro at 5600K spot 15°: 137,000 lux @ 1m
    photometricOverride: { lux: 137000, distance: 1, beamAngle: 15, colorTemp: 5600 },
    weightAdditional: 3.85,
  },
  {
    id: 'aputure-hyper-reflector',
    name: 'Aputure Hyper-Reflektor',
    type: 'reflector',
    mountType: 'bowens',
    beamAngleOverride: 55,
    fieldAngleOverride: 80,
    // Measured with LS 600x Pro at 5600K: 16,060 lux @ 1m
    photometricOverride: { lux: 16060, distance: 1, beamAngle: 55, colorTemp: 5600 },
    weightAdditional: 0.5,
  },
  {
    id: 'aputure-light-dome-iii',
    name: 'Aputure Light Dome III',
    type: 'softbox',
    mountType: 'bowens',
    beamAngleOverride: 120,
    fieldAngleOverride: 160,
    beamShapeOverride: 'circular',
    weightAdditional: 2.4,
  },
  {
    id: 'aputure-lantern-90',
    name: 'Aputure Lantern 90',
    type: 'lantern',
    mountType: 'bowens',
    beamAngleOverride: 270,
    fieldAngleOverride: 330,
    beamShapeOverride: 'circular',
    weightAdditional: 0.7,
  },
  {
    id: 'aputure-spotlight-mount',
    name: 'Aputure Spotlight Mount',
    type: 'spotlight',
    mountType: 'bowens',
    beamAngleOverride: 19,
    fieldAngleOverride: 30,
    lensTypeOverride: 'interchangeable',
    beamShapeOverride: 'circular',
    weightAdditional: 4.2,
  },
  {
    id: 'generic-barndoors-bowens',
    name: 'Torblende (Bowens)',
    type: 'barndoors',
    mountType: 'bowens',
    weightAdditional: 0.8,
  },
  {
    id: 'generic-snoot-bowens',
    name: 'Snoot (Bowens)',
    type: 'snoot',
    mountType: 'bowens',
    beamAngleOverride: 10,
    fieldAngleOverride: 18,
    weightAdditional: 0.4,
  },
];

// Helper: get attachments by mount type
export function getAttachmentsForMount(mountType: string): Attachment[] {
  return attachmentLibrary.filter((a) => a.mountType === mountType);
}

export const fixtureLibrary: Fixture[] = [
  // ═══════════════════════════════════════════════════════════
  // PROFILSCHEINWERFER (Ellipsoidal / Profile)
  // Scharfkantige Projektionen, Torblenden, Gobos möglich
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-s4-19', name: 'Source Four 19°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 19, fieldAngle: 30,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 3200, cri: 100, weight: 7.7, mountType: 'clamp',
    photometric: { lux: 49300, distance: 1, beamAngle: 19, colorTemp: 3200 },
    powerConnector: 'Stage Pin / Schuko', dmxChannels: 0,
  },
  {
    id: 'etc-s4-26', name: 'Source Four 26°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 26, fieldAngle: 38,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 3200, cri: 100, weight: 7.5, mountType: 'clamp',
    photometric: { lux: 26000, distance: 1, beamAngle: 26, colorTemp: 3200 },
  },
  {
    id: 'etc-s4-36', name: 'Source Four 36°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 36, fieldAngle: 52,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 3200, cri: 100, weight: 7.3, mountType: 'clamp',
    photometric: { lux: 13700, distance: 1, beamAngle: 36, colorTemp: 3200 },
  },
  {
    id: 'etc-s4-50', name: 'Source Four 50°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 50, fieldAngle: 70,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 3200, cri: 100, weight: 7.1, mountType: 'clamp',
    photometric: { lux: 7100, distance: 1, beamAngle: 50, colorTemp: 3200 },
  },
  {
    id: 'etc-s4-zoom-15-30', name: 'Source Four Zoom 15–30°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 22, fieldAngle: 35,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [15, 30],
    colorTemp: 3200, cri: 100, weight: 8.6, mountType: 'clamp',
    photometric: { lux: 26000, distance: 1, beamAngle: 22, colorTemp: 3200 },
  },
  {
    id: 'etc-s4-zoom-25-50', name: 'Source Four Zoom 25–50°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 37, fieldAngle: 55,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [25, 50],
    colorTemp: 3200, cri: 100, weight: 8.6, mountType: 'clamp',
    photometric: { lux: 13700, distance: 1, beamAngle: 37, colorTemp: 3200 },
  },
  {
    id: 'etc-s4led-s3', name: 'Source Four LED S3', manufacturer: 'ETC', category: 'profile',
    wattage: 150, lumens: 11000, beamAngle: 26, fieldAngle: 38,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 95, weight: 8.4, mountType: 'clamp',
    photometric: { lux: 16000, distance: 1, beamAngle: 26, colorTemp: 5600 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 5,
  },
  {
    id: 'robert-juliat-714', name: '714SX2 Suiveur 2,5kW', manufacturer: 'Robert Juliat', category: 'profile',
    wattage: 2500, lumens: 68000, beamAngle: 8, fieldAngle: 16,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [8, 16],
    colorTemp: 3200, weight: 23, mountType: 'yoke',
  },

  // ═══════════════════════════════════════════════════════════
  // STUFENLINSEN (Fresnel)
  // Weicher Rand, stufenlose Fokussierung, Washlicht
  // ═══════════════════════════════════════════════════════════
  {
    id: 'fresnel-1kw', name: '1 kW Fresnel', manufacturer: 'Generic', category: 'fresnel',
    wattage: 1000, lumens: 20000, beamAngle: 15, fieldAngle: 55,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [15, 55],
    colorTemp: 3200, weight: 5.5, mountType: 'clamp',
  },
  {
    id: 'fresnel-2kw', name: '2 kW Fresnel', manufacturer: 'Generic', category: 'fresnel',
    wattage: 2000, lumens: 44000, beamAngle: 12, fieldAngle: 60,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [12, 60],
    colorTemp: 3200, weight: 10.2, mountType: 'clamp',
  },
  {
    id: 'etc-cs-fresnel', name: 'ColorSource Fresnel', manufacturer: 'ETC', category: 'fresnel',
    wattage: 125, lumens: 3250, beamAngle: 15, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [15, 50],
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 92, weight: 5.2, mountType: 'clamp',
    dmxChannels: 5,
  },

  // ═══════════════════════════════════════════════════════════
  // PAR-SCHEINWERFER
  // CP62=NSP (kreisrund), CP61=MFL (elliptisch!), CP60=WFL (elliptisch!)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'par64-cp62-nsp', name: 'PAR64 CP62 (NSP)', manufacturer: 'Generic', category: 'par',
    wattage: 1000, lumens: 33000, beamAngle: 12, fieldAngle: 24,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'reflector',
    colorTemp: 3200, weight: 3.5, mountType: 'clamp',
  },
  {
    id: 'par64-cp61-mfl', name: 'PAR64 CP61 (MFL)', manufacturer: 'Generic', category: 'par',
    wattage: 1000, lumens: 33000, beamAngle: 21, fieldAngle: 28,
    beamShape: 'elliptical', beamRatioWH: 2.0, lensType: 'reflector',
    colorTemp: 3200, weight: 3.5, mountType: 'clamp',
  },
  {
    id: 'par64-cp60-wfl', name: 'PAR64 CP60 (WFL)', manufacturer: 'Generic', category: 'par',
    wattage: 1000, lumens: 33000, beamAngle: 48, fieldAngle: 70,
    beamShape: 'elliptical', beamRatioWH: 1.7, lensType: 'reflector',
    colorTemp: 3200, weight: 3.5, mountType: 'clamp',
  },
  {
    id: 'par56-mfl', name: 'PAR56 MFL 300W', manufacturer: 'Generic', category: 'par',
    wattage: 300, lumens: 6600, beamAngle: 20, fieldAngle: 40,
    beamShape: 'elliptical', beamRatioWH: 1.8, lensType: 'reflector',
    colorTemp: 3200, weight: 1.5, mountType: 'clamp',
  },

  // ═══════════════════════════════════════════════════════════
  // LED WASH / FLÄCHENLEUCHTEN
  // ═══════════════════════════════════════════════════════════
  {
    id: 'adj-mega-hex-par', name: 'Mega HEX Par', manufacturer: 'ADJ', category: 'wash',
    wattage: 60, lumens: 680, beamAngle: 25, fieldAngle: 40,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, weight: 1.4, mountType: 'clamp', dmxChannels: 12,
  },
  {
    id: 'chauvet-colordash-h18ip', name: 'COLORdash Par H18IP', manufacturer: 'Chauvet Professional', category: 'wash',
    wattage: 180, lumens: 2500, beamAngle: 22, fieldAngle: 38,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, ipRating: 'IP65', weight: 4.8, mountType: 'clamp', dmxChannels: 14,
  },
  {
    id: 'elation-sixpar-300', name: 'SixPar 300', manufacturer: 'Elation', category: 'wash',
    wattage: 168, lumens: 4200, beamAngle: 22, fieldAngle: 40,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, weight: 4.2, mountType: 'clamp', dmxChannels: 10,
  },
  {
    id: 'generic-led-par-54x3', name: 'LED PAR 54×3 W RGBW', manufacturer: 'Generic', category: 'wash',
    wattage: 162, lumens: 3200, beamAngle: 25, fieldAngle: 45,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, weight: 2.8, mountType: 'clamp', dmxChannels: 8,
  },
  {
    id: 'etc-cs-par', name: 'ColorSource PAR', manufacturer: 'ETC', category: 'wash',
    wattage: 125, lumens: 3250, beamAngle: 25, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 92, weight: 3.1, mountType: 'clamp', dmxChannels: 5,
  },

  // ═══════════════════════════════════════════════════════════
  // LED SPOT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-cs-spot', name: 'ColorSource Spot', manufacturer: 'ETC', category: 'spot',
    wattage: 125, lumens: 3250, beamAngle: 25, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [19, 36],
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 92, weight: 5.2, mountType: 'clamp', dmxChannels: 6,
  },

  // ═══════════════════════════════════════════════════════════
  // BEAM-EFFEKTLEUCHTEN
  // ═══════════════════════════════════════════════════════════
  {
    id: 'claypaky-sharpy', name: 'Sharpy', manufacturer: 'Clay Paky', category: 'beam',
    wattage: 189, lumens: 7500, beamAngle: 3.8, fieldAngle: 6,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 6000, weight: 16, mountType: 'yoke', dmxChannels: 16,
  },

  // ═══════════════════════════════════════════════════════════
  // MOVING HEAD WASH
  // ═══════════════════════════════════════════════════════════
  {
    id: 'martin-mac-aura-xb', name: 'MAC Aura XB', manufacturer: 'Martin / Harman', category: 'moving-wash',
    wattage: 270, lumens: 11800, beamAngle: 11, fieldAngle: 58,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [11, 58],
    colorTemp: 0, weight: 6.6, mountType: 'yoke', dmxChannels: 23,
  },
  {
    id: 'robe-robin-600-ledwash', name: 'Robin 600 LEDWash', manufacturer: 'Robe', category: 'moving-wash',
    wattage: 270, lumens: 9500, beamAngle: 15, fieldAngle: 60,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [15, 60],
    colorTemp: 0, weight: 9.7, mountType: 'yoke', dmxChannels: 18,
  },
  {
    id: 'chauvet-rogue-r2-wash', name: 'Rogue R2 Wash', manufacturer: 'Chauvet Professional', category: 'moving-wash',
    wattage: 270, lumens: 8200, beamAngle: 12, fieldAngle: 49,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [12, 49],
    colorTemp: 0, weight: 10.1, mountType: 'yoke', dmxChannels: 21,
  },

  // ═══════════════════════════════════════════════════════════
  // MOVING HEAD SPOT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'martin-mac-viper-profile', name: 'MAC Viper Profile', manufacturer: 'Martin / Harman', category: 'moving-spot',
    wattage: 1000, lumens: 33000, beamAngle: 10, fieldAngle: 44,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [10, 44],
    colorTemp: 6000, weight: 30.5, mountType: 'yoke', dmxChannels: 26,
  },
  {
    id: 'robe-robin-t1-profile', name: 'Robin T1 Profile', manufacturer: 'Robe', category: 'moving-spot',
    wattage: 468, lumens: 20000, beamAngle: 5, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [5, 50],
    colorTemp: 0, weight: 22, mountType: 'yoke', dmxChannels: 35,
  },
  {
    id: 'chauvet-maverick-mk3-profile', name: 'Maverick MK3 Profile', manufacturer: 'Chauvet Professional', category: 'moving-spot',
    wattage: 820, lumens: 51000, beamAngle: 6, fieldAngle: 46,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [6, 46],
    colorTemp: 7500, weight: 35.3, mountType: 'yoke', dmxChannels: 38,
  },

  // ═══════════════════════════════════════════════════════════
  // MOVING HEAD BEAM / BSW (Beam Spot Wash Hybrid)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'robe-robin-megapointe', name: 'Robin MegaPointe', manufacturer: 'Robe', category: 'moving-beam',
    wattage: 470, lumens: 23000, beamAngle: 3, fieldAngle: 45,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [3, 45],
    colorTemp: 6500, weight: 21.5, mountType: 'yoke', dmxChannels: 30,
  },
  {
    id: 'claypaky-mythos2', name: 'Mythos 2', manufacturer: 'Clay Paky', category: 'moving-beam',
    wattage: 470, lumens: 23000, beamAngle: 4, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [4, 50],
    colorTemp: 6000, weight: 26, mountType: 'yoke', dmxChannels: 26,
  },

  // ═══════════════════════════════════════════════════════════
  // BLINDER / STROBE
  // ═══════════════════════════════════════════════════════════
  {
    id: 'molefay-4lite', name: 'Molefay 4-Lite', manufacturer: 'Mole-Richardson', category: 'blinder',
    wattage: 2600, lumens: 65000, beamAngle: 90, fieldAngle: 120,
    beamShape: 'rectangular', beamRatioWH: 2.0, lensType: 'reflector',
    colorTemp: 3200, weight: 6.8, mountType: 'baby',
  },
  {
    id: 'martin-atomic-3000', name: 'Atomic 3000 DMX', manufacturer: 'Martin / Harman', category: 'blinder',
    wattage: 3000, lumens: 200000, beamAngle: 120, fieldAngle: 160,
    beamShape: 'rectangular', beamRatioWH: 1.5, lensType: 'reflector',
    colorTemp: 5600, weight: 7.2, mountType: 'clamp', dmxChannels: 4,
  },

  // ═══════════════════════════════════════════════════════════
  // CYC / HORIZONTLEUCHTEN
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-cs-cyc', name: 'ColorSource CYC', manufacturer: 'ETC', category: 'cyc',
    wattage: 165, lumens: 5000, beamAngle: 115, fieldAngle: 145,
    beamShape: 'linear', beamRatioWH: 4.0, lensType: 'fixed',
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 92, weight: 6.8, mountType: 'clamp', dmxChannels: 6,
  },
  {
    id: 'arri-cyc-1250', name: 'CYC 1250', manufacturer: 'ARRI', category: 'cyc',
    wattage: 1250, lumens: 28000, beamAngle: 130, fieldAngle: 160,
    beamShape: 'linear', beamRatioWH: 5.0, lensType: 'reflector',
    colorTemp: 3200, weight: 7.4, mountType: 'clamp',
  },

  // ═══════════════════════════════════════════════════════════
  // FLUTER / FLOODLIGHT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-desire-d22', name: 'Desire D22', manufacturer: 'ETC', category: 'flood',
    wattage: 50, lumens: 1800, beamAngle: 24, fieldAngle: 42,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, cri: 95, weight: 2.9, mountType: 'clamp', dmxChannels: 5,
  },
  {
    id: 'etc-desire-d40', name: 'Desire D40', manufacturer: 'ETC', category: 'flood',
    wattage: 100, lumens: 3600, beamAngle: 24, fieldAngle: 42,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, cri: 95, weight: 4.1, mountType: 'clamp', dmxChannels: 5,
  },
  {
    id: 'philips-colorblast-12', name: 'ColorBlast 12', manufacturer: 'Philips / ColorKinetics', category: 'flood',
    wattage: 48, lumens: 1200, beamAngle: 10, fieldAngle: 30,
    beamShape: 'rectangular', beamRatioWH: 1.3, lensType: 'fixed',
    colorTemp: 0, weight: 3.0, mountType: 'clamp',
  },

  // ═══════════════════════════════════════════════════════════
  // VERFOLGER (Followspot)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'robert-juliat-cyrano', name: 'Cyrano 2500W', manufacturer: 'Robert Juliat', category: 'followspot',
    wattage: 2500, lumens: 68000, beamAngle: 7, fieldAngle: 14,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 14],
    colorTemp: 6000, weight: 23, mountType: 'yoke',
  },

  // ═══════════════════════════════════════════════════════════
  // LED PANELS / FLÄCHENLEUCHTEN MIT BOWENS-MOUNT
  // Professionelle LED-Scheinwerfer für Film & Bühne
  // ═══════════════════════════════════════════════════════════
  {
    id: 'aputure-ls-600x-pro', name: 'LS 600x Pro', manufacturer: 'Aputure', category: 'led-panel',
    wattage: 600, lumens: 36000, beamAngle: 55, fieldAngle: 80,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'reflector',
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 96, tlci: 98,
    weight: 5.16, mountType: 'bowens',
    // Measured bare (with Hyper Reflector) at 5600K: 16,060 lux @ 1m
    photometric: { lux: 16060, distance: 1, beamAngle: 55, colorTemp: 5600 },
    powerConnector: 'Neutrik TRUE1', dmxChannels: 8,
    compatibleAttachments: [
      attachmentLibrary.find((a) => a.id === 'aputure-f10-fresnel')!,
      attachmentLibrary.find((a) => a.id === 'aputure-hyper-reflector')!,
      attachmentLibrary.find((a) => a.id === 'aputure-light-dome-iii')!,
      attachmentLibrary.find((a) => a.id === 'aputure-lantern-90')!,
      attachmentLibrary.find((a) => a.id === 'aputure-spotlight-mount')!,
      attachmentLibrary.find((a) => a.id === 'generic-barndoors-bowens')!,
      attachmentLibrary.find((a) => a.id === 'generic-snoot-bowens')!,
    ],
  },
  {
    id: 'aputure-ls-300x-ii', name: 'LS 300x II', manufacturer: 'Aputure', category: 'led-panel',
    wattage: 350, lumens: 18000, beamAngle: 55, fieldAngle: 80,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'reflector',
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 96, tlci: 97,
    weight: 3.45, mountType: 'bowens',
    photometric: { lux: 8050, distance: 1, beamAngle: 55, colorTemp: 5600 },
    powerConnector: 'Neutrik TRUE1', dmxChannels: 4,
    compatibleAttachments: [
      attachmentLibrary.find((a) => a.id === 'aputure-f10-fresnel')!,
      attachmentLibrary.find((a) => a.id === 'aputure-hyper-reflector')!,
      attachmentLibrary.find((a) => a.id === 'aputure-light-dome-iii')!,
      attachmentLibrary.find((a) => a.id === 'aputure-lantern-90')!,
      attachmentLibrary.find((a) => a.id === 'aputure-spotlight-mount')!,
      attachmentLibrary.find((a) => a.id === 'generic-barndoors-bowens')!,
      attachmentLibrary.find((a) => a.id === 'generic-snoot-bowens')!,
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // ELATION – aktuelle LED-Serie (KL / Fuze)
  // Werte aus den Hersteller-Datenblättern (Stand 2024/25);
  // Illuminance teils auf 1 m Referenzabstand normiert / geschätzt.
  // ═══════════════════════════════════════════════════════════
  {
    // Values from the Elation KL Fresnel 8 FC photometric test report (3/29/2021).
    // Zoom (beam 50%): 10.4° (spot) … 50.8° (flood); field 10%: 20.6°…66.1°;
    // cutoff 2.5%: 29.2°…88.2°. Peak 158,552 cd @ spot, 25,590 cd @ flood.
    // Max output 16,505 lm / 560 W (flood). CRI 90.3–94.5, TLCI up to 94.
    id: 'elation-kl-fresnel-8-fc', name: 'KL Fresnel 8 FC', manufacturer: 'Elation', category: 'fresnel',
    wattage: 560, lumens: 16505, beamAngle: 10.4, fieldAngle: 20.6, cutoffAngle: 29.2,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [10.4, 50.8],
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 92, tlci: 94, weight: 10.5, mountType: 'clamp',
    photometric: { lux: 158522, distance: 1, beamAngle: 10.4, colorTemp: 6500 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 18,
  },
  {
    id: 'elation-kl-fresnel-6-fc', name: 'KL Fresnel 6 FC', manufacturer: 'Elation', category: 'fresnel',
    wattage: 220, lumens: 9000, beamAngle: 12, fieldAngle: 18,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [12, 60],
    colorTemp: 0, colorTempRange: [2000, 10000], cri: 95, tlci: 94, weight: 7.0, mountType: 'clamp',
    photometric: { lux: 7000, distance: 3, beamAngle: 12, colorTemp: 5600 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 18,
  },
  {
    id: 'elation-kl-panel-fc', name: 'KL Panel FC', manufacturer: 'Elation', category: 'led-panel',
    wattage: 295, lumens: 16000, beamAngle: 64, fieldAngle: 90,
    beamShape: 'rectangular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, colorTempRange: [2000, 10000], cri: 95, tlci: 92, weight: 13.0, mountType: 'clamp',
    photometric: { lux: 13000, distance: 1, beamAngle: 64, colorTemp: 5600 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 16,
  },
  {
    id: 'elation-kl-profile-fc', name: 'KL Profile FC', manufacturer: 'Elation', category: 'profile',
    wattage: 305, lumens: 10600, beamAngle: 6, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [6, 50],
    colorTemp: 0, colorTempRange: [2400, 8500], cri: 94, tlci: 92, weight: 9.5, mountType: 'clamp',
    photometric: { lux: 15517, distance: 1, beamAngle: 50, colorTemp: 6500 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 24,
  },
  {
    id: 'elation-kl-par-fc', name: 'KL PAR FC', manufacturer: 'Elation', category: 'par',
    wattage: 280, lumens: 11000, beamAngle: 11, fieldAngle: 16,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 0, colorTempRange: [1750, 10000], cri: 93, tlci: 95, weight: 7.7, mountType: 'clamp',
    photometric: { lux: 11520, distance: 5, beamAngle: 11, colorTemp: 6000 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 16,
  },
  {
    id: 'elation-fuze-wash-z350', name: 'Fuze Wash Z350', manufacturer: 'Elation', category: 'moving-wash',
    wattage: 399, lumens: 13000, beamAngle: 6, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [6, 46],
    colorTemp: 0, colorTempRange: [2700, 8000], cri: 80, weight: 20.4, mountType: 'yoke',
    photometric: { lux: 60280, distance: 2, beamAngle: 6, colorTemp: 7000 },
    powerConnector: 'powerCON TRUE1', ipRating: '30', dmxChannels: 28,
  },
  {
    id: 'elation-fuze-par-z120', name: 'Fuze Par Z120 IP', manufacturer: 'Elation', category: 'moving-wash',
    wattage: 157, lumens: 4500, beamAngle: 7, fieldAngle: 12,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 55],
    colorTemp: 0, colorTempRange: [2700, 8000], cri: 80, weight: 10.0, mountType: 'yoke',
    photometric: { lux: 10640, distance: 3, beamAngle: 7, colorTemp: 7000 },
    powerConnector: 'powerCON TRUE1', ipRating: '65', dmxChannels: 20,
  },
];
