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
    datasheetUrl: 'https://www.etcconnect.com/WorkArea/DownloadAsset.aspx?id=10737460415',
    wattage: 750, lumens: 17800, beamAngle: 19, fieldAngle: 30,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 3200, cri: 100, weight: 7.7, mountType: 'clamp',
    photometric: { lux: 49300, distance: 1, beamAngle: 19, colorTemp: 3200 },
    powerConnector: 'Stage Pin / Schuko', dmxChannels: 0,
  },
  {
    id: 'etc-s4-26', name: 'Source Four 26°', manufacturer: 'ETC', category: 'profile',
    datasheetUrl: 'https://www.etcconnect.com/WorkArea/DownloadAsset.aspx?id=10737460435',
    wattage: 750, lumens: 17800, beamAngle: 26, fieldAngle: 38,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 3200, cri: 100, weight: 7.5, mountType: 'clamp',
    photometric: { lux: 26000, distance: 1, beamAngle: 26, colorTemp: 3200 },
  },
  {
    id: 'etc-s4-36', name: 'Source Four 36°', manufacturer: 'ETC', category: 'profile',
    datasheetUrl: 'https://www.etcconnect.com/WorkArea/DownloadAsset.aspx?id=10737460423',
    wattage: 750, lumens: 17800, beamAngle: 36, fieldAngle: 52,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 3200, cri: 100, weight: 7.3, mountType: 'clamp',
    photometric: { lux: 13700, distance: 1, beamAngle: 36, colorTemp: 3200 },
  },
  {
    id: 'etc-s4-50', name: 'Source Four 50°', manufacturer: 'ETC', category: 'profile',
    datasheetUrl: 'https://www.etcconnect.com/WorkArea/DownloadAsset.aspx?id=10737460305',
    wattage: 750, lumens: 17800, beamAngle: 50, fieldAngle: 70,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 3200, cri: 100, weight: 7.1, mountType: 'clamp',
    photometric: { lux: 7100, distance: 1, beamAngle: 50, colorTemp: 3200 },
  },
  {
    id: 'etc-s4-zoom-15-30', name: 'Source Four Zoom 15–30°', manufacturer: 'ETC', category: 'profile',
    datasheetUrl: 'https://www.etcconnect.com/WorkArea/DownloadAsset.aspx?id=10737460417',
    wattage: 750, lumens: 17800, beamAngle: 22, fieldAngle: 35,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [15, 30],
    colorTemp: 3200, cri: 100, weight: 8.6, mountType: 'clamp',
    photometric: { lux: 26000, distance: 1, beamAngle: 22, colorTemp: 3200 },
  },
  {
    id: 'etc-s4-zoom-25-50', name: 'Source Four Zoom 25–50°', manufacturer: 'ETC', category: 'profile',
    datasheetUrl: 'https://www.etcconnect.com/WorkArea/DownloadAsset.aspx?id=10737460396',
    wattage: 750, lumens: 17800, beamAngle: 37, fieldAngle: 55,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [25, 50],
    colorTemp: 3200, cri: 100, weight: 8.6, mountType: 'clamp',
    photometric: { lux: 13700, distance: 1, beamAngle: 37, colorTemp: 3200 },
  },
  {
    id: 'etc-s4led-s3', name: 'Source Four LED S3', manufacturer: 'ETC', category: 'profile',
    datasheetUrl: 'https://www.etcconnect.com/Products/Entertainment-Fixtures/Source-Four-LED-Series-3/Features.aspx',
    wattage: 171, lumens: 8667, beamAngle: 26, fieldAngle: 38,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 95, weight: 8.4, mountType: 'clamp',
    photometric: { lux: 16000, distance: 1, beamAngle: 26, colorTemp: 5600 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 5,
  },
  {
    id: 'robert-juliat-714', name: '714SX2 Suiveur 2,5kW', manufacturer: 'Robert Juliat', category: 'profile',
    datasheetUrl: 'https://www.robertjuliat.com/Product_Specifications/Fiches_EN/Standard/DSEN074_714SX2.pdf',
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
    datasheetUrl: 'https://www.adj.com/mega-hex-par',
    wattage: 30, lumens: 680, beamAngle: 25, fieldAngle: 40,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, weight: 1.4, mountType: 'clamp', dmxChannels: 12,
  },
  {
    id: 'chauvet-colordash-h18ip', name: 'COLORdash Par H18IP', manufacturer: 'Chauvet Professional', category: 'wash',
    wattage: 180, lumens: 5736, beamAngle: 22, fieldAngle: 38,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, ipRating: 'IP65', weight: 4.8, mountType: 'clamp', dmxChannels: 14,
  },
  {
    id: 'elation-sixpar-300', name: 'SixPar 300', manufacturer: 'Elation', category: 'wash',
    datasheetUrl: 'https://www.elationlighting.com/sixpar-300',
    wattage: 220, lumens: 4200, beamAngle: 15, fieldAngle: 25,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, weight: 8.1, mountType: 'clamp', dmxChannels: 10,
  },
  {
    id: 'generic-led-par-54x3', name: 'LED PAR 54×3 W RGBW', manufacturer: 'Generic', category: 'wash',
    wattage: 162, lumens: 3200, beamAngle: 25, fieldAngle: 45,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, weight: 2.8, mountType: 'clamp', dmxChannels: 8,
  },
  {
    id: 'etc-cs-par', name: 'ColorSource PAR', manufacturer: 'ETC', category: 'wash',
    datasheetUrl: 'https://www.etcconnect.com/Products/Entertainment-Fixtures/ColorSource-PAR/Features.aspx',
    wattage: 90, lumens: 3250, beamAngle: 25, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 92, weight: 3.8, mountType: 'clamp', dmxChannels: 5,
  },

  // ═══════════════════════════════════════════════════════════
  // LED SPOT
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // BEAM-EFFEKTLEUCHTEN
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // MOVING HEAD WASH
  // ═══════════════════════════════════════════════════════════
  {
    id: 'martin-mac-aura-xb', name: 'MAC Aura XB', manufacturer: 'Martin / Harman', category: 'moving-wash',
    datasheetUrl: 'https://www.martin.com/en/products/mac-aura-xb',
    wattage: 270, lumens: 6000, beamAngle: 11, fieldAngle: 58,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [11, 58],
    colorTemp: 0, weight: 6.6, mountType: 'yoke', dmxChannels: 23,
  },
  {
    id: 'robe-robin-600-ledwash', name: 'Robin 600 LEDWash', manufacturer: 'Robe', category: 'moving-wash',
    datasheetUrl: 'https://cdn.aws.robe.cz/print/en_product_513.pdf',
    wattage: 270, lumens: 9500, beamAngle: 15, fieldAngle: 60,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [15, 60],
    colorTemp: 0, weight: 9.7, mountType: 'yoke', dmxChannels: 18,
  },
  {
    id: 'robe-robin-ledbeam-150', name: 'Robin LEDBeam 150', manufacturer: 'Robe', category: 'moving-wash',
    datasheetUrl: 'https://www.robe.cz/ledbeam-150',
    wattage: 220, lumens: 2842, beamAngle: 3.8, fieldAngle: 60,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [3.8, 60],
    colorTemp: 0, colorTempRange: [2700, 8000], weight: 5.7, mountType: 'yoke', dmxChannels: 22,
  },
  {
    id: 'chauvet-rogue-r2-wash', name: 'Rogue R2 Wash', manufacturer: 'Chauvet Professional', category: 'moving-wash',
    datasheetUrl: 'https://www.chauvetprofessional.com/products/rogue-r2-wash/',
    wattage: 270, lumens: 8200, beamAngle: 12, fieldAngle: 49,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [12, 49],
    colorTemp: 0, weight: 10.1, mountType: 'yoke', dmxChannels: 21,
  },
  {
    id: 'martin-mac-aura-pxl', name: 'MAC Aura PXL', manufacturer: 'Martin / Harman', category: 'moving-wash',
    datasheetUrl: 'https://www.martin.com/en/products/mac-aura-pxl',
    wattage: 560, lumens: 10500, beamAngle: 6, fieldAngle: 59,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [6, 59],
    colorTemp: 0, colorTempRange: [2000, 10000], weight: 15.6, mountType: 'yoke', dmxChannels: 32,
  },
  {
    id: 'glp-impression-x4', name: 'impression X4', manufacturer: 'GLP', category: 'moving-wash',
    datasheetUrl: 'https://glp.de/en/?view=article&id=848&catid=55',
    wattage: 350, lumens: 5085, beamAngle: 7, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 50],
    colorTemp: 0, weight: 7.9, mountType: 'yoke',
  },
  {
    id: 'robe-robin-spiider', name: 'Robin Spiider', manufacturer: 'Robe', category: 'moving-wash',
    datasheetUrl: 'https://www.robe.cz/spiider',
    wattage: 600, lumens: 11000, beamAngle: 4, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [4, 50],
    colorTemp: 0, colorTempRange: [2700, 8000], weight: 13.3, mountType: 'yoke', dmxChannels: 49,
  },

  // ═══════════════════════════════════════════════════════════
  // MOVING HEAD SPOT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'martin-mac-viper-profile', name: 'MAC Viper Profile', manufacturer: 'Martin / Harman', category: 'moving-spot',
    datasheetUrl: 'https://www.martin.com/en/products/mac-viper-profile',
    wattage: 1000, lumens: 26000, beamAngle: 10, fieldAngle: 44,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [10, 44],
    colorTemp: 6000, weight: 37.2, mountType: 'yoke', dmxChannels: 26,
  },
  {
    id: 'robe-robin-t1-profile', name: 'Robin T1 Profile', manufacturer: 'Robe', category: 'moving-spot',
    datasheetUrl: 'https://www.robe.cz/t1-profile',
    wattage: 468, lumens: 12600, beamAngle: 5, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [5, 50],
    colorTemp: 0, weight: 24.5, mountType: 'yoke', dmxChannels: 35,
  },
  {
    id: 'chauvet-maverick-mk3-profile', name: 'Maverick MK3 Profile', manufacturer: 'Chauvet Professional', category: 'moving-spot',
    datasheetUrl: 'https://chauvetprofessional.com/product/maverick-mk3-profile/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [6, 46],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', dmxChannels: 38,
  },
  // ── Ayrton (LED-Movingheads; Kern-Specs laut Ayrton-Spec-Sheets/Produktdaten 2026-09) ──
  { id: 'ayrton-ghibli', name: 'Ghibli', manufacturer: 'Ayrton', category: 'moving-spot',
  datasheetUrl: 'https://www.ayrton.eu/products/ghibli/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 56],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'ayrton-diablo', name: 'Diablo', manufacturer: 'Ayrton', category: 'moving-spot',
  datasheetUrl: 'https://www.ayrton.eu/products/diablo/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 53],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'ayrton-khamsin', name: 'Khamsin-S', manufacturer: 'Ayrton', category: 'moving-spot',
  datasheetUrl: 'https://www.ayrton.eu/products/khamsin-s/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 58],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'ayrton-domino-lt', name: 'Domino LT', manufacturer: 'Ayrton', category: 'moving-spot',
  datasheetUrl: 'https://www.ayrton.eu/products/domino-lt/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [3.5, 53],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP65' },
  { id: 'ayrton-mistral', name: 'Mistral', manufacturer: 'Ayrton', category: 'moving-spot',
  datasheetUrl: 'https://www.ayrton.eu/products/mistral/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 53],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'ayrton-perseo-profile', name: 'Perseo Profile', manufacturer: 'Ayrton', category: 'moving-spot',
  datasheetUrl: 'https://www.ayrton.eu/products/perseo-profile/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 56],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP65' },
  { id: 'ayrton-karif-lt', name: 'Karif LT', manufacturer: 'Ayrton', category: 'moving-spot',
  datasheetUrl: 'https://www.ayrton.eu/products/karif-lt/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [2.8, 47],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'ayrton-bora', name: 'Bora-S', manufacturer: 'Ayrton', category: 'moving-wash',
  datasheetUrl: 'https://www.ayrton.eu/products/bora-s/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [8, 64],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  // ── Weitere Movingheads/Scheinwerfer (Kern-Specs laut Hersteller-Datenblatt 2026-09) ──
  { id: 'etc-s4-led-s3-lustr', name: 'Source Four LED Series 3 Lustr X8', manufacturer: 'ETC', category: 'profile',
  datasheetUrl: 'https://www.etcconnect.com/Products/Entertainment-Fixtures/Source-Four-LED-Series-3/Features.aspx',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 6800, cri: 90, weight: 42.5, mountType: 'clamp' },
  { id: 'etc-colorsource-spot', name: 'ColorSource Spot', manufacturer: 'ETC', category: 'profile',
  datasheetUrl: 'https://www.etcconnect.com/Products/Lighting-Fixtures/ColorSource-Spot/Features.aspx',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 6800, weight: 42.5, mountType: 'clamp' },
  { id: 'chauvet-maverick-storm-1-wash', name: 'Maverick Storm 1 Wash', manufacturer: 'Chauvet Professional', category: 'moving-wash',
  datasheetUrl: 'https://chauvetprofessional.com/product/maverick-storm-1-wash/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [11, 42],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP65' },
  { id: 'elation-proteus-maximus', name: 'Proteus Maximus', manufacturer: 'Elation', category: 'moving-spot',
  datasheetUrl: 'https://www.elationlighting.com/proteus-maximus',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [5.5, 55],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP65', dmxChannels: 37 },
  { id: 'robe-iforte-ltx', name: 'iForte LTX', manufacturer: 'Robe', category: 'moving-spot',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [3.5, 52],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP65' },
  { id: 'martin-mac-encore-perf-cld', name: 'MAC Encore Performance CLD', manufacturer: 'Martin / Harman', category: 'moving-spot',
  datasheetUrl: 'https://www.martin.com/en/products/mac-encore-performance-cld',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [12, 48],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'martin-mac-aura-xip', name: 'MAC Aura XIP', manufacturer: 'Martin / Harman', category: 'moving-wash',
  datasheetUrl: 'https://www.martin.com/en/products/mac-aura-xip',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [8, 60],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP65' },
  { id: 'elation-fuze-max-profile', name: 'Fuze Max Profile', manufacturer: 'Elation', category: 'moving-spot',
  datasheetUrl: 'https://www.elationlighting.com/fuze-max-profile',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [5.5, 52],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'sgm-p6', name: 'P-6', manufacturer: 'SGM', category: 'flood',
  datasheetUrl: 'https://www.sgmlighting.com/products/p%c2%b76',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP66' },
  { id: 'adj-vizi-beam-12rx', name: 'Vizi Beam 12RX', manufacturer: 'ADJ', category: 'moving-beam',
  datasheetUrl: 'https://www.adj.com/vizi-beam-12rx',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'astera-ax1-pixeltube', name: 'AX1 PixelTube', manufacturer: 'Astera', category: 'cyc',
  datasheetUrl: 'https://astera-led.com/products/ax1-pixeltube/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'linear', beamRatioWH: 8, lensType: 'fixed',
    colorTemp: 6800, weight: 42.5, mountType: 'clamp', ipRating: 'IP65' },
  { id: 'chauvet-rogue-r2-spot', name: 'Rogue R2 Spot', manufacturer: 'Chauvet Professional', category: 'moving-spot',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'chauvet-colordash-par-h12x', name: 'COLORdash Par H12X IP', manufacturer: 'Chauvet Professional', category: 'par',
  datasheetUrl: 'https://chauvetprofessional.com/product/colordash-par-h12x-ip/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 6800, colorTempRange: [2800, 10000], weight: 42.5, mountType: 'clamp', ipRating: 'IP65' },
  { id: 'robe-ledbeam-350', name: 'LEDBeam 350', manufacturer: 'Robe', category: 'moving-wash',
  datasheetUrl: 'https://www.robe.cz/ledbeam-350',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [4, 50],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'elation-kl-panel-xl', name: 'KL Panel XL', manufacturer: 'Elation', category: 'led-panel',
  datasheetUrl: 'https://www.elationlighting.com/kl-panel-xl',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'rectangular', beamRatioWH: 1.33, lensType: 'fixed',
    colorTemp: 6800, colorTempRange: [2000, 10000], cri: 95, weight: 42.5, mountType: 'yoke' },
  { id: 'adj-focus-spot-6z', name: 'Focus Spot 6Z', manufacturer: 'ADJ', category: 'moving-spot',
  datasheetUrl: 'https://www.adj.com/focus-spot-6z',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [9, 28],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'chauvet-rogue-r1-beamwash', name: 'Rogue R1 BeamWash', manufacturer: 'Chauvet Professional', category: 'moving-wash',
  datasheetUrl: 'https://chauvetprofessional.com/product/rogue-r1-beamwash/',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [3.4, 67.7],
    colorTemp: 6800, colorTempRange: [2800, 10000], weight: 42.5, mountType: 'yoke' },
  // ── Cameo (Adam Hall; Kern-Specs laut Cameo-Produktdaten 2026-09; * = Herstellerklasse-Schaetzwert) ──
  { id: 'cameo-opus-s5', name: 'OPUS S5', manufacturer: 'Cameo', category: 'moving-spot',
  datasheetUrl: 'https://www.cameolight.com/en/solutions/rental/moving-lights/spot-moving-heads/19890/opus-s5',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [6, 46],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'cameo-opus-h5', name: 'OPUS H5', manufacturer: 'Cameo', category: 'moving-beam',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [2, 42],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'cameo-otos-h5', name: 'OTOS H5', manufacturer: 'Cameo', category: 'moving-beam',
  datasheetUrl: 'https://www.cameolight.com/en/series/otos-series/26039/otos-h5',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [2, 42],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP65' },
  { id: 'cameo-otos-sp6', name: 'OTOS SP6', manufacturer: 'Cameo', category: 'moving-spot',
  datasheetUrl: 'https://www.cameolight.com/detail/index/sArticle/29049',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 50],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP65' },
  { id: 'cameo-evos-s3', name: 'EVOS S3', manufacturer: 'Cameo', category: 'moving-spot',
  datasheetUrl: 'https://www.cameolight.com/de/downloads/file/id/1725041077',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [10, 38],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },
  { id: 'cameo-evos-w7', name: 'EVOS W7', manufacturer: 'Cameo', category: 'moving-wash',
  datasheetUrl: 'https://www.cameolight.com/en/solutions/rental/moving-lights/beam-moving-heads/20565/evos-w7',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 50],
    colorTemp: 6800, colorTempRange: [2700, 8000], weight: 42.5, mountType: 'yoke' },
  { id: 'cameo-otos-b5', name: 'OTOS B5', manufacturer: 'Cameo', category: 'moving-beam',
  datasheetUrl: 'https://www.cameolight.com/detail/index/sArticle/29085',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [2, 24],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', ipRating: 'IP65' },
  { id: 'cameo-movo-beam-z100', name: 'MOVO BEAM Z100', manufacturer: 'Cameo', category: 'moving-beam',
  datasheetUrl: 'https://www.cameolight.com/en/solutions/dj-musicians/moving-lights/moving-heads/17232/movo-beam-z100',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [4, 30],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke' },

  // ═══════════════════════════════════════════════════════════
  // MOVING HEAD BEAM / BSW (Beam Spot Wash Hybrid)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'robe-robin-megapointe', name: 'Robin MegaPointe', manufacturer: 'Robe', category: 'moving-beam',
    datasheetUrl: 'https://www.robe.cz/megapointe',
    wattage: 307, lumens: 8200, beamAngle: 10, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [3, 45],
    colorTemp: 6800, weight: 42.5, mountType: 'yoke', dmxChannels: 30,
  },
  {
    id: 'robe-robin-pointe', name: 'Robin Pointe', manufacturer: 'Robe', category: 'moving-beam',
    datasheetUrl: 'https://www.robe.cz/pointe',
    wattage: 470, lumens: 9870, beamAngle: 2.5, fieldAngle: 20,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [2.5, 20],
    colorTemp: 7000, cri: 75, weight: 15, mountType: 'yoke', dmxChannels: 30,
  },
  {
    id: 'claypaky-mythos2', name: 'Mythos 2', manufacturer: 'Clay Paky', category: 'moving-beam',
    wattage: 440, lumens: 23000, beamAngle: 4, fieldAngle: 50,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [4, 50],
    colorTemp: 7000, weight: 32, mountType: 'yoke', dmxChannels: 26,
  },
  {
    id: 'claypaky-sharpy', name: 'Sharpy', manufacturer: 'Clay Paky', category: 'moving-beam',
    datasheetUrl: 'https://www.claypaky.it/products/sharpy-legacy/',
    wattage: 189, lumens: 7950, beamAngle: 3.8, fieldAngle: 3.8,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 8000, weight: 19, mountType: 'yoke', dmxChannels: 16,
  },

  // ═══════════════════════════════════════════════════════════
  // BLINDER / STROBE
  // ═══════════════════════════════════════════════════════════
  {
    id: 'molefay-4lite', name: 'Molefay 4-Lite', manufacturer: 'Mole-Richardson', category: 'blinder',
    datasheetUrl: 'https://www.mole.com/5581-2600w-four-light-molefay',
    wattage: 2600, lumens: 65000, beamAngle: 90, fieldAngle: 120,
    beamShape: 'rectangular', beamRatioWH: 2.0, lensType: 'reflector',
    colorTemp: 3200, weight: 6.8, mountType: 'baby',
  },
  {
    id: 'martin-atomic-3000', name: 'Atomic 3000 DMX', manufacturer: 'Martin / Harman', category: 'blinder',
    datasheetUrl: 'https://www.martin.com/en/products/atomic-3000-dmx',
    wattage: 3000, lumens: 200000, beamAngle: 120, fieldAngle: 160,
    beamShape: 'rectangular', beamRatioWH: 1.5, lensType: 'reflector',
    colorTemp: 5600, weight: 7.2, mountType: 'clamp', dmxChannels: 4,
  },

  // ═══════════════════════════════════════════════════════════
  // CYC / HORIZONTLEUCHTEN
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-cs-cyc', name: 'ColorSource CYC', manufacturer: 'ETC', category: 'cyc',
    datasheetUrl: 'https://www.etcconnect.com/Products/Entertainment-Fixtures/ColorSource-CYC/Features.aspx',
    wattage: 133, lumens: 4117, beamAngle: 115, fieldAngle: 145,
    beamShape: 'linear', beamRatioWH: 4.0, lensType: 'fixed',
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 92, weight: 4.67, mountType: 'clamp', dmxChannels: 6,
  },
  {
    id: 'arri-cyc-1250', name: 'CYC 1250', manufacturer: 'ARRI', category: 'cyc',
    datasheetUrl: 'https://www.arri.com/resource/blob/163268/de59e7af51831095d387c69361963628/arri-cyc-flood-1250-manual-de-en-data.pdf',
    wattage: 1250, lumens: 28000, beamAngle: 130, fieldAngle: 160,
    beamShape: 'linear', beamRatioWH: 5.0, lensType: 'reflector',
    colorTemp: 3200, weight: 7.4, mountType: 'clamp',
  },

  // ═══════════════════════════════════════════════════════════
  // FLUTER / FLOODLIGHT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'etc-desire-d22', name: 'Desire D22', manufacturer: 'ETC', category: 'flood',
    datasheetUrl: 'https://www.etcconnect.com/Products/Entertainment-Fixtures/Desire-D22/Features.aspx',
    wattage: 22, lumens: 707, beamAngle: 24, fieldAngle: 42,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, cri: 95, weight: 2.9, mountType: 'clamp', dmxChannels: 5,
  },
  {
    id: 'etc-desire-d40', name: 'Desire D40', manufacturer: 'ETC', category: 'flood',
    datasheetUrl: 'https://www.etcconnect.com/Products/Entertainment-Fixtures/Desire-D40/Features.aspx',
    wattage: 100, lumens: 2593, beamAngle: 24, fieldAngle: 42,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, cri: 95, weight: 4.1, mountType: 'clamp', dmxChannels: 5,
  },
  {
    id: 'philips-colorblast-12', name: 'ColorBlast 12', manufacturer: 'Philips / ColorKinetics', category: 'flood',
    datasheetUrl: 'https://www.docs.colorkinetics.com/support/datasheets/ColorBlast12.pdf',
    wattage: 48, lumens: 1200, beamAngle: 10, fieldAngle: 30,
    beamShape: 'rectangular', beamRatioWH: 1.3, lensType: 'fixed',
    colorTemp: 0, weight: 3.0, mountType: 'clamp',
  },

  // ═══════════════════════════════════════════════════════════
  // VERFOLGER (Followspot)
  // ═══════════════════════════════════════════════════════════
  {
    id: 'robert-juliat-cyrano', name: 'Cyrano 2500W', manufacturer: 'Robert Juliat', category: 'followspot',
    datasheetUrl: 'https://www.robertjuliat.com/followspots/cyrano.html',
    wattage: 2500, lumens: 68000, beamAngle: 7, fieldAngle: 14,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 14],
    colorTemp: 6000, weight: 65, mountType: 'yoke',
  },

  // ═══════════════════════════════════════════════════════════
  // LED PANELS / FLÄCHENLEUCHTEN MIT BOWENS-MOUNT
  // Professionelle LED-Scheinwerfer für Film & Bühne
  // ═══════════════════════════════════════════════════════════
  {
    id: 'aputure-ls-600x-pro', name: 'LS 600x Pro', manufacturer: 'Aputure', category: 'led-panel',
    datasheetUrl: 'https://www.aputure.com/products/ls-600x-pro',
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
    datasheetUrl: 'https://www.elationlighting.com/kl-fresnel-8-fc',
    wattage: 514, lumens: 16505, beamAngle: 10.4, fieldAngle: 20.6, cutoffAngle: 29.2,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [10.4, 50.8],
    colorTemp: 0, colorTempRange: [2700, 6500], cri: 92, tlci: 94, weight: 10.5, mountType: 'clamp',
    photometric: { lux: 158522, distance: 1, beamAngle: 10.4, colorTemp: 6500 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 18,
  },
  {
    id: 'elation-kl-fresnel-6-fc', name: 'KL Fresnel 6 FC', manufacturer: 'Elation', category: 'fresnel',
    datasheetUrl: 'https://www.elationlighting.com/kl-fresnel-6-fc',
    wattage: 220, lumens: 7200, beamAngle: 12, fieldAngle: 18,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'fresnel', zoomRange: [12, 60],
    colorTemp: 0, colorTempRange: [2000, 10000], cri: 95, tlci: 94, weight: 7.0, mountType: 'clamp',
    photometric: { lux: 7000, distance: 3, beamAngle: 12, colorTemp: 5600 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 18,
  },
  {
    id: 'elation-kl-panel-fc', name: 'KL Panel FC', manufacturer: 'Elation', category: 'led-panel',
    wattage: 295, lumens: 24000, beamAngle: 64, fieldAngle: 90,
    beamShape: 'rectangular', beamRatioWH: 1, lensType: 'fixed',
    colorTemp: 0, colorTempRange: [2000, 10000], cri: 95, tlci: 92, weight: 13.0, mountType: 'clamp',
    photometric: { lux: 13000, distance: 1, beamAngle: 64, colorTemp: 5600 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 16,
  },
  {
    id: 'elation-kl-profile-fc', name: 'KL Profile FC', manufacturer: 'Elation', category: 'profile',
    datasheetUrl: 'https://www.elationlighting.com/products/kl-profile-fc',
    wattage: 305, lumens: 10600, beamAngle: 6, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [6, 50],
    colorTemp: 0, colorTempRange: [2400, 8500], cri: 94, tlci: 92, weight: 9.5, mountType: 'clamp',
    photometric: { lux: 15517, distance: 1, beamAngle: 50, colorTemp: 6500 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 24,
  },
  {
    id: 'elation-kl-par-fc', name: 'KL PAR FC', manufacturer: 'Elation', category: 'par',
    datasheetUrl: 'https://www.elationlighting.com/products/kl-par-fc',
    wattage: 280, lumens: 11000, beamAngle: 11, fieldAngle: 16,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'interchangeable',
    colorTemp: 0, colorTempRange: [1750, 10000], cri: 93, tlci: 95, weight: 7.7, mountType: 'clamp',
    photometric: { lux: 11520, distance: 5, beamAngle: 11, colorTemp: 6000 },
    powerConnector: 'powerCON TRUE1', dmxChannels: 16,
  },
  {
    id: 'elation-fuze-wash-z350', name: 'Fuze Wash Z350', manufacturer: 'Elation', category: 'moving-wash',
    datasheetUrl: 'https://www.elationlighting.com/products/fuze-wash-z350',
    wattage: 399, lumens: 13000, beamAngle: 6, fieldAngle: 10,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [6, 46],
    colorTemp: 0, colorTempRange: [2700, 8000], cri: 80, weight: 20.4, mountType: 'yoke',
    photometric: { lux: 60280, distance: 2, beamAngle: 6, colorTemp: 7000 },
    powerConnector: 'powerCON TRUE1', ipRating: '30', dmxChannels: 28,
  },
  {
    id: 'elation-fuze-par-z120', name: 'Fuze Par Z120 IP', manufacturer: 'Elation', category: 'moving-wash',
    datasheetUrl: 'https://www.elationlighting.com/products/fuze-par-z120-ip',
    wattage: 157, lumens: 4500, beamAngle: 7, fieldAngle: 12,
    beamShape: 'circular', beamRatioWH: 1, lensType: 'zoom', zoomRange: [7, 55],
    colorTemp: 0, colorTempRange: [2700, 8000], cri: 80, weight: 8.6, mountType: 'yoke',
    photometric: { lux: 10640, distance: 3, beamAngle: 7, colorTemp: 7000 },
    powerConnector: 'powerCON TRUE1', ipRating: '65', dmxChannels: 20,
  },
];
