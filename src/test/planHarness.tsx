// Headless harness for the 2D PlanCanvas focus-note overlay. Mounts the canvas
// with a few fixtures carrying focus notes / done flags and the overlay on, so
// the focus-chart tags can be screenshot. All editing callbacks are no-ops.
import React from 'react';
import { createRoot } from 'react-dom/client';
import PlanCanvas from '../components/PlanCanvas';
import { fixtureLibrary } from '../core/fixtureLibrary';
import type { PlacedFixture, Layers } from '../types';
import '../App.css';

const fx = fixtureLibrary[0];
const mk = (id: string, x: number, y: number, o: Partial<PlacedFixture> = {}): PlacedFixture => ({
  id, fixture: fx, x, y, mountingHeight: 6, aimX: x, aimY: y + 4, bodyRotation: 0, dimming: 100, channel: 0, ...o,
});
const fixtures: PlacedFixture[] = [
  mk('f1', 4, 4, { channel: 1, purpose: 'Frontlicht', focused: true, focusNote: 'Gesicht Solist, harte Kante' }),
  mk('f2', 8, 4, { channel: 2, purpose: 'Frontlicht', focusNote: 'Bühnenmitte weich' }),
  mk('f3', 12, 4, { channel: 3, focused: true }),
];
const layers = (['fixtures', 'persons', 'trusses', 'stage', 'shapes', 'ceilings', 'walls', 'floorPlan'] as const)
  .reduce((a, k) => { a[k] = { visible: true, locked: false }; return a; }, {} as Layers);

const noop = () => {};
createRoot(document.getElementById('root')!).render(
  <PlanCanvas
    fixtures={fixtures} shapes={[]} persons={[]} stageElements={[]} trusses={[]} walls={[]} ceilings={[]} sun={null}
    floorPlan={null} layers={layers} snapStep={0} activeTool="select" fixtureToPlace={null}
    selectedIds={new Set()} showHeatMap={false} heatMapScale={1000} heatMapTarget={0} showFocusNotes
    planMode="none" cameras={[]}
    onPlaceFixture={noop} onMoveFixture={noop} onSelect={noop} onSelectMany={noop} onMoveShape={noop}
    onAddShape={noop} onAddPerson={noop} onAddStageElement={noop} onMovePerson={noop} onMoveStageElement={noop}
    onUpdateStageElement={noop} onAddStagePolygon={noop} onAddCamera={noop} onMoveCamera={noop}
    onMoveCameraAim={noop} onAddTruss={noop} onMoveTruss={noop} onAddWall={noop} onMoveWall={noop}
    onUpdateWall={noop} onCursorLux={noop} onToolChange={noop} onDropFixture={noop} onMoveAim={noop}
    onUpdateFloorPlan={noop} onCalibrateSegment={noop}
  />,
);
