// Headless harness for the Geräteliste / Analyse dialog — mounts ScheduleDialog
// with a representative rig (two trusses incl. an overloaded one, a DMX conflict
// and a duplicate channel) so the rig-check, photometrics, load and MVR UI can
// be screenshot reliably. Served at /schedule-harness.html.
import React from 'react';
import { createRoot } from 'react-dom/client';
import ScheduleDialog from '../components/ScheduleDialog';
import { fixtureLibrary } from '../core/fixtureLibrary';
import { autoPatch, findPatchConflicts } from '../core/patch';
import type { PlacedFixture, Truss, Wall } from '../types';
import '../App.css';

const lib = (pred: (f: typeof fixtureLibrary[number]) => boolean) => fixtureLibrary.find(pred) ?? fixtureLibrary[0];
const mover = lib((f) => (f.dmxChannels ?? 0) > 0 && (f.wattage ?? 0) > 100);
const conv = lib((f) => (f.wattage ?? 0) > 0 && (f.dmxChannels ?? 0) === 0) ?? mover;

const mk = (id: string, fix: typeof fixtureLibrary[number], x: number, y: number, over: Partial<PlacedFixture> = {}): PlacedFixture => ({
  id, fixture: fix, x, y, mountingHeight: 6, aimX: x, aimY: 6, bodyRotation: 0, dimming: 100, ...over,
});

const trusses: Truss[] = [
  { id: 't1', x1: 1, y1: 2, x2: 11, y2: 2, height: 6, capacity: 200, label: 'FOH' },
  { id: 't2', x1: 1, y1: 9, x2: 11, y2: 9, height: 5, capacity: 25, label: 'Back (Überlast)' },
];
let initial: PlacedFixture[] = [
  mk('f1', mover, 3, 2, { aimX: 4, aimY: 6, purpose: 'Frontlicht', gelFilterIds: ['lee-205'], focused: true, focusNote: 'Gesicht Solist, harte Kante' }),
  mk('f2', mover, 6, 2, { aimX: 6, aimY: 6, purpose: 'Frontlicht', gelFilterIds: ['lee-205'] }),
  mk('f3', mover, 9, 2, { aimX: 8, aimY: 6, purpose: 'Frontlicht' }),
  mk('f4', conv, 3, 9, { aimX: 4, aimY: 6, purpose: 'Gegenlicht', gelFilterIds: ['lee-201'], focusNote: 'Kante Bühnenrand' }),
  mk('f5', conv, 6, 9, { aimX: 6, aimY: 6, purpose: 'Gegenlicht', gelFilterIds: ['lee-201'] }),
  mk('f6', conv, 9, 9, { aimX: 8, aimY: 6, purpose: 'Gegenlicht' }),
  mk('f7', conv, 5, 0.5, { mountingHeight: 1.6, aimX: 5, aimY: 6, purpose: 'Effekt' }), // floor stand
];
initial = autoPatch(initial, { startUniverse: 1, startAddress: 1, number: true, patch: true });
// Force a DMX overlap + duplicate channel to exercise the rig check.
initial = initial.map((f) => f.id === 'f2'
  ? { ...f, universe: initial[0].universe, dmxAddress: initial[0].dmxAddress, channel: initial[0].channel }
  : f);

const walls: Wall[] = [
  { id: 'w1', x1: 1, y1: 11, x2: 11, y2: 11, height: 4, reflectance: 0.5, color: '#cfd2d6', material: 'plaster', label: 'Rückwand' },
];

function Harness() {
  const [fixtures, setFixtures] = React.useState<PlacedFixture[]>(initial);
  return (
    <ScheduleDialog
      fixtures={fixtures}
      trusses={trusses}
      walls={walls}
      ceilings={[]}
      area={{ minX: 2, minY: 4, maxX: 10, maxY: 8 }}
      projectName="Demo-Show"
      conflicts={findPatchConflicts(fixtures)}
      onAutoNumber={() => {}}
      onAutoPatch={() => {}}
      onLocate={(ids) => { (window as Window & { __located?: string[] }).__located = ids; }}
      onUpdateFixture={(id, updates) => setFixtures((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))}
      onClose={() => {}}
    />
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
