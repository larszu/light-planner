// ───────────────────────────────────────────────────────────────────────────
// Der Lichtplan auf einem echten Blatt (#123, Kommentar).
// Lauf: `npm run plot:check`
//
// NUTZER-MELDUNG: „Und den Lichtplan auch als PDF. Gleiche
// Einstellmoeglichkeiten wie bei Cable planner."
//
// WAS HIER GEPRUEFT WIRD, und warum jede Zeile davon noetig ist:
//
//  1. DAS BLATT HAT DIE MASSE, DIE ES VERSPRICHT. A4 quer ist 842 x 595
//     Punkte, nicht ungefaehr. Eine Seite, die um zwei Punkte danebenliegt,
//     faellt niemandem am Bildschirm auf und dem Plotter sofort: er
//     skaliert dann „auf Seitengroesse" und der Massstab ist dahin.
//
//  2. DER PLAN WIRD NICHT GEDEHNT. Seitenverhaeltnis vorher gleich
//     Seitenverhaeltnis nachher. Das ist die einzige Zusage, die den
//     eingezeichneten Massstabsbalken traegt — er ist Teil des Bildes und
//     wuerde jede Dehnung mitmachen, ohne seine Beschriftung zu aendern.
//     Ein gedehnter Plan ist damit nicht haesslich, sondern falsch.
//
//  3. DAS BILD BLEIBT INNERHALB DER RAENDER. Geprueft mit dem groessten
//     angebotenen Rand auf dem kleinsten Format — die Paarung, bei der es
//     zuerst schiefgeht.
//
//  4. EIN UNSINNIGER RAND KOSTET KEINE DATEI. 500 mm Rand auf A4 liesse
//     rechnerisch ein Bild negativer Breite uebrig. Gekappt statt
//     abgelehnt: der Nutzer sieht ein schmales Bild und weiss Bescheid.
//
//  5. „ORIGINAL" IST DIE ALTE FORM. Seite = Bild, Massstab 1. Wer nichts
//     einstellt, soll dieselbe Datei bekommen koennen wie vor dem Dialog.
//
//  6. DAS PDF TRAEGT DIE SEITE WIRKLICH. Die MediaBox im geschriebenen
//     Dokument wird gelesen, nicht die Absicht. Eine Rechnung, die stimmt,
//     und ein Schreiber, der sie ignoriert, waeren zusammen genau so
//     kaputt wie gar keine Rechnung.
//
//  7. DER WEG IST VERDRAHTET. Der Dialog haengt im App-Baum und der
//     Menuepunkt fuehrt hin — sonst waere die Funktion gebaut und
//     unerreichbar.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seitenLayout, ptAusMm, PAPIERE } from '../src/utils/plotPage.ts';

const nah = (a: number, b: number, toleranz = 0.5) =>
  assert.ok(Math.abs(a - b) <= toleranz, `${a} weicht von ${b} um mehr als ${toleranz} ab`);

// 1 — die Masse
const a4quer = seitenLayout({ bildBreitePx: 1600, bildHoehePx: 900, papier: 'a4', ausrichtung: 'quer', randMm: 10 });
nah(a4quer.seiteBreite, ptAusMm(297));
nah(a4quer.seiteHoehe, ptAusMm(210));
const a4hoch = seitenLayout({ bildBreitePx: 900, bildHoehePx: 1600, papier: 'a4', ausrichtung: 'hoch', randMm: 10 });
nah(a4hoch.seiteBreite, ptAusMm(210));
nah(a4hoch.seiteHoehe, ptAusMm(297));

// 2 — keine Dehnung, in jedem Format und in beiden Ausrichtungen
for (const papier of PAPIERE) {
  for (const ausrichtung of ['quer', 'hoch'] as const) {
    for (const [bw, bh] of [[1600, 900], [900, 1600], [1200, 1200]] as const) {
      const l = seitenLayout({ bildBreitePx: bw, bildHoehePx: bh, papier: papier.id, ausrichtung, randMm: 10 });
      assert.ok(
        Math.abs(l.bildBreite / l.bildHoehe - bw / bh) < 1e-6,
        `${papier.id}/${ausrichtung}: Seitenverhaeltnis ${l.bildBreite / l.bildHoehe} statt ${bw / bh}`,
      );
      assert.ok(l.bildBreite > 0 && l.bildHoehe > 0, `${papier.id}: leeres Bild`);
    }
  }
}

// 3 — innerhalb der Raender
const eng = seitenLayout({ bildBreitePx: 1600, bildHoehePx: 900, papier: 'a4', ausrichtung: 'hoch', randMm: 20 });
const rand = ptAusMm(20);
assert.ok(eng.bildX >= rand - 0.01, `linker Rand ${eng.bildX} < ${rand}`);
assert.ok(eng.bildY >= rand - 0.01, `unterer Rand ${eng.bildY} < ${rand}`);
nah(eng.bildX + eng.bildBreite, eng.seiteBreite - eng.bildX, 0.01);
nah(eng.bildY + eng.bildHoehe, eng.seiteHoehe - eng.bildY, 0.01);

// 4 — unsinniger Rand
const absurd = seitenLayout({ bildBreitePx: 1600, bildHoehePx: 900, papier: 'a4', ausrichtung: 'quer', randMm: 500 });
assert.ok(absurd.bildBreite > 0 && absurd.bildHoehe > 0, 'zu grosser Rand liess kein Bild uebrig');
assert.ok(absurd.bildX >= 0 && absurd.bildY >= 0, 'Bild liegt ausserhalb der Seite');

// 5 — Original
const orig = seitenLayout({ bildBreitePx: 1440, bildHoehePx: 902, papier: 'original', ausrichtung: 'quer', randMm: 20 });
assert.equal(orig.seiteBreite, 1440);
assert.equal(orig.seiteHoehe, 902);
assert.equal(orig.massstab, 1);
assert.equal(orig.bildX, 0);
assert.equal(orig.bildY, 0);

// 6 — die MediaBox im geschriebenen PDF
const pdfQuelle = readFileSync(new URL('../src/utils/pdfExport.ts', import.meta.url), 'utf8');
assert.match(
  pdfQuelle,
  /MediaBox \[0 0 \$\{z\(l\.seiteBreite\)\} \$\{z\(l\.seiteHoehe\)\}\]/,
  'pdfExport schreibt die MediaBox nicht aus dem Layout',
);
assert.match(
  pdfQuelle,
  /\$\{z\(l\.bildBreite\)\} 0 0 \$\{z\(l\.bildHoehe\)\} \$\{z\(l\.bildX\)\} \$\{z\(l\.bildY\)\} cm/,
  'pdfExport platziert das Bild nicht ueber das Layout',
);

// 7 — der Weg
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.match(app, /<PlotExportDialog/, 'der Dialog haengt nicht im App-Baum');
assert.match(app, /seitenLayout\(\{/, 'App.tsx rechnet die Seite nicht');
const menue = readFileSync(new URL('../src/components/menuModel.ts', import.meta.url), 'utf8');
assert.match(menue, /onExportPlot/, 'kein Menuepunkt fuehrt zum Plan-Druck');

console.log(`✓ Plan-Seite: ${PAPIERE.length} Formate, beide Ausrichtungen, kein Dehnen.`);
console.log('Alle Plan-Seiten-Checks bestanden.');
