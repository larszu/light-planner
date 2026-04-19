import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import type { PlacedFixture, Shape, Tool, Fixture, FloorPlan, ViewMode, Person, StageElement, ProjectMeta, ProjectData } from './types';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import PlanCanvas from './components/PlanCanvas';
import PropertyPanel from './components/PropertyPanel';
import ThreePointDialog from './components/ThreePointDialog';
import ProjectDialog, { saveProjectToStorage, deleteProjectFromStorage } from './components/ProjectDialog';
import { generate3PointLighting, generateEvenDistribution } from './utils/autoLighting';
import './App.css';

const Scene3D = lazy(() => import('./components/Scene3D'));

let nextId = 1;
function uid(prefix: string) { return `${prefix}-${Date.now()}-${nextId++}`; }

const App: React.FC = () => {
  const [fixtures, setFixtures] = useState<PlacedFixture[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [stageElements, setStageElements] = useState<StageElement[]>([]);
  const [customFixtures, setCustomFixtures] = useState<Fixture[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const defaultMountingHeight = 6;

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
    const placed = createPlacedFixture(fixture, x, y);
    setFixtures((prev) => [...prev, placed]);
    setSelectedId(placed.id);
  }, [createPlacedFixture]);

  const handleDropFixture = useCallback((fixture: Fixture, x: number, y: number) => {
    const placed = createPlacedFixture(fixture, x, y);
    setFixtures((prev) => [...prev, placed]);
    setSelectedId(placed.id);
    setFixtureToPlace(null);
  }, [createPlacedFixture]);

  const handleMoveFixture = useCallback((id: string, x: number, y: number) => {
    setFixtures((prev) => prev.map((f) => {
      if (f.id !== id) return f;
      const dx = x - f.x, dy = y - f.y;
      return { ...f, x, y, aimX: f.aimX + dx, aimY: f.aimY + dy };
    }));
  }, []);

  const handleUpdateFixture = useCallback((id: string, updates: Partial<PlacedFixture>) => {
    setFixtures((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const handleMoveAim = useCallback((id: string, aimX: number, aimY: number) => {
    setFixtures((prev) => prev.map((f) => (f.id === id ? { ...f, aimX, aimY } : f)));
  }, []);

  // ── Person handlers ──
  const handleAddPerson = useCallback((x: number, y: number) => {
    const p: Person = { id: uid('per'), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, height: 1.75, label: '' };
    setPersons((prev) => [...prev, p]);
    setSelectedId(p.id);
  }, []);

  const handleMovePerson = useCallback((id: string, x: number, y: number) => {
    setPersons((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
  }, []);

  const handleUpdatePerson = useCallback((id: string, updates: Partial<Person>) => {
    setPersons((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }, []);

  // ── Stage element handlers ──
  const handleAddStageElement = useCallback((x: number, y: number) => {
    const se: StageElement = {
      id: uid('stg'), type: 'podest-1x1',
      x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
      width: 1, depth: 1, height: 0.4, rotation: 0, label: '',
    };
    setStageElements((prev) => [...prev, se]);
    setSelectedId(se.id);
  }, []);

  const handleMoveStageElement = useCallback((id: string, x: number, y: number) => {
    setStageElements((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)));
  }, []);

  const handleUpdateStageElement = useCallback((id: string, updates: Partial<StageElement>) => {
    setStageElements((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  // ── Delete any element ──
  const handleDelete = useCallback((id: string) => {
    setFixtures((prev) => prev.filter((f) => f.id !== id));
    setPersons((prev) => prev.filter((p) => p.id !== id));
    setStageElements((prev) => prev.filter((s) => s.id !== id));
    setShapes((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  useEffect(() => {
    const handler = (e: Event) => handleDelete((e as CustomEvent).detail);
    window.addEventListener('lp-delete', handler);
    return () => window.removeEventListener('lp-delete', handler);
  }, [handleDelete]);

  // ── Auto-lighting ──
  const handleAutoThreePoint = useCallback(() => {
    const targetPersons = selectedId ? persons.filter((p) => p.id === selectedId) : persons;
    if (targetPersons.length === 0) return;
    const newFixtures = targetPersons.flatMap((p) => generate3PointLighting(p, defaultMountingHeight));
    setFixtures((prev) => [...prev, ...newFixtures]);
  }, [persons, selectedId, defaultMountingHeight]);

  const handleAutoThreePointForPerson = useCallback((personId: string) => {
    const person = persons.find((p) => p.id === personId);
    if (!person) return;
    const newFixtures = generate3PointLighting(person, defaultMountingHeight);
    setFixtures((prev) => [...prev, ...newFixtures]);
  }, [persons, defaultMountingHeight]);

  const handleAutoThreePointConfigured = useCallback((keyF: Fixture, fillF: Fixture, backF: Fixture, keyDim: number, fillDim: number, backDim: number) => {
    const targetPersons = selectedId ? persons.filter((p) => p.id === selectedId) : persons;
    if (targetPersons.length === 0) return;
    const newFixtures = targetPersons.flatMap((p) =>
      generate3PointLighting(p, defaultMountingHeight, keyF, fillF, backF, keyDim, fillDim, backDim),
    );
    setFixtures((prev) => [...prev, ...newFixtures]);
    setShowThreePointDialog(false);
  }, [persons, selectedId, defaultMountingHeight]);

  const handleAutoDistribute = useCallback(() => {
    if (persons.length === 0) return;
    const newFixtures = generateEvenDistribution(persons, defaultMountingHeight);
    setFixtures((prev) => [...prev, ...newFixtures]);
  }, [persons, defaultMountingHeight]);

  // ── Auto-align / distribute ──
  const handleAlignH = useCallback(() => {
    // Align fixtures to same Y as selected fixture (or average)
    const selF = fixtures.find((f) => f.id === selectedId);
    const selSe = stageElements.find((s) => s.id === selectedId);
    if (selF) {
      const targetY = selF.y;
      setFixtures((prev) => prev.map((f) => ({ ...f, y: targetY, aimY: f.aimY + (targetY - f.y) })));
    } else if (selSe) {
      const targetY = selSe.y;
      setStageElements((prev) => prev.map((s) => ({ ...s, y: targetY })));
    }
  }, [fixtures, stageElements, selectedId]);

  const handleAlignV = useCallback(() => {
    const selF = fixtures.find((f) => f.id === selectedId);
    const selSe = stageElements.find((s) => s.id === selectedId);
    if (selF) {
      const targetX = selF.x;
      setFixtures((prev) => prev.map((f) => ({ ...f, x: targetX, aimX: f.aimX + (targetX - f.x) })));
    } else if (selSe) {
      const targetX = selSe.x;
      setStageElements((prev) => prev.map((s) => ({ ...s, x: targetX })));
    }
  }, [fixtures, stageElements, selectedId]);

  const handleDistributeH = useCallback(() => {
    if (fixtures.length < 2 && stageElements.length < 2) return;
    if (fixtures.length >= 2) {
      const sorted = [...fixtures].sort((a, b) => a.x - b.x);
      const minX = sorted[0].x, maxX = sorted[sorted.length - 1].x;
      const step = (maxX - minX) / (sorted.length - 1);
      const idMap = new Map(sorted.map((f, i) => [f.id, minX + i * step]));
      setFixtures((prev) => prev.map((f) => {
        const newX = idMap.get(f.id);
        return newX !== undefined ? { ...f, x: Math.round(newX * 10) / 10, aimX: f.aimX + (Math.round(newX * 10) / 10 - f.x) } : f;
      }));
    } else {
      const sorted = [...stageElements].sort((a, b) => a.x - b.x);
      const minX = sorted[0].x, maxX = sorted[sorted.length - 1].x;
      const step = (maxX - minX) / (sorted.length - 1);
      const idMap = new Map(sorted.map((s, i) => [s.id, minX + i * step]));
      setStageElements((prev) => prev.map((s) => {
        const newX = idMap.get(s.id);
        return newX !== undefined ? { ...s, x: Math.round(newX * 10) / 10 } : s;
      }));
    }
  }, [fixtures, stageElements]);

  const handleDistributeV = useCallback(() => {
    if (fixtures.length < 2 && stageElements.length < 2) return;
    if (fixtures.length >= 2) {
      const sorted = [...fixtures].sort((a, b) => a.y - b.y);
      const minY = sorted[0].y, maxY = sorted[sorted.length - 1].y;
      const step = (maxY - minY) / (sorted.length - 1);
      const idMap = new Map(sorted.map((f, i) => [f.id, minY + i * step]));
      setFixtures((prev) => prev.map((f) => {
        const newY = idMap.get(f.id);
        return newY !== undefined ? { ...f, y: Math.round(newY * 10) / 10, aimY: f.aimY + (Math.round(newY * 10) / 10 - f.y) } : f;
      }));
    } else {
      const sorted = [...stageElements].sort((a, b) => a.y - b.y);
      const minY = sorted[0].y, maxY = sorted[sorted.length - 1].y;
      const step = (maxY - minY) / (sorted.length - 1);
      const idMap = new Map(sorted.map((s, i) => [s.id, minY + i * step]));
      setStageElements((prev) => prev.map((s) => {
        const newY = idMap.get(s.id);
        return newY !== undefined ? { ...s, y: Math.round(newY * 10) / 10 } : s;
      }));
    }
  }, [fixtures, stageElements]);

  // ── Project save/load ──
  const handleSaveProject = useCallback((meta: ProjectMeta) => {
    const data: ProjectData = {
      meta,
      fixtures,
      shapes,
      persons,
      stageElements,
      customFixtures,
    };
    saveProjectToStorage(projectId, meta, data);
    setProjectMeta(meta);
    setProjectDialogMode(null);
  }, [fixtures, shapes, persons, stageElements, customFixtures, projectId]);

  const handleLoadProject = useCallback((data: ProjectData) => {
    setFixtures(data.fixtures);
    setShapes(data.shapes);
    setPersons(data.persons);
    setStageElements(data.stageElements);
    setCustomFixtures(data.customFixtures);
    setProjectMeta(data.meta);
    const newId = 'proj-' + Date.now();
    setProjectId(newId);
    setSelectedId(null);
    setProjectDialogMode(null);
  }, []);

  const handleDeleteProject = useCallback((id: string) => {
    deleteProjectFromStorage(id);
  }, []);

  // ── Floor plan ──
  const handleUploadFloorPlan = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const widthMeters = 20;
        const heightMeters = (img.height / img.width) * widthMeters;
        setFloorPlan({ image: img, widthMeters, heightMeters });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleExport = useCallback(() => {
    const canvas = document.querySelector('.plan-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'lichtplan.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const handleAddShape = useCallback((shape: Shape) => { setShapes((prev) => [...prev, shape]); }, []);
  const handleAddCustomFixture = useCallback((f: Fixture) => { setCustomFixtures((prev) => [...prev, f]); }, []);

  return (
    <div className="app">
      <Toolbar
        activeTool={activeTool}
        viewMode={viewMode}
        showHeatMap={showHeatMap}
        heatMapScale={heatMapScale}
        onToolChange={setActiveTool}
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
        onAlignH={handleAlignH}
        onAlignV={handleAlignV}
        onDistributeH={handleDistributeH}
        onDistributeV={handleDistributeV}
        onSaveProject={() => setProjectDialogMode('save')}
        onLoadProject={() => setProjectDialogMode('load')}
        hasPersons={persons.length > 0}
        hasSelection={!!selectedId}
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
              floorPlan={floorPlan}
              activeTool={activeTool}
              fixtureToPlace={fixtureToPlace}
              selectedId={selectedId}
              showHeatMap={showHeatMap}
              heatMapScale={heatMapScale}
              heatMapTarget={heatMapTarget}
              onPlaceFixture={handlePlaceFixture}
              onMoveFixture={handleMoveFixture}
              onSelect={setSelectedId}
              onAddShape={handleAddShape}
              onAddPerson={handleAddPerson}
              onAddStageElement={handleAddStageElement}
              onMovePerson={handleMovePerson}
              onMoveStageElement={handleMoveStageElement}
              onCursorLux={setCursorLux}
              onToolChange={setActiveTool}
              onDropFixture={handleDropFixture}
              onMoveAim={handleMoveAim}
            />
          ) : (
            <Suspense fallback={<div className="loading-3d">3D-Ansicht wird geladen…</div>}>
              <Scene3D
                fixtures={fixtures}
                persons={persons}
                stageElements={stageElements}
                selectedId={selectedId}
                showHeatMap={showHeatMap}
                heatMapScale={heatMapScale}
                heatMapTarget={heatMapTarget}
                onSelect={setSelectedId}
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
        </div>
        <PropertyPanel
          fixtures={fixtures}
          persons={persons}
          stageElements={stageElements}
          selectedId={selectedId}
          cursorLux={cursorLux}
          onUpdateFixture={handleUpdateFixture}
          onUpdatePerson={handleUpdatePerson}
          onUpdateStageElement={handleUpdateStageElement}
          onDelete={handleDelete}
          onAutoThreePointForPerson={handleAutoThreePointForPerson}
        />
      </div>
      {showThreePointDialog && (
        <ThreePointDialog
          onGenerate={handleAutoThreePointConfigured}
          onCancel={() => setShowThreePointDialog(false)}
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
