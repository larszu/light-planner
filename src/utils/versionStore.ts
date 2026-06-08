// Lightweight version snapshots for "what changed" comparisons. Stored in
// localStorage, separate from the project list so snapshots never bloat the
// saved project. The (potentially large) floor-plan bitmap is dropped from
// snapshots — diffs cover the rig, not the imported plan image.
import type { ProjectData } from '../types';

export interface ProjectVersion {
  id: string;
  projectId: string;
  label: string;
  savedAt: string; // ISO
  doc: ProjectData;
}

const KEY = 'lp-versions';
const MAX_PER_PROJECT = 20;

export function loadVersions(): ProjectVersion[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProjectVersion[]) : [];
  } catch {
    return [];
  }
}

export function versionsFor(projectId: string): ProjectVersion[] {
  return loadVersions()
    .filter((v) => v.projectId === projectId)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function persist(list: ProjectVersion[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function saveVersion(projectId: string, label: string, doc: ProjectData): ProjectVersion {
  const slim: ProjectData = { ...doc, floorPlan: undefined };
  const version: ProjectVersion = {
    id: 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    projectId,
    label: label.trim() || new Date().toLocaleString('de-DE'),
    savedAt: new Date().toISOString(),
    doc: slim,
  };
  let list = loadVersions();
  list.push(version);
  // Cap snapshots per project (drop the oldest).
  const mine = list.filter((v) => v.projectId === projectId).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  if (mine.length > MAX_PER_PROJECT) {
    const drop = new Set(mine.slice(0, mine.length - MAX_PER_PROJECT).map((v) => v.id));
    list = list.filter((v) => !drop.has(v.id));
  }
  try {
    persist(list);
  } catch {
    throw new Error('Lokaler Speicher voll – ältere Versionen löschen oder Grundriss verkleinern.');
  }
  return version;
}

export function deleteVersion(id: string) {
  persist(loadVersions().filter((v) => v.id !== id));
}
