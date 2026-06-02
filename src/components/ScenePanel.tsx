import React, { useState } from 'react';
import type { Scene } from '../types';

interface Props {
  scenes: Scene[];
  activeSceneId: string | null;
  hiddenCount: number;
  fixtureCount: number;
  onSaveScene: () => void;
  onToggleScene: (id: string) => void;
  onUpdateScene: (id: string) => void;
  onRenameScene: (id: string, name: string) => void;
  onDeleteScene: (id: string) => void;
  onShowAll: () => void;
}

// Floating panel for lighting scenes (looks): save the current state, switch
// scenes on/off, overwrite, rename and delete. Also surfaces how many lamps are
// currently muted, with a one-click "show all".
const ScenePanel: React.FC<Props> = ({
  scenes,
  activeSceneId,
  hiddenCount,
  fixtureCount,
  onSaveScene,
  onToggleScene,
  onUpdateScene,
  onRenameScene,
  onDeleteScene,
  onShowAll,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startRename = (s: Scene) => { setEditingId(s.id); setDraft(s.name); };
  const commitRename = () => {
    if (editingId && draft.trim()) onRenameScene(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className={`scene-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="sp-header">
        <span className="sp-title">🎬 Szenen{scenes.length > 0 ? ` (${scenes.length})` : ''}</span>
        <button className="sp-icon-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Aufklappen' : 'Einklappen'}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div className="sp-body">
          <button className="sp-save-btn" onClick={onSaveScene} disabled={fixtureCount === 0} title="Aktuellen Look als neue Szene sichern">
            ＋ Aktuellen Look speichern
          </button>

          {scenes.length === 0 ? (
            <p className="sp-empty">Noch keine Szenen. Stelle deine Leuchten ein und speichere den Look.</p>
          ) : (
            <ul className="sp-list">
              {scenes.map((s) => {
                const active = s.id === activeSceneId;
                return (
                  <li key={s.id} className={`sp-item ${active ? 'active' : ''}`}>
                    {editingId === s.id ? (
                      <input
                        className="sp-rename"
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                      />
                    ) : (
                      <button className="sp-name" onClick={() => onToggleScene(s.id)} title={active ? 'Szene ausschalten (vorherigen Look)' : 'Szene einschalten'}>
                        <span className={`sp-dot ${active ? 'on' : ''}`} />
                        {s.name}
                      </button>
                    )}
                    <div className="sp-item-actions">
                      <button className="sp-mini" onClick={() => onUpdateScene(s.id)} title="Mit aktuellem Look überschreiben">⟳</button>
                      <button className="sp-mini" onClick={() => startRename(s)} title="Umbenennen">✎</button>
                      <button className="sp-mini sp-del" onClick={() => onDeleteScene(s.id)} title="Szene löschen">🗑</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {hiddenCount > 0 && (
            <button className="sp-showall" onClick={onShowAll}>
              👁 {hiddenCount} ausgeblendet – alle einblenden
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ScenePanel;
