// ───────────────────────────────────────────────────────────────────────────
// Kabel und Steckverbinder als eigene Daten (Bedarf 140, P4).
//
//   > MVR has NO CABLE ENTITY. Two open spec requests: cables with
//   > cross-sectional area, length, type and connection mapping; and Wiring
//   > Object / Pin Patch in the node ChildList because „INDIVIDUAL CABLES AND
//   > THE CONNECTIONS NEED TO BE SPECIFIED IN THE MVR FILE". Today cabling
//   > lives outside any machine-readable plan.
//
// Belege: `mvrdevelopment/spec#296` (offen, 2026-01-27) und `#288` (offen,
// 2025-10-20); im `mvr-spec.md` bestaetigt abwesend.
//
// ─── WAS HIER GEBAUT WIRD, UND WAS AUSDRUECKLICH NICHT ─────────────────────
//
// Der Plan weiss bereits alles, was eine Kabelliste braucht — er hat es nur
// nie ausgesprochen: welche Leuchte an welchem Kreis haengt (Bedarf 141),
// welche in welchem Universe (Bedarf 147), und wo jede haengt. Daraus folgen
// die Wege. NICHT gebaut wird eine Kabel-VERLEGUNG: dieser Planer kennt keine
// Kabelwege, keine Zugentlastung und keine Schleife am Haken.
//
// ─── DIE LAENGE IST DIE STELLE, AN DER MAN LUEGEN WUERDE ───────────────────
//
// Zwischen zwei Leuchten auf derselben Traverse ist die Laenge die gerade
// Strecke zwischen den Aufhaengepunkten — nachgerechnet, nicht geraten, und
// im Blatt als das benannt, was sie ist: eine UNTERGRENZE. Ein wirkliches
// Kabel haengt durch, geht um die Traverse herum und braucht eine Schleife.
//
// Der Weg von der QUELLE zur ersten Leuchte — vom Verteilerausgang, vom Node —
// ist dagegen NICHT berechenbar: der Plan stellt weder Verteiler noch Nodes
// auf. Eine Zahl an dieser Stelle waere frei erfunden, und zwar an genau der
// Stelle, an der das Kabel am laengsten ist. Sie bleibt deshalb LEER, wird
// GEZAEHLT, und keine Summe tut so, als waere sie vollstaendig.
//
// ─── EINE ENTSCHEIDUNG, EIN ORT ────────────────────────────────────────────
//
// Wo die Kette bricht, entscheidet NICHT dieses Modul: die Stromkette bricht
// am Kreis (`powerDistribution`), die Datenkette am Universe. Wer hier eine
// zweite Regel schriebe — „hoechstens sechs Leuchten je Kette" —, haette zwei
// Wahrheiten ueber dieselbe Anlage, und die Kabelliste wuerde eine Kette
// zeigen, die es am Verteiler nicht gibt.
//
// REIN: keine Datei, kein Netz, keine Uhr, kein Zufall.
// ───────────────────────────────────────────────────────────────────────────
import type { PlacedFixture, Truss } from '../types';
import { nearestTrussId, footprint } from './patch';
import {
  DEFAULT_TEMPLATE, type PhaseTemplate, circuitByFixture, circuitLabel, distributionFor,
} from './powerDistribution';

/** Strom oder Daten. Mehr Arten kennt dieser Plan nicht. */
export type RunKind = 'power' | 'data';

export const KIND_LABEL: Readonly<Record<RunKind, string>> = {
  power: 'Strom',
  data: 'DMX',
};

/** Ein Ende: entweder die Quelle (Verteiler, Node) oder eine Leuchte. */
export type EndKind = 'source' | 'fixture';

export interface RunEnd {
  kind: EndKind;
  /** Was am Ende drangeschrieben steht — Kreisnummer, Universe, Kanal. */
  label: string;
  /** Nur bei `fixture` gesetzt. */
  fixtureId?: string;
}

/**
 * Fehlt eine Angabe, steht ein Zeichen da und kein Nichts.
 *
 * Auf Papier muss „nichts hinterlegt" von „niemand hat nachgesehen"
 * unterscheidbar bleiben; eine leere Zelle sagt beides.
 */
export const NOT_SET = '–';

/** Der Satz, der die Laengen einordnet. Steht im Modul, nicht im Dialog. */
export const LENGTH_BASIS_NOTE =
  'Die Längen sind die geraden Strecken zwischen den Aufhängepunkten — eine '
  + 'Untergrenze. Durchhang, der Weg um die Traverse und die Schleife am Haken '
  + 'kommen dazu. Wege von der Quelle zur ersten Leuchte stehen leer: der Plan '
  + 'stellt weder Verteiler noch Nodes auf, und eine Zahl wäre hier erfunden.';

export interface CableRun {
  id: string;
  kind: RunKind;
  from: RunEnd;
  /** Immer eine Leuchte: ein Weg endet an einem Geraet. */
  to: RunEnd;
  /** Die Traverse, an der die Kette haengt — `null` fuer Stative und Boeden. */
  trussLabel: string | null;
  /** Meter, oder `null` wenn nicht berechenbar. NIE geraten. */
  lengthM: number | null;
  /** Der Steckverbinder am Geraet, soweit die Bibliothek ihn kennt. */
  connector: string;
}

/**
 * Wo eine Leuchte auf ihrer Traverse sitzt: 0 am Anfang, 1 am Ende.
 *
 * Die Reihenfolge der Kette ist die Reihenfolge auf der Traverse und nicht
 * die im Datensatz. Wer die Liste nach Kanal ordnete, bekaeme eine Kette, die
 * am Haken hin- und herspringt — und eine Laengensumme, die niemand nachmisst.
 */
function alongTruss(f: PlacedFixture, t: Truss): number {
  const dx = t.x2 - t.x1;
  const dy = t.y2 - t.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return ((f.x - t.x1) * dx + (f.y - t.y1) * dy) / len2;
}

/** Gerade Strecke zwischen zwei Aufhaengepunkten, in Metern. */
const abstand = (a: PlacedFixture, b: PlacedFixture): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.mountingHeight - b.mountingHeight);

/** Auf Zentimeter — feiner misst am Ladetag ohnehin niemand. */
const rund = (m: number): number => Math.round(m * 100) / 100;

const fixtureEnd = (f: PlacedFixture): RunEnd => ({
  kind: 'fixture',
  label: f.channel != null ? `Kanal ${f.channel}` : (f.unitNumber?.trim() || f.fixture.name),
  fixtureId: f.id,
});

/**
 * Die Wege, die dieser Plan bedeutet.
 *
 * DIE ENGSTELLE. Stromkette und Datenkette entstehen im SELBEN Durchgang ueber
 * dieselbe Reihenfolge. Zwei Durchgaenge koennten sich in der Sortierung
 * unterscheiden, und dann laege dieselbe Leuchte in der einen Liste vor und in
 * der anderen hinter ihrer Nachbarin.
 */
export function cableRuns(
  fixtures: readonly PlacedFixture[],
  trusses: readonly Truss[] = [],
  template: PhaseTemplate = DEFAULT_TEMPLATE,
): CableRun[] {
  const kreise = circuitByFixture(distributionFor(fixtures, template));
  const trussById = new Map(trusses.map((t) => [t.id, t]));

  // Nach Traverse gruppieren. Was an keiner Traverse haengt — Stativ, Boden,
  // Ausleger — bekommt seine eigene Gruppe je Leuchte: dort gibt es keine
  // Nachbarin, an die man sich haengen koennte, und eine erfundene Kette waere
  // eine Behauptung ueber den Aufbau.
  const gruppen = new Map<string, PlacedFixture[]>();
  for (const f of fixtures) {
    const tid = nearestTrussId(f, [...trusses]);
    const key = tid ?? `frei:${f.id}`;
    const g = gruppen.get(key);
    if (g) g.push(f); else gruppen.set(key, [f]);
  }

  const out: CableRun[] = [];
  // Die Gruppen selbst in fester Ordnung: sonst ergibt derselbe Plan zweimal
  // eine andere Liste — und zwei Fingerabdruecke (ADR-004).
  for (const key of [...gruppen.keys()].sort()) {
    const g = gruppen.get(key)!;
    const truss = trussById.get(key) ?? null;
    const sortiert = [...g].sort((a, b) => {
      if (truss) {
        const d = alongTruss(a, truss) - alongTruss(b, truss);
        if (d !== 0) return d;
      } else {
        if (a.x !== b.x) return a.x - b.x;
        if (a.y !== b.y) return a.y - b.y;
      }
      // Der letzte Unterschied. Ohne ihn ist die Ordnung nicht total, und zwei
      // Leuchten am selben Punkt tauschen zwischen zwei Ausgaben die Plaetze.
      return a.id.localeCompare(b.id);
    });

    let letzteStrom: { f: PlacedFixture; key: string } | null = null;
    let letzteDaten: { f: PlacedFixture; key: string } | null = null;

    for (const f of sortiert) {
      const kreis = kreise.get(f.id) ?? null;
      const stromKey = kreis ? circuitLabel(kreis) : null;
      const datenKey = f.universe != null ? String(f.universe) : null;
      const stecker = f.fixture.powerConnector?.trim() || NOT_SET;

      if (stromKey) {
        const weiter = letzteStrom !== null && letzteStrom.key === stromKey;
        out.push({
          id: `p:${f.id}`,
          kind: 'power',
          from: weiter
            ? fixtureEnd(letzteStrom!.f)
            : { kind: 'source', label: `Verteiler ${stromKey}` },
          to: fixtureEnd(f),
          trussLabel: truss?.label ?? null,
          lengthM: weiter ? rund(abstand(letzteStrom!.f, f)) : null,
          connector: stecker,
        });
        letzteStrom = { f, key: stromKey };
      }

      if (datenKey) {
        const weiter = letzteDaten !== null && letzteDaten.key === datenKey;
        out.push({
          id: `d:${f.id}`,
          kind: 'data',
          from: weiter
            ? fixtureEnd(letzteDaten!.f)
            : { kind: 'source', label: `Universe ${datenKey}` },
          to: fixtureEnd(f),
          trussLabel: truss?.label ?? null,
          lengthM: weiter ? rund(abstand(letzteDaten!.f, f)) : null,
          connector: footprint(f) > 0 ? 'DMX' : NOT_SET,
        });
        letzteDaten = { f, key: datenKey };
      }
    }
  }
  return out;
}

export interface CableTotal {
  kind: RunKind;
  runs: number;
  /** Summe der berechenbaren Laengen, in Metern. */
  metres: number;
  /** Wege ohne berechenbare Laenge — sie stecken NICHT in `metres`. */
  unknown: number;
}

/**
 * Was zusammenkommt — und was in der Summe fehlt.
 *
 * `unknown` steht daneben und nicht als Null darin. Eine Summe, die die
 * Zuleitungen stillschweigend mit null Metern mitzaehlt, ist beim Bestellen
 * genau so viel zu klein, wie das laengste Kabel misst.
 */
export function cableTotals(runs: readonly CableRun[]): CableTotal[] {
  const kinds: RunKind[] = ['power', 'data'];
  return kinds.map((kind) => {
    const eigene = runs.filter((r) => r.kind === kind);
    return {
      kind,
      runs: eigene.length,
      metres: rund(eigene.reduce((s, r) => s + (r.lengthM ?? 0), 0)),
      unknown: eigene.filter((r) => r.lengthM == null).length,
    };
  });
}

export type CableGapKind = 'no-universe' | 'no-circuit';

export interface CableGap {
  kind: CableGapKind;
  count: number;
  message: string;
}

/**
 * Wofuer KEIN Weg entstanden ist — gerechnet, nicht aufgezaehlt.
 *
 * Gegen das Modell gerechnet und nicht gegen eine Liste im Kopf: wer der
 * Leuchte morgen ein Universe gibt, sieht die Meldung von selbst verschwinden.
 */
export function cableGaps(
  fixtures: readonly PlacedFixture[],
  runs: readonly CableRun[],
): CableGap[] {
  const mitStrom = new Set(runs.filter((r) => r.kind === 'power').map((r) => r.to.fixtureId));
  const mitDaten = new Set(runs.filter((r) => r.kind === 'data').map((r) => r.to.fixtureId));
  const out: CableGap[] = [];

  const ohneKreis = fixtures.filter((f) => !mitStrom.has(f.id)).length;
  if (ohneKreis > 0) {
    out.push({
      kind: 'no-circuit',
      count: ohneKreis,
      message: `${ohneKreis} Leuchte(n) ohne Kreis — für sie steht kein Stromweg auf der Liste.`,
    });
  }
  const ohneUniverse = fixtures.filter((f) => !mitDaten.has(f.id)).length;
  if (ohneUniverse > 0) {
    out.push({
      kind: 'no-universe',
      count: ohneUniverse,
      message: `${ohneUniverse} Leuchte(n) ohne Universe — für sie steht kein DMX-Weg auf der Liste.`,
    });
  }
  return out;
}

export const CABLE_HEADERS = ['Art', 'Von', 'Nach', 'Traverse', 'm', 'Stecker'] as const;

/**
 * Die Kabelliste als Tabelle.
 *
 * Die leere Laenge bleibt ein Strich und wird nicht zu einer Null. Eine Null
 * hiesse „null Meter"; gemeint ist „hier ist nichts zu rechnen".
 */
export function cableTable(runs: readonly CableRun[]): { header: string[]; rows: string[][] } {
  return {
    header: [...CABLE_HEADERS],
    rows: runs.map((r) => [
      KIND_LABEL[r.kind],
      r.from.label,
      r.to.label,
      r.trussLabel ?? NOT_SET,
      r.lengthM == null ? NOT_SET : r.lengthM.toFixed(2),
      r.connector,
    ]),
  };
}
