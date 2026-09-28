// ZIP lesen — gerade so viel, wie eine GDTF-Datei braucht: Zentralverzeichnis,
// Methode 0 (stored) und 8 (deflate). Entpackt wird mit `DecompressionStream`,
// das Browser, Electron und Node gleichermassen haben; kein Paket dafuer.

export interface ZipEntry { name: string; method: number; offset: number; compressed: number }

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export function zipEntries(b: Uint8Array): ZipEntry[] {
  // End of Central Directory: von hinten suchen, der Kommentar darf bis 64 KiB lang sein.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('broken zip directory');
    const method = u16(b, p + 10);
    const compressed = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    // Die Daten beginnen hinter dem LOKALEN Kopf, dessen Extrafeld anders lang sein kann.
    const offset = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    out.push({ name, method, offset, compressed });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export async function zipRead(b: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const raw = b.slice(e.offset, e.offset + e.compressed);
  if (e.method === 0) return raw;
  if (e.method !== 8) throw new Error(`zip method ${e.method} not supported`);
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
