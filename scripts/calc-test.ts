// Node verification for the analysis/interop cores (photometrics, rigging,
// power, rig-check, MVR). Bundled with esbuild and run with node; writes the
// .mvr + its XML to /tmp for independent unzip/xmllint validation.
import { writeFileSync } from 'node:fs';
import { fixtureLibrary } from '../src/core/fixtureLibrary';
import type { PlacedFixture, Truss } from '../src/types';
import { trussLoads, circuitBreakdown, computePower, autoPatch } from '../src/core/patch';
import { rigCheck, issueCounts } from '../src/core/rigCheck';
import { photometricReport } from '../src/core/photometrics';
import { buildMvr, buildSceneDescription } from '../src/core/mvrExport';

let failures = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const lib = (pred: (f: typeof fixtureLibrary[number]) => boolean) => fixtureLibrary.find(pred) ?? fixtureLibrary[0];
const mover = lib((f) => (f.dmxChannels ?? 0) > 0 && (f.wattage ?? 0) > 0);
const conv = lib((f) => (f.wattage ?? 0) > 0 && (f.dmxChannels ?? 0) === 0) ?? mover;
console.log(`using mover="${mover.manufacturer} ${mover.name}" (${mover.dmxChannels}ch ${mover.wattage}W ${mover.weight}kg), conv="${conv.manufacturer} ${conv.name}"`);

const mk = (id: string, fix: typeof fixtureLibrary[number], x: number, y: number, over: Partial<PlacedFixture> = {}): PlacedFixture => ({
  id, fixture: fix, x, y, mountingHeight: 6, aimX: x, aimY: 6, bodyRotation: 0, dimming: 100, ...over,
});

// Two overhead trusses, fixtures hung on them + one floor unit.
const trusses: Truss[] = [
  { id: 't1', x1: 1, y1: 2, x2: 9, y2: 2, height: 6, label: 'FOH' },
  { id: 't2', x1: 1, y1: 8, x2: 9, y2: 8, height: 6, capacity: 12, label: 'Back' },
];
let fixtures: PlacedFixture[] = [
  mk('f1', mover, 3, 2, { aimX: 4, aimY: 6 }),
  mk('f2', mover, 6, 2, { aimX: 6, aimY: 6 }),
  mk('f3', conv, 4, 8, { aimX: 5, aimY: 6 }),
  mk('f4', conv, 7, 8, { aimX: 6, aimY: 6 }),
  mk('f5', conv, 5, 0.5, { mountingHeight: 1.5, aimX: 5, aimY: 6 }), // floor stand (far from any truss)
];

// ── 1) Photometric report ──
const photo = photometricReport(fixtures, [], [], { minX: 2, minY: 4, maxX: 8, maxY: 8 });
ok(!!photo, 'photometric report is produced');
if (photo) {
  console.log(`   min=${photo.min.toFixed(1)} avg=${photo.avg.toFixed(1)} max=${photo.max.toFixed(1)} U0=${photo.u0.toFixed(2)} U2=${photo.u2.toFixed(2)} area=${photo.areaM2.toFixed(1)}m² rating=${photo.rating}`);
  ok(photo.min <= photo.avg && photo.avg <= photo.max, 'min ≤ avg ≤ max');
  ok(photo.u0 > 0 && photo.u0 <= 1.0001, 'U0 in (0,1]');
  ok(photo.u2 <= photo.u0 + 1e-6, 'U2 ≤ U0');
}

// ── 2) Truss loads ──
const { perTruss, unassigned } = trussLoads(fixtures, trusses);
console.log('   trussLoads:', perTruss.map((t) => `${t.label}=${t.weightKg.toFixed(1)}/${t.capacityKg}kg(${t.fixtureCount})`).join(' '), '| unassigned', unassigned);
ok(perTruss.length === 2, 'one load entry per truss');
ok(perTruss[0].fixtureCount === 2 && perTruss[1].fixtureCount === 2, 'fixtures assigned to nearest truss');
ok(unassigned.count === 1, 'floor stand reported as unassigned');
const sumAssigned = perTruss.reduce((s, t) => s + t.weightKg, 0) + unassigned.weightKg;
const totalW = fixtures.reduce((s, f) => s + (f.fixture.weight || 0), 0);
ok(Math.abs(sumAssigned - totalW) < 1e-6, 'truss + unassigned weight == total weight');

// ── 3) Circuits ──
const circuits = circuitBreakdown(fixtures);
console.log('   circuits:', circuits.map((c) => `#${c.index}=${c.watts}W(${Math.round(c.utilization * 100)}%)`).join(' '));
ok(circuits.length >= 1, 'at least one circuit');
ok(circuits.every((c) => c.watts <= 3000 || c.fixtureCount === 1), 'circuits respect the 3000 W budget (unless a single heavy unit)');
ok(circuits.reduce((s, c) => s + c.watts, 0) === computePower(fixtures).totalWatts, 'circuit watts sum to total power');

// ── 4) Rig check (induce a DMX overlap + duplicate channel) ──
fixtures = autoPatch(fixtures, { startUniverse: 1, startAddress: 1, number: true, patch: true });
// Force f2 onto f1's address to create an overlap, and a duplicate channel.
fixtures = fixtures.map((f) => f.id === 'f2' ? { ...f, universe: fixtures[0].universe, dmxAddress: fixtures[0].dmxAddress, channel: fixtures[0].channel } : f);
const issues = rigCheck(fixtures, trusses);
const counts = issueCounts(issues);
console.log('   rigCheck:', counts, issues.map((i) => `[${i.severity}] ${i.message}`));
ok(issues.some((i) => i.severity === 'error' && /überlappend/.test(i.message)), 'detects overlapping DMX');
ok(issues.some((i) => /doppelte Kanal/.test(i.message)), 'detects duplicate channel');
ok(issues.some((i) => i.severity === 'error' && /Back.*über Traglast/.test(i.message)), 'flags the overloaded back truss (12 kg cap)');

// ── 5) MVR export ──
const xml = buildSceneDescription(fixtures, trusses, 'Testplan');
const fixtureNodes = (xml.match(/<Fixture /g) || []).length;
ok(fixtureNodes === fixtures.length, `MVR XML has one <Fixture> per fixture (${fixtureNodes})`);
ok(/<GeneralSceneDescription verMajor="1" verMinor="6"/.test(xml), 'MVR root + version present');
ok(/<Matrix>\{.*\}\{.*\}\{.*\}\{.*\}<\/Matrix>/.test(xml), 'MVR matrices are 4-vector groups');
const mvr = buildMvr(fixtures, trusses, 'Testplan');
ok(mvr[0] === 0x50 && mvr[1] === 0x4b, 'MVR archive starts with PK (ZIP)');
writeFileSync('/tmp/test.mvr', mvr);
writeFileSync('/tmp/test-mvr.xml', xml);
console.log(`   wrote /tmp/test.mvr (${mvr.length} bytes) + /tmp/test-mvr.xml`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
