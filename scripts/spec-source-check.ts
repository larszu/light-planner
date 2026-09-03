// Headless-Check fuer die Herkunft der Scheinwerfer-Kenndaten.
// Lauf: `npm run spec:check`  (node --experimental-strip-types).
//
// WORUM ES GEHT. Die Datenblatt-Extraktion verlangt vom Modell ausdruecklich
// zu JEDEM gelieferten Wert eine Quelle — ein woertliches Zitat oder eine als
// „geschaetzt" gekennzeichnete Begruendung. Der Dialog zeigt diese Tabelle an
// und hebt die Schaetzungen farblich hervor.
//
// Gespeichert wurde davon nichts. `handleSave` baute die Fixture aus den
// Formularfeldern, und der Beleg endete mit dem Dialog. Danach war eine
// GESCHAETZTE Streuwinkel-Angabe nicht mehr von einer abgelesenen und beide
// nicht von einer getippten zu unterscheiden — waehrend genau diese Zahl in
// `lightCalc` und in die 3D-Darstellung eingeht.
//
// Das ist derselbe Befund wie Initiative 10 im cable-planner, nur eine Ebene
// hoeher: nicht „das Geraet hat es nicht bestaetigt", sondern „niemand hat es
// abgelesen". Und hier war der Beleg sogar schon da; er wurde im letzten
// Schritt weggeworfen. ADR-005 Regel 1 — bewahren.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isEstimate, isStaleSource } from '../src/types.ts';

// 1) Schaetzung und Ablesung sind unterscheidbar.
assert.equal(isEstimate({ source: 'geschätzt: aus 750 W und Wirkungsgrad' }), true);
assert.equal(isEstimate({ source: 'geschaetzt aus dem Zoombereich' }), true);
assert.equal(isEstimate({ source: '"Beam angle 19°" (Datenblatt S. 3)' }), false);
assert.equal(isEstimate(undefined), false);
console.log('✓ Schaetzung und Ablesung sind unterscheidbar');

// 2) Ein Beleg, dessen Wert nicht mehr stimmt, sagt das.
//    Der Fall, der sonst still luegt: das Modell las 19°, der Nutzer tippte
//    26 — und der Beleg behauptete weiter, 26 stuende im Datenblatt.
const beleg = { value: '19', source: '"Beam angle 19°"' };
assert.equal(isStaleSource(beleg, 19), false);
assert.equal(isStaleSource(beleg, 26), true);
assert.equal(isStaleSource(undefined, 26), false);
console.log('✓ Ein Beleg zu einem geaenderten Wert wird als veraltet erkannt');

// 3) Der Editor traegt den Beleg wirklich in die gespeicherte Fixture.
//    Ohne diesen Guard waere Punkt 1 und 2 nur Theorie: die Funktionen
//    koennen richtig sein und trotzdem nie etwas zu pruefen bekommen.
const editor = readFileSync(new URL('../src/components/FixtureEditor.tsx', import.meta.url), 'utf8');
assert.ok(
  /specSource:\s*aiVerification\?\.length/.test(editor),
  'FixtureEditor speichert den Beleg nicht mehr mit',
);
assert.ok(
  editor.includes('initial?.specSource'),
  'ein bestehender Beleg geht beim Bearbeiten ohne neue Extraktion verloren',
);
console.log('✓ Der Editor speichert den Beleg mit');

// 4) Die Eigenschaften-Leiste zeigt ihn an.
//    Ein Beleg, den niemand sieht, ist so gut wie keiner — das war ja gerade
//    der Zustand, den dieser Check beendet.
const panel = readFileSync(new URL('../src/components/PropertyPanel.tsx', import.meta.url), 'utf8');
assert.ok(panel.includes('srcMark'), 'PropertyPanel zeigt keinen Beleg-Marker');
for (const feld of ['wattage', 'lumens', 'beamAngle', 'fieldAngle', 'cutoffAngle']) {
  assert.ok(
    panel.includes(`'${feld}')`),
    `Feld ${feld} zeigt seinen Beleg nicht — es geht in die Berechnung ein`,
  );
}
console.log('✓ Die Kenndaten-Felder zeigen ihren Beleg');

console.log('\nAlle Herkunfts-Checks bestanden.');
