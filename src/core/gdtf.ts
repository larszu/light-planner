// ───────────────────────────────────────────────────────────────────────────
// GDTF einlesen: Modi mit Kanalbelegung und die Lichtdaten des Geraets.
//
// GDTF ist das Format, in dem Hersteller ihre Geraete fuer Pulte und
// Visualisierer beschreiben (DIN SPEC 15800, gdtf-share.com). Es traegt genau
// das, was der Planer fuer den DMX-Eingang braucht: je Modus jeden Kanal mit
// Attribut, Aufloesung und physikalischem Bereich.
//
// Uebernommen wird nur, was der Planer darstellen kann; der Rest steht als
// `other` in der Belegung, damit Offsets und Kanalzahl stimmen. Was beim
// Einlesen verloren geht, landet in `warnings` — nicht still.
//
// Spezifikation: github.com/mvrdevelopment/spec, gdtf-spec.md.
// REIN bis auf `DecompressionStream` (zipRead): keine Datei, kein Netz.
// ───────────────────────────────────────────────────────────────────────────
import type { DmxAttribute, DmxChannel, DmxMode, DmxSlot } from '../types';
import { zipEntries, zipRead } from './zipRead';
import { find, kid, kids, parseXml, type XmlEl } from './xmlLite';

export interface GdtfImport {
  name: string;
  manufacturer: string;
  modes: DmxMode[];
  /** Werte der ersten Beam-Geometrie; fehlt einer, stand er nicht in der Datei. */
  beam: { beamAngle?: number; fieldAngle?: number; lumens?: number; wattage?: number; colorTemp?: number };
  weight?: number;
  warnings: string[];
}

const ATTR: Record<string, DmxAttribute> = {
  Dimmer: 'dimmer',
  Shutter1: 'shutter',
  Pan: 'pan',
  Tilt: 'tilt',
  ColorAdd_R: 'red',
  ColorAdd_G: 'green',
  ColorAdd_B: 'blue',
  ColorAdd_W: 'white',
  ColorAdd_WW: 'white',
  ColorAdd_CW: 'white',
  ColorAdd_A: 'amber',
  ColorAdd_RY: 'amber',
  ColorAdd_L: 'lime',
  ColorAdd_GY: 'lime',
  ColorAdd_UV: 'uv',
  ColorSub_C: 'cyan',
  ColorSub_M: 'magenta',
  ColorSub_Y: 'yellow',
  Color1: 'colorWheel',
  CTC: 'cct',
  Zoom: 'zoom',
};

/** GDTF-Attributname → Attribut des Planers. */
export const mapAttribute = (gdtf: string): DmxAttribute => ATTR[gdtf] ?? 'other';

/**
 * DMXValue („128/1", „255/1s") als Anteil am Vollausschlag.
 * `/n` spiegelt das Byte (255/1 = voll bei jeder Aufloesung), `/ns` schiebt es.
 */
export function dmxFraction(v: string | undefined): number {
  if (!v) return 0;
  const m = /^(\d+)\/(\d+)(s?)$/.exec(v.trim());
  if (!m) return 0;
  const val = Number(m[1]);
  const bytes = Math.max(1, Number(m[2]));
  const full = 256 ** bytes;
  return Math.max(0, Math.min(1, m[3] ? val / full : val / (full - 1)));
}

/** CIE xyY → sRGB 0..1, auf den hoechsten Anteil normiert. */
export function cieToRgb(xyY: string): [number, number, number] | undefined {
  const [x, y] = xyY.split(',').map(Number);
  if (!(y > 0) || !Number.isFinite(x)) return undefined;
  const X = x / y, Y = 1, Z = (1 - x - y) / y;
  const lin = [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ].map((c) => Math.max(0, c));
  const peak = Math.max(...lin);
  if (peak <= 0) return undefined;
  return lin.map((c) => {
    const n = c / peak;
    return n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055;
  }) as [number, number, number];
}

const num = (s: string | undefined): number | undefined => {
  if (s == null || s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mode';

/** Bereiche der Kindelemente (Funktionen oder Sets): jedes reicht bis vor den naechsten Start. */
function spans<T extends { from: number }>(items: T[], end = 1): (T & { to: number })[] {
  const sorted = [...items].sort((a, b) => a.from - b.from);
  return sorted.map((it, i) => ({ ...it, to: i + 1 < sorted.length ? Math.max(it.from, sorted[i + 1].from - 1e-9) : end }));
}

function readChannel(
  ch: XmlEl,
  wheels: Map<string, (number[] | undefined)[]>,
  warnings: Set<string>,
): DmxChannel | null {
  const offsets = (ch.attrs.Offset ?? '').split(',').map((s) => Number(s.trim())).filter((n) => n >= 1);
  if (offsets.length === 0) return null; // virtueller Kanal ohne Adresse
  const logical = kid(ch, 'LogicalChannel');
  const fns = spans(kids(logical, 'ChannelFunction').map((fn) => ({ fn, from: dmxFraction(fn.attrs.DMXFrom) })));
  const primary = logical?.attrs.Attribute ?? fns[0]?.fn.attrs.Attribute ?? '';
  const attribute = mapAttribute(primary);
  const out: DmxChannel = { attribute, offset: offsets[0] - 1, label: primary || undefined };
  if (offsets.length >= 2) out.fineOffset = offsets[1] - 1;
  if (offsets.length > 2) warnings.add(`${primary}: ${offsets.length * 8} bit, read as 16 bit`);

  if (attribute === 'pan' || attribute === 'tilt' || attribute === 'zoom' || attribute === 'cct') {
    const main = fns.find((s) => s.fn.attrs.Attribute === primary) ?? fns[0];
    const pf = num(main?.fn.attrs.PhysicalFrom);
    const pt = num(main?.fn.attrs.PhysicalTo);
    if (main && pf != null && pt != null && main.to > main.from) {
      // Deckt die Funktion nicht den ganzen Kanal, wird ihr Verlauf auf
      // 0..Vollausschlag verlaengert — die Belegung kennt nur einen Bereich.
      const k = (pt - pf) / (main.to - main.from);
      out.range = [pf - k * main.from, pf + k * (1 - main.from)];
    }
  }

  if (attribute === 'shutter') {
    const closed: { from: number; to: number }[] = [];
    for (const f of fns) {
      const sets = spans(kids(f.fn, 'ChannelSet').map((s) => ({ s, from: dmxFraction(s.attrs.DMXFrom) })), f.to);
      for (const s of sets) if (/clos|blackout/i.test(s.s.attrs.Name ?? '')) closed.push({ from: s.from, to: s.to });
      if (/clos|blackout/i.test(f.fn.attrs.Name ?? '') && sets.length === 0) closed.push({ from: f.from, to: f.to });
    }
    if (closed.length > 0) {
      // Gespeichert werden die OFFENEN Bereiche: alles ausser „Closed".
      const open: DmxSlot[] = [];
      let cur = 0;
      for (const c of closed.sort((a, b) => a.from - b.from)) {
        if (c.from > cur) open.push({ from: cur, to: c.from - 1e-9 });
        cur = Math.max(cur, c.to + 1e-9);
      }
      if (cur < 1) open.push({ from: cur, to: 1 });
      out.slots = open;
    }
  }

  if (attribute === 'colorWheel') {
    const slots: DmxSlot[] = [];
    for (const f of fns) {
      const wheel = wheels.get(f.fn.attrs.Wheel ?? '');
      if (!wheel) continue;
      const sets = spans(kids(f.fn, 'ChannelSet').map((s) => ({ s, from: dmxFraction(s.attrs.DMXFrom) })), f.to);
      for (const s of sets) {
        const idx = num(s.s.attrs.WheelSlotIndex);
        const rgb = idx != null ? wheel[idx - 1] : undefined;
        if (rgb) slots.push({ from: s.from, to: s.to, rgb: rgb as [number, number, number] });
      }
    }
    if (slots.length > 0) out.slots = slots;
    else warnings.add('Color wheel without slot colours: not shown');
  }
  return out;
}

export function gdtfFromXml(xml: string, fileName = ''): GdtfImport {
  const doc = parseXml(xml);
  const ft = find(doc, 'FixtureType');
  if (!ft) throw new Error('no FixtureType in description.xml');
  const warnings = new Set<string>();

  const wheels = new Map<string, (number[] | undefined)[]>();
  for (const w of kids(kid(ft, 'Wheels'), 'Wheel')) {
    wheels.set(w.attrs.Name ?? '', kids(w, 'Slot').map((s) => (s.attrs.Color ? cieToRgb(s.attrs.Color) : undefined)));
  }

  const modes: DmxMode[] = [];
  const seen = new Set<string>();
  for (const m of kids(kid(ft, 'DMXModes'), 'DMXMode')) {
    const layout: DmxChannel[] = [];
    let otherBreaks = 0;
    for (const ch of kids(kid(m, 'DMXChannels'), 'DMXChannel')) {
      if ((ch.attrs.DMXBreak ?? '1') !== '1') { otherBreaks++; continue; }
      const c = readChannel(ch, wheels, warnings);
      if (c) layout.push(c);
    }
    if (layout.length === 0) continue;
    const name = m.attrs.Name ?? `Mode ${modes.length + 1}`;
    if (otherBreaks > 0) warnings.add(`${name}: ${otherBreaks} channel(s) on a second DMX break ignored`);
    let id = slug(name);
    while (seen.has(id)) id += '-2';
    seen.add(id);
    const channels = layout.reduce((n, c) => Math.max(n, c.offset + 1, (c.fineOffset ?? -1) + 1), 0);
    modes.push({ id, name, channels, origin: 'gdtf', evidence: fileName || undefined, layout });
  }
  if (modes.length === 0) warnings.add('no DMX mode with addressed channels');

  const beamEl = find(kid(ft, 'Geometries') ?? ft, 'Beam');
  const b = beamEl?.attrs ?? {};
  const props = kid(kid(ft, 'PhysicalDescriptions'), 'Properties');
  return {
    name: ft.attrs.LongName || ft.attrs.Name || '',
    manufacturer: ft.attrs.Manufacturer ?? '',
    modes,
    beam: {
      beamAngle: num(b.BeamAngle),
      fieldAngle: num(b.FieldAngle),
      lumens: num(b.LuminousFlux),
      wattage: num(b.PowerConsumption),
      colorTemp: num(b.ColorTemperature),
    },
    weight: num(kid(props, 'Weight')?.attrs.Value),
    warnings: [...warnings],
  };
}

/** Eine .gdtf-Datei (ZIP mit description.xml). */
export async function readGdtf(bytes: Uint8Array, fileName = ''): Promise<GdtfImport> {
  const entry = zipEntries(bytes).find((e) => e.name === 'description.xml');
  if (!entry) throw new Error('description.xml missing — not a GDTF file');
  const xml = new TextDecoder().decode(await zipRead(bytes, entry));
  return gdtfFromXml(xml, fileName);
}
