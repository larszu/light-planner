// ───────────────────────────────────────────────────────────────────────────
// Gruppen, die die Übergabe überleben (Bedarf 139, P4).
//
//   > MVR carries no fixture groups. Users 'manually recreate complex grouping
//   > structures in each system they use'. […] it 'would significantly speed
//   > up the process of getting a console or a media server up and running
//   > quicker if you have a lot of complex groups on a rig'.
//
// Beleg: `mvrdevelopment/spec#295` (offen, 2026-01-13); der Spezifikationstext
// bestätigt, dass MVR keine Gruppen-Entität kennt.
//
// ─── WAS ES SCHON GAB UND WARUM ES NICHT REICHTE ───────────────────────────
//
// `FixtureGroup` steht seit jeher im Projekt — aber nur als
// Auswahl-Bequemlichkeit auf der Zeichenfläche: eine Leuchte anklicken wählt
// die ganze Gruppe. Sie hiess „Gruppe 3" (durchnummeriert, nie benannt), stand
// auf keinem Blatt, ging in keinen Export und war ausserhalb des Canvas
// unsichtbar.
//
// Genau das beschreibt der Beleg: die Struktur ist da, sie überlebt nur die
// Übergabe nicht — und dann tippt sie jemand am Pult, im Visualisierer und im
// Medienserver noch einmal.
//
// ─── DIE EHRLICHE HÄLFTE ───────────────────────────────────────────────────
//
// MVR kann Gruppen NICHT tragen. Das ist keine Lücke dieses Exports, sondern
// des Formats, und sie lässt sich hier nicht schliessen. Was sich schliessen
// lässt, ist das Verschweigen: der Export sagt, was er nicht mitnimmt, und
// legt daneben das Gruppen-Blatt, aus dem sich die Struktur in Minuten
// nachbauen lässt statt in einer Stunde.
//
// Der Beleg selbst nennt das den Unterschied: `#298` in derselben
// Spezifikation hält fest, dass „every manufacturer implements MVR
// differently" — wer da behauptet, alles gehe mit, schickt jemanden in eine
// Überraschung vor der Probe.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type { FixtureGroup, PlacedFixture, Truss } from '../types';
import {
  DEFAULT_TEMPLATE, type PhaseTemplate, circuitLabel, distributionFor,
} from './powerDistribution';
import { cableRuns } from './rigCables';

/** Was auf dem Blatt steht, wo eine Gruppe keinen Namen bekommen hat. */
export const UNNAMED_GROUP = 'ohne Namen';
/** Was in einer Spalte steht, die für dieses Mitglied leer ist. */
export const NO_VALUE = '—';

/**
 * Ein Mitglied, wie es auf dem Blatt steht.
 *
 * Kanal UND Unit: das Pult kennt den Kanal, der Aufbau die Unit-Nummer, und
 * wer die Gruppe nachbaut, hat je nach System nur eines von beidem zur Hand.
 */
export interface GroupMember {
  fixtureId: string;
  channel?: number;
  unitNumber?: string;
  type: string;
  /** Wo sie hängt — die Traverse, sonst leer. */
  position?: string;
}

export interface ResolvedGroup {
  id: string;
  /** Der Name, wie er dasteht. Leer bleibt nicht leer. */
  label: string;
  members: GroupMember[];
  /**
   * Mitglieder, die es nicht mehr gibt. Sie verschwinden NICHT still: eine
   * Gruppe, die von acht auf sechs schrumpft, ohne dass jemand es sagt, ist
   * am Pult ein Rätsel.
   */
  missing: string[];
}

/** Der Name einer Gruppe, wie er auf ein Blatt gehört. */
export const groupLabel = (g: FixtureGroup): string => g.label.trim() || UNNAMED_GROUP;

/**
 * Gruppen mit ihren Leuchten auflösen.
 *
 * `trusses` ist optional, weil die Position eine Zugabe ist: ohne sie steht
 * dort ein Strich, und das Blatt bleibt benutzbar.
 */
export function resolveGroups(
  groups: readonly FixtureGroup[],
  fixtures: readonly PlacedFixture[],
  trussLabel?: (fixtureId: string) => string | undefined,
): ResolvedGroup[] {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  return groups.map((g) => {
    const members: GroupMember[] = [];
    const missing: string[] = [];
    for (const fid of g.fixtureIds) {
      const f = byId.get(fid);
      if (!f) { missing.push(fid); continue; }
      const position = trussLabel?.(fid);
      members.push({
        fixtureId: fid,
        ...(f.channel !== undefined ? { channel: f.channel } : {}),
        ...(f.unitNumber ? { unitNumber: f.unitNumber } : {}),
        type: f.fixture.name,
        ...(position ? { position } : {}),
      });
    }
    // Nach Kanal, dann Unit: dieselbe Reihenfolge wie die Geräteliste, damit
    // beide Blätter nebeneinander lesbar bleiben.
    members.sort((a, b) => (a.channel ?? 1e9) - (b.channel ?? 1e9)
      || (a.unitNumber ?? '').localeCompare(b.unitNumber ?? '', 'de'));
    return { id: g.id, label: groupLabel(g), members, missing };
  });
}

export const GROUP_HEADERS = ['Gruppe', 'Kanal', 'Unit', 'Typ', 'Position'] as const;

/**
 * Das Gruppen-Blatt — eine Zeile je Mitglied.
 *
 * Es ist das, was jemand am Pult abtippt, und deshalb steht die Gruppe in
 * JEDER Zeile statt einmal als Überschrift: so lässt sich die Datei sortieren,
 * filtern und in eine Tabelle einfügen, ohne dass die Zuordnung verlorengeht.
 */
export function groupTable(
  resolved: readonly ResolvedGroup[],
): { header: string[]; rows: (string | number)[][] } {
  const rows: (string | number)[][] = [];
  for (const g of resolved) {
    for (const m of g.members) {
      rows.push([
        g.label,
        m.channel ?? NO_VALUE,
        m.unitNumber ?? NO_VALUE,
        m.type,
        m.position ?? NO_VALUE,
      ]);
    }
    // Eine leere Gruppe steht trotzdem da. Sonst sähe das Blatt so aus, als
    // gäbe es sie nicht — und wer sie sucht, sucht in der falschen Datei.
    if (g.members.length === 0) {
      rows.push([g.label, NO_VALUE, NO_VALUE, NO_VALUE, NO_VALUE]);
    }
  }
  return { header: [...GROUP_HEADERS], rows };
}

// ─── Was der MVR-Export NICHT mitnimmt ─────────────────────────────────────

export type OmissionKind =
  | 'trusses' | 'groups' | 'gels' | 'purposes' | 'notes' | 'circuits' | 'cables';

export interface MvrOmission {
  kind: OmissionKind;
  /** Wie viele Dinge betroffen sind. 0 heisst: der Fall tritt hier nicht auf. */
  count: number;
  /** Was fehlt, in einem Satz. */
  message: string;
}

/**
 * Die eine Aufstellung dessen, was eine `.mvr` aus diesem Plan NICHT trägt.
 *
 * VORHER STAND DAS IM DIALOG, und zwar für genau einen Fall: die Traversen.
 * Der Kommentar dort begründet ihn ausführlich („der Nutzer bekam eine Zusage,
 * die die Datei nicht hält") — und daneben gingen Gruppen, Farben, Zwecke und
 * Notizen genauso verloren, ohne ein Wort. Eine Ehrlichkeit, die nur den einen
 * Fall nennt, den jemand einmal bemerkt hat, ist eine Liste vom Kenntnisstand
 * ihres Autors; die nächste Auslassung fällt dann wieder niemandem auf.
 *
 * Deshalb hier, berechnet, an einer Stelle — und der Dialog zeigt, was
 * herauskommt.
 */
export function mvrOmissions(
  fixtures: readonly PlacedFixture[],
  trusses: readonly Truss[],
  groups: readonly FixtureGroup[],
  noteCount = 0,
  template: PhaseTemplate = DEFAULT_TEMPLATE,
): MvrOmission[] {
  const out: MvrOmission[] = [];

  if (trusses.length > 0) {
    out.push({
      kind: 'trusses',
      count: trusses.length,
      message: 'MVR bildet hier nur die Lampen ab — die Traversen sind nicht in der Datei.',
    });
  }
  if (groups.length > 0) {
    out.push({
      kind: 'groups',
      count: groups.length,
      // Der Kern des Bedarfs: das Format kennt keine Gruppen. Das ist keine
      // Nachlaessigkeit dieses Exports und laesst sich hier nicht heilen —
      // aber das Gruppen-Blatt daneben macht das Nachbauen kurz.
      message: 'Das MVR-Format kennt keine Gruppen. Nimm das Gruppen-Blatt (CSV) mit — daraus baut sich die Struktur am Pult in Minuten nach.',
    });
  }

  const mitGel = fixtures.filter((f) => (f.gelFilterIds ?? []).length > 0).length;
  if (mitGel > 0) {
    out.push({
      kind: 'gels',
      count: mitGel,
      message: 'Farbfolien stehen nicht in der MVR — dafür gibt es die Farbliste (CSV).',
    });
  }

  const mitZweck = fixtures.filter((f) => (f.purpose ?? '').trim().length > 0).length;
  if (mitZweck > 0) {
    out.push({
      kind: 'purposes',
      count: mitZweck,
      message: 'Der Zweck („Frontlicht Bühne") hat in MVR kein Feld und bleibt in diesem Projekt.',
    });
  }

  // BEDARF 140/141 — die beiden Datenklassen, die das Austauschformat NICHT
  // hat und dieser Plan schon rechnet. Sie standen bis hierher nicht in dieser
  // Liste, und das war genau der Fehler, gegen den die Liste geschrieben ist:
  // die Kreise sind seit Bedarf 141 ausgerechnet und gingen trotzdem
  // wortlos verloren. Was eine Ehrlichkeits-Liste nicht nennt, ist fuer den
  // Leser dasselbe wie etwas, das es nicht gibt.
  const kreise = new Set(
    distributionFor(fixtures, template).assignments.map((a) => circuitLabel(a)),
  ).size;
  if (kreise > 0) {
    out.push({
      kind: 'circuits',
      count: kreise,
      // `mvrdevelopment/spec#158` hat den Kreis gegen die Spezifikation
      // vorgebracht; der Text kennt bis heute keine Entsprechung.
      message: 'MVR hat kein Feld für Kreise, Phasen und Last — nimm die Kreisliste (CSV) mit.',
    });
  }

  const wege = cableRuns(fixtures, trusses, template).length;
  if (wege > 0) {
    out.push({
      kind: 'cables',
      count: wege,
      // `mvrdevelopment/spec#296` und `#288`, beide offen: das Format hat
      // keine Kabel-Entitaet und kein Pin-Patch.
      message: 'MVR hat keine Kabel — nimm die Kabelliste (CSV) mit; die Wege stehen dort mit Länge und Stecker.',
    });
  }

  if (noteCount > 0) {
    out.push({
      kind: 'notes',
      count: noteCount,
      // Bedarf 71 hat das ausdruecklich so entschieden: die Notiz bleibt im
      // eigenen Projekt. Hier steht sie als BEWUSSTE Auslassung, nicht als
      // Mangel — sonst laese sich die Liste, als sei etwas kaputt.
      message: 'Arbeits-Notizen bleiben absichtlich im eigenen Projekt (Bedarf 71) und gehen in keinen Fremdformat-Export.',
    });
  }

  return out;
}
