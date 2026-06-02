import React from 'react';
import type { Tool, ViewMode } from '../types';

interface Props {
  activeTool: Tool;
  viewMode: ViewMode;
  showHeatMap: boolean;
  heatMapScale: number;
  heatMapTarget: number;
  onToolChange: (t: Tool) => void;
  onViewModeChange: (m: ViewMode) => void;
  onToggleHeatMap: () => void;
  onHeatMapScaleChange: (v: number) => void;
  onHeatMapTargetChange: (v: number) => void;
  onUploadFloorPlan: (file: File) => void;
  onExport: () => void;
  onAutoThreePoint: () => void;
  onAutoThreePointConfig: () => void;
  onAutoDistribute: () => void;
  onAlignH: () => void;
  onAlignV: () => void;
  onDistributeH: () => void;
  onDistributeV: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
  onOpenSchedule: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  hasPersons: boolean;
  hasStageElements: boolean;
  hasSelection: boolean;
  multiSelected: boolean;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onRotateSelection: (deg: number) => void;
}

const Toolbar: React.FC<Props> = ({
  activeTool,
  viewMode,
  showHeatMap,
  heatMapScale,
  heatMapTarget,
  onToolChange,
  onViewModeChange,
  onToggleHeatMap,
  onHeatMapScaleChange,
  onHeatMapTargetChange,
  onUploadFloorPlan,
  onExport,
  onAutoThreePoint,
  onAutoThreePointConfig,
  onAutoDistribute,
  onAlignH,
  onAlignV,
  onDistributeH,
  onDistributeV,
  onSaveProject,
  onLoadProject,
  onOpenSchedule,
  snapEnabled,
  onToggleSnap,
  hasPersons,
  hasStageElements,
  hasSelection,
  multiSelected,
  onGroupSelection,
  onUngroupSelection,
  onRotateSelection,
}) => {
  const tools: { id: Tool; label: string; icon: string }[] = [
    { id: 'select', label: 'Auswahl', icon: '⊹' },
    { id: 'pan', label: 'Verschieben', icon: '✋' },
    { id: 'rect', label: 'Rechteck', icon: '▭' },
    { id: 'line', label: 'Linie', icon: '╱' },
    { id: 'measure', label: 'Messen', icon: '📏' },
    { id: 'person', label: 'Person', icon: '🧑' },
    { id: 'stage', label: 'Podest', icon: '⬜' },
    { id: 'truss', label: 'Traverse', icon: '▤' },
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
        <label className="tool-btn upload-btn" title="Gebäudeplan importieren (JPG, PNG oder PDF) – danach Maßstab kalibrieren">
          <span className="tool-icon">📐</span>
          <span className="tool-label">Grundriss</span>
          <input
            type="file"
            accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFloorPlan(f);
              e.target.value = '';
            }}
          />
        </label>
        <button
          className={`tool-btn ${snapEnabled ? 'active' : ''}`}
          onClick={onToggleSnap}
          title="Am Raster einrasten (0,5 m) ein/aus"
        >
          <span className="tool-icon">⊞</span>
          <span className="tool-label">Raster</span>
        </button>
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
        {showHeatMap && (
          <label className="heat-scale-label" title="Beleuchtungsziel (0 = aus)">
            <span>Ziel:</span>
            <input
              type="number"
              min={0}
              max={100000}
              step={10}
              value={heatMapTarget}
              onChange={(e) => onHeatMapTargetChange(Number(e.target.value))}
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
          title="3-Punkt-Beleuchtung (Standard)"
        >
          <span className="tool-icon">💡</span>
          <span className="tool-label">3-Punkt</span>
        </button>
        <button
          className="tool-btn auto-btn"
          onClick={onAutoThreePointConfig}
          disabled={!hasPersons}
          title="3-Punkt mit Leuchtenauswahl"
        >
          <span className="tool-icon">⚙</span>
          <span className="tool-label">Konfig.</span>
        </button>
        <button
          className="tool-btn auto-btn"
          onClick={onAutoDistribute}
          disabled={!hasPersons && !hasStageElements}
          title="Gleichmäßige Flächenausleuchtung (Front/Back 45°)"
        >
          <span className="tool-icon">🔆</span>
          <span className="tool-label">Verteilen</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Align / Distribute */}
      <div className="toolbar-group">
        <button className="tool-btn" onClick={onAlignH} disabled={!hasSelection} title="Horizontal ausrichten (gleiche Y)">
          <span className="tool-icon">⫶</span>
          <span className="tool-label">H-Align</span>
        </button>
        <button className="tool-btn" onClick={onAlignV} disabled={!hasSelection} title="Vertikal ausrichten (gleiche X)">
          <span className="tool-icon">⫴</span>
          <span className="tool-label">V-Align</span>
        </button>
        <button className="tool-btn" onClick={onDistributeH} title="Horizontal verteilen">
          <span className="tool-icon">⋯</span>
          <span className="tool-label">H-Dist</span>
        </button>
        <button className="tool-btn" onClick={onDistributeV} title="Vertikal verteilen">
          <span className="tool-icon">⋮</span>
          <span className="tool-label">V-Dist</span>
        </button>
      </div>

      {/* Group / Rotate (multi-select) */}
      {multiSelected && (
        <>
          <div className="toolbar-separator" />
          <div className="toolbar-group">
            <button className="tool-btn" onClick={onGroupSelection} title="Auswahl gruppieren">
              <span className="tool-icon">🔗</span>
              <span className="tool-label">Gruppe</span>
            </button>
            <button className="tool-btn" onClick={onUngroupSelection} title="Gruppierung aufheben">
              <span className="tool-icon">✂</span>
              <span className="tool-label">Lösen</span>
            </button>
            <button className="tool-btn" onClick={() => onRotateSelection(-45)} title="45° gegen Uhrzeigersinn um Person drehen">
              <span className="tool-icon">↺</span>
              <span className="tool-label">−45°</span>
            </button>
            <button className="tool-btn" onClick={() => onRotateSelection(45)} title="45° im Uhrzeigersinn um Person drehen">
              <span className="tool-icon">↻</span>
              <span className="tool-label">+45°</span>
            </button>
            <button className="tool-btn" onClick={() => onRotateSelection(180)} title="180° um Person drehen">
              <span className="tool-icon">⟳</span>
              <span className="tool-label">180°</span>
            </button>
          </div>
        </>
      )}

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button className="tool-btn" onClick={onOpenSchedule} title="Geräteliste, DMX-Patch & Stromberechnung">
          <span className="tool-icon">📋</span>
          <span className="tool-label">Geräteliste</span>
        </button>
        <button className="tool-btn" onClick={onSaveProject} title="Projekt speichern">
          <span className="tool-icon">💾</span>
          <span className="tool-label">Speichern</span>
        </button>
        <button className="tool-btn" onClick={onLoadProject} title="Projekt laden">
          <span className="tool-icon">📂</span>
          <span className="tool-label">Laden</span>
        </button>
        <button className="tool-btn" onClick={onExport} title="Plan als Bild exportieren">
          <span className="tool-icon">🖼</span>
          <span className="tool-label">Export</span>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
