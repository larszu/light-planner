// Headless-Check fuer das .avplan-Gesamtformat (verlustfrei).
// Lauf: `npm run avplan:check`  (node --experimental-strip-types).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeAvPlan, parseAvPlan, AVPLAN_KIND, foreignDomainsField,
  avPlanImportWarning, avPlanContentCount,
  KNOWN_DOMAIN_SLOTS, unknownDomainSlots, pickUnknownDomains,
} from '../src/core/avplan.ts';

// Eine reichhaltige Lighting-Domaene (so wuerde light sie schreiben).
const lighting = {
  meta: { name: 'Show', author: 'me', version: '1.0', createdAt: 't', updatedAt: 't' },
  fixtures: [{
    id: 'f1', x: 3, y: 4, mountingHeight: 5, aimX: 3, aimY: 1, dimming: 0.8,
    bodyRotation: 0, channel: 1, unitNumber: 1, universe: 1, dmxAddress: 1,
    gelFilterIds: ['L201'], barnDoors: { top: 10, bottom: 0, left: 0, right: 0 },
    currentBeamAngle: 19, currentColorTemp: 3200, purpose: 'Key', focused: true,
    fixture: { id: 'etc-s4', name: 'ETC S4 19°', manufacturer: 'ETC', category: 'spot', wattage: 750, beamAngle: 19 },
  }],
  scenes: [{ id: 's1', label: 'Blackout', fixtureStates: {} }],
  sun: { lat: 52.5, lon: 13.4, date: '2026-06-30', time: '12:00', northDeg: 0, intensity: 1 },
};

const venue = {
  name: 'Halle', widthM: 20, heightM: 12,
  persons: [{ id: 'p1', x: 1, y: 1, height: 1.8, label: 'A' }],
  walls: [], stageObjects: [],
};

// 1) Round-Trip durch JSON erhaelt alle Domaenen 1:1.
const ex = makeAvPlan({
  app: 'light-planner', appVersion: '1.0.0', exportedAt: 't', venue,
  domains: { lighting, cameras: { mcplan: true }, cabling: { equipment: [] } },
});
assert.equal(ex.kind, AVPLAN_KIND);
const back = parseAvPlan(JSON.stringify(ex));
assert.deepEqual(back.domains.lighting, lighting);
assert.deepEqual(back.domains.cameras, { mcplan: true });
console.log('✓ Round-Trip erhaelt alle Domaenen 1:1');

// 2) Passthrough: eine Fremd-App (z. B. Cable) laedt, aendert NUR ihren Slot,
//    reicht "lighting" unveraendert durch → kein Lampen-Detail geht verloren.
const loaded = parseAvPlan(JSON.stringify(ex));
const reexported = makeAvPlan({
  app: 'cable-planner', appVersion: '8.2.0', exportedAt: 't2', venue: loaded.venue,
  domains: {
    lighting: loaded.domains.lighting,           // unveraendert durchgereicht
    cameras: loaded.domains.cameras,             // unveraendert durchgereicht
    cabling: { equipment: [{ id: 'e1', name: 'ATEM' }] }, // eigener Slot bearbeitet
  },
});
const afterTrip = parseAvPlan(JSON.stringify(reexported));
assert.deepEqual(afterTrip.domains.lighting, lighting, 'Lampen exakt erhalten nach Reise durch Cable');
assert.deepEqual((afterTrip.domains.cabling as { equipment: unknown[] }).equipment.length, 1);
console.log('✓ Passthrough: Lampen mit allen Details ueberstehen die Reise durch eine Fremd-App');

// 3) Fremde / inkompatible Dateien werden abgelehnt.
assert.throws(() => parseAvPlan('{"kind":"lightplan"}'));
assert.throws(() => parseAvPlan(JSON.stringify({ ...ex, formatVersion: 99 })));
console.log('✓ Fremde / inkompatible Dateien werden abgelehnt');

// 4) ADR-005 — die App-Ebene, die die Pruefungen 1-3 strukturell NICHT sehen.
//
//    Pruefung 2 baut den Re-Export von Hand aus `loaded.domains`. Damit prueft
//    sie das FORMAT und ueberspringt genau die Stelle, an der der Verlust
//    passierte: die Fremd-Domaenen lagen in einem React-Ref und nicht in der
//    Projektdatei, also war jedes Speichern-und-neu-Oeffnen zwischen Import und
//    Export ein vollstaendiger Verlust des Kamera- und Kabelplans.
const preserved = { cameras: { mcplan: true }, cabling: { equipment: [{ id: 'e1' }] } };

// 4a) Was zu bewahren ist, wandert ins Feld.
const field = foreignDomainsField(preserved);
assert.deepEqual(field.avForeign, preserved);

// 4b) Voller Datei-Round-Trip: speichern, neu laden, exportieren.
const savedFile = JSON.parse(JSON.stringify({ meta: { name: 'X' }, ...field })) as {
  avForeign?: { cameras?: unknown; cabling?: unknown };
};
const afterReload = foreignDomainsField(savedFile.avForeign ?? {});
assert.deepEqual(afterReload.avForeign, preserved, 'Fremd-Domaenen ueberleben Speichern und Laden');

// 4c) Nichts zu bewahren heisst: kein Feld. Ein leeres `avForeign` in jeder
//     Datei waere Ballast — und die Behauptung, es habe eine gegeben.
assert.equal('avForeign' in foreignDomainsField({}), false);

// 4d) Eine einzelne Domaene erfindet die fehlende nicht.
assert.deepEqual(foreignDomainsField({ cabling: { equipment: [] } }).avForeign, {
  cabling: { equipment: [] },
});
console.log('✓ ADR-005: Fremd-Domaenen ueberleben das native Speichern');


// ── ADR-005, Regel 3 — der Import ersetzt das offene Projekt ────────────────
//
// Traegt die Datei keine lighting-Domaene, ersetzt er es durch ein LEERES:
// der Nutzer oeffnet einen geteilten Plan aus dem Cable-Planner, um sich die
// Verkabelung anzusehen, und sein Rig ist weg. Kein Hinweis, keine Rueckfrage,
// kein Undo — der Import leert die History. `handleNew` in derselben Datei
// fragt seit jeher nach, bevor es Inhalt verwirft; der gefaehrlichere Weg
// fragte nicht.
const leer = {
  fixtures: 0, trusses: 0, scenes: 0, walls: 0, stageElements: 0,
  shapes: 0, ceilings: 0, persons: 0, hasFloorPlan: false,
};
const rig = { ...leer, fixtures: 12, trusses: 3, scenes: 4 };

// Nichts zu verlieren -> keine Rueckfrage. Der Hinweis darf nicht zur
// Klickgewohnheit werden, sonst liest ihn niemand mehr.
assert.equal(avPlanImportWarning(true, leer), null);
assert.equal(avPlanImportWarning(false, leer), null);

// Datei OHNE Licht-Domaene: der Fall, den niemand erwartet, wird benannt.
const ohne = avPlanImportWarning(false, rig);
assert.ok(ohne && ohne.includes('KEINE Licht-Domaene'), 'fehlende Domaene muss benannt werden');
assert.ok(ohne.includes('12 Lampen'), 'der Bestand muss beziffert sein');
assert.ok(ohne.includes('leeren'), 'das Ergebnis muss benannt sein');

// Datei MIT Licht-Domaene: normales Oeffnen, aber es ersetzt trotzdem.
const mit = avPlanImportWarning(true, rig);
assert.ok(mit && !mit.includes('KEINE Licht-Domaene'));
assert.ok(mit.includes('ersetzt das offene Projekt'));

// Jedes einzelne Feld zaehlt — sonst rutscht ein Projekt, das nur aus Waenden
// oder nur aus einem Gebaeudeplan besteht, ungefragt durch.
for (const key of Object.keys(leer) as Array<keyof typeof leer>) {
  const nur = { ...leer, [key]: key === 'hasFloorPlan' ? true : 1 };
  assert.equal(avPlanContentCount(nur), 1, `${key} zaehlt nicht zum Bestand`);
  assert.ok(avPlanImportWarning(false, nur), `${key} allein loest keine Rueckfrage aus`);
}
console.log('\u2713 Import ohne Licht-Domaene fragt nach, statt still zu leeren');

// ───────────────────────────────────────────────────────────────────────────
// ADR-005 Design-Frage 4 — ein Slot, den DIESES Format nicht benennt.
//
// Gemessener Ausgangszustand: keine der drei Apps reichte einen vierten
// Domaenen-Slot durch. `parseAvPlan` nahm die Datei trotzdem an — weder
// bewahrt noch verweigert noch gemeldet, also das einzige der drei denkbaren
// Verhalten, das nicht vertretbar ist. Entschieden: bewahren.
// ───────────────────────────────────────────────────────────────────────────
const mitFremd = makeAvPlan({
  app: 'irgendwer', appVersion: '9.9.9', exportedAt: 't', venue,
  domains: { lighting, audio: { channels: 32 }, rigging: { points: 4 } },
});

assert.deepEqual(unknownDomainSlots(mitFremd), ['audio', 'rigging']);
assert.deepEqual(pickUnknownDomains(mitFremd), { audio: { channels: 32 }, rigging: { points: 4 } });

// Ein leerer Slot ist keine Aussage und nichts zum Bewahren.
assert.deepEqual(
  unknownDomainSlots(makeAvPlan({
    app: 'x', appVersion: '1', exportedAt: 't', venue,
    domains: { lighting, audio: undefined },
  })),
  [],
);

// Keiner der drei bekannten Slots darf als fremd gelten.
for (const slot of KNOWN_DOMAIN_SLOTS) {
  const nurDieser = makeAvPlan({
    app: 'x', appVersion: '1', exportedAt: 't', venue, domains: { [slot]: {} },
  });
  assert.deepEqual(unknownDomainSlots(nurDieser), [], `${slot} gilt faelschlich als fremd`);
}

// Der ganze Weg: Datei -> parse -> natives Speichern -> Export -> parse.
const gelesen = parseAvPlan(JSON.stringify(mitFremd));
const imFile = foreignDomainsField({
  cameras: gelesen.domains.cameras,
  cabling: gelesen.domains.cabling,
  unknownDomains: pickUnknownDomains(gelesen),
});
assert.deepEqual(imFile.avForeign?.unknownDomains, { audio: { channels: 32 }, rigging: { points: 4 } });

const wiederRaus = makeAvPlan({
  app: 'light-planner', appVersion: '1', exportedAt: 't', venue,
  domains: {
    ...(imFile.avForeign?.unknownDomains ?? {}),
    lighting,
    cameras: imFile.avForeign?.cameras,
    cabling: imFile.avForeign?.cabling,
  },
});
const final = parseAvPlan(JSON.stringify(wiederRaus));
assert.deepEqual(final.domains.audio, { channels: 32 }, 'fremder Slot ueberlebt die Runde nicht');
assert.deepEqual(final.domains.rigging, { points: 4 });
// Und der eigene Slot bleibt der eigene.
assert.ok(final.domains.lighting, 'eigener Slot verloren');

// Ein leeres Fremd-Fach gehoert nicht ins File — sonst steht in jedem
// Projekt ein `unknownDomains: {}`, das nichts aussagt.
assert.equal(foreignDomainsField({ unknownDomains: {} }).avForeign, undefined);

// Kein Versionssprung: das Durchreichen ist keine neue Format-Version.
assert.equal(final.formatVersion, 1);
console.log('\u2713 ADR-005: unbekannte Domaenen-Slots ueberleben jede Richtung');

// ───────────────────────────────────────────────────────────────────────────
// Die Aufrufer, nicht nur das Format.
//
// Alles oben prueft `core/avplan.ts`. Das Format WAR verlustfrei -- und
// trotzdem gingen Daten verloren, weil ein Aufrufer die Felder nicht
// mitschrieb: `handleSaveProject` (Speichern aufs Geraet, localStorage) baute
// dasselbe `ProjectData` wie `handleSaveToFile`, aber ohne die drei
// ADR-005-Felder. Beim Laden setzt `handleLoadProject` die Refs aus GENAU
// diesen Feldern zurueck -- ein Speichern-und-Laden loeschte damit still die
// Kamera-, Kabel- und Raum-Daten, die ueber .avplan hereingekommen waren.
//
// Fuenf gruene Checks sagten dazu nichts, weil keiner den Aufrufer ansah.
// Deshalb steht das hier: die Zusicherung gilt fuer JEDE Stelle, die ein
// `ProjectData` baut -- auch fuer die dritte, die es noch nicht gibt.
{
  const appSrc = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

  // Jede Stelle `const data: ProjectData = { ... };` -- der Block bis zur
  // Zeile, die nur `};` enthaelt (so stehen beide Literale heute da).
  const stellen = [...appSrc.matchAll(/const\s+data:\s*ProjectData\s*=\s*\{([\s\S]*?)\n\s*\};/g)];
  assert.ok(
    stellen.length >= 2,
    `ProjectData-Literale in App.tsx gefunden: ${stellen.length} -- erwartet mindestens 2 ` +
      '(Datei- und Geraete-Pfad). Wenn das Muster nicht mehr passt, prueft dieser ' +
      'Check nichts mehr und muss angepasst werden, nicht geloescht.',
  );

  for (const [i, m] of stellen.entries()) {
    const block = m[1];
    assert.match(
      block,
      /foreignDomainsField\(preservedDomainsRef\.current\)/,
      `ProjectData-Literal #${i + 1} in App.tsx schreibt avForeign nicht (ADR-005)`,
    );
    assert.match(
      block,
      /venueForeign:\s*preservedVenueRef\.current/,
      `ProjectData-Literal #${i + 1} in App.tsx schreibt venueForeign nicht (ADR-005)`,
    );
    assert.match(
      block,
      /personForeign:\s*preservedPersonsRef\.current/,
      `ProjectData-Literal #${i + 1} in App.tsx schreibt personForeign nicht (ADR-005)`,
    );
  }
  console.log(`\u2713 ADR-005: alle ${stellen.length} ProjectData-Stellen schreiben die Fremd-Felder`);
}

console.log('\nAlle .avplan-Verlustfreiheits-Checks bestanden.');
