import React, { useState } from 'react';
import type { FloorPlan } from '../types';
import type { PlanMode } from '../App';

interface Props {
  floorPlan: FloorPlan;
  planMode: PlanMode;
  onSetMode: (mode: PlanMode) => void;
  onSetWidth: (widthMeters: number) => void;
  onSetPage: (pageIndex: number) => void;
  onUpdate: (updates: Partial<FloorPlan>) => void;
  onRemove: () => void;
}

// Floating control panel for an imported building plan: scale calibration,
// page navigation (PDF), opacity, positioning and removal.
const FloorPlanPanel: React.FC<Props> = ({
  floorPlan,
  planMode,
  onSetMode,
  onSetWidth,
  onSetPage,
  onUpdate,
  onRemove,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [widthDraft, setWidthDraft] = useState(String(floorPlan.widthMeters));

  // Keep the local width field in sync when calibration changes it elsewhere.
  React.useEffect(() => { setWidthDraft(String(floorPlan.widthMeters)); }, [floorPlan.widthMeters]);

  const page = (floorPlan.pageIndex ?? 0) + 1;
  const pages = floorPlan.pageCount ?? 1;
  // 1 metre on the plan corresponds to this many bitmap pixels — handy sanity check.
  const pxPerM = floorPlan.naturalWidth / floorPlan.widthMeters;

  return (
    <div className={`floorplan-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="fp-header">
        <span className="fp-title" title={floorPlan.name}>
          📐 {floorPlan.name || 'Grundriss'}
        </span>
        <div className="fp-header-actions">
          <button className="fp-icon-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Aufklappen' : 'Einklappen'}>
            {collapsed ? '▸' : '▾'}
          </button>
          <button className="fp-icon-btn fp-close" onClick={onRemove} title="Grundriss entfernen">✕</button>
        </div>
      </div>

      {!collapsed && (
        <div className="fp-body">
          {/* Multi-page PDF navigation */}
          {pages > 1 && (
            <div className="fp-row fp-pages">
              <span>Seite</span>
              <div className="fp-page-nav">
                <button
                  className="fp-step-btn"
                  disabled={page <= 1}
                  onClick={() => onSetPage((floorPlan.pageIndex ?? 0) - 1)}
                >◀</button>
                <span className="fp-page-label">{page} / {pages}</span>
                <button
                  className="fp-step-btn"
                  disabled={page >= pages}
                  onClick={() => onSetPage((floorPlan.pageIndex ?? 0) + 1)}
                >▶</button>
              </div>
            </div>
          )}

          {/* Scale calibration — the headline feature */}
          <div className="fp-section">
            <button
              className={`fp-calibrate-btn ${planMode === 'calibrate' ? 'active' : ''}`}
              onClick={() => onSetMode(planMode === 'calibrate' ? 'none' : 'calibrate')}
            >
              📏 Maßstab kalibrieren
            </button>
            <div className="fp-row">
              <span>Breite</span>
              <div className="fp-input-unit">
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={widthDraft}
                  onChange={(e) => setWidthDraft(e.target.value)}
                  onBlur={() => { const v = Number(widthDraft); if (v > 0) onSetWidth(v); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { const v = Number(widthDraft); if (v > 0) onSetWidth(v); (e.target as HTMLInputElement).blur(); } }}
                />
                <span>m</span>
              </div>
            </div>
            <div className="fp-row fp-derived">
              <span>Höhe</span>
              <span>{floorPlan.heightMeters.toFixed(2)} m</span>
            </div>
            <div className="fp-row fp-derived">
              <span>Maßstab</span>
              <span>{pxPerM.toFixed(0)} px/m</span>
            </div>
          </div>

          {/* Position & appearance */}
          <div className="fp-section">
            <button
              className={`fp-move-btn ${planMode === 'move' ? 'active' : ''}`}
              onClick={() => onSetMode(planMode === 'move' ? 'none' : 'move')}
            >
              ✋ Position anpassen
            </button>
            <div className="fp-row fp-pos">
              <span>X / Y</span>
              <div className="fp-xy">
                <input
                  type="number" step={0.1} value={floorPlan.offsetX}
                  onChange={(e) => onUpdate({ offsetX: Number(e.target.value) })}
                />
                <input
                  type="number" step={0.1} value={floorPlan.offsetY}
                  onChange={(e) => onUpdate({ offsetY: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="fp-row">
              <span>Deckkraft</span>
              <input
                className="fp-opacity"
                type="range" min={0.1} max={1} step={0.05}
                value={floorPlan.opacity}
                onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
              />
              <span className="fp-opacity-val">{Math.round(floorPlan.opacity * 100)}%</span>
            </div>
            <label className="fp-row fp-lock">
              <span>Sperren</span>
              <input
                type="checkbox"
                checked={floorPlan.locked}
                onChange={(e) => { onUpdate({ locked: e.target.checked }); if (e.target.checked) onSetMode('none'); }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloorPlanPanel;
