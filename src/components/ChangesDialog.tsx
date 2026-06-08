import React, { useState } from 'react';
import type { ProjectData } from '../types';
import { diffProjects } from '../core/diff';
import { versionsFor, type ProjectVersion } from '../utils/versionStore';
import DiffView from './DiffView';
import Icon from './Icon';
import type { IconName } from './Icon';

export interface LogEntry { time: number; label: string }
export interface Step { count: number; label: string }

interface Props {
  log: LogEntry[];
  undoSteps: Step[]; // newest action first; count = how many undos to reach it
  redoSteps: Step[]; // next redo first
  currentDoc: ProjectData;
  projectId: string;
  projectName: string;
  onJump: (dir: 'undo' | 'redo', count: number) => void;
  onSaveVersion: (label: string) => void;
  onClose: () => void;
}

type Tab = 'protokoll' | 'undo' | 'diff';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'protokoll', label: 'Protokoll', icon: 'tag' },
  { id: 'undo', label: 'Rückgängig-Schritte', icon: 'undo' },
  { id: 'diff', label: 'Seit letzter Version', icon: 'layers' },
];

const time = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// "Verlauf & Änderungen": session activity log, an interactive undo timeline,
// and the diff to the last saved version — all the "what changed" views.
const ChangesDialog: React.FC<Props> = ({ log, undoSteps, redoSteps, currentDoc, projectId, projectName, onJump, onSaveVersion, onClose }) => {
  const [tab, setTabState] = useState<Tab>(() => {
    try { const t = localStorage.getItem('lp-changes-tab'); if (t && TABS.some((x) => x.id === t)) return t as Tab; } catch { /* ignore */ }
    return 'undo';
  });
  const setTab = (t: Tab) => { setTabState(t); try { localStorage.setItem('lp-changes-tab', t); } catch { /* ignore */ } };
  const [label, setLabel] = useState('');

  const latest: ProjectVersion | undefined = versionsFor(projectId)[0];
  const diff = latest ? diffProjects(latest.doc, currentDoc) : null;
  const activeLabel = TABS.find((t) => t.id === tab)!.label;

  const protokoll = (
    log.length === 0 ? <div className="tool-empty">Noch keine Aktivität in dieser Sitzung.</div> : (
      <ul className="log-list">
        {[...log].reverse().map((e, i) => (
          <li key={i} className="log-item"><span className="log-time">{time(e.time)}</span><span className="log-label">{e.label}</span></li>
        ))}
      </ul>
    )
  );

  const undoPanel = (
    <div className="timeline">
      {redoSteps.length > 0 && (
        <>
          <div className="tl-head">Wiederherstellbar (Strg Y)</div>
          {[...redoSteps].reverse().map((s, i) => (
            <button key={'r' + i} className="tl-step redo" onClick={() => onJump('redo', s.count)} title="Wiederherstellen">
              <Icon name="redo" size={13} /><span>{s.label}</span>
            </button>
          ))}
        </>
      )}
      <div className="tl-current"><span className="tl-dot" /> Aktueller Stand</div>
      {undoSteps.length === 0 ? (
        <div className="tool-empty">Nichts rückgängig zu machen.</div>
      ) : (
        <>
          <div className="tl-head">Letzte Schritte (Strg Z)</div>
          {undoSteps.map((s, i) => (
            <button key={'u' + i} className="tl-step undo" onClick={() => onJump('undo', s.count)} title="Bis hierhin rückgängig">
              <Icon name="undo" size={13} /><span>{s.label}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );

  const diffPanel = !latest ? (
    <div className="diff-noversion">
      <div className="tool-empty">Noch keine gespeicherte Version. Sichere den aktuellen Stand, um künftig zu vergleichen.</div>
      <div className="ver-save">
        <input value={label} placeholder="Version benennen…" onChange={(e) => setLabel(e.target.value)} />
        <button className="btn-primary" onClick={() => { onSaveVersion(label); setLabel(''); }}><Icon name="save" size={14} /> Sichern</button>
      </div>
    </div>
  ) : (
    <>
      <div className="diff-summary">
        <b>{diff!.total}</b> Änderung{diff!.total === 1 ? '' : 'en'} seit „{latest.label}" ({new Date(latest.savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })})
        <button className="btn-secondary diff-snap" onClick={() => { onSaveVersion(label || `Stand ${new Date().toLocaleString('de-DE')}`); setLabel(''); }}><Icon name="save" size={13} /> Jetzt sichern</button>
      </div>
      {diff!.total === 0 ? <div className="rig-clean">✓ Keine Änderungen seit der letzten Version.</div> : <DiffView diff={diff!} />}
    </>
  );

  const panels: Record<Tab, React.ReactNode> = { protokoll, undo: undoPanel, diff: diffPanel };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal tool-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tool-head">
          <h3><Icon name={TABS.find((t) => t.id === tab)!.icon} size={18} /> {activeLabel} <span className="th-sub">· {projectName || 'Lichtplan'}</span></h3>
          <button className="fp-icon-btn fp-close" onClick={onClose} title="Schließen">✕</button>
        </div>
        <div className="tool-body">
          <nav className="tool-nav">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={16} /><span>{t.label}</span>
                {t.id === 'diff' && diff && diff.total > 0 && <span className="nav-badge warn">{diff.total}</span>}
              </button>
            ))}
          </nav>
          <div className="tool-content">{panels[tab]}</div>
        </div>
      </div>
    </div>
  );
};

export default ChangesDialog;
