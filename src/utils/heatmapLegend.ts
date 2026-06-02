import { luxToColor, luxToColorTarget } from '../core/lightCalc';

// Draws a heat-map legend onto a 2D canvas context (used when exporting an
// image while the heat-map is on). It samples the very same palette functions
// the map uses, so the swatches match the rendered colours exactly.
//
// Two modes, mirroring the renderer:
//   • target mode  (heatMapTarget > 0): three zones — under / on / over target
//   • scale mode   (otherwise):         a 0 … Max(lux) gradient with ticks

export interface HeatMapLegendOpts {
  canvasWidth: number;
  canvasHeight: number;
  heatMapScale: number;   // "Max" lux for the palette
  heatMapTarget: number;  // target lux (> 0 enables the three-zone mode)
}

function fmtLux(n: number): string {
  return Math.round(n).toLocaleString('de-DE');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawHeatMapLegend(ctx: CanvasRenderingContext2D, opts: HeatMapLegendOpts): void {
  const { canvasWidth: W, canvasHeight: H, heatMapTarget } = opts;
  const targetMode = heatMapTarget > 0;

  // Scale legend sizing gently with very large (e.g. retina) exports.
  const k = Math.max(1, Math.min(2.2, W / 1400));
  const margin = 14 * k;
  const innerPad = 11 * k;
  const titleH = 20 * k;
  const barH = 16 * k;
  const labelH = 15 * k;
  const boxW = (targetMode ? 264 : 236) * k;
  const boxH = innerPad * 2 + titleH + barH + labelH;
  const x0 = W - boxW - margin;
  const y0 = H - boxH - margin;

  ctx.save();
  ctx.textBaseline = 'top';

  // Background card
  ctx.fillStyle = 'rgba(20,20,32,0.86)';
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1 * k;
  roundRect(ctx, x0, y0, boxW, boxH, 8 * k);
  ctx.fill();
  ctx.stroke();

  const cx = x0 + innerPad;
  let cy = y0 + innerPad;
  const barX = cx;
  const barW = boxW - innerPad * 2;

  ctx.fillStyle = '#ffffff';
  ctx.font = `${12.5 * k}px sans-serif`;
  ctx.textAlign = 'left';

  if (targetMode) {
    ctx.fillText(`Ziel-Beleuchtung · ${fmtLux(heatMapTarget)} lx`, cx, cy);
    cy += titleH;

    const zones: { rgb: [number, number, number, number]; label: string }[] = [
      { rgb: luxToColorTarget(heatMapTarget * 0.5, heatMapTarget), label: '< 80 %' },
      { rgb: luxToColorTarget(heatMapTarget, heatMapTarget), label: 'im Ziel' },
      { rgb: luxToColorTarget(heatMapTarget * 2, heatMapTarget), label: '> 120 %' },
    ];
    const zw = barW / 3;
    for (let i = 0; i < 3; i++) {
      const [r, g, b] = zones[i].rgb;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(barX + i * zw, cy, zw - 2 * k, barH);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(barX, cy, barW, barH);
    cy += barH + 3 * k;

    ctx.fillStyle = '#dfe3ea';
    ctx.font = `${10.5 * k}px sans-serif`;
    for (let i = 0; i < 3; i++) {
      ctx.textAlign = 'center';
      ctx.fillText(zones[i].label, barX + i * zw + zw / 2, cy);
    }
    ctx.textAlign = 'left';
  } else {
    const max = opts.heatMapScale > 0 ? opts.heatMapScale : 1000;
    ctx.fillText('Beleuchtungsstärke (lux)', cx, cy);
    cy += titleH;

    // Gradient bar, sampled from the same palette as the map (full opacity).
    const steps = Math.max(2, Math.round(barW));
    const sw = barW / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      if (t <= 0) {
        ctx.fillStyle = 'rgb(10,10,40)';
      } else {
        const [r, g, b] = luxToColor(t * max, max);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      }
      ctx.fillRect(barX + i * sw, cy, sw + 1, barH);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(barX, cy, barW, barH);
    cy += barH + 3 * k;

    ctx.fillStyle = '#dfe3ea';
    ctx.font = `${10.5 * k}px sans-serif`;
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    for (const t of ticks) {
      const tx = barX + t * barW;
      ctx.textAlign = t === 0 ? 'left' : t === 1 ? 'right' : 'center';
      ctx.fillText(fmtLux(max * t), tx, cy);
    }
    ctx.textAlign = 'left';
  }

  ctx.restore();
}
