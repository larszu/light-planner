// ───────────────────────────────────────────────────────────────────────────
// Die Bestellung faellt aus dem Plan, statt getippt zu werden (Bedarf 145, P4).
//
//   > Entirely manual: 'Users must manually type equipment items', despite the
//   > fixture and infrastructure data already existing in the equipment
//   > manager. The order must aggregate FIXTURES WITH ACCESSORIES (colour,
//   > gobo, template), infrastructure with port specs, and SPLIT QUANTITIES
//   > ACROSS VENUE-OWNED / RENTAL / OWN.
//
// Beleg: `jkarp7/showstack#29` (2025-12-27).
//
// ─── DAS SCHWIERIGE IST NICHT DAS ZAEHLEN, SONDERN DIE ZUORDNUNG ───────────
//
// Wie viele Source Four im Plan haengen, ist eine Zaehlung. Ob der Source Four
// im Plan DERSELBE Artikel ist wie der im Lager, ist eine Behauptung — und
// zwar eine, die dieses Modell nicht beweisen kann: eine `Fixture` traegt
// keine geraetetyp-weite Kennung (ADR-002 `deviceTypeId` gibt es am
// Lager-Artikel, nicht an der Leuchte). Es bleibt der Vergleich von Hersteller
// und Modellname, und der ist ein VERGLEICH VON ZEICHENKETTEN.
//
// Deshalb traegt jede Zeile ihre `basis`: `name`, wenn ein Lager-Artikel
// gefunden wurde, `none`, wenn keiner passte. Eine Bestellliste, die
// verschweigt, worauf ihre Deckung beruht, laesst jemanden mit „haben wir"
// losfahren, weil zwei Zeichenketten zufaellig gleich waren — oder doppelt
// bestellen, weil sie es nicht waren.
//
// ─── DIE LISTE ENTSCHEIDET NICHT, SIE TEILT AUF ────────────────────────────
//
// Der Beleg sagt „split quantities across venue-owned / rental / own". Also
// wird aufgeteilt und nicht entschieden: eigener Bestand, fremder Bestand
// (Miete/Sub-Hire, kommt zurueck) und der Rest, der bestellt werden muss.
// Was davon man nimmt, weiss der Disponent und nicht dieses Modul.
//
// ─── WAS HIER NICHT ENTSTEHT ───────────────────────────────────────────────
//
// „infrastructure with port specs" aus dem Beleg: Verteiler, Multicores und
// ihre Anschluesse sind Sache des cable-planners, nicht dieses Plans.
// `shopOrderGaps` sagt das, statt es zu verschweigen — und statt eine leere
// Rubrik zu drucken, die aussieht, als waere nichts noetig.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture } from '../types';
import type { InventoryItem } from '../inventory/types';
import { colorCounts, fixtureCounts } from './patch';

/**
 * Worauf die Deckung einer Zeile beruht.
 *
 * `name` — ein Lager-Artikel mit gleichem Hersteller und Modell wurde
 * gefunden. Das ist ein Zeichenketten-Vergleich und keine Tatsache.
 * `none` — keiner passte. Die ganze Menge ist zu bestellen, und niemand hat
 * dafuer gutgesagt.
 */
export type MatchBasis = 'name' | 'none';

export const BASIS_LABEL: Readonly<Record<MatchBasis, string>> = {
  name: 'über Hersteller + Modell zugeordnet',
  none: 'kein Lager-Artikel gefunden',
};

export type ShopLineKind = 'fixture' | 'gel';

export const KIND_LABEL: Readonly<Record<ShopLineKind, string>> = {
  fixture: 'Gerät',
  gel: 'Farbfolie',
};

export interface ShopLine {
  kind: ShopLineKind;
  manufacturer: string;
  model: string;
  /** Was der Plan braucht. */
  needed: number;
  /** Davon aus EIGENEM Bestand gedeckt. */
  owned: number;
  /** Davon aus fremdem Bestand (Miete / Sub-Hire) — kommt zurueck. */
  foreign: number;
  /** Was uebrig bleibt und bestellt werden muss. */
  order: number;
  basis: MatchBasis;
}

/** Zeichenketten-Vergleich, so nachsichtig wie vertretbar — und nicht mehr. */
const schluessel = (hersteller: string, modell: string): string =>
  `${hersteller.trim().toLowerCase()} ${modell.trim().toLowerCase()}`;

/**
 * Der Bestand, nach Hersteller+Modell zusammengefasst, getrennt nach Eigentum.
 *
 * Mehrere Lager-Positionen desselben Artikels werden SUMMIERT: wer denselben
 * Scheinwerfer in zwei Regalen fuehrt, hat ihn trotzdem zweimal.
 */
function bestandNach(
  inventory: readonly InventoryItem[],
): Map<string, { owned: number; foreign: number }> {
  const m = new Map<string, { owned: number; foreign: number }>();
  for (const it of inventory) {
    const k = schluessel(it.manufacturer ?? '', it.model ?? '');
    const e = m.get(k) ?? { owned: 0, foreign: 0 };
    const n = Math.max(0, Math.floor(it.quantity || 0));
    // Ohne Angabe gilt der Artikel als eigener: das ist der Normalfall eines
    // Hauslagers, und die Gegenannahme haette jeden Altbestand zu Fremdgut
    // erklaert.
    if (it.ownership === 'rented' || it.ownership === 'subhire') e.foreign += n;
    else e.owned += n;
    m.set(k, e);
  }
  return m;
}

/**
 * Eine Zeile aus Bedarf und Bestand.
 *
 * DIE EINE STELLE, an der die Deckung entsteht. Zwei Rechnungen — eine fuer
 * das Blatt und eine fuer die Zusammenfassung — koennten auseinanderlaufen,
 * und dann stuende oben eine andere Summe als unten.
 */
function decken(
  kind: ShopLineKind,
  manufacturer: string,
  model: string,
  needed: number,
  bestand: Map<string, { owned: number; foreign: number }>,
): ShopLine {
  const treffer = bestand.get(schluessel(manufacturer, model));
  const owned = Math.min(needed, treffer?.owned ?? 0);
  const foreign = Math.min(needed - owned, treffer?.foreign ?? 0);
  return {
    kind,
    manufacturer,
    model,
    needed,
    owned,
    foreign,
    order: needed - owned - foreign,
    basis: treffer ? 'name' : 'none',
  };
}

export interface ShopOrder {
  lines: ShopLine[];
  /** Wie viele Zeilen ueberhaupt bestellt werden muessen. */
  toOrder: number;
  /** Zeilen ohne Lager-Zuordnung — die, bei denen niemand gutgesagt hat. */
  unmatched: number;
}

/**
 * Die Bestellliste aus dem Plan.
 *
 * Geraete zuerst, danach das Zubehoer — der Beleg nennt „fixtures WITH
 * accessories". Die Reihenfolge innerhalb der beiden Bloecke uebernimmt die
 * der Zaehlungen (`fixtureCounts`, `colorCounts`), damit dasselbe Rig zweimal
 * dasselbe Blatt ergibt.
 */
export function shopOrder(
  fixtures: readonly PlacedFixture[],
  inventory: readonly InventoryItem[] = [],
): ShopOrder {
  const bestand = bestandNach(inventory);
  const lines: ShopLine[] = [];

  for (const c of fixtureCounts([...fixtures])) {
    lines.push(decken('fixture', c.manufacturer, c.name, c.count, bestand));
  }
  // Zubehoer: die Farbfolien, so wie sie geschnitten werden. Gobos und
  // Schablonen nennt der Beleg auch — die fuehrt dieses Modell nicht, und
  // `shopOrderGaps` sagt das, statt eine leere Rubrik zu drucken.
  for (const g of colorCounts([...fixtures])) {
    lines.push(decken('gel', g.brand, `${g.code} ${g.name}`.trim(), g.count, bestand));
  }

  return {
    lines,
    toOrder: lines.filter((l) => l.order > 0).length,
    unmatched: lines.filter((l) => l.basis === 'none').length,
  };
}

export interface ShopGap {
  label: string;
  message: string;
}

/**
 * Was die Quelle nennt und dieser Plan nicht hergibt.
 *
 * BERECHNET aus dem, was das Modell fuehrt — nicht aufgezaehlt. Heute zwei
 * Posten: Gobos/Schablonen (kein Feld an der Leuchte) und die Infrastruktur
 * mit ihren Anschluessen (die liegt im cable-planner). Wer das Gobo-Feld
 * nachtraegt, entfernt den Eintrag hier nicht von Hand — er verschwindet.
 */
export function shopOrderGaps(fixtures: readonly PlacedFixture[]): ShopGap[] {
  const out: ShopGap[] = [];
  // Gobos: es gibt kein Feld dafuer. Die Pruefung ist, ob eine Leuchte
  // ueberhaupt eines fuehrt — und nicht, ob der Autor davon wusste.
  const hatGoboFeld = fixtures.some(
    (f) => 'goboIds' in (f as unknown as Record<string, unknown>),
  );
  if (!hatGoboFeld) {
    out.push({
      label: 'Gobos / Schablonen',
      message: 'Der Beleg nennt sie als Zubehör der Bestellung. Dieser Plan führt kein '
        + 'Gobo-Feld an der Leuchte — die Zeilen entstehen, sobald es eines gibt; '
        + 'erfunden werden sie nicht.',
    });
  }
  out.push({
    label: 'Infrastruktur mit Anschluss-Angaben',
    message: 'Verteiler, Multicores und ihre Anschlüsse liegen im Cable-Planer, nicht in '
      + 'diesem Plan. Eine leere Rubrik hier sähe aus, als wäre nichts nötig.',
  });
  return out;
}

export const SHOP_HEADERS = [
  'Art', 'Hersteller', 'Modell', 'Bedarf', 'Eigen', 'Fremd', 'Bestellen', 'Grundlage',
] as const;

export function shopOrderTable(
  o: ShopOrder,
): { header: string[]; rows: (string | number)[][] } {
  return {
    header: [...SHOP_HEADERS],
    rows: o.lines.map((l) => [
      KIND_LABEL[l.kind], l.manufacturer, l.model,
      l.needed, l.owned, l.foreign, l.order,
      BASIS_LABEL[l.basis],
    ]),
  };
}
