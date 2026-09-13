// ───────────────────────────────────────────────────────────────────────────
// LISTEN ALS PDF — gesetzt, nicht fotografiert.
//
// NUTZER-MELDUNG (light-planner#123): „Man muss Patchlisten und alle anderen,
// die man aktuell nur als CSV exportieren kann, auch als schoen aufbereitete
// PDF exportieren koennen."
//
// Neben dieser Datei liegt `pdfExport.ts`. Die kann auch PDF — aber nur EIN
// Bild pro Seite (`/DCTDecode`), und das ist fuer den Plan richtig und fuer
// eine Liste falsch: ein Bild einer Tabelle laesst sich nicht durchsuchen,
// nicht kopieren, und beim Ausdruck wird aus scharfem Text ein Raster.
//
// ─── WARUM COURIER, UND NICHT HELVETICA ───────────────────────────────────
//
// Die Spaltenbreiten muessen VOR dem Setzen feststehen. Bei einer
// Proportionalschrift heisst das: die Breite jedes Zeichens kennen — eine
// Tabelle aus der AFM-Datei, die hier niemand nachschlagen kann. Haette sie
// einen falschen Wert, wuerde nichts scheitern; die Spalten staenden nur ein
// wenig schief, und niemand wuesste warum.
//
// Courier ist eine der 14 Standardschriften jedes PDF-Lesers und hat fuer
// JEDES Zeichen dieselbe Breite: 600/1000 em. Die Spaltenbreite ist damit
// eine Frage der Zeichenzahl und keine Schaetzung. Fuer Patch- und
// Kabellisten ist das ausserdem die uebliche Form — Pult- und Patchblaetter
// werden seit jeher in Festbreite gesetzt, weil Kanalnummern dann
// untereinander stehen.
//
// Die Ueberschrift darf proportional sein: sie steht allein auf ihrer Zeile,
// linksbuendig, und ihre Breite entscheidet nichts.
//
// NICHT ENTHALTEN: Umbruch innerhalb einer Zelle. Eine zu lange Zelle wird
// gekuerzt und mit … beendet — die vollstaendige Angabe steht in der CSV.
// Das ist eine bewusste Grenze und keine Luecke: eine Liste, deren Zeilen
// unterschiedlich hoch sind, laesst sich nicht mehr quer lesen.
// ───────────────────────────────────────────────────────────────────────────

import type { DocumentStamp } from '../core/documentStamp';
import { stampLine } from '../core/documentStamp';

export interface PdfTable {
  header: string[];
  rows: (string | number | null | undefined)[][];
}

export interface PdfTableOptions {
  /** Ueberschrift des Blattes. */
  title: string;
  /** Zeile darunter — was das Blatt zeigt. Optional. */
  subtitle?: string;
  /** Stand-Angabe nach ADR-004; steht in der Fusszeile jeder Seite. */
  stamp?: DocumentStamp;
}

/* ── Seitenmasse (Punkt, 72 dpi) ──────────────────────────────────────────*/
const A4_SHORT = 595.28
const A4_LONG = 841.89
const MARGIN = 34
const TITLE_SIZE = 15
const SUB_SIZE = 9
const BODY_SIZE = 8
const LINE = 11.2
/** Zeichenbreite von Courier: 600/1000 em. Exakt, nicht geschaetzt. */
const CHAR = 0.6

/**
 * Text fuer den PDF-Zeichenstrom.
 *
 * Zwei Dinge: die drei Zeichen, die in einem PDF-Literal eine Bedeutung
 * haben, bekommen einen Gegenschraegstrich. Und alles jenseits von Latin-1
 * wird ersetzt — die Standardschriften tragen WinAnsi, und ein Zeichen, das
 * dort nicht vorkommt, wuerde als leeres Kaestchen erscheinen oder den Leser
 * stolpern lassen. Umlaute und ß sind in Latin-1 und bleiben.
 */
const pdfText = (s: string): string =>
  [...s]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 63
      if (ch === '\\' || ch === '(' || ch === ')') return `\\${ch}`
      // … ist in Latin-1 NICHT enthalten, in WinAnsi aber schon: 0x85. Das ist
      // hier kein Feinschliff, sondern eine Breitenfrage — der erste Anlauf
      // ersetzte es durch drei Punkte, und aus jeder gekuerzten Zelle wurden
      // zwei Zeichen mehr. `npm run pdf:check` hat es gemeldet: 167 Zeichen
      // auf einer Zeile, auf die 161 passen.
      if (code === 0x2026) return '\\205'
      if (code === 0x00b7) return '\\267'     // · Mittelpunkt
      if (code < 32) return ' '
      if (code <= 126) return ch
      if (code <= 255) return `\\${code.toString(8).padStart(3, '0')}`
      return '?'
    })
    .join('')

const cell = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v)

/** Kuerzt auf `max` Zeichen; das letzte wird zum Auslassungszeichen. */
const clip = (s: string, max: number): string =>
  s.length <= max ? s : (max <= 1 ? s.slice(0, Math.max(0, max)) : `${s.slice(0, max - 1)}…`)

/**
 * Spaltenbreiten in ZEICHEN.
 *
 * Erst der Wunsch (laengster Eintrag je Spalte, Kopfzeile eingeschlossen),
 * dann — falls die Zeile zu breit wird — anteilig gekuerzt, wobei schmale
 * Spalten unangetastet bleiben. Eine Kanalnummer soll nicht schrumpfen,
 * damit ein Zweckfeld ungekuerzt bleibt.
 */
const spaltenBreiten = (table: PdfTable, verfuegbar: number): number[] => {
  const wunsch = table.header.map((h, i) =>
    Math.max(h.length, ...table.rows.map((r) => cell(r[i]).length), 1),
  )
  const GAP = 2
  const gesamt = (b: number[]) => b.reduce((a, x) => a + x, 0) + GAP * (b.length - 1)
  if (gesamt(wunsch) <= verfuegbar) return wunsch

  // Kuerzen: nur Spalten ueber der Schonbreite geben ab, und zwar im
  // Verhaeltnis ihres Ueberschusses.
  const SCHON = 8
  const breiten = [...wunsch]
  let zuViel = gesamt(breiten) - verfuegbar
  while (zuViel > 0) {
    const gebend = breiten.map((b, i) => ({ i, ueber: b - SCHON })).filter((x) => x.ueber > 0)
    if (gebend.length === 0) break
    const summe = gebend.reduce((a, x) => a + x.ueber, 0)
    let abgezogen = 0
    for (const g of gebend) {
      const teil = Math.max(1, Math.round((g.ueber / summe) * zuViel))
      const neu = Math.max(SCHON, breiten[g.i] - teil)
      abgezogen += breiten[g.i] - neu
      breiten[g.i] = neu
      if (abgezogen >= zuViel) break
    }
    if (abgezogen === 0) break
    zuViel -= abgezogen
  }
  return breiten
}

interface Seite { zeilen: string[]; kopf: string }

/**
 * Ein PDF aus einer Tabelle. Mehrseitig, mit Kopfzeile auf jeder Seite,
 * Zebrastreifen und Fusszeile (Stand + Seitenzahl).
 */
export function tableToPdfBlob(table: PdfTable, opts: PdfTableOptions): Blob {
  // Quer, sobald die Tabelle breit wird — die Entscheidung faellt an der
  // Zeichenzahl und nicht an der Spaltenzahl: acht schmale Spalten passen
  // hochkant, drei sehr breite nicht.
  const roheBreite = table.header.reduce(
    (a, h, i) => a + Math.max(h.length, ...table.rows.map((r) => cell(r[i]).length), 1) + 2,
    0,
  )
  const quer = roheBreite > 95
  const seitenBreite = quer ? A4_LONG : A4_SHORT
  const seitenHoehe = quer ? A4_SHORT : A4_LONG

  const nutzbarPt = seitenBreite - 2 * MARGIN
  const maxZeichen = Math.floor(nutzbarPt / (BODY_SIZE * CHAR))
  const breiten = spaltenBreiten(table, maxZeichen)

  const setzeZeile = (werte: (string | number | null | undefined)[]): string =>
    breiten.map((b, i) => clip(cell(werte[i]), b).padEnd(b)).join('  ').trimEnd()

  const kopfZeile = setzeZeile(table.header)
  const trenner = breiten.map((b) => '-'.repeat(b)).join('  ')

  // Wieviele Datenzeilen passen? Erste Seite hat Titel und Untertitel ueber
  // sich, die folgenden nur die Tabellen-Kopfzeile.
  const obenErste = MARGIN + TITLE_SIZE + (opts.subtitle ? SUB_SIZE + 6 : 0) + 16
  const obenWeitere = MARGIN + 14
  const unten = MARGIN + 16
  const platz = (oben: number) => Math.max(1, Math.floor((seitenHoehe - oben - unten - 2 * LINE) / LINE))

  const seiten: Seite[] = []
  let rest = table.rows.map(setzeZeile)
  let erste = true
  do {
    const n = platz(erste ? obenErste : obenWeitere)
    seiten.push({ zeilen: rest.slice(0, n), kopf: kopfZeile })
    rest = rest.slice(n)
    erste = false
  } while (rest.length > 0)

  /* ── PDF-Objekte ──────────────────────────────────────────────────────*/
  const enc = new TextEncoder()
  const teile: Uint8Array[] = []
  let pos = 0
  const versatz: number[] = []
  const schreib = (d: string | Uint8Array) => {
    const b = typeof d === 'string' ? enc.encode(d) : d
    teile.push(b)
    pos += b.length
  }
  const objekt = (n: number, koerper: string) => {
    versatz[n] = pos
    schreib(`${n} 0 obj\n${koerper}\nendobj\n`)
  }

  // 1 Catalog · 2 Pages · 3 Courier · 4 Courier-Bold · 5 Helvetica-Bold
  // ab 6: je Seite ein Page- und ein Contents-Objekt.
  const seitenIds = seiten.map((_, i) => 6 + i * 2)
  const inhaltIds = seiten.map((_, i) => 7 + i * 2)
  const letzteId = 5 + seiten.length * 2

  schreib('%PDF-1.4\n')
  objekt(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objekt(2, `<< /Type /Pages /Kids [${seitenIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${seiten.length} >>`)
  objekt(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>')
  objekt(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>')
  objekt(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  const fuss = opts.stamp ? stampLine(opts.stamp) : ''

  seiten.forEach((seite, si) => {
    const ops: string[] = []
    const text = (x: number, y: number, s: string, font: 'F1' | 'F2' | 'F3', size: number, grau = 0) => {
      ops.push('BT', `/${font} ${size} Tf`, `${grau} g`, `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`, `(${pdfText(s)}) Tj`, 'ET')
    }
    let y = seitenHoehe - MARGIN - TITLE_SIZE

    if (si === 0) {
      text(MARGIN, y, opts.title, 'F3', TITLE_SIZE)
      y -= TITLE_SIZE + 2
      if (opts.subtitle) {
        text(MARGIN, y, opts.subtitle, 'F1', SUB_SIZE, 0.35)
        y -= SUB_SIZE + 6
      }
      y -= 8
    } else {
      y -= 0
    }

    // Kopfzeile der Tabelle + Trennlinie.
    text(MARGIN, y, seite.kopf, 'F2', BODY_SIZE)
    y -= LINE
    text(MARGIN, y, trenner, 'F1', BODY_SIZE, 0.55)
    y -= LINE

    seite.zeilen.forEach((zeile, ri) => {
      if (ri % 2 === 1) {
        // Zebrastreifen: hell genug, um beim Ausdruck in Graustufen nicht zu
        // stoeren, dunkel genug, um die Zeile quer lesbar zu halten.
        ops.push('0.945 g', `${(MARGIN - 3).toFixed(2)} ${(y - 2.4).toFixed(2)} ${(seitenBreite - 2 * MARGIN + 6).toFixed(2)} ${LINE.toFixed(2)} re`, 'f')
      }
      text(MARGIN, y, zeile, 'F1', BODY_SIZE)
      y -= LINE
    })

    const fussY = MARGIN
    if (fuss) text(MARGIN, fussY, fuss, 'F1', 7, 0.45)
    const seitenText = `${si + 1} / ${seiten.length}`
    text(seitenBreite - MARGIN - seitenText.length * 7 * CHAR, fussY, seitenText, 'F1', 7, 0.45)

    const strom = ops.join('\n')
    objekt(seitenIds[si], `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${seitenBreite.toFixed(2)} ${seitenHoehe.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${inhaltIds[si]} 0 R >>`)
    objekt(inhaltIds[si], `<< /Length ${enc.encode(strom).length} >>\nstream\n${strom}\nendstream`)
  })

  const xrefStart = pos
  let xref = `xref\n0 ${letzteId + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= letzteId; i += 1) xref += `${String(versatz[i] ?? 0).padStart(10, '0')} 00000 n \n`
  schreib(xref)
  schreib(`trailer\n<< /Size ${letzteId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`)

  const gesamt = new Uint8Array(teile.reduce((a, b) => a + b.length, 0))
  let o = 0
  for (const b of teile) { gesamt.set(b, o); o += b.length }
  return new Blob([gesamt as unknown as BlobPart], { type: 'application/pdf' })
}
