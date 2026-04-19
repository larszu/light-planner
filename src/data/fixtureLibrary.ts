import type { Fixture } from '../types';

export const fixtureLibrary: Fixture[] = [
  // ═══════════════════════════════════════════════════════════
  // PROFILSCHEINWERFER (Ellipsoidal / Profile)
  // Scharfkantige Projektionen, Torblenden, Gobos möglich
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-s4-19', name: 'Source Four 19°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 19, fieldAngle: 30,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable', colorTemp: 3200, cri: 100, weight: 7.7,
    powerConnector: 'Stage Pin / Schuko', dmxChannels: 0,
  },
  {
    id: 'etc-s4-26', name: 'Source Four 26°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 26, fieldAngle: 38,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable', colorTemp: 3200, cri: 100, weight: 7.5,
  },
  {
    id: 'etc-s4-36', name: 'Source Four 36°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 36, fieldAngle: 52,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable', colorTemp: 3200, cri: 100, weight: 7.3,
  },
  {
    id: 'etc-s4-50', name: 'Source Four 50°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 50, fieldAngle: 70,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable', colorTemp: 3200, cri: 100, weight: 7.1,
  },
  {
    id: 'etc-s4-zoom-15-30', name: 'Source Four Zoom 15–30°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 22, fieldAngle: 35,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [15, 30], colorTemp: 3200, cri: 100, weight: 8.6,
  },
  {
    id: 'etc-s4-zoom-25-50', name: 'Source Four Zoom 25–50°', manufacturer: 'ETC', category: 'profile',
    wattage: 750, lumens: 17800, beamAngle: 37, fieldAngle: 55,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [25, 50], colorTemp: 3200, cri: 100, weight: 8.6,
  },
  {
    id: 'etc-s4led-s3', name: 'Source Four LED S3', manufacturer: 'ETC', category: 'profile',
    wattage: 150, lumens: 11000, beamAngle: 26, fieldAngle: 38,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable', colorTemp: 0, cri: 95, weight: 8.4,
    powerConnector: 'powerCON TRUE1', dmxChannels: 5,
  },
  {
    id: 'robert-juliat-714', name: '714SX2 Suiveur 2,5kW', manufacturer: 'Robert Juliat', category: 'profile',
    wattage: 2500, lumens: 68000, beamAngle: 8, fieldAngle: 16,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [8, 16], colorTemp: 3200, weight: 23,
  },

  // ═══════════════════════════════════════════════════════════
  // STUFENLINSEN (Fresnel)
  // Weicher Rand, stufenlose Fokussierung, Washlicht
  // ═══════════════════════════════════════════════════════════
  {
    id: 'fresnel-1kw', name: '1 kW Fresnel', manufacturer: 'Generic', category: 'fresnel',
    wattage: 1000, lumens: 20000, beamAngle: 15, fieldAngle: 55,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [15, 55], colorTemp: 3200, weight: 5.5,
  },
  {
    id: 'fresnel-2kw', name: '2 kW Fresnel', manufacturer: 'Generic', category: 'fresnel',
    wattage: 2000, lumens: 44000, beamAngle: 12, fieldAngle: 60,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [12, 60], colorTemp: 3200, weight: 10.2,
  },
  {
    id: 'etc-cs-fresnel', name: 'ColorSource Fresnel', manufacturer: 'ETC', category: 'fresnel',
    wattage: 125, lumens: 3250, beamAngle: 15, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [15, 50], colorTemp: 0, cri: 92, weight: 5.2,
    dmxChannels: 5,
  },

  // ═══════════════════════════════════════════════════════════
  // PAR-SCHEINWERFER
  // Reflektorbasiert, verschiedene Lampeneinsätze → versch. Streuwinkel
  // CP62=NSP (kreisrund), CP61=MFL (elliptisch!), CP60=WFL (elliptisch!)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'par64-cp62-nsp', name: 'PAR64 CP62 (NSP)', manufacturer: 'Generic', category: 'par',
    wattage: 1000, lumens: 33000, beamAngle: 12, fieldAngle: 24,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'reflector', colorTemp: 3200, weight: 3.5,
  },
  {
    id: 'par64-cp61-mfl', name: 'PAR64 CP61 (MFL)', manufacturer: 'Generic', category: 'par',
    wattage: 1000, lumens: 33000, beamAngle: 21, fieldAngle: 28,
    beamShape: 'elliptical', beamRatioWH: 2.0, lensType: 'reflector', colorTemp: 3200, weight: 3.5,
  },
  {
    id: 'par64-cp60-wfl', name: 'PAR64 CP60 (WFL)', manufacturer: 'Generic', category: 'par',
    wattage: 1000, lumens: 33000, beamAngle: 48, fieldAngle: 70,
    beamShape: 'elliptical', beamRatioWH: 1.7, lensType: 'reflector', colorTemp: 3200, weight: 3.5,
  },
  {
    id: 'par56-mfl', name: 'PAR56 MFL 300W', manufacturer: 'Generic', category: 'par',
    wattage: 300, lumens: 6600, beamAngle: 20, fieldAngle: 40,
    beamShape: 'elliptical', beamRatioWH: 1.8, lensType: 'reflector', colorTemp: 3200, weight: 1.5,
  },

  // ═══════════════════════════════════════════════════════════
  // LED WASH / FLÄCHENLEUCHTEN
  // Gleichmäßige Farbflächen, additive Farbmischung
  // ═══════════════════════════════════════════════════════════
  {
    id: 'adj-mega-hex-par', name: 'Mega HEX Par', manufacturer: 'ADJ', category: 'wash',
    wattage: 60, lumens: 680, beamAngle: 25, fieldAngle: 40,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed', colorTemp: 0, weight: 1.4, dmxChannels: 12,
  },
  {
    id: 'chauvet-colordash-h18ip', name: 'COLORdash Par H18IP', manufacturer: 'Chauvet Professional', category: 'wash',
    wattage: 180, lumens: 2500, beamAngle: 22, fieldAngle: 38,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed', colorTemp: 0, ipRating: 'IP65', weight: 4.8, dmxChannels: 14,
  },
  {
    id: 'elation-sixpar-300', name: 'SixPar 300', manufacturer: 'Elation', category: 'wash',
    wattage: 168, lumens: 4200, beamAngle: 22, fieldAngle: 40,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed', colorTemp: 0, weight: 4.2, dmxChannels: 10,
  },
  {
    id: 'generic-led-par-54x3', name: 'LED PAR 54×3 W RGBW', manufacturer: 'Generic', category: 'wash',
    wattage: 162, lumens: 3200, beamAngle: 25, fieldAngle: 45,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed', colorTemp: 0, weight: 2.8, dmxChannels: 8,
  },
  {
    id: 'etc-cs-par', name: 'ColorSource PAR', manufacturer: 'ETC', category: 'wash',
    wattage: 125, lumens: 3250, beamAngle: 25, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed', colorTemp: 0, cri: 92, weight: 3.1, dmxChannels: 5,
  },

  // ═══════════════════════════════════════════════════════════
  // LED SPOT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-cs-spot', name: 'ColorSource Spot', manufacturer: 'ETC', category: 'spot',
    wattage: 125, lumens: 3250, beamAngle: 25, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [19, 36], colorTemp: 0, cri: 92, weight: 5.2, dmxChannels: 6,
  },

  // ═══════════════════════════════════════════════════════════
  // BEAM-EFFEKTLEUCHTEN
  // Extrem enger, paralleler Lichtstrahl für Effekte
  // ═══════════════════════════════════════════════════════════
  {
    id: 'claypaky-sharpy', name: 'Sharpy', manufacturer: 'Clay Paky', category: 'beam',
    wattage: 189, lumens: 7500, beamAngle: 3.8, fieldAngle: 6,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed', colorTemp: 6000, weight: 16, dmxChannels: 16,
  },

  // ═══════════════════════════════════════════════════════════
  // MOVING HEAD WASH
  // ═══════════════════════════════════════════════════════════
  {
    id: 'martin-mac-aura-xb', name: 'MAC Aura XB', manufacturer: 'Martin / Harman', category: 'moving-wash',
    wattage: 270, lumens: 11800, beamAngle: 11, fieldAngle: 58,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [11, 58], colorTemp: 0, weight: 6.6, dmxChannels: 23,
  },
  {
    id: 'robe-robin-600-ledwash', name: 'Robin 600 LEDWash', manufacturer: 'Robe', category: 'moving-wash',
    wattage: 270, lumens: 9500, beamAngle: 15, fieldAngle: 60,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [15, 60], colorTemp: 0, weight: 9.7, dmxChannels: 18,
  },
  {
    id: 'chauvet-rogue-r2-wash', name: 'Rogue R2 Wash', manufacturer: 'Chauvet Professional', category: 'moving-wash',
    wattage: 270, lumens: 8200, beamAngle: 12, fieldAngle: 49,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [12, 49], colorTemp: 0, weight: 10.1, dmxChannels: 21,
  },

  // ═══════════════════════════════════════════════════════════
  // MOVING HEAD SPOT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'martin-mac-viper-profile', name: 'MAC Viper Profile', manufacturer: 'Martin / Harman', category: 'moving-spot',
    wattage: 1000, lumens: 33000, beamAngle: 10, fieldAngle: 44,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [10, 44], colorTemp: 6000, weight: 30.5, dmxChannels: 26,
  },
  {
    id: 'robe-robin-t1-profile', name: 'Robin T1 Profile', manufacturer: 'Robe', category: 'moving-spot',
    wattage: 468, lumens: 20000, beamAngle: 5, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [5, 50], colorTemp: 0, weight: 22, dmxChannels: 35,
  },
  {
    id: 'chauvet-maverick-mk3-profile', name: 'Maverick MK3 Profile', manufacturer: 'Chauvet Professional', category: 'moving-spot',
    wattage: 820, lumens: 51000, beamAngle: 6, fieldAngle: 46,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [6, 46], colorTemp: 7500, weight: 35.3, dmxChannels: 38,
  },

  // ═══════════════════════════════════════════════════════════
  // MOVING HEAD BEAM / BSW (Beam Spot Wash Hybrid)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'robe-robin-megapointe', name: 'Robin MegaPointe', manufacturer: 'Robe', category: 'moving-beam',
    wattage: 470, lumens: 23000, beamAngle: 3, fieldAngle: 45,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [3, 45], colorTemp: 6500, weight: 21.5, dmxChannels: 30,
  },
  {
    id: 'claypaky-mythos2', name: 'Mythos 2', manufacturer: 'Clay Paky', category: 'moving-beam',
    wattage: 470, lumens: 23000, beamAngle: 4, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [4, 50], colorTemp: 6000, weight: 26, dmxChannels: 26,
  },

  // ═══════════════════════════════════════════════════════════
  // BLINDER / STROBE
  // ═══════════════════════════════════════════════════════════
  {
    id: 'molefay-4lite', name: 'Molefay 4-Lite', manufacturer: 'Mole-Richardson', category: 'blinder',
    wattage: 2600, lumens: 65000, beamAngle: 90, fieldAngle: 120,
    beamShape: 'rectangular', beamRatioWH: 2.0, lensType: 'reflector', colorTemp: 3200, weight: 6.8,
  },
  {
    id: 'martin-atomic-3000', name: 'Atomic 3000 DMX', manufacturer: 'Martin / Harman', category: 'blinder',
    wattage: 3000, lumens: 200000, beamAngle: 120, fieldAngle: 160,
    beamShape: 'rectangular', beamRatioWH: 1.5, lensType: 'reflector', colorTemp: 5600, weight: 7.2, dmxChannels: 4,
  },

  // ═══════════════════════════════════════════════════════════
  // CYC / HORIZONTLEUCHTEN
  // Asymmetrischer Abstrahlwinkel für gleichmäßige Fläche
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-cs-cyc', name: 'ColorSource CYC', manufacturer: 'ETC', category: 'cyc',
    wattage: 165, lumens: 5000, beamAngle: 115, fieldAngle: 145,
    beamShape: 'linear', beamRatioWH: 4.0, lensType: 'fixed', colorTemp: 0, cri: 92, weight: 6.8, dmxChannels: 6,
  },
  {
    id: 'arri-cyc-1250', name: 'CYC 1250', manufacturer: 'ARRI', category: 'cyc',
    wattage: 1250, lumens: 28000, beamAngle: 130, fieldAngle: 160,
    beamShape: 'linear', beamRatioWH: 5.0, lensType: 'reflector', colorTemp: 3200, weight: 7.4,
  },

  // ═══════════════════════════════════════════════════════════
  // FLUTER / FLOODLIGHT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-desire-d22', name: 'Desire D22', manufacturer: 'ETC', category: 'flood',
    wattage: 50, lumens: 1800, beamAngle: 24, fieldAngle: 42,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed', colorTemp: 0, cri: 95, weight: 2.9, dmxChannels: 5,
  },
  {
    id: 'etc-desire-d40', name: 'Desire D40', manufacturer: 'ETC', category: 'flood',
    wattage: 100, lumens: 3600, beamAngle: 24, fieldAngle: 42,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed', colorTemp: 0, cri: 95, weight: 4.1, dmxChannels: 5,
  },
  {
    id: 'philips-colorblast-12', name: 'ColorBlast 12', manufacturer: 'Philips / ColorKinetics', category: 'flood',
    wattage: 48, lumens: 1200, beamAngle: 10, fieldAngle: 30,
    beamShape: 'rectangular', beamRatioWH: 1.3, lensType: 'fixed', colorTemp: 0, weight: 3.0,
  },

  // ═══════════════════════════════════════════════════════════
  // VERFOLGER (Followspot)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'robert-juliat-cyrano', name: 'Cyrano 2500W', manufacturer: 'Robert Juliat', category: 'followspot',
    wattage: 2500, lumens: 68000, beamAngle: 7, fieldAngle: 14,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 14], colorTemp: 6000, weight: 23,
  },
];
