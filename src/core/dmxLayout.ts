// ───────────────────────────────────────────────────────────────────────────
// Kanalbelegung eines DMX-Modus: welcher Kanal was steuert.
//
// Der Fussabdruck (`patch.ts`) sagt, WIE VIELE Kanaele ein Geraet belegt; fuer
// die Adressliste reicht das. Eingehendes DMX deuten kann der Planer erst,
// wenn er weiss, WELCHER davon der Dimmer ist. Genau das steht hier.
//
// Eine Belegung, die mehr Kanaele beschreibt als der Modus hat, ist falsch —
// sie liest in die naechste Leuchte hinein. `layoutProblems` sagt das, bevor
// es im Live-Bild als „die zweite Leuchte flackert mit der dritten" auffaellt.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────
import type { DmxAttribute, DmxChannel, DmxMode, PlacedFixture } from '../types';
import { modeOf } from './patch';

export const ATTRIBUTES: readonly DmxAttribute[] = [
  'dimmer', 'shutter',
  'red', 'green', 'blue', 'white', 'amber', 'lime', 'uv',
  'cyan', 'magenta', 'yellow', 'colorWheel',
  'cct', 'zoom', 'pan', 'tilt',
  'other',
];

/** Attribute mit physikalischem Bereich — und dessen Vorgabe. */
export const DEFAULT_RANGE: Partial<Record<DmxAttribute, [number, number]>> = {
  pan: [-270, 270],
  tilt: [-135, 135],
  cct: [2700, 6500],
  zoom: [10, 40],
};

export const hasRange = (a: DmxAttribute): boolean => a in DEFAULT_RANGE;

export function rangeOf(ch: DmxChannel, f?: PlacedFixture): [number, number] {
  if (ch.range) return ch.range;
  // Ohne eigene Angabe tragen die Leuchtendaten den besseren Bereich.
  if (ch.attribute === 'zoom' && f?.fixture.zoomRange) return f.fixture.zoomRange;
  if (ch.attribute === 'cct' && f?.fixture.colorTempRange) return f.fixture.colorTempRange;
  return DEFAULT_RANGE[ch.attribute] ?? [0, 1];
}

/** Belegte Kanaele (hoechster Offset + 1). */
export const layoutSpan = (layout: DmxChannel[]): number =>
  layout.reduce((n, c) => Math.max(n, c.offset + 1, (c.fineOffset ?? -1) + 1), 0);

export interface LayoutProblem {
  kind: 'beyond-mode' | 'double-use' | 'no-intensity';
  offset?: number;
}

export function layoutProblems(mode: DmxMode): LayoutProblem[] {
  const layout = mode.layout ?? [];
  if (layout.length === 0) return [];
  const out: LayoutProblem[] = [];
  const used = new Set<number>();
  for (const c of layout) {
    for (const o of [c.offset, c.fineOffset]) {
      if (o == null) continue;
      if (o >= mode.channels) out.push({ kind: 'beyond-mode', offset: o });
      if (used.has(o)) out.push({ kind: 'double-use', offset: o });
      used.add(o);
    }
  }
  // Ohne Dimmer, Farbe oder CCT gibt es nichts, woraus sich eine Helligkeit
  // ergibt — die Leuchte bliebe im Live-Bild unveraendert.
  const intensity: DmxAttribute[] = ['dimmer', 'red', 'green', 'blue', 'white', 'amber', 'lime', 'cct'];
  if (!layout.some((c) => intensity.includes(c.attribute))) out.push({ kind: 'no-intensity' });
  return out;
}

/**
 * Die Belegung, nach der eine platzierte Leuchte gelesen wird.
 *
 * Ein Modus mit genau EINEM Kanal und ohne Belegung ist ein Dimmerkanal —
 * das ist, was ein Einkanalgeraet ist (Stufenlinse am Dimmer, einfacher
 * LED-Spot). Alles andere ohne Belegung bleibt ungedeutet: `null`, nicht
 * geraten.
 */
export function layoutOf(f: PlacedFixture): { layout: DmxChannel[]; implicit: boolean } | null {
  const mode = modeOf(f);
  if (!mode) return null;
  if (mode.layout && mode.layout.length > 0) return { layout: mode.layout, implicit: false };
  if (mode.channels === 1) return { layout: [{ attribute: 'dimmer', offset: 0 }], implicit: true };
  return null;
}

// ─── Vorlagen ───────────────────────────────────────────────────────────────
// Haeufige Belegungen als Ausgangspunkt. Sie ersetzen nicht das Datenblatt:
// eine Vorlage, die nicht zum Geraet passt, verschiebt jeden Kanal.

const seq = (attrs: DmxAttribute[]): DmxChannel[] => attrs.map((attribute, offset) => ({ attribute, offset }));

export interface LayoutTemplate {
  id: string;
  label: string;
  layout: DmxChannel[];
}

export const TEMPLATES: readonly LayoutTemplate[] = [
  { id: 'dim', label: 'Dimmer', layout: seq(['dimmer']) },
  { id: 'dim16', label: 'Dimmer 16 bit', layout: [{ attribute: 'dimmer', offset: 0, fineOffset: 1 }] },
  { id: 'dim-cct', label: 'Dimmer, CCT', layout: seq(['dimmer', 'cct']) },
  { id: 'rgb', label: 'RGB', layout: seq(['red', 'green', 'blue']) },
  { id: 'rgbw', label: 'RGBW', layout: seq(['red', 'green', 'blue', 'white']) },
  { id: 'dim-rgbw', label: 'Dimmer, RGBW', layout: seq(['dimmer', 'red', 'green', 'blue', 'white']) },
  { id: 'dim-rgbw-str', label: 'Dimmer, RGBW, Strobe', layout: seq(['dimmer', 'red', 'green', 'blue', 'white', 'shutter']) },
  { id: 'rgbwa-uv', label: 'RGBWA+UV', layout: seq(['red', 'green', 'blue', 'white', 'amber', 'uv']) },
  {
    id: 'mover',
    label: 'Moving head: Pan, Tilt 16 bit, Dimmer, Zoom',
    layout: [
      { attribute: 'pan', offset: 0, fineOffset: 1 },
      { attribute: 'tilt', offset: 2, fineOffset: 3 },
      { attribute: 'dimmer', offset: 4 },
      { attribute: 'zoom', offset: 5 },
    ],
  },
];
