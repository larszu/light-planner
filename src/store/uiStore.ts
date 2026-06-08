import { create } from 'zustand';
import type { ViewMode } from '../core';

export type Language = 'de' | 'en';

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
  showBeams: boolean; // global on/off for the volumetric light shafts (photo view)
  ambience: number;   // global fill / ambient light level in the render view (0..1)
  snapStep: number; // 0 = off, else grid step (m)
  showFocusNotes: boolean; // overlay focus notes on fixtures in the 2D plan
  language: Language;

  setViewMode: (m: ViewMode) => void;
  setShowHeatMap: (v: boolean) => void;
  toggleHeatMap: () => void;
  setHeatMapScale: (v: number) => void;
  setHeatMapTarget: (v: number) => void;
  togglePhotoMode: () => void;
  setExposure: (v: number) => void;
  setHaze: (v: number) => void;
  toggleBeams: () => void;
  setAmbience: (v: number) => void;
  toggleSnap: () => void;
  toggleFocusNotes: () => void;
  setLanguage: (l: Language) => void;
}

export const useUiStore = create<UiState>((set) => ({
  viewMode: '2d',
  showHeatMap: false,
  heatMapScale: 1000,
  heatMapTarget: 0,
  photoMode: false,
  exposure: 1.2,
  haze: 0.15,
  showBeams: true,
  ambience: 0.55,
  snapStep: 0,
  showFocusNotes: false,
  language: (typeof localStorage !== 'undefined' && localStorage.getItem('lp-lang') === 'en' ? 'en' : 'de'),

  setViewMode: (viewMode) => set({ viewMode }),
  setShowHeatMap: (showHeatMap) => set({ showHeatMap }),
  toggleHeatMap: () => set((s) => ({ showHeatMap: !s.showHeatMap })),
  setHeatMapScale: (heatMapScale) => set({ heatMapScale }),
  setHeatMapTarget: (heatMapTarget) => set({ heatMapTarget }),
  togglePhotoMode: () => set((s) => ({ photoMode: !s.photoMode })),
  setExposure: (exposure) => set({ exposure }),
  setHaze: (haze) => set({ haze }),
  toggleBeams: () => set((s) => ({ showBeams: !s.showBeams })),
  setAmbience: (ambience) => set({ ambience }),
  toggleSnap: () => set((s) => ({ snapStep: s.snapStep > 0 ? 0 : 0.5 })),
  toggleFocusNotes: () => set((s) => ({ showFocusNotes: !s.showFocusNotes })),
  setLanguage: (language) => { try { localStorage.setItem('lp-lang', language); } catch { /* ignore */ } set({ language }); },
}));
