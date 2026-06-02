// ── Save / open files at a user-chosen location ──────────────────────
// Uses the File System Access API (Chromium, Electron) so the user can pick
// *where* a file goes; falls back to a normal download / file-input when the
// API isn't available (e.g. Firefox/Safari).

interface WritableLike { write: (b: Blob) => Promise<void>; close: () => Promise<void> }
interface FileHandleLike { name?: string; createWritable: () => Promise<WritableLike>; getFile: () => Promise<File> }
type AcceptMap = Record<string, string[]>;

/**
 * Save a Blob. Returns the chosen file name on success, or null if the user
 * cancelled the picker. Falls back to a download when no picker is available.
 */
export async function saveBlobToFile(blob: Blob, suggestedName: string, accept?: AcceptMap): Promise<string | null> {
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileHandleLike> }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName,
        types: accept ? [{ description: 'Datei', accept }] : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name ?? suggestedName;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null; // user cancelled
      // any other error → fall through to the download fallback
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return suggestedName;
}

/** Open a text file chosen by the user. Returns its name + contents, or null. */
export async function openTextFile(accept?: AcceptMap): Promise<{ name: string; text: string } | null> {
  const picker = (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileHandleLike[]> }).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({ types: accept ? [{ description: 'Datei', accept }] : undefined, multiple: false });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text() };
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = Object.values(accept).flat().join(',');
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.click();
  });
}

/** True when the browser lets the user pick a save location. */
export const canPickSaveLocation = typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
