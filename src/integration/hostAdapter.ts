// ───────────────────────────────────────────────────────────────────────────
// HostAdapter — the seam between the lighting UI and its platform.
//
// Standalone (this app) the platform is the browser: downloads / File System
// Access API / a direct AI call. Inside Cable-Planner the same operations route
// through the Electron preload bridge (atomic file writes, the host's export
// pipeline, the multi-provider aiSuggestions service + credentials keychain).
//
// Components never call browser APIs directly — they ask the injected adapter,
// so dropping the planner into another host is a matter of providing one.
// ───────────────────────────────────────────────────────────────────────────

import type { ExtractResult } from '../utils/aiExtract';

export interface HostInfo {
  /** Human-readable host name, e.g. "Browser (standalone)" or "Cable-Planner". */
  readonly name: string;
  /** Whether the host lets the user pick a save location (vs. plain download). */
  readonly canPickLocation: boolean;
}

export interface HostAdapter {
  readonly info: HostInfo;

  /** Save an exported artifact (PNG/JPG/PDF) — host decides the destination. */
  exportFile(blob: Blob, suggestedName: string, accept?: Record<string, string[]>): Promise<void>;

  /** Persist the lighting document (JSON) — host decides where/how. */
  saveProjectFile(json: string, suggestedName: string): Promise<void>;

  /** Load a lighting document the user chooses. Null when cancelled. */
  openProjectFile(): Promise<{ name: string; text: string } | null>;

  /** Optional: extract fixture specs from a datasheet (host may use its own AI). */
  extractDatasheet?(datasheet: string, opts: { apiKey: string; model: string }): Promise<ExtractResult>;
}
