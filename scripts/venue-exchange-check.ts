// Headless-Check fuer das Venue-Austauschformat (venue-exchange v1).
// Lauf: `npm run venue:check`  (node --experimental-strip-types).
//
// Prueft: (1) Light-Round-Trip erhaelt das geteilte Venue, (2) eine von
// MultiCam exportierte Datei laesst sich importieren (Cross-App), (3) fremde
// Dateien werden abgelehnt.
import assert from 'node:assert/strict';
import {
  toVenueExchange,
  fromVenueExchange,
  parseVenueExchange,
  mergeOwnVenueFields,
  type VenueExchange,
} from '../src/core/venueExchange.ts';

// ── 1) Round-Trip Light → Exchange → Light ──────────────────────────────────
const input = {
  venueName: 'Studio 1',
  persons: [
    { id: 'p1', x: 3, y: 4, height: 1.75, label: 'Talent', pose: 'standing' as const, facing: 270 },
  ],
  walls: [
    { id: 'w1', x1: 0, y1: 0, x2: 10, y2: 0, height: 4, label: 'Nordwand', reflectance: 0.5, color: '#cccccc' },
  ],
  stageElements: [
    { id: 's1', type: 'podest-1x1' as const, x: 2, y: 2, width: 1, depth: 1, height: 0.2, rotation: 0, label: 'Podest' },
  ],
  floorPlan: {
    src: 'data:image/png;base64,AAAA', name: 'plan.png',
    widthMeters: 10, heightMeters: 8, naturalWidth: 1000, naturalHeight: 800,
    offsetX: 0, offsetY: 0, opacity: 0.5, locked: false, kind: 'image' as const,
  },
  appVersion: '1.0.0',
  exportedAt: '2026-06-30T00:00:00.000Z',
};

const ex = toVenueExchange(input);
assert.equal(ex.kind, 'venue-exchange');
assert.equal(ex.app, 'light-planner');
assert.equal(ex.venue.persons.length, 1);

const back = fromVenueExchange(ex);
assert.equal(back.persons[0].label, 'Talent');
assert.equal(back.persons[0].facing, 270);
assert.equal(back.walls[0].reflectance, 0.5);
assert.equal(back.stageElements[0].depth, 1);
assert.equal(back.floorPlan?.widthMeters, 10);
assert.equal(back.floorPlan?.naturalWidth, 1000);
console.log('✓ Round-Trip Light erhaelt das geteilte Venue');

// ── 2) Cross-App: eine von MultiCam exportierte Datei importieren ───────────
const fromMulticam: VenueExchange = {
  kind: 'venue-exchange', formatVersion: 1, app: 'multicam-planner',
  appVersion: '0.4.0', exportedAt: '2026-06-30T00:00:00.000Z',
  venue: {
    name: 'Halle A', widthM: 24, heightM: 14,
    persons: [{ id: 'mp1', x: 5, y: 6, height: 1.8, label: 'Moderator', objectType: 'person', width: 0.5 }],
    walls: [{ id: 'mw1', x1: 0, y1: 0, x2: 24, y2: 0, height: 3, label: 'Nordwand' }],
    stageObjects: [{ id: 'ms1', x: 8, y: 10, width: 6, depth: 4, height: 0, label: 'Buehne' }],
    floorPlan: {
      src: 'data:image/png;base64,BBBB', naturalWidth: 1200, naturalHeight: 700,
      widthMeters: 24, heightMeters: 14, offsetX: 1, offsetY: 2, opacity: 0.6, kind: 'image',
    },
  },
};
const imported = fromVenueExchange(parseVenueExchange(JSON.stringify(fromMulticam)));
assert.equal(imported.persons[0].label, 'Moderator');
assert.equal(imported.persons[0].pose, 'standing'); // Default, da MultiCam keine pose kennt
assert.equal(imported.walls[0].height, 3);
assert.equal(imported.walls[0].reflectance, 0.5); // Default, da MultiCam keine Reflexion kennt
assert.equal(imported.stageElements[0].depth, 4); // MultiCam Stage-Tiefe
assert.equal(imported.floorPlan?.widthMeters, 24);
console.log('✓ Cross-App: MultiCam-Venue laesst sich in Light importieren');

// ── 3) Fremde Dateien werden abgelehnt ──────────────────────────────────────
assert.throws(() => parseVenueExchange('{"kind":"lightplan"}'));
assert.throws(() => parseVenueExchange(JSON.stringify({ ...fromMulticam, formatVersion: 99 })));
console.log('✓ Fremde / inkompatible Dateien werden abgelehnt');

// ── 4) ADR-005 — die Projektion ueberschreibt den eigenen Stand nicht ────────
//
//    Das Austauschformat ist der GETEILTE Raum. Es kennt Wand-Material,
//    Fenster und den Podest-Typ nicht — die sind light-eigen. Vor dieser
//    Zusammenfuehrung zerstoerte ein .avplan-Import genau diese Felder, obwohl
//    sie in derselben Datei standen (in domains.lighting). Fenster tragen
//    transmittance und tint und gehen in die Lichtrechnung ein.
const ownWalls = [
  {
    id: 'w1', x1: 0, y1: 0, x2: 10, y2: 0, height: 4, label: 'Nordwand',
    reflectance: 0.5, color: '#cccccc',
    material: 'brick' as never,
    windows: [
      { id: 'win1', start: 2, width: 1.4, sill: 1, top: 2.4, transmittance: 0.9, tint: '#ffffff' },
    ],
  },
];
const ownStages = [
  { id: 's1', type: 'podest-2x1' as const, x: 1, y: 1, width: 2, depth: 1, height: 0.4, rotation: 0, label: 'A' },
];

// Der geteilte Raum kommt zurueck — mit verschobener Wand und ohne die
// light-eigenen Felder.
const shared = fromVenueExchange(
  toVenueExchange({
    venueName: 'Studio 1',
    persons: [],
    walls: [{ id: 'w1', x1: 0, y1: 0, x2: 12, y2: 0, height: 4, label: 'Nordwand', reflectance: 0.5, color: '#cccccc' }],
    stageElements: ownStages,
    floorPlan: null,
    appVersion: '1.0.0',
    exportedAt: 't',
  } as never),
);
assert.equal(shared.walls[0].material, undefined, 'Projektion traegt material nicht');
assert.equal(shared.walls[0].windows, undefined, 'Projektion traegt windows nicht');
assert.equal(shared.stageElements[0].type, 'custom', 'Projektion kennt den Podest-Typ nicht');

const merged = mergeOwnVenueFields(shared, { walls: ownWalls as never, stageElements: ownStages });
// Geometrie: die Projektion gewinnt — eine Nachbar-App hat die Wand verlaengert.
assert.equal(merged.walls[0].x2, 12, 'Geometrie kommt aus dem geteilten Raum');
// Eigene Felder: aus dem eigenen Stand zurueck.
assert.equal(merged.walls[0].material, 'brick', 'Wand-Material ueberlebt');
assert.equal(merged.walls[0].windows?.length, 1, 'Fenster ueberleben');
assert.equal(merged.walls[0].windows?.[0].transmittance, 0.9);
assert.equal(merged.stageElements[0].type, 'podest-2x1', 'Podest-Typ ueberlebt');

// Was die Projektion nicht kennt, existiert nicht mehr — der geteilte Raum ist
// fuer Existenz kanonisch, sonst kaeme eine geloeschte Wand wieder.
const afterDelete = mergeOwnVenueFields(
  { ...shared, walls: [] },
  { walls: ownWalls as never, stageElements: [] },
);
assert.equal(afterDelete.walls.length, 0, 'geloeschte Wand kommt nicht zurueck');

// Eine Wand ohne Gegenstueck im eigenen Stand bleibt, wie die Projektion sie gibt.
const foreignOnly = mergeOwnVenueFields(shared, { walls: [], stageElements: [] });
assert.equal(foreignOnly.walls[0].material, undefined);
console.log('✓ ADR-005: die Projektion ueberschreibt Material, Fenster und Podest-Typ nicht mehr');

// ── ADR-005 Inkrement 4: Raum-Masse ueberleben den Light-Round-Trip ─────────
//
// Light modelliert keine Raumgroesse — es hat Waende, Podeste und einen
// kalibrierten Gebaeudeplan, aber kein widthM/heightM. Der Export liess die
// Felder deshalb weg, und MultiCams Import setzt fuer ein fehlendes Mass seinen
// Standard ein (20 x 12 m). Ein 30 x 18 m grosser Raum schrumpfte damit bei
// jedem Round-Trip durch light auf die Standardgroesse. Nicht ein fehlender
// Wert, sondern ein falscher — dieselbe Klasse wie multicam#79.
const roomIn: VenueExchange = {
  kind: 'venue-exchange',
  formatVersion: 1,
  app: 'multicam-planner',
  appVersion: '1.0.0',
  exportedAt: 't',
  venue: {
    name: 'Grosse Halle', widthM: 30, heightM: 18,
    persons: [], walls: [], stageObjects: [],
  },
} as never;

const heldRoom = fromVenueExchange(roomIn);
assert.equal(heldRoom.venueForeign.widthM, 30, 'Raumbreite wird aufgehoben');
assert.equal(heldRoom.venueForeign.heightM, 18, 'Raumtiefe wird aufgehoben');

const roomOut = toVenueExchange({
  venueName: 'Grosse Halle', persons: heldRoom.persons, walls: heldRoom.walls,
  stageElements: heldRoom.stageElements, floorPlan: null,
  appVersion: '1.0.0', exportedAt: 't2',
  venueForeign: heldRoom.venueForeign,
} as never).venue;
assert.equal(roomOut.widthM, 30, 'Raumbreite kommt unveraendert zurueck');
assert.equal(roomOut.heightM, 18, 'Raumtiefe kommt unveraendert zurueck');

// Ohne Aufgehobenes bleibt der Export wie bisher stumm: light ERFINDET keine
// Raumgroesse. Ein Standardwert hier waere derselbe Fehler, nur andersherum.
const silent = toVenueExchange({
  venueName: 'X', persons: [], walls: [], stageElements: [], floorPlan: null,
  appVersion: '1.0.0', exportedAt: 't',
} as never).venue;
assert.equal(silent.widthM, undefined, 'ohne Wissen kein Mass');
assert.equal(silent.heightM, undefined, 'ohne Wissen kein Mass');

// Eine Datei ohne Masse hinterlaesst nichts Aufgehobenes — sonst behauptete die
// Projektdatei, es habe eines gegeben.
// Der Name wird hier mit weggenommen: die Zusicherung gilt dem Fall "die Datei
// traegt nichts, was light nicht modelliert", nicht nur den Massen.
const nothing = fromVenueExchange({
  ...roomIn,
  venue: { ...roomIn.venue, widthM: undefined, heightM: undefined, name: 'Venue' },
} as never);
assert.deepEqual(nothing.venueForeign, {}, 'nichts da, nichts aufgehoben');

// mergeOwnVenueFields reicht das Aufgehobene durch — sonst ginge es genau auf
// dem Weg verloren, den der .venue.json-Import nimmt.
assert.equal(
  mergeOwnVenueFields(heldRoom, { walls: [], stageElements: [] }).venueForeign.widthM,
  30,
  'Zusammenfuehrung verliert die Masse nicht',
);
console.log('✓ ADR-005: Raum-Masse ueberleben den Light-Round-Trip');

// ── ADR-005 Inkrement 4, vierter Naht-Fall: Buehnen-Objekte bleiben, was sie sind ──
//
// Lights Person ist eine menschliche Figur. MultiCam kennt an derselben Stelle
// ein allgemeines Buehnen-Objekt — Schlagzeug, Rednerpult, Stuhl — mit width,
// objectType und color. Light liess die drei fallen, MultiCams Import setzt
// dann seine Standards ein: aus dem Schlagzeug wurde eine 0,5 m breite Person.
const drumKitIn: VenueExchange = {
  kind: 'venue-exchange', formatVersion: 1, app: 'multicam-planner',
  appVersion: '1.0.0', exportedAt: 't',
  venue: {
    name: 'Halle', persons: [
      { id: 'o1', x: 3, y: 4, height: 1.2, label: 'Drumkit', width: 1.4, objectType: 'drumkit', color: '#aa5500' },
      { id: 'p1', x: 1, y: 1, height: 1.75, label: 'Talent' },
    ],
    walls: [], stageObjects: [],
  },
} as never;

const heldPersons = fromVenueExchange(drumKitIn);
assert.equal(heldPersons.personForeign['o1']?.objectType, 'drumkit', 'Objekt-Art wird aufgehoben');
assert.equal(heldPersons.personForeign['o1']?.width, 1.4, 'Breite wird aufgehoben');
assert.equal(heldPersons.personForeign['o1']?.color, '#aa5500', 'Farbe wird aufgehoben');
assert.equal(heldPersons.personForeign['p1'], undefined, 'eine blosse Person hinterlaesst nichts');

const personsOut = toVenueExchange({
  venueName: 'Halle', persons: heldPersons.persons, walls: heldPersons.walls,
  stageElements: heldPersons.stageElements, floorPlan: null,
  appVersion: '1.0.0', exportedAt: 't2',
  personForeign: heldPersons.personForeign,
} as never).venue.persons;

const drum = personsOut.find((p) => p.id === 'o1');
assert.equal(drum?.objectType, 'drumkit', 'das Schlagzeug bleibt ein Schlagzeug');
assert.equal(drum?.width, 1.4, 'die Breite kommt unveraendert zurueck');
assert.equal(drum?.color, '#aa5500', 'die Farbe kommt unveraendert zurueck');

// Was light MODELLIERT, bleibt fuehrend — Position und Hoehe kommen aus lights
// eigenem Stand, nicht aus dem Aufgehobenen.
assert.equal(drum?.x, 3, 'Position kommt aus lights Stand');
assert.equal(drum?.height, 1.2, 'Hoehe kommt aus lights Stand');

// Eine reine Person bekommt keine erfundenen Felder mit auf den Weg.
const plain = personsOut.find((p) => p.id === 'p1');
assert.equal(plain?.objectType, undefined, 'keine erfundene Objekt-Art');
assert.equal(plain?.width, undefined, 'keine erfundene Breite');
console.log('✓ ADR-005: Buehnen-Objekte ueberleben den Light-Round-Trip als das, was sie sind');

// ── ADR-005: der Raum-Name ueberlebt den Light-Round-Trip ──────────────────
//
// Light kennt keinen Raum-Namen — `venueName` ist sein PROJEKTname. Es
// verwarf den eingelesenen Namen und schrieb beim Export den eigenen: aus
// „Grosse Halle" wurde „Lichtplan Show A". Letzter Pfad des Venue-Austauschs.
const namedIn = { ...roomIn, venue: { ...roomIn.venue, name: 'Grosse Halle' } } as never;
const heldName = fromVenueExchange(namedIn);
assert.equal(heldName.venueForeign.name, 'Grosse Halle', 'Raum-Name wird aufgehoben');

const nameOut = toVenueExchange({
  venueName: 'Lichtplan Show A', persons: [], walls: [], stageElements: [], floorPlan: null,
  appVersion: '1.0.0', exportedAt: 't', venueForeign: heldName.venueForeign,
} as never).venue;
assert.equal(nameOut.name, 'Grosse Halle', 'der eingelesene Raum-Name gewinnt');

// Ohne eingelesenen Namen bleibt es beim Projektnamen — light hat dann nichts
// Besseres, und das ist kein erfundener Wert, sondern der beste verfuegbare.
const ownName = toVenueExchange({
  venueName: 'Lichtplan Show A', persons: [], walls: [], stageElements: [], floorPlan: null,
  appVersion: '1.0.0', exportedAt: 't',
} as never).venue;
assert.equal(ownName.name, 'Lichtplan Show A', 'ohne Eingelesenes gilt der Projektname');

// Der Platzhalter 'Venue' wird nicht aufgehoben: den schreiben beide Apps,
// wenn sie nichts wissen.
const placeholder = fromVenueExchange({ ...roomIn, venue: { ...roomIn.venue, name: 'Venue' } } as never);
assert.equal(placeholder.venueForeign.name, undefined, 'der Platzhalter wird nicht aufgehoben');
console.log('✓ ADR-005: der Raum-Name ueberlebt den Light-Round-Trip');

console.log('\nAlle Venue-Austausch-Checks bestanden.');
