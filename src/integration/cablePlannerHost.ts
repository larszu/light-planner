// ───────────────────────────────────────────────────────────────────────────
// CablePlannerHost — a HostAdapter wired to Cable-Planner's preload bridge.
//
// Mirrors the real bridge surface (cable-planner/src/renderer/lib/bridge.ts):
//   window.bridge.project.{ saveProject, openProject, saveProjectAs }
//   window.bridge.fs.{ readFile, writeFile }
//
// In Cable-Planner the lighting document is embedded in the host's
// CablePlannerProject (the host owns Save/Open of the whole file), so the
// document save/load here delegate to host callbacks; only the image/PDF export
// touches the bridge filesystem directly. Construct with the hooks the host
// provides and pass to <HostProvider adapter={...}>.
// ───────────────────────────────────────────────────────────────────────────

import type { HostAdapter } from './hostAdapter';
import type { ExtractResult } from '../utils/aiExtract';

interface CablePlannerBridgeFs {
  writeFile: (filePath: string, data: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
}

export interface CablePlannerHostDeps {
  /** Save binary export (PNG/JPG/PDF). Host decides the path/dialog.
   *  Default tries window.bridge.fs + a host-provided pickSavePath. */
  saveBinary?: (blob: Blob, suggestedName: string) => Promise<void>;
  /** Embed the lighting document JSON into the host project (host saves the file). */
  onSaveDocument?: (json: string, suggestedName: string) => Promise<void>;
  /** Pull the lighting document JSON back out of the host project. */
  onLoadDocument?: () => Promise<{ name: string; text: string } | null>;
  /** Route AI datasheet extraction through the host's aiSuggestions service. */
  aiExtract?: (datasheet: string, opts: { apiKey: string; model: string }) => Promise<ExtractResult>;
  /** Optional direct bridge fs (defaults to window.bridge.fs if present). */
  fs?: CablePlannerBridgeFs;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

export function createCablePlannerHost(deps: CablePlannerHostDeps = {}): HostAdapter {
  const fs = deps.fs ?? (typeof window !== 'undefined' ? (window as unknown as { bridge?: { fs?: CablePlannerBridgeFs } }).bridge?.fs : undefined);

  return {
    info: { name: 'Cable-Planner', canPickLocation: true },

    async exportFile(blob, suggestedName) {
      if (deps.saveBinary) { await deps.saveBinary(blob, suggestedName); return; }
      // Fallback: write through the bridge fs to a host-supplied path. A real
      // host wires saveBinary to its export/save-dialog pipeline.
      if (fs) { await fs.writeFile(suggestedName, await blobToBase64(blob)); return; }
      throw new Error('CablePlannerHost: no saveBinary hook and no bridge.fs available.');
    },

    async saveProjectFile(json, suggestedName) {
      if (deps.onSaveDocument) { await deps.onSaveDocument(json, suggestedName); return; }
      if (fs) { await fs.writeFile(suggestedName, json); return; }
      throw new Error('CablePlannerHost: no onSaveDocument hook.');
    },

    async openProjectFile() {
      if (deps.onLoadDocument) return deps.onLoadDocument();
      return null;
    },

    extractDatasheet: deps.aiExtract,
  };
}
