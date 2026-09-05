// ───────────────────────────────────────────────────────────────────────────
// Der Stand-Stempel auf den Ausdrucken (ADR-004, Roadmap-Initiative 4).
// Lauf: `npm run stamp:check`
//
// WORUM ES GEHT. Zwei Blaetter derselben Geraeteliste, eine Woche auseinander
// gedruckt, sehen identisch aus. Auf der Baustelle entscheidet dann, wer das
// juengere Blatt in der Hand haelt — und niemand kann es einem Blatt ansehen.
// Der Stempel loest genau das: Projekt, Stand, Zeitpunkt, acht Hex-Zeichen.
//
// WAS HIER GEPRUEFT WIRD, und warum jede Zeile davon noetig ist:
//
//  1. Der Fingerabdruck ist DERSELBE wie im cable-planner. Zwei Apps, die
//     verschiedene Staende desselben Projekts verschieden benennen, waeren
//     schlimmer als gar kein Stempel — man vergliche zwei Zahlen, die nichts
//     miteinander zu tun haben, und haelte das Ergebnis fuer eine Aussage.
//     Deshalb stehen unten drei feste Werte, gerechnet mit der Implementierung
//     aus `cable-planner/src/renderer/lib/documentStamp.ts`.
//
//  2. Der Stempel behauptet keine Abweichung ohne Bezugspunkt (ADR-004
//     Regel 2). Eine erfundene Abweichung ist derselbe Schaden wie ein
//     erfundener Zustand.
//
//  3. Er reagiert auf das, was auf dem Blatt steht — und nur darauf (Regel 1).
//     Eine verschobene Leuchte aendert den PLAN, nicht die Farbliste. Ein
//     Hinweis, der falsch anschlaegt, wird nach dem zweiten Mal ignoriert.
//
//  4. Ohne Stempel ist die Datei zeichengleich mit der von vorher. Sonst waere
//     die Einfuehrung eine stille Formataenderung fuer jedes Import-Skript,
//     das jemand auf diese CSVs gebaut hat.
//
//  5. Die Wege sind verdrahtet. Punkte 1-4 koennen alle stimmen und trotzdem
//     nie etwas zu pruefen bekommen — das ist die Form, die in diesen Repos
//     mehrfach gefunden wurde: gebaut, begruendet, unerreichbar.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildStamp,
  csvStampRow,
  documentFingerprint,
  fingerprint,
  planContentFingerprint,
  stampForStand,
  stampLine,
} from '../src/core/documentStamp.ts';
import { colorTable, inventoryTable, scheduleTable, tableToCsv } from '../src/core/documentTables.ts';
import { standText } from '../src/utils/plotExport.ts';
import type { PlacedFixture } from '../src/types.ts';

const NOW = new Date('2026-09-01T12:34:00.000Z');

// ── 1) Gleiche Ableitung wie im cable-planner ──────────────────────────────
// Diese drei Werte stammen aus der DORTIGEN Implementierung, ausgefuehrt am
// 2026-09-05. Sie sind der einzige belastbare Beweis, dass beide Apps
// denselben Fingerabdruck rechnen, ohne dass ein Repo das andere importieren
// muesste. Wer sie „anpasst", weil der Lauf rot ist, hat die Zusicherung
// weggeworfen statt den Fehler.
assert.equal(fingerprint('abc'), '1a47e90b');
assert.equal(fingerprint(''), '811c9dc5');
assert.equal(
  documentFingerprint(['Kanal', 'Typ'], [['1', 'Fresnel'], ['2', 'PAR']]),
  '397133df',
);
assert.equal(fingerprint('irgendwas').length, 8);
console.log('OK: Fingerabdruck identisch mit dem des cable-planners (3 Ankerwerte)');

// Der Unit-Separator ist kein Schmuck: mit ';' als Trenner waeren ['a;b'] und
// ['a','b'] derselbe String — zwei verschiedene Dokumente, ein Fingerabdruck.
assert.notEqual(
  documentFingerprint(['h'], [['a;b']]),
  documentFingerprint(['h', 'h2'], [['a', 'b']]),
);
// Die Reihenfolge steht sichtbar auf dem Blatt.
assert.notEqual(documentFingerprint(['x'], [['1'], ['2']]), documentFingerprint(['x'], [['2'], ['1']]));
// Leere Zelle, nicht der Text "null".
assert.equal(documentFingerprint(['x'], [[null]]), documentFingerprint(['x'], [['']]));
console.log('OK: Zellgrenze, Reihenfolge und leere Zellen gehen richtig ein');

// ── 2) Keine Abweichung ohne Bezugspunkt ───────────────────────────────────
const ohneStand = stampForStand({ project: 'Demo-Show', current: 'aaaaaaaa', now: NOW });
assert.equal(ohneStand.revision, undefined);
assert.equal(ohneStand.drifted, false);

const gleich = stampForStand({
  project: 'Demo-Show',
  current: 'aaaaaaaa',
  committed: { label: 'Stand Montag', fingerprint: 'aaaaaaaa' },
  now: NOW,
});
assert.equal(gleich.revision, 'Stand Montag');
assert.equal(gleich.drifted, false);

const abweichend = stampForStand({
  project: 'Demo-Show',
  current: 'bbbbbbbb',
  committed: { label: 'Stand Montag', fingerprint: 'aaaaaaaa' },
  now: NOW,
});
assert.equal(abweichend.drifted, true);

// Der Rohbau laesst eine Revision ohne Vergleichswert zu; `stampForStand`
// nicht. Genau dafuer gibt es ihn — hier steht, dass der Unterschied echt ist.
assert.equal(buildStamp({ project: 'X', revision: 'Rev 1', current: 'a', now: NOW }).drifted, false);
console.log('OK: ohne festgeschriebenen Stand keine Abweichungs-Behauptung');

// ── 3) Die Zeile sagt, was sie meint ───────────────────────────────────────
assert.ok(stampLine(abweichend).includes('Stand Montag + Änderungen'));
assert.ok(!stampLine(gleich).includes('Änderungen'));
assert.ok(stampLine(gleich).includes('Demo-Show'));
assert.ok(stampLine(gleich).includes('#aaaaaaaa'));
assert.match(stampLine(gleich), /\d{2}\.\d{2}\.\d{4}/);
// Titelblock des Plan-Ausdrucks: ohne Stand steht das ausdruecklich da, statt
// ein leeres Feld zu hinterlassen, das nach Datenverlust aussieht.
assert.equal(standText(ohneStand), 'nicht festgeschrieben');
assert.equal(standText(gleich), 'Stand Montag');
assert.equal(standText(abweichend), 'Stand Montag + Änderungen');
console.log('OK: Stempelzeile und Titelblock nennen den Stand vollstaendig');

// ── 4) Regel 1: nur was auf DIESEM Blatt steht ─────────────────────────────
const leuchte = (id: string, over: Partial<PlacedFixture> = {}): PlacedFixture =>
  ({
    id,
    x: 2,
    y: 3,
    mountingHeight: 5,
    aimX: 4,
    aimY: 4,
    bodyRotation: 0,
    dimming: 100,
    unitNumber: id.toUpperCase(),
    channel: 1,
    gelFilterIds: [],
    fixture: {
      id: 'fresnel-1kw',
      name: 'Fresnel 1kW',
      manufacturer: 'ADB',
      category: 'fresnel',
      wattage: 1000,
      weight: 8,
    },
    ...over,
  }) as unknown as PlacedFixture;

const plan = [leuchte('f1'), leuchte('f2', { x: 8 })];
const verschoben = [leuchte('f1', { x: 2.4 }), leuchte('f2', { x: 8 })];

// Der Plan-Ausdruck zeigt Positionen — eine verschobene Leuchte ist ein
// anderes Blatt.
assert.notEqual(
  planContentFingerprint({ fixtures: plan }),
  planContentFingerprint({ fixtures: verschoben }),
);
// Die Array-Reihenfolge ist eine Bearbeitungs-Reihenfolge, kein Bild: loeschen
// und neu anlegen ergibt denselben Plan.
assert.equal(
  planContentFingerprint({ fixtures: plan }),
  planContentFingerprint({ fixtures: [plan[1], plan[0]] }),
);
// Die Farbliste kennt keine Positionen. Wuerde sie mitwandern, meldete jeder
// Ausdruck nach dem ersten Verschieben eine Abweichung, die auf dem Blatt
// nicht zu sehen ist.
const fpTabelle = (t: { header: string[]; rows: unknown[][] }) =>
  documentFingerprint(t.header, t.rows as never);
assert.equal(fpTabelle(colorTable(plan)), fpTabelle(colorTable(verschoben)));
assert.equal(fpTabelle(inventoryTable(plan)), fpTabelle(inventoryTable(verschoben)));
// Die Geraeteliste dagegen fuehrt X/Y als Spalten — dort MUSS es durchschlagen.
assert.notEqual(fpTabelle(scheduleTable(plan)), fpTabelle(scheduleTable(verschoben)));
// Was auf dem Blatt beschriftet ist, zaehlt mit: eine umbenannte Traverse und
// ein gedrehtes Podest sind sichtbar andere Ausdrucke. Ohne diese Felder waere
// der Stempel gruen, waehrend zwei Blaetter verschieden aussehen — das ist die
// gefaehrliche Richtung des Fehlers.
const traverse = { id: 't1', x1: 2, y1: 3, x2: 11, y2: 3, label: 'FOH' };
assert.notEqual(
  planContentFingerprint({ fixtures: plan, trusses: [traverse] }),
  planContentFingerprint({ fixtures: plan, trusses: [{ ...traverse, label: 'FOH oben' }] }),
);
const podest = { id: 's1', x: 4, y: 5, width: 5, depth: 3, height: 0.6, rotation: 0, label: 'Bühne' };
assert.notEqual(
  planContentFingerprint({ fixtures: plan, stageElements: [podest] }),
  planContentFingerprint({ fixtures: plan, stageElements: [{ ...podest, rotation: 90 }] }),
);
// Und eine neue Folie aendert die Farbliste.
assert.notEqual(
  fpTabelle(colorTable(plan)),
  fpTabelle(colorTable([leuchte('f1', { gelFilterIds: ['lee-201'] }), plan[1]])),
);
console.log('OK: jeder Ausdruck reagiert auf seinen eigenen Inhalt, nicht auf fremden');

// ── 5) Die CSV-Fussnote steht hinten, und ohne Stempel gibt es sie nicht ────
const tabelle = scheduleTable(plan);
const ohne = tableToCsv(tabelle);
const mit = tableToCsv(tabelle, gleich);
assert.equal(ohne, tableToCsv(tabelle, undefined));
assert.ok(!ohne.includes('#aaaaaaaa'), 'ohne Stempel darf nichts angehaengt werden');
assert.ok(mit.startsWith(ohne + '\r\n'), 'die Stempelzeile haengt hinten an, unveraendert davor');
const zeilen = mit.split('\r\n');
assert.ok(zeilen[0].startsWith('Unit;'), 'die Kopfzeile bleibt die erste Zeile');
assert.ok(zeilen[zeilen.length - 1].startsWith('# '), 'die Stempelzeile ist die letzte');
assert.ok(zeilen[zeilen.length - 1].includes('#aaaaaaaa'));
// Auf die Spaltenzahl aufgefuellt, damit Excel keine Zeile mit einer Spalte sieht.
assert.equal(csvStampRow(gleich, 5).length, 5);
assert.equal(csvStampRow(gleich, 0).length, 1);
assert.equal(zeilen[zeilen.length - 1].split(';').length, tabelle.header.length);
console.log('OK: CSV-Fussnote hinten, aufgefuellt, und ohne Stempel zeichengleich wie bisher');

// ── 6) Verdrahtet ──────────────────────────────────────────────────────────
// Alles darueber kann stimmen und nie aufgerufen werden.
const lies = (pfad: string) => readFileSync(new URL(pfad, import.meta.url), 'utf8');

const dialog = lies('../src/components/ScheduleDialog.tsx');
assert.ok(
  /stampForStand\(/.test(dialog) && /versionsFor\(projectId\)/.test(dialog),
  'ScheduleDialog baut keinen Stempel mehr aus dem juengsten Versions-Schnappschuss',
);
for (const datei of ['instrument-schedule.csv', 'geraeteliste.csv', 'farbliste.csv']) {
  const m = new RegExp(`exportTable\\('${datei}'`).test(dialog);
  assert.ok(m, `${datei} laeuft nicht mehr ueber den gestempelten Weg`);
}

const app = lies('../src/App.tsx');
assert.ok(
  /planContentFingerprint\(/.test(app) && /stamp,?\s*\n?\s*\}\);/.test(app.slice(app.indexOf('composePlot('))),
  'App.tsx reicht keinen Stempel an composePlot',
);

const plot = lies('../src/utils/plotExport.ts');
assert.ok(/stampLine\(info\.stamp\)/.test(plot), 'der Plan-Ausdruck zeichnet die Stempelzeile nicht');
assert.ok(/\['Stand', standText\(info\.stamp\)\]/.test(plot), 'im Titelblock fehlt die Zeile „Stand"');
assert.ok(
  /const stampH = info\.stamp \? /.test(plot),
  'die Fusszeile waechst nicht nur mit Stempel — ohne ihn muss der Ausdruck unveraendert bleiben',
);
console.log('OK: alle vier Ausdrucke gehen durch den Stempel-Weg');

console.log('\nStempel-Check bestanden.');
