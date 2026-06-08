// Headless harness for the Verlauf & Änderungen dialog: crafted activity log,
// undo/redo timeline and a seeded saved version so all three tabs render.
import React from 'react';
import { createRoot } from 'react-dom/client';
import ChangesDialog from '../components/ChangesDialog';
import { fixtureLibrary } from '../core/fixtureLibrary';
import { saveVersion } from '../utils/versionStore';
import type { ProjectData, PlacedFixture } from '../types';
import '../App.css';

const mk = (id: string, o: Partial<PlacedFixture> = {}): PlacedFixture => ({
  id, fixture: fixtureLibrary[0], x: 3, y: 2, mountingHeight: 6, aimX: 5, aimY: 6, bodyRotation: 0, dimming: 100, ...o,
});
const meta = { name: 'Demo-Show', author: '', version: '1.0', createdAt: '', updatedAt: '' };
const doc = (fx: PlacedFixture[]): ProjectData => ({ meta, fixtures: fx, shapes: [], persons: [], stageElements: [], customFixtures: [] });

const oldDoc = doc([mk('f1', { channel: 1 }), mk('f2', { channel: 2 }), mk('f3', { channel: 3 })]);
const currentDoc = doc([
  mk('f1', { channel: 1 }),
  mk('f2', { channel: 2, x: 6, dimming: 60, gelFilterIds: ['lee-205'] }),
  mk('f4', { channel: 9, purpose: 'Effekt' }),
]);
try { localStorage.removeItem('lp-versions'); } catch { /* ignore */ }
saveVersion('demo', 'Stand Probe 1', oldDoc);

const now = Date.now();
const log = [
  { time: now - 540000, label: 'Projekt geladen: Demo-Show' },
  { time: now - 480000, label: '+3 Leuchten' },
  { time: now - 300000, label: 'Leuchte verschoben' },
  { time: now - 90000, label: '+1 Wand' },
  { time: now - 30000, label: '↶ Rückgängig: +1 Wand' },
  { time: now - 8000, label: 'Leuchte geändert' },
];
const undoSteps = [
  { count: 1, label: 'Leuchte geändert' },
  { count: 2, label: 'Leuchte verschoben' },
  { count: 3, label: '+3 Leuchten' },
];
const redoSteps = [{ count: 1, label: '+1 Wand' }];

createRoot(document.getElementById('root')!).render(
  <ChangesDialog log={log} undoSteps={undoSteps} redoSteps={redoSteps} currentDoc={currentDoc}
    projectId="demo" projectName="Demo-Show" onJump={() => {}} onSaveVersion={() => {}} onClose={() => {}} />,
);
