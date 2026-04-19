import type { FixtureCategory } from '../types';

const DEG2RAD = Math.PI / 180;

/**
 * Draw a standardized USITT-style fixture symbol on a 2D canvas.
 *
 * The symbol is drawn centered at (0,0) in local coordinates,
 * so the caller must translate/rotate before calling.
 *
 * @param ctx      Canvas rendering context (already translated & rotated to fixture position)
 * @param category Fixture category
 * @param size     Symbol radius in world units
 * @param isSel    Whether the fixture is selected
 * @param scale    Current view scale (px per meter) – for line width normalization
 */
export function drawFixtureSymbol(
  ctx: CanvasRenderingContext2D,
  category: FixtureCategory,
  size: number,
  isSel: boolean,
  scale: number,
): void {
  const s = size;
  const lw = 1.5 / scale;
  const fill = isSel ? '#ffcc33' : '#4fc3f7';
  const stroke = isSel ? '#fff' : '#1a1a2e';
  const innerFill = isSel ? '#fff' : '#2196f3';

  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;

  switch (category) {
    case 'profile': {
      // USITT ERS: Elongated body + protruding lens tube + barrel lines
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.5);
      ctx.lineTo(s * 0.5, -s * 0.5);
      ctx.lineTo(s * 0.9, -s * 0.3);
      ctx.lineTo(s * 0.9, s * 0.3);
      ctx.lineTo(s * 0.5, s * 0.5);
      ctx.lineTo(-s, s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Lens tube
      ctx.fillStyle = innerFill;
      ctx.fillRect(s * 0.9, -s * 0.25, s * 0.35, s * 0.5);
      ctx.strokeRect(s * 0.9, -s * 0.25, s * 0.35, s * 0.5);
      // Barrel marks
      ctx.beginPath();
      ctx.moveTo(s * 0.3, -s * 0.5);
      ctx.lineTo(s * 0.3, s * 0.5);
      ctx.stroke();
      break;
    }

    case 'fresnel': {
      // Circle with arc lines for stepped lens
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Concentric arcs (Fresnel lens steps)
      ctx.strokeStyle = innerFill;
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      ctx.arc(s * 0.2, 0, s * 0.25, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.2, 0, s * 0.4, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();
      // Lens direction indicator
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(s * 0.6, -s * 0.15);
      ctx.lineTo(s * 0.8, 0);
      ctx.lineTo(s * 0.6, s * 0.15);
      ctx.stroke();
      break;
    }

    case 'par': {
      // PAR can: circle with a line through center (filament orientation)
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Horizontal filament line
      ctx.strokeStyle = innerFill;
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, 0);
      ctx.lineTo(s * 0.3, 0);
      ctx.stroke();
      // Direction notch
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(s * 0.55, -s * 0.1);
      ctx.lineTo(s * 0.7, 0);
      ctx.lineTo(s * 0.55, s * 0.1);
      ctx.stroke();
      break;
    }

    case 'wash':
    case 'led-panel': {
      // LED: Rounded rectangle with dot grid
      const w = s * 1.0, h = s * 0.7;
      ctx.beginPath();
      roundedRect(ctx, -w, -h, w * 2, h * 2, s * 0.15);
      ctx.fill();
      ctx.stroke();
      // LED dots
      ctx.fillStyle = innerFill;
      const cols = 3, rows = 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dx = -w * 0.5 + (c / (cols - 1)) * w;
          const dy = -h * 0.4 + (r / (rows - 1)) * h * 0.8;
          ctx.beginPath();
          ctx.arc(dx, dy, s * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Direction arrow
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w, -s * 0.15);
      ctx.lineTo(w + s * 0.25, 0);
      ctx.lineTo(w, s * 0.15);
      ctx.stroke();
      break;
    }

    case 'spot': {
      // PC Spot: Rectangle with convex lens
      ctx.fillRect(-s * 0.8, -s * 0.45, s * 1.4, s * 0.9);
      ctx.strokeRect(-s * 0.8, -s * 0.45, s * 1.4, s * 0.9);
      // Convex lens arc
      ctx.fillStyle = innerFill;
      ctx.beginPath();
      ctx.arc(s * 0.6, 0, s * 0.35, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      break;
    }

    case 'beam': {
      // Narrow beam: elongated diamond/arrow
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, -s * 0.2);
      ctx.lineTo(s * 0.8, -s * 0.08);
      ctx.lineTo(s, 0);
      ctx.lineTo(s * 0.8, s * 0.08);
      ctx.lineTo(-s * 0.6, s * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Center line
      ctx.strokeStyle = innerFill;
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, 0);
      ctx.lineTo(s * 0.6, 0);
      ctx.stroke();
      break;
    }

    case 'moving-wash':
    case 'moving-spot':
    case 'moving-beam': {
      // Moving head: circle + yoke base
      // Yoke arms
      ctx.fillStyle = isSel ? 'rgba(255,204,51,0.4)' : 'rgba(79,195,247,0.3)';
      ctx.fillRect(-s * 0.1, -s * 0.8, s * 0.2, s * 0.3);
      ctx.fillRect(-s * 0.1, s * 0.5, s * 0.2, s * 0.3);
      // Head circle
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Crosshair
      ctx.strokeStyle = innerFill;
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, 0); ctx.lineTo(s * 0.3, 0);
      ctx.moveTo(0, -s * 0.3); ctx.lineTo(0, s * 0.3);
      ctx.stroke();
      // Type indicator: dot for wash, + for spot, beam line for beam
      ctx.fillStyle = innerFill;
      if (category === 'moving-wash') {
        ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2); ctx.fill();
      } else if (category === 'moving-beam') {
        ctx.strokeStyle = innerFill;
        ctx.lineWidth = lw * 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(s * 0.5, 0);
        ctx.stroke();
      }
      // Direction indicator
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, -s * 0.12);
      ctx.lineTo(s * 0.7, 0);
      ctx.lineTo(s * 0.5, s * 0.12);
      ctx.stroke();
      break;
    }

    case 'blinder': {
      // Blinder: rectangle with cell divisions
      const w = s * 1.0, h = s * 0.6;
      ctx.fillRect(-w, -h, w * 2, h * 2);
      ctx.strokeRect(-w, -h, w * 2, h * 2);
      // 4-cell grid
      ctx.strokeStyle = innerFill;
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -h); ctx.lineTo(0, h);
      ctx.moveTo(-w, 0); ctx.lineTo(w, 0);
      ctx.stroke();
      break;
    }

    case 'cyc': {
      // Asymmetric CYC light: J-shaped
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.5);
      ctx.lineTo(s * 0.5, -s * 0.5);
      ctx.lineTo(s * 0.7, -s * 0.2);
      ctx.lineTo(s * 0.7, s * 0.5);
      ctx.lineTo(-s * 0.7, s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Asymmetric reflector line
      ctx.strokeStyle = innerFill;
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.4);
      ctx.quadraticCurveTo(s * 0.4, 0, -s * 0.2, s * 0.4);
      ctx.stroke();
      break;
    }

    case 'flood': {
      // Scoop / open flood
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.5);
      ctx.lineTo(s * 0.5, -s * 0.7);
      ctx.lineTo(s * 0.5, s * 0.7);
      ctx.lineTo(-s * 0.5, s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'followspot': {
      // Followspot: long triangle with crosshair at exit
      ctx.beginPath();
      ctx.moveTo(-s * 1.0, -s * 0.35);
      ctx.lineTo(s * 0.8, -s * 0.15);
      ctx.lineTo(s * 0.8, s * 0.15);
      ctx.lineTo(-s * 1.0, s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Crosshair at front
      ctx.strokeStyle = innerFill;
      ctx.lineWidth = lw * 0.8;
      const cx = s * 0.6;
      ctx.beginPath();
      ctx.arc(cx, 0, s * 0.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18, 0); ctx.lineTo(cx + s * 0.18, 0);
      ctx.moveTo(cx, -s * 0.18); ctx.lineTo(cx, s * 0.18);
      ctx.stroke();
      break;
    }

    case 'custom':
    default: {
      // Diamond shape
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, 0);
      ctx.lineTo(0, -s * 0.4);
      ctx.lineTo(s * 0.6, 0);
      ctx.lineTo(0, s * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Direction
      ctx.beginPath();
      ctx.moveTo(s * 0.6, 0);
      ctx.lineTo(s * 0.85, 0);
      ctx.stroke();
      break;
    }
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

/**
 * Get a symbol category label (for legend/key).
 */
export const SYMBOL_LABELS: Record<FixtureCategory, string> = {
  profile: 'Profil (ERS)',
  fresnel: 'Fresnel',
  par: 'PAR',
  wash: 'LED Wash',
  spot: 'PC Spot',
  beam: 'Beam',
  'moving-wash': 'Moving Wash',
  'moving-spot': 'Moving Spot',
  'moving-beam': 'Moving Beam',
  blinder: 'Blinder',
  cyc: 'CYC',
  flood: 'Flood',
  followspot: 'Followspot',
  'led-panel': 'LED Panel',
  custom: 'Custom',
};
