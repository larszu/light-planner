import React, { useState } from 'react';
import type { ProjectData } from '../types';
import { versionsFor, saveVersion, deleteVersion, type ProjectVersion } from '../utils/versionStore';
import { diffProjects, categoryCount, type CategoryDiff, type ProjectDiff } from '../core/diff';
import Icon from './Icon';

interface Props {
  projectId: string;
  projectName: string;
  currentDoc: ProjectData;
  onRestore: (doc: ProjectData) => void;
  onClose: () => void;
}

const CATS: { key: keyof Omit<ProjectDiff, 'total'>; label: string }[] = [
  { key: 'fixtures', label: 'Leuchten' },
  { key: 'persons', label: 'Personen' },
  { key: 'trusses', label: 'Traversen' },
  { key: 'walls', label: 'Wände' },
  { key: 'stageElements', label: 'Bühne' },
  { key: 'ceilings', label: 'Decken' },
];

const CategorySection: React.FC<{ label: string; diff: CategoryDiff }> = ({ label, diff }) => {
  if (categoryCount(diff) === 0) return null;
  return (
    <div className="diff-cat">
      <div className="diff-cat-head">{label}</div>
      {diff.added.map((a) => (
        <div key={'a' + a.id} className="diff-item add"><span className="diff-badge">+</span>{a.label}</div>
      ))}
      {diff.removed.map((r) => (
        <div key={'r' + r.id} className="diff-item rem"><span className="diff-badge">−</span>{r.label}</div>
      ))}
      {diff.changed.map((c) => (
        <div key={'c' + c.id} className="diff-item chg">
          <span className="diff-badge">~</span>
          <div className="diff-chg-body">
            <b>{c.label}</b>
            {c.fields.map((f, i) => (
              <span key={i} className="diff-field">{f.field}: <s>{f.from}</s> → <em>{f.to}</em></span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Save named snapshots of the rig and see exactly what changed since any of
// them — added / removed / moved / re-patched / re-gelled, field by field.
const VersionDialog: React.FC<Props> = ({ projectId, projectName, currentDoc, onRestore, onClose }) => {
  const [versions, setVersions] = useState<ProjectVersion[]>(() => versionsFor(projectId));
  const [selectedId, setSelectedId] = useState<string | null>(versionsFor(projectId)[0]?.id ?? null);
  const [label, setLabel] = useState('');
  const refresh = () => setVersions(versionsFor(projectId));

  const onSave = () => {
    try {
      const v = saveVersion(projectId, label, currentDoc);
      setLabel('');
      refresh();
      setSelectedId(v.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };
  const onDelete = (id: string) => {
    deleteVersion(id);
    const rest = versionsFor(projectId);
    setVersions(rest);
    if (selectedId === id) setSelectedId(rest[0]?.id ?? null);
  };
  const restore = (v: ProjectVersion) => {
    if (window.confirm(`Stand „${v.label}" laden? Nicht gesicherte Änderungen gehen verloren.`)) onRestore(v.doc);
  };

  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const diff = selected ? diffProjects(selected.doc, currentDoc) : null;
  const fmt = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal tool-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tool-head">
          <h3><Icon name="undo" size={18} /> Versionen &amp; Vergleich</h3>
          <button className="fp-icon-btn fp-close" onClick={onClose} title="Schließen">✕</button>
        </div>
        <div className="tool-body">
          <div className="ver-list">
            <div className="ver-save">
              <input value={label} placeholder="Version benennen (z. B. Stand Probe 1)…"
                onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }} />
              <button className="btn-primary" onClick={onSave}><Icon name="save" size={14} /> Sichern</button>
            </div>
            {versions.length === 0 ? (
              <div className="ver-empty">Noch keine Versionen. Sichere den aktuellen Stand, um später zu vergleichen.</div>
            ) : versions.map((v) => (
              <div key={v.id} className={`ver-row ${v.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(v.id)}>
                <div className="ver-meta">
                  <b>{v.label}</b>
                  <span>{fmt(v.savedAt)} · {v.doc.fixtures?.length ?? 0} Leuchten</span>
                </div>
                <button className="ver-act" title="Diesen Stand laden" onClick={(e) => { e.stopPropagation(); restore(v); }}><Icon name="open" size={15} /></button>
                <button className="ver-act danger" title="Version löschen" onClick={(e) => { e.stopPropagation(); onDelete(v.id); }}><Icon name="trash" size={15} /></button>
              </div>
            ))}
          </div>
          <div className="tool-content ver-diff">
            {!selected ? (
              <div className="tool-empty">Wähle links eine Version, um die Änderungen bis zum aktuellen Stand zu sehen.</div>
            ) : diff && diff.total === 0 ? (
              <div className="rig-clean">✓ Keine Unterschiede zum aktuellen Stand.</div>
            ) : diff && (
              <>
                <div className="diff-summary">
                  <b>{diff.total}</b> Änderung{diff.total === 1 ? '' : 'en'} seit „{selected.label}" → <b>{projectName || 'aktuell'}</b>
                </div>
                {CATS.map((c) => <CategorySection key={c.key} label={c.label} diff={diff[c.key]} />)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VersionDialog;
