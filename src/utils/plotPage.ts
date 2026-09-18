// ───────────────────────────────────────────────────────────────────────────
// DER LICHTPLAN AUF EIN BLATT — Papierformat, Ausrichtung, Rand.
//
// NUTZER-MELDUNG (light-planner#123, Kommentar): „Und den Lichtplan auch als
// PDF. Gleiche Einstellmoeglichkeiten wie bei Cable planner."
//
// Der Lichtplan kam bisher als PDF heraus, aber ohne jede Einstellung: die
// Seite war so gross wie die Zeichenflaeche zufaellig war — bei einem
// 1440er-Fenster also 1440 x 900 Punkte, ein Format, das es auf keinem
// Plotter gibt. Ausgedruckt wurde daraus, was der Druckertreiber daraus
// machte, und das war je nach Treiber etwas anderes.
//
// Diese Datei rechnet das Blatt aus, und zwar NUR das: sie kennt kein
// Canvas, kein PDF und kein React. Damit ist sie die Stelle, die
// `npm run plot:check` misst — eine Seitenrechnung, die nur im Browser
// nachvollziehbar waere, koennte niemand pruefen.
//
// ─── WARUM PUNKTE UND NICHT MILLIMETER ────────────────────────────────────
//
// Ein PDF misst in Punkten (1/72 Zoll); die MediaBox nimmt nichts anderes.
// Die Formate stehen hier trotzdem in Millimetern, weil sie so heissen und
// so nachgeschlagen werden — die Umrechnung passiert an genau einer Stelle
// (`ptAusMm`), damit sie nicht in jeder Zeile neu erfunden wird.
//
// ─── WARUM DAS BILD VERGROESSERT WERDEN DARF ──────────────────────────────
//
// Ein Plan auf A0 soll A0 fuellen. Die Zeichenflaeche ist rasterig, das
// Vergroessern kostet also Schaerfe — aber ein A0-Blatt mit einem
// briefmarkengrossen Plan in der Mitte waere kein schonenderer Umgang mit
// derselben Aufloesung, sondern bloss ein unbrauchbares Blatt. Wer Schaerfe
// braucht, nimmt „Original": dann ist die Seite so gross wie das Bild und
// nichts wird skaliert.
// ───────────────────────────────────────────────────────────────────────────

/** Punkte je Millimeter — 72 dpi, die Masseinheit jeder PDF-Seite. */
export const PT_JE_MM = 72 / 25.4;

export const ptAusMm = (mm: number): number => mm * PT_JE_MM;

export type PapierId = 'original' | 'a4' | 'a3' | 'a2' | 'a1' | 'a0' | 'a0plus';
export type Ausrichtung = 'quer' | 'hoch';

export interface Papier {
  id: PapierId;
  /** Englische Quell-Beschriftung (E-28). Die Uebersetzung sitzt in der UI. */
  label: string;
  /** Hochkant-Masse in Millimetern. `null` bei „Original" — es gibt keine. */
  breiteMm: number | null;
  hoeheMm: number | null;
}

// DIN-A-Reihe, hochkant. „A0+" ist kein DIN-Format, sondern das uebliche
// Plotter-Uebermass (1189 x 1682 mm) — es steht hier, weil der Cable Planner
// es anbietet und ein Plan, der dort auf A0+ passt, hier nicht daran
// scheitern soll, dass die Liste kuerzer ist.
export const PAPIERE: Papier[] = [
  { id: 'original', label: 'Original — page as large as the drawing', breiteMm: null, hoeheMm: null },
  { id: 'a4', label: 'A4 (210 x 297 mm)', breiteMm: 210, hoeheMm: 297 },
  { id: 'a3', label: 'A3 (297 x 420 mm)', breiteMm: 297, hoeheMm: 420 },
  { id: 'a2', label: 'A2 (420 x 594 mm)', breiteMm: 420, hoeheMm: 594 },
  { id: 'a1', label: 'A1 (594 x 841 mm)', breiteMm: 594, hoeheMm: 841 },
  { id: 'a0', label: 'A0 (841 x 1189 mm)', breiteMm: 841, hoeheMm: 1189 },
  { id: 'a0plus', label: 'A0+ plotter (1189 x 1682 mm)', breiteMm: 1189, hoeheMm: 1682 },
];

export const papierMit = (id: PapierId): Papier =>
  PAPIERE.find((p) => p.id === id) ?? PAPIERE[0];

export interface SeitenLayout {
  /** MediaBox in PDF-Punkten. */
  seiteBreite: number;
  seiteHoehe: number;
  /** Platzierung des Bildes auf der Seite, PDF-Koordinaten (Nullpunkt unten links). */
  bildX: number;
  bildY: number;
  bildBreite: number;
  bildHoehe: number;
  /** Punkte je Bildpixel. 1 heisst: unveraendert uebernommen. */
  massstab: number;
}

export interface SeitenWunsch {
  bildBreitePx: number;
  bildHoehePx: number;
  papier: PapierId;
  ausrichtung: Ausrichtung;
  /** Rand in Millimetern, rundum. Bei „Original" ohne Wirkung. */
  randMm: number;
}

/**
 * Wo das Bild auf dem Blatt liegt.
 *
 * Bei „Original" ist die Seite das Bild: dieselbe Rechnung wie vor dieser
 * Datei, damit ein Nutzer, der nichts einstellt, dieselbe Datei bekommt wie
 * bisher.
 *
 * Sonst wird das Bild seitenverhaeltnistreu in das Rechteck innerhalb der
 * Raender eingepasst und zentriert. Verhaeltnistreu heisst hier: NICHT
 * gedehnt. Ein gedehnter Plan waere ein Plan im falschen Massstab, und der
 * Massstabsbalken darauf waere dann eine Falschauskunft — er ist ins Bild
 * gezeichnet und wuerde mitgedehnt.
 */
export function seitenLayout(w: SeitenWunsch): SeitenLayout {
  const bildBreitePx = Math.max(1, Math.round(w.bildBreitePx));
  const bildHoehePx = Math.max(1, Math.round(w.bildHoehePx));
  const papier = papierMit(w.papier);

  if (papier.breiteMm === null || papier.hoeheMm === null) {
    return {
      seiteBreite: bildBreitePx,
      seiteHoehe: bildHoehePx,
      bildX: 0,
      bildY: 0,
      bildBreite: bildBreitePx,
      bildHoehe: bildHoehePx,
      massstab: 1,
    };
  }

  const kurz = ptAusMm(papier.breiteMm);
  const lang = ptAusMm(papier.hoeheMm);
  const seiteBreite = w.ausrichtung === 'quer' ? lang : kurz;
  const seiteHoehe = w.ausrichtung === 'quer' ? kurz : lang;

  // Ein Rand, der mehr als die halbe Seite frisst, liesse kein Bild uebrig.
  // Er wird gekappt statt abgelehnt: der Nutzer hat dann ein schmales Bild
  // und sieht sofort, dass der Wert zu gross war — eine Fehlermeldung
  // mitten im Exportieren haette ihm dasselbe gesagt und die Datei gekostet.
  const randMax = Math.min(seiteBreite, seiteHoehe) / 2 - 1;
  const rand = Math.min(Math.max(0, ptAusMm(w.randMm)), randMax);

  const platzBreite = seiteBreite - 2 * rand;
  const platzHoehe = seiteHoehe - 2 * rand;
  const massstab = Math.min(platzBreite / bildBreitePx, platzHoehe / bildHoehePx);
  const bildBreite = bildBreitePx * massstab;
  const bildHoehe = bildHoehePx * massstab;

  return {
    seiteBreite,
    seiteHoehe,
    bildX: (seiteBreite - bildBreite) / 2,
    bildY: (seiteHoehe - bildHoehe) / 2,
    bildBreite,
    bildHoehe,
    massstab,
  };
}

/**
 * Die Ausrichtung, die zum Bild passt — Vorgabe, kein Zwang.
 *
 * Ein breiter Plan auf einem hochkanten Blatt wird winzig; die Vorgabe
 * richtet sich deshalb nach dem Bild und nicht nach einer festen Seite.
 */
export const ausrichtungFuer = (bildBreitePx: number, bildHoehePx: number): Ausrichtung =>
  bildBreitePx >= bildHoehePx ? 'quer' : 'hoch';
