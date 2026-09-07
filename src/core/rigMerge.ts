// ───────────────────────────────────────────────────────────────────────────
// Zwei auseinandergelaufene Kopien desselben Rigs zusammenführen (Bedarf 138, P4).
//
//   > Designer exports a file, sends it to assistant or programmer, both edit
//   > independently. […] 'NO WAY to reconcile differences -> data loss or
//   > manual re-entry'.
//
// Belege: `jkarp7/showstack#38` (2025-12-28) und `#32`. Strukturell garantiert
// wird der Fall vom Nicht-Ziel „no single source of truth" in der
// MVR-xchange-Spezifikation: das Format sieht ausdrücklich NICHT vor, dass
// eine Seite recht behält.
//
// ─── EIN VORSCHLAG, KEINE ÜBERNAHME ────────────────────────────────────────
//
// Was hier entsteht, ist eine LISTE ZUM DURCHGEHEN, kein Ergebnis. Jeder
// Eintrag braucht eine Wahl, und ohne Wahl passiert nichts. Der Beleg
// beschreibt genau die andere Variante — „data loss" —, und die entsteht
// nicht durch fehlende Klugheit, sondern durch eine Anwendung, die sich für
// den Menschen entscheidet.
//
// ─── GANZE OBJEKTE, KEINE FELDER ───────────────────────────────────────────
//
// Übernommen wird immer die ganze Leuchte einer Seite, nie ein Feld hier und
// ein Feld dort. Ein feldweise verschmolzenes Objekt hat es auf keiner der
// beiden Seiten je gegeben: die Adresse aus der einen Fassung mit der Position
// aus der anderen kann eine Kollision ergeben, die niemand geplant hat und
// niemand sieht. Die Feld-Unterschiede stehen trotzdem da — sie sind die
// Begründung für die Wahl, nicht deren Gegenstand.
//
// ─── OHNE GEMEINSAMEN STAND KEIN ABGLEICH ──────────────────────────────────
//
// Ein Zusammenführen braucht drei Fassungen: den Stand, von dem beide
// ausgegangen sind, und die beiden Ergebnisse. Ohne den Stand lässt sich
// „die andere Seite hat es angelegt" nicht von „ich habe es gelöscht"
// unterscheiden — und die falsche der beiden Antworten ist genau der
// Datenverlust aus dem Beleg. Deshalb sagt dieses Modul in dem Fall ab,
// statt zu raten.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type {
  Ceiling, PlacedFixture, ProjectData, StageElement, Truss, Wall,
} from '../types';
import { diffProjects, type FieldChange } from './diff';

/** Die Bereiche, die zusammengeführt werden. Jeder trägt Objekte mit `id`. */
export type MergeCategory =
  | 'fixtures' | 'persons' | 'trusses' | 'walls' | 'stageElements' | 'ceilings';

export const MERGE_CATEGORIES: readonly MergeCategory[] = [
  'fixtures', 'persons', 'trusses', 'walls', 'stageElements', 'ceilings',
];

export const CATEGORY_LABEL: Readonly<Record<MergeCategory, string>> = {
  fixtures: 'Leuchten',
  persons: 'Personen',
  trusses: 'Traversen',
  walls: 'Wände',
  stageElements: 'Bühne',
  ceilings: 'Decken',
};

/** Welche Fassung gemeint ist. */
export type MergeSide = 'mine' | 'theirs';

export const SIDE_LABEL: Readonly<Record<MergeSide, string>> = {
  mine: 'meine Fassung',
  theirs: 'die andere Fassung',
};

export type MergeKind =
  /** Nur auf einer Seite dazugekommen. */
  | 'added'
  /** Nur auf einer Seite gelöscht. */
  | 'removed'
  /** Nur auf einer Seite geändert. */
  | 'changed'
  /** Beide haben dasselbe getan. Keine Frage, kein Konflikt. */
  | 'both-same'
  /**
   * Beide haben etwas getan, und zwar Verschiedenes — oder eine Seite hat
   * gelöscht, während die andere geändert hat. Das ist der Fall, um den es
   * dem Beleg geht.
   */
  | 'conflict';

export const KIND_LABEL: Readonly<Record<MergeKind, string>> = {
  added: 'hinzugefügt',
  removed: 'gelöscht',
  changed: 'geändert',
  'both-same': 'beide gleich',
  conflict: 'Konflikt',
};

export interface MergeEntry {
  category: MergeCategory;
  id: string;
  /** Wie das Objekt heißt — in der Sprache des Versions-Vergleichs. */
  label: string;
  kind: MergeKind;
  /** Wer es getan hat. Bei `conflict` und `both-same` beide, deshalb leer. */
  side?: MergeSide;
  /**
   * Die Feld-Unterschiede zwischen den beiden Fassungen. `from` ist MEINE,
   * `to` die andere — die Richtung steht in der Oberfläche, damit sie sich
   * niemand zusammenreimt.
   */
  fields: FieldChange[];
  /**
   * Was übernommen werden soll. Solange sie fehlt, passiert nichts: eine
   * Vorbelegung wäre eine Entscheidung, die niemand getroffen hat.
   */
  choice?: MergeSide;
}

export type MergeRefusal =
  /** Der Stand ist leer — er kann nicht der Ursprung von irgendetwas sein. */
  | 'empty-base'
  /** Der Stand teilt mit keiner der beiden Fassungen ein einziges Objekt. */
  | 'unrelated-base';

export const MERGE_REFUSAL_LABEL: Readonly<Record<MergeRefusal, string>> = {
  'empty-base':
    'Der gewählte Stand ist leer. Ohne einen gemeinsamen Ausgangspunkt lässt sich „neu angelegt" nicht von „gelöscht" unterscheiden.',
  'unrelated-base':
    'Der gewählte Stand gehört zu keiner der beiden Fassungen — kein einziges Objekt kommt darin vor. Wähle den Stand, von dem beide ausgegangen sind.',
};

export interface MergePlan {
  entries: MergeEntry[];
  /** Einträge, die noch keine Wahl haben. */
  open: number;
  counts: Record<MergeKind, number>;
  /**
   * Was dieser Abgleich NICHT anfasst. Steht in der Oberfläche: eine
   * Zusammenführung, die schweigt, wird für vollständig gehalten.
   */
  untouched: string[];
}

// ─── Hilfen ────────────────────────────────────────────────────────────────

type Item = PlacedFixture | Truss | Wall | StageElement | Ceiling | { id: string };

const listOf = (doc: ProjectData, c: MergeCategory): Item[] =>
  ((doc as unknown as Record<string, Item[] | undefined>)[c] ?? []);

const byId = (list: readonly Item[]): Map<string, Item> =>
  new Map(list.map((x) => [x.id, x]));

/** Gleich im Sinne von „dasselbe Objekt", tief verglichen. */
const gleich = (a: Item | undefined, b: Item | undefined): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Wie der Versions-Vergleich ein Objekt beschriftet und seine Felder nennt.
 *
 * Bewusst über `diffProjects` und nicht über eine eigene Feldliste: sonst
 * hiesse dasselbe Feld im Abgleich anders als im Versions-Vergleich, den
 * derselbe Mensch fünf Minuten vorher gelesen hat.
 */
function beschreibung(
  mine: ProjectData,
  theirs: ProjectData,
): Map<string, { label: string; fields: FieldChange[] }> {
  const out = new Map<string, { label: string; fields: FieldChange[] }>();
  const d = diffProjects(mine, theirs);
  for (const c of MERGE_CATEGORIES) {
    const cd = d[c];
    for (const x of cd.added) out.set(`${c}:${x.id}`, { label: x.label, fields: [] });
    for (const x of cd.removed) out.set(`${c}:${x.id}`, { label: x.label, fields: [] });
    for (const x of cd.changed) out.set(`${c}:${x.id}`, { label: x.label, fields: x.fields });
  }
  return out;
}

/** Bereiche, die dieser Abgleich nicht anfasst — und die es im Plan gibt. */
function untouchedAreas(mine: ProjectData, theirs: ProjectData): string[] {
  const out: string[] = [];
  const da = (a: unknown[] | undefined, b: unknown[] | undefined): boolean =>
    (a?.length ?? 0) > 0 || (b?.length ?? 0) > 0;
  if (da(mine.shapes, theirs.shapes)) out.push('Formen und Beschriftungen');
  if (da(mine.scenes, theirs.scenes)) out.push('Szenen');
  if (da(mine.cameras, theirs.cameras)) out.push('Kamera-Blicke');
  if (da(mine.customFixtures, theirs.customFixtures)) out.push('eigene Gerätetypen');
  if (da(mine.workNotes, theirs.workNotes)) out.push('Arbeits-Notizen');
  if (da(mine.fixtureGroups, theirs.fixtureGroups)) out.push('Gruppen');
  if (mine.floorPlan || theirs.floorPlan) out.push('Gebäudeplan');
  return out;
}

// ─── Die Engstelle ─────────────────────────────────────────────────────────

/**
 * Der Vorschlag: was sich zwischen den beiden Fassungen unterscheidet, und
 * wer es getan hat.
 *
 * Nichts davon ist angewendet. `applyMerge` nimmt später NUR die Einträge,
 * die eine Wahl tragen.
 */
export function mergePlan(
  base: ProjectData,
  mine: ProjectData,
  theirs: ProjectData,
): MergePlan | { refusal: MergeRefusal } {
  const baseIds = new Set<string>();
  for (const c of MERGE_CATEGORIES) for (const x of listOf(base, c)) baseIds.add(`${c}:${x.id}`);
  if (baseIds.size === 0) return { refusal: 'empty-base' };

  const kennt = (doc: ProjectData): boolean =>
    MERGE_CATEGORIES.some((c) => listOf(doc, c).some((x) => baseIds.has(`${c}:${x.id}`)));
  const hatEigene = (doc: ProjectData): boolean =>
    MERGE_CATEGORIES.some((c) => listOf(doc, c).length > 0);
  // Der Stand ist fremd, wenn er mit KEINER Seite ein Objekt teilt UND
  // mindestens eine Seite ueberhaupt etwas hat. Die Einschraenkung ist
  // noetig: haben beide Seiten alles geloescht, teilen sie mit dem Stand
  // ebenfalls nichts — das ist aber ein gueltiger Zustand und keine falsche
  // Wahl. Ohne sie saegte dieses Modul ausgerechnet dem Fall ab, in dem beide
  // Seiten sich einig sind.
  if (!kennt(mine) && !kennt(theirs) && (hatEigene(mine) || hatEigene(theirs))) {
    return { refusal: 'unrelated-base' };
  }

  const texte = beschreibung(mine, theirs);
  const entries: MergeEntry[] = [];

  for (const c of MERGE_CATEGORIES) {
    const b = byId(listOf(base, c));
    const m = byId(listOf(mine, c));
    const t = byId(listOf(theirs, c));
    const alle = new Set([...b.keys(), ...m.keys(), ...t.keys()]);

    for (const id of alle) {
      const inB = b.get(id);
      const inM = m.get(id);
      const inT = t.get(id);

      // Auf beiden Seiten unveraendert gegenueber dem Stand: nichts zu tun.
      if (gleich(inM, inT)) continue;

      const text = texte.get(`${c}:${id}`);
      const label = text?.label ?? id;
      const fields = text?.fields ?? [];
      const eintrag = (kind: MergeKind, side?: MergeSide): MergeEntry =>
        ({ category: c, id, label, kind, fields, ...(side ? { side } : {}) });

      const meinsGeaendert = !gleich(inB, inM);
      const ihrsGeaendert = !gleich(inB, inT);

      if (!inB) {
        // Beide Seiten haben es NEU — mit derselben id, aber verschieden.
        // Das passiert bei kopierten Plaenen und ist ein echter Konflikt.
        if (inM && inT) { entries.push(eintrag('conflict')); continue; }
        entries.push(eintrag('added', inM ? 'mine' : 'theirs'));
        continue;
      }

      if (!inM && !inT) continue; // beide geloescht — Einigkeit
      if (!inM || !inT) {
        // Eine Seite hat geloescht. Hat die andere geaendert, ist das der
        // Fall, um den es dem Beleg geht: ein stilles Uebernehmen der
        // Loeschung wirft die Arbeit der anderen Seite weg.
        const andereGeaendert = !inM ? ihrsGeaendert : meinsGeaendert;
        if (andereGeaendert) { entries.push(eintrag('conflict')); continue; }
        entries.push(eintrag('removed', !inM ? 'mine' : 'theirs'));
        continue;
      }

      if (meinsGeaendert && ihrsGeaendert) { entries.push(eintrag('conflict')); continue; }
      entries.push(eintrag('changed', meinsGeaendert ? 'mine' : 'theirs'));
    }
  }

  // Feste Reihenfolge: Konflikte zuerst (die brauchen einen Menschen), dann
  // nach Bereich und Beschriftung. Ohne sie saehe dieselbe Zusammenfuehrung
  // zweimal anders aus.
  const rang: Record<MergeKind, number> = {
    conflict: 0, changed: 1, added: 2, removed: 3, 'both-same': 4,
  };
  entries.sort((a, x) => rang[a.kind] - rang[x.kind]
    || MERGE_CATEGORIES.indexOf(a.category) - MERGE_CATEGORIES.indexOf(x.category)
    || a.label.localeCompare(x.label, 'de')
    || a.id.localeCompare(x.id));

  const counts: Record<MergeKind, number> = {
    added: 0, removed: 0, changed: 0, 'both-same': 0, conflict: 0,
  };
  for (const e of entries) counts[e.kind] += 1;

  return {
    entries,
    open: entries.length,
    counts,
    untouched: untouchedAreas(mine, theirs),
  };
}

/**
 * Anwenden — und zwar NUR, was eine Wahl trägt.
 *
 * Ein Eintrag ohne Wahl bleibt, wie er in meiner Fassung ist. Das ist die
 * sichere Richtung: wer nichts entschieden hat, bekommt seinen eigenen Stand
 * zurück und nicht den einer anderen Datei.
 */
export function applyMerge(
  mine: ProjectData,
  theirs: ProjectData,
  entries: readonly MergeEntry[],
): ProjectData {
  const out: ProjectData = { ...mine };

  for (const c of MERGE_CATEGORIES) {
    const m = byId(listOf(mine, c));
    const t = byId(listOf(theirs, c));
    const ziel = new Map(m);

    for (const e of entries) {
      if (e.category !== c || !e.choice) continue;
      if (e.choice === 'mine') continue; // meine Fassung steht schon drin
      const ihres = t.get(e.id);
      if (ihres) ziel.set(e.id, ihres);
      else ziel.delete(e.id);
    }

    // Reihenfolge: erst meine in ihrer bisherigen Folge, dann das Neue aus
    // der anderen Fassung. Eine Sortierung nach id waere zwar stabil, wuerfe
    // aber die Zeichen-Reihenfolge des eigenen Plans durcheinander.
    const geordnet: Item[] = [];
    for (const x of listOf(mine, c)) { const v = ziel.get(x.id); if (v) { geordnet.push(v); ziel.delete(x.id); } }
    for (const x of listOf(theirs, c)) { const v = ziel.get(x.id); if (v) { geordnet.push(v); ziel.delete(x.id); } }
    (out as unknown as Record<string, Item[]>)[c] = geordnet;
  }

  return out;
}

/** Wie viele Einträge noch auf eine Wahl warten. */
export const openCount = (entries: readonly MergeEntry[]): number =>
  entries.filter((e) => !e.choice).length;
