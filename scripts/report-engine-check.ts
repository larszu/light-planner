// ───────────────────────────────────────────────────────────────────────────
// Zwoelf Blaetter, ein Modell (Bedarf 143, P4).
// Lauf: `npm run reports:check`
//
//   > Twelve report types must stay consistent by hand: Channel Hookup,
//   > Dimmer Schedule, Circuit List, DMX Addresses, Power Summary, Color
//   > Schedule, Gobo Schedule and an Infrastructure List in five variants —
//   > ALL SORTS AND GROUPINGS OF THE SAME FIELDS.
//
// Beleg: `jkarp7/showstack#48` (2025-12-29), dazu `#41` und `#45`.
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. EIN FELD, EIN ZUGRIFF. Jede Spalte jedes Blattes kommt aus dem Katalog.
//     Ein Blatt, das eine Feld-Kennung nennt, die es nicht gibt, wäre eine
//     Spalte ohne Wert — und das fiele erst beim Drucken auf.
//
//  2. NICHTS WIRD GERATEN. Wo kein Wert ist, steht EIN Zeichen für „nicht
//     eingetragen" — überall dasselbe, nie eine leere Zelle. Eine leere Zelle
//     liesse offen, ob dort nichts ist oder ob niemand nachgesehen hat.
//     Und: ein Kreis erscheint nur, wo die Leuchte wirklich einem zugeteilt
//     ist; eine Traverse nur, wo die Leuchte wirklich an einer hängt.
//
//  3. SORTIEREN IST TEIL DES DOKUMENTS. Dieselben Leuchten ergeben zweimal
//     dasselbe Blatt — in JEDER Einfügereihenfolge. Sonst meldete der
//     Stand-Stempel (ADR-004) Abweichungen, die niemand gemacht hat.
//
//  4. WAS FEHLT, STEHT UNTEN. Ein leerer Wert sortiert ans Ende: was fehlt,
//     ist das, was noch zu tun ist, und es gehört dorthin, wo man es findet.
//
//  5. GRUPPIEREN ERFINDET UND VERLIERT NICHTS. Die Summe der Gruppenzeilen
//     ist die Zeilenzahl, und die Gruppen stehen in der Reihenfolge der
//     Sortierung — nicht in einer zweiten, eigenen Ordnung.
//
//  6. WAS NICHT GEHT, WIRD BENANNT — UND ZWAR BERECHNET. `reportGaps` prüft
//     gegen den Katalog. Eine aufgezählte Liste wäre der Kenntnisstand ihres
//     Autors, und das nächste fehlende Feld fiele niemandem auf.
//
//  7. DIE DREI ALTEN CSVs BLEIBEN ZEICHENGLEICH. ADR-004: eine geänderte
//     Spalte ändert jeden Fingerabdruck, und jedes bereits gedruckte Blatt
//     meldete sich als abweichend. Die neuen Blätter sind eine eigene
//     Familie; die alten fasst dieser Bedarf nicht an.
//
//  8. DER WEG IST VERDRAHTET — und der Dialog baut keine eigenen Zeilen.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALL_FIELDS, FIELDS, NOT_SET, cell, fieldContext, type FieldId,
} from '../src/core/reportFields.ts';
import {
  REPORTS, findReport, renderReport, reportGaps, reportTable,
} from '../src/core/reportEngine.ts';
import { scheduleTable, inventoryTable, colorTable, tableToCsv } from '../src/core/documentTables.ts';
import type { FixtureCategory, PlacedFixture, Truss } from '../src/types.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/**
 * Quelltext OHNE Kommentare.
 *
 * Wer eine abgeschaffte Bauform verbietet, muss sie in der Begruendung
 * zitieren duerfen — sonst steht im Code kein Wort mehr darueber, warum sie
 * weg ist. Also erst die Kommentare weg, dann pruefen.
 */
const ohneKommentare = (rel: string): string =>
  lies(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const lampe = (
  id: string,
  opts: {
    kanal?: number; unit?: string; watt?: number; gel?: string[]; zweck?: string;
    x?: number; y?: number; universe?: number; adresse?: number; dmx?: number;
    fokussiert?: boolean; kategorie?: FixtureCategory;
  } = {},
): PlacedFixture => ({
  id,
  fixture: {
    id: 't', name: 'Testgeraet', manufacturer: 'ETC', category: opts.kategorie ?? 'profile',
    wattage: opts.watt ?? 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp',
    ...(opts.dmx !== undefined ? { dmxChannels: opts.dmx } : {}),
  },
  x: opts.x ?? 1, y: opts.y ?? 2, mountingHeight: 6, aimX: 1, aimY: 3,
  bodyRotation: 0, dimming: 100,
  ...(opts.kanal !== undefined ? { channel: opts.kanal } : {}),
  ...(opts.unit !== undefined ? { unitNumber: opts.unit } : {}),
  ...(opts.gel ? { gelFilterIds: opts.gel } : {}),
  ...(opts.zweck !== undefined ? { purpose: opts.zweck } : {}),
  ...(opts.universe !== undefined ? { universe: opts.universe } : {}),
  ...(opts.adresse !== undefined ? { dmxAddress: opts.adresse } : {}),
  ...(opts.fokussiert ? { focused: true } : {}),
} as PlacedFixture);

const traverse = (id: string, y: number, label: string): Truss =>
  ({ id, label, x1: 0, y1: y, x2: 10, y2: y, height: 6, capacity: 500 } as Truss);

// ─── 1. Ein Feld, ein Zugriff ──────────────────────────────────────────────
{
  const bekannt = new Set<string>(ALL_FIELDS);
  for (const r of REPORTS) {
    assert.ok(r.columns.length > 0, `${r.id} ohne Spalten`);
    for (const c of r.columns) {
      assert.ok(bekannt.has(c), `${r.id}: Spalte „${c}" gibt es im Katalog nicht`);
    }
    for (const c of r.sort) {
      assert.ok(bekannt.has(c), `${r.id}: sortiert nach „${c}", das es nicht gibt`);
    }
    if (r.groupBy) assert.ok(bekannt.has(r.groupBy), `${r.id}: gruppiert nach „${r.groupBy}"`);
    // Wonach gruppiert wird, muss auch auf dem Blatt stehen — sonst steht
    // ueber der Gruppe ein Wert, den keine Zeile darunter fuehrt.
    if (r.groupBy) assert.ok(r.columns.includes(r.groupBy), `${r.id}: gruppiert nach einer Spalte, die fehlt`);
    // Jedes Blatt sagt, wozu es dient. Eine Auswahl ohne Erklaerung zwingt
    // zum Ausprobieren, und dann druckt jemand vier Blaetter, um eines zu
    // finden.
    assert.ok(r.purpose.length > 20, `${r.id} ohne Zweck`);
    assert.ok(r.label.length > 2, `${r.id} ohne Namen`);
  }
  // Die Kennungen sind eindeutig — sonst waere `findReport` mehrdeutig und
  // zwei Blaetter schrieben in dieselbe Datei.
  assert.equal(new Set(REPORTS.map((r) => r.id)).size, REPORTS.length);
  // Jede Feld-Kennung hat eine Beschriftung und einen Zugriff.
  for (const id of ALL_FIELDS) {
    assert.ok(FIELDS[id].label.length > 0, id);
    assert.equal(typeof FIELDS[id].value, 'function', id);
  }
}

// ─── 2. Nichts wird geraten ────────────────────────────────────────────────
{
  const t1 = traverse('t1', 2, 'FOH');
  const ctx = fieldContext([lampe('a')], [t1], 'sacn', 'ABC');

  // Ohne Kanal, ohne Unit, ohne Gel, ohne Zweck: ueberall DASSELBE Zeichen.
  const leer = lampe('leer', { x: 1, y: 2 });
  for (const id of ['channel', 'unit', 'gel', 'purpose'] as FieldId[]) {
    assert.equal(cell(id, leer, ctx), NOT_SET, id);
  }
  assert.ok(NOT_SET.length > 0, 'kein Zeichen fuer „nicht eingetragen"');

  // Ein Kreis erscheint nur, wo die Leuchte wirklich zugeteilt ist. Eine
  // Leuchte ohne Leistung liegt in keinem — und bekommt keine erfundene
  // Nummer.
  const ohneLeistung = lampe('p0', { watt: 0 });
  const ctx2 = fieldContext([lampe('p1'), ohneLeistung], [], 'sacn', 'ABC');
  assert.notEqual(cell('circuit', lampe('p1'), ctx2), NOT_SET, 'die zugeteilte Leuchte hat keinen Kreis');
  assert.equal(cell('circuit', ohneLeistung, ctx2), NOT_SET, 'eine Leuchte ohne Leistung bekam einen Kreis');
  assert.equal(cell('phase', ohneLeistung, ctx2), NOT_SET);

  // Eine Traverse erscheint nur, wo die Leuchte wirklich an einer haengt:
  // `nearestTrussId` schnappt innerhalb eines Meters.
  assert.equal(cell('truss', lampe('nah', { x: 3, y: 2 }), ctx), 'FOH');
  assert.equal(cell('truss', lampe('fern', { x: 3, y: 9 }), ctx), NOT_SET, 'eine Traverse wurde geraten');

  // Die DMX-Zelle traegt die Lesart des Protokolls (Bedarf 147): Art-Net 20
  // ist „0:1:4" und nicht „20".
  const gepatcht = lampe('g', { universe: 20, adresse: 15, dmx: 4 });
  assert.equal(cell('dmx', gepatcht, fieldContext([gepatcht], [], 'sacn', 'ABC')), '20.15');
  assert.equal(cell('dmx', gepatcht, fieldContext([gepatcht], [], 'artnet', 'ABC')), '0:1:4.15');
  assert.equal(cell('dmx', leer, ctx), NOT_SET);
}

// ─── 3. Sortieren ist Teil des Dokuments ───────────────────────────────────
{
  const lampen = [
    lampe('c', { kanal: 3 }), lampe('a', { kanal: 1 }), lampe('b', { kanal: 2 }),
  ];
  const ctx = fieldContext(lampen, [], 'sacn', 'ABC');
  const def = findReport('hookup')!;
  const eins = renderReport(def, lampen, ctx);
  // Dieselben Leuchten in ANDERER Einfuegereihenfolge -> dasselbe Blatt.
  const zwei = renderReport(def, [...lampen].reverse(), ctx);
  assert.deepEqual(zwei.rows, eins.rows, 'die Reihenfolge haengt an der Einfuegereihenfolge');
  assert.deepEqual(eins.rows.map((r) => r[0]), [1, 2, 3]);

  // Und der letzte Unterschied: zwei Leuchten, die in allen SORTIERTEN Feldern
  // uebereinstimmen, haben trotzdem eine feste Reihenfolge. Sie muessen sich
  // dabei in einer angezeigten Spalte unterscheiden — sonst waeren die Zeilen
  // ohnehin gleich, und der Test koennte nicht sehen, ob sortiert wurde:
  // `Array.prototype.sort` ist stabil, eine Vergleichsfunktion, die 0 liefert,
  // laesst also die Einfuegereihenfolge stehen, und genau das faellt nur bei
  // unterscheidbaren Zeilen auf.
  const gleich = [
    lampe('z', { kanal: 5, unit: 'u', zweck: 'Zenit' }),
    lampe('y', { kanal: 5, unit: 'u', zweck: 'Ypsilon' }),
  ];
  const c2 = fieldContext(gleich, [], 'sacn', 'ABC');
  const a = renderReport(def, gleich, c2);
  const b = renderReport(def, [...gleich].reverse(), c2);
  assert.notDeepEqual(a.rows[0], a.rows[1], 'die Testzeilen sind nicht unterscheidbar');
  assert.deepEqual(a.rows, b.rows, 'zwei in den Sortierfeldern gleiche Leuchten haben keine feste Reihenfolge');
  // Und die Ordnung ist die der Kennung, nicht die des Einfuegens.
  assert.equal(a.rows[0][5], 'Ypsilon', 'sortiert wird nicht nach der Leuchten-Kennung');
}

// ─── 4. Was fehlt, steht unten ─────────────────────────────────────────────
{
  const lampen = [lampe('ohne'), lampe('mit', { kanal: 7 })];
  const ctx = fieldContext(lampen, [], 'sacn', 'ABC');
  const r = renderReport(findReport('hookup')!, lampen, ctx);
  assert.equal(r.rows[0][0], 7, 'der eingetragene Kanal steht nicht oben');
  assert.equal(r.rows[1][0], NOT_SET, 'die Leuchte ohne Kanal steht nicht unten');

  // Dasselbe fuer eine Zeichenketten-Spalte (Gel): kein Wert ans Ende.
  const mitFolie = [lampe('k'), lampe('f', { gel: ['lee-201'] })];
  const c = fieldContext(mitFolie, [], 'sacn', 'ABC');
  const rf = renderReport(findReport('color')!, mitFolie, c);
  assert.notEqual(rf.rows[0][0], NOT_SET, 'die Leuchte ohne Folie steht oben');
  assert.equal(rf.rows[1][0], NOT_SET);
}

// ─── 5. Gruppieren erfindet und verliert nichts ────────────────────────────
{
  const t1 = traverse('t1', 2, 'FOH');
  const t2 = traverse('t2', 9, 'Back');
  const lampen = [
    lampe('a', { x: 1, y: 2, unit: '1' }), lampe('b', { x: 5, y: 2, unit: '2' }),
    lampe('c', { x: 1, y: 9, unit: '3' }), lampe('frei', { x: 5, y: 5, unit: '4' }),
  ];
  const ctx = fieldContext(lampen, [t1, t2], 'sacn', 'ABC');
  const r = renderReport(findReport('positions')!, lampen, ctx);
  assert.equal(r.groups.reduce((n, g) => n + g.rows.length, 0), r.rows.length,
    'die Gruppen fuehren mehr oder weniger Zeilen als das Blatt');
  assert.equal(r.rows.length, 4);
  // Drei Gruppen: FOH, Back, und die freistehende Leuchte unter NOT_SET.
  assert.deepEqual(r.groups.map((g) => g.key), ['Back', 'FOH', NOT_SET]);
  // Die Reihenfolge der Gruppen folgt der Sortierung und nicht einer zweiten
  // Ordnung: „Back" vor „FOH", weil danach sortiert wird, und das Fehlende
  // ganz ans Ende.
  assert.equal(r.groups[r.groups.length - 1].key, NOT_SET);

  // Ohne Gruppierung: genau eine Gruppe mit allen Zeilen, damit die Ansicht
  // nicht zwei Wege durch dieselben Daten hat.
  const flach = renderReport(findReport('hookup')!, lampen, ctx);
  assert.equal(flach.groups.length, 1);
  assert.deepEqual(flach.groups[0].rows, flach.rows);

  // Die CSV traegt die Gruppen-Ueberschriften mit — sonst waere der Ausdruck
  // eine ANDERE Ansicht als der Bildschirm.
  const tb = reportTable(r);
  assert.equal(tb.rows.length, r.rows.length + r.groups.length);
  assert.match(String(tb.rows[0][0]), /^Traverse: /);
  // Und ohne Gruppierung eben nicht.
  assert.equal(reportTable(flach).rows.length, flach.rows.length);
}

// ─── 6. Was nicht geht, wird benannt — und zwar berechnet ──────────────────
{
  const luecken = reportGaps();
  // Das Modell fuehrt kein Gobo-Feld — also fehlt genau dieses Blatt.
  assert.equal(luecken.length, 1, `unerwartete Luecken: ${JSON.stringify(luecken)}`);
  assert.equal(luecken[0].needs, 'gobo');
  assert.match(luecken[0].message, /Gobo/);
  // Und die Meldung sagt, dass nichts erfunden wird.
  assert.match(luecken[0].message, /erfunden/);

  // Die Gegenprobe: alles, was der Katalog fuehrt, taucht NICHT als Luecke
  // auf. Waere die Liste aufgezaehlt statt gerechnet, bliebe ein
  // nachgetragenes Feld ewig als „fehlt" stehen.
  const gemeldet = new Set(luecken.map((g) => g.needs));
  for (const id of ALL_FIELDS) assert.equal(gemeldet.has(id), false, id);
}

// ─── 7. Die drei alten CSVs bleiben zeichengleich ──────────────────────────
{
  // ADR-004: eine geaenderte Spalte aendert jeden Fingerabdruck, und jedes
  // bereits gedruckte Blatt meldete sich danach als abweichend. Die neuen
  // Blaetter sind eine eigene Familie; die alten fasst dieser Bedarf nicht an.
  const f = [lampe('a', { kanal: 1, unit: '1', universe: 1, adresse: 1, gel: ['lee-201'], zweck: 'Front' })];
  assert.deepEqual(scheduleTable(f).header, [
    'Unit', 'Kanal', 'Universe', 'Adresse', 'Typ', 'Hersteller', 'X (m)', 'Y (m)',
    'Höhe (m)', 'Gel', 'Zweck', 'Fokussiert', 'Fokus-Notiz', 'W', 'kg',
  ]);
  assert.deepEqual(inventoryTable(f).header,
    ['Anzahl', 'Hersteller', 'Typ', 'W/Stk', 'kg/Stk', 'W gesamt', 'kg gesamt']);
  assert.deepEqual(colorTable(f).header, ['Anzahl', 'Marke', 'Code', 'Name', 'Typ']);
  // Und die leere Zelle der alten Blaetter bleibt leer: sie zu fuellen waere
  // eine stille Formataenderung, die jedes Import-Skript braeche.
  const ohne = [lampe('x')];
  assert.equal(scheduleTable(ohne).rows[0][1], '', 'die alte leere Zelle wurde gefuellt');
  assert.doesNotMatch(tableToCsv(scheduleTable(ohne)), new RegExp(NOT_SET));
}

// ─── 8. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = ohneKommentare('../src/components/ScheduleDialog.tsx');
  assert.match(dialog, /renderReport\(findReport\(reportId\) \?\? REPORTS\[0\], fixtures, feldKontext\)/,
    'der Dialog rendert kein Blatt');
  assert.match(dialog, /reportGaps\(\)/, 'die Luecken stehen nirgends');
  assert.match(dialog, /reportTable\(/, 'das Blatt laesst sich nicht ausgeben');
  // Der Zusammenhang wird EINMAL gebaut und nicht je Zeile: `fieldContext`
  // teilt den ganzen Bestand in Kreise auf.
  assert.match(dialog, /const feldKontext = fieldContext\(fixtures, trusses, dmxProtocol, phaseTemplate\)/,
    'der Feld-Zusammenhang fehlt oder kennt Protokoll und Vorlage nicht');
  // Und der Dialog baut die Zeilen NICHT selbst: er zeigt, was
  // `renderReport` liefert. Wer hier `bericht143.rows.map` durch eigene
  // Feldzugriffe ersetzt, hat das dreizehnte handgepflegte Dokument angelegt.
  assert.match(dialog, /g\.rows\.map\(\(row, i\) =>/, 'die Zeilen kommen nicht aus dem Bericht');
  assert.doesNotMatch(dialog, /papersPanel[\s\S]{0,4000}f\.fixture\.name/,
    'das Papiere-Blatt greift an der Engstelle vorbei auf die Leuchte zu');
  // Literale i18n-Schluessel — ein Template waere fuer `i18n:check` unsichtbar.
  assert.doesNotMatch(dialog, /t\(`(dlg\.)?sch\.rep\./, 'Template-Schluessel — der i18n-Guard sieht sie nicht');
  assert.match(dialog, /'(dlg\.)?sch\.rep\.pick'/);

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['reports:check'], 'reports:check fehlt in package.json');
}

console.log('OK report-engine-check: die Blaetter sind Sichten auf ein Modell, nicht zwoelf Dokumente.');
