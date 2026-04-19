import React from 'react';
import type { Tool, ViewMode } from '../types';

interface Props {
  activeTool: Tool;
  viewMode: ViewMode;
  showHeatMap: boolean;
  heatMapScale: number;
  onToolChange: (t: Tool) => void;
  onViewModeChange: (m: ViewMode) => void;
  onToggleHeatMap: () => void;
  onHeatMapScaleChange: (v: number) => void;
  onUploadFloorPlan: (file: File) => void;
  onExport: () => void;
  onAutoThreePoint: () => void;
  onAutoDistribute: () => void;
  hasPersons: boolean;
}

const Toolbar: React.FC<Props> = ({
  activeTool,
  viewMode,
  showHeatMap,
  heatMapScale,
  onToolChange,
  onViewModeChange,
  onToggleHeatMap,
  onHeatMapScaleChange,
  onUploadFloorPlan,
  onExport,
  onAutoThreePoint,
  onAutoDistribute,
  hasPersons,
}) => {
  const tools: { id: Tool; label: string; icon: string }[] = [
    { id: 'select', label: 'Auswahl', icon: '⊹' },
    { id: 'pan', label: 'Verschieben', icon: '✋' },
    { id: 'rect', label: 'Rechteck', icon: '▭' },
    { id: 'line', label: 'Linie', icon: '╱' },
    { id: 'measure', label: 'Messen', icon: '📏' },
    { id: 'person', label: 'Person', icon: '🧑' },
    { id: 'stage', label: 'Podest', icon: '⬜' },
  ];

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {tools.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${activeTool === t.id ? 'active' : ''}`}
            onClick={() => onToolChange(t.id)}
            title={t.label}
          >
            <span className="tool-icon">{t.icon}</span>
            <span className="tool-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-separator" />

      {/* 2D/3D Toggle */}
      <div className="toolbar-group view-toggle">
        <button
          className={`tool-btn ${viewMode === '2d' ? 'active' : ''}`}
          onClick={() => onViewModeChange('2d')}
          title="2D-Draufsicht"
        >
          <span className="tool-label">2D</span>
        </button>
        <button
          className={`tool-btn ${viewMode === '3d' ? 'active' : ''}`}
          onClick={() => onViewModeChange('3d')}
          title="3D-Ansicht"
        >
          <span className="tool-label">3D</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <label className="tool-btn upload-btn" title="Grundriss hochladen">
          <span className="tool-icon">📐</span>
          <span className="tool-label">Grundriss</span>
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFloorPlan(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          className={`tool-btn ${showHeatMap ? 'active' : ''}`}
          onClick={onToggleHeatMap}
          title="Heatmap ein/aus"
        >
          <span className="tool-icon">🌡</span>
          <span className="tool-label">Heatmap</span>
        </button>
        {showHeatMap && (
          <label className="heat-scale-label" title="Max Lux für Farbskala">
            <span>Max:</span>
            <input
              type="number"
              min={10}
              max={100000}
              step={10}
              value={heatMapScale}
              onChange={(e) => onHeatMapScaleChange(Number(e.target.value))}
            />
            <span>lx</span>
          </label>
        )}
      </div>

      <div className="toolbar-separator" />

      {/* Auto-Lighting */}
      <div className="toolbar-group">
        <button
          className="tool-btn auto-btn"
          onClick={onAutoThreePoint}
          disabled={!hasPersons}
          title="3-Punkt-Beleuchtung für ausgewählte/alle Personen"
        >
          <span className="tool-icon">💡</span>
          <span className="tool-label">3-Punkt</span>
        </button>
        <button
          className="tool-btn auto-btn"
          onClick={onAutoDistribute}
          disabled={!hasPersons}
          title="Gleichmäßige Bühnenausleuchtung (Kreuzlicht)"
        >
          <span className="tool-icon">🔆</span>
          <span className="tool-label">Verteilen</span>
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button className="tool-btn" onClick={onExport} title="Plan als Bild exportieren">
          <span className="tool-icon">💾</span>
          <span className="tool-label">Export</span>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
