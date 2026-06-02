import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import type { PlacedFixture, Shape, Tool, Fixture, FloorPlan, ViewMode, Person, StageElement, ProjectMeta, ProjectData, FixtureGroup, Truss } from './types';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import PlanCanvas from './components/PlanCanvas';
import PropertyPanel from './components/PropertyPanel';
import ThreePointDialog from './components/ThreePointDialog';
import ProjectDialog, { saveProjectToStorage, deleteProjectFromStorage } from './components/ProjectDialog';
import FloorPlanPanel from './components/FloorPlanPanel';
import ScaleDialog from './components/ScaleDialog';
import ScheduleDialog from './components/ScheduleDialog';
import { autoPatch, findPatchConflicts } from './utils/patch';
import { generate3PointLighting, generateEvenDistribution } from './utils/autoLighting';
import type { ThreePointConfig } from './utils/autoLighting';
import type { Scene3DHandle } from './components/Scene3D';
import { loadFloorPlanFile, renderPdfPage } from './utils/floorPlanLoader';
import { jpegToPdfBlob, dataUrlToBytes, downloadBlob, downloadDataUrl } from './utils/pdfExport';
import MenuBar from './components/MenuBar';
import type * as pdfjsLib from 'pdfjs-dist';
import './App.css';

export type PlanMode = 'none' | 'calibrate' | 'move';

const Scene3D = lazy(() => import('./components/Scene3D'));

let nextId = 1;
function uid(prefix: string) { return `${prefix}-${Date.now()}-${nextId++}`; }

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
  const [stageElements, setStageElements] = useState<StageElement[]>([]);
  const [customFixtures, setCustomFixtures] = useState<Fixture[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fixtureToPlace, setFixtureToPlace] = useState<Fixture | null>(null);
  const [showHeatMap, setShowHeatMap] = useState(false);
  const [heatMapScale, setHeatMapScale] = useState(1000);
  const [heatMapTarget, setHeatMapTarget] = useState(0);
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [cursorLux, setCursorLux] = useState<number | null>(null);
  const [showThreePointDialog, setShowThreePointDialog] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<'save' | 'load' | null>(null);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | undefined>(undefined);
  const [projectId, setProjectId] = useState<string>('proj-' + Date.now());
  const [fixtureGroups, setFixtureGroups] = useState<FixtureGroup[]>([]);
  const [trusses, setTrusses] = useState<Truss[]>([]);
  const [planMode, setPlanMode] = useState<PlanMode>('none');
  const [pendingCalibration, setPendingCalibration] = useState<{ meters: number; pivotX: number; pivotY: number } | null>(null);
  const [snapStep, setSnapStep] = useState(0); // 0 = off; otherwise grid step in metres
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const clipboardRef = useRef<PlacedFixture[]>([]);
  const scene3DRef = useRef<Scene3DHandle>(null);
  const exportCounterRef = useRef(1);
  const defaultMountingHeight = 6;

  // ── Undo / Redo ──
  interface Snapshot { fixtures: PlacedFixture[]; persons: Person[]; stageElements: StageElement[]; shapes: Shape[]; fixtureGroups: FixtureGroup[]; trusses: Truss[] }
  const historyRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const lastPushRef = useRef(0);
  const stateRef = useRef<Snapshot>({ fixtures, persons, stageElements, shapes, fixtureGroups, trusses });
  stateRef.current = { fixtures, persons, stageElements, shapes, fixtureGroups, trusses };

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
  }, []);

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    futureRef.current.push({ ...stateRef.current });
    restoreSnapshot(historyRef.current.pop()!);
  }, [restoreSnapshot]);

  const handleRedo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    historyRef.current.push({ ...stateRef.current });
    restoreSnapshot(futureRef.current.pop()!);
  }, [restoreSnapshot]);

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
  useEffect(() => { if (viewMode === '3d') setPlanMode('none'); }, [viewMode]);

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
    const p: Person = { id: uid('per'), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, height: 1.75, label: '' };
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
  const handleAddStageElement = useCallback((x: number, y: number) => {
    pushHistory();
    const se: StageElement = {
      id: uid('stg'), type: 'podest-1x1',
      x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
      width: 1, depth: 1, height: 0.4, rotation: 0, label: '',
    };
    setStageElements((prev) => [...prev, se]);
    setSelectedIds(new Set([se.id]));
  }, []);

  const handleMoveStageElement = useCallback((id: string, x: number, y: number) => {
    pushHistoryThrottled();
    setStageElements((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)));
  }, [pushHistoryThrottled]);

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

  // ── Delete any element ──
  const handleDelete = useCallback((id: string) => {
    pushHistory();
    setFixtures((prev) => prev.filter((f) => f.id !== id));
    setPersons((prev) => prev.filter((p) => p.id !== id));
    setStageElements((prev) => prev.filter((s) => s.id !== id));
    setShapes((prev) => prev.filter((s) => s.id !== id));
    setTrusses((prev) => prev.filter((t) => t.id !== id));
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

  const handleAutoDistribute = useCallback(() => {
    if (persons.length === 0 && stageElements.length === 0) return;
    pushHistory();
    const newFixtures = generateEvenDistribution(persons, defaultMountingHeight, {
      targetLux: heatMapTarget,
    }, stageElements);
    setFixtures((prev) => [...prev, ...newFixtures]);
  }, [persons, stageElements, defaultMountingHeight, heatMapTarget]);

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
      floorPlan: floorPlan ? serializeFloorPlan(floorPlan) : undefined,
    };
    try {
      saveProjectToStorage(projectId, meta, data);
      setProjectMeta(meta);
      setProjectDialogMode(null);
    } catch (err) {
      window.alert(`Projekt konnte nicht gespeichert werden:\n${err instanceof Error ? err.message : err}`);
    }
  }, [fixtures, shapes, persons, stageElements, customFixtures, fixtureGroups, trusses, floorPlan, projectId]);

  const handleLoadProject = useCallback((data: ProjectData) => {
    historyRef.current = [];
    futureRef.current = [];
    setFixtures(data.fixtures);
    setShapes(data.shapes);
    setPersons(data.persons);
    setStageElements(data.stageElements);
    setCustomFixtures(data.customFixtures);
    setFixtureGroups(data.fixtureGroups ?? []);
    setTrusses(data.trusses ?? []);
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
        console.error(err);
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
      .catch((err) => console.error(err));
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

  const handleExport = useCallback((format: 'png' | 'jpg' | 'pdf' = 'png') => {
    const projName = projectMeta?.name || 'Lichtplan';
    const viewLabel = viewMode === '3d' ? '3D' : '2D';
    const num = exportCounterRef.current++;
    const base = `${projName} ${viewLabel} ${String(num).padStart(3, '0')}`;

    const canvas = viewMode === '3d'
      ? scene3DRef.current?.getCanvas() ?? null
      : (document.querySelector('.plan-canvas') as HTMLCanvasElement | null);
    if (!canvas) return;

    if (format === 'pdf') {
      const bytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));
      downloadBlob(jpegToPdfBlob(bytes, canvas.width, canvas.height), `${base}.pdf`);
    } else if (format === 'jpg') {
      downloadDataUrl(canvas.toDataURL('image/jpeg', 0.92), `${base}.jpg`);
    } else {
      downloadDataUrl(canvas.toDataURL('image/png'), `${base}.png`);
    }
  }, [viewMode, projectMeta]);

  const handleAddShape = useCallback((shape: Shape) => { pushHistory(); setShapes((prev) => [...prev, shape]); }, [pushHistory]);
  const handleAddCustomFixture = useCallback((f: Fixture) => { setCustomFixtures((prev) => [...prev, f]); }, []);

  return (
    <div className="app">
      <MenuBar
        viewMode={viewMode}
        showHeatMap={showHeatMap}
        snapEnabled={snapStep > 0}
        onSave={() => setProjectDialogMode('save')}
        onLoad={() => setProjectDialogMode('load')}
        onExport={handleExport}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDuplicate={handleDuplicate}
        onOpenSchedule={() => setScheduleOpen(true)}
        onViewModeChange={setViewMode}
        onToggleHeatMap={() => setShowHeatMap((v) => !v)}
        onToggleSnap={() => setSnapStep((s) => (s > 0 ? 0 : 0.5))}
      />
      <Toolbar
        activeTool={activeTool}
        viewMode={viewMode}
        showHeatMap={showHeatMap}
        heatMapScale={heatMapScale}
        onToolChange={handleToolChange}
        onViewModeChange={setViewMode}
        onToggleHeatMap={() => setShowHeatMap((v) => !v)}
        heatMapTarget={heatMapTarget}
        onHeatMapScaleChange={setHeatMapScale}
        onHeatMapTargetChange={setHeatMapTarget}
        onUploadFloorPlan={handleUploadFloorPlan}
        onExport={handleExport}
        onAutoThreePoint={handleAutoThreePoint}
        onAutoThreePointConfig={() => setShowThreePointDialog(true)}
        onAutoDistribute={handleAutoDistribute}
        onAlignX={() => handleAlign('x')}
        onAlignY={() => handleAlign('y')}
        onAlignZ={() => handleAlign('z')}
        onDistributeH={handleDistributeH}
        onDistributeV={handleDistributeV}
        onSaveProject={() => setProjectDialogMode('save')}
        onLoadProject={() => setProjectDialogMode('load')}
        onOpenSchedule={() => setScheduleOpen(true)}
        snapEnabled={snapStep > 0}
        onToggleSnap={() => setSnapStep((s) => (s > 0 ? 0 : 0.5))}
        hasPersons={persons.length > 0}
        hasStageElements={stageElements.length > 0}
        hasSelection={selectedIds.size > 0}
        multiSelected={selectedIds.size > 1}
        onGroupSelection={handleGroupSelection}
        onUngroupSelection={handleUngroupSelection}
        onRotateSelection={(deg: number) => handleRotateSelectionAroundPerson(deg)}
      />
      <div className="app-body">
        <Sidebar
          customFixtures={customFixtures}
          onAddCustomFixture={handleAddCustomFixture}
          onSelectFixtureToPlace={handleSelectFixtureToPlace}
          fixtureToPlace={fixtureToPlace}
        />
        <div className="canvas-area">
          {viewMode === '2d' ? (
            <PlanCanvas
              fixtures={fixtures}
              shapes={shapes}
              persons={persons}
              stageElements={stageElements}
              trusses={trusses}
              floorPlan={floorPlan}
              snapStep={snapStep}
              activeTool={activeTool}
              fixtureToPlace={fixtureToPlace}
              selectedIds={selectedIds}
              showHeatMap={showHeatMap}
              heatMapScale={heatMapScale}
              heatMapTarget={heatMapTarget}
              onPlaceFixture={handlePlaceFixture}
              onMoveFixture={handleMoveFixture}
              onSelect={handleSelectWithGroups}
              onSelectMany={handleSelectMany}
              onAddShape={handleAddShape}
              onAddPerson={handleAddPerson}
              onAddStageElement={handleAddStageElement}
              onMovePerson={handleMovePerson}
              onMoveStageElement={handleMoveStageElement}
              onAddTruss={handleAddTruss}
              onMoveTruss={handleMoveTruss}
              onCursorLux={setCursorLux}
              onToolChange={handleToolChange}
              onDropFixture={handleDropFixture}
              onMoveAim={handleMoveAim}
              planMode={planMode}
              onUpdateFloorPlan={handleUpdateFloorPlan}
              onCalibrateSegment={handleCalibrateSegment}
            />
          ) : (
            <Suspense fallback={<div className="loading-3d">3D-Ansicht wird geladen…</div>}>
              <Scene3D
                ref={scene3DRef}
                fixtures={fixtures}
                persons={persons}
                stageElements={stageElements}
                trusses={trusses}
                floorPlan={floorPlan}
                selectedIds={selectedIds}
                showHeatMap={showHeatMap}
                heatMapScale={heatMapScale}
                heatMapTarget={heatMapTarget}
                onSelect={handleSelectWithGroups}
              />
            </Suspense>
          )}
          {cursorLux !== null && viewMode === '2d' && (
            <div className="cursor-lux-display">{Math.round(cursorLux)} lx</div>
          )}
          {fixtureToPlace && viewMode === '2d' && (
            <div className="placing-hint">
              Klicke auf den Plan um <strong>{fixtureToPlace.name}</strong> zu platzieren · ESC zum Abbrechen
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
          selectedIds={selectedIds}
          cursorLux={cursorLux}
          patchConflicts={patchConflicts}
          onUpdateFixture={handleUpdateFixture}
          onUpdatePerson={handleUpdatePerson}
          onUpdateStageElement={handleUpdateStageElement}
          onUpdateTruss={handleUpdateTruss}
          onDelete={handleDelete}
          onAutoThreePointForPerson={handleAutoThreePointForPerson}
        />
      </div>
      {showThreePointDialog && (
        <ThreePointDialog
          targetLux={heatMapTarget}
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
      {scheduleOpen && (
        <ScheduleDialog
          fixtures={fixtures}
          trussCount={trusses.length}
          conflicts={patchConflicts}
          onAutoNumber={handleAutoNumber}
          onAutoPatch={handleAutoPatch}
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
        />
      )}
    </div>
  );
};

export default App;
