import React, { useRef, useEffect, useCallback } from 'react';
import type { PlacedFixture, Shape, Tool, ViewTransform, FloorPlan, Fixture, Person, StageElement, Truss } from '../types';
import type { PlanMode } from '../App';
import { computeHeatMap, luxToColor, luxToColorTarget, totalLux, effectiveFieldAngleDeg } from '../utils/lightCalc';
import { drawFixtureSymbol } from '../utils/fixtureSymbols';
import { getBeamColorRgba } from '../utils/colorTemp';

interface Props {
  fixtures: PlacedFixture[];
  shapes: Shape[];
  persons: Person[];
  stageElements: StageElement[];
  trusses: Truss[];
  floorPlan: FloorPlan | null;
  snapStep: number;
  activeTool: Tool;
  fixtureToPlace: Fixture | null;
  selectedIds: Set<string>;
  showHeatMap: boolean;
  heatMapScale: number;
  heatMapTarget: number;
  planMode: PlanMode;
  onPlaceFixture: (fixture: Fixture, x: number, y: number) => void;
  onMoveFixture: (id: string, x: number, y: number) => void;
  onSelect: (id: string | null, ctrlKey?: boolean) => void;
  onAddShape: (shape: Shape) => void;
  onAddPerson: (x: number, y: number) => void;
  onAddStageElement: (x: number, y: number) => void;
  onMovePerson: (id: string, x: number, y: number) => void;
  onMoveStageElement: (id: string, x: number, y: number) => void;
  onAddTruss: (x1: number, y1: number, x2: number, y2: number) => void;
  onMoveTruss: (id: string, dx: number, dy: number) => void;
  onCursorLux: (lux: number | null) => void;
  onToolChange: (tool: Tool) => void;
  onDropFixture: (fixture: Fixture, x: number, y: number) => void;
  onMoveAim: (id: string, aimX: number, aimY: number) => void;
  onUpdateFloorPlan: (updates: Partial<FloorPlan>) => void;
  onCalibrateSegment: (x1: number, y1: number, x2: number, y2: number) => void;
}

const GRID_COLOR = '#2a2a3c';
const GRID_MAJOR_COLOR = '#3a3a50';
const RULER_BG = '#1e1e30';
const RULER_TEXT = '#888';
const RULER_SIZE = 28;

// Shortest distance from point (px,py) to segment (ax,ay)-(bx,by).
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const PlanCanvas: React.FC<Props> = ({
  fixtures,
  shapes,
  persons,
  stageElements,
  trusses,
  floorPlan,
  snapStep,
  activeTool,
  fixtureToPlace,
  selectedIds,
  showHeatMap,
  heatMapScale,
  heatMapTarget,
  planMode,
  onPlaceFixture,
  onMoveFixture,
  onSelect,
  onAddShape,
  onAddPerson,
  onAddStageElement,
  onMovePerson,
  onMoveStageElement,
  onAddTruss,
  onMoveTruss,
  onCursorLux,
  onToolChange,
  onDropFixture,
  onMoveAim,
  onUpdateFloorPlan,
  onCalibrateSegment,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewTransform>({ offsetX: RULER_SIZE + 60, offsetY: RULER_SIZE + 60, scale: 40 });
  const dragRef = useRef<{
    type: 'pan' | 'move' | 'move-aim' | 'move-person' | 'move-stage' | 'move-truss' | 'draw-rect' | 'draw-line' | 'draw-measure' | 'draw-truss' | 'calibrate' | 'move-plan';
    startScreenX: number;
    startScreenY: number;
    startWorldX: number;
    startWorldY: number;
    targetId?: string;
    origOffsetX?: number;
    origOffsetY?: number;
    planOrigX?: number;
    planOrigY?: number;
  } | null>(null);
  const measureEndRef = useRef<{ x: number; y: number } | null>(null);
  const calibEndRef = useRef<{ x: number; y: number } | null>(null);
  const heatMapCacheRef = useRef<{ imageData: ImageData | null; key: string }>({ imageData: null, key: '' });
  const animFrameRef = useRef<number>(0);
  const spaceDownRef = useRef(false);

  const screenToWorld = useCallback((sx: number, sy: number): [number, number] => {
    const v = viewRef.current;
    return [(sx - v.offsetX) / v.scale, (sy - v.offsetY) / v.scale];
  }, []);

  // Snap a world coordinate to the grid (if enabled), else to 0.1 m.
  const snap = useCallback(
    (val: number) => (snapStep > 0 ? Math.round(val / snapStep) * snapStep : Math.round(val * 10) / 10),
    [snapStep],
  );

  const drawRulers = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const v = viewRef.current;
    ctx.fillStyle = RULER_BG;
    ctx.fillRect(0, 0, w, RULER_SIZE);
    ctx.fillRect(0, 0, RULER_SIZE, h);
    ctx.fillStyle = '#15152a';
    ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);

    ctx.save();
    ctx.font = '9px monospace';
    ctx.fillStyle = RULER_TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let tickM = 1;
    if (v.scale < 8) tickM = 10;
    else if (v.scale < 20) tickM = 5;
    else if (v.scale < 40) tickM = 2;
    else if (v.scale >= 80) tickM = 0.5;

    const left = (RULER_SIZE - v.offsetX) / v.scale;
    const right = (w - v.offsetX) / v.scale;
    const top = (RULER_SIZE - v.offsetY) / v.scale;
    const bottom = (h - v.offsetY) / v.scale;
    const startX = Math.floor(left / tickM) * tickM;
    const startY = Math.floor(top / tickM) * tickM;

    for (let xm = startX; xm <= right; xm += tickM) {
      const sx = v.offsetX + xm * v.scale;
      if (sx < RULER_SIZE) continue;
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, RULER_SIZE - 6);
      ctx.lineTo(sx, RULER_SIZE);
      ctx.stroke();
      ctx.fillText(tickM >= 1 ? xm.toFixed(0) : xm.toFixed(1), sx, RULER_SIZE / 2);
    }

    ctx.textAlign = 'center';
    for (let ym = startY; ym <= bottom; ym += tickM) {
      const sy = v.offsetY + ym * v.scale;
      if (sy < RULER_SIZE) continue;
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(RULER_SIZE - 6, sy);
      ctx.lineTo(RULER_SIZE, sy);
      ctx.stroke();
      ctx.save();
      ctx.translate(RULER_SIZE / 2, sy);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(tickM >= 1 ? ym.toFixed(0) : ym.toFixed(1), 0, 0);
      ctx.restore();
    }

    ctx.strokeStyle = '#3a3a50';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(RULER_SIZE, 0);
    ctx.lineTo(RULER_SIZE, h);
    ctx.moveTo(0, RULER_SIZE);
    ctx.lineTo(w, RULER_SIZE);
    ctx.stroke();
    ctx.restore();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const v = viewRef.current;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(RULER_SIZE, RULER_SIZE, w - RULER_SIZE, h - RULER_SIZE);
    ctx.clip();
    ctx.save();
    ctx.translate(v.offsetX, v.offsetY);
    ctx.scale(v.scale, v.scale);

    const left = (RULER_SIZE - v.offsetX) / v.scale;
    const top = (RULER_SIZE - v.offsetY) / v.scale;
    const right = (w - v.offsetX) / v.scale;
    const bottom = (h - v.offsetY) / v.scale;

    // Grid
    const gridStep = v.scale >= 20 ? 1 : v.scale >= 5 ? 5 : 10;
    const startX = Math.floor(left / gridStep) * gridStep;
    const startY = Math.floor(top / gridStep) * gridStep;
    ctx.lineWidth = 1 / v.scale;
    for (let x = startX; x <= right; x += gridStep) {
      ctx.strokeStyle = x % 5 === 0 ? GRID_MAJOR_COLOR : GRID_COLOR;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    for (let y = startY; y <= bottom; y += gridStep) {
      ctx.strokeStyle = y % 5 === 0 ? GRID_MAJOR_COLOR : GRID_COLOR;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }

    // Axes
    ctx.lineWidth = 2 / v.scale;
    ctx.strokeStyle = '#555';
    ctx.beginPath();
    ctx.moveTo(0, top); ctx.lineTo(0, bottom);
    ctx.moveTo(left, 0); ctx.lineTo(right, 0);
    ctx.stroke();

    // Floor plan (imported building plan)
    if (floorPlan) {
      const { offsetX: ox, offsetY: oy, widthMeters: fw, heightMeters: fh } = floorPlan;
      ctx.globalAlpha = floorPlan.opacity;
      ctx.drawImage(floorPlan.image, ox, oy, fw, fh);
      ctx.globalAlpha = 1;
      // Outline + handle while the plan is being positioned/calibrated.
      if ((planMode === 'move' || planMode === 'calibrate') && !floorPlan.locked) {
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 1.5 / v.scale;
        ctx.setLineDash([6 / v.scale, 4 / v.scale]);
        ctx.strokeRect(ox, oy, fw, fh);
        ctx.setLineDash([]);
        if (planMode === 'move') {
          const hs = 7 / v.scale;
          ctx.fillStyle = '#4fc3f7';
          for (const [hx, hy] of [[ox, oy], [ox + fw, oy], [ox, oy + fh], [ox + fw, oy + fh]] as const) {
            ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
          }
        }
      }
    }

    // Stage elements
    for (const se of stageElements) {
      ctx.save();
      ctx.translate(se.x + se.width / 2, se.y + se.depth / 2);
      ctx.rotate((se.rotation * Math.PI) / 180);
      const isSel = selectedIds.has(se.id);
      ctx.fillStyle = isSel ? 'rgba(139,69,19,0.35)' : 'rgba(139,69,19,0.2)';
      ctx.strokeStyle = isSel ? '#ffcc33' : '#8B4513';
      ctx.lineWidth = 2 / v.scale;
      ctx.fillRect(-se.width / 2, -se.depth / 2, se.width, se.depth);
      ctx.strokeRect(-se.width / 2, -se.depth / 2, se.width, se.depth);
      ctx.fillStyle = '#ccc';
      ctx.font = `${10 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${se.width}×${se.depth}m h=${se.height}m`, 0, 4 / v.scale);
      if (se.label) ctx.fillText(se.label, 0, -se.depth / 2 - 4 / v.scale);

      // Blueprint-style dimension annotations (Maßlinien)
      const dimOffset = 8 / v.scale; // offset of dimension line from edge
      const tickLen = 4 / v.scale;
      ctx.strokeStyle = '#6af';
      ctx.fillStyle = '#6af';
      ctx.lineWidth = 0.8 / v.scale;
      ctx.setLineDash([]);
      ctx.font = `${8 / v.scale}px monospace`;

      // Width dimension (bottom)
      const wDimY = se.depth / 2 + dimOffset;
      ctx.beginPath();
      ctx.moveTo(-se.width / 2, wDimY - tickLen / 2);
      ctx.lineTo(-se.width / 2, wDimY + tickLen / 2);
      ctx.moveTo(-se.width / 2, wDimY);
      ctx.lineTo(se.width / 2, wDimY);
      ctx.moveTo(se.width / 2, wDimY - tickLen / 2);
      ctx.lineTo(se.width / 2, wDimY + tickLen / 2);
      ctx.stroke();
      ctx.textBaseline = 'top';
      ctx.fillText(`${se.width} m`, 0, wDimY + 2 / v.scale);

      // Depth dimension (right)
      const dDimX = se.width / 2 + dimOffset;
      ctx.beginPath();
      ctx.moveTo(dDimX - tickLen / 2, -se.depth / 2);
      ctx.lineTo(dDimX + tickLen / 2, -se.depth / 2);
      ctx.moveTo(dDimX, -se.depth / 2);
      ctx.lineTo(dDimX, se.depth / 2);
      ctx.moveTo(dDimX - tickLen / 2, se.depth / 2);
      ctx.lineTo(dDimX + tickLen / 2, se.depth / 2);
      ctx.stroke();
      ctx.save();
      ctx.translate(dDimX + 2 / v.scale, 0);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'center';
      ctx.fillText(`${se.depth} m`, 0, 0);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';

      ctx.restore();
    }

    // Trusses (rigging / hanging positions)
    for (const t of trusses) {
      const isSel = selectedIds.has(t.id);
      const dx = t.x2 - t.x1, dy = t.y2 - t.y1;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const halfW = 0.15;
      ctx.save();
      ctx.translate((t.x1 + t.x2) / 2, (t.y1 + t.y2) / 2);
      ctx.rotate(angle);
      ctx.fillStyle = isSel ? 'rgba(255,204,51,0.12)' : 'rgba(154,164,178,0.10)';
      ctx.fillRect(-len / 2, -halfW, len, halfW * 2);
      // Two chords
      ctx.strokeStyle = isSel ? '#ffcc33' : '#9aa4b2';
      ctx.lineWidth = 1.5 / v.scale;
      ctx.beginPath();
      ctx.moveTo(-len / 2, -halfW); ctx.lineTo(len / 2, -halfW);
      ctx.moveTo(-len / 2, halfW); ctx.lineTo(len / 2, halfW);
      ctx.moveTo(-len / 2, -halfW); ctx.lineTo(-len / 2, halfW);
      ctx.moveTo(len / 2, -halfW); ctx.lineTo(len / 2, halfW);
      ctx.stroke();
      // Diagonal webbing
      ctx.lineWidth = 0.7 / v.scale;
      ctx.beginPath();
      for (let x = -len / 2; x < len / 2 - 1e-6; x += 0.5) {
        ctx.moveTo(x, -halfW); ctx.lineTo(Math.min(x + 0.5, len / 2), halfW);
      }
      ctx.stroke();
      // Label (kept upright)
      if (Math.abs(angle) > Math.PI / 2) ctx.rotate(Math.PI);
      ctx.fillStyle = isSel ? '#ffcc33' : '#c8d0da';
      ctx.font = `${11 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${t.label ? t.label + ' · ' : ''}${len.toFixed(1)} m · h=${t.height}m`, 0, -halfW - 5 / v.scale);
      ctx.textAlign = 'start';
      ctx.restore();
    }

    // Shapes
    for (const shape of shapes) {
      ctx.strokeStyle = shape.color || '#5599ff';
      ctx.lineWidth = 2 / v.scale;
      ctx.fillStyle = shape.color ? shape.color + '22' : '#5599ff22';
      if (shape.type === 'rect' && shape.points.length === 2) {
        const [p0, p1] = shape.points;
        const rx = Math.min(p0.x, p1.x), ry = Math.min(p0.y, p1.y);
        const rw = Math.abs(p1.x - p0.x), rh = Math.abs(p1.y - p0.y);
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
        if (shape.label) {
          ctx.fillStyle = '#ccc';
          ctx.font = `${12 / v.scale}px sans-serif`;
          ctx.fillText(shape.label, rx + 4 / v.scale, ry + 14 / v.scale);
        }
      } else if ((shape.type === 'line' || shape.type === 'measure') && shape.points.length === 2) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        ctx.lineTo(shape.points[1].x, shape.points[1].y);
        if (shape.type === 'measure') {
          ctx.setLineDash([6 / v.scale, 4 / v.scale]);
          ctx.strokeStyle = '#ff9800';
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (shape.label) {
          const mx = (shape.points[0].x + shape.points[1].x) / 2;
          const my = (shape.points[0].y + shape.points[1].y) / 2;
          ctx.fillStyle = shape.type === 'measure' ? '#ff9800' : '#ccc';
          ctx.font = `bold ${13 / v.scale}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(shape.label, mx, my - 8 / v.scale);
          ctx.textAlign = 'start';
        }
      }
    }

    // Heat map
    if (showHeatMap && fixtures.length > 0) {
      const hmResX = 150, hmResY = 150;
      const planLeft = floorPlan ? floorPlan.offsetX : 0;
      const planTop = floorPlan ? floorPlan.offsetY : 0;
      const planRight = floorPlan ? floorPlan.offsetX + floorPlan.widthMeters : 50;
      const planBottom = floorPlan ? floorPlan.offsetY + floorPlan.heightMeters : 30;
      const hmLeft = Math.max(left, planLeft), hmTop = Math.max(top, planTop);
      const hmWidth = Math.min(right, planRight) - hmLeft;
      const hmHeight = Math.min(bottom, planBottom) - hmTop;
      if (hmWidth > 0 && hmHeight > 0) {
        const cacheKey = `${fixtures.map((f) => `${f.id}:${f.x}:${f.y}:${f.mountingHeight}:${f.dimming}:${f.aimX}:${f.aimY}`).join('|')}|${heatMapScale}|${heatMapTarget}|${hmLeft.toFixed(1)}|${hmTop.toFixed(1)}|${hmWidth.toFixed(1)}|${hmHeight.toFixed(1)}`;
        let imgData = heatMapCacheRef.current.imageData;
        if (heatMapCacheRef.current.key !== cacheKey || !imgData) {
          const { data } = computeHeatMap(fixtures, hmLeft, hmTop, hmWidth, hmHeight, hmResX, hmResY);
          imgData = new ImageData(hmResX, hmResY);
          const useTarget = heatMapTarget > 0;
          for (let i = 0; i < data.length; i++) {
            const [r, g, b, a] = useTarget
              ? luxToColorTarget(data[i], heatMapTarget)
              : luxToColor(data[i], heatMapScale);
            imgData.data[i * 4] = r; imgData.data[i * 4 + 1] = g;
            imgData.data[i * 4 + 2] = b; imgData.data[i * 4 + 3] = a;
          }
          heatMapCacheRef.current = { imageData: imgData, key: cacheKey };
        }
        const offscreen = document.createElement('canvas');
        offscreen.width = hmResX; offscreen.height = hmResY;
        offscreen.getContext('2d')!.putImageData(imgData, 0, 0);
        ctx.drawImage(offscreen, hmLeft, hmTop, hmWidth, hmHeight);
      }
    }

    // Persons
    for (const p of persons) {
      const isSel = selectedIds.has(p.id);
      const r = 0.25;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? 'rgba(255,150,50,0.6)' : 'rgba(255,150,50,0.3)';
      ctx.fill();
      ctx.strokeStyle = isSel ? '#ffcc33' : '#ff9633';
      ctx.lineWidth = 2 / v.scale;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? '#ffcc33' : '#ff9633';
      ctx.fill();
      ctx.fillStyle = '#eee';
      ctx.font = `${11 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.label || `Person ${p.height}m`, p.x, p.y - r - 6 / v.scale);
      ctx.textAlign = 'start';
    }

    // Fixtures
    for (const f of fixtures) {
      const isSel = selectedIds.has(f.id);
      const rad = 0.3;
      // Footprint drawn at the field angle (10 % isophote) so its edge
      // coincides with the heat-map fade-out.
      const fieldAngle = effectiveFieldAngleDeg(f);
      const beamRad = Math.tan((fieldAngle / 2) * (Math.PI / 180)) * f.mountingHeight;
      const dimAlpha = f.dimming / 100;

      // Beam cone visualization – emanates FROM the fixture toward aim
      const aimDx = f.aimX - f.x;
      const aimDy = f.aimY - f.y;
      const aimDist2D = Math.sqrt(aimDx * aimDx + aimDy * aimDy);

      if (aimDist2D < 0.1) {
        // Aiming straight down – show circle around fixture
        ctx.beginPath();
        ctx.arc(f.x, f.y, beamRad, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? getBeamColorRgba(f, 0.14 * dimAlpha) : getBeamColorRgba(f, 0.08 * dimAlpha);
        ctx.fill();
        ctx.strokeStyle = isSel ? getBeamColorRgba(f, 0.40 * dimAlpha) : getBeamColorRgba(f, 0.18 * dimAlpha);
        ctx.lineWidth = 1 / v.scale;
        ctx.stroke();
      } else {
        // Angled – draw cone projection from fixture to beam spread at aim
        const coneAngle = Math.atan2(aimDy, aimDx);
        const perpAngle = coneAngle + Math.PI / 2;
        const ex1x = f.aimX + beamRad * Math.cos(perpAngle);
        const ex1y = f.aimY + beamRad * Math.sin(perpAngle);
        const ex2x = f.aimX - beamRad * Math.cos(perpAngle);
        const ex2y = f.aimY - beamRad * Math.sin(perpAngle);

        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(ex1x, ex1y);
        ctx.arc(f.aimX, f.aimY, beamRad, perpAngle, perpAngle - Math.PI, true);
        ctx.lineTo(f.x, f.y);
        ctx.closePath();
        ctx.fillStyle = isSel ? getBeamColorRgba(f, 0.12 * dimAlpha) : getBeamColorRgba(f, 0.06 * dimAlpha);
        ctx.fill();
        ctx.strokeStyle = isSel ? getBeamColorRgba(f, 0.30 * dimAlpha) : getBeamColorRgba(f, 0.14 * dimAlpha);
        ctx.lineWidth = 1 / v.scale;
        ctx.stroke();
      }

      // Aim line + handle
      if (aimDist2D > 0.01) {
        ctx.beginPath();
        ctx.setLineDash([4 / v.scale, 4 / v.scale]);
        ctx.moveTo(f.x, f.y); ctx.lineTo(f.aimX, f.aimY);
        ctx.strokeStyle = isSel ? '#ffcc33' : '#888';
        ctx.lineWidth = 1 / v.scale; ctx.stroke();
        ctx.setLineDash([]);

        if (isSel) {
          // Draggable aim handle – filled circle with crosshair and arrowhead
          const hr = 0.22;
          ctx.beginPath();
          ctx.arc(f.aimX, f.aimY, hr, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,204,51,0.25)';
          ctx.fill();
          ctx.strokeStyle = '#ffcc33';
          ctx.lineWidth = 1.5 / v.scale;
          ctx.stroke();
          // Crosshair inside
          const cs = 0.15;
          ctx.beginPath();
          ctx.moveTo(f.aimX - cs, f.aimY); ctx.lineTo(f.aimX + cs, f.aimY);
          ctx.moveTo(f.aimX, f.aimY - cs); ctx.lineTo(f.aimX, f.aimY + cs);
          ctx.strokeStyle = '#ffcc33';
          ctx.lineWidth = 1.5 / v.scale;
          ctx.stroke();
          // Arrow along aim line pointing to target
          const arrAngle = Math.atan2(f.aimY - f.y, f.aimX - f.x);
          const arrLen = 0.3;
          const arrW = 0.12;
          const tipX = f.aimX - (hr + 0.02) * Math.cos(arrAngle);
          const tipY = f.aimY - (hr + 0.02) * Math.sin(arrAngle);
          ctx.beginPath();
          ctx.moveTo(tipX - arrLen * Math.cos(arrAngle) - arrW * Math.sin(arrAngle),
                     tipY - arrLen * Math.sin(arrAngle) + arrW * Math.cos(arrAngle));
          ctx.lineTo(tipX, tipY);
          ctx.lineTo(tipX - arrLen * Math.cos(arrAngle) + arrW * Math.sin(arrAngle),
                     tipY - arrLen * Math.sin(arrAngle) - arrW * Math.cos(arrAngle));
          ctx.strokeStyle = '#ffcc33';
          ctx.lineWidth = 1.5 / v.scale;
          ctx.stroke();
        } else {
          const cs = 0.12;
          ctx.strokeStyle = '#666';
          ctx.lineWidth = 1.5 / v.scale;
          ctx.beginPath();
          ctx.moveTo(f.aimX - cs, f.aimY); ctx.lineTo(f.aimX + cs, f.aimY);
          ctx.moveTo(f.aimX, f.aimY - cs); ctx.lineTo(f.aimX, f.aimY + cs);
          ctx.stroke();
        }
      }

      // Fixture body – standardized symbol based on category
      const angle = Math.atan2(f.aimY - f.y, f.aimX - f.x);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(angle);
      drawFixtureSymbol(ctx, f.fixture.category, rad, isSel, v.scale);
      ctx.restore();

      // Labels
      ctx.fillStyle = '#ddd';
      ctx.font = `${10 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(f.fixture.name, f.x, f.y - rad - 6 / v.scale);
      ctx.fillStyle = '#999';
      ctx.font = `${9 / v.scale}px sans-serif`;
      ctx.fillText(`h=${f.mountingHeight}m`, f.x, f.y + rad + 12 / v.scale);
      // Channel / DMX patch badge
      if (f.channel != null || f.dmxAddress != null) {
        const parts: string[] = [];
        if (f.channel != null) parts.push(`#${f.channel}`);
        if (f.universe != null && f.dmxAddress != null) parts.push(`${f.universe}.${f.dmxAddress}`);
        ctx.fillStyle = '#4fc3f7';
        ctx.font = `${8.5 / v.scale}px monospace`;
        ctx.fillText(parts.join(' · '), f.x, f.y + rad + 22 / v.scale);
      }
      // Show aim distance as dimension line annotation
      const aimDist = Math.sqrt((f.aimX - f.x) ** 2 + (f.aimY - f.y) ** 2);
      if (aimDist > 0.3) {
        const realDist = Math.sqrt(aimDist * aimDist + f.mountingHeight * f.mountingHeight);
        ctx.fillStyle = '#6af';
        ctx.font = `${8 / v.scale}px monospace`;
        const lmx = (f.x + f.aimX) / 2;
        const lmy = (f.y + f.aimY) / 2;
        ctx.fillText(`${realDist.toFixed(1)}m`, lmx + 4 / v.scale, lmy - 4 / v.scale);
      }
      ctx.textAlign = 'start';
    }

    // Active measure line
    if (dragRef.current?.type === 'draw-measure' && measureEndRef.current) {
      const d = dragRef.current;
      const end = measureEndRef.current;
      const dist = Math.sqrt((end.x - d.startWorldX) ** 2 + (end.y - d.startWorldY) ** 2);
      ctx.beginPath();
      ctx.setLineDash([6 / v.scale, 4 / v.scale]);
      ctx.moveTo(d.startWorldX, d.startWorldY);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 2 / v.scale; ctx.stroke();
      ctx.setLineDash([]);
      const mx = (d.startWorldX + end.x) / 2, my = (d.startWorldY + end.y) / 2;
      ctx.fillStyle = '#ff9800';
      ctx.font = `bold ${14 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${dist.toFixed(2)} m`, mx, my - 10 / v.scale);
      ctx.textAlign = 'start';
    }

    // Active calibration line (drag a known distance to set the scale)
    if (dragRef.current?.type === 'calibrate' && calibEndRef.current) {
      const d = dragRef.current;
      const end = calibEndRef.current;
      const dist = Math.sqrt((end.x - d.startWorldX) ** 2 + (end.y - d.startWorldY) ** 2);
      ctx.beginPath();
      ctx.moveTo(d.startWorldX, d.startWorldY);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 2 / v.scale; ctx.stroke();
      // End ticks
      for (const [px, py] of [[d.startWorldX, d.startWorldY], [end.x, end.y]] as const) {
        ctx.beginPath(); ctx.arc(px, py, 4 / v.scale, 0, Math.PI * 2);
        ctx.fillStyle = '#4fc3f7'; ctx.fill();
      }
      const mx = (d.startWorldX + end.x) / 2, my = (d.startWorldY + end.y) / 2;
      ctx.fillStyle = '#4fc3f7';
      ctx.font = `bold ${14 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${dist.toFixed(2)} m`, mx, my - 10 / v.scale);
      ctx.textAlign = 'start';
    }

    // Active truss being drawn
    if (dragRef.current?.type === 'draw-truss' && measureEndRef.current) {
      const d = dragRef.current;
      const end = measureEndRef.current;
      const len = Math.hypot(end.x - d.startWorldX, end.y - d.startWorldY);
      ctx.strokeStyle = '#9aa4b2';
      ctx.lineWidth = 3 / v.scale;
      ctx.beginPath(); ctx.moveTo(d.startWorldX, d.startWorldY); ctx.lineTo(end.x, end.y); ctx.stroke();
      const mx = (d.startWorldX + end.x) / 2, my = (d.startWorldY + end.y) / 2;
      ctx.fillStyle = '#c8d0da';
      ctx.font = `bold ${12 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${len.toFixed(1)} m`, mx, my - 8 / v.scale);
      ctx.textAlign = 'start';
    }

    ctx.restore(); ctx.restore();
    drawRulers(ctx, w, h);

    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText(`1m = ${v.scale.toFixed(0)}px | Zoom: ${((v.scale / 40) * 100).toFixed(0)}%`, RULER_SIZE + 10, h - 10);
  }, [fixtures, shapes, persons, stageElements, trusses, floorPlan, selectedIds, showHeatMap, heatMapScale, heatMapTarget, planMode, screenToWorld, drawRulers]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const obs = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, [draw]);

  useEffect(() => {
    let running = true;
    const loop = () => { if (!running) return; draw(); animFrameRef.current = requestAnimationFrame(loop); };
    loop();
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [draw]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); spaceDownRef.current = true; }
      if (e.code === 'Delete' && selectedIds.size > 0) {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
        for (const id of selectedIds) {
          window.dispatchEvent(new CustomEvent('lp-delete', { detail: id }));
        }
      }
      if (e.code === 'Escape') { onSelect(null); onToolChange('select'); }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDownRef.current = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [selectedIds, onSelect, onToolChange]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/fixture');
    if (!data) return;
    try {
      const fixture: Fixture = JSON.parse(data);
      const rect = canvasRef.current!.getBoundingClientRect();
      const [wx, wy] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      onDropFixture(fixture, Math.round(wx * 10) / 10, Math.round(wy * 10) / 10);
    } catch { /* ignore */ }
  };

  const getCanvasPos = (e: React.MouseEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const [sx, sy] = getCanvasPos(e);
    const [wx, wy] = screenToWorld(sx, sy);

    if (e.button === 1 || spaceDownRef.current || activeTool === 'pan') {
      dragRef.current = { type: 'pan', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy,
        origOffsetX: viewRef.current.offsetX, origOffsetY: viewRef.current.offsetY };
      return;
    }
    if (e.button !== 0) return;

    // ── Floor-plan edit modes take precedence over tools ──
    if (floorPlan && planMode === 'calibrate') {
      calibEndRef.current = { x: wx, y: wy };
      dragRef.current = { type: 'calibrate', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy };
      return;
    }
    if (floorPlan && planMode === 'move' && !floorPlan.locked) {
      dragRef.current = { type: 'move-plan', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy,
        planOrigX: floorPlan.offsetX, planOrigY: floorPlan.offsetY };
      return;
    }

    if (fixtureToPlace) { onPlaceFixture(fixtureToPlace, snap(wx), snap(wy)); return; }
    if (activeTool === 'person') { onAddPerson(snap(wx), snap(wy)); return; }
    if (activeTool === 'stage') { onAddStageElement(snap(wx), snap(wy)); return; }
    if (activeTool === 'truss') {
      const s = { x: snap(wx), y: snap(wy) };
      measureEndRef.current = s;
      dragRef.current = { type: 'draw-truss', startScreenX: sx, startScreenY: sy, startWorldX: s.x, startWorldY: s.y };
      return;
    }
    if (activeTool === 'measure') {
      measureEndRef.current = { x: wx, y: wy };
      dragRef.current = { type: 'draw-measure', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy };
      return;
    }
    if (activeTool === 'rect') {
      dragRef.current = { type: 'draw-rect', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy };
      return;
    }
    if (activeTool === 'line') {
      dragRef.current = { type: 'draw-line', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy };
      return;
    }

    if (activeTool === 'select') {
      const ctrl = e.ctrlKey || e.metaKey;
      // Check aim-point handles first (only for selected fixture)
      const aimHitR = 0.35;
      for (const f of fixtures) {
        if (selectedIds.has(f.id) && Math.sqrt((wx - f.aimX) ** 2 + (wy - f.aimY) ** 2) < aimHitR) {
          dragRef.current = { type: 'move-aim', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: f.id };
          return;
        }
      }
      const cr = 0.5;
      for (const f of fixtures) {
        if (Math.sqrt((wx - f.x) ** 2 + (wy - f.y) ** 2) < cr) {
          onSelect(f.id, ctrl);
          dragRef.current = { type: 'move', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: f.id };
          return;
        }
      }
      for (const p of persons) {
        if (Math.sqrt((wx - p.x) ** 2 + (wy - p.y) ** 2) < 0.4) {
          onSelect(p.id, ctrl);
          dragRef.current = { type: 'move-person', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: p.id };
          return;
        }
      }
      for (const se of stageElements) {
        if (wx >= se.x && wx <= se.x + se.width && wy >= se.y && wy <= se.y + se.depth) {
          onSelect(se.id, ctrl);
          dragRef.current = { type: 'move-stage', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: se.id };
          return;
        }
      }
      for (const t of trusses) {
        if (distToSegment(wx, wy, t.x1, t.y1, t.x2, t.y2) < 0.4) {
          onSelect(t.id, ctrl);
          dragRef.current = { type: 'move-truss', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: t.id };
          return;
        }
      }
      onSelect(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const [sx, sy] = getCanvasPos(e);
    const [wx, wy] = screenToWorld(sx, sy);
    if (fixtures.length > 0) onCursorLux(totalLux(fixtures, wx, wy));
    else onCursorLux(null);

    if (!dragRef.current) return;
    const d = dragRef.current;

    if (d.type === 'pan') {
      viewRef.current.offsetX = d.origOffsetX! + (sx - d.startScreenX);
      viewRef.current.offsetY = d.origOffsetY! + (sy - d.startScreenY);
      return;
    }
    if (d.type === 'move' && d.targetId) {
      const f = fixtures.find((fi) => fi.id === d.targetId);
      if (f) {
        onMoveFixture(d.targetId, snap(f.x + wx - d.startWorldX), snap(f.y + wy - d.startWorldY));
        d.startWorldX = wx; d.startWorldY = wy;
      }
      return;
    }
    if (d.type === 'move-aim' && d.targetId) {
      onMoveAim(d.targetId, Math.round(wx * 10) / 10, Math.round(wy * 10) / 10);
      return;
    }
    if (d.type === 'move-person' && d.targetId) {
      const p = persons.find((pi) => pi.id === d.targetId);
      if (p) {
        onMovePerson(d.targetId, snap(p.x + wx - d.startWorldX), snap(p.y + wy - d.startWorldY));
        d.startWorldX = wx; d.startWorldY = wy;
      }
      return;
    }
    if (d.type === 'move-stage' && d.targetId) {
      const se = stageElements.find((s) => s.id === d.targetId);
      if (se) {
        onMoveStageElement(d.targetId, snap(se.x + wx - d.startWorldX), snap(se.y + wy - d.startWorldY));
        d.startWorldX = wx; d.startWorldY = wy;
      }
      return;
    }
    if (d.type === 'move-truss' && d.targetId) {
      onMoveTruss(d.targetId, wx - d.startWorldX, wy - d.startWorldY);
      d.startWorldX = wx; d.startWorldY = wy;
      return;
    }
    if (d.type === 'draw-measure') measureEndRef.current = { x: wx, y: wy };
    if (d.type === 'draw-truss') { measureEndRef.current = { x: snap(wx), y: snap(wy) }; return; }
    if (d.type === 'calibrate') { calibEndRef.current = { x: wx, y: wy }; return; }
    if (d.type === 'move-plan') {
      onUpdateFloorPlan({
        offsetX: Math.round((d.planOrigX! + wx - d.startWorldX) * 100) / 100,
        offsetY: Math.round((d.planOrigY! + wy - d.startWorldY) * 100) / 100,
      });
      return;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const d = dragRef.current;
      const [, , wx, wy] = (() => { const [sx2, sy2] = getCanvasPos(e); return [...screenToWorld(sx2, sy2), ...screenToWorld(sx2, sy2)]; })();
      const [sx2, sy2] = getCanvasPos(e);
      const [ewx, ewy] = screenToWorld(sx2, sy2);

      if (d.type === 'draw-rect') {
        const rw = Math.abs(ewx - d.startWorldX), rh = Math.abs(ewy - d.startWorldY);
        if (rw > 0.2 && rh > 0.2) {
          onAddShape({ id: 'shape-' + Date.now(), type: 'rect',
            points: [{ x: d.startWorldX, y: d.startWorldY }, { x: ewx, y: ewy }],
            label: `${rw.toFixed(1)}×${rh.toFixed(1)}m`, color: '#5599ff' });
        }
      }
      if (d.type === 'draw-line') {
        const len = Math.sqrt((ewx - d.startWorldX) ** 2 + (ewy - d.startWorldY) ** 2);
        if (len > 0.2) {
          onAddShape({ id: 'shape-' + Date.now(), type: 'line',
            points: [{ x: d.startWorldX, y: d.startWorldY }, { x: ewx, y: ewy }],
            label: `${len.toFixed(2)} m`, color: '#ff7043' });
        }
      }
      if (d.type === 'draw-measure') {
        const len = Math.sqrt((ewx - d.startWorldX) ** 2 + (ewy - d.startWorldY) ** 2);
        if (len > 0.1) {
          onAddShape({ id: 'measure-' + Date.now(), type: 'measure',
            points: [{ x: d.startWorldX, y: d.startWorldY }, { x: ewx, y: ewy }],
            label: `${len.toFixed(2)} m`, color: '#ff9800' });
        }
        measureEndRef.current = null;
      }
      if (d.type === 'calibrate') {
        onCalibrateSegment(d.startWorldX, d.startWorldY, ewx, ewy);
        calibEndRef.current = null;
      }
      if (d.type === 'draw-truss') {
        const len = Math.hypot(ewx - d.startWorldX, ewy - d.startWorldY);
        if (len > 0.3) onAddTruss(d.startWorldX, d.startWorldY, snap(ewx), snap(ewy));
        measureEndRef.current = null;
      }
    }
    dragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const [sx, sy] = getCanvasPos(e);
    const v = viewRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = Math.min(400, Math.max(2, v.scale * factor));
    v.offsetX = sx - ((sx - v.offsetX) / v.scale) * newScale;
    v.offsetY = sy - ((sy - v.offsetY) / v.scale) * newScale;
    v.scale = newScale;
  };

  const cursor = activeTool === 'pan' || spaceDownRef.current ? 'grab'
    : planMode === 'move' ? 'move'
    : planMode === 'calibrate' || fixtureToPlace || ['person', 'stage', 'rect', 'line', 'measure', 'truss'].includes(activeTool) ? 'crosshair'
    : 'default';

  return (
    <div ref={containerRef} className="plan-canvas-container">
      <canvas ref={canvasRef} className="plan-canvas"
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onWheel={handleWheel} onDragOver={handleDragOver} onDrop={handleDrop}
        onContextMenu={(e) => e.preventDefault()} style={{ cursor }} />
    </div>
  );
};

export default PlanCanvas;
