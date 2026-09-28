// ───────────────────────────────────────────────────────────────────────────
// Eingehendes DMX → Zustand der Leuchte im Plan.
//
// `decodeLook` liest die Kanaele einer Leuchte nach ihrer Belegung, `applyLive`
// legt das Ergebnis auf die platzierte Leuchte — als ABGELEITETE Kopie. Der
// gespeicherte Plan bleibt unberuehrt; wer den Live-Zustand behalten will,
// uebernimmt ihn ausdruecklich (Szene aufnehmen, Fokus uebernehmen).
//
// ─── NAEHERUNGEN, DIE MAN KENNEN MUSS ──────────────────────────────────────
//
// - Farbmischung: jede Emitterfarbe hat eine feste Naeherungsfarbe (Tabelle
//   `EMITTER`). Die Helligkeit folgt dem staerksten Anteil der Mischung, nicht
//   dem Lichtstrom der einzelnen Emitter — die kennt das Datenblatt meist
//   nicht. Tiefes Blau ist im Plan deshalb heller als auf der Buehne.
// - Shutter: nur offen/zu, und nur mit Bereichen (aus GDTF oder von Hand).
//   Strobe wird nicht abgespielt.
// - Pan/Tilt: Nullstellung = Kopf haengt senkrecht nach unten, Pan 0 zeigt in
//   Richtung der Gehaeusedrehung. Ein Strahl ueber 85° wird auf 85° begrenzt,
//   sonst laege der Zielpunkt im Unendlichen.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────
import type { DmxAttribute, DmxChannel, PlacedFixture } from '../types';
import { layoutOf, rangeOf } from './dmxLayout';

export type Rgb = [number, number, number];

export interface LiveLook {
  /** 0..1 — Dimmer × Shutter × Farbanteil. */
  intensity: number;
  rgb?: Rgb;
  cct?: number;
  zoom?: number;
  pan?: number;
  tilt?: number;
}

const EMITTER: Partial<Record<DmxAttribute, Rgb>> = {
  red: [1, 0, 0],
  green: [0, 1, 0],
  blue: [0, 0, 1],
  white: [1, 1, 1],
  amber: [1, 0.55, 0],
  lime: [0.7, 1, 0],
  uv: [0.25, 0, 0.5],
};

/** Kanalwert als Anteil 0..1, 8 oder 16 bit. */
export function readChannel(data: Uint8Array, start: number, ch: DmxChannel): number {
  const coarse = data[start + ch.offset] ?? 0;
  if (ch.fineOffset == null) return coarse / 255;
  const fine = data[start + ch.fineOffset] ?? 0;
  return ((coarse << 8) | fine) / 65535;
}

const inSlot = (v: number, s: { from: number; to: number }) => v >= s.from && v <= s.to;

/**
 * Die Kanaele einer Leuchte deuten. `data` ist das Universe, `start` die
 * 0-basierte Startadresse. Liefert `null`, wenn die Leuchte keine deutbare
 * Belegung hat.
 */
export function decodeLook(f: PlacedFixture, data: Uint8Array, start: number): LiveLook | null {
  const lay = layoutOf(f);
  if (!lay) return null;
  const val = new Map<DmxAttribute, { v: number; ch: DmxChannel }>();
  for (const ch of lay.layout) {
    // Bei Mehrzellern (Pixelleisten) kommt ein Attribut mehrfach vor; der
    // erste Kanal ist der Master bzw. die erste Zelle.
    if (!val.has(ch.attribute)) val.set(ch.attribute, { v: readChannel(data, start, ch), ch });
  }
  const get = (a: DmxAttribute) => val.get(a);
  const phys = (a: DmxAttribute) => {
    const e = get(a);
    if (!e) return undefined;
    const [lo, hi] = rangeOf(e.ch, f);
    return lo + (hi - lo) * e.v;
  };

  // ── Farbe ──
  let mix: Rgb | null = null;
  let mixLevel = 1;
  const emitters = (Object.keys(EMITTER) as DmxAttribute[]).filter((a) => val.has(a));
  if (emitters.length > 0) {
    const sum: Rgb = [0, 0, 0];
    for (const a of emitters) {
      const v = get(a)!.v;
      const c = EMITTER[a]!;
      sum[0] += c[0] * v; sum[1] += c[1] * v; sum[2] += c[2] * v;
    }
    const peak = Math.max(...sum);
    mixLevel = Math.min(1, peak);
    mix = peak > 0 ? [sum[0] / peak, sum[1] / peak, sum[2] / peak] : [1, 1, 1];
  }
  const cmy = (['cyan', 'magenta', 'yellow'] as DmxAttribute[]).map((a) => get(a)?.v ?? 0);
  if (cmy.some((v) => v > 0)) {
    const filter: Rgb = [1 - cmy[0], 1 - cmy[1], 1 - cmy[2]];
    const base = mix ?? [1, 1, 1];
    const out: Rgb = [base[0] * filter[0], base[1] * filter[1], base[2] * filter[2]];
    const peak = Math.max(...out);
    mixLevel *= peak;
    mix = peak > 0 ? [out[0] / peak, out[1] / peak, out[2] / peak] : [0, 0, 0];
  }
  const wheel = get('colorWheel');
  if (wheel?.ch.slots) {
    const slot = wheel.ch.slots.find((s) => inSlot(wheel.v, s));
    if (slot?.rgb) {
      const base = mix ?? [1, 1, 1];
      const out: Rgb = [base[0] * slot.rgb[0], base[1] * slot.rgb[1], base[2] * slot.rgb[2]];
      const peak = Math.max(...out);
      mixLevel *= peak;
      mix = peak > 0 ? [out[0] / peak, out[1] / peak, out[2] / peak] : [0, 0, 0];
    }
  }

  // ── Helligkeit ──
  let intensity = get('dimmer')?.v ?? 1;
  intensity *= mixLevel;
  // Weder Dimmer noch Emitter: dann regelt der CCT-Kanal allein nichts — die
  // Leuchte steht, wie sie im Plan steht.
  if (!val.has('dimmer') && emitters.length === 0) intensity = f.dimming / 100;
  const shutter = get('shutter');
  if (shutter?.ch.slots && shutter.ch.slots.length > 0 && !shutter.ch.slots.some((s) => inSlot(shutter.v, s))) {
    intensity = 0;
  }

  return {
    intensity: Math.max(0, Math.min(1, intensity)),
    ...(mix ? { rgb: mix } : {}),
    ...(val.has('cct') ? { cct: phys('cct') } : {}),
    ...(val.has('zoom') ? { zoom: phys('zoom') } : {}),
    ...(val.has('pan') ? { pan: phys('pan') } : {}),
    ...(val.has('tilt') ? { tilt: phys('tilt') } : {}),
  };
}

export const MAX_TILT_DEG = 85;

/**
 * Zielpunkt auf dem Boden aus Pan/Tilt. Tilt 0 = senkrecht nach unten; Pan 0
 * zeigt in Richtung `bodyRotation` (Grad, Plan-Koordinaten wie die
 * Gehaeusedrehung).
 */
export function aimFromPanTilt(f: PlacedFixture, pan: number, tilt: number): { aimX: number; aimY: number } {
  const t = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, tilt)) * Math.PI / 180;
  const heading = (f.bodyRotation + pan) * Math.PI / 180;
  const dist = Math.max(0.01, f.mountingHeight) * Math.tan(t);
  return { aimX: f.x + dist * Math.cos(heading), aimY: f.y + dist * Math.sin(heading) };
}

/** Die Leuchte, wie sie mit diesem Look aussieht. Das Original bleibt unveraendert. */
export function withLook(f: PlacedFixture, look: LiveLook): PlacedFixture {
  const out: PlacedFixture = { ...f, dimming: Math.round(look.intensity * 1000) / 10 };
  if (look.rgb) out.mixRgb = look.rgb;
  if (look.cct != null) out.currentColorTemp = Math.round(look.cct);
  if (look.zoom != null) {
    const [lo, hi] = f.fixture.zoomRange ?? [look.zoom, look.zoom];
    out.currentBeamAngle = Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), look.zoom));
  }
  if (look.pan != null || look.tilt != null) {
    Object.assign(out, aimFromPanTilt(f, look.pan ?? 0, look.tilt ?? 0));
  }
  return out;
}

export interface LiveResult {
  fixtures: PlacedFixture[];
  /** Leuchten, die gerade aus DMX gefahren werden. */
  driven: Set<string>;
  /** Gepatcht, aber ohne deutbare Belegung. */
  undecodable: Set<string>;
}

/**
 * Den ganzen Rig mit den aktuellen Universes fahren. Leuchten ohne Patch,
 * ohne Belegung oder in einem Universe ohne Sender bleiben, wie sie sind.
 */
export function applyLive(fixtures: PlacedFixture[], universes: Map<number, Uint8Array>): LiveResult {
  const driven = new Set<string>();
  const undecodable = new Set<string>();
  const out = fixtures.map((f) => {
    if (f.dmxAddress == null || f.dmxAddress < 1) return f;
    const data = universes.get(f.universe ?? 1);
    if (!data) return f;
    const look = decodeLook(f, data, f.dmxAddress - 1);
    if (!look) {
      undecodable.add(f.id);
      return f;
    }
    driven.add(f.id);
    return withLook(f, look);
  });
  return { fixtures: out, driven, undecodable };
}
