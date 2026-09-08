// Project version diff — "what changed since the last version?". Compares two
// project documents item-by-item (by id) and reports added / removed / changed
// fixtures, persons, trusses, walls, stage elements and ceilings, with the
// concrete field changes per item. Pure data in, a structured diff out.
import type {
  ProjectData, PlacedFixture, Person, Truss, Wall, StageElement, Ceiling,
  Shape, Fixture, FixtureGroup, Scene, CameraView, Layers, LayerKey,
  FloorMaterial, SunSettings,
} from '../types';
import { gelLibrary } from './gelLibrary';

export interface FieldChange { field: string; from: string; to: string }
export interface ItemChange { id: string; label: string; fields: FieldChange[] }
export interface CategoryDiff {
  added: { id: string; label: string }[];
  removed: { id: string; label: string }[];
  changed: ItemChange[];
}
export interface ProjectDiff {
  fixtures: CategoryDiff;
  persons: CategoryDiff;
  trusses: CategoryDiff;
  walls: CategoryDiff;
  stageElements: CategoryDiff;
  ceilings: CategoryDiff;
  // ── B-21, zweite Haelfte: die uebrigen acht Kategorien ──────────────────
  shapes: CategoryDiff;
  customFixtures: CategoryDiff;
  fixtureGroups: CategoryDiff;
  scenes: CategoryDiff;
  cameras: CategoryDiff;
  /** `layers`, `floor` und `sun` sind KEINE Listen — je ein Einzelstueck. */
  layers: CategoryDiff;
  floor: CategoryDiff;
  sun: CategoryDiff;
  total: number;
  /**
   * Kategorien, die sich UNTERSCHEIDEN, aber nicht aufgeschluesselt werden —
   * beim Namen genannt (B-21).
   *
   * `diffProjects` vergleicht sechs von vierzehn inhaltlichen Kategorien
   * Feld fuer Feld. Fuer die uebrigen acht fehlt, was ein solcher Vergleich
   * braucht: eine Beschriftungsfunktion und eine Feldliste — welche Felder
   * eine Aenderung AUSMACHEN und wie sie heissen, ist eine
   * Produktentscheidung, und `layers`, `floor` und `sun` sind ueberdies keine
   * Listen, auf die `diffList` passt.
   *
   * Was daraus NICHT folgt: dass die Oberflaeche „Keine Unterschiede zum
   * aktuellen Stand" sagen darf, wenn sich eine dieser acht geaendert hat.
   * Das ist keine Luecke in der Anzeige, sondern eine Falschaussage — der
   * Nutzer verwirft daraufhin eine Version, die sich sehr wohl unterscheidet.
   *
   * Ob sich etwas geaendert hat, laesst sich ohne jede Produktentscheidung
   * feststellen: ein Vergleich der Werte. Nur das WAS bleibt offen. Also
   * sagen wir genau das — „Szenen unterscheiden sich" — statt zu schweigen.
   */
  unnamed: string[];
}

// A field to watch: how to read it (as a display string) and its German label.
interface FieldSpec<T> { label: string; get: (t: T) => string }

const num = (n: number | undefined, unit = '') => (n == null ? '–' : `${Math.round(n * 100) / 100}${unit}`);
const gelNames = (ids?: string[]) =>
  (ids ?? []).map((id) => gelLibrary.find((g) => g.id === id)?.code ?? id).join('+') || '–';

function diffList<T extends { id: string }>(
  before: T[], after: T[], label: (t: T) => string, specs: FieldSpec<T>[],
): CategoryDiff {
  const a = new Map(before.map((t) => [t.id, t]));
  const b = new Map(after.map((t) => [t.id, t]));
  const added = after.filter((t) => !a.has(t.id)).map((t) => ({ id: t.id, label: label(t) }));
  const removed = before.filter((t) => !b.has(t.id)).map((t) => ({ id: t.id, label: label(t) }));
  const changed: ItemChange[] = [];
  for (const [id, prev] of a) {
    const next = b.get(id);
    if (!next) continue;
    const fields: FieldChange[] = [];
    for (const s of specs) {
      const from = s.get(prev), to = s.get(next);
      if (from !== to) fields.push({ field: s.label, from, to });
    }
    if (fields.length) changed.push({ id, label: label(next), fields });
  }
  return { added, removed, changed };
}

const fixtureLabel = (f: PlacedFixture) =>
  (f.unitNumber ? `#${f.unitNumber} ` : f.channel != null ? `Ch ${f.channel} ` : '') + f.fixture.name;

const FIXTURE_FIELDS: FieldSpec<PlacedFixture>[] = [
  { label: 'Position', get: (f) => `${num(f.x)},${num(f.y)}` },
  { label: 'Höhe', get: (f) => num(f.mountingHeight, ' m') },
  { label: 'Ziel', get: (f) => `${num(f.aimX)},${num(f.aimY)}` },
  { label: 'Dimmer', get: (f) => num(f.dimming, ' %') },
  { label: 'Kanal', get: (f) => (f.channel == null ? '–' : String(f.channel)) },
  { label: 'DMX', get: (f) => (f.universe != null && f.dmxAddress != null ? `${f.universe}.${f.dmxAddress}` : '–') },
  { label: 'Farbtemp.', get: (f) => num(f.currentColorTemp, ' K') },
  { label: 'Gel', get: (f) => gelNames(f.gelFilterIds) },
  { label: 'Zweck', get: (f) => f.purpose || '–' },
  { label: 'Stummgeschaltet', get: (f) => (f.hidden ? 'ja' : 'nein') },
  { label: 'Fokussiert', get: (f) => (f.focused ? 'ja' : 'nein') },
  { label: 'Fokus-Notiz', get: (f) => f.focusNote || '–' },
];

const personLabel = (p: Person) => p.label || `Person ${num(p.height, ' m')}`;
const PERSON_FIELDS: FieldSpec<Person>[] = [
  { label: 'Position', get: (p) => `${num(p.x)},${num(p.y)}` },
  { label: 'Größe', get: (p) => num(p.height, ' m') },
  { label: 'Pose', get: (p) => p.pose || 'standing' },
  { label: 'Blickrichtung', get: (p) => num(p.facing, '°') },
];

const trussLabel = (t: Truss) => t.label || 'Traverse';
const TRUSS_FIELDS: FieldSpec<Truss>[] = [
  { label: 'Start', get: (t) => `${num(t.x1)},${num(t.y1)}` },
  { label: 'Ende', get: (t) => `${num(t.x2)},${num(t.y2)}` },
  { label: 'Höhe', get: (t) => num(t.height, ' m') },
  { label: 'Traglast', get: (t) => num(t.capacity, ' kg') },
];

const wallLabel = (w: Wall) => w.label || 'Wand';
const WALL_FIELDS: FieldSpec<Wall>[] = [
  { label: 'Höhe', get: (w) => num(w.height, ' m') },
  { label: 'Reflexion', get: (w) => num(w.reflectance) },
  { label: 'Farbe', get: (w) => w.color },
  { label: 'Oberfläche', get: (w) => w.material || 'plaster' },
];

const stageLabel = (s: StageElement) => s.label || 'Bühne';
const STAGE_FIELDS: FieldSpec<StageElement>[] = [
  { label: 'Position', get: (s) => `${num(s.x)},${num(s.y)}` },
  { label: 'Größe', get: (s) => `${num(s.width)}×${num(s.depth)} m` },
  { label: 'Höhe', get: (s) => num(s.height, ' m') },
];

const ceilingLabel = (c: Ceiling) => c.label || 'Decke';
const CEILING_FIELDS: FieldSpec<Ceiling>[] = [
  { label: 'Höhe', get: (c) => num(c.height, ' m') },
  { label: 'Reflexion', get: (c) => num(c.reflectance) },
];

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        out[k] = (val as Record<string, unknown>)[k];
      }
      return out;
    }
    return val;
  }) ?? 'undefined';

// ───────────────────────────────────────────────────────────────────────────
// B-21, zweite Haelfte: die uebrigen acht Kategorien, Feld fuer Feld.
//
// Der Eintrag nannte als Grund fuer das Warten zwei Dinge: eine
// Beschriftungsfunktion und eine Feldliste je Kategorie („welche Felder eine
// Aenderung AUSMACHEN und wie sie benannt werden"), und dass `layers`, `floor`
// und `sun` keine Listen sind, auf die `diffList` passt.
//
// Beides ist hier beantwortet, und zwar nach EINER Regel, damit es keine
// Geschmacksfrage bleibt: aufgezaehlt wird, was der Nutzer im Dialog SETZEN
// kann, mit dem Namen, den die Oberflaeche dafuer benutzt. Kein Feld wird
// weggelassen, weil es „unwichtig" waere — genau dieses Weglassen ist der
// Defekt, gegen den B-21 angetreten ist.
//
// Fuer die drei Einzelstuecke gibt es `diffSingle`: dieselbe `CategoryDiff`-
// Form, aber mit genau einer moeglichen Zeile. Ein Einzelstueck kann
// hinzukommen (vorher nicht gesetzt), wegfallen (jetzt nicht mehr gesetzt)
// oder sich aendern — dieselben drei Faelle wie bei einer Liste, nur ohne Id.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Ein Einzelstueck (kein Listenelement) vergleichen.
 *
 * `id` ist der feste Schluessel des Stuecks — es gibt nur eines davon, und
 * der Dialog braucht trotzdem etwas, woran er die Zeile haengt.
 */
function diffSingle<T>(
  before: T | undefined, after: T | undefined,
  id: string, label: string, specs: FieldSpec<T>[],
): CategoryDiff {
  if (before === undefined && after === undefined) return { added: [], removed: [], changed: [] };
  if (before === undefined) return { added: [{ id, label }], removed: [], changed: [] };
  if (after === undefined) return { added: [], removed: [{ id, label }], changed: [] };
  const fields: FieldChange[] = [];
  for (const s of specs) {
    const from = s.get(before), to = s.get(after);
    if (from !== to) fields.push({ field: s.label, from, to });
  }
  return { added: [], removed: [], changed: fields.length ? [{ id, label, fields }] : [] };
}

const punkte = (ps?: { x: number; y: number }[]) =>
  (ps ?? []).map((p) => `${num(p.x)},${num(p.y)}`).join(' ') || '–';

const shapeLabel = (s: Shape) => s.label || (s.type === 'measure' ? 'Maß' : s.type === 'line' ? 'Linie' : 'Rechteck');
const SHAPE_FIELDS: FieldSpec<Shape>[] = [
  { label: 'Art', get: (s) => s.type },
  { label: 'Punkte', get: (s) => punkte(s.points) },
  { label: 'Farbe', get: (s) => s.color },
];

const customFixtureLabel = (f: Fixture) => `${f.manufacturer} ${f.name}`.trim() || f.id;
const CUSTOM_FIXTURE_FIELDS: FieldSpec<Fixture>[] = [
  { label: 'Kategorie', get: (f) => f.category },
  { label: 'Leistung', get: (f) => num(f.wattage, ' W') },
  { label: 'Lichtstrom', get: (f) => num(f.lumens, ' lm') },
  { label: 'Beam', get: (f) => num(f.beamAngle, '°') },
  { label: 'Field', get: (f) => num(f.fieldAngle, '°') },
  { label: 'Zoom', get: (f) => (f.zoomRange ? `${num(f.zoomRange[0], '°')}–${num(f.zoomRange[1], '°')}` : '–') },
  { label: 'Farbtemp.', get: (f) => num(f.colorTemp, ' K') },
  { label: 'Gewicht', get: (f) => num(f.weight, ' kg') },
  { label: 'Montage', get: (f) => f.mountType },
  { label: 'DMX-Kanäle', get: (f) => (f.dmxChannels == null ? '–' : String(f.dmxChannels)) },
  { label: 'Stromanschluss', get: (f) => f.powerConnector || '–' },
];

const groupLabel = (g: FixtureGroup) => g.label || 'Gruppe';
const GROUP_FIELDS: FieldSpec<FixtureGroup>[] = [
  // Sortiert verglichen: die REIHENFOLGE in einer Gruppe bedeutet nichts, und
  // eine Umsortierung als Aenderung zu melden waere ein falscher Alarm.
  { label: 'Leuchten', get: (g) => [...(g.fixtureIds ?? [])].sort().join(', ') || '–' },
  { label: 'Anzahl', get: (g) => String((g.fixtureIds ?? []).length) },
];

const sceneLabel = (s: Scene) => s.name || 'Szene';
const SCENE_FIELDS: FieldSpec<Scene>[] = [
  { label: 'Übergeordnet', get: (s) => s.parentId || '–' },
  // Die Zustaende sind eine Abbildung Leuchte -> Werte. Verglichen wird ihr
  // Inhalt, nicht ihre Schluesselreihenfolge (siehe `stable`), und gemeldet
  // wird, WIE VIELE Leuchten die Szene stellt und welche sich geaendert haben.
  { label: 'Gestellte Leuchten', get: (s) => String(Object.keys(s.states ?? {}).length) },
  { label: 'Werte', get: (s) => stable(s.states) },
];

const cameraLabel = (c: CameraView) => c.label || 'Kamera';
const CAMERA_FIELDS: FieldSpec<CameraView>[] = [
  { label: 'Position', get: (c) => `${num(c.x)},${num(c.y)}` },
  { label: 'Augenhöhe', get: (c) => num(c.height, ' m') },
  { label: 'Ziel', get: (c) => `${num(c.aimX)},${num(c.aimY)}` },
  { label: 'Bildwinkel', get: (c) => num(c.fov, '°') },
];

/** Die Ebenen-Schluessel in fester Reihenfolge — sonst wackelt die Meldung. */
const LAYER_KEYS: LayerKey[] = [
  'fixtures', 'persons', 'trusses', 'stage', 'shapes', 'ceilings', 'walls', 'floorPlan',
];
const LAYER_LABEL: Record<LayerKey, string> = {
  fixtures: 'Leuchten', persons: 'Personen', trusses: 'Traversen', stage: 'Bühne',
  shapes: 'Formen', ceilings: 'Decken', walls: 'Wände', floorPlan: 'Grundriss',
};
const LAYER_FIELDS: FieldSpec<Layers>[] = LAYER_KEYS.map((k) => ({
  label: LAYER_LABEL[k],
  get: (l: Layers) => {
    const info = l?.[k];
    if (!info) return '–';
    return `${info.visible ? 'sichtbar' : 'verborgen'}, ${info.locked ? 'gesperrt' : 'frei'}`;
  },
}));

const FLOOR_FIELDS: FieldSpec<FloorMaterial>[] = [
  { label: 'Vorlage', get: (f) => f.preset },
  { label: 'Farbe', get: (f) => f.color },
];

const SUN_FIELDS: FieldSpec<SunSettings>[] = [
  { label: 'Aktiv', get: (s) => (s.enabled ? 'ja' : 'nein') },
  { label: 'Ort', get: (s) => `${num(s.latitude, '°')} / ${num(s.longitude, '°')}` },
  { label: 'Datum', get: (s) => s.date || '–' },
  { label: 'Uhrzeit', get: (s) => s.time || '–' },
  { label: 'Nordrichtung', get: (s) => num(s.northDeg, '°') },
  { label: 'Stärke', get: (s) => num(s.intensity, ' lx') },
];

const count = (d: CategoryDiff) => d.added.length + d.removed.length + d.changed.length;

/**
 * Kategorien, die sich unterscheiden, aber nicht aufgeschluesselt sind.
 *
 * B-21, zweite Haelfte (2026-09-08): Es gibt keine mehr — alle vierzehn
 * inhaltlichen Kategorien werden Feld fuer Feld verglichen. Die Funktion
 * bleibt, weil `ProjectDiff.unnamed` das Versprechen der Oberflaeche traegt
 * („Keine Unterschiede" nur, wenn WIRKLICH keine da sind), und weil eine
 * fuenfzehnte Kategorie sonst wieder still durchfallen wuerde.
 *
 * Sie vergleicht deshalb den GANZEN Datensatz gegen die Summe dessen, was
 * `diffProjects` abdeckt: was uebrigbleibt, wird beim Namen genannt. Neu
 * hinzukommende Felder in `ProjectData` fallen damit von selbst auf, statt
 * auf eine Liste zu warten, die jemand nachzieht.
 */
const VERGLICHENE_SCHLUESSEL: readonly (keyof ProjectData)[] = [
  'fixtures', 'persons', 'trusses', 'walls', 'stageElements', 'ceilings',
  'shapes', 'customFixtures', 'fixtureGroups', 'scenes', 'cameras',
  'layers', 'floor', 'sun',
];

/**
 * Schluessel, die KEINE inhaltliche Kategorie sind und deshalb nicht als
 * Unterschied gelten. Jeder mit Begruendung — eine stille Ausnahme waere
 * genau das Loch, das B-21 beschrieben hat.
 */
const KEINE_KATEGORIE: readonly (keyof ProjectData)[] = [
  // Der Kopf des Projekts: Name, Autor, Zeitstempel. `updatedAt` aendert sich
  // bei JEDEM Speichern — als Unterschied gemeldet waere jede Version
  // "geaendert", und die Aussage waere wertlos.
  'meta',
  // Wie Universe-Zahlen zu lesen sind und welche Phasen der Anschluss fuehrt:
  // Angaben ueber den Plan, keine Gegenstaende in ihm. Sie erscheinen in
  // eigenen Dialogen mit eigener Anzeige.
  'dmxProtocol', 'phaseTemplate',
  // Der Grundriss ist ein Bild; ein Feld-Vergleich waere ein Byte-Vergleich.
  'floorPlan',
];

export function unnamedDifferences(before: ProjectData, after: ProjectData): string[] {
  const alle = new Set<string>([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const offen: string[] = [];
  for (const key of alle) {
    if ((VERGLICHENE_SCHLUESSEL as readonly string[]).includes(key)) continue;
    if ((KEINE_KATEGORIE as readonly string[]).includes(key)) continue;
    const a = (before as unknown as Record<string, unknown>)?.[key];
    const b = (after as unknown as Record<string, unknown>)?.[key];
    if (stable(a) !== stable(b)) offen.push(key);
  }
  return offen.sort();
}

export function diffProjects(before: ProjectData, after: ProjectData): ProjectDiff {
  const d: Omit<ProjectDiff, 'total' | 'unnamed'> = {
    fixtures: diffList(before.fixtures ?? [], after.fixtures ?? [], fixtureLabel, FIXTURE_FIELDS),
    persons: diffList(before.persons ?? [], after.persons ?? [], personLabel, PERSON_FIELDS),
    trusses: diffList(before.trusses ?? [], after.trusses ?? [], trussLabel, TRUSS_FIELDS),
    walls: diffList(before.walls ?? [], after.walls ?? [], wallLabel, WALL_FIELDS),
    stageElements: diffList(before.stageElements ?? [], after.stageElements ?? [], stageLabel, STAGE_FIELDS),
    ceilings: diffList(before.ceilings ?? [], after.ceilings ?? [], ceilingLabel, CEILING_FIELDS),
    shapes: diffList(before.shapes ?? [], after.shapes ?? [], shapeLabel, SHAPE_FIELDS),
    customFixtures: diffList(before.customFixtures ?? [], after.customFixtures ?? [], customFixtureLabel, CUSTOM_FIXTURE_FIELDS),
    fixtureGroups: diffList(before.fixtureGroups ?? [], after.fixtureGroups ?? [], groupLabel, GROUP_FIELDS),
    scenes: diffList(before.scenes ?? [], after.scenes ?? [], sceneLabel, SCENE_FIELDS),
    cameras: diffList(before.cameras ?? [], after.cameras ?? [], cameraLabel, CAMERA_FIELDS),
    layers: diffSingle(before.layers, after.layers, 'layers', 'Ebenen', LAYER_FIELDS),
    floor: diffSingle(before.floor, after.floor, 'floor', 'Boden', FLOOR_FIELDS),
    sun: diffSingle(before.sun, after.sun, 'sun', 'Sonne', SUN_FIELDS),
  };
  const total = ALLE_KATEGORIEN.reduce((n, k) => n + count(d[k]), 0);
  return { ...d, total, unnamed: unnamedDifferences(before, after) };
}

/**
 * Die Kategorien des Vergleichs, in Anzeigereihenfolge — als DATEN.
 *
 * B-21 (2026-09-08): `total` wurde vorher als Summe von sechs handgeschriebenen
 * `count(...)`-Aufrufen gebildet. Eine siebte Kategorie haette man dort
 * vergessen koennen, und dann waere `total` wieder kleiner als die Wahrheit —
 * derselbe Defekt eine Ebene tiefer. Jetzt zaehlt die Liste, und der Test
 * haelt fest, dass sie vollstaendig ist.
 */
export const ALLE_KATEGORIEN = [
  'fixtures', 'persons', 'trusses', 'walls', 'stageElements', 'ceilings',
  'shapes', 'customFixtures', 'fixtureGroups', 'scenes', 'cameras',
  'layers', 'floor', 'sun',
] as const satisfies readonly (keyof Omit<ProjectDiff, 'total' | 'unnamed'>)[];

/** Anzeigename je Kategorie — Einzahl und Mehrzahl, fuer Dialog und Zeitachse. */
export const KATEGORIE_NAMEN: Record<(typeof ALLE_KATEGORIEN)[number], [string, string]> = {
  fixtures: ['Leuchte', 'Leuchten'],
  persons: ['Person', 'Personen'],
  trusses: ['Traverse', 'Traversen'],
  walls: ['Wand', 'Wände'],
  stageElements: ['Bühne', 'Bühnen'],
  ceilings: ['Decke', 'Decken'],
  shapes: ['Form', 'Formen'],
  customFixtures: ['Eigene Leuchte', 'Eigene Leuchten'],
  fixtureGroups: ['Gruppe', 'Gruppen'],
  scenes: ['Szene', 'Szenen'],
  cameras: ['Kamera', 'Kameras'],
  layers: ['Ebenen', 'Ebenen'],
  floor: ['Boden', 'Boden'],
  sun: ['Sonne', 'Sonne'],
};

export const categoryCount = count;

// A short human label for the change between two states (for the undo timeline
// and the activity log). e.g. "+1 Leuchte", "Leuchte verschoben, +1 Wand".
export function summarizeChange(before: Partial<ProjectData>, after: Partial<ProjectData>): string {
  const d = diffProjects(before as ProjectData, after as ProjectData);
  const parts: string[] = [];
  const add = (cd: CategoryDiff, sing: string, plur: string) => {
    if (cd.added.length) parts.push(`+${cd.added.length} ${cd.added.length === 1 ? sing : plur}`);
    if (cd.removed.length) parts.push(`−${cd.removed.length} ${cd.removed.length === 1 ? sing : plur}`);
    if (cd.changed.length) parts.push(`${cd.changed.length} ${cd.changed.length === 1 ? sing : plur} geändert`);
  };
  // Alle vierzehn, aus der Liste — kein handgeschriebener Satz mehr, der
  // beim Hinzufuegen einer Kategorie stehenbleibt. Der Not-Zweig fuer
  // `shapes` ist damit ebenfalls weg: Formen sind jetzt eine Kategorie wie
  // jede andere, und die Zeitachse sagt "+1 Form" statt "Form bearbeitet".
  for (const key of ALLE_KATEGORIEN) {
    const [sing, plur] = KATEGORIE_NAMEN[key];
    add(d[key], sing, plur);
  }
  if (parts.length === 0) return d.unnamed.length ? `${d.unnamed.join(', ')} geändert` : 'Geändert';
  return parts.slice(0, 3).join(', ');
}
