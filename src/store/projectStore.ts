import { create } from 'zustand';
import type { ProjectMeta } from '../core';
import type { LightingDocument } from './lightingDocument';

// The live lighting document, published as a zustand store so a host
// (Cable-Planner) can read/subscribe to the current plan — e.g. to pull the
// fixtures as equipment (see integration/equipment.ts) or save it into its own
// project. The standalone App publishes its state here on every change; making
// this store the single source of truth (moving the editor mutations in as
// actions/slices) is the remaining mechanical step for full host integration.
interface ProjectState {
  document: LightingDocument | null;
  meta: ProjectMeta | null;
  setDocument: (document: LightingDocument, meta?: ProjectMeta | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  document: null,
  meta: null,
  setDocument: (document, meta = null) => set({ document, meta }),
}));
