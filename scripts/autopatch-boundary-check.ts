// ───────────────────────────────────────────────────────────────────────────
// Der Auto-Patch an der Universe-Grenze.
// Lauf: `npm run autopatch:check`
//
// BEFUND (Defektformen-Sweep, Form `fixture-erreicht-grenze-nicht`, gemessen
// 2026-09-08). `autoPatch` hat genau EINEN interessanten Zweig — den
// Übergang ins nächste Universe bei 512 Kanälen:
//
//     if (address + fp - 1 > UNIVERSE_SIZE) { universe += 1; address = 1; }
//
// Dieser Zweig ist nie gelaufen. Nicht selten, sondern NIE: der einzige
// Lauf, der `autoPatch` überhaupt aufrief, war `scripts/calc-test.ts` — ein
// Entwicklerskript mit einer Handvoll Leuchten, das nicht einmal in
// `package.json` steht und damit auch nicht in CI. Ein paar Moving Heads
// belegen zusammen keine 200 Kanäle; die Grenze liegt bei 512.
//
// Das ist die Form: die Prüfung existiert, sie ist sogar sorgfältig — nur
// reicht das FIXTURE nicht bis an die Grenze, die sie prüfen soll.
//
// Beim Hinsehen fiel ein zweiter Fall auf, der noch nie jemandem begegnet
// sein kann: ein Profil mit MEHR als 512 Kanälen (große Pixel-Matrix, LED-Wand
// als ein Gerät) bekam `universe = n, address = 1` und belegte damit
// rechnerisch 513…fp eines Universes, das dort aufhört. Kein Fehler, keine
// Warnung, und der Patch-Zettel sah aus wie jeder andere.
//
// Dieser Lauf baut deshalb Rigs, die die Grenze WIRKLICH erreichen:
// mehrere volle Universes, ein Fixture, das exakt an 512 endet, eines, das
// um einen Kanal darüber hinausginge, und eines, das gar nicht hineinpasst.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';

import { autoPatch, footprint, findPatchConflicts, UNIVERSE_SIZE } from '../src/core/patch.ts';
import { rigCheck } from '../src/core/rigCheck.ts';
import type { PlacedFixture } from '../src/types.ts';

/** Eine Leuchte mit `ch` DMX-Kanälen, in Lesereihenfolge an Position `i`. */
const leuchte = (i: number, ch: number): PlacedFixture =>
  ({
    id: `f${i}`, x: i, y: 0, mountingHeight: 5, aimX: i, aimY: 1, dimming: 1,
    bodyRotation: 0, gelFilterIds: [],
    fixture: {
      id: `lib-${ch}`, name: `Profil ${ch}ch`, manufacturer: 'X',
      category: 'spot', wattage: 300, dmxChannels: ch,
    },
  }) as unknown as PlacedFixture;

const patch = (fs: PlacedFixture[]) =>
  autoPatch(fs, { startUniverse: 1, startAddress: 1, number: true, patch: true });

// ── 1) Die Grenze wird wirklich erreicht ──────────────────────────────────
// 40 Leuchten à 16 Kanäle = 640 Kanäle: mehr als ein Universe, und die
// Grenze faellt NICHT auf eine Fixture-Grenze. Genau das ist der Fall, den
// ein Rig mit fünf Movern nie herstellt.
{
  const rig = patch(Array.from({ length: 40 }, (_, i) => leuchte(i, 16)));
  const u1 = rig.filter((f) => f.universe === 1);
  const u2 = rig.filter((f) => f.universe === 2);
  assert.equal(u1.length, 32, '512/16 = 32 Leuchten passen in Universe 1');
  assert.equal(u2.length, 8, 'der Rest steht in Universe 2');
  assert.equal(u1[u1.length - 1]!.dmxAddress, 497, 'die letzte endet auf 512');
  assert.equal(u2[0]!.dmxAddress, 1, 'das nächste Universe faengt bei 1 an');
  for (const f of rig) {
    assert.ok(
      f.dmxAddress! + footprint(f) - 1 <= UNIVERSE_SIZE,
      `${f.id}: ${f.dmxAddress}+${footprint(f)}-1 ragt über ${UNIVERSE_SIZE} hinaus`,
    );
  }
  assert.equal(findPatchConflicts(rig).size, 0, 'kein Ueberlapp ueber die Grenze hinweg');
  console.log('✓ 40x16 Kanäle: die Grenze wird ueberschritten und sauber umgebrochen');
}

// ── 2) Exakt an der Grenze, und einen Kanal darüber ───────────────────────
{
  // Eine Leuchte mit 512 Kanälen passt genau — und zwar allein.
  const genau = patch([leuchte(0, UNIVERSE_SIZE), leuchte(1, 1)]);
  assert.equal(genau[0]!.universe, 1);
  assert.equal(genau[0]!.dmxAddress, 1, 'die volle Leuchte beginnt bei 1');
  assert.equal(genau[1]!.universe, 2, 'die nächste muss ins nächste Universe');
  assert.equal(genau[1]!.dmxAddress, 1);

  // Und der Fall, der um genau einen Kanal kippt: 511 belegt + 2 Kanäle.
  const kipp = patch([leuchte(0, UNIVERSE_SIZE - 2), leuchte(1, 2), leuchte(2, 2)]);
  assert.equal(kipp[1]!.dmxAddress, UNIVERSE_SIZE - 1, '2 Kanäle passen noch auf 511/512');
  assert.equal(kipp[1]!.universe, 1);
  assert.equal(kipp[2]!.universe, 2, 'die dritte kippt ins nächste Universe');
  console.log('✓ exakt 512 und der Kanal darüber verhalten sich beide richtig');
}

// ── 3) Ein Profil, das in KEIN Universe passt ─────────────────────────────
{
  const zuGross = patch([leuchte(0, UNIVERSE_SIZE + 88), leuchte(1, 16)]);
  assert.equal(zuGross[0]!.universe, undefined,
    'ein Profil ueber 512 Kanäle bekommt KEINE Adresse — vorher stand hier eine, die es nicht geben kann');
  assert.equal(zuGross[0]!.dmxAddress, undefined);
  assert.equal(zuGross[1]!.universe, 1, 'die anderen werden trotzdem gepatcht');
  assert.equal(zuGross[1]!.dmxAddress, 1);

  // Und der Grund steht als eigene Meldung da, nicht bloss als „ungepatcht":
  // sonst drueckt jemand dreimal auf Auto-Patch und wundert sich.
  const issues = rigCheck(zuGross, []);
  const fund = issues.filter((i) => /passen in kein Universe/.test(i.message));
  assert.equal(fund.length, 1, JSON.stringify(issues.map((i) => i.message)));
  assert.equal(fund[0]!.severity, 'error');
  assert.deepEqual(fund[0]!.ids, ['f0']);
  assert.equal(
    issues.filter((i) => /ohne Patch-Adresse/.test(i.message)).length, 0,
    'sie steht NICHT zusätzlich unter der allgemeinen „ohne Patch-Adresse"-Warnung',
  );
  console.log('✓ ein Profil ueber 512 Kanäle bekommt keine erfundene Adresse, sondern eine Begruendung');
}

// ── 4) Gegenprobe: die allgemeine Warnung gibt es weiterhin ───────────────
{
  // Ohne sie waere „nie mehr ungepatcht melden" ebenfalls gruen.
  const roh = [leuchte(0, 16)];
  const issues = rigCheck(roh, []);
  assert.equal(issues.filter((i) => /ohne Patch-Adresse/.test(i.message)).length, 1,
    'eine gewöhnliche DMX-Leuchte ohne Adresse wird weiterhin gemeldet');
  console.log('✓ die gewöhnliche „ohne Patch-Adresse"-Warnung bleibt');
}

// ── 5) Konventionelle Einheiten bleiben aussen vor ────────────────────────
{
  const gemischt = patch([leuchte(0, 0), leuchte(1, 16), leuchte(2, 0)]);
  assert.equal(gemischt[0]!.dmxAddress, undefined, 'Dimmerleuchten bekommen keine Adresse');
  assert.equal(gemischt[1]!.dmxAddress, 1, 'und verbrauchen auch keine');
  assert.equal(gemischt[2]!.dmxAddress, undefined);
  assert.deepEqual(gemischt.map((f) => f.channel), [1, 2, 3], 'Kanalnummern bekommen sie trotzdem');
  console.log('✓ konventionelle Einheiten zaehlen mit, patchen aber nicht');
}

console.log('\nAlle Auto-Patch-Grenzfaelle bestanden.');
