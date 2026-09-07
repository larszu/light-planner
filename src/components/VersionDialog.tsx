import React, { useRef, useState } from 'react';
import type { ProjectData } from '../types';
import { versionsFor, saveVersion, deleteVersion, type ProjectVersion } from '../utils/versionStore';
import { diffProjects } from '../core/diff';
import { parseAvPlan } from '../core/avplan';
import {
  CATEGORY_LABEL, KIND_LABEL, MERGE_REFUSAL_LABEL, SIDE_LABEL, applyMerge, mergePlan, openCount,
  type MergeEntry, type MergePlan, type MergeSide,
} from '../core/rigMerge';
import DiffView from './DiffView';
import Icon from './Icon';
import { useTranslation } from '../i18n';

interface Props {
  projectId: string;
  projectName: string;
  currentDoc: ProjectData;
  onRestore: (doc: ProjectData) => void;
  onClose: () => void;
}

// Save named snapshots of the rig and see exactly what changed since any of
// them — added / removed / moved / re-patched / re-gelled, field by field.
const VersionDialog: React.FC<Props> = ({ projectId, projectName, currentDoc, onRestore, onClose }) => {
  const { t, language } = useTranslation();
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
    const frage = t(
      'version.restoreConfirm',
      'Stand „{label}" laden? Nicht gesicherte Änderungen gehen verloren.',
    ).replace('{label}', v.label);
    if (window.confirm(frage)) onRestore(v.doc);
  };

  // ── BEDARF 138 — zwei auseinandergelaufene Kopien zusammenfuehren ────────
  //
  // Der gewaehlte Stand ist der gemeinsame Ausgangspunkt. Ohne ihn liesse
  // sich „die andere Seite hat es angelegt" nicht von „ich habe es geloescht"
  // unterscheiden — und die falsche der beiden Antworten ist genau der
  // Datenverlust aus `showstack#38`.
  const otherFileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [otherName, setOtherName] = useState('');
  const [theirDoc, setTheirDoc] = useState<ProjectData | null>(null);

  const waehle = (id: string, category: string, choice: MergeSide) =>
    setPlan((p) => (p ? {
      ...p,
      entries: p.entries.map((e) =>
        (e.id === id && e.category === category ? { ...e, choice } : e)),
    } : p));

  const uebernehmen = () => {
    if (!plan || !theirDoc) return;
    const entschieden = plan.entries.filter((e) => e.choice);
    if (entschieden.length === 0) return;
    const frage = t(
      'merge.confirm',
      '{n} von {total} Einträgen übernehmen? Alles ohne Wahl bleibt, wie es hier ist.',
    ).replace('{n}', String(entschieden.length)).replace('{total}', String(plan.entries.length));
    if (!window.confirm(frage)) return;
    onRestore(applyMerge(currentDoc, theirDoc, plan.entries));
  };

  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const diff = selected ? diffProjects(selected.doc, currentDoc) : null;
  // Datumsformat folgt der Oberflaechensprache — hart 'de-DE' haette in der
  // englischen Fassung weiter das deutsche Format gezeigt.
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(language === 'en' ? 'en-US' : 'de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal tool-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tool-head">
          <h3><Icon name="undo" size={18} /> {t('version.title', 'Versionen & Vergleich')}</h3>
          <button className="fp-icon-btn fp-close" onClick={onClose} title={t('common.close', 'Schließen')}>✕</button>
        </div>
        <div className="tool-body">
          <div className="ver-list">
            <div className="ver-save">
              <input value={label} placeholder={t('version.namePlaceholder', 'Version benennen (z. B. Stand Probe 1)…')}
                onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }} />
              <button className="btn-primary" onClick={onSave}><Icon name="save" size={14} /> {t('version.save', 'Sichern')}</button>
            </div>
            {versions.length === 0 ? (
              <div className="ver-empty">{t('version.empty', 'Noch keine Versionen. Sichere den aktuellen Stand, um später zu vergleichen.')}</div>
            ) : versions.map((v) => (
              <div key={v.id} className={`ver-row ${v.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(v.id)}>
                <div className="ver-meta">
                  <b>{v.label}</b>
                  <span>{fmt(v.savedAt)} · {v.doc.fixtures?.length ?? 0} {t('version.fixtures', 'Leuchten')}</span>
                </div>
                <button className="ver-act" title={t('version.restore', 'Diesen Stand laden')} onClick={(e) => { e.stopPropagation(); restore(v); }}><Icon name="open" size={15} /></button>
                <button className="ver-act danger" title={t('version.delete', 'Version löschen')} onClick={(e) => { e.stopPropagation(); onDelete(v.id); }}><Icon name="trash" size={15} /></button>
              </div>
            ))}
          </div>
          <div className="tool-content ver-diff">
            {!selected ? (
              <div className="tool-empty">{t('version.pick', 'Wähle links eine Version, um die Änderungen bis zum aktuellen Stand zu sehen.')}</div>
            ) : diff && diff.total === 0 && diff.unnamed.length === 0 ? (
              /* B-21: „Keine Unterschiede" nur, wenn AUCH die acht nicht
                 aufgeschluesselten Kategorien gleich sind. Sonst ist der Satz
                 keine Luecke in der Anzeige, sondern eine Falschaussage — und
                 der Nutzer verwirft daraufhin eine Version, die sich sehr wohl
                 unterscheidet. */
              <div className="rig-clean">✓ {t('version.noDiff', 'Keine Unterschiede zum aktuellen Stand.')}</div>
            ) : diff && (
              <>
                {/* BEDARF 138 — der Weg zum Zusammenfuehren. Er haengt am
                    gewaehlten Stand: der ist der gemeinsame Ausgangspunkt,
                    ohne den ein Abgleich raten muesste. */}
                <div className="diff-summary">
                  <button className="btn-secondary" onClick={() => otherFileRef.current?.click()}>
                    <Icon name="import" size={14} />{' '}
                    {t('merge.load', 'Andere Fassung laden (.avplan) und zusammenführen…')}
                  </button>
                  <input
                    ref={otherFileRef}
                    type="file"
                    accept=".avplan,.json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const datei = e.target.files?.[0];
                      e.target.value = '';
                      if (!datei) return;
                      const leser = new FileReader();
                      leser.onload = () => {
                        setPlan(null); setTheirDoc(null); setOtherName(datei.name);
                        try {
                          const avplan = parseAvPlan(String(leser.result ?? ''));
                          const licht = avplan.domains.lighting as ProjectData | undefined;
                          if (!licht) {
                            // Benannt, nicht stumm: eine .avplan ohne
                            // Licht-Domaene ist kein kaputtes Zusammenfuehren,
                            // sondern die falsche Datei.
                            setMergeError(t('merge.noLighting', 'Diese Datei enthält keine Licht-Domäne — es gibt nichts zusammenzuführen.'));
                            return;
                          }
                          const p = mergePlan(selected.doc, currentDoc, licht);
                          if ('refusal' in p) { setMergeError(MERGE_REFUSAL_LABEL[p.refusal]); return; }
                          setMergeError(null); setTheirDoc(licht); setPlan(p);
                        } catch (err) {
                          setMergeError(err instanceof Error ? err.message : String(err));
                        }
                      };
                      leser.readAsText(datei);
                    }}
                  />
                </div>
                {mergeError && (
                  <ul className="rig-issues">
                    <li className="rig-issue sev-error"><span className="rig-dot" />{mergeError}</li>
                  </ul>
                )}
                {plan && (
                  <div className="merge-plan">
                    <div className="diff-summary">
                      <b>{plan.entries.length}</b>{' '}
                      {t('merge.entries', 'Unterschiede gegenüber')} „{otherName}" ·{' '}
                      <b>{plan.counts.conflict}</b> {t('merge.conflicts', 'Konflikte')} ·{' '}
                      <b>{openCount(plan.entries)}</b> {t('merge.open', 'ohne Wahl')}
                    </div>
                    {plan.untouched.length > 0 && (
                      <div className="prop-derived">
                        {t('merge.untouched', 'Nicht angefasst')}: {plan.untouched.join(', ')} —{' '}
                        {t('merge.untouchedNote', 'diese Bereiche bleiben, wie sie hier sind. Eine Zusammenführung, die darüber schweigt, wird für vollständig gehalten.')}
                      </div>
                    )}
                    <table className="schedule-table">
                      <thead>
                        <tr>
                          <th>{t('merge.what', 'Was')}</th>
                          <th>{t('merge.object', 'Objekt')}</th>
                          <th>{t('merge.diff', 'Unterschied')}</th>
                          <th>{t('merge.take', 'Übernehmen')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.entries.map((e: MergeEntry) => (
                          <tr key={`${e.category}:${e.id}`} className={e.kind === 'conflict' ? 'sev-warning' : undefined}>
                            <td>
                              {KIND_LABEL[e.kind]}
                              {e.side ? ` (${SIDE_LABEL[e.side]})` : ''}
                            </td>
                            <td>{CATEGORY_LABEL[e.category]}: {e.label}</td>
                            <td>
                              {e.fields.length === 0
                                ? '—'
                                : e.fields.map((f) => `${f.field}: ${f.from} → ${f.to}`).join(' · ')}
                            </td>
                            <td>
                              <button
                                className={e.choice === 'mine' ? 'btn-primary' : 'btn-secondary'}
                                onClick={() => waehle(e.id, e.category, 'mine')}
                              >{t('merge.mine', 'meine')}</button>{' '}
                              <button
                                className={e.choice === 'theirs' ? 'btn-primary' : 'btn-secondary'}
                                onClick={() => waehle(e.id, e.category, 'theirs')}
                              >{t('merge.theirs', 'ihre')}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="diff-summary">
                      <button
                        className="btn-primary"
                        disabled={plan.entries.every((e) => !e.choice)}
                        onClick={uebernehmen}
                      >{t('merge.apply', 'Gewählte übernehmen')}</button>{' '}
                      <span className="prop-derived">
                        {t('merge.applyNote', 'Nur Einträge mit Wahl. Alles andere bleibt, wie es hier ist — eine Vorbelegung wäre eine Entscheidung, die niemand getroffen hat.')}
                      </span>
                    </div>
                  </div>
                )}
                <div className="diff-summary">
                  <b>{diff.total}</b>{' '}
                  {diff.total === 1
                    ? t('version.change', 'Änderung')
                    : t('version.changes', 'Änderungen')}{' '}
                  {t('version.since', 'seit')} „{selected.label}" →{' '}
                  <b>{projectName || t('version.current', 'aktuell')}</b>
                  {/* Die Zahl zaehlt nur, was aufgeschluesselt wurde. Was
                      darueber hinaus anders ist, steht daneben — nicht
                      stillschweigend in der Zahl versteckt und nicht
                      verschwiegen. */}
                  {diff.unnamed.length > 0 && (
                    <>
                      {' · '}
                      {t('version.alsoChanged', '{cats} auch geändert (ohne Detail)')
                        .replace('{cats}', diff.unnamed.join(', '))}
                    </>
                  )}
                </div>
                <DiffView diff={diff} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VersionDialog;
