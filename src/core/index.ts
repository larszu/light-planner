// ───────────────────────────────────────────────────────────────────────────
// Lighting Core — the UI-free heart of the planner.
//
// Pure TypeScript: photometric maths, geometry, auto-lighting, colour, DMX
// patch and the fixture/gel libraries. No React, no zustand, no DOM rendering
// (a couple of types reference DOM globals like HTMLImageElement, but nothing
// here touches the DOM at runtime). A host application (e.g. Cable-Planner) can
// depend on this surface alone and bring its own UI/state/persistence.
//
// Import everything through this barrel: `import { ... } from '../core'`.
// ───────────────────────────────────────────────────────────────────────────

export * from '../types';
export * from './geometry';
export * from './lightCalc';
export * from './autoLighting';
export * from './colorTemp';
export * from './patch';
export * from './gelLibrary';
export * from './fixtureLibrary';
