// ───────────────────────────────────────────────────────────────────────────
// Die Profilpruefung — ist ein fremdes Objekt ein Leuchtenprofil, mit dem
// dieser Planer rechnen kann?
//
// WARUM ES DAS GIBT (2026-09-25, Anbindung an die Geraetebibliothek). Bis
// hierher kam jedes `Fixture` aus einer von zwei Quellen, die der Planer
// selbst geschrieben hat: dem Katalog in `fixtureLibrary.ts` und dem
// Leuchten-Editor. Die Bibliothek unter devices.zumpelars.de ist die erste
// Quelle, deren Objekte jemand anders gebaut hat — und ein Profil, dem der
// Streuwinkel fehlt, faellt nicht beim Import auf, sondern als `NaN` in der
// Lux-Karte und als Kegel ohne Oeffnung in der 3D-Szene.
//
// Die Pruefung verwirft, statt zu reparieren: ein Profil, das sie nicht
// annimmt, wird GEZAEHLT und angezeigt, nicht mit erfundenen Werten
// aufgefuellt. Ein erfundener Streuwinkel sieht aus wie ein abgelesener.
//
// Jeder Eintrag des eingebauten Katalogs muss sie bestehen — das haelt
// `npm run library:check` fest; sonst waere sie strenger als der Planer
// selbst und wuerde gute Profile aus der Bibliothek abweisen.
// ───────────────────────────────────────────────────────────────────────────
import type { BeamShape, DmxModeOrigin, Fixture, FixtureCategory, LensType, MountType } from '../types';

export const FIXTURE_CATEGORIES: readonly FixtureCategory[] = [
  'profile', 'fresnel', 'par', 'wash', 'spot', 'beam',
  'moving-wash', 'moving-spot', 'moving-beam',
  'blinder', 'cyc', 'flood', 'followspot', 'led-panel', 'custom',
];
const BEAM_SHAPES: readonly BeamShape[] = ['circular', 'elliptical', 'linear', 'rectangular'];
const LENS_TYPES: readonly LensType[] = ['fixed', 'zoom', 'interchangeable', 'fresnel', 'pc', 'reflector'];
const MOUNT_TYPES: readonly MountType[] = ['bowens', 'prolock-bowens', 'junior', 'baby', 'clamp', 'yoke', 'none'];
const DMX_ORIGINS: readonly DmxModeOrigin[] = ['manual', 'gdtf', 'console', 'device', 'estimated'];

export type ProfileCheck =
  | { ok: true; fixture: Fixture }
  | { ok: false; problems: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';
/** Eine Kanalzahl innerhalb eines Universes. Prueft die ANGABE, rechnet keinen Fussabdruck (der steht in `core/patch.ts`). */
const channelCount = (min: number) => (v: unknown): boolean => num(v) && Number.isInteger(v) && v >= min && v <= 512;

/**
 * Prueft ein Leuchtenprofil. Die Meldungen sind Feldnamen mit Grund — sie
 * gehen in die Anzeige „ungueltig" und muessen ohne Quelltext lesbar sein.
 */
export function validateFixtureProfile(raw: unknown): ProfileCheck {
  const p: string[] = [];
  if (!isObj(raw)) return { ok: false, problems: ['not an object'] };
  const f = raw;
  const need = (k: string, ok: boolean, why: string) => { if (!ok) p.push(`${k}: ${why}`); };
  const opt = (k: string, check: (v: unknown) => boolean, why: string) => {
    if (f[k] !== undefined && !check(f[k])) p.push(`${k}: ${why}`);
  };

  need('id', str(f.id) && f.id.trim() !== '', 'missing');
  need('name', str(f.name) && f.name.trim() !== '', 'missing');
  need('manufacturer', str(f.manufacturer), 'missing');
  need('category', FIXTURE_CATEGORIES.includes(f.category as FixtureCategory), 'unknown category');
  need('wattage', num(f.wattage) && f.wattage >= 0, 'not a number >= 0');
  need('lumens', num(f.lumens) && f.lumens >= 0, 'not a number >= 0');
  need('beamAngle', num(f.beamAngle) && f.beamAngle > 0 && f.beamAngle <= 360, 'not an angle in (0, 360]');
  need('fieldAngle', num(f.fieldAngle) && f.fieldAngle > 0 && f.fieldAngle <= 360, 'not an angle in (0, 360]');
  opt('cutoffAngle', (v) => num(v) && v >= 0 && v <= 360, 'not an angle');
  need('beamShape', BEAM_SHAPES.includes(f.beamShape as BeamShape), 'unknown beam shape');
  need('beamRatioWH', num(f.beamRatioWH) && f.beamRatioWH > 0, 'not a number > 0');
  need('lensType', LENS_TYPES.includes(f.lensType as LensType), 'unknown lens type');
  need('colorTemp', num(f.colorTemp) && f.colorTemp >= 0, 'not a number >= 0');
  need('weight', num(f.weight) && f.weight >= 0, 'not a number >= 0');
  need('mountType', MOUNT_TYPES.includes(f.mountType as MountType), 'unknown mount type');

  const range = (v: unknown) => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] <= v[1];
  opt('zoomRange', range, 'not a [min, max] pair');
  opt('colorTempRange', range, 'not a [min, max] pair');
  opt('cri', num, 'not a number');
  opt('tlci', num, 'not a number');
  opt('ipRating', str, 'not text');
  opt('powerConnector', str, 'not text');
  opt('dmxChannels', channelCount(0), 'not a channel count 0–512');
  opt('photometric', (v) => isObj(v) && num(v.lux) && v.lux > 0 && num(v.distance) && v.distance > 0, 'needs lux and distance > 0');

  if (f.dmxModes !== undefined) {
    if (!Array.isArray(f.dmxModes)) p.push('dmxModes: not a list');
    else {
      const ids = new Set<string>();
      f.dmxModes.forEach((m, i) => {
        if (!isObj(m)) { p.push(`dmxModes[${i}]: not an object`); return; }
        if (!str(m.id) || m.id === '') p.push(`dmxModes[${i}].id: missing`);
        else if (ids.has(m.id)) p.push(`dmxModes[${i}].id: used twice`);
        else ids.add(m.id);
        if (!str(m.name)) p.push(`dmxModes[${i}].name: missing`);
        // Mindestens 1: ein Modus mit 0 Kanaelen ist kein DMX-Modus, sondern
        // die Kodierung „konventionell am Dimmer" — und die steht in `dmxChannels`.
        if (!channelCount(1)(m.channels)) p.push(`dmxModes[${i}].channels: not a channel count 1–512`);
        if (!DMX_ORIGINS.includes(m.origin as DmxModeOrigin)) p.push(`dmxModes[${i}].origin: unknown origin`);
        if (m.evidence !== undefined && !str(m.evidence)) p.push(`dmxModes[${i}].evidence: not text`);
      });
    }
  }
  if (f.compatibleAttachments !== undefined) {
    const ok = Array.isArray(f.compatibleAttachments)
      && f.compatibleAttachments.every((a) => isObj(a) && str(a.id) && str(a.name) && num(a.weightAdditional));
    if (!ok) p.push('compatibleAttachments: not a list of attachments');
  }
  if (f.specSource !== undefined) {
    const ok = isObj(f.specSource)
      && Object.values(f.specSource).every((e) => isObj(e) && str(e.value) && str(e.source));
    if (!ok) p.push('specSource: not a field -> { value, source } map');
  }

  return p.length ? { ok: false, problems: p } : { ok: true, fixture: f as unknown as Fixture };
}
