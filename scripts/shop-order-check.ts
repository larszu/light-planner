// ───────────────────────────────────────────────────────────────────────────
// Die Bestellung faellt aus dem Plan (Bedarf 145, P4).
// Lauf: `npm run shop:check`
//
//   > Entirely manual: 'Users must manually type equipment items', despite the
//   > fixture and infrastructure data already existing in the equipment
//   > manager. The order must aggregate fixtures with accessories (colour,
//   > gobo, template), infrastructure with port specs, and SPLIT QUANTITIES
//   > ACROSS VENUE-OWNED / RENTAL / OWN.
//
// Beleg: `jkarp7/showstack#29` (2025-12-27).
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. DIE MENGEN GEHEN AUF. Bedarf = eigen + fremd + bestellen, in JEDER
//     Zeile. Eine Bestellliste, deren Spalten nicht addieren, ist schlimmer
//     als keine: sie sieht aus wie eine Rechnung.
//
//  2. ES WIRD AUFGETEILT, NICHT ENTSCHIEDEN. Fremdes Material erscheint als
//     fremdes — es kommt zurück und kostet je Tag. Wer es als „gedeckt"
//     verbucht und dabei vergisst, dass es zurück muss, hat den Fehler aus
//     Bedarf 82 wieder.
//
//  3. MEHR BESTAND ALS BEDARF DECKT NICHT MEHR ALS DEN BEDARF. Sonst stünde
//     eine negative Bestellmenge auf dem Blatt.
//
//  4. DIE ZUORDNUNG IST EINE BEHAUPTUNG, UND SIE STEHT DABEI. Plan-Gerät zu
//     Lager-Artikel ist ein Vergleich von Zeichenketten. Wer das verschweigt,
//     lässt jemanden mit „haben wir" losfahren, weil zwei Zeichenketten
//     zufällig gleich waren.
//
//  5. MEHRERE LAGERPOSITIONEN DESSELBEN ARTIKELS ZÄHLEN ZUSAMMEN. Wer
//     denselben Scheinwerfer in zwei Regalen führt, hat ihn trotzdem zweimal.
//
//  6. ZUBEHÖR IST DABEI. Der Beleg sagt „fixtures WITH accessories": die
//     Farbfolien stehen als eigene Zeilen, nicht als Fußnote.
//
//  7. WAS NICHT GEHT, WIRD BENANNT — UND ZWAR BERECHNET. Eine leere Rubrik
//     „Gobos" sähe aus, als wäre nichts nötig.
//
//  8. DER WEG IST VERDRAHTET.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASIS_LABEL, KIND_LABEL, SHOP_HEADERS, shopOrder, shopOrderGaps, shopOrderTable,
} from '../src/core/shopOrder.ts';
import type { PlacedFixture } from '../src/types.ts';
import type { InventoryItem, InventoryOwnership } from '../src/inventory/types.ts';

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

const lampe = (id: string, modell = 'Source Four 26', hersteller = 'ETC', gel?: string[]): PlacedFixture => ({
  id,
  fixture: {
    id: `t-${modell}`, name: modell, manufacturer: hersteller, category: 'profile',
    wattage: 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp',
  },
  x: 1, y: 2, mountingHeight: 6, aimX: 1, aimY: 3, bodyRotation: 0, dimming: 100,
  channel: 1, unitNumber: '1',
  ...(gel ? { gelFilterIds: gel } : {}),
} as PlacedFixture);

const artikel = (
  modell: string,
  menge: number,
  ownership?: InventoryOwnership,
  hersteller = 'ETC',
): InventoryItem => ({
  id: `i-${modell}-${ownership ?? 'owned'}-${menge}`,
  model: modell,
  manufacturer: hersteller,
  quantity: menge,
  ...(ownership ? { ownership } : {}),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const n = (k: number, modell = 'Source Four 26', gel?: string[]) =>
  Array.from({ length: k }, (_, i) => lampe(`f${modell}${i}`, modell, 'ETC', gel));

// ─── 1. Die Mengen gehen auf ───────────────────────────────────────────────
{
  const o = shopOrder(n(10), [artikel('Source Four 26', 4)]);
  const zeile = o.lines.find((l) => l.kind === 'fixture')!;
  assert.equal(zeile.needed, 10);
  assert.equal(zeile.owned, 4);
  assert.equal(zeile.order, 6);
  // Und zwar in JEDER Zeile, nicht nur in dieser.
  for (const l of o.lines) {
    assert.equal(l.owned + l.foreign + l.order, l.needed,
      `${l.model}: ${l.owned}+${l.foreign}+${l.order} != ${l.needed}`);
    assert.ok(l.order >= 0, `${l.model}: negative Bestellmenge`);
    assert.ok(l.owned >= 0 && l.foreign >= 0, l.model);
  }
}

// ─── 2. Es wird aufgeteilt, nicht entschieden ──────────────────────────────
{
  // Vier eigene, drei gemietete, Bedarf zehn.
  const o = shopOrder(n(10), [
    artikel('Source Four 26', 4, 'owned'),
    artikel('Source Four 26', 3, 'rented'),
  ]);
  const l = o.lines[0];
  assert.equal(l.owned, 4);
  assert.equal(l.foreign, 3, 'fremdes Material erscheint nicht als fremdes');
  assert.equal(l.order, 3);
  // Fremdes bleibt fremd: es als „eigen" zu verbuchen hiesse, dass niemand
  // mehr sieht, dass es zurueckmuss — der Fehler aus Bedarf 82.
  assert.notEqual(l.owned, 7);

  // Sub-Hire zaehlt wie Miete: beides kommt zurueck.
  const sub = shopOrder(n(5), [artikel('Source Four 26', 5, 'subhire')]);
  assert.equal(sub.lines[0].foreign, 5);
  assert.equal(sub.lines[0].owned, 0);

  // Ohne Angabe gilt der Artikel als eigener — der Normalfall eines
  // Hauslagers. Die Gegenannahme haette jeden Altbestand zu Fremdgut erklaert.
  const ohne = shopOrder(n(5), [artikel('Source Four 26', 5)]);
  assert.equal(ohne.lines[0].owned, 5);
  assert.equal(ohne.lines[0].foreign, 0);
}

// ─── 3. Mehr Bestand deckt nicht mehr als den Bedarf ───────────────────────
{
  const o = shopOrder(n(3), [artikel('Source Four 26', 99)]);
  assert.equal(o.lines[0].owned, 3, 'die Deckung ist groesser als der Bedarf');
  assert.equal(o.lines[0].order, 0);
  assert.equal(o.toOrder, 0);

  // Und der fremde Bestand fuellt nur das, was der eigene uebrig laesst.
  const gemischt = shopOrder(n(5), [
    artikel('Source Four 26', 4, 'owned'),
    artikel('Source Four 26', 99, 'rented'),
  ]);
  assert.equal(gemischt.lines[0].owned, 4);
  assert.equal(gemischt.lines[0].foreign, 1, 'der fremde Bestand deckt mehr als noetig');
  assert.equal(gemischt.lines[0].order, 0);
}

// ─── 4. Die Zuordnung ist eine Behauptung, und sie steht dabei ─────────────
{
  const getroffen = shopOrder(n(2), [artikel('Source Four 26', 2)]);
  assert.equal(getroffen.lines[0].basis, 'name');
  assert.equal(getroffen.unmatched, 0);

  // Kein passender Artikel: die ganze Menge ist zu bestellen, und die Zeile
  // sagt, dass niemand dafuer gutgesagt hat.
  const daneben = shopOrder(n(2), [artikel('Source Four 36', 9)]);
  assert.equal(daneben.lines[0].basis, 'none');
  assert.equal(daneben.lines[0].order, 2);
  assert.equal(daneben.unmatched, 1);

  // Gross-/Kleinschreibung und Rand-Leerzeichen trennen keine Artikel:
  // „ETC" und „etc " sind derselbe Hersteller.
  const schreibweise = shopOrder(n(2), [artikel(' source four 26 ', 2, 'owned', ' etc ')]);
  assert.equal(schreibweise.lines[0].basis, 'name');
  assert.equal(schreibweise.lines[0].owned, 2);

  // Ein anderer Hersteller ist ein anderer Artikel — auch bei gleichem
  // Modellnamen. Genau das ist der Fall, in dem ein Namensvergleich
  // gefaehrlich wuerde.
  const fremdherst = shopOrder(n(2), [artikel('Source Four 26', 9, 'owned', 'Robe')]);
  assert.equal(fremdherst.lines[0].basis, 'none');
  assert.equal(fremdherst.lines[0].order, 2);

  for (const b of ['name', 'none'] as const) assert.ok(BASIS_LABEL[b].length > 10, b);
  assert.match(BASIS_LABEL.none, /kein/i);
}

// ─── 5. Mehrere Lagerpositionen zaehlen zusammen ───────────────────────────
{
  // Derselbe Scheinwerfer in zwei Regalen ist trotzdem zweimal da.
  const o = shopOrder(n(6), [
    artikel('Source Four 26', 2, 'owned'),
    artikel('Source Four 26', 3, 'owned'),
  ]);
  assert.equal(o.lines[0].owned, 5, 'zwei Lagerpositionen wurden nicht summiert');
  assert.equal(o.lines[0].order, 1);
}

// ─── 6. Zubehoer ist dabei ─────────────────────────────────────────────────
{
  const o = shopOrder(n(4, 'Source Four 26', ['lee-201']), []);
  const folien = o.lines.filter((l) => l.kind === 'gel');
  assert.equal(folien.length, 1, 'die Farbfolie fehlt in der Bestellung');
  assert.equal(folien[0].needed, 4, 'vier Leuchten, vier Schnitte');
  // Geraete zuerst, dann das Zubehoer — „fixtures WITH accessories".
  assert.equal(o.lines[0].kind, 'fixture');
  assert.equal(o.lines[o.lines.length - 1].kind, 'gel');
  for (const k of ['fixture', 'gel'] as const) assert.ok(KIND_LABEL[k].length > 2, k);

  // Dasselbe Rig ergibt zweimal dasselbe Blatt — sonst meldete der
  // Stand-Stempel Abweichungen, die niemand gemacht hat.
  const lampen = n(4, 'Source Four 26', ['lee-201']);
  assert.deepEqual(
    shopOrderTable(shopOrder([...lampen].reverse(), [])).rows,
    shopOrderTable(shopOrder(lampen, [])).rows,
  );

  const tb = shopOrderTable(o);
  assert.deepEqual(tb.header, [...SHOP_HEADERS]);
  assert.equal(tb.rows.length, o.lines.length);
  // Die Grundlage steht auf dem Blatt und nicht nur im Datenmodell.
  assert.equal(tb.rows[0][tb.header.length - 1], BASIS_LABEL.none);
}

// ─── 7. Was nicht geht, wird benannt — und zwar berechnet ──────────────────
{
  const luecken = shopOrderGaps(n(1));
  assert.equal(luecken.length, 2, JSON.stringify(luecken));
  assert.ok(luecken.some((g) => /Gobo/i.test(g.label)));
  assert.ok(luecken.some((g) => /Infrastruktur/i.test(g.label)));
  for (const g of luecken) assert.ok(g.message.length > 40, g.label);
  // Und die Gobo-Luecke ist GERECHNET: eine Leuchte, die das Feld fuehrt,
  // laesst sie verschwinden. Waere sie aufgezaehlt, stuende sie ewig da.
  const mitGobo = [{ ...n(1)[0], goboIds: ['g1'] } as unknown as PlacedFixture];
  assert.equal(shopOrderGaps(mitGobo).some((g) => /Gobo/i.test(g.label)), false,
    'die Gobo-Luecke ist aufgezaehlt statt gerechnet');
  // Die Infrastruktur-Luecke bleibt: sie liegt im cable-planner und nicht an
  // einem Feld dieses Modells.
  assert.ok(shopOrderGaps(mitGobo).some((g) => /Infrastruktur/i.test(g.label)));
}

// ─── 8. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = ohneKommentare('../src/components/ScheduleDialog.tsx');
  // Der Bestand kommt aus dem projektuebergreifenden Lager, nicht aus dem
  // Projekt: derselbe Scheinwerfer steht dort einmal, egal in wie vielen
  // Plaenen er vorkommt.
  assert.match(dialog, /useInventoryStore\(\(st\) => st\.items\)/, 'der Bestand kommt nicht aus dem Lager');
  assert.match(dialog, /shopOrder\(fixtures, lagerBestand\)/, 'die Bestellung wird nicht gerechnet');
  assert.match(dialog, /shopOrderGaps\(fixtures\)/, 'die Luecken stehen nirgends');
  assert.match(dialog, /bestellung\.unmatched > 0/, 'die ungedeckten Zeilen bleiben unerwaehnt');
  // Die Ausgabe geht ueber `exportTable` und traegt damit den Stand-Stempel
  // (ADR-004): wer die Liste verschickt, soll sehen, aus welchem Stand sie
  // stammt.
  assert.match(dialog, /exportTable\(\s*'bestellung\.csv'/, 'die Liste geht am Stempel-Weg vorbei');
  // Literale i18n-Schluessel — ein Template waere fuer `i18n:check` unsichtbar.
  assert.doesNotMatch(dialog, /t\(`(dlg\.)?sch\.exp\.shop/, 'Template-Schluessel — der i18n-Guard sieht sie nicht');
  assert.match(dialog, /'(dlg\.)?sch\.exp\.shop'/);

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['shop:check'], 'shop:check fehlt in package.json');
}

console.log('OK shop-order-check: die Bestellung teilt auf und sagt, worauf ihre Deckung beruht.');
