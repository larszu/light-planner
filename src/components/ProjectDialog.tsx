import React, { useState, useEffect } from 'react';
import type { ProjectMeta, ProjectData } from '../types';
import { useTranslation } from '../i18n';

interface Props {
  mode: 'save' | 'load';
  currentMeta?: ProjectMeta;
  onSave: (meta: ProjectMeta) => void;
  /** Die gespeicherte Projekt-Id MUSS mitgehen: an ihr haengen die
   *  Versions-Schnappschuesse und die Zuordnung beim naechsten Speichern. */
  onLoad: (project: ProjectData, id: string) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
  /** Save the current project to a real file at a user-chosen location. */
  onSaveToFile?: () => void;
  /** Load a project from a real file the user picks. */
  onLoadFromFile?: () => void;
}

interface StoredProject {
  id: string;
  meta: ProjectMeta;
  data: ProjectData;
}

const STORAGE_KEY = 'light-planner-projects';

export function loadProjectList(): StoredProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProjectToStorage(id: string, meta: ProjectMeta, data: ProjectData) {
  const list = loadProjectList();
  const idx = list.findIndex((p) => p.id === id);
  const entry: StoredProject = { id, meta, data };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    throw new Error('Lokaler Speicher voll – evtl. ist das Grundriss-Bild zu groß. Tipp: Grundriss vor dem Speichern entfernen oder verkleinern.');
  }
}

export function deleteProjectFromStorage(id: string) {
  const list = loadProjectList().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const ProjectDialog: React.FC<Props> = ({ mode, currentMeta, onSave, onLoad, onDelete, onCancel, onSaveToFile, onLoadFromFile }) => {
  const { t, language } = useTranslation();
  const [name, setName] = useState(currentMeta?.name ?? '');
  const [author, setAuthor] = useState(currentMeta?.author ?? '');
  const [version, setVersion] = useState(currentMeta?.version ?? '1.0');
  const [notes, setNotes] = useState(currentMeta?.notes ?? '');
  const [projects, setProjects] = useState<StoredProject[]>([]);

  useEffect(() => {
    setProjects(loadProjectList());
  }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    const meta: ProjectMeta = {
      name: name.trim(),
      author: author.trim(),
      version: version.trim(),
      createdAt: currentMeta?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: notes.trim() || undefined,
    };
    onSave(meta);
  };

  const handleDelete = (id: string) => {
    onDelete(id);
    setProjects(loadProjectList());
  };

  if (mode === 'save') {
    return (
      <div className="modal-backdrop" onClick={onCancel}>
        <div className="modal project-modal" onClick={(e) => e.stopPropagation()}>
          <h3>{t('dlg.proj.saveTitle', 'Save project')}</h3>
          <div className="editor-grid">
            <label>{t('dlg.proj.name', 'Project name')}*
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('dlg.proj.namePh', 'My lighting plan')} />
            </label>
            <label>{t('dlg.proj.author', 'Author')}
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={t('dlg.proj.authorPh', 'Name')} />
            </label>
            <label>{t('dlg.proj.version', 'Version')}
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
            </label>
            <label>{t('dlg.proj.notes', 'Notes')}
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('dlg.proj.notesPh', 'Description…')} />
            </label>
          </div>
          {/* Drei Schluessel, weil zwei Auszeichnungen mitten im Absatz stehen
              (<strong> und <em>). Ein Satz um Markup herum zerschnitten ist die
              haeufigste Art, eine Uebersetzung unuebersetzbar zu machen -- hier
              ist jeder Teil fuer sich ein vollstaendiges Satzstueck. */}
          <p className="dialog-hint storage-hint">
            <strong>{t('dlg.proj.whereHead', 'Where does this go?')}</strong>{' '}
            {t('dlg.proj.whereBody', '"Save" puts the project into this device\'s browser storage – with no visible file path, and tied to this device. For a real file in a location you choose, use')}{' '}
            <em>{t('dlg.proj.whereFile', '"Save as file…"')}</em>.
          </p>
          <div className="modal-actions">
            <button onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
            {onSaveToFile && (
              <button onClick={() => { onSaveToFile(); onCancel(); }} title={t('dlg.proj.toFileHint', 'Save as a project file in a location you choose')}>
                {t('dlg.proj.toFile', 'Save as file…')}
              </button>
            )}
            <button className="primary" onClick={handleSave} disabled={!name.trim()}>{t('dlg.proj.saveDevice', 'Save (device)')}</button>
          </div>
        </div>
      </div>
    );
  }

  // Load mode
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal project-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('dlg.proj.loadTitle', 'Load project')}</h3>
        {projects.length === 0 ? (
          <p className="dialog-hint">
            {t('dlg.proj.empty', 'No projects stored on this device.')}
            {onLoadFromFile && ` ${t('dlg.proj.emptyFile', 'You can open a project file (.lightplan.json) below via "Load from file…".')}`}
          </p>
        ) : (
          <div className="project-list">
            {projects.map((p) => (
              <div key={p.id} className="project-list-item">
                <div className="project-list-info" onClick={() => onLoad(p.data, p.id)}>
                  <div className="project-list-name">{p.meta.name}</div>
                  <div className="project-list-meta">
                    v{p.meta.version} · {p.meta.author || t('dlg.proj.noAuthor', 'No author')}
                    {' · '}
                    {/* Das Gebietsschema war fest auf de-DE: ein englischer
                        Nutzer bekam sonst 04.09.2026 statt 04/09/2026. Eine
                        Uebersetzung, die das Datumsformat stehen laesst, ist
                        halb. */}
                    {new Date(p.meta.updatedAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {p.meta.notes && <div className="project-list-notes">{p.meta.notes}</div>}
                </div>
                <button className="project-delete-btn" onClick={() => handleDelete(p.id)} title={t('common.delete', 'Delete')}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onCancel}>{t('common.close', 'Close')}</button>
          {onLoadFromFile && (
            <button className="primary" onClick={() => { onLoadFromFile(); onCancel(); }} title={t('dlg.proj.fromFileHint', 'Open a project file you exported earlier')}>
              {t('dlg.proj.fromFile', 'Load from file…')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectDialog;
