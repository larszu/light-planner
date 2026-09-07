// ───────────────────────────────────────────────────────────────────────────
// Ein Lager, das nicht geschrieben wurde, ist kein Lager.
//
// BEFUND (Defektformen-Sweep, Backlog B-36 der av-planner-suite, Form
// `zustand-nach-fehler`). `src/inventory/store.ts` fing den Schreibfehler mit
// einem leeren `catch { /* quota */ }` ab. Bei vollem localStorage meldete
// der Import „N Objekte importiert", der Bestand stand in der Oberflaeche —
// und war beim naechsten Start weg.
//
// Ein Undo fuer diesen Store gibt es nicht, und es sind
// PROJEKTUEBERGREIFENDE Stammdaten: Geraete, Lagerorte, Einheiten, Codes.
// Gerade dort faellt der Verlust erst am naechsten Tag auf.
//
// Der Lauf prueft das VERHALTEN gegen einen localStorage, der auf Wunsch
// wirft — nicht den Quelltext.
//
// Lauf: `npm run storage:check`
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';

const speicher: Record<string, string> = {};
let voll = false;

// Muss VOR dem Import des Stores stehen: er liest beim Modul-Laden.
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => speicher[k] ?? null,
  setItem: (k: string, v: string) => {
    if (voll) throw new Error('QuotaExceededError');
    speicher[k] = v;
  },
  removeItem: (k: string) => { delete speicher[k]; },
};

const { useInventoryStore } = await import('../src/inventory/store.ts');
const s = useInventoryStore;
const artikel = { model: 'Testgeraet', quantity: 1 } as never;

// ── 1. Der Normalfall schreibt wirklich ───────────────────────────────────
s.getState().addItem(artikel);
assert.equal(s.getState().storageFull, false, 'ohne volle Quota ist nichts voll');
assert.ok(Object.keys(speicher).length > 0,
  'der Bestand muss wirklich im Speicher stehen — sonst waere `storageFull: false` wertlos');

// ── 2. Der volle Speicher meldet sich ─────────────────────────────────────
voll = true;
s.getState().addItem(artikel);
assert.equal(s.getState().storageFull, true, 'ein gescheiterter Schreibvorgang wird gemeldet');
assert.equal(s.getState().items.length, 2,
  'der Artikel bleibt in der Sitzung — ihn stillschweigend zu verwerfen waere ein zweiter Verlust');

// ── 3. Auch beim Import, wo es am meisten kostet ──────────────────────────
//
// Erst wieder erfolgreich schreiben. Sonst stuende der Merker schon von
// Schritt 2 auf `true`, und die Zusicherung waere auch dann gruen, wenn der
// Import gar nichts meldet — genau das hat die erste Fassung dieser Datei
// getan, und die Gegenprobe „Import meldet nicht" blieb gruen.
voll = false;
s.getState().addItem(artikel);
assert.equal(s.getState().storageFull, false, 'Ausgangslage fuer Schritt 3');
voll = true;
const n = s.getState().importSnapshot(
  { items: [{ id: 'a', model: 'X', quantity: 2 } as never] },
  'replace',
);
assert.equal(n, 1);
assert.equal(s.getState().storageFull, true, 'auch der Import meldet den vollen Speicher');

// ── 4. Und der Merker faellt zurueck ──────────────────────────────────────
//
// Sonst bliebe die Warnung stehen, nachdem der Nutzer Platz geschaffen hat —
// und eine Warnung, die nicht mehr weggeht, wird ignoriert.
voll = false;
s.getState().addItem(artikel);
assert.equal(s.getState().storageFull, false, 'nach einem geglueckten Schreibvorgang ist es vorbei');

console.log('storage:check ok — ein gescheiterter Schreibvorgang wird gemeldet (B-36)');
