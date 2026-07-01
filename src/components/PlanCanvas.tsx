import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import type { PlacedFixture, Shape, Tool, ViewTransform, FloorPlan, Fixture, Person, StageElement, Truss, Wall, Ceiling, Layers, CameraView } from '../types';
import type { PlanMode } from '../App';
import { computeHeatMap, luxToColor, luxToColorTarget, totalLux, effectiveFieldAngleDeg, precomputeSurfaceSamples } from '../core/lightCalc';
import { sampleWall, isCurved, wallControl, wallMidHandle, curveControlForMid, distToWall, pointInPolygon, wallSegments, normalizedWindows, pointAtRun } from '../core/geometry';
import type { ResolvedSun } from '../core/sun';
import { drawFixtureSymbol } from '../utils/fixtureSymbols';
import { getBeamColorRgba } from '../core/colorTemp';

interface Props {
  fixtures: PlacedFixture[];
  shapes: Shape[];
  persons: Person[];
  /** Read-only Kameras aus der verlustfrei mitgefuehrten .avplan-cameras-Domaene
   *  (MultiCam-Planner). Nur zur Ansicht, nicht selektierbar. */
  foreignCameras?: { id: string; x: number; y: number; label?: string; pan?: number }[];
  stageElements: StageElement[];
  trusses: Truss[];
  walls: Wall[];
  ceilings: Ceiling[];
  sun: ResolvedSun | null;
  floorPlan: FloorPlan | null;
  layers: Layers;
  snapStep: number;
  activeTool: Tool;
  fixtureToPlace: Fixture | null;
  selectedIds: Set<string>;
  showHeatMap: boolean;
  heatMapScale: number;
  heatMapTarget: number;
  showFocusNotes: boolean;
  planMode: PlanMode;
  onPlaceFixture: (fixture: Fixture, x: number, y: number) => void;
  onMoveFixture: (id: string, x: number, y: number) => void;
  onSelect: (id: string | null, ctrlKey?: boolean) => void;
  onSelectMany: (ids: string[], additive: boolean) => void;
  onMoveShape: (id: string, dx: number, dy: number) => void;
  onAddShape: (shape: Shape) => void;
  onAddPerson: (x: number, y: number) => void;
  onAddStageElement: (x: number, y: number, width?: number, depth?: number) => void;
  onMovePerson: (id: string, x: number, y: number) => void;
  onMoveStageElement: (id: string, x: number, y: number) => void;
  onUpdateStageElement: (id: string, updates: Partial<StageElement>) => void;
  onAddStagePolygon: (points: { x: number; y: number }[]) => void;
  cameras: CameraView[];
  onAddCamera: (x: number, y: number) => void;
  onMoveCamera: (id: string, x: number, y: number) => void;
  onMoveCameraAim: (id: string, aimX: number, aimY: number) => void;
  onAddTruss: (x1: number, y1: number, x2: number, y2: number) => void;
  onMoveTruss: (id: string, dx: number, dy: number) => void;
  onAddWall: (x1: number, y1: number, x2: number, y2: number) => void;
  onMoveWall: (id: string, dx: number, dy: number) => void;
  onUpdateWall: (id: string, updates: Partial<Wall>) => void;
  onCursorLux: (lux: number | null) => void;
  onToolChange: (tool: Tool) => void;
  onDropFixture: (fixture: Fixture, x: number, y: number) => void;
  onMoveAim: (id: string, aimX: number, aimY: number) => void;
  onUpdateFloorPlan: (updates: Partial<FloorPlan>) => void;
  onCalibrateSegment: (x1: number, y1: number, x2: number, y2: number) => void;
  onViewChange?: (pixelsPerMeter: number) => void;
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
  foreignCameras = [],
  fixtures,
  shapes,
  persons,
  stageElements,
  trusses,
  walls,
  ceilings,
  sun,
  floorPlan,
  layers,
  snapStep,
  activeTool,
  fixtureToPlace,
  selectedIds,
  showHeatMap,
  heatMapScale,
  heatMapTarget,
  showFocusNotes,
  planMode,
  onPlaceFixture,
  onMoveFixture,
  onSelect,
  onSelectMany,
  onMoveShape,
  onAddShape,
  onAddPerson,
  onAddStageElement,
  onMovePerson,
  onMoveStageElement,
  onUpdateStageElement,
  onAddStagePolygon,
  cameras,
  onAddCamera,
  onMoveCamera,
  onMoveCameraAim,
  onAddTruss,
  onMoveTruss,
  onAddWall,
  onMoveWall,
  onUpdateWall,
  onCursorLux,
  onToolChange,
  onDropFixture,
  onMoveAim,
  onUpdateFloorPlan,
  onCalibrateSegment,
  onViewChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewTransform>({ offsetX: RULER_SIZE + 60, offsetY: RULER_SIZE + 60, scale: 40 });
  const reportedScaleRef = useRef(0);
  const dragRef = useRef<{
    type: 'pan' | 'move' | 'move-aim' | 'move-person' | 'move-stage' | 'resize-stage' | 'move-truss' | 'move-wall' | 'curve-wall' | 'move-shape' | 'move-camera' | 'move-camera-aim' | 'draw-rect' | 'draw-line' | 'draw-measure' | 'draw-truss' | 'draw-wall' | 'draw-stage' | 'calibrate' | 'move-plan' | 'marquee';
    corner?: 0 | 1 | 2 | 3;
    startScreenX: number;
    startScreenY: number;
    startWorldX: number;
    startWorldY: number;
    targetId?: string;
    origOffsetX?: number;
    origOffsetY?: number;
    planOrigX?: number;
    planOrigY?: number;
    additive?: boolean;
    pendingSelectId?: string;
  } | null>(null);
  const measureEndRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeEndRef = useRef<{ x: number; y: number } | null>(null);
  const calibEndRef = useRef<{ x: number; y: number } | null>(null);
  // Wall path tool: committed vertices of the current chain + the live cursor.
  const wallPathRef = useRef<{ x: number; y: number }[]>([]);
  const wallCursorRef = useRef<{ x: number; y: number } | null>(null);
  // Polygon-stage tool: vertices of the outline being drawn + the live cursor.
  const stagePathRef = useRef<{ x: number; y: number }[]>([]);
  const stageCursorRef = useRef<{ x: number; y: number } | null>(null);
  const heatMapCacheRef = useRef<{ imageData: ImageData | null; key: string }>({ imageData: null, key: '' });
  const animFrameRef = useRef<number>(0);
  const spaceDownRef = useRef(false);
  // Screen pos of the last fixture pick, to detect repeated clicks on the same
  // spot for cycling through overlapping fixtures.
  const lastPickRef = useRef<{ x: number; y: number } | null>(null);

  const screenToWorld = useCallback((sx: number, sy: number): [number, number] => {
    const v = viewRef.current;
    return [(sx - v.offsetX) / v.scale, (sy - v.offsetY) / v.scale];
  }, []);

  // Reflecting surface patches (walls + ceilings) for the cursor lux readout.
  const wallSamples = useMemo(() => precomputeSurfaceSamples(walls, ceilings, fixtures), [walls, ceilings, fixtures]);

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
    // Report the draw scale (backing px per metre) so the plot export can size
    // an accurate scale bar; only on change to avoid churn.
    if (onViewChange && v.scale !== reportedScaleRef.current) {
      reportedScaleRef.current = v.scale;
      onViewChange(v.scale);
    }

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
    if (floorPlan && layers.floorPlan.visible) {
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
    if (layers.stage.visible) for (const se of stageElements) {
      const isSelP = selectedIds.has(se.id);
      // Free polygon stage – drawn directly from its world-space outline.
      if (se.points && se.points.length >= 3) {
        const pts = se.points;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fillStyle = isSelP ? 'rgba(139,69,19,0.40)' : 'rgba(139,69,19,0.22)';
        ctx.fill();
        ctx.strokeStyle = isSelP ? '#ffcc33' : '#8B4513';
        ctx.lineWidth = 2 / v.scale;
        ctx.stroke();
        // vertices when selected
        if (isSelP) { ctx.fillStyle = '#ffcc33'; for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 0.1, 0, Math.PI * 2); ctx.fill(); } }
        const cxp = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cyp = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        ctx.fillStyle = '#ccc';
        ctx.font = `${10 / v.scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${se.label ? se.label + ' · ' : ''}Bühne h=${se.height}m`, cxp, cyp);
        ctx.textAlign = 'start';
        continue;
      }
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

      // Ramp / slope indicator (arrow toward the higher edge)
      if (se.height2 != null && Math.abs(se.height2 - se.height) > 0.01) {
        const up = se.height2 > se.height ? 1 : -1;
        const a = (se.depth / 2) * 0.6;
        ctx.strokeStyle = '#ffb74d';
        ctx.fillStyle = '#ffb74d';
        ctx.lineWidth = 1.5 / v.scale;
        ctx.beginPath();
        ctx.moveTo(0, -up * a); ctx.lineTo(0, up * a);
        ctx.moveTo(-0.18, up * a - up * 0.3); ctx.lineTo(0, up * a); ctx.lineTo(0.18, up * a - up * 0.3);
        ctx.stroke();
        ctx.font = `${8.5 / v.scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`⤴ ${se.height}→${se.height2} m`, 0, -up * a - 4 / v.scale * up - 2 / v.scale);
      }

      // Corner resize handles when selected
      if (isSel) {
        const hs = 7 / v.scale;
        ctx.fillStyle = '#ffcc33';
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1 / v.scale;
        for (const [lx, ly] of [[-se.width / 2, -se.depth / 2], [se.width / 2, -se.depth / 2], [se.width / 2, se.depth / 2], [-se.width / 2, se.depth / 2]]) {
          ctx.fillRect(lx - hs / 2, ly - hs / 2, hs, hs);
          ctx.strokeRect(lx - hs / 2, ly - hs / 2, hs, hs);
        }
      }

      ctx.restore();
    }

    // Ceilings (overhead surface – shown as a dashed outline in plan view)
    if (layers.ceilings.visible) for (const c of ceilings) {
      if (c.points.length < 3) continue;
      const isSel = selectedIds.has(c.id);
      ctx.beginPath();
      ctx.moveTo(c.points[0].x, c.points[0].y);
      for (let i = 1; i < c.points.length; i++) ctx.lineTo(c.points[i].x, c.points[i].y);
      ctx.closePath();
      ctx.fillStyle = isSel ? 'rgba(255,204,51,0.06)' : 'rgba(216,212,200,0.05)';
      ctx.fill();
      ctx.setLineDash([8 / v.scale, 5 / v.scale]);
      ctx.strokeStyle = isSel ? '#ffcc33' : '#7d8aa0';
      ctx.lineWidth = 1.2 / v.scale;
      ctx.stroke();
      ctx.setLineDash([]);
      let lx = 0, ly = 0;
      for (const p of c.points) { lx += p.x; ly += p.y; }
      lx /= c.points.length; ly /= c.points.length;
      ctx.fillStyle = isSel ? '#ffcc33' : '#8895a8';
      ctx.font = `${11 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`⌂ Decke h=${c.height}m · ρ${Math.round(c.reflectance * 100)}%`, lx, ly);
      ctx.textAlign = 'start';
    }

    // Walls (architecture – reflect light back into the room; may be curved)
    if (layers.walls.visible) for (const wall of walls) {
      const isSel = selectedIds.has(wall.id);
      const curved = isCurved(wall);
      ctx.lineCap = 'round';
      ctx.strokeStyle = isSel ? '#ffcc33' : wall.color;
      ctx.lineWidth = 0.22; // ~0.22 m thick (world units)
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      if (curved) ctx.quadraticCurveTo(wall.cx!, wall.cy!, wall.x2, wall.y2);
      else ctx.lineTo(wall.x2, wall.y2);
      ctx.stroke();
      if (isSel) { ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 1.5 / v.scale; ctx.stroke(); }
      ctx.lineCap = 'butt';
      // Window / glass openings drawn as a light glass-tinted strip over the wall.
      const wallWins = normalizedWindows(wall);
      if (wallWins.length) {
        const { segs } = wallSegments(wall);
        ctx.lineCap = 'butt';
        ctx.lineWidth = 0.26;
        for (const win of wallWins) {
          ctx.strokeStyle = isSel ? '#ffe08a' : '#9fd0ff';
          ctx.beginPath();
          const steps = Math.max(2, Math.ceil((win.r1 - win.r0) / 0.3));
          for (let k = 0; k <= steps; k++) {
            const p = pointAtRun(segs, win.r0 + (win.r1 - win.r0) * (k / steps));
            if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        }
      }
      // Curve control handle (drag to bend) while selected
      if (isSel) {
        const hM = wallMidHandle(wall);
        ctx.beginPath();
        ctx.arc(hM.x, hM.y, 0.18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,204,51,0.3)';
        ctx.fill();
        ctx.strokeStyle = '#ffcc33';
        ctx.lineWidth = 1.5 / v.scale;
        ctx.stroke();
      }
      const pts = sampleWall(wall, curved ? 12 : 1);
      let wlen = 0;
      for (let i = 0; i < pts.length - 1; i++) wlen += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      if (wlen > 0.5) {
        const mid = wallMidHandle(wall);
        ctx.fillStyle = isSel ? '#ffcc33' : '#b9c2cf';
        ctx.font = `${9 / v.scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${wall.label ? wall.label + ' · ' : ''}ρ${Math.round(wall.reflectance * 100)}% · ${wall.height}m`, mid.x, mid.y - 0.3);
        ctx.textAlign = 'start';
      }
    }

    // Trusses (rigging / hanging positions)
    if (layers.trusses.visible) for (const t of trusses) {
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
    if (layers.shapes.visible) for (const shape of shapes) {
      const isSelShape = selectedIds.has(shape.id);
      ctx.strokeStyle = isSelShape ? '#ffcc33' : (shape.color || '#5599ff');
      ctx.lineWidth = (isSelShape ? 3 : 2) / v.scale;
      ctx.fillStyle = shape.color ? shape.color + '22' : '#5599ff22';
      if (shape.type === 'rect' && shape.points.length === 2) {
        const [p0, p1] = shape.points;
        const rx = Math.min(p0.x, p1.x), ry = Math.min(p0.y, p1.y);
        const rw = Math.abs(p1.x - p0.x), rh = Math.abs(p1.y - p0.y);
        ctx.fillRect(rx, ry, rw, rh);
        if (isSelShape) ctx.setLineDash([6 / v.scale, 4 / v.scale]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
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
      // Region = bounding box of the rig (fixtures + their aim) ∪ floor plan,
      // padded — so the heat-map always covers the lit area and matches 3D.
      let planLeft = Infinity, planTop = Infinity, planRight = -Infinity, planBottom = -Infinity;
      for (const f of fixtures) {
        planLeft = Math.min(planLeft, f.x, f.aimX); planRight = Math.max(planRight, f.x, f.aimX);
        planTop = Math.min(planTop, f.y, f.aimY); planBottom = Math.max(planBottom, f.y, f.aimY);
      }
      for (const w of walls) {
        planLeft = Math.min(planLeft, w.x1, w.x2); planRight = Math.max(planRight, w.x1, w.x2);
        planTop = Math.min(planTop, w.y1, w.y2); planBottom = Math.max(planBottom, w.y1, w.y2);
      }
      for (const c of ceilings) for (const p of c.points) {
        planLeft = Math.min(planLeft, p.x); planRight = Math.max(planRight, p.x);
        planTop = Math.min(planTop, p.y); planBottom = Math.max(planBottom, p.y);
      }
      const pad = 4;
      planLeft -= pad; planTop -= pad; planRight += pad; planBottom += pad;
      if (floorPlan) {
        planLeft = Math.min(planLeft, floorPlan.offsetX); planTop = Math.min(planTop, floorPlan.offsetY);
        planRight = Math.max(planRight, floorPlan.offsetX + floorPlan.widthMeters);
        planBottom = Math.max(planBottom, floorPlan.offsetY + floorPlan.heightMeters);
      }
      const hmLeft = Math.max(left, planLeft), hmTop = Math.max(top, planTop);
      const hmWidth = Math.min(right, planRight) - hmLeft;
      const hmHeight = Math.min(bottom, planBottom) - hmTop;
      if (hmWidth > 0 && hmHeight > 0) {
        const cacheKey = `${fixtures.map((f) => `${f.id}:${f.fixture.id}:${f.x}:${f.y}:${f.mountingHeight}:${f.dimming}:${f.aimX}:${f.aimY}:${f.bodyRotation}:${f.currentBeamAngle ?? ''}:${f.currentColorTemp ?? ''}:${f.activeAttachmentId ?? ''}:${(f.gelFilterIds ?? []).join(',')}:${f.gelPlacement ?? ''}:${f.barnDoors ? `${f.barnDoors.top},${f.barnDoors.bottom},${f.barnDoors.left},${f.barnDoors.right}` : ''}:${f.hidden ? 'h' : ''}`).join('|')}|${walls.map((w) => `${w.x1}:${w.y1}:${w.x2}:${w.y2}:${w.cx ?? ''}:${w.cy ?? ''}:${w.height}:${w.reflectance}:${(w.windows ?? []).map((win) => `${win.start},${win.width},${win.sill},${win.top},${win.transmittance}`).join(';')}`).join('|')}|${ceilings.map((c) => `${c.points.map((p) => `${p.x},${p.y}`).join(';')}:${c.height}:${c.reflectance}`).join('|')}|${sun ? `${sun.dir.x.toFixed(3)},${sun.dir.y.toFixed(3)},${sun.altitude.toFixed(3)},${Math.round(sun.lux)}` : 'nosun'}|${heatMapScale}|${heatMapTarget}|${hmLeft.toFixed(1)}|${hmTop.toFixed(1)}|${hmWidth.toFixed(1)}|${hmHeight.toFixed(1)}`;
        let imgData = heatMapCacheRef.current.imageData;
        if (heatMapCacheRef.current.key !== cacheKey || !imgData) {
          const { data } = computeHeatMap(fixtures, hmLeft, hmTop, hmWidth, hmHeight, hmResX, hmResY, walls, ceilings, sun);
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
    if (layers.persons.visible) for (const p of persons) {
      const isSel = selectedIds.has(p.id);
      const r = 0.25;
      // Facing arrow (direction the person looks).
      const fa = ((p.facing ?? 270) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(fa) * r, p.y + Math.sin(fa) * r);
      ctx.lineTo(p.x + Math.cos(fa) * (r + 0.28), p.y + Math.sin(fa) * (r + 0.28));
      ctx.strokeStyle = isSel ? '#ffcc33' : '#ff9633';
      ctx.lineWidth = 2.5 / v.scale;
      ctx.stroke();
      ctx.beginPath();
      const tip = { x: p.x + Math.cos(fa) * (r + 0.28), y: p.y + Math.sin(fa) * (r + 0.28) };
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - Math.cos(fa - 0.5) * 0.13, tip.y - Math.sin(fa - 0.5) * 0.13);
      ctx.lineTo(tip.x - Math.cos(fa + 0.5) * 0.13, tip.y - Math.sin(fa + 0.5) * 0.13);
      ctx.closePath(); ctx.fillStyle = isSel ? '#ffcc33' : '#ff9633'; ctx.fill();
      // Body (a ring; a square hint when sitting)
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
      const poseTag = p.pose === 'sitting' ? ' (sitzt)' : '';
      ctx.fillText((p.label || `Person ${p.height}m`) + poseTag, p.x, p.y - r - 6 / v.scale);
      ctx.textAlign = 'start';
    }

    // Read-only foreign cameras (MultiCam-Planner via .avplan) — nur Ansicht.
    for (const cam of foreignCameras) {
      const pan = ((cam.pan ?? 0) * Math.PI) / 180; // 0 = +x
      const r = 0.22;
      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.rotate(pan);
      ctx.beginPath(); // Sichtkegel-Andeutung
      ctx.moveTo(0, 0); ctx.lineTo(0.9, -0.4); ctx.lineTo(0.9, 0.4); ctx.closePath();
      ctx.fillStyle = 'rgba(56,189,248,0.12)'; ctx.fill();
      ctx.beginPath(); // Kamera-Koerper
      ctx.rect(-r, -r * 0.7, r * 1.6, r * 1.4);
      ctx.fillStyle = 'rgba(56,189,248,0.6)'; ctx.fill();
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5 / v.scale; ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#7dd3fc';
      ctx.font = `${10 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(cam.label || 'CAM', cam.x, cam.y - r - 6 / v.scale);
      ctx.textAlign = 'start';
    }

    // Fixtures
    if (layers.fixtures.visible) for (const f of fixtures) {
      const isSel = selectedIds.has(f.id);
      const rad = 0.3;

      // Muted lamp: ghosted marker only, no beam – it visually goes dark but
      // stays selectable so it can be switched back on.
      if (f.hidden) {
        const a = Math.atan2(f.aimY - f.y, f.aimX - f.x);
        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.translate(f.x, f.y);
        ctx.rotate(a);
        drawFixtureSymbol(ctx, f.fixture.category, rad, isSel, v.scale);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(f.x, f.y, rad + 0.14, 0, Math.PI * 2);
        ctx.setLineDash([3 / v.scale, 3 / v.scale]);
        ctx.strokeStyle = isSel ? '#ffcc33' : '#6a7280';
        ctx.lineWidth = 1.5 / v.scale;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = isSel ? '#ffcc33' : '#7a8290';
        ctx.font = `${10 / v.scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${f.fixture.name} (aus)`, f.x, f.y - rad - 6 / v.scale);
        ctx.textAlign = 'start';
        continue;
      }

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

      // Stack badge: when this (selected) fixture overlaps others, show how
      // many sit here and hint that clicking again cycles through them.
      if (isSel) {
        const stack = fixtures.reduce((n, o) => n + (Math.hypot(o.x - f.x, o.y - f.y) < 0.5 ? 1 : 0), 0);
        if (stack > 1) {
          ctx.fillStyle = '#4fc3f7';
          ctx.font = `bold ${10 / v.scale}px sans-serif`;
          ctx.textAlign = 'left';
          ctx.fillText(`⇅${stack}`, f.x + rad + 3 / v.scale, f.y - rad);
        }
      }

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
      // Focus-note overlay (focus chart): the note tagged at the lantern, plus
      // a done tick — shown only when the toggle is on, so the plan stays clean.
      if (showFocusNotes && (f.focusNote || f.focused)) {
        const tag = (f.focused ? '✓ ' : '') + (f.focusNote || '');
        const fs = 8.5 / v.scale;
        ctx.font = `${fs}px sans-serif`;
        const padX = 3 / v.scale, padY = 2 / v.scale, h = fs + padY * 2;
        const w = ctx.measureText(tag).width + padX * 2;
        const bx = f.x - w / 2, by = f.y - rad - 6 / v.scale - 13 / v.scale - h;
        ctx.fillStyle = f.focused ? 'rgba(52,211,153,0.92)' : 'rgba(245,165,36,0.92)';
        ctx.beginPath();
        (ctx.roundRect ? ctx.roundRect(bx, by, w, h, 3 / v.scale) : ctx.rect(bx, by, w, h));
        ctx.fill();
        ctx.fillStyle = '#10151c';
        ctx.textAlign = 'center';
        ctx.fillText(tag, f.x, by + h - padY - fs * 0.12);
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

    // Placeable cameras (viewpoints) with their FOV frustum
    for (const cam of cameras) {
      const isSel = selectedIds.has(cam.id);
      const ang = Math.atan2(cam.aimY - cam.y, cam.aimX - cam.x);
      const hFov = 2 * Math.atan(Math.tan((cam.fov / 2) * (Math.PI / 180)) * (16 / 9));
      const throwLen = Math.max(2, Math.hypot(cam.aimX - cam.x, cam.aimY - cam.y));
      const a1 = ang - hFov / 2, a2 = ang + hFov / 2;
      ctx.beginPath();
      ctx.moveTo(cam.x, cam.y);
      ctx.lineTo(cam.x + throwLen * Math.cos(a1), cam.y + throwLen * Math.sin(a1));
      ctx.lineTo(cam.x + throwLen * Math.cos(a2), cam.y + throwLen * Math.sin(a2));
      ctx.closePath();
      ctx.fillStyle = isSel ? 'rgba(38,198,218,0.18)' : 'rgba(38,198,218,0.09)';
      ctx.fill();
      ctx.strokeStyle = isSel ? '#26c6da' : 'rgba(38,198,218,0.6)';
      ctx.lineWidth = 1 / v.scale;
      ctx.stroke();
      // body (triangle pointing at the aim)
      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.rotate(ang);
      ctx.fillStyle = isSel ? '#ffcc33' : '#26c6da';
      ctx.beginPath(); ctx.moveTo(0.28, 0); ctx.lineTo(-0.18, 0.18); ctx.lineTo(-0.18, -0.18); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = isSel ? '#ffcc33' : '#9fe7f0';
      ctx.font = `${10 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`🎥 ${cam.label || 'Kamera'} · ${cam.fov}°`, cam.x, cam.y - 0.45);
      ctx.textAlign = 'start';
      if (isSel) {
        ctx.setLineDash([4 / v.scale, 4 / v.scale]);
        ctx.beginPath(); ctx.moveTo(cam.x, cam.y); ctx.lineTo(cam.aimX, cam.aimY); ctx.strokeStyle = '#26c6da'; ctx.lineWidth = 1 / v.scale; ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(cam.aimX, cam.aimY, 0.2, 0, Math.PI * 2); ctx.stroke();
        const cs = 0.13;
        ctx.beginPath(); ctx.moveTo(cam.aimX - cs, cam.aimY); ctx.lineTo(cam.aimX + cs, cam.aimY); ctx.moveTo(cam.aimX, cam.aimY - cs); ctx.lineTo(cam.aimX, cam.aimY + cs); ctx.stroke();
      }
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

    // Active truss being drawn (drag)
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

    // Stage/podest being sized (drag)
    if (dragRef.current?.type === 'draw-stage' && measureEndRef.current) {
      const d = dragRef.current; const end = measureEndRef.current;
      const x0 = Math.min(d.startWorldX, end.x), y0 = Math.min(d.startWorldY, end.y);
      const w = Math.abs(end.x - d.startWorldX), h = Math.abs(end.y - d.startWorldY);
      ctx.fillStyle = 'rgba(139,69,19,0.25)';
      ctx.strokeStyle = '#ffcc33';
      ctx.lineWidth = 1.5 / v.scale;
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeRect(x0, y0, w, h);
      ctx.fillStyle = '#ffcc33';
      ctx.font = `bold ${11 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${w.toFixed(1)} × ${h.toFixed(1)} m`, x0 + w / 2, y0 + h / 2);
      ctx.textAlign = 'start';
    }

    // Polygon-stage tool: outline so far + rubber-band to the cursor.
    if (activeTool === 'stagepoly' && stagePathRef.current.length > 0) {
      const path = stagePathRef.current;
      const cur = stageCursorRef.current ?? path[path.length - 1];
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.lineTo(cur.x, cur.y);
      ctx.strokeStyle = '#ffcc33';
      ctx.lineWidth = 1.5 / v.scale;
      ctx.fillStyle = 'rgba(139,69,19,0.18)';
      if (path.length >= 2) { ctx.closePath(); ctx.fill(); }
      ctx.stroke();
      for (const p of path) { ctx.beginPath(); ctx.arc(p.x, p.y, 0.1, 0, Math.PI * 2); ctx.fillStyle = '#4fc3f7'; ctx.fill(); }
      if (path.length >= 3) { ctx.beginPath(); ctx.arc(path[0].x, path[0].y, 0.2, 0, Math.PI * 2); ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1.5 / v.scale; ctx.stroke(); }
    }

    // Wall path tool: rubber-band from the last vertex + length & angle readout.
    if (activeTool === 'wall' && wallPathRef.current.length > 0 && wallCursorRef.current) {
      const path = wallPathRef.current;
      const cur = wallCursorRef.current;
      const last = path[path.length - 1];
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#c9c4b8';
      ctx.lineWidth = 0.22;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(cur.x, cur.y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
      // vertices placed so far
      for (const p of path) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 0.1, 0, Math.PI * 2);
        ctx.fillStyle = '#4fc3f7'; ctx.fill();
      }
      // start ring (click to close the loop)
      if (path.length >= 2) {
        ctx.beginPath(); ctx.arc(path[0].x, path[0].y, 0.2, 0, Math.PI * 2);
        ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1.5 / v.scale; ctx.stroke();
      }
      const len = Math.hypot(cur.x - last.x, cur.y - last.y);
      let ang = (Math.atan2(cur.y - last.y, cur.x - last.x) * 180) / Math.PI;
      if (ang < 0) ang += 360;
      const mx = (last.x + cur.x) / 2, my = (last.y + cur.y) / 2;
      ctx.fillStyle = '#ffcc33';
      ctx.font = `bold ${12 / v.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${len.toFixed(2)} m · ${ang.toFixed(0)}°`, mx, my - 10 / v.scale);
      ctx.textAlign = 'start';
    }

    // Marquee / box selection rectangle
    if (dragRef.current?.type === 'marquee' && marqueeEndRef.current) {
      const d = dragRef.current; const end = marqueeEndRef.current;
      const rx = Math.min(d.startWorldX, end.x), ry = Math.min(d.startWorldY, end.y);
      const rw = Math.abs(end.x - d.startWorldX), rh = Math.abs(end.y - d.startWorldY);
      ctx.fillStyle = 'rgba(79,195,247,0.12)';
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 1 / v.scale;
      ctx.setLineDash([4 / v.scale, 3 / v.scale]);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
    }

    ctx.restore(); ctx.restore();
    drawRulers(ctx, w, h);

    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText(`1m = ${v.scale.toFixed(0)}px | Zoom: ${((v.scale / 40) * 100).toFixed(0)}%`, RULER_SIZE + 10, h - 10);
  }, [fixtures, shapes, persons, stageElements, trusses, walls, ceilings, floorPlan, layers, cameras, selectedIds, showHeatMap, heatMapScale, heatMapTarget, showFocusNotes, planMode, activeTool, screenToWorld, drawRulers, onViewChange]);

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
      if (e.code === 'Escape') {
        // First Escape ends an in-progress wall / stage chain (keeps the tool).
        if (wallPathRef.current.length > 0) { wallPathRef.current = []; wallCursorRef.current = null; return; }
        if (stagePathRef.current.length > 0) { stagePathRef.current = []; stageCursorRef.current = null; return; }
        onSelect(null); onToolChange('select');
      }
      if (e.code === 'Enter') {
        if (wallPathRef.current.length > 0) { wallPathRef.current = []; wallCursorRef.current = null; }
        if (stagePathRef.current.length >= 3) { onAddStagePolygon(stagePathRef.current); stagePathRef.current = []; stageCursorRef.current = null; }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDownRef.current = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [selectedIds, onSelect, onToolChange, onAddStagePolygon]);

  // Leaving the wall / stage tool ends any chain in progress.
  useEffect(() => {
    if (activeTool !== 'wall') { wallPathRef.current = []; wallCursorRef.current = null; }
    if (activeTool !== 'stagepoly') { stagePathRef.current = []; stageCursorRef.current = null; }
  }, [activeTool]);

  // Double-click finishes the current chain (stage polygon needs ≥3 points).
  const handleDoubleClick = () => {
    wallPathRef.current = []; wallCursorRef.current = null;
    if (stagePathRef.current.length >= 3) onAddStagePolygon(stagePathRef.current);
    stagePathRef.current = []; stageCursorRef.current = null;
  };

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

  // Precise point for the wall path tool. Priority:
  //  1. exact snap to a nearby existing wall endpoint (so walls connect cleanly)
  //  2. Shift → constrain to 15° from the previous vertex
  //  3. grid snap (respects the snap step)
  const snapWallPoint = (wx: number, wy: number, shift: boolean): { x: number; y: number } => {
    let best: { x: number; y: number } | null = null;
    let bestD = 0.4;
    for (const w of walls) {
      for (const e of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) {
        const d = Math.hypot(wx - e.x, wy - e.y);
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    if (best) return best;
    const path = wallPathRef.current;
    if (shift && path.length > 0) {
      const prev = path[path.length - 1];
      const len = Math.hypot(wx - prev.x, wy - prev.y);
      const step = Math.PI / 12; // 15°
      const a = Math.round(Math.atan2(wy - prev.y, wx - prev.x) / step) * step;
      return { x: Math.round((prev.x + Math.cos(a) * len) * 10) / 10, y: Math.round((prev.y + Math.sin(a) * len) * 10) / 10 };
    }
    return { x: snap(wx), y: snap(wy) };
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
    if (activeTool === 'camera') { onAddCamera(snap(wx), snap(wy)); return; }
    if (activeTool === 'stage') {
      // Drag to size a podest/stage frame (a tiny click falls back to 1×1).
      measureEndRef.current = { x: snap(wx), y: snap(wy) };
      dragRef.current = { type: 'draw-stage', startScreenX: sx, startScreenY: sy, startWorldX: snap(wx), startWorldY: snap(wy) };
      return;
    }
    if (activeTool === 'stagepoly') {
      // Click to add outline vertices; click the start point (≥3) to close.
      const p = { x: snap(wx), y: snap(wy) };
      const path = stagePathRef.current;
      if (path.length >= 3 && Math.hypot(p.x - path[0].x, p.y - path[0].y) < 0.3) {
        onAddStagePolygon(path);
        stagePathRef.current = [];
        stageCursorRef.current = null;
      } else {
        stagePathRef.current = [...path, p];
        stageCursorRef.current = p;
      }
      draw();
      return;
    }
    if (activeTool === 'truss') {
      const s = { x: snap(wx), y: snap(wy) };
      measureEndRef.current = s;
      dragRef.current = { type: 'draw-truss', startScreenX: sx, startScreenY: sy, startWorldX: s.x, startWorldY: s.y };
      return;
    }
    if (activeTool === 'wall') {
      // Click-to-add path: each click extends the chain with a new wall segment;
      // click the start point (blue ring) to close the loop, Esc / double-click ends it.
      const p = snapWallPoint(wx, wy, e.shiftKey);
      const path = wallPathRef.current;
      if (path.length === 0) {
        wallPathRef.current = [p];
      } else {
        const prev = path[path.length - 1];
        const closing = path.length >= 2 && Math.hypot(p.x - path[0].x, p.y - path[0].y) < 0.3;
        const end = closing ? path[0] : p;
        if (Math.hypot(end.x - prev.x, end.y - prev.y) > 0.05) onAddWall(prev.x, prev.y, end.x, end.y);
        wallPathRef.current = closing ? [] : [...path, p];
      }
      wallCursorRef.current = p;
      draw();
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
      // A layer that is hidden or locked is not pickable.
      const pickable = (k: keyof Layers) => layers[k].visible && !layers[k].locked;
      // Check aim-point handles first (only for selected fixture)
      const aimHitR = 0.35;
      if (pickable('fixtures')) for (const f of fixtures) {
        // Only grab the aim handle when it is actually offset from the body
        // (otherwise an invisible handle on a straight-down fixture would
        // swallow clicks meant to move/drag the fixture itself).
        const aimOffset = Math.hypot(f.aimX - f.x, f.aimY - f.y);
        if (selectedIds.has(f.id) && aimOffset > 0.5 && Math.sqrt((wx - f.aimX) ** 2 + (wy - f.aimY) ** 2) < aimHitR) {
          dragRef.current = { type: 'move-aim', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: f.id };
          return;
        }
      }
      // Camera aim handle (selected) → drag the look-at point
      for (const cam of cameras) {
        if (selectedIds.has(cam.id) && Math.hypot(wx - cam.aimX, wy - cam.aimY) < 0.35) {
          dragRef.current = { type: 'move-camera-aim', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: cam.id };
          return;
        }
      }
      // Camera body → select / move
      for (const cam of cameras) {
        if (Math.hypot(wx - cam.x, wy - cam.y) < 0.4) {
          onSelect(cam.id, ctrl);
          dragRef.current = { type: 'move-camera', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: cam.id };
          return;
        }
      }

      const cr = 0.5;
      // All fixtures under the cursor, nearest first — so overlapping lamps
      // can be told apart and cycled through.
      const candidates = (pickable('fixtures') ? fixtures : [])
        .map((f) => ({ f, d: Math.hypot(wx - f.x, wy - f.y) }))
        .filter((c) => c.d < cr)
        .sort((a, b) => a.d - b.d)
        .map((c) => c.f);

      if (candidates.length > 0) {
        const samePlace = !!lastPickRef.current
          && Math.hypot(sx - lastPickRef.current.x, sy - lastPickRef.current.y) < 8;
        lastPickRef.current = { x: sx, y: sy };

        // Repeated click on the same spot with a single fixture selected →
        // step to the next lamp in the stack (so you can reach the one beneath).
        const cycling = samePlace && candidates.length > 1 && selectedIds.size === 1
          && candidates.some((f) => selectedIds.has(f.id));
        if (cycling) {
          const curIdx = candidates.findIndex((f) => selectedIds.has(f.id));
          const next = candidates[(curIdx + 1) % candidates.length];
          onSelect(next.id, false);
          dragRef.current = { type: 'move', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: next.id };
          return;
        }

        const target = candidates[0]; // nearest to the cursor
        const already = selectedIds.has(target.id);
        if (ctrl) {
          onSelect(target.id, true);     // toggle in/out of the selection
          if (already) return;           // toggled out → nothing to drag
        } else if (!already) {
          onSelect(target.id, false);    // fresh single selection
        }
        // If already part of a multi-selection, keep the whole selection so it
        // can be dragged together; collapse to this one on a click w/o movement.
        dragRef.current = { type: 'move', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy,
          targetId: target.id, pendingSelectId: already && !ctrl ? target.id : undefined };
        return;
      }
      if (pickable('persons')) for (const p of persons) {
        if (Math.sqrt((wx - p.x) ** 2 + (wy - p.y) ** 2) < 0.4) {
          onSelect(p.id, ctrl);
          dragRef.current = { type: 'move-person', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: p.id };
          return;
        }
      }
      // Corner handles of the selected stage → resize the frame (rect only)
      if (pickable('stage')) for (const se of stageElements) {
        if (!selectedIds.has(se.id) || se.points) continue;
        const cx = se.x + se.width / 2, cy = se.y + se.depth / 2;
        const th = (se.rotation * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
        const local = [[-se.width / 2, -se.depth / 2], [se.width / 2, -se.depth / 2], [se.width / 2, se.depth / 2], [-se.width / 2, se.depth / 2]];
        for (let i = 0; i < 4; i++) {
          const hx = cx + local[i][0] * c - local[i][1] * s, hy = cy + local[i][0] * s + local[i][1] * c;
          if (Math.hypot(wx - hx, wy - hy) < 0.3) {
            dragRef.current = { type: 'resize-stage', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: se.id, corner: i as 0 | 1 | 2 | 3 };
            return;
          }
        }
      }
      // Polygon stages use point-in-polygon; rect stages an inside-rotated-rect test.
      if (pickable('stage')) for (const se of stageElements) {
        let hit: boolean;
        if (se.points && se.points.length >= 3) {
          hit = pointInPolygon(wx, wy, se.points);
        } else {
          const cx = se.x + se.width / 2, cy = se.y + se.depth / 2;
          const th = (se.rotation * Math.PI) / 180;
          const lx = (wx - cx) * Math.cos(th) + (wy - cy) * Math.sin(th);
          const ly = -(wx - cx) * Math.sin(th) + (wy - cy) * Math.cos(th);
          hit = Math.abs(lx) <= se.width / 2 && Math.abs(ly) <= se.depth / 2;
        }
        if (hit) {
          onSelect(se.id, ctrl);
          dragRef.current = { type: 'move-stage', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: se.id };
          return;
        }
      }
      if (pickable('trusses')) for (const t of trusses) {
        if (distToSegment(wx, wy, t.x1, t.y1, t.x2, t.y2) < 0.4) {
          onSelect(t.id, ctrl);
          dragRef.current = { type: 'move-truss', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: t.id };
          return;
        }
      }
      // Curve handle of the selected wall → bend it
      if (pickable('walls')) for (const wall of walls) {
        if (!selectedIds.has(wall.id)) continue;
        const hM = wallMidHandle(wall);
        if (Math.hypot(wx - hM.x, wy - hM.y) < 0.3) {
          dragRef.current = { type: 'curve-wall', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: wall.id };
          return;
        }
      }
      if (pickable('walls')) for (const wall of walls) {
        if (distToWall(wall, wx, wy) < 0.3) {
          onSelect(wall.id, ctrl);
          dragRef.current = { type: 'move-wall', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: wall.id };
          return;
        }
      }
      // Ceiling outline → select (for editing height / reflectance / delete)
      if (pickable('ceilings')) for (const c of ceilings) {
        if (c.points.length < 3) continue;
        let near = false;
        for (let i = 0; i < c.points.length; i++) {
          const a = c.points[i], b = c.points[(i + 1) % c.points.length];
          if (distToSegment(wx, wy, a.x, a.y, b.x, b.y) < 0.3) { near = true; break; }
        }
        if (near) { onSelect(c.id, ctrl); return; }
      }
      // Lines & measure lines: clicking near the segment selects it (so it
      // can be deleted from the property panel).
      if (pickable('shapes')) for (const shape of shapes) {
        if ((shape.type === 'line' || shape.type === 'measure') && shape.points.length === 2
          && distToSegment(wx, wy, shape.points[0].x, shape.points[0].y, shape.points[1].x, shape.points[1].y) < 0.3) {
          onSelect(shape.id, ctrl);
          dragRef.current = { type: 'move-shape', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: shape.id };
          return;
        }
      }
      // Rectangle shapes: clicking the outline selects the area (interior is
      // left free for marquee selection / picking fixtures inside it).
      if (pickable('shapes')) for (const shape of shapes) {
        if (shape.type !== 'rect' || shape.points.length !== 2) continue;
        const [p0, p1] = shape.points;
        const rx0 = Math.min(p0.x, p1.x), rx1 = Math.max(p0.x, p1.x);
        const ry0 = Math.min(p0.y, p1.y), ry1 = Math.max(p0.y, p1.y);
        const edge = Math.min(
          distToSegment(wx, wy, rx0, ry0, rx1, ry0),
          distToSegment(wx, wy, rx1, ry0, rx1, ry1),
          distToSegment(wx, wy, rx1, ry1, rx0, ry1),
          distToSegment(wx, wy, rx0, ry1, rx0, ry0),
        );
        if (edge < 0.3) {
          onSelect(shape.id, ctrl);
          dragRef.current = { type: 'move-shape', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, targetId: shape.id };
          return;
        }
      }
      // Empty space → start a box / marquee selection
      marqueeEndRef.current = { x: wx, y: wy };
      dragRef.current = { type: 'marquee', startScreenX: sx, startScreenY: sy, startWorldX: wx, startWorldY: wy, additive: ctrl };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const [sx, sy] = getCanvasPos(e);
    const [wx, wy] = screenToWorld(sx, sy);
    if (fixtures.length > 0) onCursorLux(totalLux(fixtures, wx, wy, wallSamples));
    else onCursorLux(null);

    // Live rubber-band for the wall path tool (no drag involved).
    if (activeTool === 'wall' && wallPathRef.current.length > 0) {
      wallCursorRef.current = snapWallPoint(wx, wy, e.shiftKey);
      draw();
    }
    if (activeTool === 'stagepoly' && stagePathRef.current.length > 0) {
      stageCursorRef.current = { x: snap(wx), y: snap(wy) };
      draw();
    }

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
    if (d.type === 'resize-stage' && d.targetId && d.corner != null) {
      const se = stageElements.find((s) => s.id === d.targetId);
      if (se) {
        // Keep the opposite corner fixed; drag this corner to the cursor.
        const cx = se.x + se.width / 2, cy = se.y + se.depth / 2;
        const th = (se.rotation * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
        const local = [[-se.width / 2, -se.depth / 2], [se.width / 2, -se.depth / 2], [se.width / 2, se.depth / 2], [-se.width / 2, se.depth / 2]];
        const opp = local[(d.corner + 2) % 4];
        const fixed = { x: cx + opp[0] * c - opp[1] * s, y: cy + opp[0] * s + opp[1] * c };
        const dragPt = { x: snap(wx), y: snap(wy) };
        // vector fixed→drag in the stage's un-rotated frame
        const dx = dragPt.x - fixed.x, dy = dragPt.y - fixed.y;
        const ux = dx * c + dy * s, uy = -dx * s + dy * c;
        const nw = Math.max(0.2, Math.abs(ux)), nd = Math.max(0.2, Math.abs(uy));
        const ncx = (fixed.x + dragPt.x) / 2, ncy = (fixed.y + dragPt.y) / 2;
        const r = (v: number) => Math.round(v * 10) / 10;
        onUpdateStageElement(d.targetId, { x: r(ncx - nw / 2), y: r(ncy - nd / 2), width: r(nw), depth: r(nd) });
      }
      return;
    }
    if (d.type === 'draw-stage') { measureEndRef.current = { x: snap(wx), y: snap(wy) }; return; }
    if (d.type === 'move-truss' && d.targetId) {
      onMoveTruss(d.targetId, wx - d.startWorldX, wy - d.startWorldY);
      d.startWorldX = wx; d.startWorldY = wy;
      return;
    }
    if (d.type === 'move-camera' && d.targetId) {
      const cam = cameras.find((c) => c.id === d.targetId);
      if (cam) { onMoveCamera(d.targetId, snap(cam.x + wx - d.startWorldX), snap(cam.y + wy - d.startWorldY)); d.startWorldX = wx; d.startWorldY = wy; }
      return;
    }
    if (d.type === 'move-camera-aim' && d.targetId) {
      onMoveCameraAim(d.targetId, Math.round(wx * 10) / 10, Math.round(wy * 10) / 10);
      return;
    }
    if (d.type === 'move-wall' && d.targetId) {
      onMoveWall(d.targetId, wx - d.startWorldX, wy - d.startWorldY);
      d.startWorldX = wx; d.startWorldY = wy;
      return;
    }
    if (d.type === 'curve-wall' && d.targetId) {
      const wl = walls.find((w) => w.id === d.targetId);
      if (wl) {
        const c = curveControlForMid(wl.x1, wl.y1, wl.x2, wl.y2, wx, wy);
        onUpdateWall(d.targetId, { cx: Math.round(c.x * 100) / 100, cy: Math.round(c.y * 100) / 100 });
      }
      return;
    }
    if (d.type === 'move-shape' && d.targetId) {
      onMoveShape(d.targetId, wx - d.startWorldX, wy - d.startWorldY);
      d.startWorldX = wx; d.startWorldY = wy;
      return;
    }
    if (d.type === 'draw-measure') measureEndRef.current = { x: wx, y: wy };
    if (d.type === 'draw-truss') { measureEndRef.current = { x: snap(wx), y: snap(wy) }; return; }
    if (d.type === 'marquee') { marqueeEndRef.current = { x: wx, y: wy }; return; }
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

      // Click (no drag) on an already-selected fixture → collapse to just it.
      if (d.type === 'move' && d.pendingSelectId && Math.hypot(ewx - d.startWorldX, ewy - d.startWorldY) < 0.1) {
        onSelect(d.pendingSelectId, false);
      }

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
      if (d.type === 'draw-stage') {
        const x0 = Math.min(d.startWorldX, snap(ewx)), y0 = Math.min(d.startWorldY, snap(ewy));
        const w = Math.abs(snap(ewx) - d.startWorldX), h = Math.abs(snap(ewy) - d.startWorldY);
        // A real drag sizes the frame; a tiny click drops a default 1×1 podest.
        if (w > 0.3 && h > 0.3) onAddStageElement(x0, y0, w, h);
        else onAddStageElement(d.startWorldX, d.startWorldY);
        measureEndRef.current = null;
      }
      if (d.type === 'marquee') {
        const x0 = Math.min(d.startWorldX, ewx), x1 = Math.max(d.startWorldX, ewx);
        const y0 = Math.min(d.startWorldY, ewy), y1 = Math.max(d.startWorldY, ewy);
        if (Math.hypot(ewx - d.startWorldX, ewy - d.startWorldY) < 0.15) {
          // No real drag → treat as a click on empty space
          if (!d.additive) onSelect(null);
        } else {
          const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
          const ok = (k: keyof Layers) => layers[k].visible && !layers[k].locked;
          const ids: string[] = [];
          if (ok('fixtures')) for (const f of fixtures) if (inside(f.x, f.y)) ids.push(f.id);
          if (ok('persons')) for (const p of persons) if (inside(p.x, p.y)) ids.push(p.id);
          if (ok('stage')) for (const s of stageElements) if (inside(s.x + s.width / 2, s.y + s.depth / 2)) ids.push(s.id);
          if (ok('trusses')) for (const t of trusses) if (inside((t.x1 + t.x2) / 2, (t.y1 + t.y2) / 2)) ids.push(t.id);
          onSelectMany(ids, d.additive ?? false);
        }
        marqueeEndRef.current = null;
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
    : planMode === 'calibrate' || fixtureToPlace || ['person', 'stage', 'rect', 'line', 'measure', 'truss', 'wall'].includes(activeTool) ? 'crosshair'
    : 'default';

  return (
    <div ref={containerRef} className="plan-canvas-container">
      <canvas ref={canvasRef} className="plan-canvas"
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel} onDragOver={handleDragOver} onDrop={handleDrop}
        onContextMenu={(e) => e.preventDefault()} style={{ cursor }} />
    </div>
  );
};

export default PlanCanvas;
