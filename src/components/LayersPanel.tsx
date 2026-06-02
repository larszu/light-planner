import React, { useState } from 'react';
import type { Layers, LayerKey } from '../types';

interface Props {
  layers: Layers;
  counts: Record<LayerKey, number>;
  onToggleVisible: (key: LayerKey) => void;
  onToggleLocked: (key: LayerKey) => void;
}

// Order top→bottom = front→back, like a Photoshop layer stack.
const ROWS: { key: LayerKey; icon: string; label: string }[] = [
  { key: 'fixtures', icon: '💡', label: 'Leuchten' },
  { key: 'persons', icon: '🧍', label: 'Personen' },
  { key: 'trusses', icon: '▦', label: 'Traversen' },
  { key: 'stage', icon: '⬛', label: 'Bühne / Podeste' },
  { key: 'shapes', icon: '📐', label: 'Formen & Maße' },
  { key: 'ceilings', icon: '🟫', label: 'Decken' },
  { key: 'walls', icon: '🧱', label: 'Wände' },
  { key: 'floorPlan', icon: '🗺', label: 'Grundriss' },
];

// Floating "Ebenen" overview: toggle visibility (eye) and lock per category.
const LayersPanel: React.FC<Props> = ({ layers, counts, onToggleVisible, onToggleLocked }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`layers-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="lp-header">
        <span className="lp-title">🗂 Ebenen</span>
        <button className="lp-icon-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Aufklappen' : 'Einklappen'}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      {!collapsed && (
        <ul className="lp-list">
          {ROWS.map(({ key, icon, label }) => {
            const l = layers[key];
            const n = counts[key];
            return (
              <li key={key} className={`lp-row ${l.visible ? '' : 'lp-off'}`}>
                <button
                  className="lp-eye"
                  onClick={() => onToggleVisible(key)}
                  title={l.visible ? 'Ausblenden' : 'Einblenden'}
                >{l.visible ? '👁' : '🚫'}</button>
                <button
                  className={`lp-lock ${l.locked ? 'on' : ''}`}
                  onClick={() => onToggleLocked(key)}
                  title={l.locked ? 'Entsperren' : 'Sperren (nicht auswählbar)'}
                >{l.locked ? '🔒' : '🔓'}</button>
                <span className="lp-name"><span className="lp-ico">{icon}</span>{label}</span>
                <span className="lp-count">{n}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LayersPanel;
