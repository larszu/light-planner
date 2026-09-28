import { create } from 'zustand';
import { DmxMerger, parsePacket, type SourceInfo } from '../core/dmxInput';

// DMX-Eingang im Renderer: nimmt die rohen Pakete aus dem Hauptprozess,
// fuehrt sie zusammen und veroeffentlicht die Universes gedrosselt.
//
// WARUM GEDROSSELT. Ein Pult sendet bis zu 44 Bilder je Sekunde und Universe.
// Die 3D-Ansicht baut bei jeder Aenderung der Leuchten ihre Szene neu, die
// Heatmap rechnet neu — mit voller Rate stockt das Fenster. `FRAME_MS` ist die
// Grenze, unterhalb der ein Fader noch fluessig wirkt.

export const FRAME_MS = 80;

interface DmxBridge {
  interfaces: () => Promise<{ name: string; address: string }[]>;
  start: (o: { artnet: boolean; sacn: boolean; universes: number[]; iface?: string }) => Promise<{ ok: boolean; errors: string[] }>;
  setUniverses: (o: { universes: number[]; iface?: string }) => Promise<{ errors: string[] }>;
  stop: () => Promise<boolean>;
  onPacket: (cb: (data: Uint8Array, from: string) => void) => () => void;
}

export const dmxBridge = (): DmxBridge | undefined =>
  (globalThis as { lightPlannerDmx?: DmxBridge }).lightPlannerDmx;

export interface DmxInSettings {
  artnet: boolean;
  sacn: boolean;
  /** Art-Net-Nummer von Plan-Universe 1. */
  artnetBase: number;
  /** IPv4 der Netzwerkkarte fuer sACN; leer = alle. */
  iface: string;
}

const SETTINGS_KEY = 'lp-dmx-in';
const DEFAULTS: DmxInSettings = { artnet: true, sacn: true, artnetBase: 0, iface: '' };

function loadSettings(): DmxInSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface DmxLiveState {
  running: boolean;
  settings: DmxInSettings;
  universes: Map<number, Uint8Array>;
  sources: SourceInfo[];
  errors: string[];
  packets: number;
  start: (planUniverses: number[]) => Promise<void>;
  stop: () => Promise<void>;
  setSettings: (s: Partial<DmxInSettings>) => void;
  setPlanUniverses: (u: number[]) => void;
}

const merger = new DmxMerger();
let unsubscribe: (() => void) | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let statusTimer: ReturnType<typeof setInterval> | null = null;
let packetCount = 0;
let lastUniverses = '';

const fingerprint = (m: Map<number, Uint8Array>): string => {
  let s = '';
  for (const [u, d] of [...m].sort((a, b) => a[0] - b[0])) {
    s += `${u}:`;
    // FNV-1a genuegt, um „nichts hat sich bewegt" zu erkennen.
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 0x01000193);
    s += `${h >>> 0};`;
  }
  return s;
};

export const useDmxLive = create<DmxLiveState>((set, get) => {
  const flush = () => {
    flushTimer = null;
    const universes = merger.universes(Date.now());
    const fp = fingerprint(universes);
    if (fp === lastUniverses) return;
    lastUniverses = fp;
    set({ universes });
  };

  return {
    running: false,
    settings: loadSettings(),
    universes: new Map(),
    sources: [],
    errors: [],
    packets: 0,

    start: async (planUniverses) => {
      const bridge = dmxBridge();
      if (!bridge) {
        set({ errors: ['desktop-only'] });
        return;
      }
      const { settings } = get();
      merger.setArtnetBase(settings.artnetBase);
      unsubscribe?.();
      unsubscribe = bridge.onPacket((data, from) => {
        const frame = parsePacket(data, from);
        if (!frame) return;
        packetCount++;
        merger.push(frame, Date.now());
        if (!flushTimer) flushTimer = setTimeout(flush, FRAME_MS);
      });
      const r = await bridge.start({
        artnet: settings.artnet, sacn: settings.sacn, universes: planUniverses,
        iface: settings.iface || undefined,
      });
      if (statusTimer) clearInterval(statusTimer);
      statusTimer = setInterval(() => {
        const now = Date.now();
        set({ sources: merger.sourceList(now), packets: packetCount });
        packetCount = 0;
        // Schweigt eine Quelle, faellt ihr Universe aus dem Abbild — auch ohne neues Paket.
        flush();
      }, 1000);
      set({ running: r.ok, errors: r.errors });
    },

    stop: async () => {
      unsubscribe?.();
      unsubscribe = null;
      if (statusTimer) clearInterval(statusTimer);
      statusTimer = null;
      await dmxBridge()?.stop();
      lastUniverses = '';
      set({ running: false, universes: new Map(), sources: [], packets: 0 });
    },

    setSettings: (s) => {
      const settings = { ...get().settings, ...s };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* nur Komfort */ }
      merger.setArtnetBase(settings.artnetBase);
      set({ settings });
    },

    setPlanUniverses: (u) => {
      const { running, settings } = get();
      if (!running || !settings.sacn) return;
      void dmxBridge()?.setUniverses({ universes: u, iface: settings.iface || undefined })
        .then((r) => set({ errors: r.errors }));
    },
  };
});
