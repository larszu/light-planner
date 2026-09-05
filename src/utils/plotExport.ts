// Compose a print-ready light plot: the 2D plan plus a drafting footer with a
// scale bar, a symbol legend (fixture types + counts) and a title block. Takes
// the live plan <canvas> (its pixels-per-metre is the plan's draw scale) and
// returns a new canvas ready to save as PNG/PDF.
import type { PlacedFixture } from '../types';
import { computePower } from '../core/patch';
import { drawFixtureSymbol } from './fixtureSymbols';
import { stampLine, type DocumentStamp } from '../core/documentStamp';

export interface PlotInfo {
  projectName: string;
  author?: string;
  /**
   * Stand-Angabe fuer dieses Blatt (ADR-004). Optional, und ohne sie ist der
   * Ausdruck pixelgleich mit dem von vorher: die Fusszeile waechst nur, wenn
   * es etwas zu stempeln gibt.
   */
  stamp?: DocumentStamp;
}

// Largest "nice" length (1/2/5 × 10ⁿ) not exceeding m.
function niceLength(m: number): number {
  if (m <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const f = m / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
}

/**
 * Was in der Zeile „Stand" des Titelblocks steht.
 *
 * Ohne festgeschriebenen Stand steht dort ausdruecklich, dass es keinen gibt —
 * ein leeres Feld liesse offen, ob niemand einen gesetzt hat oder ob die
 * Angabe verlorenging.
 */
export function standText(stamp: DocumentStamp): string {
  if (!stamp.revision) return 'nicht festgeschrieben';
  return stamp.drifted ? `${stamp.revision} + Änderungen` : stamp.revision;
}

export function composePlot(src: HTMLCanvasElement, pxPerMeter: number, fixtures: PlacedFixture[], info: PlotInfo): HTMLCanvasElement {
  const S = Math.max(0.85, src.width / 1100);     // resolution-aware scale factor
  // Eigenes Band fuer die Stempelzeile statt sie in die Fusszeile zu quetschen:
  // die Legende fuellt deren Hoehe bereits spaltenweise aus, und eine Zeile,
  // die unter Umstaenden von Legendentext ueberschrieben wird, ist genau die
  // Art Halb-Zusicherung, gegen die ADR-004 gebaut ist.
  const stampH = info.stamp ? Math.round(20 * S) : 0;
  const legendH = Math.round(178 * S);
  const footerH = legendH + stampH;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height + footerH;
  const ctx = out.getContext('2d');
  if (!ctx) return src;

  ctx.drawImage(src, 0, 0);
  const fy = src.height;
  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0, fy, out.width, footerH);
  ctx.strokeStyle = '#3b9dff';
  ctx.lineWidth = Math.max(1.5, 2 * S);
  ctx.beginPath(); ctx.moveTo(0, fy + ctx.lineWidth / 2); ctx.lineTo(out.width, fy + ctx.lineWidth / 2); ctx.stroke();

  const pad = 22 * S;
  ctx.textBaseline = 'top';

  // ── Scale bar ──
  const niceM = niceLength((150 * S) / pxPerMeter);
  const barPx = niceM * pxPerMeter;
  const sbY = fy + pad + 14 * S;
  ctx.strokeStyle = '#e7eef6';
  ctx.fillStyle = '#e7eef6';
  ctx.lineWidth = Math.max(1.5, 2 * S);
  ctx.beginPath();
  ctx.moveTo(pad, sbY); ctx.lineTo(pad + barPx, sbY);
  ctx.moveTo(pad, sbY - 5 * S); ctx.lineTo(pad, sbY + 5 * S);
  ctx.moveTo(pad + barPx, sbY - 5 * S); ctx.lineTo(pad + barPx, sbY + 5 * S);
  ctx.moveTo(pad + barPx / 2, sbY - 3.5 * S); ctx.lineTo(pad + barPx / 2, sbY + 3.5 * S);
  ctx.stroke();
  ctx.font = `${13 * S}px sans-serif`; ctx.textAlign = 'left';
  ctx.fillText(`${niceM} m`, pad, sbY + 9 * S);
  ctx.fillStyle = '#9aa7b6'; ctx.font = `${10.5 * S}px sans-serif`;
  ctx.fillText('Maßstabsbalken', pad, sbY + 26 * S);

  // ── Legend (symbols + counts), in columns ──
  const types = new Map<string, { name: string; count: number; category: PlacedFixture['fixture']['category'] }>();
  for (const f of fixtures) {
    const k = `${f.fixture.manufacturer}|${f.fixture.name}`;
    const e = types.get(k);
    if (e) e.count += 1; else types.set(k, { name: f.fixture.name, count: 1, category: f.fixture.category });
  }
  const legend = [...types.values()].sort((a, b) => b.count - a.count);
  const legX0 = pad + barPx + pad * 2;
  const titleW = 300 * S;
  const legAreaW = out.width - legX0 - titleW - pad * 2;
  ctx.fillStyle = '#9aa7b6'; ctx.font = `bold ${10.5 * S}px sans-serif`;
  ctx.fillText('LEGENDE', legX0, fy + pad);
  const rowH = 26 * S, colW = Math.max(150 * S, legAreaW / Math.max(1, Math.ceil(legend.length / 4)));
  const maxRows = Math.max(1, Math.floor((legendH - pad * 2 - 16 * S) / rowH));
  legend.forEach((t, i) => {
    const col = Math.floor(i / maxRows), row = i % maxRows;
    const x = legX0 + col * colW, y = fy + pad + 18 * S + row * rowH;
    if (x + colW > legX0 + legAreaW + colW) return; // overflow guard
    ctx.save();
    ctx.translate(x + 9 * S, y + 9 * S);
    drawFixtureSymbol(ctx, t.category, 8 * S, false, 1);
    ctx.restore();
    ctx.fillStyle = '#e7eef6'; ctx.font = `${12 * S}px sans-serif`; ctx.textAlign = 'left';
    ctx.fillText(`${t.count}× ${t.name}`, x + 24 * S, y + 3 * S);
  });

  // ── Title block (right) ──
  const tbX = out.width - titleW - pad, tbY = fy + pad * 0.7, tbH = footerH - pad * 1.4;
  ctx.strokeStyle = '#28323f'; ctx.lineWidth = Math.max(1, S);
  ctx.strokeRect(tbX, tbY, titleW, tbH);
  ctx.fillStyle = '#e7eef6'; ctx.textAlign = 'left'; ctx.font = `bold ${17 * S}px sans-serif`;
  ctx.fillText(info.projectName || 'Lichtplan', tbX + 12 * S, tbY + 10 * S, titleW - 24 * S);
  ctx.fillStyle = '#9aa7b6'; ctx.font = `${11 * S}px sans-serif`;
  ctx.fillText('Lichtplan', tbX + 12 * S, tbY + 32 * S);
  const power = computePower(fixtures);
  const weight = fixtures.reduce((s, f) => s + (f.fixture.weight || 0), 0);
  const rows: [string, string][] = [
    ['Datum', new Date().toLocaleDateString('de-DE')],
    // Der Stand steht NEBEN dem Datum, nicht statt seiner: „Rev 2" allein
    // sagt nicht, wann das Blatt aus dem Drucker kam, und ein Datum allein
    // nicht, gegen welchen festgeschriebenen Stand es zu lesen ist.
    ...(info.stamp
      ? ([['Stand', standText(info.stamp)]] as [string, string][])
      : []),
    ['Gezeichnet', info.author || '—'],
    ['Leuchten', `${fixtures.length} (${legend.length} Typen)`],
    ['Leistung', `${(power.totalWatts / 1000).toFixed(2)} kW · ${power.amps1ph.toFixed(0)} A`],
    ['Gewicht', `${weight.toFixed(1)} kg`],
  ];
  let ry = tbY + 52 * S;
  for (const [k, val] of rows) {
    ctx.fillStyle = '#5f6c7c'; ctx.font = `${10.5 * S}px sans-serif`;
    ctx.fillText(k, tbX + 12 * S, ry);
    ctx.fillStyle = '#e7eef6'; ctx.font = `${12 * S}px sans-serif`; ctx.textAlign = 'right';
    ctx.fillText(val, tbX + titleW - 12 * S, ry, titleW - 90 * S);
    ctx.textAlign = 'left';
    ry += 17 * S;
  }

  // ── Stempelzeile (unterste Kante) ──
  // Wortgleich mit der Fussnote der CSV-Listen: nur so laesst sich ein Blatt
  // gegen eine Liste halten, ohne zwei Schreibweisen im Kopf zu haben.
  if (info.stamp) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5f6c7c';
    ctx.font = `${11 * S}px sans-serif`;
    ctx.fillText(stampLine(info.stamp), pad, fy + legendH + (stampH - 13 * S) / 2, out.width - pad * 2);
  }
  return out;
}
