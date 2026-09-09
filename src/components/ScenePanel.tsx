import React, { useState } from 'react';
import { useTranslation } from '../i18n';
import { canParent, runningOrder } from '../core/runningOrder';
import { auswertung, istDauer, naechsterGriff, type Griff } from '../core/actuals';
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
  /**
   * BEDARF 56 — DER GRIFF. Ein Knopf, ein Argument, keine Rueckfrage.
   *
   * Der Bedarf sagt ausdruecklich, dass er „an der Bedienschnelligkeit lebt
   * oder stirbt, nicht am Datenmodell". Deshalb ist das hier kein Dialog und
   * kein Formular: was passiert, entscheidet der Zustand der Zeile, und der
   * Nutzer trifft eine Flaeche.
   */
  onCaptureActual: (id: string, griff: Griff) => void;
  /** Die geplante Dauer eines Eintrags in Minuten; `null` loescht sie. */
  onSetPlanned: (id: string, minuten: number | null) => void;
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
  onCaptureActual,
  onSetPlanned,
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

  // BEDARF 56 — die Nachbetrachtung. EINE Rechnung, hier wie auf dem Blatt:
  // `auswertung` traegt die Regel, dass eine nicht gemessene Zeile nirgends
  // als 0 zaehlt. Sie hier noch einmal aufzustellen hiesse, dieselbe Frage
  // zweimal zu beantworten — und die zweite Antwort weicht irgendwann ab.
  const bilanz = auswertung(
    scenes,
    Object.fromEntries(scenes.map((s) => [s.id, s.timing ?? {}])),
    Object.fromEntries(scenes.map((s) => [s.id, s.actual ?? {}])),
  );

  const minuten = (wert: number) => `${Math.round(wert)}\u00a0min`;
  const vorzeichen = (wert: number) => `${wert > 0 ? '+' : ''}${Math.round(wert)}`;

  const startRename = (s: Scene) => { setEditingId(s.id); setDraft(s.name); };
  const commitRename = () => {
    if (editingId && draft.trim()) onRenameScene(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className={`scene-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="sp-header">
        <span className="sp-title">🎬 {t('panel.scene.title', 'Scenes')}{scenes.length > 0 ? ` (${scenes.length})` : ''}</span>
        <button className="sp-icon-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? t('panel.expand', 'Expand') : t('panel.collapse', 'Collapse')}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div className="sp-body">
          <button className="sp-save-btn" onClick={onSaveScene} disabled={fixtureCount === 0} title={t('panel.scene.saveHint', 'Store the current look as a new scene')}>
            ＋ {t('panel.scene.save', 'Save the current look')}
          </button>

          {scenes.length === 0 ? (
            <p className="sp-empty">{t('panel.scene.empty', 'No scenes yet. Set your fixtures and save the look.')}</p>
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
                    {/* BEDARF 56 — DER GRIFF, und zwar als eigene Flaeche vor
                        den sieben kleinen Knoepfen. Zwischen ihnen waere er
                        der achte gleich aussehende und im Saal nicht zu
                        treffen; der Bedarf steht und faellt aber genau
                        damit. Was er tut, sagt seine Beschriftung, und die
                        folgt dem Zustand der Zeile. */}
                    {(() => {
                      const griff: Griff | null = naechsterGriff(s.actual);
                      const dauer = istDauer(s.actual);
                      const zeile = bilanz.zeilen.find((z) => z.id === s.id);
                      if (griff === 'start') {
                        return (
                          <button
                            className="sp-ist sp-ist-start"
                            onClick={() => onCaptureActual(s.id, 'start')}
                            title={t('panel.scene.captureStart', 'Record the start now')}
                          >▶</button>
                        );
                      }
                      if (griff === 'ende') {
                        return (
                          <button
                            className="sp-ist sp-ist-ende"
                            onClick={() => onCaptureActual(s.id, 'ende')}
                            title={t('panel.scene.captureEnd', 'Record the end now')}
                          >■</button>
                        );
                      }
                      // Kein Griff mehr. Zwei Lagen, und die Beschriftung
                      // unterscheidet sie: fertig gemessen — oder ein Ende
                      // ohne Beginn, das eine Luecke bleibt und keine Zahl.
                      const luecke = dauer === null;
                      return (
                        <span
                          className={`sp-ist sp-ist-fertig${luecke ? ' sp-ist-ohne-start' : ''}`}
                          title={
                            luecke
                              ? t('panel.scene.captureGap', 'End recorded without a start - the duration cannot be measured')
                              : t('panel.scene.captured', 'Actual recorded')
                          }
                        >
                          {luecke ? '–' : minuten(dauer)}
                          {zeile?.abweichungMinuten != null && (
                            <em className={zeile.abweichungMinuten > 0 ? 'plus' : 'minus'}>
                              {vorzeichen(zeile.abweichungMinuten)}
                            </em>
                          )}
                        </span>
                      );
                    })()}
                    {/* Die geplante Dauer. Ohne sie gaebe es nachher nichts,
                        wogegen das Ist gehalten werden koennte — und der
                        Bedarf will die Planung des naechsten Jahres aus dem
                        Ergebnis speisen, nicht bloss das Ergebnis sammeln.
                        Leer heisst „nicht geplant" und nicht „null Minuten". */}
                    <input
                      className="sp-plan"
                      type="number"
                      min={0}
                      step={1}
                      value={s.timing?.plannedMinutes ?? ''}
                      placeholder="–"
                      title={t('panel.scene.planned', 'Planned duration in minutes')}
                      onChange={(e) => {
                        const roh = e.target.value.trim();
                        onSetPlanned(s.id, roh === '' ? null : Number(roh));
                      }}
                    />
                    <div className="sp-item-actions">
                      <button className="sp-mini" onClick={() => onMoveScene(s.id, 'up')} title={t('panel.scene.up', 'Move up — with everything below it')}>↑</button>
                      <button className="sp-mini" onClick={() => onMoveScene(s.id, 'down')} title={t('panel.scene.down', 'Move down — with everything below it')}>↓</button>
                      {/* Ein- und Ausruecken ist eine EIGENE Handlung: eine
                          Szene, die beim Verschieben aus ihrem Song fiele,
                          waere genau die verlorene Teil-Stimmung. */}
                      <button
                        className="sp-mini"
                        disabled={!vorgaenger(s.id) || !canParent(scenes, s.id, vorgaenger(s.id)).ok}
                        onClick={() => onReparentScene(s.id, vorgaenger(s.id))}
                        title={t('panel.scene.indent', 'Nest under the scene above')}
                      >→</button>
                      <button
                        className="sp-mini"
                        disabled={!s.parentId}
                        onClick={() => onReparentScene(s.id, null)}
                        title={t('panel.scene.outdent', 'Move back to the top level')}
                      >←</button>
                      <button className="sp-mini" onClick={() => onUpdateScene(s.id)} title={t('panel.scene.overwrite', 'Overwrite with the current look')}>⟳</button>
                      <button className="sp-mini" onClick={() => startRename(s)} title={t('panel.scene.rename', 'Rename')}>✎</button>
                      <button className="sp-mini sp-del" onClick={() => onDeleteScene(s.id)} title={t('panel.scene.delete', 'Delete scene')}>🗑</button>
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

          {/* BEDARF 56 — die Nachbetrachtung in einer Zeile. Sie nennt, ueber
              WIE VIELE Eintraege sie rechnet: eine Summe ohne ihre Basis
              liest sich wie eine Aussage ueber den ganzen Abend, auch wenn
              nur zwei Punkte erfasst wurden. */}
          {bilanz.gemessen > 0 && (
            <p className="sp-bilanz">
              {t('panel.scene.measured', 'Recorded')}: {bilanz.gemessen}
              {bilanz.abweichungBasis > 0 ? (
                <>
                  {' · '}
                  {vorzeichen(bilanz.abweichungSumme)}&nbsp;min{' '}
                  {t('panel.scene.overPlanOf', 'against the plan, from')} {bilanz.abweichungBasis}
                </>
              ) : (
                <>{' · '}{t('panel.scene.noPlanYet', 'nothing to compare - no duration planned')}</>
              )}
            </p>
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
