// Headless render harness for Scene3D — mounts the 3D view in isolation with a
// representative scene so a puppeteer script can screenshot the photo/heatmap
// modes and we can verify (and tune) the actual pixels. Not part of the app
// build; served only by the dev server at /scene-harness.html.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Scene3D from '../components/Scene3D';
import type { Scene3DHandle } from '../components/Scene3D';
import { fixtureLibrary } from '../core/fixtureLibrary';
import type {
  PlacedFixture, Person, StageElement, Truss, Wall, Ceiling, Layers, CameraView, FloorMaterial, FloorPresetId, WallPresetId,
} from '../types';

const lib = (id: string) => fixtureLibrary.find((f) => f.id === id) ?? fixtureLibrary[0];

const fx = (id: string, over: Partial<PlacedFixture>): PlacedFixture => ({
  id: `f-${id}-${over.x ?? 0}-${over.y ?? 0}`,
  fixture: lib(id),
  x: 5, y: 1, mountingHeight: 6, aimX: 5, aimY: 6,
  bodyRotation: 0, dimming: 100,
  ...over,
});

const allLayers: Layers = (
  ['fixtures', 'persons', 'trusses', 'stage', 'shapes', 'ceilings', 'walls', 'floorPlan'] as const
).reduce((acc, k) => { acc[k] = { visible: true, locked: false }; return acc; }, {} as Layers);

// Two profile spots on an overhead truss lighting two people (one standing on
// the floor, one sitting on a low podium), with a reflective back wall.
const fixtures: PlacedFixture[] = [
  fx('etc-s4-19', { x: 3, y: 1.5, mountingHeight: 6, aimX: 5, aimY: 6, currentColorTemp: 5600 }),
  fx('etc-s4-19', { x: 8, y: 1.5, mountingHeight: 6, aimX: 7.4, aimY: 6.6, currentColorTemp: 3000 }),
];
const persons: Person[] = [
  { id: 'p1', x: 5, y: 6, height: 1.80, label: 'A', pose: 'standing', facing: 270 },
  { id: 'p2', x: 7.4, y: 6.6, height: 1.72, label: 'B', pose: 'sitting', facing: 270 },
];
const stageElements: StageElement[] = [
  { id: 's1', type: 'custom', x: 6.6, y: 5.8, width: 1.6, depth: 1.6, height: 0.4, rotation: 0, label: 'Podest' },
];
const trusses: Truss[] = [
  { id: 't1', x1: 1, y1: 1.5, x2: 10, y2: 1.5, height: 6, label: 'FOH' },
];
const walls: Wall[] = [
  { id: 'w1', x1: 1, y1: 9, x2: 10, y2: 9, height: 3, reflectance: 0.55, color: '#c9b79a', material: 'woodchip', label: 'Rückwand' },
];
const ceilings: Ceiling[] = [];
const cameras: CameraView[] = [];

function Harness() {
  const ref = useRef<Scene3DHandle>(null);
  const [photoMode, setPhoto] = useState(false);
  const [showHeatMap, setHeat] = useState(false);
  const [exposure, setExposure] = useState(1.3);
  const [haze, setHaze] = useState(0.3);
  const [showBeams, setBeams] = useState(true);
  const [ambience, setAmb] = useState(0.55);
  const [floor, setFloor] = useState<FloorMaterial>({ preset: 'parquet', color: '#8a5a2f' });

  useEffect(() => {
    const api = {
      setMode: (m: { photo?: boolean; heatmap?: boolean; exposure?: number; haze?: number; beams?: boolean; ambience?: number; floor?: FloorPresetId; floorColor?: string }) => {
        if ('photo' in m) setPhoto(!!m.photo);
        if ('heatmap' in m) setHeat(!!m.heatmap);
        if (typeof m.exposure === 'number') setExposure(m.exposure);
        if (typeof m.haze === 'number') setHaze(m.haze);
        if (typeof m.beams === 'boolean') setBeams(m.beams);
        if (typeof m.ambience === 'number') setAmb(m.ambience);
        if (m.floor || m.floorColor) setFloor((f) => ({ preset: m.floor ?? f.preset, color: m.floorColor ?? f.color }));
      },
      setWallMaterial: (mat: WallPresetId) => { walls[0].material = mat; },
      // Point the camera in front of the people, looking at their faces.
      look: () => ref.current?.lookThroughCamera({ x: 6, y: 0.2, height: 1.55, aimX: 6, aimY: 6.3, fov: 52 }),
      lookAt: (c: { x: number; y: number; height: number; aimX: number; aimY: number; fov: number }) => ref.current?.lookThroughCamera(c),
      shot: () => ref.current?.screenshot() ?? null,
    };
    (window as Window & typeof globalThis & { __lp?: typeof api }).__lp = api;
    (window as Window & typeof globalThis & { __lpReady?: boolean }).__lpReady = true;
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100%' }}>
      <Scene3D
        ref={ref}
        fixtures={fixtures}
        persons={persons}
        stageElements={stageElements}
        trusses={trusses}
        walls={walls}
        ceilings={ceilings}
        sun={null}
        floorPlan={null}
        layers={allLayers}
        cameras={cameras}
        selectedIds={new Set<string>()}
        showHeatMap={showHeatMap}
        heatMapScale={0}
        heatMapTarget={0}
        photoMode={photoMode}
        exposure={exposure}
        haze={haze}
        showBeams={showBeams}
        ambience={ambience}
        floor={floor}
        onSelect={() => {}}
        onHoverLux={(lx) => { (window as Window & typeof globalThis & { __lpLux?: number | null }).__lpLux = lx; }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
