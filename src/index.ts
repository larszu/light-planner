// Package entry — what a host (Cable-Planner) imports to embed the planner.
//   import LightPlanner, { createCablePlannerHost, fixturesToEquipment } from 'light-planner'
export { default as LightPlanner } from './LightPlanner';
export type { LightPlannerProps } from './LightPlanner';

// Integration seam (Fixture↔Equipment mapping, HostAdapter, cable-planner host).
export * from './integration';

// Serializable document + stores.
export * from './store/lightingDocument';
export { useProjectStore } from './store/projectStore';
export { useUiStore } from './store/uiStore';

// UI-free engine + shared types.
export * from './core';
