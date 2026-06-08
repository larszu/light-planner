import { fixtureLibrary } from '../src/core/fixtureLibrary';
import type { ProjectData, PlacedFixture } from '../src/types';
import { diffProjects } from '../src/core/diff';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const fix = fixtureLibrary[0];
const mk = (id: string, o: Partial<PlacedFixture> = {}): PlacedFixture => ({
  id, fixture: fix, x: 1, y: 1, mountingHeight: 6, aimX: 1, aimY: 5, bodyRotation: 0, dimming: 100, ...o,
});
const meta = { name: 'P', author: '', version: '1', createdAt: '', updatedAt: '' };
const base = (fx: PlacedFixture[]): ProjectData => ({ meta, fixtures: fx, shapes: [], persons: [], stageElements: [], customFixtures: [] });

const A = base([mk('f1', { channel: 1 }), mk('f2', { channel: 2, dimming: 100 }), mk('f3', { channel: 3 })]);
const B = base([
  mk('f1', { channel: 1 }),                                   // unchanged
  mk('f2', { channel: 2, dimming: 60, x: 4, gelFilterIds: ['lee-205'] }), // changed (3 fields)
  mk('f4', { channel: 4 }),                                   // added
]);                                                            // f3 removed

const d = diffProjects(A, B);
console.log(JSON.stringify({ added: d.fixtures.added.map(a=>a.id), removed: d.fixtures.removed.map(r=>r.id), changed: d.fixtures.changed.map(c=>({id:c.id, fields:c.fields.map(f=>f.field)})), total: d.total }, null, 2));
ok(d.fixtures.added.length === 1 && d.fixtures.added[0].id === 'f4', 'detects added fixture (f4)');
ok(d.fixtures.removed.length === 1 && d.fixtures.removed[0].id === 'f3', 'detects removed fixture (f3)');
ok(d.fixtures.changed.length === 1 && d.fixtures.changed[0].id === 'f2', 'detects the one changed fixture (f2)');
const fields = d.fixtures.changed[0]?.fields.map(f => f.field) ?? [];
ok(fields.includes('Dimmer') && fields.includes('Position') && fields.includes('Gel'), 'reports Dimmer + Position + Gel changes');
ok(d.total === 3, 'total = 3 (1 add + 1 remove + 1 change)');
ok(diffProjects(A, A).total === 0, 'identical docs => 0 changes');
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
