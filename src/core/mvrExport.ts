// MVR ("My Virtual Rig") export — the GDTF/MVR interchange format created by
// Vectorworks, MA Lighting and Robe so a rig (fixtures, positions, patch) moves
// between tools (Capture, grandMA3, WYSIWYG, Vectorworks, BlenderDMX, …) without
// re-keying. An .mvr is a ZIP holding GeneralSceneDescription.xml.
//
// We export every fixture as an MVR <Fixture> with a world transform (aimed at
// its focus point), its DMX address and channel/unit numbers, referencing a
// GDTF spec by name. GDTF profile files are not embedded — importers relink the
// fixture type from their own library — so this is a best-effort, widely
// readable transfer of the plot layout and patch, which is the high-value part.
import type { PlacedFixture, Truss } from '../types';
import { footprint } from './patch';

// ── RFC-4122 v4 UUID (crypto where available, Math.random fallback) ──
function uuid(): string {
  const b = new Uint8Array(16);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}

const xmlEsc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
const sanitizeFile = (s: string) => s.replace(/[\\/:*?"<>|@]+/g, '_').trim() || 'Fixture';

// 4×3 MVR matrix (mm, Z-up): columns are the fixture's local X/Y/Z axes in world
// space, then its position. The local −Z (GDTF beam axis) is aimed at the focus
// point so the rig reads with roughly correct focus on import.
function aimMatrix(f: PlacedFixture): string {
  const pos = [f.x * 1000, f.y * 1000, f.mountingHeight * 1000];
  const aim = [f.aimX * 1000, f.aimY * 1000, 0];
  let dx = aim[0] - pos[0], dy = aim[1] - pos[1], dz = aim[2] - pos[2];
  let len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;          // beam direction
  const z = [-dx, -dy, -dz];                // local +Z opposes the beam
  let up = Math.abs(z[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1];
  // x = up × z
  let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  let xl = Math.hypot(...x) || 1; x = x.map((v) => v / xl);
  // y = z × x
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const g = (v: number[]) => `{${v.map((n) => (Math.round(n * 1e6) / 1e6)).join(',')}}`;
  return `${g(x)}${g(y)}${g(z)}${g(pos)}`;
}

// Maps each distinct fixture *type* to a stable, 1-based integer for a single
// export. MVR's <FixtureTypeId> groups instances of the same type; importers
// (grandMA3, Capture, Vectorworks) use it to fold identical fixtures into one
// patch type. We key on the library id (e.g. "etc-s4-26") so two S4s share an
// id while an S4 and a Fresnel differ — instead of the old constant 0, which
// collapsed the whole rig into a single anonymous type.
function makeTypeIdMap(): (f: PlacedFixture) => number {
  const ids = new Map<string, number>();
  return (f) => {
    const key = f.fixture.id || `${f.fixture.manufacturer}@${f.fixture.name}`;
    let id = ids.get(key);
    if (id == null) { id = ids.size + 1; ids.set(key, id); }
    return id;
  };
}

function fixtureXml(f: PlacedFixture, idx: number, typeId: number): string {
  const name = xmlEsc(f.unitNumber ? `${f.unitNumber} ${f.fixture.name}` : f.fixture.name);
  const spec = sanitizeFile(`${f.fixture.manufacturer}@${f.fixture.name}`) + '.gdtf';
  const fid = f.channel ?? (idx + 1);
  const fp = footprint(f);
  const addr = (fp > 0 && f.universe != null && f.dmxAddress != null)
    ? (f.universe - 1) * 512 + f.dmxAddress
    : (idx + 1);
  return [
    `      <Fixture name="${name}" uuid="${uuid()}">`,
    `        <Matrix>${aimMatrix(f)}</Matrix>`,
    `        <GDTFSpec>${xmlEsc(spec)}</GDTFSpec>`,
    `        <GDTFMode>Default</GDTFMode>`,
    `        <Addresses><Address break="0">${addr}</Address></Addresses>`,
    `        <FixtureID>${fid}</FixtureID>`,
    `        <UnitNumber>${xmlEsc(f.unitNumber ?? String(fid))}</UnitNumber>`,
    `        <FixtureTypeId>${typeId}</FixtureTypeId>`,
    `        <CustomId>0</CustomId>`,
    `        <CastShadow>true</CastShadow>`,
    `      </Fixture>`,
  ].join('\n');
}

export function buildSceneDescription(fixtures: PlacedFixture[], _trusses: Truss[], projectName: string): string {
  const layerUuid = uuid();
  const typeIdFor = makeTypeIdMap();
  const body = fixtures.map((f, i) => fixtureXml(f, i, typeIdFor(f))).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<GeneralSceneDescription verMajor="1" verMinor="6" provider="LightPlanner" providerVersion="1.0">',
    '  <Scene>',
    '    <AUXData/>',
    '    <Layers>',
    `      <Layer name="${xmlEsc(projectName || 'Lichtplan')}" uuid="${layerUuid}">`,
    '        <ChildList>',
    body,
    '        </ChildList>',
    '      </Layer>',
    '    </Layers>',
    '  </Scene>',
    '</GeneralSceneDescription>',
    '',
  ].join('\n');
}

// ── Minimal ZIP writer (STORE / no compression) ──────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry { name: string; data: Uint8Array }

export function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);            // version needed
    lh.setUint16(6, 0, true);             // flags
    lh.setUint16(8, 0, true);             // method = store
    lh.setUint16(10, dosTime, true);
    lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);         // compressed
    lh.setUint32(22, size, true);         // uncompressed
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);            // extra len
    const localHeader = new Uint8Array(lh.buffer);
    locals.push(localHeader, nameBytes, e.data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);            // version made by
    ch.setUint16(6, 20, true);            // version needed
    ch.setUint16(8, 0, true);
    ch.setUint16(10, 0, true);            // method
    ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint16(30, 0, true);            // extra
    ch.setUint16(32, 0, true);            // comment
    ch.setUint16(34, 0, true);            // disk start
    ch.setUint16(36, 0, true);            // internal attrs
    ch.setUint32(38, 0, true);            // external attrs
    ch.setUint32(42, offset, true);       // local header offset
    centrals.push(new Uint8Array(ch.buffer), nameBytes);

    offset += localHeader.length + nameBytes.length + size;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);       // CD offset
  eocd.setUint16(20, 0, true);

  const chunks = [...locals, ...centrals, new Uint8Array(eocd.buffer)];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

// Build a complete .mvr archive (Uint8Array) for the rig.
export function buildMvr(fixtures: PlacedFixture[], trusses: Truss[], projectName: string): Uint8Array {
  const xml = buildSceneDescription(fixtures, trusses, projectName);
  return zipStore([{ name: 'GeneralSceneDescription.xml', data: new TextEncoder().encode(xml) }]);
}
