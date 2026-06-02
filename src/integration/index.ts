// Integration surface for embedding the lighting planner into a host app
// (e.g. Cable-Planner): the Fixture↔Equipment mapping and the HostAdapter seam.
export * from './equipment';
export * from './hostAdapter';
export { browserHost } from './browserHost';
export { createCablePlannerHost } from './cablePlannerHost';
export type { CablePlannerHostDeps } from './cablePlannerHost';
export { HostProvider, useHost } from './hostContext';
