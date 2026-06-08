// Headless harness for the Versionen & Vergleich dialog: seeds one saved
// version, then mounts the dialog against a modified "current" document so the
// added / removed / changed diff renders. Served at /version-harness.html.
import React from 'react';
import { createRoot } from 'react-dom/client';
import VersionDialog from '../components/VersionDialog';
import { fixtureLibrary } from '../core/fixtureLibrary';
import { autoPatch } from '../core/patch';
import { saveVersion } from '../utils/versionStore';
import type { ProjectData, PlacedFixture } from '../types';
import '../App.css';

const fix = (i: number) => fixtureLibrary[i % fixtureLibrary.length];
const mk = (id: string, o: Partial<PlacedFixture> = {}): PlacedFixture => ({
  id, fixture: fix(0), x: 3, y: 2, mountingHeight: 6, aimX: 5, aimY: 6, bodyRotation: 0, dimming: 100, ...o,
});
const meta = { name: 'Demo-Show', author: '', version: '1.0', createdAt: '', updatedAt: '' };
const doc = (fx: PlacedFixture[]): ProjectData => ({
  meta, fixtures: fx, shapes: [], persons: [], stageElements: [], customFixtures: [],
  trusses: [{ id: 't1', x1: 1, y1: 2, x2: 9, y2: 2, height: 6, label: 'FOH' }],
});

// Saved snapshot ("Stand Probe 1").
const old = autoPatch(doc([
  mk('f1', { x: 3, purpose: 'Frontlicht' }),
  mk('f2', { x: 6, dimming: 100 }),
  mk('f3', { x: 9, purpose: 'Gegenlicht' }),
]).fixtures!.map((f) => f), { startUniverse: 1, startAddress: 1, number: true, patch: true });
const oldDoc = doc(old);

// Current state: f2 moved + dimmed + gelled, f3 removed, f4 added.
const current = doc([
  oldDoc.fixtures[0],
  { ...oldDoc.fixtures[1], x: 5, dimming: 55, gelFilterIds: ['lee-205'], focused: true, focusNote: 'Solist' },
  mk('f4', { x: 8, channel: 9, purpose: 'Effekt' }),
]);

try { localStorage.removeItem('lp-versions'); } catch { /* ignore */ }
saveVersion('demo', 'Stand Probe 1', oldDoc);

createRoot(document.getElementById('root')!).render(
  <VersionDialog projectId="demo" projectName="Demo-Show" currentDoc={current}
    onRestore={() => {}} onClose={() => {}} />,
);
