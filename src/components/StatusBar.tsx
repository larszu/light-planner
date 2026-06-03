import React from 'react';
import Icon from './Icon';

interface Props {
  viewMode: '2d' | '3d';
  photoMode: boolean;
  cursorLux: number | null;
  selectionCount: number;
  snapStep: number;
  haze: number;
  exposure: number;
  activeSceneName: string | null;
  hiddenCount: number;
}

// Persistent bottom status bar — the live feedback (lux, selection, snap, render
// settings, active scene) that used to be scattered across the UI.
const StatusBar: React.FC<Props> = ({ viewMode, photoMode, cursorLux, selectionCount, snapStep, haze, exposure, activeSceneName, hiddenCount }) => (
  <footer className="statusbar">
    <span className="sb-item"><Icon name={viewMode === '2d' ? 'plan2d' : (photoMode ? 'photo' : 'cube3d')} size={13} />
      {viewMode === '2d' ? '2D-Plan' : (photoMode ? 'Render' : '3D')}</span>
    {cursorLux !== null && (
      <span className="sb-item sb-lux"><Icon name="heatmap" size={13} /><b>{Math.round(cursorLux).toLocaleString('de-DE')}</b> lx</span>
    )}
    <span className="sb-item"><b>{selectionCount}</b> ausgewählt</span>
    {hiddenCount > 0 && <span className="sb-item">{hiddenCount} stummgeschaltet</span>}
    <span className="sb-spacer" />
    {photoMode && <span className="sb-item">Belichtung <b>{exposure.toFixed(2)}</b></span>}
    {photoMode && <span className="sb-item">Dunst <b>{Math.round(haze * 100)}%</b></span>}
    <span className="sb-item">Einrasten <b>{snapStep > 0 ? `${snapStep} m` : 'aus'}</b></span>
    {activeSceneName && <span className="sb-item sb-scene"><span className="sb-dot" />Szene „{activeSceneName}"</span>}
  </footer>
);

export default StatusBar;
