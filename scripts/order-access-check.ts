// ───────────────────────────────────────────────────────────────────────────
// Eine Ablaufliste, rollenweise Spalten (Bedarf 54, P2).
// Lauf: `npm run access:check`
//
// Die Bedarfsdatenbank nennt diese Zeile „the most precisely user-specified
// request in the whole evidence base - built to spec rather than inferred".
// Diese Datei prueft deshalb die VORLAGE, Satzteil fuer Satzteil:
//
//   > One shared running order | with per-role column visibility | and edit
//   > rights scoped to your own column | read-only for observers | lockable
//   > once the show is live
//
// WAS HIER GEPRUEFT WIRD, und warum jede Zeile davon noetig ist:
//
//  1. SEHEN UND AENDERN SIND ZWEI FRAGEN. Zusammengelegt schuetzte das
//     Ausblenden, und eine eingeblendete Spalte waere eine freigegebene: wer
//     als Ton die Licht-Spalte einblendet, um mitzulesen, duerfte sie aendern.
//
//  2. DIE EIGENE SPALTE JA, DIE FREMDE NEIN. Das ist der Bedarf.
//
//  3. ZUSCHAUER AENDERN NICHTS — auch nicht in einer Spalte ohne Eigentuemer.
//
//  4. OHNE ERKLAERTEN EIGENTUEMER AENDERT NIEMAND (ADR-002). Die Vorgabe muss
//     die vorsichtige sein; sonst ist eine versehentlich eigentuemerlose
//     Spalte ab Tag eins fuer alle offen, und es faellt niemandem auf.
//
//  5. DER RIEGEL GILT FUER ALLE. Eine Sperre, die fuer den Wichtigsten nicht
//     gilt, ist keine — und der eine Griff, gegen den sie gebaut ist, ist
//     seiner.
//
//  6. DIE ABSAGE TRAEGT EINEN GRUND. „Geht nicht" ohne Grund schickt jemanden
//     zum Systemhaus; „gehoert dem Licht" schickt ihn zum Licht.
//
//  7. EINE REGEL, NICHT ZWEI. `editableColumns` rechnet aus `canEditColumn`.
//     Zwei Fassungen liefen auseinander, und die zweite waere die, die eine
//     fremde Spalte offen laesst.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  canEditColumn,
  editableColumns,
  visibleColumns,
  FOREIGN_COLUMN_REASON,
  LIVE_REASON,
  OBSERVER_REASON,
  UNOWNED_REASON,
  type ColumnDef,
} from '../src/core/orderAccess.ts';

const hier = dirname(fileURLToPath(import.meta.url));
const lies = (p: string) => readFileSync(join(hier, p), 'utf8');

const spalten: ColumnDef[] = [
  { id: 'cue', label: 'Cue', ownerRole: 'regie' },
  { id: 'ton', label: 'Ton', ownerRole: 'ton' },
  { id: 'licht', label: 'Licht', ownerRole: 'licht' },
  // Angelegt, aber niemandem zugeordnet — der Fall, den ADR-002 meint.
  { id: 'notiz', label: 'Notiz' },
];

// ─── 1. Sehen und Aendern sind zwei Fragen ─────────────────────────────────
{
  // Ton blendet Licht aus: eine Ansichtssache.
  assert.deepEqual(
    visibleColumns(spalten, ['licht']).map((c) => c.id),
    ['cue', 'ton', 'notiz'],
  );
  // Wer nichts wegklickt, sieht alles — die gemeinsame Liste ist gemeinsam.
  assert.equal(visibleColumns(spalten, []).length, spalten.length);

  // Und das EINBLENDEN gibt kein Recht: sichtbar heisst nicht aenderbar.
  assert.equal(canEditColumn(spalten, 'ton', 'licht', 'planning').ok, false);
  // Umgekehrt nimmt das Ausblenden keines: die eigene Spalte bleibt die eigene.
  assert.equal(canEditColumn(spalten, 'ton', 'ton', 'planning').ok, true);
}

// ─── 2. Die eigene Spalte ja, die fremde nein ──────────────────────────────
{
  assert.equal(canEditColumn(spalten, 'licht', 'licht', 'planning').ok, true);
  const fremd = canEditColumn(spalten, 'licht', 'ton', 'planning');
  assert.equal(fremd.ok, false);
  assert.equal(fremd.reason, FOREIGN_COLUMN_REASON);
  // Auch die Regie hat nur ihre eigene.
  assert.equal(canEditColumn(spalten, 'regie', 'ton', 'planning').ok, false);
}

// ─── 3. Zuschauer aendern nichts ───────────────────────────────────────────
{
  for (const id of ['cue', 'ton', 'licht', 'notiz']) {
    const p = canEditColumn(spalten, null, id, 'planning');
    assert.equal(p.ok, false, `Zuschauer darf ${id} aendern`);
    assert.equal(p.reason, OBSERVER_REASON);
  }
  assert.deepEqual(editableColumns(spalten, null, 'planning'), []);
}

// ─── 4. Ohne erklaerten Eigentuemer aendert niemand ────────────────────────
{
  for (const rolle of ['regie', 'ton', 'licht']) {
    const p = canEditColumn(spalten, rolle, 'notiz', 'planning');
    assert.equal(p.ok, false, `${rolle} darf die eigentuemerlose Spalte aendern`);
    assert.equal(p.reason, UNOWNED_REASON);
  }
}

// ─── 5. Der Riegel gilt fuer alle ──────────────────────────────────────────
{
  const regie = canEditColumn(spalten, 'regie', 'cue', 'live');
  assert.equal(regie.ok, false, 'die Regie aendert waehrend der Show');
  assert.equal(regie.reason, LIVE_REASON);
  assert.deepEqual(editableColumns(spalten, 'regie', 'live'), []);
  assert.deepEqual(editableColumns(spalten, 'ton', 'live'), []);

  // Und der Grund ist der Riegel, nicht die Rolle: sonst haenge die Antwort
  // fuer die eigene Spalte waehrend der Show davon ab, wer fragt.
  assert.equal(canEditColumn(spalten, 'ton', 'licht', 'live').reason, LIVE_REASON);
}

// ─── 6. Die Absage traegt einen Grund ──────────────────────────────────────
{
  const gruende = [
    canEditColumn(spalten, null, 'ton', 'planning'),
    canEditColumn(spalten, 'ton', 'licht', 'planning'),
    canEditColumn(spalten, 'ton', 'notiz', 'planning'),
    canEditColumn(spalten, 'ton', 'ton', 'live'),
    canEditColumn(spalten, 'ton', 'gibtsnicht', 'planning'),
  ];
  for (const g of gruende) {
    assert.equal(g.ok, false);
    assert.ok(g.reason && g.reason.length > 20, 'eine Absage ohne brauchbaren Grund');
  }
  // Und eine Zusage traegt keinen — ein Grund fuer ein Ja waere Laerm.
  assert.equal(canEditColumn(spalten, 'ton', 'ton', 'planning').reason, null);
}

// ─── 7. Eine Regel, nicht zwei ─────────────────────────────────────────────
{
  assert.deepEqual(
    editableColumns(spalten, 'ton', 'planning').map((c) => c.id),
    ['ton'],
  );
  // Gerechnet, nicht danebengeschrieben: die Quelle ruft die Engstelle auf.
  const src = lies('../src/core/orderAccess.ts');
  const nachDort = src.slice(src.indexOf('export function editableColumns'));
  assert.match(nachDort, /canEditColumn\(/, 'editableColumns fuehrt eine zweite Rechnung');

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['access:check'], 'access:check fehlt in package.json');
}

console.log('OK order-access-check: eine Liste, eigene Spalte, Zuschauer lesen, und der Riegel gilt fuer alle.');
