// ───────────────────────────────────────────────────────────────────────────
// Etiketten aus denselben Daten wie die Papiere (Bedarf 148, P4).
//
//   > Dimmer and distro labels have been worth writing dedicated desktop
//   > software for across at least a decade — one tool pulled wattage and
//   > dimmer type from Lightwright and mirrored its User1/User2 custom fields.
//   > Current asks: CUSTOM BACKGROUND COLOURS WITH PRESETS FOR COMMON LABEL
//   > STOCKS, background images […]
//
// Belege: `Charlie9830/Dimmer-Labels-Wizard` samt `#24` und `#14` (2015,
// Projekt 2017 eingestellt) und `jkarp7/showstack#41` (2025-12-28), das
// denselben Bedarf zehn Jahre spaeter noch einmal stellt.
//
// ─── EIN ETIKETT IST EINE DRUCK-SICHT, KEIN ZWEITES MODELL ─────────────────
//
// Die Felder kommen aus dem Katalog von Bedarf 143 — dieselbe Kanalnummer,
// derselbe Kreis „3-2", derselbe Zweck. Wer hier eigene Zugriffe schreibt,
// hat ein zweites Modell angelegt, und am Ladetag klebt am Verteiler etwas
// anderes, als auf dem Blatt steht. Genau das ist der Zustand, den Bedarf 143
// abgeschafft hat; er darf hier nicht zurueckkommen.
//
// ─── EIN ETIKETT, DAS NICHT AUF SEINEN BOGEN PASST, IST SCHLIMMER ALS KEINS ─
//
// Etikettenbogen sind Verbrauchsmaterial: ein Satz, der versetzt oder
// abgeschnitten druckt, ist weggeworfen — und das faellt erst auf, wenn er aus
// dem Drucker kommt. Deshalb rechnet dieses Modul VORHER, ob der Text in die
// Zelle passt, und schneidet NICHTS ab: eine abgeschnittene Kreisnummer ist
// ein falsches Etikett, und ein falsches Etikett am Verteiler ist schlimmer
// als ein leeres.
//
// Die Passform ist eine SCHAETZUNG und sagt das auch. Ohne Textmessung laesst
// sich die Breite einer Zeichenkette nicht wissen; gerechnet wird mit einem
// mittleren Zeichenbreiten-Faktor, und das Ergebnis traegt `basis: 'assumed'`
// wie die Last-Zahlen aus Bedarf 142.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture } from '../types';
import { FIELDS, cell, type FieldContext, type FieldId } from './reportFields';

/**
 * Ein Etikettenbogen, wie man ihn kauft.
 *
 * Die Masse stammen von den Herstellerangaben der genannten Artikel und sind
 * DIN-A4-bezogen. Sie stehen hier als Zahlen und nicht als Prozentwerte, weil
 * ein Bogen ein physischer Gegenstand ist: wer sie „passend" macht, verschiebt
 * den ganzen Satz.
 */
export interface LabelStock {
  id: string;
  label: string;
  /** Etiketten je Zeile. */
  columns: number;
  /** Zeilen je Bogen. */
  rows: number;
  widthMm: number;
  heightMm: number;
  /** Rand des Bogens bis zum ersten Etikett. */
  marginTopMm: number;
  marginLeftMm: number;
  /** Woher die Masse stammen. */
  note: string;
}

export const STOCKS: readonly LabelStock[] = [
  {
    id: 'l7160',
    label: 'Avery L7160 / Zweckform 3474 — 63,5 × 38,1 mm (21/Bogen)',
    columns: 3, rows: 7, widthMm: 63.5, heightMm: 38.1,
    marginTopMm: 15.1, marginLeftMm: 7.2,
    note: 'Der verbreitetste Universal-Bogen. Reicht für Kanal, Kreis und Zweck.',
  },
  {
    id: 'l7163',
    label: 'Avery L7163 / Zweckform 3427 — 99,1 × 38,1 mm (14/Bogen)',
    columns: 2, rows: 7, widthMm: 99.1, heightMm: 38.1,
    marginTopMm: 15.1, marginLeftMm: 5.0,
    note: 'Breit genug für lange Gerätenamen — die Wahl für Verteiler und Racks.',
  },
  {
    id: 'l7651',
    label: 'Avery L7651 / Zweckform 3667 — 38,1 × 21,2 mm (65/Bogen)',
    columns: 5, rows: 13, widthMm: 38.1, heightMm: 21.2,
    marginTopMm: 10.7, marginLeftMm: 4.7,
    note: 'Klein: für die Leuchte selbst. Für lange Texte zu schmal — das sagt '
      + 'die Passform-Prüfung, bevor der Bogen im Drucker liegt.',
  },
];

export const findStock = (id: string): LabelStock | undefined => STOCKS.find((s) => s.id === id);

/**
 * Was auf einem Etikett steht: eine Zeile je Feld, in dieser Reihenfolge.
 *
 * Feld-KENNUNGEN aus dem Katalog (Bedarf 143), keine eigenen Zugriffe. Wer
 * hier `f.channel` schreibt, hat das zweite Modell angelegt.
 */
export interface LabelDef {
  id: string;
  label: string;
  /** Die Zeilen des Etiketts, von oben. Die erste ist die grosse. */
  lines: FieldId[];
  /** Wofür es gedacht ist. */
  purpose: string;
}

export const LABEL_DEFS: readonly LabelDef[] = [
  {
    id: 'circuit',
    label: 'Verteiler / Kreis',
    lines: ['circuit', 'phase', 'type', 'watt'],
    purpose: 'Klebt am Steckplatz: welcher Kreis, welche Phase, was daran hängt.',
  },
  {
    id: 'channel',
    label: 'Leuchte / Kanal',
    lines: ['channel', 'unit', 'type', 'purpose'],
    purpose: 'Klebt an der Leuchte: Kanal, Unit-Nummer, Typ und Zweck.',
  },
  {
    id: 'address',
    label: 'DMX-Adresse',
    lines: ['dmx', 'channel', 'type'],
    purpose: 'Für den Patch am Gerät: Adresse in der Lesart des gewählten Protokolls.',
  },
];

export const findLabelDef = (id: string): LabelDef | undefined =>
  LABEL_DEFS.find((d) => d.id === id);

/**
 * Schriftgroesse der ersten und der uebrigen Zeilen, in Millimetern.
 *
 * Millimeter und nicht Punkt: ein Etikett ist ein physischer Gegenstand, und
 * die Passform-Rechnung unten vergleicht mit seiner Breite in Millimetern.
 * Eine Umrechnung dazwischen waere eine Fehlerquelle ohne Nutzen.
 */
export const HEAD_MM = 6;
export const BODY_MM = 3.2;

/**
 * Mittlere Zeichenbreite als Anteil der Schrifthoehe.
 *
 * DIE ANNAHME DIESES MODULS, und sie steht hier als Konstante, damit sie
 * jemand nachrechnen kann. 0,55 ist ein ueblicher Wert fuer serifenlose
 * Proportionalschrift; „MMM" ist breiter, „lll" schmaler. Deshalb ist das
 * Ergebnis der Passform-Pruefung eine SCHAETZUNG und wird auch so benannt.
 */
export const AVG_GLYPH_RATIO = 0.55;

/** Innenabstand des Etiketts zum Rand, in Millimetern. */
export const PADDING_MM = 2;

/** Wie viele Zeichen in eine Zeile dieser Groesse passen — geschaetzt. */
export const fitsChars = (stock: LabelStock, fontMm: number): number =>
  Math.max(1, Math.floor((stock.widthMm - 2 * PADDING_MM) / (fontMm * AVG_GLYPH_RATIO)));

export interface LabelLine {
  field: FieldId;
  /** Die Beschriftung des Feldes — fuer die Bildschirm-Vorschau. */
  fieldLabel: string;
  text: string;
  fontMm: number;
  /**
   * Passt der Text (geschaetzt) in die Zeile?
   *
   * `false` heisst NICHT, dass gekuerzt wurde — es wird nichts gekuerzt. Eine
   * abgeschnittene Kreisnummer ist ein falsches Etikett.
   */
  fits: boolean;
}

export interface Label {
  /** Die Leuchte, von der dieses Etikett stammt. */
  fixtureId: string;
  lines: LabelLine[];
  /** Mindestens eine Zeile passt (geschaetzt) nicht. */
  overflows: boolean;
}

export function buildLabel(
  def: LabelDef,
  f: PlacedFixture,
  ctx: FieldContext,
  stock: LabelStock,
): Label {
  const lines: LabelLine[] = def.lines.map((field, i) => {
    const fontMm = i === 0 ? HEAD_MM : BODY_MM;
    const text = String(cell(field, f, ctx));
    return {
      field,
      fieldLabel: FIELDS[field].label,
      text,
      fontMm,
      fits: text.length <= fitsChars(stock, fontMm),
    };
  });
  return { fixtureId: f.id, lines, overflows: lines.some((l) => !l.fits) };
}

export interface LabelPage {
  /** Zeile fuer Zeile, Spalte fuer Spalte. `null` = leere Zelle. */
  cells: (Label | null)[];
}

export interface LabelSheet {
  stock: LabelStock;
  def: LabelDef;
  pages: LabelPage[];
  /** Wie viele Etiketten gedruckt werden. */
  count: number;
  /** Wie viele davon (geschaetzt) ueberlaufen. */
  overflowing: number;
  /** Ab welchem Etikett des ersten Bogens gedruckt wird (1-basiert). */
  startAt: number;
  /**
   * Freie Etiketten auf dem letzten Bogen — der Rest, den man beim naechsten
   * Mal ueber `startAt` weiterverwenden kann.
   */
  leftover: number;
}

/**
 * Der Satz Etiketten fuer diesen Plan.
 *
 * `startAt` ist die eigentliche Ersparnis: Etikettenbogen werden selten ganz
 * aufgebraucht, und wer beim naechsten Satz wieder bei 1 anfaengt, druckt auf
 * abgezogene Stellen. Die Zahl ist 1-basiert, weil auf einem Bogen niemand
 * bei null zaehlt.
 */
export function labelSheet(
  def: LabelDef,
  fixtures: readonly PlacedFixture[],
  ctx: FieldContext,
  stock: LabelStock,
  startAt = 1,
): LabelSheet {
  const proBogen = stock.columns * stock.rows;
  const start = Math.min(Math.max(1, Math.floor(startAt)), proBogen);

  // Reihenfolge: die des ersten Feldes des Etiketts, damit derselbe Plan
  // zweimal denselben Bogen ergibt. Ohne feste Ordnung klebte beim zweiten
  // Druck ein anderes Etikett an derselben Stelle.
  const erst = def.lines[0];
  const sortiert = [...fixtures].sort((a, b) => {
    const va = FIELDS[erst].value(a, ctx);
    const vb = FIELDS[erst].value(b, ctx);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (typeof va === 'number' && typeof vb === 'number' && va !== vb) return va - vb;
    const c = String(va ?? '').localeCompare(String(vb ?? ''), 'de');
    return c !== 0 ? c : a.id.localeCompare(b.id);
  });

  const labels = sortiert.map((f) => buildLabel(def, f, ctx, stock));

  // Die leeren Zellen vor dem Start gehoeren auf den ERSTEN Bogen: sie sind
  // die schon abgezogenen Etiketten.
  const zellen: (Label | null)[] = [...Array(start - 1).fill(null), ...labels];
  const pages: LabelPage[] = [];
  for (let i = 0; i < zellen.length; i += proBogen) {
    const seite = zellen.slice(i, i + proBogen);
    while (seite.length < proBogen) seite.push(null);
    pages.push({ cells: seite });
  }

  return {
    stock,
    def,
    pages,
    count: labels.length,
    overflowing: labels.filter((l) => l.overflows).length,
    startAt: start,
    /*
     * Was auf dem letzten Bogen frei bleibt — beim naechsten Mal der
     * Startwert.
     *
     * Das `|| proBogen` faengt den genau aufgehenden Fall: bei 21 Etiketten
     * auf einem 21er-Bogen ist der Rest 0 und nicht 21.
     *
     * Hier stand bis 2026-09-07 zusaetzlich ein `pages.length === 0 ? 0 :`
     * fuer den leeren Satz. Er war NACHWEISLICH WIRKUNGSLOS: ohne Etiketten
     * ist `start` 1 und `labels.length` 0, also `(0 % n || n)` gleich `n` und
     * die Differenz 0 — dasselbe Ergebnis. Eine Gegenprobe, die ihn entfernt,
     * bleibt gruen, und ein Waechter, der eine wirkungslose Zeile schuetzt,
     * schuetzt nichts. Die Zusicherung auf den leeren Satz bleibt trotzdem
     * stehen: sie prueft das Verhalten, nicht die Zeile.
     */
    leftover: proBogen - ((start - 1 + labels.length) % proBogen || proBogen),
  };
}

/**
 * Warum die Passform nur geschaetzt ist.
 *
 * Steht als Satz im Modul und nicht nur im Kommentar, damit die Oberflaeche
 * ihn zeigen kann, ohne ihn ein zweites Mal zu formulieren.
 */
export const FIT_BASIS_NOTE =
  'Die Passform ist geschätzt: ohne Textmessung lässt sich die Breite einer '
  + `Zeichenkette nicht wissen, gerechnet wird mit einer mittleren Zeichenbreite `
  + `von ${AVG_GLYPH_RATIO} × Schrifthöhe. Nichts wird gekürzt — ein abgeschnittener `
  + 'Kreis ist ein falsches Etikett.';
