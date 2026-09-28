// ───────────────────────────────────────────────────────────────────────────
// Der DMX-Fussabdruck wird EINMAL gerechnet, auch beim Export.
// Lauf: `npm run equipment:check`
//
// BEFUND (Defektformen-Sweep, Form `zwei-rechnungen`, gemessen 2026-09-07).
// `core/patch.ts` hat mit `footprint()` die eine Antwort auf die Frage „wie
// viele DMX-Kanaele belegt diese Einheit". `integration/equipment.ts` stellte
// dieselbe Frage noch einmal — und gab im Nein-Fall eine ANDERE Antwort:
//
//     core/patch.ts          … ? f.fixture.dmxChannels : 0
//     integration/equipment  … ? f.dmxChannels        : 1
//
// Die 0 ist im Planer keine Rundungsfrage, sondern eine Kodierung:
// „konventionelle Leuchte am Dimmer — bekommt eine Kanalnummer, aber keine
// DMX-Adresse". `autoPatch` ueberspringt solche Einheiten beim Patchen,
// `rigCheck` verlangt fuer sie keine Adresse, `preflight` meldet sie, wenn
// die Kategorie elektronisch ist. Der Export an den Kabel-Planer behauptete
// fuer genau diese Einheiten einen Fussabdruck von 1 — und haengte ihnen
// obendrein eine DMX-Eingangs- und eine Thru-Buchse an. Wer den Plan
// uebernahm, bekam eine DMX-Leitung zum Stufenlinsenscheinwerfer am Dimmer.
//
// WAS DIESER LAUF PRUEFT:
//
//  1. Der exportierte Fussabdruck IST `footprint()` — fuer die
//     DMX-Leuchte und fuer die konventionelle.
//  2. Eine Einheit ohne DMX bekommt keine DMX-Buchsen, aber sehr wohl Strom.
//  3. Eine Einheit MIT DMX bekommt beides — die Gegenprobe dazu, sonst waere
//     „gar keine DMX-Buchsen mehr" ebenfalls gruen.
//  4. Der Patch-Text an der Buchse kommt aus Universe und Adresse.
//  5. Quelltext: kein Modul rechnet den Fussabdruck noch selbst.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { footprint } from '../src/core/patch.ts';
import { fixtureToEquipment } from '../src/integration/equipment.ts';
import { fixtureLibrary } from '../src/core/fixtureLibrary.ts';
import { GERAETETYP_IDS, geraetetypIdVon } from '../src/core/geraetetypIds.ts';
import type { PlacedFixture } from '../src/types.ts';

const lies = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const platziert = (id: string, fixture: Record<string, unknown>, rest: Record<string, unknown> = {}) =>
  ({
    id, x: 1, y: 2, mountingHeight: 5, aimX: 1, aimY: 0, dimming: 1,
    bodyRotation: 0, gelFilterIds: [],
    fixture: { id: `lib-${id}`, name: 'X', manufacturer: 'Y', category: 'spot', ...fixture },
    ...rest,
  }) as unknown as PlacedFixture;

// ── 1) Der exportierte Fussabdruck ist der des Planers ────────────────────
const mover = platziert('m1', { dmxChannels: 16, wattage: 470, powerConnector: 'powerCON TRUE1' },
  { universe: 2, dmxAddress: 129 });
const dimmer = platziert('d1', { dmxChannels: 0, wattage: 1000, powerConnector: 'Schuko' },
  { channel: 7 });

const moverEq = fixtureToEquipment(mover);
const dimmerEq = fixtureToEquipment(dimmer);

assert.equal(moverEq.categoryProps?.['DMX-Footprint'], footprint(mover), 'Mover: Export = footprint()');
assert.equal(moverEq.categoryProps?.['DMX-Footprint'], 16);
assert.equal(dimmerEq.categoryProps?.['DMX-Footprint'], footprint(dimmer), 'Dimmer: Export = footprint()');
assert.equal(dimmerEq.categoryProps?.['DMX-Footprint'], 0,
  'eine Dimmerleuchte belegt NULL DMX-Kanaele — 1 war die alte, zweite Rechnung');
console.log('✓ der exportierte Fussabdruck ist der des Planers, auch fuer die Dimmerleuchte');

// ── 2) Ohne DMX keine DMX-Buchsen, aber Strom ─────────────────────────────
const dimmerPorts = [...dimmerEq.inputs, ...dimmerEq.outputs];
assert.equal(dimmerPorts.filter((p) => p.type === 'DMX').length, 0,
  'eine Leuchte am Dimmer hat keine DMX-Buchse');
assert.equal(dimmerEq.inputs.filter((p) => p.type === 'Power').length, 1,
  'Strom braucht sie trotzdem — und zwar genau einmal');
console.log('✓ ohne DMX keine DMX-Buchse, Strom aber schon');

// ── 3) Gegenprobe: mit DMX gibt es sie weiterhin ──────────────────────────
assert.equal(moverEq.inputs.filter((p) => p.type === 'DMX').length, 1);
assert.equal(moverEq.outputs.filter((p) => p.type === 'DMX').length, 1, 'DMX Thru bleibt');
assert.equal(moverEq.inputs.filter((p) => p.type === 'Power').length, 1);
console.log('✓ mit DMX gibt es Eingang und Thru weiterhin');

// ── 4) Der Patch-Text kommt aus Universe und Adresse ──────────────────────
const dmxIn = moverEq.inputs.find((p) => p.type === 'DMX')!;
assert.equal(dmxIn.contentLabel, 'U2.129');
assert.ok(dmxIn.name.includes('U2.129'), 'die Adresse steht am Port, nicht nur im Rand');
const ohnePatch = fixtureToEquipment(platziert('m2', { dmxChannels: 8 }));
assert.equal(ohnePatch.inputs.find((p) => p.type === 'DMX')!.contentLabel, undefined,
  'ohne Adresse wird keine erfunden');
console.log('✓ der Patch-Text kommt aus Universe und Adresse, sonst gar nicht');

// ── 5) Niemand rechnet den Fussabdruck noch selbst ────────────────────────
// Die Frage lautet „hat diese Einheit DMX / wie viele Kanaele" — sie gehoert
// nach `core/patch.ts`. Zeilen, die `dmxChannels` gegen etwas vergleichen,
// stellen sie ein zweites Mal.
//
// Gelaufen wird der ORDNER, nicht eine Liste: eine aufgezaehlte Domaene faellt
// beim ersten neuen Modul auseinander, und zwar unbemerkt.
const AUSNAHMEN = new Set([
  'src/core/patch.ts',                 // die eine Stelle
  'src/components/FixtureEditor.tsx',  // das Eingabefeld selbst
  'src/components/PropertyPanel.tsx',  // das Spec-Feld; die Anzeige laeuft ueber footprint()
]);

const dateien: string[] = [];
const lauf = (rel: string) => {
  for (const eintrag of readdirSync(new URL(`../${rel}`, import.meta.url), { withFileTypes: true })) {
    const kind = `${rel}/${eintrag.name}`;
    if (eintrag.isDirectory()) {
      if (eintrag.name === 'test' || eintrag.name === '__tests__') continue;
      lauf(kind);
    } else if (/\.(ts|tsx)$/.test(eintrag.name)) {
      dateien.push(kind);
    }
  }
};
lauf('src');
assert.ok(dateien.length > 50, `zu wenige Dateien durchsucht (${dateien.length}) — der Waechter laeuft ins Leere`);

const schuldige: string[] = [];
for (const datei of dateien) {
  if (AUSNAHMEN.has(datei)) continue;
  lies(datei).split('\n').forEach((zeile, i) => {
    const t = zeile.trimStart();
    if (t.startsWith('//') || t.startsWith('*')) return;
    if (/dmxChannels[^\n]*(&&|\?\?\s*0)[^\n]*[<>]/.test(zeile) || /dmxChannels\s*[<>]/.test(zeile)) {
      schuldige.push(`${datei}:${i + 1}  ${zeile.trim()}`);
    }
  });
}
assert.deepEqual(schuldige, [],
  `der Fussabdruck wird ausserhalb von core/patch.ts noch einmal gerechnet:\n${schuldige.join('\n')}`);
console.log('✓ der Fussabdruck wird nur an einer Stelle gerechnet');

// ─── DIE GERAETETYP-ID REIST MIT (2026-09-28) ──────────────────────────────
//
// `core/shopOrder.ts` haelt den Befund fest, aus dem dieses Feld kommt:
//
//   > Ob der Source Four im Plan DERSELBE Artikel ist wie der im Lager, ist
//   > eine Behauptung — und zwar eine, die dieses Modell nicht beweisen kann:
//   > eine `Fixture` traegt keine geraetetyp-weite Kennung. Es bleibt der
//   > Vergleich von Hersteller und Modellname, und der ist ein VERGLEICH VON
//   > ZEICHENKETTEN.
//
// Jetzt traegt sie eine, und der Kabel-Planer loest damit autoritativ auf
// seinen Katalog-Eintrag auf. Geprueft wird dreierlei, und jedes davon waere
// sonst unbemerkt kaputtzumachen:

// 1. JEDE Leuchte ist abgedeckt. Eine Luecke hiesse: dieses Geraet wird beim
//    Export wieder namentlich geraten, und niemand merkt es.
const ohneId = fixtureLibrary.filter((f) => !geraetetypIdVon('fixture', f.id)).map((f) => f.id);
assert.deepEqual(ohneId, [], `ohne Geraetetyp-Id: ${ohneId.join(', ')}`);
console.log(`✓ alle ${fixtureLibrary.length} Leuchten haben eine Geraetetyp-Id`);

// 2. Keine Id doppelt — sonst zeigten zwei Leuchten auf dasselbe Datenblatt.
const alleIds = Object.values(GERAETETYP_IDS).flatMap((t) => Object.values(t));
assert.equal(alleIds.length, new Set(alleIds).size, 'eine Geraetetyp-Id kommt doppelt vor');
console.log('✓ keine Geraetetyp-Id doppelt');

// 3. Die Ids sind STABIL. Sie sind UUIDv5 ueber einen festen Namensraum; ein
//    neu gewuerfelter Namensraum liesse jede gespeicherte Verknuepfung ins
//    Leere zeigen. Dieser Goldwert ist der Anker dafuer — er steht identisch
//    im cable-planner, der die Tabelle erzeugt.
assert.equal(geraetetypIdVon('fixture', 'etc-s4-19'), '117a0db0-bf94-5669-a8db-f98eec23542b',
  'der Namensraum der Geraetetyp-Ids hat sich geaendert — jede gespeicherte Verknuepfung zeigt ins Leere');
console.log('✓ der Namensraum steht fest (Goldwert)');

// 4. Und sie kommt beim Export wirklich mit. Eine Tabelle, die niemand
//    weiterreicht, ist eine Notiz.
const s4 = fixtureLibrary.find((f) => f.id === 'etc-s4-19');
assert.ok(s4, 'etc-s4-19 fehlt im Katalog');
assert.equal(
  fixtureToEquipment(platziert('p1', { ...s4 })).deviceTypeId,
  '117a0db0-bf94-5669-a8db-f98eec23542b',
  'der Export gibt die Geraetetyp-Id nicht mit',
);
// Eine EIGENE Leuchte hat keinen Katalog-Eintrag — dann steht das Feld NICHT
// da. Das ist eine Auskunft und keine Luecke; eine erfundene Id waere
// schlimmer. (`platziert` vergibt von sich aus `lib-<id>`, also ohnehin eine
// Kennung, die im Katalog nicht vorkommt.)
assert.equal(
  fixtureToEquipment(platziert('p2', { ...s4, id: 'custom-1727000000000' })).deviceTypeId,
  undefined,
  'eine eigene Leuchte bekommt eine Id angedichtet',
);
console.log('✓ der Export gibt sie mit — und erfindet keine');

console.log('\nalle Pruefungen bestanden');
