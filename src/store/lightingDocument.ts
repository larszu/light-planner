// The serializable lighting document — everything that defines a lighting plan
// except the host-level metadata. This is the unit a host (Cable-Planner)
// embeds in its own project file and round-trips. Pure data + (de)serialize.
import type { ProjectData } from '../core';

export type LightingDocument = Omit<ProjectData, 'meta'>;

export function serializeLightingDocument(doc: LightingDocument): string {
  return JSON.stringify(doc);
}

export function parseLightingDocument(json: string): LightingDocument {
  const d = JSON.parse(json);
  if (!d || !Array.isArray(d.fixtures)) throw new Error('Keine gültige Lichtplan-Daten.');
  return d as LightingDocument;
}
