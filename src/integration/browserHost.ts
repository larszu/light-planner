// Default HostAdapter for the standalone browser app: File System Access API
// (with download fallback) for files, and the direct Anthropic call for AI.
import type { HostAdapter } from './hostAdapter';
import { saveBlobToFile, openTextFile, canPickSaveLocation } from '../utils/fileSave';
import { extractFixtureSpecs } from '../utils/aiExtract';

export const browserHost: HostAdapter = {
  info: { name: 'Browser (standalone)', canPickLocation: canPickSaveLocation },

  async exportFile(blob, suggestedName, accept) {
    await saveBlobToFile(blob, suggestedName, accept);
  },

  async saveProjectFile(json, suggestedName) {
    await saveBlobToFile(new Blob([json], { type: 'application/json' }), suggestedName, { 'application/json': ['.json'] });
  },

  openProjectFile() {
    return openTextFile({ 'application/json': ['.json'] });
  },

  extractDatasheet(datasheet, opts) {
    return extractFixtureSpecs(datasheet, opts);
  },
};
