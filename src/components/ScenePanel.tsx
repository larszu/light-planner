import React, { useState } from 'react';
import { useTranslation } from '../i18n';
import { canParent, runningOrder } from '../core/runningOrder';
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
  /**
   * BEDARF 132 — verschieben, MIT allem, was unter der Szene haengt.
   *
   * Das Panel entscheidet das nicht selbst: es reicht die Richtung weiter,
   * und `moveItem` in `core/runningOrder.ts` setzt die Liste neu. Ein zweites
   * Verschieben hier waere die Fassung, die die Teil-Stimmungen stehen laesst
   * — genau der Fehler aus dem Beleg.
   */
  onMoveScene: (id: string, direction: 'up' | 'down') => void;
  /** Eine Szene unter eine andere haengen (oder wieder nach oben holen). */
  onReparentScene: (id: string, parentId: string | null) => void;
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
  onMoveScene,
  onReparentScene,
}) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // BEDARF 132 — DIE Reihenfolge. Panel und Blatt lesen dieselbe; zweimal
  // gerechnet zeigte das Panel eine andere als das Papier.
  const ablauf = runningOrder(scenes);

  /**
   * Die Szene, unter die das Einruecken haengen wuerde: die im Ablauf
   * unmittelbar davor. Genau wie in einer Gliederung — und `canParent`
   * entscheidet, ob das geht.
   */
  const vorgaenger = (id: string): string | null => {
    const idx = ablauf.rows.findIndex((r) => r.item.id === id);
    return idx > 0 ? ablauf.rows[idx - 1].item.id : null;
  };

  const startRename = (s: Scene) => { setEditingId(s.id); setDraft(s.name); };
  const commitRename = () => {
    if (editingId && draft.trim()) onRenameScene(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className={`scene-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="sp-header">
        <span className="sp-title">🎬 {t('panel.scene.title', 'Szenen')}{scenes.length > 0 ? ` (${scenes.length})` : ''}</span>
        <button className="sp-icon-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? t('panel.expand', 'Aufklappen') : t('panel.collapse', 'Einklappen')}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div className="sp-body">
          <button className="sp-save-btn" onClick={onSaveScene} disabled={fixtureCount === 0} title={t('panel.scene.saveHint', 'Aktuellen Look als neue Szene sichern')}>
            ＋ {t('panel.scene.save', 'Aktuellen Look speichern')}
          </button>

          {scenes.length === 0 ? (
            <p className="sp-empty">{t('panel.scene.empty', 'Noch keine Szenen. Stelle deine Leuchten ein und speichere den Look.')}</p>
          ) : (
            <ul className="sp-list">
              {ablauf.rows.map(({ item: s, depth, number, problem }) => {
                const active = s.id === activeSceneId;
                return (
                  <li
                    key={s.id}
                    className={`sp-item ${active ? 'active' : ''}${problem ? ' sp-item-problem' : ''}`}
                    style={{ paddingLeft: 4 + depth * 12 }}
                  >
                    {/* Die Nummer ist GERECHNET. Eine gespeicherte waere ab
                        der ersten Verschiebung falsch, und zwar still. */}
                    <span className="sp-num">{number}</span>
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
                      <button className="sp-mini" onClick={() => onMoveScene(s.id, 'up')} title={t('panel.scene.up', 'Nach oben — mit allem, was darunter hängt')}>↑</button>
                      <button className="sp-mini" onClick={() => onMoveScene(s.id, 'down')} title={t('panel.scene.down', 'Nach unten — mit allem, was darunter hängt')}>↓</button>
                      {/* Ein- und Ausruecken ist eine EIGENE Handlung: eine
                          Szene, die beim Verschieben aus ihrem Song fiele,
                          waere genau die verlorene Teil-Stimmung. */}
                      <button
                        className="sp-mini"
                        disabled={!vorgaenger(s.id) || !canParent(scenes, s.id, vorgaenger(s.id)).ok}
                        onClick={() => onReparentScene(s.id, vorgaenger(s.id))}
                        title={t('panel.scene.indent', 'Unter die Szene darüber hängen')}
                      >→</button>
                      <button
                        className="sp-mini"
                        disabled={!s.parentId}
                        onClick={() => onReparentScene(s.id, null)}
                        title={t('panel.scene.outdent', 'Wieder nach oben holen')}
                      >←</button>
                      <button className="sp-mini" onClick={() => onUpdateScene(s.id)} title={t('panel.scene.overwrite', 'Mit aktuellem Look überschreiben')}>⟳</button>
                      <button className="sp-mini" onClick={() => startRename(s)} title={t('panel.scene.rename', 'Umbenennen')}>✎</button>
                      <button className="sp-mini sp-del" onClick={() => onDeleteScene(s.id)} title={t('panel.scene.delete', 'Szene löschen')}>🗑</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Was nicht stimmt, wird GENANNT. Eine Szene, die unter einem
              geloeschten Song haengt, verschwindet nicht — sie steht am Ende
              und die Meldung sagt, warum. */}
          {ablauf.gaps.map((g) => (
            <p key={g.kind} className="sp-empty">{g.message}</p>
          ))}

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
