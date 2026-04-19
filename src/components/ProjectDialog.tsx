import React, { useState, useEffect } from 'react';
import type { ProjectMeta, ProjectData } from '../types';

interface Props {
  mode: 'save' | 'load';
  currentMeta?: ProjectMeta;
  onSave: (meta: ProjectMeta) => void;
  onLoad: (project: ProjectData) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function deleteProjectFromStorage(id: string) {
  const list = loadProjectList().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const ProjectDialog: React.FC<Props> = ({ mode, currentMeta, onSave, onLoad, onDelete, onCancel }) => {
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
          <h3>Projekt speichern</h3>
          <div className="editor-grid">
            <label>Projektname*
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mein Lichtplan" />
            </label>
            <label>Autor
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Name" />
            </label>
            <label>Version
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
            </label>
            <label>Notizen
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Beschreibung…" />
            </label>
          </div>
          <div className="modal-actions">
            <button onClick={onCancel}>Abbrechen</button>
            <button className="primary" onClick={handleSave} disabled={!name.trim()}>Speichern</button>
          </div>
        </div>
      </div>
    );
  }

  // Load mode
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal project-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Projekt laden</h3>
        {projects.length === 0 ? (
          <p className="dialog-hint">Keine gespeicherten Projekte vorhanden.</p>
        ) : (
          <div className="project-list">
            {projects.map((p) => (
              <div key={p.id} className="project-list-item">
                <div className="project-list-info" onClick={() => onLoad(p.data)}>
                  <div className="project-list-name">{p.meta.name}</div>
                  <div className="project-list-meta">
                    v{p.meta.version} · {p.meta.author || 'Kein Autor'}
                    {' · '}
                    {new Date(p.meta.updatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {p.meta.notes && <div className="project-list-notes">{p.meta.notes}</div>}
                </div>
                <button className="project-delete-btn" onClick={() => handleDelete(p.id)} title="Löschen">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onCancel}>Schließen</button>
        </div>
      </div>
    </div>
  );
};

export default ProjectDialog;
