// Headless harness for the print-ready plot. Renders PlanCanvas with a small
// rig, captures its draw scale, then composes the plot (plan + scale bar +
// legend + title block) and shows the result for screenshotting.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PlanCanvas from '../components/PlanCanvas';
import { composePlot } from '../utils/plotExport';
import { fixtureLibrary } from '../core/fixtureLibrary';
import type { PlacedFixture, Layers, Truss, StageElement } from '../types';
import '../App.css';

const profile = fixtureLibrary.find((f) => f.category === 'profile') ?? fixtureLibrary[0];
const par = fixtureLibrary.find((f) => f.category === 'par') ?? fixtureLibrary[1] ?? fixtureLibrary[0];
const mk = (id: string, fx: typeof fixtureLibrary[number], x: number, y: number, o: Partial<PlacedFixture> = {}): PlacedFixture => ({
  id, fixture: fx, x, y, mountingHeight: 6, aimX: x, aimY: y + 3, bodyRotation: 0, dimming: 100, ...o,
});
const fixtures: PlacedFixture[] = [
  mk('f1', profile, 3, 3, { channel: 1 }), mk('f2', profile, 6, 3, { channel: 2 }),
  mk('f3', profile, 9, 3, { channel: 3 }), mk('f4', par, 4, 7, { channel: 4 }),
  mk('f5', par, 7, 7, { channel: 5 }), mk('f6', par, 10, 7, { channel: 6 }),
];
const trusses: Truss[] = [{ id: 't1', x1: 2, y1: 3, x2: 11, y2: 3, height: 6, label: 'FOH' }];
const stage: StageElement[] = [{ id: 's1', type: 'custom', x: 4, y: 5, width: 5, depth: 3, height: 0.6, rotation: 0, label: 'Bühne' }];
const layers = (['fixtures', 'persons', 'trusses', 'stage', 'shapes', 'ceilings', 'walls', 'floorPlan'] as const)
  .reduce((a, k) => { a[k] = { visible: true, locked: false }; return a; }, {} as Layers);
const noop = () => {};

function Harness() {
  const pxRef = useRef(40);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const c = document.querySelector('.plan-canvas') as HTMLCanvasElement | null;
      if (c) {
        const out = composePlot(c, pxRef.current, fixtures, { projectName: 'Demo-Show', author: 'L. Z.' });
        setUrl(out.toDataURL('image/png'));
        (window as Window & { __plotReady?: boolean }).__plotReady = true;
      }
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  if (url) return <img src={url} style={{ width: '100%', display: 'block' }} alt="plot" />;
  return (
    <div style={{ width: 1100, height: 560 }}>
      <PlanCanvas
        fixtures={fixtures} shapes={[]} persons={[]} stageElements={stage} trusses={trusses} walls={[]} ceilings={[]} sun={null}
        floorPlan={null} layers={layers} snapStep={0} activeTool="select" fixtureToPlace={null}
        selectedIds={new Set()} showHeatMap={false} heatMapScale={1000} heatMapTarget={0} showFocusNotes={false}
        planMode="none" cameras={[]} onViewChange={(s) => { pxRef.current = s; }}
        onPlaceFixture={noop} onMoveFixture={noop} onSelect={noop} onSelectMany={noop} onMoveShape={noop}
        onAddShape={noop} onAddPerson={noop} onAddStageElement={noop} onMovePerson={noop} onMoveStageElement={noop}
        onUpdateStageElement={noop} onAddStagePolygon={noop} onAddCamera={noop} onMoveCamera={noop}
        onMoveCameraAim={noop} onAddTruss={noop} onMoveTruss={noop} onAddWall={noop} onMoveWall={noop}
        onUpdateWall={noop} onCursorLux={noop} onToolChange={noop} onDropFixture={noop} onMoveAim={noop}
        onUpdateFloorPlan={noop} onCalibrateSegment={noop}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
