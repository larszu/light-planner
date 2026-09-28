// ───────────────────────────────────────────────────────────────────────────
// DMX aus dem Netz: Art-Net (ArtDmx) und sACN (E1.31) lesen und je Universe
// zu EINEM Kanalabbild zusammenfuehren.
//
// Der Hauptprozess reicht nur rohe UDP-Pakete durch; gedeutet wird hier, damit
// es ohne Netz pruefbar ist (`npm run dmxlive:check`).
//
// ─── ZUSAMMENFUEHREN ───────────────────────────────────────────────────────
//
// Senden zwei Quellen dasselbe Universe (Pult und Backup, zwei Nodes), gilt:
// die hoechste sACN-Prioritaet gewinnt, gleich hohe werden HTP gemischt
// (hoechster Wert je Kanal). Art-Net hat keine Prioritaet und zaehlt als 100,
// den sACN-Standard. Eine Quelle, die 2,5 s schweigt, faellt heraus — der Wert
// aus E1.31 (`E131_NETWORK_DATA_LOSS_TIMEOUT`). Ohne diese Grenze bliebe das
// letzte Bild eines abgesteckten Pults fuer immer stehen.
//
// REIN: keine Datei, kein Netz. Die Uhr kommt als Argument.
// ───────────────────────────────────────────────────────────────────────────

export type DmxProtocolIn = 'artnet' | 'sacn';

export interface DmxFrame {
  protocol: DmxProtocolIn;
  /** Universe in der Zaehlung des Protokolls: Art-Net Port-Address, sACN 1..63999. */
  universe: number;
  /** Quelle: Art-Net die Absenderadresse, sACN die CID. */
  source: string;
  priority: number;
  /** sACN: Stream beendet — die Quelle meldet sich ab. */
  terminated?: boolean;
  data: Uint8Array;
  /** Anzeigename der Quelle (sACN Source Name). */
  name?: string;
}

export const ARTNET_PORT = 6454;
export const SACN_PORT = 5568;
export const SOURCE_TIMEOUT_MS = 2500;

const ascii = (b: Uint8Array, from: number, len: number): string => {
  let s = '';
  for (let i = from; i < from + len && i < b.length; i++) {
    if (b[i] === 0) break;
    s += String.fromCharCode(b[i]);
  }
  return s;
};

/** ArtDmx lesen. Alles andere (Poll, Sync, fremde Pakete) ergibt `null`. */
export function parseArtNet(b: Uint8Array, from = ''): DmxFrame | null {
  if (b.length < 18 || ascii(b, 0, 8) !== 'Art-Net' || b[7] !== 0) return null;
  const opcode = b[8] | (b[9] << 8);
  if (opcode !== 0x5000) return null;
  const length = (b[16] << 8) | b[17];
  if (length < 2 || length > 512 || b.length < 18 + length) return null;
  return {
    protocol: 'artnet',
    universe: ((b[15] & 0x7f) << 8) | b[14],
    source: from,
    priority: 100,
    data: b.slice(18, 18 + length),
  };
}

const SACN_ID = 'ASC-E1.17';

/** E1.31-Datenpaket lesen. Nur Startcode 0; Preview-Daten zaehlen nicht. */
export function parseSacn(b: Uint8Array): DmxFrame | null {
  if (b.length < 126 || ascii(b, 4, 12) !== SACN_ID) return null;
  const rootVector = (b[18] << 24) | (b[19] << 16) | (b[20] << 8) | b[21];
  const frameVector = (b[40] << 24) | (b[41] << 16) | (b[42] << 8) | b[43];
  if (rootVector !== 0x04 || frameVector !== 0x02 || b[117] !== 0x02) return null;
  const options = b[112];
  if (options & 0x80) return null; // Preview Data: fuer Visualisierer daneben, nicht fuer die Buehne
  const count = (b[123] << 8) | b[124];
  if (b[125] !== 0) return null; // Startcode ≠ 0 ist kein Dimmerwert
  const slots = Math.min(count - 1, 512, b.length - 126);
  let cid = '';
  for (let i = 22; i < 38; i++) cid += b[i].toString(16).padStart(2, '0');
  return {
    protocol: 'sacn',
    universe: (b[113] << 8) | b[114],
    source: cid,
    priority: b[108],
    terminated: (options & 0x40) !== 0,
    data: b.slice(126, 126 + Math.max(0, slots)),
    name: ascii(b, 44, 64),
  };
}

export function parsePacket(b: Uint8Array, from = ''): DmxFrame | null {
  return parseArtNet(b, from) ?? parseSacn(b);
}

/** sACN-Multicast-Gruppe eines Universe (E1.31 §9.3.1). */
export const sacnGroup = (universe: number): string =>
  `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`;

/**
 * Plan-Universe (1-basiert, wie im Patch) → Universe des Protokolls.
 * sACN zaehlt ab 1 wie der Plan. Art-Net zaehlt ab 0; `artnetBase` ist die
 * Art-Net-Nummer von Plan-Universe 1 (die meisten Pulte: 0, manche: 1).
 */
export const toProtocolUniverse = (planUniverse: number, protocol: DmxProtocolIn, artnetBase = 0): number =>
  protocol === 'sacn' ? planUniverse : planUniverse - 1 + artnetBase;

export const toPlanUniverse = (universe: number, protocol: DmxProtocolIn, artnetBase = 0): number =>
  protocol === 'sacn' ? universe : universe + 1 - artnetBase;

// ─── Zusammenfuehren ───────────────────────────────────────────────────────

interface SourceState { frame: DmxFrame; at: number }

export interface SourceInfo {
  protocol: DmxProtocolIn;
  source: string;
  name?: string;
  universe: number;
  priority: number;
  lastSeen: number;
}

export class DmxMerger {
  private sources = new Map<string, SourceState>();
  private artnetBase: number;

  constructor(artnetBase = 0) {
    this.artnetBase = artnetBase;
  }

  setArtnetBase(base: number): void {
    this.artnetBase = base;
  }

  /** Paket aufnehmen. Liefert das Plan-Universe, das sich geaendert haben kann. */
  push(frame: DmxFrame, now: number): number {
    const key = `${frame.protocol}|${frame.universe}|${frame.source}`;
    if (frame.terminated) this.sources.delete(key);
    else this.sources.set(key, { frame, at: now });
    return toPlanUniverse(frame.universe, frame.protocol, this.artnetBase);
  }

  private live(now: number): SourceState[] {
    const out: SourceState[] = [];
    for (const [k, s] of this.sources) {
      if (now - s.at > SOURCE_TIMEOUT_MS) this.sources.delete(k);
      else out.push(s);
    }
    return out;
  }

  /** Das zusammengefuehrte Abbild eines Plan-Universe; `null`, wenn niemand sendet. */
  universe(planUniverse: number, now: number): Uint8Array | null {
    const mine = this.live(now).filter(
      (s) => toPlanUniverse(s.frame.universe, s.frame.protocol, this.artnetBase) === planUniverse,
    );
    if (mine.length === 0) return null;
    const top = Math.max(...mine.map((s) => s.frame.priority));
    const out = new Uint8Array(512);
    for (const s of mine) {
      if (s.frame.priority !== top) continue;
      const d = s.frame.data;
      for (let i = 0; i < d.length; i++) if (d[i] > out[i]) out[i] = d[i];
    }
    return out;
  }

  /** Alle Plan-Universes, die gerade Daten haben. */
  universes(now: number): Map<number, Uint8Array> {
    const nums = new Set(this.live(now).map((s) => toPlanUniverse(s.frame.universe, s.frame.protocol, this.artnetBase)));
    const out = new Map<number, Uint8Array>();
    for (const u of nums) {
      const d = this.universe(u, now);
      if (d) out.set(u, d);
    }
    return out;
  }

  sourceList(now: number): SourceInfo[] {
    return this.live(now).map((s) => ({
      protocol: s.frame.protocol,
      source: s.frame.source,
      name: s.frame.name,
      universe: toPlanUniverse(s.frame.universe, s.frame.protocol, this.artnetBase),
      priority: s.frame.priority,
      lastSeen: s.at,
    }));
  }
}

// ─── Senden (Pruefsender, `scripts/dmx-send.mjs` baut dieselben Bytes) ─────

export function buildArtDmx(universe: number, data: Uint8Array, sequence = 0): Uint8Array {
  const len = Math.max(2, data.length + (data.length % 2));
  const b = new Uint8Array(18 + len);
  b.set([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00], 0);
  b[8] = 0x00; b[9] = 0x50;
  b[10] = 0; b[11] = 14;
  b[12] = sequence & 0xff;
  b[14] = universe & 0xff;
  b[15] = (universe >> 8) & 0x7f;
  b[16] = (len >> 8) & 0xff; b[17] = len & 0xff;
  b.set(data, 18);
  return b;
}

export function buildSacn(
  universe: number, data: Uint8Array,
  opts: { cid?: Uint8Array; name?: string; priority?: number; sequence?: number; terminated?: boolean } = {},
): Uint8Array {
  const slots = data.length;
  const b = new Uint8Array(126 + slots);
  const flen = (n: number) => 0x7000 | n;
  b[1] = 0x10;
  b.set([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0, 0, 0], 4);
  const root = flen(b.length - 16);
  b[16] = root >> 8; b[17] = root & 0xff;
  b[21] = 0x04;
  b.set(opts.cid ?? new Uint8Array(16).fill(0x11), 22);
  const frame = flen(b.length - 38);
  b[38] = frame >> 8; b[39] = frame & 0xff;
  b[43] = 0x02;
  const name = opts.name ?? 'light-planner';
  for (let i = 0; i < Math.min(63, name.length); i++) b[44 + i] = name.charCodeAt(i) & 0x7f;
  b[108] = opts.priority ?? 100;
  b[111] = (opts.sequence ?? 0) & 0xff;
  b[112] = opts.terminated ? 0x40 : 0;
  b[113] = universe >> 8; b[114] = universe & 0xff;
  const dmp = flen(b.length - 115);
  b[115] = dmp >> 8; b[116] = dmp & 0xff;
  b[117] = 0x02; b[118] = 0xa1;
  b[122] = 0x01;
  b[123] = (slots + 1) >> 8; b[124] = (slots + 1) & 0xff;
  b.set(data, 126);
  return b;
}
