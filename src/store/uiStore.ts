import { create } from 'zustand';
import type { ViewMode } from '../core';

// View / display settings (zustand) — the self-contained UI state that a host
// like Cable-Planner keeps in its own uiStore. Document state (fixtures, walls,
// …) lives in the project, published via projectStore.
interface UiState {
  viewMode: ViewMode;
  showHeatMap: boolean;
  heatMapScale: number;
  heatMapTarget: number;
  photoMode: boolean;
  exposure: number;
  haze: number;
  snapStep: number; // 0 = off, else grid step (m)

  setViewMode: (m: ViewMode) => void;
  setShowHeatMap: (v: boolean) => void;
  toggleHeatMap: () => void;
  setHeatMapScale: (v: number) => void;
  setHeatMapTarget: (v: number) => void;
  togglePhotoMode: () => void;
  setExposure: (v: number) => void;
  setHaze: (v: number) => void;
  toggleSnap: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  viewMode: '2d',
  showHeatMap: false,
  heatMapScale: 1000,
  heatMapTarget: 0,
  photoMode: false,
  exposure: 1.0,
  haze: 0.15,
  snapStep: 0,

  setViewMode: (viewMode) => set({ viewMode }),
  setShowHeatMap: (showHeatMap) => set({ showHeatMap }),
  toggleHeatMap: () => set((s) => ({ showHeatMap: !s.showHeatMap })),
  setHeatMapScale: (heatMapScale) => set({ heatMapScale }),
  setHeatMapTarget: (heatMapTarget) => set({ heatMapTarget }),
  togglePhotoMode: () => set((s) => ({ photoMode: !s.photoMode })),
  setExposure: (exposure) => set({ exposure }),
  setHaze: (haze) => set({ haze }),
  toggleSnap: () => set((s) => ({ snapStep: s.snapStep > 0 ? 0 : 0.5 })),
}));
