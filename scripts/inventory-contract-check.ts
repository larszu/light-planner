// Drift-Guard fuer das portable Lager-Format `avplan-inventory`.
// Lauf: `npm run inventory:check`  (node --experimental-strip-types).
//
// Das Format ist in ALLEN DREI Apps (cable / multicam / light) byte-identisch
// dupliziert, damit ein Lager app-uebergreifend importierbar bleibt. Dieser
// Check friert den Wire-Contract ein: Format-Marker, Versionsnummer, Envelope-
// Shape und die Feld-Namen jeder Entitaet. Aendert jemand das Schema in EINEM
// Repo, schlaegt dessen Guard fehl.
//
// !!! Wenn dieser Contract bewusst geaendert wird:
//   1. INVENTORY_FORMAT_VERSION erhoehen (Abwaertskompatibilitaet beachten),
//   2. die identische Aenderung in ALLEN DREI Repos nachziehen
//      (cable tests/, multicam src/__tests__/, light scripts/),
//   3. die eingefrorenen Key-Listen unten anpassen.
import assert from 'node:assert/strict';
import {
  INVENTORY_FORMAT,
  INVENTORY_FORMAT_VERSION,
  serializeInventory,
  parseInventory,
  type InventorySnapshot,
} from '../src/inventory/portable.ts';
import type { InventoryItem, StorageNode, InventorySet, InventoryUnit } from '../src/inventory/types.ts';

// Eingefrorener Contract — MUSS in allen drei Repos identisch sein.
const CONTRACT = {
  format: 'avplan-inventory',
  version: 1,
  envelopeKeys: ['app', 'exportedAt', 'format', 'items', 'nodes', 'sets', 'units', 'version'],
  itemKeys: ['category', 'code', 'codeType', 'createdAt', 'dimensions', 'id', 'locationId', 'manufacturer', 'materialKinds', 'model', 'notes', 'ownership', 'quantity', 'rentPricePerDay', 'stockLocation', 'supplier', 'updatedAt'],
  nodeKeys: ['code', 'codeType', 'createdAt', 'dimensions', 'id', 'kind', 'name', 'notes', 'parentId', 'updatedAt'],
  setKeys: ['components', 'createdAt', 'id', 'name', 'notes', 'updatedAt'],
  unitKeys: ['code', 'codeType', 'condition', 'createdAt', 'history', 'id', 'itemId', 'locationId', 'notes', 'serial', 'updatedAt'],
} as const;

// Voll besetzte Muster-Entitaeten (jedes Feld gesetzt) — TS erzwingt, dass sie
// zum Typ passen; die Key-Assertions unten erzwingen, dass kein Feld fehlt.
const item: InventoryItem = {
  id: 'i1', model: 'ULXD2', manufacturer: 'Shure', category: 'wireless', quantity: 4,
  rentPricePerDay: 25, stockLocation: 'Regal A3', supplier: 'AV GmbH', ownership: 'owned',
  code: 'ITM-1', codeType: 'qr', locationId: 'n1',
  dimensions: { widthMm: 50, heightMm: 20, depthMm: 200, weightKg: 0.3 },
  materialKinds: ['rental'], notes: 'x', createdAt: 't', updatedAt: 't',
};
const node: StorageNode = {
  id: 'n1', name: 'Transport-Case 1', kind: 'transportCase', parentId: 'n0',
  code: 'LOC-1', codeType: 'barcode', dimensions: { widthMm: 800, weightKg: 12 },
  notes: 'x', createdAt: 't', updatedAt: 't',
};
const set: InventorySet = {
  id: 's1', name: 'Funkset', components: [{ itemId: 'i1', quantity: 2 }],
  notes: 'x', createdAt: 't', updatedAt: 't',
};
const unit: InventoryUnit = {
  id: 'u1', itemId: 'i1', serial: 'SN-1', code: 'UNI-1', codeType: 'qr', locationId: 'n1',
  condition: 'ok', notes: 'x', history: [{ at: 't', kind: 'created', detail: 'x' }],
  createdAt: 't', updatedAt: 't',
};
const snapshot: InventorySnapshot = { items: [item], nodes: [node], sets: [set], units: [unit] };

const sortedKeys = (o: object) => Object.keys(o).sort();

// 1) Format-Marker + Version eingefroren.
assert.equal(INVENTORY_FORMAT, CONTRACT.format);
assert.equal(INVENTORY_FORMAT_VERSION, CONTRACT.version);
console.log('✓ Format-Marker + Version eingefroren');

// 2) Envelope-Shape eingefroren.
const file = JSON.parse(serializeInventory(snapshot, { exportedAt: 't', app: 'light-planner' }));
assert.deepEqual(sortedKeys(file), CONTRACT.envelopeKeys);
assert.equal(file.format, CONTRACT.format);
assert.equal(file.version, CONTRACT.version);
console.log('✓ Envelope-Shape eingefroren');

// 3) Feld-Namen jeder Entitaet eingefroren.
assert.deepEqual(sortedKeys(item), CONTRACT.itemKeys);
assert.deepEqual(sortedKeys(node), CONTRACT.nodeKeys);
assert.deepEqual(sortedKeys(set), CONTRACT.setKeys);
assert.deepEqual(sortedKeys(unit), CONTRACT.unitKeys);
console.log('✓ Feld-Namen jeder Entitaet eingefroren');

// 4) Round-Trip serialize -> parse verlustfrei.
assert.deepEqual(parseInventory(serializeInventory(snapshot)), snapshot);
console.log('✓ Round-Trip serialize -> parse verlustfrei');

// 5) parse lehnt fremdes Format / hoehere Version ab.
assert.equal(parseInventory(JSON.stringify({ format: 'something-else', version: 1 })), null);
assert.equal(parseInventory(JSON.stringify({ format: CONTRACT.format, version: CONTRACT.version + 1 })), null);
assert.equal(parseInventory('not json'), null);
console.log('✓ parse lehnt fremdes Format / hoehere Version ab');

console.log('\nAlle avplan-inventory Wire-Contract-Checks bestanden.');
