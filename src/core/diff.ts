// Project version diff — "what changed since the last version?". Compares two
// project documents item-by-item (by id) and reports added / removed / changed
// fixtures, persons, trusses, walls, stage elements and ceilings, with the
// concrete field changes per item. Pure data in, a structured diff out.
import type {
  ProjectData, PlacedFixture, Person, Truss, Wall, StageElement, Ceiling,
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

const count = (d: CategoryDiff) => d.added.length + d.removed.length + d.changed.length;

/**
 * Die acht Kategorien ohne Feld-Vergleich, mit ihrem Anzeigenamen.
 *
 * Gerechnet und nicht behauptet: `same` vergleicht die Werte. Ein reiner
 * Referenzvergleich waere falsch (jedes Laden baut neue Objekte), ein
 * JSON-Vergleich ueber Schluesselreihenfolge waere unzuverlaessig — deshalb
 * ein stabiles Serialisieren mit sortierten Schluesseln.
 */
const UNNAMED_CATEGORIES: { label: string; get: (p: ProjectData) => unknown }[] = [
  { label: 'Formen', get: (p) => p.shapes },
  { label: 'Eigene Leuchten', get: (p) => p.customFixtures },
  { label: 'Gruppen', get: (p) => p.fixtureGroups },
  { label: 'Szenen', get: (p) => p.scenes },
  { label: 'Kameras', get: (p) => p.cameras },
  { label: 'Ebenen', get: (p) => p.layers },
  { label: 'Boden', get: (p) => p.floor },
  { label: 'Sonne', get: (p) => p.sun },
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

/** Welche der acht unterscheiden sich? Nur die Namen, kein Feld-Detail. */
export function unnamedDifferences(before: ProjectData, after: ProjectData): string[] {
  return UNNAMED_CATEGORIES
    .filter((c) => stable(c.get(before)) !== stable(c.get(after)))
    .map((c) => c.label);
}

export function diffProjects(before: ProjectData, after: ProjectData): ProjectDiff {
  const d: Omit<ProjectDiff, 'total' | 'unnamed'> = {
    fixtures: diffList(before.fixtures ?? [], after.fixtures ?? [], fixtureLabel, FIXTURE_FIELDS),
    persons: diffList(before.persons ?? [], after.persons ?? [], personLabel, PERSON_FIELDS),
    trusses: diffList(before.trusses ?? [], after.trusses ?? [], trussLabel, TRUSS_FIELDS),
    walls: diffList(before.walls ?? [], after.walls ?? [], wallLabel, WALL_FIELDS),
    stageElements: diffList(before.stageElements ?? [], after.stageElements ?? [], stageLabel, STAGE_FIELDS),
    ceilings: diffList(before.ceilings ?? [], after.ceilings ?? [], ceilingLabel, CEILING_FIELDS),
  };
  const total = count(d.fixtures) + count(d.persons) + count(d.trusses) + count(d.walls) + count(d.stageElements) + count(d.ceilings);
  return { ...d, total, unnamed: unnamedDifferences(before, after) };
}

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
  add(d.fixtures, 'Leuchte', 'Leuchten');
  add(d.persons, 'Person', 'Personen');
  add(d.trusses, 'Traverse', 'Traversen');
  add(d.walls, 'Wand', 'Wände');
  add(d.stageElements, 'Bühne', 'Bühnen');
  add(d.ceilings, 'Decke', 'Decken');
  if (parts.length === 0) {
    // Shapes/annotations aren't in the structured diff — fall back to a coarse check.
    const bs = before.shapes ?? [], as = after.shapes ?? [];
    if (bs.length !== as.length) return as.length > bs.length ? 'Form hinzugefügt' : 'Form entfernt';
    if (JSON.stringify(bs) !== JSON.stringify(as)) return 'Form bearbeitet';
    return 'Geändert';
  }
  return parts.slice(0, 3).join(', ');
}
