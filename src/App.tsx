import React, { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import type { PlacedFixture, Shape, Tool, Fixture, FloorPlan, ViewMode, Person, StageElement, ProjectMeta, ProjectData, FixtureGroup, Truss, Wall, Ceiling, Scene, SceneFixtureState, Layers, LayerKey, CameraView, FloorMaterial, SunSettings } from './types';
import { DEFAULT_FLOOR } from './core/surfaceTextures';
import { convexHull } from './core/geometry';
import { resolveSun, defaultSunSettings } from './core/sun';
import TopBar from './components/TopBar';
import ToolRail from './components/ToolRail';
import Dock from './components/Dock';
import StatusBar from './components/StatusBar';
import CanvasActions from './components/CanvasActions';
import PlanCanvas from './components/PlanCanvas';
import PropertyPanel from './components/PropertyPanel';
import ThreePointDialog from './components/ThreePointDialog';
import ProjectDialog, { saveProjectToStorage, deleteProjectFromStorage } from './components/ProjectDialog';
import VersionDialog from './components/VersionDialog';
import ChangesDialog from './components/ChangesDialog';
import { summarizeChange } from './core/diff';
import { saveVersion } from './utils/versionStore';
import FloorPlanPanel from './components/FloorPlanPanel';
import ScaleDialog from './components/ScaleDialog';
import ScheduleDialog from './components/ScheduleDialog';
import { autoPatch, findPatchConflicts } from './core/patch';
import { generate3PointLighting, generateAreaLighting } from './core/autoLighting';
import type { ThreePointConfig, AreaLightConfig, LightArea } from './core/autoLighting';
import AreaLightDialog from './components/AreaLightDialog';
import type { Scene3DHandle } from './components/Scene3D';
import { loadFloorPlanFile, renderPdfPage } from './utils/floorPlanLoader';
import { jpegToPdfBlob, dataUrlToBytes } from './utils/pdfExport';
import { composePlot } from './utils/plotExport';
import AboutDialog from './components/AboutDialog';
import { Icon } from './components/Icon';
import InventoryDialog from './inventory/InventoryDialog';
import { drawHeatMapLegend } from './utils/heatmapLegend';
import { useHost } from './integration/hostContext';
import { toVenueExchange, parseVenueExchange, fromVenueExchange } from './core/venueExchange';
import { makeAvPlan, parseAvPlan, type AvPlan } from './core/avplan';
import { foreignCamerasFrom, type ForeignCamera } from './core/foreignView';
import { APP_VERSION } from './version';
import { useUiStore } from './store/uiStore';
import { useProjectStore } from './store/projectStore';
import type * as pdfjsLib from 'pdfjs-dist';
import './App.css';

export type PlanMode = 'none' | 'calibrate' | 'move';

const Scene3D = lazy(() => import('./components/Scene3D'));

let nextId = 1;
function uid(prefix: string) { return `${prefix}-${Date.now()}-${nextId++}`; }

const DEFAULT_LAYERS: Layers = {
  fixtures: { visible: true, locked: false },
  persons: { visible: true, locked: false },
  trusses: { visible: true, locked: false },
  stage: { visible: true, locked: false },
  shapes: { visible: true, locked: false },
  ceilings: { visible: true, locked: false },
  walls: { visible: true, locked: false },
  floorPlan: { visible: true, locked: false },
};

// The adjustable "look" of a fixture captured into / restored from a scene.
function captureLook(f: PlacedFixture): SceneFixtureState {
  return {
    dimming: f.dimming,
    hidden: f.hidden,
    currentColorTemp: f.currentColorTemp,
    currentBeamAngle: f.currentBeamAngle,
    gelFilterIds: f.gelFilterIds,
    gelPlacement: f.gelPlacement,
    barnDoors: f.barnDoors,
  };
}

// Make a floor plan persistable: drop the live <img> and re-encode the bitmap
// as a size-capped JPEG so the calibration survives a save without blowing the
// localStorage quota. The scale/position fields are tiny and kept verbatim.
function serializeFloorPlan(fp: FloorPlan): Omit<FloorPlan, 'image'> {
  const MAX_EDGE = 1600;
  const scale = Math.min(1, MAX_EDGE / Math.max(fp.naturalWidth, fp.naturalHeight));
  const w = Math.max(1, Math.round(fp.naturalWidth * scale));
  const h = Math.max(1, Math.round(fp.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(fp.image, 0, 0, w, h);
  const { image: _omit, ...rest } = fp;
  return {
    ...rest,
    src: canvas.toDataURL('image/jpeg', 0.72),
    naturalWidth: w,
    naturalHeight: h,
    pageCount: undefined, // PDF source isn't persisted → no page switching after reload
  };
}

const App: React.FC = () => {
  const [fixtures, setFixtures] = useState<PlacedFixture[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [foreignCameras, setForeignCameras] = useState<ForeignCamera[]>([]);
  const [stageElements, setStageElements] = useState<StageElement[]>([]);
  const [customFixtures, setCustomFixtures] = useState<Fixture[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fixtureToPlace, setFixtureToPlace] = useState<Fixture | null>(null);
  // ── View / display settings live in the zustand uiStore ──
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const showHeatMap = useUiStore((s) => s.showHeatMap);
  const toggleHeatMap = useUiStore((s) => s.toggleHeatMap);
  const heatMapScale = useUiStore((s) => s.heatMapScale);
  const setHeatMapScale = useUiStore((s) => s.setHeatMapScale);
  const heatMapTarget = useUiStore((s) => s.heatMapTarget);
  const setHeatMapTarget = useUiStore((s) => s.setHeatMapTarget);
  const photoMode = useUiStore((s) => s.photoMode);
  const togglePhotoMode = useUiStore((s) => s.togglePhotoMode);
  const exposure = useUiStore((s) => s.exposure);
  const setExposure = useUiStore((s) => s.setExposure);
  const haze = useUiStore((s) => s.haze);
  const setHaze = useUiStore((s) => s.setHaze);
  const showBeams = useUiStore((s) => s.showBeams);
  const toggleBeams = useUiStore((s) => s.toggleBeams);
  const ambience = useUiStore((s) => s.ambience);
  const setAmbience = useUiStore((s) => s.setAmbience);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [cameras, setCameras] = useState<CameraView[]>([]);
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [cursorLux, setCursorLux] = useState<number | null>(null);
  const [showThreePointDialog, setShowThreePointDialog] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<'save' | 'load' | null>(null);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | undefined>(undefined);
  const [projectId, setProjectId] = useState<string>('proj-' + Date.now());
  const [fixtureGroups, setFixtureGroups] = useState<FixtureGroup[]>([]);
  const [trusses, setTrusses] = useState<Truss[]>([]);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [ceilings, setCeilings] = useState<Ceiling[]>([]);
  const [floor, setFloor] = useState<FloorMaterial>(DEFAULT_FLOOR);
  const [sun, setSun] = useState<SunSettings>(defaultSunSettings);
  const resolvedSun = useMemo(() => resolveSun(sun), [sun]);
  const [planMode, setPlanMode] = useState<PlanMode>('none');
  const [pendingCalibration, setPendingCalibration] = useState<{ meters: number; pivotX: number; pivotY: number } | null>(null);
  const snapStep = useUiStore((s) => s.snapStep);
  const toggleSnap = useUiStore((s) => s.toggleSnap);
  const showFocusNotes = useUiStore((s) => s.showFocusNotes);
  const toggleFocusNotes = useUiStore((s) => s.toggleFocusNotes);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [areaLightOpen, setAreaLightOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  // Look present just before a scene was switched on, so it can be switched off.
  const preSceneRef = useRef<Record<string, SceneFixtureState> | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const clipboardRef = useRef<PlacedFixture[]>([]);
  const scene3DRef = useRef<Scene3DHandle>(null);
  const exportCounterRef = useRef(1);
  const defaultMountingHeight = 6;
  const host = useHost(); // platform seam: files / export / AI

  // ── Undo / Redo ──
  interface Snapshot { fixtures: PlacedFixture[]; persons: Person[]; stageElements: StageElement[]; shapes: Shape[]; fixtureGroups: FixtureGroup[]; trusses: Truss[]; walls: Wall[]; ceilings: Ceiling[] }
  const historyRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const lastPushRef = useRef(0);
  const stateRef = useRef<Snapshot>({ fixtures, persons, stageElements, shapes, fixtureGroups, trusses, walls, ceilings });
  stateRef.current = { fixtures, persons, stageElements, shapes, fixtureGroups, trusses, walls, ceilings };

  const pushHistory = useCallback(() => {
    if (historyRef.current.length >= 50) historyRef.current.shift();
    historyRef.current.push({ ...stateRef.current });
    futureRef.current = [];
    lastPushRef.current = Date.now();
  }, []);

  const pushHistoryThrottled = useCallback(() => {
    if (Date.now() - lastPushRef.current > 400) pushHistory();
  }, [pushHistory]);

  const restoreSnapshot = useCallback((snap: Snapshot) => {
    setFixtures(snap.fixtures);
    setPersons(snap.persons);
    setStageElements(snap.stageElements);
    setShapes(snap.shapes);
    setFixtureGroups(snap.fixtureGroups);
    setTrusses(snap.trusses);
    setWalls(snap.walls);
    setCeilings(snap.ceilings);
  }, []);

  // Move `count` steps in one direction (jump-to in the history timeline). The
  // intermediate states are moved onto the opposite stack so redo/undo stays
  // consistent. count = 1 is a normal single undo/redo.
  const logPrefixRef = useRef<string | null>(null);
  const restoreMany = useCallback((dir: 'undo' | 'redo', count: number) => {
    const from = dir === 'undo' ? historyRef.current : futureRef.current;
    const to = dir === 'undo' ? futureRef.current : historyRef.current;
    const n = Math.min(count, from.length);
    if (n <= 0) return;
    to.push({ ...stateRef.current });
    for (let i = 0; i < n - 1; i++) to.push(from.pop()!);
    logPrefixRef.current = dir === 'undo' ? '↶ Rückgängig' : '↷ Wiederholt';
    restoreSnapshot(from.pop()!);
  }, [restoreSnapshot]);

  const handleUndo = useCallback(() => restoreMany('undo', 1), [restoreMany]);
  const handleRedo = useCallback(() => restoreMany('redo', 1), [restoreMany]);

  // ── Activity log (Protokoll) ──────────────────────────────────────────────
  // A timestamped, append-only trail of edits this session. Derived from the
  // document state itself (no per-handler wiring): when the plan changes, the
  // change is summarised and logged. Consecutive identical labels (e.g. a drag)
  // are coalesced, and project loads are suppressed.
  interface LogEntry { time: number; label: string }
  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const prevDocRef = useRef<Snapshot>(stateRef.current);
  const suppressLogRef = useRef(true); // skip the initial mount + loads
  useEffect(() => {
    if (suppressLogRef.current) { suppressLogRef.current = false; prevDocRef.current = stateRef.current; return; }
    const prefix = logPrefixRef.current; logPrefixRef.current = null;
    const base = summarizeChange(prevDocRef.current, stateRef.current);
    prevDocRef.current = stateRef.current;
    if (base === 'Geändert' && !prefix) return; // no detectable change
    const label = prefix ? `${prefix}: ${base}` : base;
    setActivityLog((log) => {
      const last = log[log.length - 1];
      if (last && last.label === label && Date.now() - last.time < 1500) {
        return [...log.slice(0, -1), { time: Date.now(), label }]; // coalesce
      }
      const next = [...log, { time: Date.now(), label }];
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }, [fixtures, persons, stageElements, shapes, fixtureGroups, trusses, walls, ceilings]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if (e.key === 'y' || e.key === 'Z' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  // Escape cancels a pending placement and leaves plan-edit modes.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPlanMode('none'); setFixtureToPlace(null); } };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);
  useEffect(() => { if (viewMode === '3d') setPlanMode('none'); setCursorLux(null); }, [viewMode]);

  // Switching to any drawing/placement tool cancels a pending fixture drop,
  // so the tool isn't swallowed by the place-on-click handler.
  const handleToolChange = useCallback((t: Tool) => {
    setActiveTool(t);
    if (t !== 'select') { setFixtureToPlace(null); setPlanMode('none'); }
  }, []);

  // ── Selection helpers ──
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const handleSelect = useCallback((id: string | null, ctrlKey = false) => {
    if (id === null) { setSelectedIds(new Set()); return; }
    setSelectedIds((prev) => {
      if (ctrlKey) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }, []);

  // ── Fixture handlers ──
  const handleSelectFixtureToPlace = useCallback((f: Fixture) => {
    setFixtureToPlace((prev) => (prev?.id === f.id ? null : f));
    setActiveTool('select');
  }, []);

  const createPlacedFixture = useCallback((fixture: Fixture, x: number, y: number): PlacedFixture => ({
    id: uid('pf'),
    fixture,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    mountingHeight: defaultMountingHeight,
    aimX: Math.round(x * 10) / 10,
    aimY: Math.round(y * 10) / 10,
    dimming: 100,
    bodyRotation: 0,
  }), [defaultMountingHeight]);

  const handlePlaceFixture = useCallback((fixture: Fixture, x: number, y: number) => {
    pushHistory();
    const placed = createPlacedFixture(fixture, x, y);
    setFixtures((prev) => [...prev, placed]);
    setSelectedIds(new Set([placed.id]));
  }, [createPlacedFixture]);

  const handleDropFixture = useCallback((fixture: Fixture, x: number, y: number) => {
    pushHistory();
    const placed = createPlacedFixture(fixture, x, y);
    setFixtures((prev) => [...prev, placed]);
    setSelectedIds(new Set([placed.id]));
    setFixtureToPlace(null);
  }, [createPlacedFixture]);

  const handleMoveFixture = useCallback((id: string, x: number, y: number) => {
    pushHistoryThrottled();
    setFixtures((prev) => {
      const target = prev.find((f) => f.id === id);
      if (!target) return prev;
      const dx = x - target.x, dy = y - target.y;
      // Move all selected fixtures together if the dragged one is in the selection
      const moveIds = selectedIds.has(id) ? selectedIds : new Set([id]);
      return prev.map((f) => {
        if (!moveIds.has(f.id)) return f;
        if (f.id === id) return { ...f, x, y, aimX: f.aimX + dx, aimY: f.aimY + dy };
        return { ...f, x: f.x + dx, y: f.y + dy, aimX: f.aimX + dx, aimY: f.aimY + dy };
      });
    });
  }, [selectedIds]);

  const handleUpdateFixture = useCallback((id: string, updates: Partial<PlacedFixture>) => {
    pushHistoryThrottled();
    setFixtures((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, [pushHistoryThrottled]);

  const handleMoveAim = useCallback((id: string, aimX: number, aimY: number) => {
    pushHistoryThrottled();
    setFixtures((prev) => prev.map((f) => (f.id === id ? { ...f, aimX, aimY } : f)));
  }, [pushHistoryThrottled]);

  // ── Person handlers ──
  const handleAddPerson = useCallback((x: number, y: number) => {
    pushHistory();
    const p: Person = { id: uid('per'), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, height: 1.75, label: '', pose: 'standing', facing: 270 };
    setPersons((prev) => [...prev, p]);
    setSelectedIds(new Set([p.id]));
  }, []);

  const handleMovePerson = useCallback((id: string, x: number, y: number) => {
    pushHistoryThrottled();
    setPersons((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
  }, [pushHistoryThrottled]);

  const handleUpdatePerson = useCallback((id: string, updates: Partial<Person>) => {
    pushHistoryThrottled();
    setPersons((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }, [pushHistoryThrottled]);

  // ── Stage element handlers ──
  const handleAddStageElement = useCallback((x: number, y: number, width = 1, depth = 1) => {
    pushHistory();
    const r = (v: number) => Math.round(v * 10) / 10;
    const se: StageElement = {
      id: uid('stg'), type: width === 1 && depth === 1 ? 'podest-1x1' : 'custom',
      x: r(x), y: r(y),
      width: Math.max(0.2, r(width)), depth: Math.max(0.2, r(depth)),
      height: 0.4, rotation: 0, label: '',
    };
    setStageElements((prev) => [...prev, se]);
    setSelectedIds(new Set([se.id]));
  }, []);

  const handleMoveStageElement = useCallback((id: string, x: number, y: number) => {
    pushHistoryThrottled();
    setStageElements((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      // A polygon stage shifts all its outline points with the bounding box.
      if (s.points) { const dx = x - s.x, dy = y - s.y; return { ...s, x, y, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }; }
      return { ...s, x, y };
    }));
  }, [pushHistoryThrottled]);

  // ── Placeable cameras ──
  const handleAddCamera = useCallback((x: number, y: number) => {
    pushHistory();
    const cam: CameraView = { id: uid('cam'), x, y, height: 1.6, aimX: x, aimY: Math.round((y + 6) * 10) / 10, fov: 50, label: '' };
    setCameras((prev) => [...prev, cam]);
    setSelectedIds(new Set([cam.id]));
  }, [pushHistory]);
  const handleMoveCamera = useCallback((id: string, x: number, y: number) => {
    pushHistoryThrottled();
    setCameras((prev) => prev.map((c) => (c.id === id ? { ...c, x, y } : c)));
  }, [pushHistoryThrottled]);
  const handleMoveCameraAim = useCallback((id: string, aimX: number, aimY: number) => {
    pushHistoryThrottled();
    setCameras((prev) => prev.map((c) => (c.id === id ? { ...c, aimX, aimY } : c)));
  }, [pushHistoryThrottled]);
  const handleUpdateCamera = useCallback((id: string, updates: Partial<CameraView>) => {
    pushHistoryThrottled();
    setCameras((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, [pushHistoryThrottled]);
  const handleLookThroughCamera = useCallback((id: string) => {
    const cam = cameras.find((c) => c.id === id);
    if (!cam) return;
    setViewMode('3d');
    // Scene3D loads lazily; retry until its imperative handle is ready.
    const tryLook = (n = 0) => {
      if (scene3DRef.current) scene3DRef.current.lookThroughCamera(cam);
      else if (n < 60) setTimeout(() => tryLook(n + 1), 50);
    };
    tryLook();
  }, [cameras]);

  const handleAddStagePolygon = useCallback((points: { x: number; y: number }[]) => {
    if (points.length < 3) return;
    pushHistory();
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const r = (v: number) => Math.round(v * 10) / 10;
    const se: StageElement = {
      id: uid('stg'), type: 'custom',
      x: r(minX), y: r(minY), width: Math.max(0.1, r(maxX - minX)), depth: Math.max(0.1, r(maxY - minY)),
      height: 0.4, rotation: 0, points: points.map((p) => ({ x: r(p.x), y: r(p.y) })), label: '',
    };
    setStageElements((prev) => [...prev, se]);
    setSelectedIds(new Set([se.id]));
  }, [pushHistory]);

  const handleUpdateStageElement = useCallback((id: string, updates: Partial<StageElement>) => {
    pushHistoryThrottled();
    setStageElements((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, [pushHistoryThrottled]);

  // ── Truss / hanging position handlers ──
  const handleAddTruss = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    pushHistory();
    const t: Truss = { id: uid('trs'), x1, y1, x2, y2, height: defaultMountingHeight, label: '' };
    setTrusses((prev) => [...prev, t]);
    setSelectedIds(new Set([t.id]));
  }, [defaultMountingHeight]);

  const handleMoveTruss = useCallback((id: string, dx: number, dy: number) => {
    pushHistoryThrottled();
    setTrusses((prev) => prev.map((t) => (t.id === id
      ? { ...t, x1: Math.round((t.x1 + dx) * 10) / 10, y1: Math.round((t.y1 + dy) * 10) / 10, x2: Math.round((t.x2 + dx) * 10) / 10, y2: Math.round((t.y2 + dy) * 10) / 10 }
      : t)));
  }, [pushHistoryThrottled]);

  const handleUpdateTruss = useCallback((id: string, updates: Partial<Truss>) => {
    pushHistoryThrottled();
    setTrusses((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, [pushHistoryThrottled]);

  // ── Wall handlers (architecture with reflectance / colour) ──
  const handleAddWall = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    pushHistory();
    const w: Wall = { id: uid('wall'), x1, y1, x2, y2, height: 3, reflectance: 0.5, color: '#c9c4b8', label: '' };
    setWalls((prev) => [...prev, w]);
    setSelectedIds(new Set([w.id]));
  }, []);

  const handleMoveWall = useCallback((id: string, dx: number, dy: number) => {
    pushHistoryThrottled();
    const r = (v: number) => Math.round(v * 10) / 10;
    setWalls((prev) => prev.map((w) => (w.id === id
      ? { ...w, x1: r(w.x1 + dx), y1: r(w.y1 + dy), x2: r(w.x2 + dx), y2: r(w.y2 + dy),
          cx: w.cx != null ? r(w.cx + dx) : undefined, cy: w.cy != null ? r(w.cy + dy) : undefined }
      : w)));
  }, [pushHistoryThrottled]);

  const handleUpdateWall = useCallback((id: string, updates: Partial<Wall>) => {
    pushHistoryThrottled();
    setWalls((prev) => prev.map((w) => (w.id === id ? { ...w, ...updates } : w)));
  }, [pushHistoryThrottled]);

  // ── Ceilings ──
  const handleUpdateCeiling = useCallback((id: string, updates: Partial<Ceiling>) => {
    pushHistoryThrottled();
    setCeilings((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, [pushHistoryThrottled]);

  // Auto-generate a ceiling that spans all walls (convex hull of wall points).
  const handleGenerateCeiling = useCallback(() => {
    if (walls.length === 0) return;
    const pts = walls.flatMap((w) => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]);
    const hull = convexHull(pts);
    if (hull.length < 3) return;
    const h = Math.max(3, ...walls.map((w) => w.height));
    pushHistory();
    const ceiling: Ceiling = {
      id: uid('ceil'), points: hull, height: Math.round(h * 10) / 10,
      reflectance: 0.6, color: '#d8d4c8', label: 'Decke',
    };
    // Replace any existing auto-ceiling rather than stacking duplicates.
    setCeilings([ceiling]);
    setSelectedIds(new Set([ceiling.id]));
  }, [walls, pushHistory]);

  // ── Delete any element ──
  const handleDelete = useCallback((id: string) => {
    pushHistory();
    setFixtures((prev) => prev.filter((f) => f.id !== id));
    setPersons((prev) => prev.filter((p) => p.id !== id));
    setStageElements((prev) => prev.filter((s) => s.id !== id));
    setShapes((prev) => prev.filter((s) => s.id !== id));
    setTrusses((prev) => prev.filter((t) => t.id !== id));
    setWalls((prev) => prev.filter((w) => w.id !== id));
    setCeilings((prev) => prev.filter((c) => c.id !== id));
    setCameras((prev) => prev.filter((c) => c.id !== id));
    setFixtureGroups((prev) => prev.map((g) => ({ ...g, fixtureIds: g.fixtureIds.filter((fid) => fid !== id) })).filter((g) => g.fixtureIds.length > 0));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => handleDelete((e as CustomEvent).detail);
    window.addEventListener('lp-delete', handler);
    return () => window.removeEventListener('lp-delete', handler);
  }, [handleDelete]);

  // ── Auto-lighting ──
  const handleAutoThreePoint = useCallback(() => {
    const targetPersons = selectedId ? persons.filter((p) => p.id === selectedId) : persons;
    if (targetPersons.length === 0) return;
    pushHistory();
    const newFixtures = targetPersons.flatMap((p) => generate3PointLighting(p, defaultMountingHeight, {
      targetLux: heatMapTarget,
    }));
    setFixtures((prev) => [...prev, ...newFixtures]);
  }, [persons, selectedId, defaultMountingHeight, heatMapTarget, pushHistory]);

  const handleAutoThreePointForPerson = useCallback((personId: string) => {
    const person = persons.find((p) => p.id === personId);
    if (!person) return;
    pushHistory();
    const newFixtures = generate3PointLighting(person, defaultMountingHeight, {
      targetLux: heatMapTarget,
    });
    setFixtures((prev) => [...prev, ...newFixtures]);
  }, [persons, defaultMountingHeight, heatMapTarget]);

  const handleAutoThreePointConfigured = useCallback((config: ThreePointConfig) => {
    const targetPersons = selectedId ? persons.filter((p) => p.id === selectedId) : persons;
    if (targetPersons.length === 0) return;
    pushHistory();
    const newFixtures = targetPersons.flatMap((p) =>
      generate3PointLighting(p, defaultMountingHeight, config),
    );
    setFixtures((prev) => [...prev, ...newFixtures]);
    setShowThreePointDialog(false);
  }, [persons, selectedId, defaultMountingHeight, pushHistory]);

  // Pick the area to light: selected rectangle > selected stage > all stage > persons.
  const computeLightArea = useCallback((): LightArea | null => {
    const selRect = shapes.find((s) => s.type === 'rect' && selectedIds.has(s.id) && s.points.length === 2);
    if (selRect) {
      const [a, b] = selRect.points;
      return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
    }
    const selS = stageElements.filter((s) => selectedIds.has(s.id));
    const useS = selS.length ? selS : stageElements;
    if (useS.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const s of useS) { minX = Math.min(minX, s.x); minY = Math.min(minY, s.y); maxX = Math.max(maxX, s.x + s.width); maxY = Math.max(maxY, s.y + s.depth); }
      return { minX, minY, maxX, maxY };
    }
    if (persons.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of persons) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
      return { minX: minX - 2, minY: minY - 2, maxX: maxX + 2, maxY: maxY + 2 };
    }
    return null;
  }, [shapes, stageElements, persons, selectedIds]);

  const lightArea = computeLightArea();

  const handleAreaLight = useCallback((cfg: AreaLightConfig) => {
    const area = computeLightArea();
    if (!area) return;
    pushHistory();
    const newFixtures = generateAreaLighting(area, { ...cfg, mountingHeight: defaultMountingHeight });
    setFixtures((prev) => [...prev, ...newFixtures]);
    setAreaLightOpen(false);
  }, [computeLightArea, defaultMountingHeight, pushHistory]);

  // ── Group / Ungroup / Rotate ──
  const handleGroupSelection = useCallback(() => {
    const selFixtureIds = fixtures.filter((f) => selectedIds.has(f.id)).map((f) => f.id);
    if (selFixtureIds.length < 2) return;
    pushHistory();
    const group: FixtureGroup = { id: uid('grp'), label: `Gruppe ${fixtureGroups.length + 1}`, fixtureIds: selFixtureIds };
    setFixtureGroups((prev) => [...prev, group]);
  }, [fixtures, selectedIds, fixtureGroups.length]);

  const handleUngroupSelection = useCallback(() => {
    pushHistory();
    setFixtureGroups((prev) => prev.filter((g) => !g.fixtureIds.some((id) => selectedIds.has(id))));
  }, [selectedIds, pushHistory]);

  const handleRotateSelectionAroundPerson = useCallback((angleDeg: number) => {
    // Find the first selected person as pivot, or first person in project
    const pivotPerson = persons.find((p) => selectedIds.has(p.id)) ?? persons[0];
    if (!pivotPerson) return;
    pushHistory();
    const cx = pivotPerson.x, cy = pivotPerson.y;
    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);
    setFixtures((prev) => prev.map((f) => {
      if (!selectedIds.has(f.id)) return f;
      const dx = f.x - cx, dy = f.y - cy;
      const adx = f.aimX - cx, ady = f.aimY - cy;
      return {
        ...f,
        x: Math.round((cx + dx * cosA - dy * sinA) * 10) / 10,
        y: Math.round((cy + dx * sinA + dy * cosA) * 10) / 10,
        aimX: Math.round((cx + adx * cosA - ady * sinA) * 10) / 10,
        aimY: Math.round((cy + adx * sinA + ady * cosA) * 10) / 10,
      };
    }));
  }, [persons, selectedIds]);

  // Expand selection to include all grouped fixtures
  const handleSelectWithGroups = useCallback((id: string | null, ctrlKey = false) => {
    if (id === null) { setSelectedIds(new Set()); return; }
    // Find if this fixture belongs to a group
    const group = fixtureGroups.find((g) => g.fixtureIds.includes(id));
    if (group && !ctrlKey) {
      setSelectedIds(new Set(group.fixtureIds));
    } else if (group && ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const allIn = group.fixtureIds.every((fid) => next.has(fid));
        if (allIn) { group.fixtureIds.forEach((fid) => next.delete(fid)); }
        else { group.fixtureIds.forEach((fid) => next.add(fid)); }
        return next;
      });
    } else {
      handleSelect(id, ctrlKey);
    }
  }, [fixtureGroups, handleSelect]);

  // ── Auto-align / distribute ──
  // Select a set of ids at once (box / marquee selection from the canvas).
  const handleSelectMany = useCallback((ids: string[], additive: boolean) => {
    setSelectedIds((prev) => {
      if (additive) { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; }
      return new Set(ids);
    });
  }, []);

  // ── Align selected elements on an axis (X / Y / Z=mounting height) ──
  const handleAlign = useCallback((axis: 'x' | 'y' | 'z') => {
    const selF = fixtures.filter((f) => selectedIds.has(f.id));
    if (axis === 'z') {
      if (selF.length < 2) return;
      pushHistory();
      const z = Math.round((selF.reduce((s, f) => s + f.mountingHeight, 0) / selF.length) * 10) / 10;
      setFixtures((prev) => prev.map((f) => (selectedIds.has(f.id) ? { ...f, mountingHeight: z } : f)));
      return;
    }
    const selP = persons.filter((p) => selectedIds.has(p.id));
    const selS = stageElements.filter((s) => selectedIds.has(s.id));
    const vals = [...selF.map((f) => f[axis]), ...selP.map((p) => p[axis]), ...selS.map((s) => s[axis])];
    if (vals.length < 2) return;
    pushHistory();
    const target = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    if (selF.length) setFixtures((prev) => prev.map((f) => {
      if (!selectedIds.has(f.id)) return f;
      const d = target - f[axis];
      return axis === 'x' ? { ...f, x: target, aimX: f.aimX + d } : { ...f, y: target, aimY: f.aimY + d };
    }));
    if (selP.length) setPersons((prev) => prev.map((p) => (selectedIds.has(p.id) ? { ...p, [axis]: target } : p)));
    if (selS.length) setStageElements((prev) => prev.map((s) => (selectedIds.has(s.id) ? { ...s, [axis]: target } : s)));
  }, [fixtures, persons, stageElements, selectedIds, pushHistory]);

  // ── Evenly distribute the selected fixtures (or all, if none multi-picked) ──
  const distributeFixtures = useCallback((axis: 'x' | 'y') => {
    const sel = fixtures.filter((f) => selectedIds.has(f.id));
    const target = sel.length >= 2 ? sel : fixtures;
    if (target.length < 2) return;
    pushHistory();
    const sorted = [...target].sort((a, b) => a[axis] - b[axis]);
    const min = sorted[0][axis], max = sorted[sorted.length - 1][axis];
    const step = (max - min) / (sorted.length - 1);
    const idMap = new Map(sorted.map((f, i) => [f.id, Math.round((min + i * step) * 10) / 10]));
    setFixtures((prev) => prev.map((f) => {
      const v = idMap.get(f.id);
      if (v === undefined) return f;
      const d = v - f[axis];
      return axis === 'x' ? { ...f, x: v, aimX: f.aimX + d } : { ...f, y: v, aimY: f.aimY + d };
    }));
  }, [fixtures, selectedIds, pushHistory]);
  const handleDistributeH = useCallback(() => distributeFixtures('x'), [distributeFixtures]);
  const handleDistributeV = useCallback(() => distributeFixtures('y'), [distributeFixtures]);

  // ── Project save/load ──
  const handleSaveProject = useCallback((meta: ProjectMeta) => {
    const data: ProjectData = {
      meta,
      fixtures,
      shapes,
      persons,
      stageElements,
      customFixtures,
      fixtureGroups,
      trusses,
      walls,
      ceilings,
      scenes,
      cameras,
      layers,
      floor,
      sun,
      floorPlan: floorPlan ? serializeFloorPlan(floorPlan) : undefined,
    };
    try {
      saveProjectToStorage(projectId, meta, data);
      setProjectMeta(meta);
      setProjectDialogMode(null);
    } catch (err) {
      window.alert(`Projekt konnte nicht gespeichert werden:\n${err instanceof Error ? err.message : err}`);
    }
  }, [fixtures, shapes, persons, stageElements, customFixtures, fixtureGroups, trusses, walls, ceilings, scenes, cameras, layers, floor, sun, floorPlan, projectId]);

  const handleLoadProject = useCallback((data: ProjectData) => {
    historyRef.current = [];
    futureRef.current = [];
    suppressLogRef.current = true;       // don't log the bulk state swap
    setActivityLog([{ time: Date.now(), label: `Projekt geladen: ${data.meta?.name ?? ''}`.trim() }]);
    setFixtures(data.fixtures);
    setShapes(data.shapes);
    setPersons(data.persons);
    setStageElements(data.stageElements);
    setCustomFixtures(data.customFixtures);
    setFixtureGroups(data.fixtureGroups ?? []);
    setTrusses(data.trusses ?? []);
    setWalls(data.walls ?? []);
    setCeilings(data.ceilings ?? []);
    setScenes(data.scenes ?? []);
    setActiveSceneId(null);
    preSceneRef.current = null;
    setCameras(data.cameras ?? []);
    setLayers(data.layers ?? DEFAULT_LAYERS);
    setFloor(data.floor ?? DEFAULT_FLOOR);
    setSun(data.sun ?? defaultSunSettings());
    // Restore the building plan + its calibration (rebuild the live image).
    pdfDocRef.current = null;
    if (data.floorPlan) {
      const stored = data.floorPlan;
      const img = new Image();
      img.onload = () => setFloorPlan({ ...stored, image: img });
      img.src = stored.src;
    } else {
      setFloorPlan(null);
    }
    setPlanMode('none');
    setProjectMeta(data.meta);
    const newId = 'proj-' + Date.now();
    setProjectId(newId);
    setSelectedIds(new Set());
    setProjectDialogMode(null);
  }, []);

  // ── Venue-Austausch: exportiert den geteilten Raum (Wände, Bühne, Personen,
  // Floor-Plan) als neutrale .venue.json, die auch der MultiCam-Planner liest.
  const handleExportVenue = useCallback(async () => {
    const fp = floorPlan ? (() => { const { image: _img, ...rest } = floorPlan; return rest; })() : null;
    const ex = toVenueExchange({
      venueName: projectMeta?.name,
      persons, walls, stageElements, floorPlan: fp,
      appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    });
    const safe = (projectMeta?.name || 'venue').replace(/[^a-zA-Z0-9_-]+/g, '_');
    await host.saveProjectFile(JSON.stringify(ex, null, 2), `${safe}.venue.json`);
  }, [floorPlan, persons, walls, stageElements, projectMeta, host]);

  // ── Gesamtprojekt (.avplan): verlustfreier Austausch aller drei Domaenen.
  // Light bearbeitet "lighting" nativ, reicht "cameras"/"cabling" 1:1 durch.
  const preservedDomainsRef = useRef<{ cameras?: unknown; cabling?: unknown }>({});

  const handleExportAvplan = useCallback(async () => {
    const fp = floorPlan ? (() => { const { image: _img, ...rest } = floorPlan; return rest; })() : null;
    const now = new Date().toISOString();
    const venue = toVenueExchange({
      venueName: projectMeta?.name, persons, walls, stageElements, floorPlan: fp,
      appVersion: APP_VERSION, exportedAt: now,
    }).venue;
    const avplan = makeAvPlan({
      app: 'light-planner', appVersion: APP_VERSION, exportedAt: now, venue,
      domains: {
        lighting: {
          meta: projectMeta ?? { name: 'Lichtplan', author: '', version: '1.0', createdAt: now, updatedAt: now },
          fixtures, shapes, persons, stageElements, customFixtures, fixtureGroups,
          trusses, walls, ceilings, scenes, cameras, layers, floor, sun,
          floorPlan: floorPlan ? serializeFloorPlan(floorPlan) : undefined,
        } satisfies ProjectData,
        cameras: preservedDomainsRef.current.cameras,
        cabling: preservedDomainsRef.current.cabling,
      },
    });
    const safe = (projectMeta?.name || 'projekt').replace(/[^a-zA-Z0-9_-]+/g, '_');
    await host.saveProjectFile(JSON.stringify(avplan, null, 2), `${safe}.avplan`);
  }, [floorPlan, persons, walls, stageElements, projectMeta, host, fixtures, shapes, customFixtures, fixtureGroups, trusses, ceilings, scenes, cameras, layers, floor, sun]);

  const handleImportAvplan = useCallback(async () => {
    const res = await host.openProjectFile();
    if (!res) return;
    let avplan: AvPlan;
    try {
      avplan = parseAvPlan(res.text);
    } catch (e) {
      window.alert(`.avplan-Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const r = fromVenueExchange({
      kind: 'venue-exchange', formatVersion: 1, app: avplan.app,
      appVersion: avplan.appVersion, exportedAt: avplan.exportedAt, venue: avplan.venue,
    });
    const now = new Date().toISOString();
    const lighting = avplan.domains.lighting as ProjectData | undefined;
    const base: ProjectData = lighting ?? {
      meta: { name: avplan.venue.name || 'Projekt', author: '', version: '1.0', createdAt: now, updatedAt: now },
      fixtures: [], shapes: [], persons: [], stageElements: [], customFixtures,
      fixtureGroups: [], trusses: [], walls: [], ceilings: [], scenes: [],
      cameras: [], layers: DEFAULT_LAYERS, floor: DEFAULT_FLOOR, sun: defaultSunSettings(),
    };
    // Lighting-Domaene nativ laden (alle Lampen-Details) + geteilten Raum kanonisch ueberlagern.
    handleLoadProject({
      ...base,
      persons: r.persons, walls: r.walls, stageElements: r.stageElements,
      floorPlan: r.floorPlan ?? undefined,
    });
    // Fremde Domaenen verlustfrei fuer die naechste Ausgabe merken.
    preservedDomainsRef.current = { cameras: avplan.domains.cameras, cabling: avplan.domains.cabling };
    // Read-only Kameras zum Einsehen im 2D-Plan.
    setForeignCameras(foreignCamerasFrom(avplan.domains.cameras));
  }, [host, handleLoadProject, customFixtures]);

  const handleImportVenue = useCallback(async () => {
    const res = await host.openProjectFile();
    if (!res) return;
    let ex;
    try {
      ex = parseVenueExchange(res.text);
    } catch (e) {
      window.alert(`Venue-Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const r = fromVenueExchange(ex);
    pushHistory(); // undoable
    setPersons(r.persons);
    setWalls(r.walls);
    setStageElements(r.stageElements);
    if (r.floorPlan) {
      const stored = r.floorPlan;
      const img = new Image();
      img.onload = () => setFloorPlan({ ...stored, image: img });
      img.src = stored.src;
    } else {
      setFloorPlan(null);
    }
  }, [host, pushHistory]);

  // ── New / empty project ──
  // Clears the scene (keeping the user's custom-fixture library) so you can
  // start fresh. Confirms first when there's unsaved content on the canvas.
  const handleNew = useCallback(() => {
    const hasContent = fixtures.length || persons.length || stageElements.length
      || trusses.length || walls.length || ceilings.length || shapes.length || !!floorPlan;
    if (hasContent && !window.confirm('Neues Projekt anlegen? Nicht gespeicherte Änderungen am aktuellen Projekt gehen verloren.')) return;
    const now = new Date().toISOString();
    handleLoadProject({
      meta: { name: 'Neues Projekt', author: '', version: '1.0', createdAt: now, updatedAt: now },
      fixtures: [], shapes: [], persons: [], stageElements: [],
      customFixtures, fixtureGroups: [], trusses: [], walls: [], ceilings: [],
      scenes: [], cameras: [], layers: DEFAULT_LAYERS, floor: DEFAULT_FLOOR, floorPlan: undefined,
    });
  }, [fixtures, persons, stageElements, trusses, walls, ceilings, shapes, floorPlan, customFixtures, handleLoadProject]);

  useEffect(() => {
    const onNewKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handleNew();
      }
    };
    window.addEventListener('keydown', onNewKey);
    return () => window.removeEventListener('keydown', onNewKey);
  }, [handleNew]);

  const handleDeleteProject = useCallback((id: string) => {
    deleteProjectFromStorage(id);
  }, []);

  // ── Floor plan (JPG / PNG / PDF building plans) ──
  const handleUploadFloorPlan = useCallback((file: File) => {
    loadFloorPlanFile(file)
      .then((loaded) => {
        pdfDocRef.current = loaded.pdf ?? null;
        const widthMeters = 20;
        const heightMeters = (loaded.naturalHeight / loaded.naturalWidth) * widthMeters;
        setFloorPlan({
          image: loaded.image,
          src: loaded.src,
          name: file.name,
          widthMeters,
          heightMeters,
          naturalWidth: loaded.naturalWidth,
          naturalHeight: loaded.naturalHeight,
          offsetX: 0,
          offsetY: 0,
          opacity: 0.7,
          locked: false,
          kind: loaded.kind,
          pageCount: loaded.pageCount,
          pageIndex: loaded.pageIndex,
        });
        setPlanMode('none');
      })
      .catch((err) => {
        window.alert(`Grundriss konnte nicht geladen werden:\n${err?.message ?? err}`);
      });
  }, []);

  const handleUpdateFloorPlan = useCallback((updates: Partial<FloorPlan>) => {
    setFloorPlan((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const handleRemoveFloorPlan = useCallback(() => {
    pdfDocRef.current = null;
    setFloorPlan(null);
    setPlanMode('none');
    setPendingCalibration(null);
  }, []);

  // Switch the visible page of a multi-page PDF, keeping scale & position.
  const handleSetFloorPlanPage = useCallback((pageIndex: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    renderPdfPage(pdf, pageIndex)
      .then((rendered) => {
        setFloorPlan((prev) => prev && {
          ...prev,
          image: rendered.image,
          src: rendered.src,
          naturalWidth: rendered.naturalWidth,
          naturalHeight: rendered.naturalHeight,
          heightMeters: (rendered.naturalHeight / rendered.naturalWidth) * prev.widthMeters,
          pageIndex,
        });
      })
      .catch(() => {});
  }, []);

  // Set the plan width directly; height follows the bitmap aspect ratio.
  const handleSetFloorPlanWidth = useCallback((widthMeters: number) => {
    if (!(widthMeters > 0)) return;
    setFloorPlan((prev) => prev && {
      ...prev,
      widthMeters: Math.round(widthMeters * 100) / 100,
      heightMeters: Math.round((prev.naturalHeight / prev.naturalWidth) * widthMeters * 100) / 100,
    });
  }, []);

  // Called by the canvas after the user drags a reference segment in
  // calibrate mode. We remember the measured length + an anchor point and let
  // the user type the real-world distance.
  const handleCalibrateSegment = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const meters = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    if (meters < 0.05) return;
    setPendingCalibration({ meters, pivotX: x1, pivotY: y1 });
    setPlanMode('none');
  }, []);

  // Apply a calibration: scale the plan so the measured segment equals the
  // entered real length, anchored at the segment's start so it stays put.
  const handleApplyScale = useCallback((realMeters: number) => {
    const pending = pendingCalibration;
    if (pending && realMeters > 0) {
      const s = realMeters / pending.meters;
      setFloorPlan((prev) => prev && {
        ...prev,
        widthMeters: Math.round(prev.widthMeters * s * 100) / 100,
        heightMeters: Math.round(prev.heightMeters * s * 100) / 100,
        offsetX: Math.round((pending.pivotX + (prev.offsetX - pending.pivotX) * s) * 100) / 100,
        offsetY: Math.round((pending.pivotY + (prev.offsetY - pending.pivotY) * s) * 100) / 100,
      });
    }
    setPendingCalibration(null);
  }, [pendingCalibration]);

  // ── Patch & numbering (instrument schedule) ──
  const handleAutoNumber = useCallback(() => {
    pushHistory();
    setFixtures((prev) => autoPatch(prev, { startUniverse: 1, startAddress: 1, number: true, patch: false }));
  }, [pushHistory]);

  const handleAutoPatch = useCallback(() => {
    pushHistory();
    setFixtures((prev) => autoPatch(prev, { startUniverse: 1, startAddress: 1, number: false, patch: true }));
  }, [pushHistory]);

  const patchConflicts = React.useMemo(() => findPatchConflicts(fixtures), [fixtures]);

  // ── Copy / paste / duplicate / nudge ──
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const cloneFixtures = useCallback((src: PlacedFixture[]): PlacedFixture[] =>
    src.map((f) => ({
      ...f, id: uid('pf'),
      x: round1(f.x + 0.5), y: round1(f.y + 0.5), aimX: round1(f.aimX + 0.5), aimY: round1(f.aimY + 0.5),
      channel: undefined, unitNumber: undefined, universe: undefined, dmxAddress: undefined,
    })), []);

  const handleCopy = useCallback(() => {
    const sel = fixtures.filter((f) => selectedIds.has(f.id));
    if (sel.length) clipboardRef.current = sel;
  }, [fixtures, selectedIds]);

  const handlePaste = useCallback(() => {
    if (!clipboardRef.current.length) return;
    pushHistory();
    const pasted = cloneFixtures(clipboardRef.current);
    setFixtures((prev) => [...prev, ...pasted]);
    setSelectedIds(new Set(pasted.map((f) => f.id)));
  }, [cloneFixtures, pushHistory]);

  const handleDuplicate = useCallback(() => {
    const sel = fixtures.filter((f) => selectedIds.has(f.id));
    if (!sel.length) return;
    pushHistory();
    const dup = cloneFixtures(sel);
    setFixtures((prev) => [...prev, ...dup]);
    setSelectedIds(new Set(dup.map((f) => f.id)));
  }, [fixtures, selectedIds, cloneFixtures, pushHistory]);

  const handleNudge = useCallback((dx: number, dy: number) => {
    pushHistoryThrottled();
    setFixtures((prev) => prev.map((f) => (selectedIds.has(f.id)
      ? { ...f, x: round1(f.x + dx), y: round1(f.y + dy), aimX: round1(f.aimX + dx), aimY: round1(f.aimY + dy) } : f)));
    setPersons((prev) => prev.map((p) => (selectedIds.has(p.id) ? { ...p, x: round1(p.x + dx), y: round1(p.y + dy) } : p)));
    setStageElements((prev) => prev.map((s) => (selectedIds.has(s.id) ? { ...s, x: round1(s.x + dx), y: round1(s.y + dy) } : s)));
    setTrusses((prev) => prev.map((t) => (selectedIds.has(t.id)
      ? { ...t, x1: round1(t.x1 + dx), y1: round1(t.y1 + dy), x2: round1(t.x2 + dx), y2: round1(t.y2 + dy) } : t)));
    setWalls((prev) => prev.map((w) => (selectedIds.has(w.id)
      ? { ...w, x1: round1(w.x1 + dx), y1: round1(w.y1 + dy), x2: round1(w.x2 + dx), y2: round1(w.y2 + dy) } : w)));
  }, [selectedIds, pushHistoryThrottled]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); setProjectDialogMode('save'); }
      else if (mod && (e.key === 'c' || e.key === 'C')) { handleCopy(); }
      else if (mod && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); handlePaste(); }
      else if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); handleDuplicate(); }
      else if (viewMode === '2d' && selectedIds.size > 0 && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : (snapStep || 0.1);
        if (e.key === 'ArrowUp') handleNudge(0, -step);
        else if (e.key === 'ArrowDown') handleNudge(0, step);
        else if (e.key === 'ArrowLeft') handleNudge(-step, 0);
        else if (e.key === 'ArrowRight') handleNudge(step, 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCopy, handlePaste, handleDuplicate, handleNudge, selectedIds, snapStep, viewMode]);

  const handleExport = useCallback(async (format: 'png' | 'jpg' | 'pdf' = 'png') => {
    const projName = projectMeta?.name || 'Lichtplan';
    const viewLabel = viewMode === '3d' ? '3D' : '2D';
    const num = exportCounterRef.current++;
    const base = `${projName} ${viewLabel} ${String(num).padStart(3, '0')}`;

    const srcCanvas = viewMode === '3d'
      ? scene3DRef.current?.getCanvas() ?? null
      : (document.querySelector('.plan-canvas') as HTMLCanvasElement | null);
    if (!srcCanvas) return;

    // When the heat-map is on, composite a matching legend into the export so
    // the colours are readable on the saved image.
    let canvas = srcCanvas;
    if (showHeatMap) {
      const composite = document.createElement('canvas');
      composite.width = srcCanvas.width;
      composite.height = srcCanvas.height;
      const cctx = composite.getContext('2d');
      if (cctx) {
        cctx.drawImage(srcCanvas, 0, 0);
        drawHeatMapLegend(cctx, {
          canvasWidth: composite.width,
          canvasHeight: composite.height,
          heatMapScale,
          heatMapTarget,
        });
        canvas = composite;
      }
    }

    // Build the file as a Blob, then let the user pick where it goes (with a
    // download fallback when the File System Access API isn't available).
    if (format === 'pdf') {
      const bytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));
      await host.exportFile(jpegToPdfBlob(bytes, canvas.width, canvas.height), `${base}.pdf`, { 'application/pdf': ['.pdf'] });
    } else {
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), mime, 0.92));
      if (blob) {
        const accept: Record<string, string[]> = format === 'jpg' ? { 'image/jpeg': ['.jpg', '.jpeg'] } : { 'image/png': ['.png'] };
        await host.exportFile(blob, `${base}.${format}`, accept);
      }
    }
  }, [viewMode, projectMeta, showHeatMap, heatMapScale, heatMapTarget, host]);

  // The 2D plan's current draw scale (backing px per metre), reported by
  // PlanCanvas — used to size an accurate scale bar in the printed plot.
  const planPxPerMeterRef = useRef(40);
  const handleExportPlot = useCallback(async () => {
    const srcCanvas = document.querySelector('.plan-canvas') as HTMLCanvasElement | null;
    if (viewMode !== '2d' || !srcCanvas) { window.alert('Lichtplan-Druck: bitte in der 2D-Plan-Ansicht ausführen.'); return; }
    const out = composePlot(srcCanvas, planPxPerMeterRef.current, fixtures, {
      projectName: projectMeta?.name || 'Lichtplan', author: projectMeta?.author,
    });
    const base = `${projectMeta?.name || 'Lichtplan'} Plan ${String(exportCounterRef.current++).padStart(3, '0')}`;
    const bytes = dataUrlToBytes(out.toDataURL('image/jpeg', 0.92));
    await host.exportFile(jpegToPdfBlob(bytes, out.width, out.height), `${base}.pdf`, { 'application/pdf': ['.pdf'] });
  }, [viewMode, fixtures, projectMeta, host]);

  // Current project document as a single object (used by version snapshots).
  const buildCurrentDoc = useCallback((): ProjectData => {
    const now = new Date().toISOString();
    const meta: ProjectMeta = projectMeta ?? { name: 'Lichtplan', author: '', version: '1.0', createdAt: now, updatedAt: now };
    return {
      meta, fixtures, shapes, persons, stageElements, customFixtures, fixtureGroups,
      trusses, walls, ceilings, scenes, cameras, layers, floor, sun,
      floorPlan: floorPlan ? serializeFloorPlan(floorPlan) : undefined,
    };
  }, [projectMeta, fixtures, shapes, persons, stageElements, customFixtures, fixtureGroups, trusses, walls, ceilings, scenes, cameras, layers, floor, sun, floorPlan]);

  // ── Project save/load to a real file (the host decides where) ──
  const handleSaveToFile = useCallback(async () => {
    const now = new Date().toISOString();
    const meta: ProjectMeta = projectMeta ?? { name: 'Lichtplan', author: '', version: '1.0', createdAt: now, updatedAt: now };
    const data: ProjectData = {
      meta: { ...meta, updatedAt: now },
      fixtures, shapes, persons, stageElements, customFixtures, fixtureGroups,
      trusses, walls, ceilings, scenes, cameras, layers, floor, sun,
      floorPlan: floorPlan ? serializeFloorPlan(floorPlan) : undefined,
    };
    const safe = (meta.name || 'Lichtplan').replace(/[^\w.\-]+/g, '_');
    await host.saveProjectFile(JSON.stringify(data, null, 2), `${safe}.lightplan.json`);
  }, [projectMeta, fixtures, shapes, persons, stageElements, customFixtures, fixtureGroups, trusses, walls, ceilings, scenes, cameras, layers, floor, sun, floorPlan, host]);

  const handleLoadFromFile = useCallback(async () => {
    const res = await host.openProjectFile();
    if (!res) return;
    try {
      const raw = JSON.parse(res.text);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Keine gültige Projektdatei.');
      if ('__proto__' in raw || 'constructor' in raw) throw new Error('Ungültige Projektdatei (unerlaubte Schlüssel).');
      if (!Array.isArray(raw.fixtures)) throw new Error('Keine gültige Projektdatei (fixtures fehlen).');
      if (!raw.meta || typeof raw.meta.name !== 'string') throw new Error('Keine gültige Projektdatei (meta fehlt).');
      const data = raw as ProjectData;
      handleLoadProject(data);
    } catch (err) {
      window.alert(`Projektdatei konnte nicht geladen werden:\n${err instanceof Error ? err.message : err}`);
    }
  }, [handleLoadProject, host]);

  const handleAddShape = useCallback((shape: Shape) => { pushHistory(); setShapes((prev) => [...prev, shape]); }, [pushHistory]);
  const handleMoveShape = useCallback((id: string, dx: number, dy: number) => {
    pushHistoryThrottled();
    setShapes((prev) => prev.map((s) => (s.id === id
      ? { ...s, points: s.points.map((p) => ({ x: Math.round((p.x + dx) * 10) / 10, y: Math.round((p.y + dy) * 10) / 10 })) }
      : s)));
  }, [pushHistoryThrottled]);
  const handleAddCustomFixture = useCallback((f: Fixture) => { setCustomFixtures((prev) => [...prev, f]); }, []);

  // ── Scenes / Looks ──
  const applyLooks = useCallback((looks: Record<string, SceneFixtureState>) => {
    setFixtures((prev) => prev.map((f) => (looks[f.id] ? { ...f, ...looks[f.id] } : f)));
  }, []);

  const handleSaveScene = useCallback(() => {
    const states: Record<string, SceneFixtureState> = {};
    for (const f of fixtures) states[f.id] = captureLook(f);
    setScenes((prev) => {
      const scene: Scene = { id: uid('scene'), name: `Szene ${prev.length + 1}`, states };
      setActiveSceneId(scene.id);
      return [...prev, scene];
    });
    preSceneRef.current = null;
  }, [fixtures]);

  // Switch a scene on (apply its look) or, if it is already active, off again
  // (restore the look from just before it was switched on).
  const handleToggleScene = useCallback((id: string) => {
    if (activeSceneId === id) {
      pushHistory();
      if (preSceneRef.current) applyLooks(preSceneRef.current);
      preSceneRef.current = null;
      setActiveSceneId(null);
      return;
    }
    const scene = scenes.find((s) => s.id === id);
    if (!scene) return;
    pushHistory();
    const pre: Record<string, SceneFixtureState> = {};
    for (const f of fixtures) pre[f.id] = captureLook(f);
    preSceneRef.current = pre;
    applyLooks(scene.states);
    setActiveSceneId(id);
  }, [activeSceneId, scenes, fixtures, applyLooks, pushHistory]);

  const handleUpdateScene = useCallback((id: string) => {
    const states: Record<string, SceneFixtureState> = {};
    for (const f of fixtures) states[f.id] = captureLook(f);
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, states } : s)));
    setActiveSceneId(id);
    preSceneRef.current = null;
  }, [fixtures]);

  const handleRenameScene = useCallback((id: string, name: string) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);

  const handleDeleteScene = useCallback((id: string) => {
    setScenes((prev) => prev.filter((s) => s.id !== id));
    setActiveSceneId((a) => (a === id ? null : a));
  }, []);

  // ── Temporarily mute / un-mute lamps ──
  const handleShowAllFixtures = useCallback(() => {
    if (!fixtures.some((f) => f.hidden)) return;
    pushHistory();
    setFixtures((prev) => prev.map((f) => (f.hidden ? { ...f, hidden: undefined } : f)));
  }, [fixtures, pushHistory]);

  const hiddenCount = fixtures.reduce((n, f) => n + (f.hidden ? 1 : 0), 0);

  // ── Layers (Ebenen) ──
  const toggleLayerVisible = useCallback((k: LayerKey) => setLayers((p) => ({ ...p, [k]: { ...p[k], visible: !p[k].visible } })), []);
  const toggleLayerLocked = useCallback((k: LayerKey) => setLayers((p) => ({ ...p, [k]: { ...p[k], locked: !p[k].locked } })), []);
  const layerCounts: Record<LayerKey, number> = {
    fixtures: fixtures.length, persons: persons.length, trusses: trusses.length,
    stage: stageElements.length, shapes: shapes.length, ceilings: ceilings.length,
    walls: walls.length, floorPlan: floorPlan ? 1 : 0,
  };

  // Top-bar mode switch: 2D plan / 3D / Foto (= 3D + photo relight).
  const handleSetMode = useCallback((m: '2d' | '3d' | 'photo') => {
    if (m === '2d') { setViewMode('2d'); return; }
    setViewMode('3d');
    if (m === 'photo' && !photoMode) togglePhotoMode();
    else if (m === '3d' && photoMode) togglePhotoMode();
  }, [setViewMode, photoMode, togglePhotoMode]);

  const activeSceneName = scenes.find((s) => s.id === activeSceneId)?.name ?? null;

  // Publish the live lighting document to the zustand projectStore so a host
  // (Cable-Planner) can read/subscribe to the current plan (e.g. pull fixtures
  // as equipment, or embed it in its own project file).
  useEffect(() => {
    useProjectStore.getState().setDocument({
      fixtures, shapes, persons, stageElements, customFixtures, fixtureGroups,
      trusses, walls, ceilings, scenes, cameras, layers, floor,
      floorPlan: floorPlan ? serializeFloorPlan(floorPlan) : undefined,
    }, projectMeta ?? null);
  }, [fixtures, shapes, persons, stageElements, customFixtures, fixtureGroups, trusses, walls, ceilings, scenes, cameras, layers, floor, floorPlan, projectMeta]);

  return (
    <div className="app">
      <TopBar
        projectName={projectMeta?.name ?? ''}
        viewMode={viewMode}
        photoMode={photoMode}
        showHeatMap={showHeatMap}
        exposure={exposure}
        haze={haze}
        showBeams={showBeams}
        ambience={ambience}
        floor={floor}
        sun={sun}
        sunInfo={resolvedSun ? { altitudeDeg: resolvedSun.altitudeDeg, azimuthDeg: resolvedSun.azimuthDeg } : null}
        heatMapScale={heatMapScale}
        heatMapTarget={heatMapTarget}
        snapStep={snapStep}
        showFocusNotes={showFocusNotes}
        onSetMode={handleSetMode}
        onToggleHeatMap={toggleHeatMap}
        onExposureChange={setExposure}
        onHazeChange={setHaze}
        onToggleBeams={toggleBeams}
        onAmbienceChange={setAmbience}
        onFloorChange={setFloor}
        onSunChange={setSun}
        onHeatMapScaleChange={setHeatMapScale}
        onHeatMapTargetChange={setHeatMapTarget}
        onToggleSnap={toggleSnap}
        onToggleFocusNotes={toggleFocusNotes}
        onUploadFloorPlan={handleUploadFloorPlan}
        onOpenSchedule={() => setScheduleOpen(true)}
        onExport={handleExport}
        onExportPlot={handleExportPlot}
        onNew={handleNew}
        onSave={() => setProjectDialogMode('save')}
        onLoad={() => setProjectDialogMode('load')}
        onExportAvplan={handleExportAvplan}
        onImportAvplan={handleImportAvplan}
        onExportVenue={handleExportVenue}
        onImportVenue={handleImportVenue}
        onSaveToFile={handleSaveToFile}
        onLoadFromFile={handleLoadFromFile}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onVersions={() => setVersionOpen(true)}
        onChanges={() => setChangesOpen(true)}
        onAbout={() => setAboutOpen(true)}
      />
      <div className="app-body">
        <ToolRail activeTool={activeTool} onToolChange={handleToolChange} />
        <Dock
          customFixtures={customFixtures}
          fixtureToPlace={fixtureToPlace}
          onAddCustomFixture={handleAddCustomFixture}
          onSelectFixtureToPlace={handleSelectFixtureToPlace}
          layers={layers}
          layerCounts={layerCounts}
          onToggleLayerVisible={toggleLayerVisible}
          onToggleLayerLocked={toggleLayerLocked}
          scenes={scenes}
          activeSceneId={activeSceneId}
          hiddenCount={hiddenCount}
          fixtureCount={fixtures.length}
          onSaveScene={handleSaveScene}
          onToggleScene={handleToggleScene}
          onUpdateScene={handleUpdateScene}
          onRenameScene={handleRenameScene}
          onDeleteScene={handleDeleteScene}
          onShowAll={handleShowAllFixtures}
        />
        <div className="canvas-area">
          {viewMode === '2d' ? (
            <PlanCanvas
              foreignCameras={foreignCameras}
              fixtures={fixtures}
              shapes={shapes}
              persons={persons}
              stageElements={stageElements}
              trusses={trusses}
              walls={walls}
              ceilings={ceilings}
              sun={resolvedSun}
              floorPlan={floorPlan}
              layers={layers}
              snapStep={snapStep}
              activeTool={activeTool}
              fixtureToPlace={fixtureToPlace}
              selectedIds={selectedIds}
              showHeatMap={showHeatMap}
              heatMapScale={heatMapScale}
              heatMapTarget={heatMapTarget}
              showFocusNotes={showFocusNotes}
              onPlaceFixture={handlePlaceFixture}
              onMoveFixture={handleMoveFixture}
              onSelect={handleSelectWithGroups}
              onSelectMany={handleSelectMany}
              onMoveShape={handleMoveShape}
              onAddShape={handleAddShape}
              onAddPerson={handleAddPerson}
              onAddStageElement={handleAddStageElement}
              onMovePerson={handleMovePerson}
              onMoveStageElement={handleMoveStageElement}
              onUpdateStageElement={handleUpdateStageElement}
              onAddStagePolygon={handleAddStagePolygon}
              cameras={cameras}
              onAddCamera={handleAddCamera}
              onMoveCamera={handleMoveCamera}
              onMoveCameraAim={handleMoveCameraAim}
              onAddTruss={handleAddTruss}
              onMoveTruss={handleMoveTruss}
              onAddWall={handleAddWall}
              onMoveWall={handleMoveWall}
              onUpdateWall={handleUpdateWall}
              onCursorLux={setCursorLux}
              onToolChange={handleToolChange}
              onDropFixture={handleDropFixture}
              onMoveAim={handleMoveAim}
              planMode={planMode}
              onUpdateFloorPlan={handleUpdateFloorPlan}
              onCalibrateSegment={handleCalibrateSegment}
              onViewChange={(s) => { planPxPerMeterRef.current = s; }}
            />
          ) : (
            <Suspense fallback={<div className="loading-3d">3D-Ansicht wird geladen…</div>}>
              <Scene3D
                ref={scene3DRef}
                fixtures={fixtures}
                persons={persons}
                stageElements={stageElements}
                trusses={trusses}
                walls={walls}
                ceilings={ceilings}
                sun={resolvedSun}
                floorPlan={floorPlan}
                layers={layers}
                cameras={cameras}
                selectedIds={selectedIds}
                showHeatMap={showHeatMap}
                heatMapScale={heatMapScale}
                heatMapTarget={heatMapTarget}
                photoMode={photoMode}
                exposure={exposure}
                haze={haze}
                showBeams={showBeams}
                ambience={ambience}
                floor={floor}
                onSelect={handleSelectWithGroups}
                onHoverLux={setCursorLux}
              />
            </Suspense>
          )}
          <CanvasActions
            viewMode={viewMode}
            hasSelection={selectedIds.size > 0}
            multiSelected={selectedIds.size > 1}
            hasArea={lightArea !== null}
            hasWalls={walls.length > 0}
            onAlignX={() => handleAlign('x')}
            onAlignY={() => handleAlign('y')}
            onAlignZ={() => handleAlign('z')}
            onDistributeH={handleDistributeH}
            onDistributeV={handleDistributeV}
            onGroup={handleGroupSelection}
            onUngroup={handleUngroupSelection}
            onRotate={(deg) => handleRotateSelectionAroundPerson(deg)}
            onAutoThreePoint={handleAutoThreePoint}
            onAutoThreePointConfig={() => setShowThreePointDialog(true)}
            onAutoDistribute={() => setAreaLightOpen(true)}
            onGenerateCeiling={handleGenerateCeiling}
          />
          {fixtureToPlace && viewMode === '2d' && (
            <div className="placing-hint">
              Klicke auf den Plan um <strong>{fixtureToPlace.name}</strong> zu platzieren · ESC zum Abbrechen
            </div>
          )}
          {activeTool === 'wall' && viewMode === '2d' && (
            <div className="placing-hint">
              🧱 <strong>Wand-Pfad</strong>: Punkte nacheinander klicken · Startpunkt klicken schließt den Raum · <kbd>Shift</kbd> = 15°-Winkel · Doppelklick/<kbd>ESC</kbd> beendet
            </div>
          )}
          {activeTool === 'stagepoly' && viewMode === '2d' && (
            <div className="placing-hint">
              ⬠ <strong>Bühne (Polygon)</strong>: Eckpunkte klicken · Startpunkt klicken oder Doppelklick/<kbd>Enter</kbd> schließt die Fläche · <kbd>ESC</kbd> bricht ab
            </div>
          )}
          {activeTool === 'camera' && viewMode === '2d' && (
            <div className="placing-hint">
              🎥 <strong>Kamera</strong>: Klicke, um eine Kamera zu setzen · dann Blickziel &amp; Bildwinkel einstellen und „Durch Kamera schauen"
            </div>
          )}
          {planMode === 'calibrate' && viewMode === '2d' && (
            <div className="placing-hint plan-calibrate-hint">
              📏 Ziehe eine Linie entlang einer <strong>bekannten Strecke</strong> (z.&nbsp;B. eine Wand) · ESC zum Abbrechen
            </div>
          )}
          {planMode === 'move' && viewMode === '2d' && (
            <div className="placing-hint plan-calibrate-hint">
              ✋ Ziehe den Grundriss, um ihn auszurichten · ESC zum Beenden
            </div>
          )}
          {floorPlan && viewMode === '2d' && (
            <FloorPlanPanel
              floorPlan={floorPlan}
              planMode={planMode}
              onSetMode={setPlanMode}
              onSetWidth={handleSetFloorPlanWidth}
              onSetPage={handleSetFloorPlanPage}
              onUpdate={handleUpdateFloorPlan}
              onRemove={handleRemoveFloorPlan}
            />
          )}
        </div>
        <PropertyPanel
          fixtures={fixtures}
          persons={persons}
          stageElements={stageElements}
          trusses={trusses}
          walls={walls}
          ceilings={ceilings}
          shapes={shapes}
          cameras={cameras}
          selectedIds={selectedIds}
          cursorLux={cursorLux}
          patchConflicts={patchConflicts}
          onUpdateFixture={handleUpdateFixture}
          onUpdatePerson={handleUpdatePerson}
          onUpdateStageElement={handleUpdateStageElement}
          onUpdateTruss={handleUpdateTruss}
          onUpdateWall={handleUpdateWall}
          onUpdateCeiling={handleUpdateCeiling}
          onUpdateCamera={handleUpdateCamera}
          onLookThroughCamera={handleLookThroughCamera}
          onDelete={handleDelete}
          onAutoThreePointForPerson={handleAutoThreePointForPerson}
          onAreaLight={() => setAreaLightOpen(true)}
        />
      </div>
      <StatusBar
        viewMode={viewMode}
        photoMode={photoMode}
        cursorLux={cursorLux}
        selectionCount={selectedIds.size}
        snapStep={snapStep}
        haze={haze}
        exposure={exposure}
        activeSceneName={activeSceneName}
        hiddenCount={hiddenCount}
      />
      {showThreePointDialog && (
        <ThreePointDialog
          targetLux={heatMapTarget}
          trusses={trusses}
          onGenerate={handleAutoThreePointConfigured}
          onCancel={() => setShowThreePointDialog(false)}
        />
      )}
      {pendingCalibration && (
        <ScaleDialog
          measuredMeters={pendingCalibration.meters}
          onApply={handleApplyScale}
          onCancel={() => setPendingCalibration(null)}
        />
      )}
      {areaLightOpen && lightArea && (
        <AreaLightDialog
          area={lightArea}
          defaultTargetLux={heatMapTarget}
          trusses={trusses}
          onGenerate={handleAreaLight}
          onCancel={() => setAreaLightOpen(false)}
        />
      )}
      {versionOpen && (
        <VersionDialog
          projectId={projectId}
          projectName={projectMeta?.name ?? ''}
          currentDoc={buildCurrentDoc()}
          onRestore={(doc) => { handleLoadProject(doc); setVersionOpen(false); }}
          onClose={() => setVersionOpen(false)}
        />
      )}
      {changesOpen && (() => {
        const states = [...historyRef.current, stateRef.current];
        const undoSteps = [];
        for (let t = states.length - 1; t >= 1; t--) undoSteps.push({ count: states.length - t, label: summarizeChange(states[t - 1], states[t]) });
        const fut = futureRef.current; const redoSteps = []; let prev = stateRef.current;
        for (let i = fut.length - 1, k = 1; i >= 0; i--, k++) { redoSteps.push({ count: k, label: summarizeChange(prev, fut[i]) }); prev = fut[i]; }
        return (
          <ChangesDialog
            log={activityLog}
            undoSteps={undoSteps}
            redoSteps={redoSteps}
            currentDoc={buildCurrentDoc()}
            projectId={projectId}
            projectName={projectMeta?.name ?? ''}
            onJump={(dir, count) => restoreMany(dir, count)}
            onSaveVersion={(lbl) => { try { saveVersion(projectId, lbl, buildCurrentDoc()); } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); } }}
            onClose={() => setChangesOpen(false)}
          />
        );
      })()}
      {scheduleOpen && (
        <ScheduleDialog
          fixtures={fixtures}
          trusses={trusses}
          walls={walls}
          ceilings={ceilings}
          area={lightArea}
          projectName={projectMeta?.name ?? ''}
          conflicts={patchConflicts}
          onAutoNumber={handleAutoNumber}
          onAutoPatch={handleAutoPatch}
          onLocate={(ids) => { if (ids.length) { setSelectedIds(new Set(ids)); setViewMode('2d'); setScheduleOpen(false); } }}
          onUpdateFixture={handleUpdateFixture}
          onClose={() => setScheduleOpen(false)}
        />
      )}
      {projectDialogMode && (
        <ProjectDialog
          mode={projectDialogMode}
          currentMeta={projectMeta}
          onSave={handleSaveProject}
          onLoad={handleLoadProject}
          onDelete={handleDeleteProject}
          onCancel={() => setProjectDialogMode(null)}
          onSaveToFile={handleSaveToFile}
          onLoadFromFile={handleLoadFromFile}
        />
      )}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      <button
        type="button"
        onClick={() => setInventoryOpen(true)}
        title="Lager / Bestand"
        style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 150, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, cursor: 'pointer' }}
      >
        <Icon name="library" size={16} /> Lager
      </button>
      {inventoryOpen && <InventoryDialog onClose={() => setInventoryOpen(false)} />}
    </div>
  );
};

export default App;
