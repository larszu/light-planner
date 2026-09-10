// ───────────────────────────────────────────────────────────────────────────
// Der Betriebsmodus entscheidet den Fussabdruck.
// Lauf: `npm run dmx:check`
//
// BEFUND (gemessen 2026-09-10). `footprint()` las EINE Zahl je Geraetetyp —
// `fixture.dmxChannels`. Der Robin MegaPointe steht im Katalog mit 30
// Kanaelen; ein Moving Head hat aber je Betriebsart einen anderen
// Fussabdruck, und die 30 koennen fuer hoechstens einen seiner Modi stimmen.
//
// Der teure Fehler dabei ist nicht die falsche Zahl an EINER Stelle, es ist
// der Versatz: eine Kanalzahl daneben, und ab dem naechsten Geraet stimmt
// jede Adresse nicht mehr — um genau den Unterschied der beiden Modi. Das
// faellt nicht beim Patchen auf, sondern wenn das dritte Geraet auf einen
// Befehl reagiert, der dem zweiten galt.
//
// Dieser Lauf prueft nicht, „ob eine Zahl herauskommt", sondern die vier
// Zusagen, an denen das haengt:
//   1. Der Modus entscheidet — zwei Modi, zwei Fussabdruecke.
//   2. Unbekannt bleibt unbekannt. `null`, nicht 0, nicht 1.
//   3. Die alte Angabe bleibt lesbar, aber sie gilt als geschaetzt.
//   4. Was der Planer nicht weiss, sagt er — im Plan-Check, auf dem
//      Instrument-Schedule und beim Export in den Kabel-Planer.
//
// Zwillingslauf im cable-planner: `tests/dmxAdressierung.test.ts` (Paket
// `@avplan/dmx-core`). Beide Apps rechnen dasselbe; wer hier etwas aendert,
// sieht drueben nach.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';

import {
  autoPatch, footprint, footprintOrNull, modeMissing, modeOf, modesOf,
  LEGACY_MODE_ID, UNIVERSE_SIZE,
} from '../src/core/patch.ts';
import { rigCheck } from '../src/core/rigCheck.ts';
import { fixtureToEquipment } from '../src/integration/equipment.ts';
import { parseConsolePatch, patchReturn } from '../src/core/consolePatch.ts';
import type { DmxMode, PlacedFixture } from '../src/types.ts';

const MODI: DmxMode[] = [
  { id: 'm1', name: 'Mode 1', channels: 25, origin: 'device' },
  { id: 'm2', name: 'Mode 2', channels: 39, origin: 'device' },
];

/** Eine Leuchte an Position `i` — entweder mit Modi oder mit blanker Kanalzahl. */
const leuchte = (
  i: number,
  spec: { modes?: DmxMode[]; channels?: number; modeId?: string },
): PlacedFixture =>
  ({
    id: `f${i}`, x: i, y: 0, mountingHeight: 5, aimX: i, aimY: 1, dimming: 1,
    bodyRotation: 0, gelFilterIds: [],
    dmxModeId: spec.modeId,
    fixture: {
      id: `lib-${i}`, name: 'Robin MegaPointe', manufacturer: 'Robe',
      category: 'moving-head', wattage: 470,
      dmxChannels: spec.channels,
      dmxModes: spec.modes,
    },
  }) as unknown as PlacedFixture;

const patch = (fs: PlacedFixture[]) =>
  autoPatch(fs, { startUniverse: 1, startAddress: 1, number: true, patch: true });

// ── 1) Der Modus entscheidet ──────────────────────────────────────────────
{
  const a = leuchte(0, { modes: MODI, modeId: 'm1' });
  const b = leuchte(1, { modes: MODI, modeId: 'm2' });
  assert.equal(footprint(a), 25, 'Mode 1 belegt 25 Kanaele');
  assert.equal(footprint(b), 39, 'Mode 2 belegt 39 Kanaele');
  assert.notEqual(footprint(a), footprint(b),
    'zwei Modi desselben Geraets muessen zwei verschiedene Zahlen ergeben — sonst ist der Modus Zierde');

  // Und die Adressvergabe rechnet damit, nicht mit einer festen Zahl.
  const rig = patch([a, b]);
  assert.equal(rig[0]!.dmxAddress, 1);
  assert.equal(rig[1]!.dmxAddress, 26, 'die zweite Leuchte faengt hinter 25 Kanaelen an');
  console.log('✓ zwei Modi desselben Geraets ergeben zwei Fussabdruecke, und die Vergabe folgt ihnen');
}

// ── 2) Unbekannt bleibt unbekannt ─────────────────────────────────────────
{
  const ohne = leuchte(0, { modes: MODI });   // Modi da, keiner gewaehlt
  assert.equal(footprintOrNull(ohne), null,
    'ohne gewaehlten Modus ist der Fussabdruck NICHT BEKANNT — und nicht 0 oder 1');
  assert.equal(modeMissing(ohne), true);
  assert.equal(modeOf(ohne), undefined);

  // Keine Adresse. Wer keinen Fussabdruck kennt, kann keinen reservieren.
  const rig = patch([ohne]);
  assert.equal(rig[0]!.dmxAddress, undefined, 'ohne Modus wird nichts vergeben');
  assert.equal(rig[0]!.universe, undefined);

  // ABER: die Leuchte faellt nicht durchs Raster. Genau das war die Gefahr —
  // `footprint()` gibt 0 zurueck, und die „ungepatcht"-Pruefung fragt
  // `> 0`. Ohne den eigenen Befund staende sie unpatchbar und unbeanstandet
  // im Plan und fehlte am Pult, wortlos.
  const befunde = rigCheck([ohne]);
  const gemeldet = befunde.find((i) => i.message.includes('ohne gewählten DMX-Modus'));
  assert.ok(gemeldet, 'eine Leuchte ohne gewaehlten Modus muss im Plan-Check stehen');
  assert.equal(gemeldet!.severity, 'error', 'und zwar als Fehler — sie ist nicht patchbar');
  assert.deepEqual(gemeldet!.ids, ['f0'], 'mit ihrer Id, damit sie im Plan zu finden ist');
  console.log('✓ ohne Modus: kein Fussabdruck, keine Adresse, aber ein Befund');
}

// ── 3) Ein einziger Modus braucht keine Wahl ──────────────────────────────
{
  // Sonst muesste jede der 47 Katalog-Leuchten erst von Hand „ihren"
  // einzigen Modus zugewiesen bekommen, bevor irgendetwas patchbar waere.
  const eins = leuchte(0, { modes: [{ id: 'x', name: 'Standard', channels: 8, origin: 'manual' }] });
  assert.equal(footprint(eins), 8);
  assert.equal(modeMissing(eins), false);
  console.log('✓ bei genau einem Modus ist er der gefahrene, ohne Zutun');
}

// ── 4) Die alte Angabe bleibt lesbar — als Schaetzung ─────────────────────
{
  const alt = leuchte(0, { channels: 30 });
  assert.equal(footprint(alt), 30, 'die alte Zahl gilt weiter — jeder gespeicherte Plan traegt sie');

  const modi = modesOf(alt.fixture);
  assert.equal(modi.length, 1, 'sie wird als EIN Modus gelesen');
  assert.equal(modi[0]!.id, LEGACY_MODE_ID);
  assert.equal(modi[0]!.origin, 'estimated',
    'und zwar als geschaetzt: ueber die Herkunft dieser Zahl steht in den Katalogeintraegen nichts');
  assert.ok(modi[0]!.evidence && modi[0]!.evidence.includes('dmxChannels'),
    'mit Beleg, woher der Modus kommt — sonst sieht er aus wie eingetragen');

  // Und der Plan-Check sagt es, statt die Zahl zu glauben.
  const befund = rigCheck([alt]).find((i) => i.message.includes('geschätzter Kanalzahl'));
  assert.ok(befund, 'geschaetzte Kanalzahlen gehoeren gemeldet');
  assert.equal(befund!.basis, 'assumed', 'und als Annahme gekennzeichnet (Bedarf 142)');
  console.log('✓ die alte Kanalzahl bleibt gueltig, aber sie gilt als Schaetzung — und sagt es');
}

// ── 5) Die Dimmerleuchte bleibt die Dimmerleuchte ─────────────────────────
{
  // `dmxChannels: 0` ist keine fehlende Angabe, sondern die Kodierung fuer
  // „konventionelle Leuchte am Dimmer": Kanalnummer ja, DMX-Adresse nein.
  // Waere sie jetzt „ohne Modus", stuende der halbe Konventionellen-Bestand
  // als Fehler im Plan-Check, und niemand liest ihn mehr.
  const dimmer = leuchte(0, { channels: 0 });
  assert.equal(footprintOrNull(dimmer), 0, 'kein DMX ist nicht dasselbe wie unbekannt');
  assert.equal(modeMissing(dimmer), false);
  assert.deepEqual(modesOf(dimmer.fixture), []);
  assert.equal(
    rigCheck([dimmer]).some((i) => i.message.includes('ohne gewählten DMX-Modus')), false,
    'eine Dimmerleuchte darf hier nicht auftauchen');
  console.log('✓ `dmxChannels: 0` bleibt „am Dimmer" und wird nicht zu „unbekannt"');
}

// ── 6) Die Universe-Grenze rechnet mit dem Modus ──────────────────────────
{
  // 13 Leuchten a 39 Kanaele = 507; die 14. passt nicht mehr. Mit der Zahl
  // aus Mode 1 (25) waere sie es noch — genau der Versatz, um den es geht.
  const rig = patch(Array.from({ length: 14 }, (_, i) => leuchte(i, { modes: MODI, modeId: 'm2' })));
  const u1 = rig.filter((f) => f.universe === 1);
  assert.equal(u1.length, 13, '13 x 39 = 507 Kanaele passen in Universe 1');
  assert.equal(u1[u1.length - 1]!.dmxAddress, 469, 'die letzte endet auf 507');
  assert.equal(rig[13]!.universe, 2, 'die 14. faengt im naechsten Universe an');
  assert.equal(rig[13]!.dmxAddress, 1);
  assert.ok(469 + 39 - 1 <= UNIVERSE_SIZE, 'und keine liegt ueber der Grenze');
  console.log('✓ der Universe-Uebergang folgt dem Modus, nicht einer festen Zahl');
}

// ── 7) Der Export in den Kabel-Planer verliert den Modus nicht ────────────
{
  const mit = fixtureToEquipment(leuchte(0, { modes: MODI, modeId: 'm2' }));
  assert.equal(mit.categoryProps!['DMX-Modus'], 'Mode 2', 'der gefahrene Modus faehrt mit');
  assert.equal(mit.categoryProps!['DMX-Modus-Herkunft'], 'device', 'und woher seine Zahl kommt');
  assert.equal(mit.categoryProps!['DMX-Footprint'], 39);

  const ohne = fixtureToEquipment(leuchte(1, { modes: MODI }));
  assert.equal(ohne.categoryProps!['DMX-Footprint'], 'unbekannt',
    'ein unbekannter Fussabdruck darf drueben nicht als 0 ankommen');
  assert.ok(ohne.inputs.some((p) => p.type === 'DMX'),
    'die DMX-Buchse bleibt: das Geraet HAT eine Ansteuerung, nur ihr Umfang ist offen');
  assert.ok(ohne.outputs.some((p) => p.type === 'DMX'), 'die Thru-Buchse ebenso');

  const dimmer = fixtureToEquipment(leuchte(2, { channels: 0 }));
  assert.equal(dimmer.inputs.some((p) => p.type === 'DMX'), false,
    'und die Dimmerleuchte bekommt weiterhin keine');
  console.log('✓ der Kabel-Planer bekommt Modus, Herkunft und ein ehrliches „unbekannt"');
}

// ── 8) Der Rueckweg vom Pult liest den Modus ──────────────────────────────
{
  // Die staerkste Quelle im Haus: das Pult weiss, womit es faehrt. Faehrt es
  // einen anderen Modus als der Plan annimmt, stimmt ab dem naechsten Geraet
  // keine Adresse mehr — deshalb steht der Unterschied auf dem Blatt.
  const plan = [{ ...leuchte(0, { modes: MODI, modeId: 'm1' }), channel: 1 }] as PlacedFixture[];
  const datei = 'Channel;Address;Mode\n1;1/1;Mode 2\n';
  const parse = parseConsolePatch(datei);
  assert.ok(parse.mapping.some((m) => m.column === 'mode'), 'die Modus-Spalte wird erkannt');
  assert.equal(parse.rows[0]!.mode, 'Mode 2');

  const zurueck = patchReturn(plan, parse);
  const modus = zurueck.entries[0]!.differences.find((d) => d.field === 'Modus');
  assert.ok(modus, 'ein abweichender Modus ist ein Unterschied und keine Fussnote');
  assert.equal(modus!.from, 'Mode 1', 'links steht der Plan');
  assert.equal(modus!.to, 'Mode 2', 'rechts das Pult');

  // Gegenprobe: gleicher Modus, kein Fehlalarm. Ein Blatt, das jede Zeile
  // meldet, wird nach dem dritten Mal nicht mehr gelesen.
  const gleich = patchReturn(plan, parseConsolePatch('Channel;Address;Mode\n1;1/1;Mode 1\n'));
  assert.equal(gleich.entries[0]!.differences.some((d) => d.field === 'Modus'), false);

  // Und ohne Modus-Spalte wird NICHT verglichen, statt Gleichheit zu
  // behaupten — dieselbe Regel wie fuer Typ und Beschriftung.
  const ohneSpalte = patchReturn(plan, parseConsolePatch('Channel;Address\n1;1/1\n'));
  assert.equal(ohneSpalte.entries[0]!.differences.some((d) => d.field === 'Modus'), false);
  console.log('✓ der Pult-Patch liefert den Modus, und ein abweichender steht auf dem Blatt');
}

console.log('\nalle Pruefungen bestanden');
