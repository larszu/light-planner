// Projektübergreifender Lager-Bestand für Light Planner — teilt das portable
// `avplan-inventory`-Format mit cable- und multicam-planner.
import { create } from 'zustand';
import type { InventoryItem, StorageNode, InventorySet, InventoryUnit } from './types';
import type { InventorySnapshot } from './portable';
import { mergeById } from './merge';

const KEY = 'light:inventory';

const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.round(Math.random() * 1e9)}`);

interface Persisted {
  items: InventoryItem[];
  nodes: StorageNode[];
  sets: InventorySet[];
  units: InventoryUnit[];
}

const load = (): Persisted => {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
    return {
      items: Array.isArray(d.items) ? d.items : [],
      nodes: Array.isArray(d.nodes) ? d.nodes : [],
      sets: Array.isArray(d.sets) ? d.sets : [],
      units: Array.isArray(d.units) ? d.units : [],
    };
  } catch {
    return { items: [], nodes: [], sets: [], units: [] };
  }
};

/**
 * Schreibt und MELDET, ob es geklappt hat.
 *
 * BEFUND (Defektformen-Sweep, Backlog B-36 der av-planner-suite, Form
 * `zustand-nach-fehler`): Hier stand ein leeres `catch { /* quota *\/ }`.
 * Bei vollem localStorage meldete der Import „N Objekte importiert", der
 * Bestand stand in der Oberflaeche — und war beim naechsten Start weg. Ein
 * Undo fuer diesen Store gibt es nicht, und es sind projektuebergreifende
 * Stammdaten: Geraete, Lagerorte, Einheiten, Codes.
 */
const persist = (s: Persisted): { storageFull: boolean } => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return { storageFull: false };
  } catch {
    return { storageFull: true };
  }
};

export type InventoryItemInput = Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>;

interface InventoryState extends Persisted {
  /** Der letzte Schreibvorgang ist an der Quota gescheitert — siehe `persist`. */
  storageFull: boolean;
  addItem: (input: InventoryItemInput) => string;
  updateItem: (id: string, patch: Partial<InventoryItemInput>) => void;
  removeItem: (id: string) => void;
  exportSnapshot: () => InventorySnapshot;
  importSnapshot: (snap: Partial<InventorySnapshot>, mode: 'replace' | 'merge') => number;
}

const initial = load();

export const useInventoryStore = create<InventoryState>((set, get) => ({
  ...initial,
  storageFull: false,
  addItem: (input) => {
    const now = new Date().toISOString();
    const item: InventoryItem = { ...input, id: uid(), createdAt: now, updatedAt: now };
    set((st) => {
      const items = [...st.items, item];
      return { items, ...persist({ ...st, items }) };
    });
    return item.id;
  },
  updateItem: (id, patch) =>
    set((st) => {
      const items = st.items.map((it) => (it.id === id ? { ...it, ...patch, updatedAt: new Date().toISOString() } : it));
      return { items, ...persist({ ...st, items }) };
    }),
  removeItem: (id) =>
    set((st) => {
      const items = st.items.filter((it) => it.id !== id);
      return { items, ...persist({ ...st, items }) };
    }),
  exportSnapshot: () => {
    const s = get();
    return { items: s.items, nodes: s.nodes, sets: s.sets, units: s.units };
  },
  importSnapshot: (snap, mode) => {
    const inItems = Array.isArray(snap.items) ? snap.items : [];
    const inNodes = Array.isArray(snap.nodes) ? snap.nodes : [];
    const inSets = Array.isArray(snap.sets) ? snap.sets : [];
    const inUnits = Array.isArray(snap.units) ? snap.units : [];
    const total = inItems.length + inNodes.length + inSets.length + inUnits.length;
    set((st) => {
      // ADR-005, Regel 2 — hier stand `byId.set(x.id, x)`: der eingehende
      // Datensatz ersetzte den vorhandenen als Ganzes. Eine v1-Datei ohne
      // `deviceTypeId` loeschte damit still die bestaetigte Typ-Identitaet.
      const next: Persisted = {
        items: mode === 'replace' ? inItems : mergeById(st.items, inItems),
        nodes: mode === 'replace' ? inNodes : mergeById(st.nodes, inNodes),
        sets: mode === 'replace' ? inSets : mergeById(st.sets, inSets),
        units: mode === 'replace' ? inUnits : mergeById(st.units, inUnits),
      };
      return { ...next, ...persist(next) };
    });
    return total;
  },
}));
