// ───────────────────────────────────────────────────────────────────────────
// Ein Universe ist keine blosse Zahl (Bedarf 147, P4).
// Lauf: `npm run universe:check`
//
//   > Node/gateway protocol setup, unicast IPs and universe mapping are
//   > configured by hand in at least two places and documented in a third.
//   > […] Art-Net Net/Sub-Net/Universe versus a flat universe number is „the
//   > classic patch error", and an sACN universe number is not the same field
//   > as an Art-Net one.
//
// Belege: `mvrdevelopment/spec#94` (eröffnet 2021-07-29, im MVR-1.6-Meilen-
// stein) und die Fehlerbeschreibung aus dem showstack-Datensatz.
//
// WAS HIER GEPRÜFT WIRD, und warum jede Zeile davon nötig ist:
//
//  1. DIE ZERLEGUNG STIMMT. Port-Address 16 ist Sub-Net 1 / Universe 0 und
//     nicht „Universe 16" — genau diese Stelle ist der Fehler, um den es
//     geht. Eine Zerlegung, die hier danebenliegt, druckt ihn aufs Blatt.
//
//  2. ES WIRD NICHT GEKLEMMT. Eine Zahl, die es im Protokoll nicht gibt,
//     bekommt einen SATZ und keine zurechtgebogene Zahl. Geklemmt stünde
//     „0:0:15" auf dem Blatt, und jemand stellte das am Gateway ein.
//
//  3. BEIDE LESARTEN, IMMER. Auch die des nicht gewählten Protokolls. Ein
//     Blatt, das nur die eine zeigt, kann die Verwechslung zweier Lesarten
//     nicht verhindern — es ist ja gerade das Nebeneinander, das sie auffallen
//     lässt.
//
//  4. GEWARNT WIRD DORT, WO ES ETWAS NÜTZT. Bis 15 heissen beide Protokolle
//     äusserlich dasselbe Feld; ab 16 nicht mehr. Ein Blatt, das bei JEDER
//     Zahl warnt, wird beim zweiten Mal nicht gelesen — und dann auch nicht
//     bei der Zahl, bei der es zählt.
//
//  5. DIE PRÜFUNG KENNT DAS PROTOKOLL. „Universe 40000" ist in sACN gültig
//     und in Art-Net unmöglich. Ohne die Angabe kann der Vorflug-Bericht zu
//     beidem nur schweigen.
//
//  6. DIE ANGABE ÜBERLEBT DAS SPEICHERN. Sie hängt am Projekt, und `App.tsx`
//     baut ein `ProjectData` an VIER Stellen. ADR-005 hält fest, was passiert,
//     wenn eine davon ein Feld vergisst: der Weg über sie verliert es still.
//
//  7. DER WEG IST VERDRAHTET.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ARTNET_MAX, DEFAULT_PROTOCOL, NO_NOTE, NO_READING, PROTOCOL_LABEL, READINGS_DIVERGE_ABOVE,
  SACN_MAX, UNIVERSE_HEADERS, artnetParts, artnetPortAddress, artnetReading, readingsDiverge,
  sacnReading, universeReading, universeReadings, universeTable,
} from '../src/core/universeIdentity.ts';
import { preflight, semanticIssues } from '../src/core/preflight.ts';
import type { FixtureCategory, PlacedFixture } from '../src/types.ts';

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

const lampe = (id: string, universe?: number, category: FixtureCategory = 'profile'): PlacedFixture => ({
  id,
  fixture: {
    id: 't', name: 'Testgeraet', manufacturer: 'ETC', category,
    wattage: 750, lumens: 10000, beamAngle: 26, fieldAngle: 36,
    beamShape: 'round', beamRatioWH: 1, lensType: 'ellipsoidal',
    colorTemp: 3200, weight: 8, mountType: 'clamp', dmxChannels: 4,
  },
  x: 1, y: 2, mountingHeight: 6, aimX: 1, aimY: 3, bodyRotation: 0, dimming: 100,
  channel: 1, unitNumber: '1',
  ...(universe !== undefined ? { universe, dmxAddress: 1 } : {}),
} as PlacedFixture);

// ─── 1. Die Zerlegung stimmt ───────────────────────────────────────────────
{
  // Unterhalb von 16 sind die drei Felder das, was jeder erwartet.
  assert.deepEqual(artnetParts(2), { net: 0, subnet: 0, universe: 2 });
  assert.equal(artnetReading(2), '0:0:2');

  // UND HIER FAENGT DER FEHLER AN. Port-Address 16 ist NICHT „Universe 16":
  // das Feld am Node hat vier Bit. Es ist Sub-Net 1, Universe 0.
  assert.deepEqual(artnetParts(16), { net: 0, subnet: 1, universe: 0 });
  assert.equal(artnetReading(16), '0:1:0');
  assert.notEqual(artnetReading(16), '0:0:16');

  // Und eine Stufe hoeher dasselbe noch einmal: 256 ist Net 1.
  assert.deepEqual(artnetParts(256), { net: 1, subnet: 0, universe: 0 });
  assert.equal(artnetReading(256), '1:0:0');

  // Hin und zurueck. Wer die drei Felder am Gateway abliest, muss auf
  // dieselbe Zahl kommen, die im Plan steht.
  for (const n of [0, 1, 15, 16, 17, 255, 256, 4095, ARTNET_MAX]) {
    assert.equal(artnetPortAddress(artnetParts(n)!), n, `Rundlauf ${n}`);
  }
  // Und die Gegenrichtung mit von Hand gesetzten Feldern.
  assert.equal(artnetPortAddress({ net: 0, subnet: 1, universe: 0 }), 16);
  assert.equal(artnetPortAddress({ net: 1, subnet: 2, universe: 3 }), 0x123);
}

// ─── 2. Es wird nicht geklemmt ─────────────────────────────────────────────
{
  // Ausserhalb des Bereichs gibt es KEINE Zerlegung — und damit auch keine
  // erfundene, die jemand am Gateway einstellen koennte.
  assert.equal(artnetParts(-1), null);
  assert.equal(artnetParts(ARTNET_MAX + 1), null);
  assert.equal(artnetParts(1.5), null);
  assert.equal(artnetReading(40000), NO_READING);
  assert.doesNotMatch(artnetReading(40000), /\d+:\d+:\d+/, 'geklemmte Lesart statt Absage');

  // Dasselbe in die andere Richtung: ein Feld ausserhalb seiner Bitbreite
  // ergibt keine Port-Address, statt still in die Nachbarfelder zu laufen.
  assert.equal(artnetPortAddress({ net: 0, subnet: 0, universe: 16 }), null);
  assert.equal(artnetPortAddress({ net: 0, subnet: 16, universe: 0 }), null);
  assert.equal(artnetPortAddress({ net: 128, subnet: 0, universe: 0 }), null);

  // sACN zaehlt ab 1 — die 0 ist dort keine Adresse.
  assert.equal(sacnReading(0), NO_READING);
  assert.equal(sacnReading(1), '1');
  assert.equal(sacnReading(SACN_MAX), String(SACN_MAX));
  assert.equal(sacnReading(SACN_MAX + 1), NO_READING);

  // Und die Absage steht als SATZ da, nicht als leeres Feld.
  const zuGross = universeReading(40000, 'artnet');
  assert.ok(zuGross.problem && zuGross.problem.length > 10, 'kein Satz zur unmoeglichen Adresse');
  assert.match(zuGross.problem!, /Art-Net/);
  assert.equal(universeReading(40000, 'sacn').problem, null, 'in sACN ist 40000 gueltig');
}

// ─── 3. Beide Lesarten, immer ──────────────────────────────────────────────
{
  const inSacn = universeReading(20, 'sacn');
  assert.equal(inSacn.primary, '20');
  assert.equal(inSacn.other, '0:1:4', 'die andere Lesart fehlt');
  assert.equal(inSacn.otherProtocol, 'artnet');

  const inArtnet = universeReading(20, 'artnet');
  assert.equal(inArtnet.primary, '0:1:4');
  assert.equal(inArtnet.other, '20');
  assert.equal(inArtnet.otherProtocol, 'sacn');

  // Die beiden Lesarten derselben Zahl sind NICHT dieselbe Zeichenkette —
  // genau darum geht es. Ein Modell, das hier zweimal dasselbe liefert,
  // koennte die Verwechslung nicht zeigen.
  assert.notEqual(inSacn.primary, inSacn.other);

  // Die Vorgabe ist sACN, und sie ist begruendet: `autoPatch` zaehlt flach ab
  // 1. Art-Net als Vorgabe behauptete eine Gateway-Einstellung, die niemand
  // gemacht hat.
  assert.equal(DEFAULT_PROTOCOL, 'sacn');
  assert.ok(PROTOCOL_LABEL.artnet.length > 0 && PROTOCOL_LABEL.sacn.length > 0);
}

// ─── 4. Gewarnt wird dort, wo es etwas nuetzt ──────────────────────────────
{
  assert.equal(READINGS_DIVERGE_ABOVE, 15);
  // Bis 15: dasselbe Feld am Geraet, kein Hinweis.
  assert.equal(readingsDiverge(15), false);
  assert.equal(artnetReading(15), '0:0:15');
  // Ab 16: verschieden, und der Hinweis kommt.
  assert.equal(readingsDiverge(16), true);

  // Die Gegenprobe zur Zerlegung: unterhalb der Grenze endet die Art-Net-
  // Lesart auf genau der Zahl, oberhalb nicht mehr.
  for (let n = 0; n <= 15; n += 1) assert.equal(artnetReading(n), `0:0:${n}`);
  assert.notEqual(artnetReading(16), '0:0:16');

  // Das Blatt: beide Spalten gefuellt, unabhaengig vom gewaehlten Protokoll,
  // und die Hinweis-Spalte nie leer.
  const tb = universeTable(universeReadings([1, 20, undefined, 20, 3], 'sacn'));
  assert.deepEqual(tb.header, [...UNIVERSE_HEADERS]);
  // Sortiert nach der Zahl und ohne Doppel: sonst saehe dasselbe Blatt
  // zweimal anders aus, je nachdem in welcher Reihenfolge gepatcht wurde.
  assert.deepEqual(tb.rows.map((z) => z[0]), [1, 3, 20]);
  for (const z of tb.rows) {
    assert.ok(String(z[1]).length > 0 && String(z[2]).length > 0, 'eine Lesart fehlt');
    assert.ok(String(z[3]).length > 0, 'leere Hinweis-Zelle statt Strich');
  }
  // Der Strich ist ein Zeichen, keine leere Zelle — und die Pruefung darauf
  // darf nicht selbst am Zeichen haengen: `z[3] === NO_NOTE` waere gruen,
  // auch wenn NO_NOTE zur leeren Zeichenkette wuerde. Also beides.
  assert.ok(NO_NOTE.length > 0, 'die Hinweis-Spalte hat kein Zeichen fuer „nichts zu sagen"');
  assert.equal(tb.rows[0][3], NO_NOTE, 'Universe 1 bekommt einen Hinweis, den niemand braucht');
  assert.match(String(tb.rows[2][3]), /Art-Net/, 'Universe 20 bekommt keinen Hinweis');

  // Und dieselbe Tabelle im anderen Protokoll: die Spalten stehen fest, die
  // Lesarten sind dieselben. Wer das Gateway einstellt, hat oft das andere
  // Protokoll vor sich.
  const tbArtnet = universeTable(universeReadings([1, 20, 3], 'artnet'));
  assert.deepEqual(tbArtnet.rows.map((z) => [z[0], z[1], z[2]]), tb.rows.map((z) => [z[0], z[1], z[2]]));
}

// ─── 5. Die Pruefung kennt das Protokoll ───────────────────────────────────
{
  const inSacnOk = semanticIssues([lampe('a', 40000)], 'sacn');
  assert.ok(!inSacnOk.some((i) => i.severity === 'error'), '40000 ist in sACN gueltig');

  const inArtnetFehler = semanticIssues([lampe('a', 40000)], 'artnet');
  const fehler = inArtnetFehler.filter((i) => i.severity === 'error');
  assert.equal(fehler.length, 1, '40000 als Art-Net-Port-Address bleibt unbeanstandet');
  assert.match(fehler[0].message, /40000/);
  assert.deepEqual(fehler[0].ids, ['a']);

  // Der umgekehrte Fall: die 0 gibt es in Art-Net, in sACN nicht.
  assert.ok(semanticIssues([lampe('a', 0)], 'artnet').every((i) => i.severity !== 'error'));
  assert.ok(semanticIssues([lampe('a', 0)], 'sacn').some((i) => i.severity === 'error'));

  // Der Hinweis auf die auseinanderlaufenden Lesarten: ab 16, und nicht davor.
  const hinweis = (u: number) => semanticIssues([lampe('a', u)], 'sacn')
    .filter((i) => i.severity === 'info' && /Art-Net/.test(i.message));
  assert.equal(hinweis(15).length, 0, 'Hinweis schon unterhalb der Grenze — dann liest ihn keiner mehr');
  assert.equal(hinweis(16).length, 1, 'kein Hinweis genau dort, wo der Fehler passiert');

  // Eine unmoegliche Adresse blockiert den Plan — sie ist ein Fehler und
  // keine Warnung: kein Gateway kann sie einstellen.
  assert.equal(preflight([lampe('a', 40000)], [], 'artnet').verdict, 'blocked');

  // Und ohne Angabe gilt die Vorgabe, nicht das zuletzt Eingestellte.
  assert.deepEqual(
    semanticIssues([lampe('a', 40000)]).map((i) => i.severity),
    semanticIssues([lampe('a', 40000)], DEFAULT_PROTOCOL).map((i) => i.severity),
  );
}

// ─── 6. Die Angabe ueberlebt das Speichern ─────────────────────────────────
{
  // ADR-005: `App.tsx` baut ein vollstaendiges `ProjectData` an VIER Stellen —
  // Geraete-Speichern, .avplan-Export, Versions-Schnappschuss, Datei-Speichern.
  // Als dort zuletzt Felder fehlten, verlor GENAU DER WEG UEBER SIE sie still,
  // und niemand merkte es bis zum naechsten Export. Der Waechter zaehlt
  // deshalb die Vorkommen, statt sich auf eines zu verlassen.
  const app = ohneKommentare('../src/App.tsx');
  const schreibstellen = [...app.matchAll(/^\s*dmxProtocol,$/gm)];
  assert.equal(schreibstellen.length, 4,
    `dmxProtocol steht an ${schreibstellen.length} von 4 ProjectData-Bauplaetzen`);

  // Beim Laden gilt die Vorgabe, wenn die Datei nichts sagt — NICHT das
  // zuletzt Eingestellte. Sonst laege die Lesart am Rechner statt an der
  // Datei, und dieselbe Datei hiesse bei zwei Leuten zweierlei.
  assert.match(app, /setDmxProtocol\(data\.dmxProtocol \?\? DEFAULT_PROTOCOL\)/,
    'die Lesart wird beim Laden nicht zurueckgesetzt');

  // Das Feld ist optional — alte Projekte laden unveraendert.
  assert.match(lies('../src/types.ts'), /dmxProtocol\?: DmxProtocol;/,
    'das Feld ist pflichtig und bricht damit jede vorhandene Datei');
}

// ─── 7. Der Weg ist verdrahtet ─────────────────────────────────────────────
{
  const dialog = ohneKommentare('../src/components/ScheduleDialog.tsx');
  // Was hinter `dmxProtocol` folgt, ist hier ABSICHTLICH offen: seit Bedarf
  // 141 geht die Phasen-Vorlage als viertes mit, und dass sie das tut, haelt
  // `power-distribution-check.ts` fest. Wer beide Waechter auf dieselbe
  // Aufrufform festnagelt, muss bei jedem weiteren Argument zwei Dateien
  // aendern — und aendert dann irgendwann nur eine.
  assert.match(dialog, /preflight\(fixtures, trusses, dmxProtocol[,)]/,
    'die Pruefung bekommt das Protokoll nicht');
  assert.match(dialog, /universeReadings\(fixtures\.map\(\(f\) => f\.universe\), dmxProtocol\)/,
    'das Blatt rechnet die Lesarten nicht aus');
  // BEIDE Spalten im Blatt, nicht nur die gewaehlte.
  assert.match(dialog, /artnetReading\(r\.value\)/, 'die Art-Net-Spalte fehlt');
  assert.match(dialog, /sacnReading\(r\.value\)/, 'die sACN-Spalte fehlt');
  // Die Grenze steht im Kern, nicht als 15 in der Ansicht: zwei Wahrheiten
  // darueber, ab wann gewarnt wird, waeren eine zu viel.
  assert.match(dialog, /readingsDiverge\(r\.value\)/, 'die Ansicht rechnet die Grenze selbst nach');
  assert.doesNotMatch(dialog, /r\.value > 15/, 'die 15 steht ein zweites Mal in der Ansicht');
  // Der Kopf der DMX-Spalte nennt das Protokoll — „2.15" allein ist unbestimmt.
  assert.match(dialog, /PROTOCOL_LABEL\[dmxProtocol\]/, 'die Spalte sagt nicht, welches Protokoll sie meint');
  // Umschalten geht, und der Wert lebt im Wirt.
  assert.match(dialog, /onSetProtocol\(e\.target\.value as DmxProtocol\)/, 'kein Umschalter');
  // Literale i18n-Schluessel — ein Template waere fuer `i18n:check` unsichtbar.
  assert.doesNotMatch(dialog, /t\(`(dlg\.)?sch\.uni\./, 'Template-Schluessel — der i18n-Guard sieht sie nicht');
  assert.match(dialog, /'(dlg\.)?sch\.uni\.protocol'/);

  const app = ohneKommentare('../src/App.tsx');
  assert.match(app, /dmxProtocol=\{dmxProtocol\}/, 'das Protokoll erreicht den Dialog nicht');
  assert.match(app, /onSetProtocol=\{setDmxProtocol\}/, 'der Umschalter haengt an nichts');

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['universe:check'], 'universe:check fehlt in package.json');
}

console.log('OK universe-identity-check: die Zahl sagt jetzt, wie sie zu lesen ist — in beiden Protokollen.');
