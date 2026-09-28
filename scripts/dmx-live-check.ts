// ───────────────────────────────────────────────────────────────────────────
// DMX-Eingang: vom UDP-Paket bis zur Leuchte im Plan.
// Lauf: `npm run dmxlive:check`
//
// WARUM ES DAS GIBT (2026-09-28). Der Planer faehrt seine Leuchten seitdem
// live aus einem Pult. Eine Kette mit fuenf Gliedern — Paket lesen, Quellen
// zusammenfuehren, Kanal nach Belegung deuten, Wert in Farbe/Richtung
// umrechnen, GDTF einlesen —, und jedes Glied kann still danebenliegen: ein
// Byte versetzt, und der Dimmer der dritten Leuchte faehrt die vierte. Am
// Bildschirm sieht das aus wie ein Fehler im Pult. Dieser Lauf prueft jedes
// Glied gegen Werte, die man von Hand nachrechnen kann.
//
// Die Pakete werden mit denselben Bytes gebaut, die ein Pult sendet (Art-Net
// 4, ANSI E1.31-2018); die Offsets stehen in `core/dmxInput.ts`.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';

import {
  buildArtDmx, buildSacn, DmxMerger, parseArtNet, parsePacket, parseSacn, sacnGroup, SOURCE_TIMEOUT_MS,
} from '../src/core/dmxInput.ts';
import { aimFromPanTilt, applyLive, decodeLook, MAX_TILT_DEG, withLook } from '../src/core/dmxLive.ts';
import { layoutOf, layoutProblems, TEMPLATES } from '../src/core/dmxLayout.ts';
import { cieToRgb, dmxFraction, gdtfFromXml, readGdtf } from '../src/core/gdtf.ts';
import { getBeamColorHex } from '../src/core/colorTemp.ts';
import type { DmxChannel, DmxMode, PlacedFixture } from '../src/types.ts';

const close = (a: number, b: number, eps = 1e-3, msg = '') =>
  assert.ok(Math.abs(a - b) <= eps, `${msg} erwartet ${b}, war ${a}`);

const leuchte = (id: string, layout: DmxChannel[] | undefined, extra: Partial<PlacedFixture> = {}, channels?: number): PlacedFixture =>
  ({
    id, x: 0, y: 0, mountingHeight: 5, aimX: 0, aimY: 1, dimming: 40, bodyRotation: 0, gelFilterIds: [],
    universe: 1, dmxAddress: 1,
    fixture: {
      id: `lib-${id}`, name: id, manufacturer: 'Test', category: 'moving-head', wattage: 100, lumens: 10000,
      beamAngle: 20, fieldAngle: 30, beamShape: 'circular', beamRatioWH: 1, lensType: 'pc', colorTemp: 5600,
      weight: 10, mountType: 'clamp', zoomRange: [8, 40],
      dmxModes: [{ id: 'm', name: 'M', channels: channels ?? Math.max(1, ...(layout ?? []).map((c) => Math.max(c.offset, c.fineOffset ?? 0) + 1)), origin: 'manual', layout }],
    },
    ...extra,
  }) as unknown as PlacedFixture;

const uni = (values: Record<number, number>): Uint8Array => {
  const d = new Uint8Array(512);
  for (const [k, v] of Object.entries(values)) d[Number(k) - 1] = v;
  return d;
};

// ── 1) Pakete lesen ───────────────────────────────────────────────────────
{
  const data = uni({ 1: 255, 2: 128, 512: 7 });
  const a = parseArtNet(buildArtDmx(0x0123, data), '10.0.0.5')!;
  assert.equal(a.universe, 0x0123, 'Art-Net Port-Address = Net<<8 | SubUni');
  assert.equal(a.data.length, 512);
  assert.equal(a.data[0], 255); assert.equal(a.data[1], 128); assert.equal(a.data[511], 7);
  assert.equal(a.source, '10.0.0.5');

  // ArtPoll (0x2000) ist kein Datenpaket.
  const poll = buildArtDmx(0, data); poll[8] = 0x00; poll[9] = 0x20;
  assert.equal(parseArtNet(poll), null, 'ArtPoll ist kein DMX');

  const s = parseSacn(buildSacn(7, data, { priority: 150, name: 'Eos' }))!;
  assert.equal(s.universe, 7);
  assert.equal(s.priority, 150);
  assert.equal(s.name, 'Eos');
  assert.equal(s.data[1], 128);
  assert.equal(s.data.length, 512);

  const prev = buildSacn(7, data); prev[112] = 0x80;
  assert.equal(parseSacn(prev), null, 'Preview-Daten gehoeren nicht auf die Buehne');
  const code = buildSacn(7, data); code[125] = 0xdd;
  assert.equal(parseSacn(code), null, 'Startcode 0xDD (Prioritaet je Kanal) ist kein Dimmerwert');
  assert.ok(parsePacket(buildSacn(1, data)), 'parsePacket erkennt beide Formate');
  assert.equal(parsePacket(new Uint8Array([1, 2, 3])), null);
  assert.equal(sacnGroup(1), '239.255.0.1');
  assert.equal(sacnGroup(300), '239.255.1.44');
  console.log('✓ Art-Net und sACN werden Byte fuer Byte gelesen, Fremdes verworfen');
}

// ── 2) Zusammenfuehren ────────────────────────────────────────────────────
{
  const m = new DmxMerger(0);
  const t0 = 1_000_000;
  // Art-Net 0 ist Plan-Universe 1 (Vorgabe der meisten Pulte).
  assert.equal(m.push(parseArtNet(buildArtDmx(0, uni({ 1: 100, 2: 10 })), 'a')!, t0), 1);
  m.push(parseArtNet(buildArtDmx(0, uni({ 1: 50, 2: 200 })), 'b')!, t0);
  const htp = m.universe(1, t0)!;
  assert.deepEqual([htp[0], htp[1]], [100, 200], 'zwei gleichrangige Quellen: hoechster Wert je Kanal');

  // sACN mit hoeherer Prioritaet verdraengt beide.
  m.push(parseSacn(buildSacn(1, uni({ 1: 5 }), { priority: 200 }))!, t0);
  assert.equal(m.universe(1, t0)![0], 5, 'hoehere Prioritaet gewinnt ganz, auch mit kleinerem Wert');

  // Die Prioritaetsquelle meldet sich ab — die Art-Net-Quellen gelten wieder.
  m.push(parseSacn(buildSacn(1, uni({}), { priority: 200, terminated: true }))!, t0 + 10);
  assert.equal(m.universe(1, t0 + 10)![0], 100, 'Stream Terminated nimmt die Quelle sofort heraus');

  assert.equal(m.universe(1, t0 + SOURCE_TIMEOUT_MS + 1), null, 'nach 2,5 s Schweigen ist das Universe leer');

  const one = new DmxMerger(1);
  one.push(parseArtNet(buildArtDmx(1, uni({ 1: 9 })), 'a')!, t0);
  assert.equal(one.universe(1, t0)![0], 9, 'Zaehlung ab 1: Art-Net 1 ist Plan-Universe 1');
  console.log('✓ HTP bei gleicher Prioritaet, hoehere Prioritaet gewinnt, Abmelden und Zeitgrenze wirken');
}

// ── 3) Belegung ───────────────────────────────────────────────────────────
{
  const ein = leuchte('e', undefined, {}, 1);
  assert.deepEqual(layoutOf(ein), { layout: [{ attribute: 'dimmer', offset: 0 }], implicit: true },
    'ein Einkanalmodus ohne Belegung ist ein Dimmer');
  assert.equal(layoutOf(leuchte('z', undefined, {}, 12)), null, 'zwoelf Kanaele ohne Belegung: nicht raten');

  const mode: DmxMode = { id: 'm', name: 'M', channels: 3, origin: 'manual', layout: [
    { attribute: 'dimmer', offset: 0 }, { attribute: 'pan', offset: 2, fineOffset: 3 }, { attribute: 'tilt', offset: 2 },
  ] };
  const kinds = layoutProblems(mode).map((p) => p.kind);
  assert.ok(kinds.includes('beyond-mode'), 'Fein-Kanal 4 in einem Dreikanalmodus');
  assert.ok(kinds.includes('double-use'), 'Kanal 3 doppelt belegt');
  for (const tpl of TEMPLATES) {
    const span = Math.max(...tpl.layout.map((c) => Math.max(c.offset, c.fineOffset ?? 0) + 1));
    assert.deepEqual(layoutProblems({ id: 'x', name: 'x', channels: span, origin: 'manual', layout: tpl.layout }), [],
      `Vorlage ${tpl.id} ist in sich stimmig`);
  }
  console.log('✓ Einkanal = Dimmer, Unbekanntes bleibt ungedeutet, Ueberlauf und Doppelbelegung werden gemeldet');
}

// ── 4) Deuten ─────────────────────────────────────────────────────────────
{
  // 16 bit: 0x80 0x00 = 32768/65535.
  const d16 = leuchte('d', [{ attribute: 'dimmer', offset: 0, fineOffset: 1 }]);
  close(decodeLook(d16, uni({ 1: 0x80, 2: 0x00 }), 0)!.intensity, 32768 / 65535, 1e-6, 'Dimmer 16 bit');

  // Startadresse 10: der Wert steht auf Kanal 10, nicht auf 1.
  const at10 = leuchte('a', [{ attribute: 'dimmer', offset: 0 }], { dmxAddress: 10 });
  const r = applyLive([at10], new Map([[1, uni({ 1: 255, 10: 51 })]]));
  close(r.fixtures[0]!.dimming, 20, 0.05, 'Adresse 10, Wert 51 = 20 %');
  assert.ok(r.driven.has('a'));

  // RGB: voll Rot, halb Gruen → Farbe (1, 0.5, 0), Helligkeit folgt dem Rot.
  const rgb = leuchte('c', TEMPLATES.find((x) => x.id === 'dim-rgbw')!.layout);
  const lk = decodeLook(rgb, uni({ 1: 255, 2: 255, 3: 128 }), 0)!;
  close(lk.rgb![0], 1); close(lk.rgb![1], 128 / 255); close(lk.rgb![2], 0);
  close(lk.intensity, 1);
  // Nur halb Blau: Helligkeit 0,5 — der Dimmer steht voll, die Mischung nicht.
  close(decodeLook(rgb, uni({ 1: 255, 4: 128 }), 0)!.intensity, 128 / 255, 1e-6, 'Helligkeit folgt der Mischung');
  // Und die Farbe kommt in der Darstellung an.
  assert.equal(getBeamColorHex(withLook(rgb, lk)), 0xff8000, 'Strahlfarbe = gemischte Farbe');

  // CMY: voll Cyan nimmt das Rot weg.
  const cmy = leuchte('y', [{ attribute: 'dimmer', offset: 0 }, { attribute: 'cyan', offset: 1 }, { attribute: 'magenta', offset: 2 }, { attribute: 'yellow', offset: 3 }]);
  assert.deepEqual(decodeLook(cmy, uni({ 1: 255, 2: 255 }), 0)!.rgb, [0, 1, 1], 'Cyan-Filter: kein Rot');

  // Shutter mit Bereichen: 0..0.1 zu, darueber offen.
  const sh = leuchte('s', [{ attribute: 'dimmer', offset: 0 }, { attribute: 'shutter', offset: 1, slots: [{ from: 0.1, to: 1 }] }]);
  assert.equal(decodeLook(sh, uni({ 1: 255, 2: 0 }), 0)!.intensity, 0, 'Shutter zu = dunkel');
  assert.equal(decodeLook(sh, uni({ 1: 255, 2: 200 }), 0)!.intensity, 1, 'Shutter offen');

  // Farbrad: Platz 2 (Rot) ab 50 %.
  const wh = leuchte('w', [{ attribute: 'dimmer', offset: 0 }, { attribute: 'colorWheel', offset: 1, slots: [
    { from: 0, to: 0.49, rgb: [1, 1, 1] }, { from: 0.5, to: 1, rgb: [1, 0, 0] },
  ] }]);
  assert.deepEqual(decodeLook(wh, uni({ 1: 255, 2: 200 }), 0)!.rgb, [1, 0, 0]);

  // Zoom: Bereich 8..40 aus den Leuchtendaten; halb = 24°.
  const zm = leuchte('z', [{ attribute: 'dimmer', offset: 0 }, { attribute: 'zoom', offset: 1, fineOffset: 2 }]);
  const zl = withLook(zm, decodeLook(zm, uni({ 1: 255, 2: 0x80, 3: 0 }), 0)!);
  close(zl.currentBeamAngle!, 8 + 32 * (32768 / 65535), 1e-6, 'Zoom aus dem Leuchtenbereich');

  // Kein Dimmer, keine Emitter (nur CCT): die Helligkeit bleibt die geplante.
  const cc = leuchte('t', [{ attribute: 'cct', offset: 0 }]);
  close(decodeLook(cc, uni({ 1: 255 }), 0)!.intensity, 0.4, 1e-9, 'CCT allein aendert die Helligkeit nicht');

  // Ohne Sender bleibt alles, wie es ist — und das Original wird nie veraendert.
  const same = applyLive([at10], new Map());
  assert.equal(same.fixtures[0], at10);
  assert.equal(at10.dimming, 40, 'applyLive veraendert den gespeicherten Plan nicht');
  const unk = applyLive([leuchte('u', undefined, {}, 12)], new Map([[1, uni({ 1: 255 })]]));
  assert.ok(unk.undecodable.has('u'), 'gepatcht ohne Belegung wird als solches gemeldet');
  console.log('✓ Dimmer 8/16 bit, Adresse, RGB, CMY, Shutter, Farbrad, Zoom — nachgerechnet');
}

// ── 5) Pan/Tilt → Zielpunkt ───────────────────────────────────────────────
{
  const f = leuchte('p', [{ attribute: 'pan', offset: 0 }, { attribute: 'tilt', offset: 1 }], { x: 2, y: 3, mountingHeight: 4 });
  // Tilt 45° bei 4 m Hoehe: 4 m daneben. Pan 0 = Richtung der Gehaeusedrehung (0° = +x).
  const a = aimFromPanTilt(f, 0, 45);
  close(a.aimX, 6); close(a.aimY, 3);
  const b = aimFromPanTilt({ ...f, bodyRotation: 90 }, 0, 45);
  close(b.aimX, 2); close(b.aimY, 7);
  const c = aimFromPanTilt(f, 0, 0);
  close(c.aimX, 2); close(c.aimY, 3, 1e-3, 'Tilt 0 = senkrecht nach unten');
  const far = aimFromPanTilt(f, 0, 120);
  close(far.aimX, 2 + 4 * Math.tan(MAX_TILT_DEG * Math.PI / 180), 1e-6, 'ueber 85° wird begrenzt');

  // DMX-Mitte = 0°, bei Bereich −270..270 bzw. −135..135.
  const lk = decodeLook(f, uni({ 1: 128, 2: 128 }), 0)!;
  close(lk.pan!, -270 + 540 * 128 / 255, 1e-6);
  close(lk.tilt!, -135 + 270 * 128 / 255, 1e-6);
  console.log('✓ Pan/Tilt ergeben den Zielpunkt, den man mit tan() nachrechnet');
}

// ── 6) GDTF ───────────────────────────────────────────────────────────────
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <FixtureType Name="Spot" LongName="Test Spot 300" Manufacturer="Acme">
    <Wheels>
      <Wheel Name="Color1">
        <Slot Name="Open" Color="0.3127,0.3290,100"/>
        <Slot Name="Red" Color="0.64,0.33,21.3"/>
      </Wheel>
    </Wheels>
    <PhysicalDescriptions><Properties><Weight Value="21.5"/></Properties></PhysicalDescriptions>
    <Geometries>
      <Geometry Name="Base"><Axis Name="Yoke"><Beam Name="Beam" BeamAngle="18" FieldAngle="24" LuminousFlux="12000" PowerConsumption="300" ColorTemperature="7000"/></Axis></Geometry>
    </Geometries>
    <DMXModes>
      <DMXMode Name="Standard 16bit" Geometry="Base">
        <DMXChannels>
          <DMXChannel DMXBreak="1" Offset="1,2"><LogicalChannel Attribute="Pan"><ChannelFunction Attribute="Pan" DMXFrom="0/1" PhysicalFrom="-270" PhysicalTo="270"/></LogicalChannel></DMXChannel>
          <DMXChannel DMXBreak="1" Offset="3,4"><LogicalChannel Attribute="Tilt"><ChannelFunction Attribute="Tilt" DMXFrom="0/1" PhysicalFrom="-135" PhysicalTo="135"/></LogicalChannel></DMXChannel>
          <DMXChannel DMXBreak="1" Offset="5"><LogicalChannel Attribute="Shutter1">
            <ChannelFunction Attribute="Shutter1" DMXFrom="0/1">
              <ChannelSet Name="Closed" DMXFrom="0/1"/>
              <ChannelSet Name="Open" DMXFrom="32/1"/>
            </ChannelFunction>
            <ChannelFunction Attribute="Shutter1Strobe" DMXFrom="64/1"/>
          </LogicalChannel></DMXChannel>
          <DMXChannel DMXBreak="1" Offset="6,7"><LogicalChannel Attribute="Dimmer"><ChannelFunction Attribute="Dimmer" DMXFrom="0/1"/></LogicalChannel></DMXChannel>
          <DMXChannel DMXBreak="1" Offset="8"><LogicalChannel Attribute="Color1">
            <ChannelFunction Attribute="Color1" DMXFrom="0/1" Wheel="Color1">
              <ChannelSet Name="Open" DMXFrom="0/1" WheelSlotIndex="1"/>
              <ChannelSet Name="Red" DMXFrom="10/1" WheelSlotIndex="2"/>
            </ChannelFunction>
          </LogicalChannel></DMXChannel>
          <DMXChannel DMXBreak="1" Offset="9"><LogicalChannel Attribute="Zoom"><ChannelFunction Attribute="Zoom" DMXFrom="0/1" PhysicalFrom="6" PhysicalTo="45"/></LogicalChannel></DMXChannel>
          <DMXChannel DMXBreak="1" Offset="10"><LogicalChannel Attribute="Gobo1"><ChannelFunction Attribute="Gobo1" DMXFrom="0/1"/></LogicalChannel></DMXChannel>
          <DMXChannel DMXBreak="1" Offset=""><LogicalChannel Attribute="Dimmer"/></DMXChannel>
          <DMXChannel DMXBreak="2" Offset="1"><LogicalChannel Attribute="Dimmer"/></DMXChannel>
        </DMXChannels>
      </DMXMode>
    </DMXModes>
  </FixtureType>
</GDTF>`;

{
  assert.equal(dmxFraction('255/1'), 1, '255/1 ist voll');
  close(dmxFraction('128/1'), 128 / 255, 1e-9);
  close(dmxFraction('128/1s'), 0.5, 1e-9, 'geschoben: 128·256 von 65536');
  const red = cieToRgb('0.64,0.33,21.3')!;
  close(red[0], 1, 1e-3, 'sRGB-Rot'); assert.ok(red[1] < 0.02 && red[2] < 0.02, 'reines Rot bleibt rein');

  const g = gdtfFromXml(XML, 'spot.gdtf');
  assert.equal(g.name, 'Test Spot 300');
  assert.equal(g.manufacturer, 'Acme');
  assert.deepEqual(g.beam, { beamAngle: 18, fieldAngle: 24, lumens: 12000, wattage: 300, colorTemp: 7000 });
  assert.equal(g.weight, 21.5);
  assert.equal(g.modes.length, 1);
  const m = g.modes[0]!;
  assert.equal(m.channels, 10, 'hoechster Offset 10; der virtuelle und der zweite Break zaehlen nicht');
  assert.equal(m.origin, 'gdtf');
  const by = (a: string) => m.layout!.find((c) => c.attribute === a)!;
  assert.deepEqual([by('pan').offset, by('pan').fineOffset], [0, 1]);
  assert.deepEqual(by('pan').range, [-270, 270]);
  assert.deepEqual([by('dimmer').offset, by('dimmer').fineOffset], [5, 6]);
  assert.deepEqual(by('zoom').range, [6, 45]);
  assert.equal(by('other').label, 'Gobo1', 'Unbekanntes bleibt als „other" mit Namen stehen');
  assert.ok(g.warnings.some((w) => w.includes('second DMX break')), 'der zweite Break wird gemeldet, nicht verschwiegen');

  // Shutter: „Closed" 0..31 ist zu, alles darueber (auch Strobe) offen.
  const f = leuchte('g', undefined);
  f.fixture.dmxModes = g.modes; f.dmxModeId = m.id;
  assert.equal(decodeLook(f, uni({ 5: 10, 6: 255, 7: 255 }), 0)!.intensity, 0, 'Shutter „Closed"');
  close(decodeLook(f, uni({ 5: 40, 6: 255, 7: 255 }), 0)!.intensity, 1, 1e-6, 'Shutter „Open"');
  const col = decodeLook(f, uni({ 5: 40, 6: 255, 7: 255, 8: 20 }), 0)!.rgb!;
  close(col[0], 1); assert.ok(col[1] < 0.02, 'Farbrad-Platz 2 ist Rot');
  console.log('✓ GDTF: Modi, 16 bit, Bereiche, Shutter, Farbrad, Lichtdaten; Verlorenes gemeldet');
}

// ── 7) GDTF als Datei (ZIP, deflate) ──────────────────────────────────────
{
  const name = new TextEncoder().encode('description.xml');
  const raw = new TextEncoder().encode(XML);
  const comp = new Uint8Array(deflateRawSync(raw));
  const local = new Uint8Array(30 + name.length);
  const dv = new DataView(local.buffer);
  dv.setUint32(0, 0x04034b50, true); dv.setUint16(8, 8, true);
  dv.setUint32(18, comp.length, true); dv.setUint32(22, raw.length, true); dv.setUint16(26, name.length, true);
  local.set(name, 30);
  const cd = new Uint8Array(46 + name.length);
  const cv = new DataView(cd.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true);
  cv.setUint32(20, comp.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, name.length, true);
  cv.setUint32(42, 0, true);
  cd.set(name, 46);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true);
  ev.setUint32(12, cd.length, true); ev.setUint32(16, local.length + comp.length, true);
  const zip = new Uint8Array([...local, ...comp, ...cd, ...eocd]);
  const g = await readGdtf(zip, 'spot.gdtf');
  assert.equal(g.modes[0]!.channels, 10, 'aus der gepackten Datei dasselbe wie aus dem XML');
  await assert.rejects(readGdtf(new Uint8Array(40)), /zip/, 'keine ZIP-Datei: klare Meldung');
  console.log('✓ .gdtf-Datei wird entpackt und gelesen');
}

console.log('dmxlive:check ok');
