// ───────────────────────────────────────────────────────────────────────────
// Der Lager-Import zeigt VORHER, was er tut (E-15, Backlog B-22).
// Lauf: `npm run preview:check`
//
// DER BEFUND. `InventoryDialog.doImport` stellte eine einzige Ja/Nein-Frage:
//
//   const replace = window.confirm('Bestehenden Bestand ERSETZEN? Abbrechen
//                                   = zusammenfuehren.')
//
// „Abbrechen" fuehrte zusammen. Es gab an dieser Stelle keinen Weg, gar
// nichts zu tun — und die Frage stand ohne eine einzige Zahl daneben. Wer
// „ersetzen" waehlte, loeschte den projektuebergreifenden Bestand, ohne zu
// sehen, wie viele Positionen daran haengen; ein Undo fuer diesen Store gibt
// es nicht, und der naechste `localStorage`-Schreibvorgang macht es endgueltig.
//
// WAS HIER GEPRUEFT WIRD, und warum jede Zeile davon noetig ist:
//
//  1. DIE VORSCHAU RECHNET WIE DER IMPORT. Sie wird gegen das tatsaechliche
//     Ergebnis gehalten, nicht gegen eine zweite Meinung. Eine Vorschau, die
//     anders rechnet als der Import, ist schlimmer als keine: sie sieht nach
//     Pruefung aus.
//
//  2. `merge` NIMMT NIE ETWAS WEG. Das ist die Zusicherung, die die harmlose
//     der beiden Antworten harmlos macht.
//
//  3. EINE V1-DATEI IST KEINE AENDERUNG. Was die Datei nicht sagt, sagt
//     nichts (ADR-005, Regel 2). Wer „eingehend != vorhanden" rechnete,
//     meldete jede aeltere Datei als Aenderung — und in einer Liste, in der
//     alles rot ist, liest niemand mehr, was wirklich rot ist.
//
//  4. `replace` NENNT DIE ENTFERNTEN. Die eine Zahl, die es sonst nirgends
//     gibt, und die einzige, die nicht rueckgaengig zu machen ist.
//
//  5. FELDWEISE, NICHT ALS ZEICHENKETTE. Zwei inhaltsgleiche Datensaetze mit
//     anderer Feld-Reihenfolge sind nicht „geaendert".
//
//  6. ALLE VIER SORTEN. Lagerorte, Sets und Einheiten kommen ueber denselben
//     Import und werden vom selben `replace` geloescht wie die Artikel.
//
//  7. „NICHTS ZU TUN" IST EINE ANTWORT — und `gleich` zaehlt nicht als Arbeit.
//
//  8. DER WEG IST VERDRAHTET: kein `window.confirm` mehr, und es gibt einen
//     dritten Ausgang. Ohne diesen Punkt waere alles darueber ein Modul, das
//     niemand aufruft.
// ───────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  VORSCHAU_SORTEN,
  importVorschau,
  sortenVorschau,
  vorschauIstLeer,
  vorschauSumme,
  wendeAn,
  type ImportMode,
} from '../src/inventory/importPreview.ts';

const lies = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** Alle `.ts`-Dateien unter einem i18n-Ordner, aneinandergehaengt. */
const i18nQuellen = (rel: string): string => {
  const wurzel = new URL(`${rel}/`, import.meta.url);
  const sammle = (ordner: URL): string[] => {
    const raus: string[] = [];
    for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
      const kind = new URL(`${eintrag.name}${eintrag.isDirectory() ? '/' : ''}`, ordner);
      if (eintrag.isDirectory()) raus.push(...sammle(kind));
      else if (eintrag.name.endsWith('.ts')) raus.push(readFileSync(kind, 'utf8'));
    }
    return raus;
  };
  return sammle(wurzel).join('\n');
};

/** Ein Lager-Artikel, so schlank wie moeglich — id + zwei Felder reichen. */
interface Satz {
  id: string;
  model: string;
  manufacturer?: string;
  deviceTypeId?: string;
}

const satz = (id: string, model: string, rest: Partial<Satz> = {}): Satz => ({ id, model, ...rest });

// ─── 1. Die Vorschau rechnet wie der Import ────────────────────────────────
//
// Nicht „ich habe beides gelesen und es sieht gleich aus": die Vorschau wird
// gegen `wendeAn` gehalten, also gegen `mergeById` selbst — dieselbe Funktion,
// die `importSnapshot` im Store benutzt.
{
  const faelle: { name: string; vorhanden: Satz[]; eingehend: Satz[] }[] = [
    {
      name: 'leeres Lager',
      vorhanden: [],
      eingehend: [satz('a', 'Source Four'), satz('b', 'ETC ColorSource')],
    },
    {
      name: 'Ueberschneidung mit Aenderung',
      vorhanden: [satz('a', 'Source Four'), satz('c', 'Nur lokal')],
      eingehend: [satz('a', 'Source Four 26'), satz('b', 'Neu')],
    },
    {
      name: 'nichts gemeinsam',
      vorhanden: [satz('x', 'Alt')],
      eingehend: [satz('y', 'Neu')],
    },
    {
      name: 'identische Datei',
      vorhanden: [satz('a', 'Source Four'), satz('b', 'ColorSource')],
      eingehend: [satz('a', 'Source Four'), satz('b', 'ColorSource')],
    },
    {
      name: 'v1-Datei ohne deviceTypeId',
      vorhanden: [satz('a', 'Source Four', { deviceTypeId: 'guid-1' })],
      eingehend: [satz('a', 'Source Four')],
    },
  ];

  for (const modus of ['merge', 'replace'] as ImportMode[]) {
    for (const fall of faelle) {
      const v = sortenVorschau(fall.vorhanden, fall.eingehend, modus);
      const nachher = wendeAn(fall.vorhanden, fall.eingehend, modus);
      const nachherIds = new Set(nachher.map((x) => x.id));
      const vorherIds = new Set(fall.vorhanden.map((x) => x.id));
      const wo = `${fall.name} / ${modus}`;

      // Jede gemeldete Sorte wird am Ergebnis nachgemessen.
      for (const id of v.neu) {
        assert.ok(!vorherIds.has(id), `${wo}: "${id}" als neu gemeldet, war aber da`);
        assert.ok(nachherIds.has(id), `${wo}: "${id}" als neu gemeldet, steht aber nicht im Ergebnis`);
      }
      for (const id of v.entfernt) {
        assert.ok(vorherIds.has(id), `${wo}: "${id}" als entfernt gemeldet, war aber nie da`);
        assert.ok(!nachherIds.has(id), `${wo}: "${id}" als entfernt gemeldet, steht aber im Ergebnis`);
      }
      for (const id of v.gleich) {
        const vorher = fall.vorhanden.find((x) => x.id === id);
        const danach = nachher.find((x) => x.id === id);
        assert.deepEqual(danach, vorher, `${wo}: "${id}" als gleich gemeldet, hat sich aber geaendert`);
      }
      for (const id of v.geaendert) {
        const vorher = fall.vorhanden.find((x) => x.id === id);
        const danach = nachher.find((x) => x.id === id);
        assert.notDeepEqual(danach, vorher, `${wo}: "${id}" als geaendert gemeldet, ist aber gleich`);
      }

      // Und umgekehrt: nichts faellt unter den Tisch. Die Vorschau nennt
      // JEDE Id, die vorher oder nachher existiert — sonst waere „steht
      // nicht in der Liste" eine stille dritte Kategorie.
      for (const id of v.unberuehrt) {
        assert.ok(vorherIds.has(id), `${wo}: "${id}" als unberuehrt gemeldet, war aber nie da`);
        const vorher = fall.vorhanden.find((x) => x.id === id);
        const danach = nachher.find((x) => x.id === id);
        assert.deepEqual(danach, vorher, `${wo}: "${id}" als unberuehrt gemeldet, hat sich aber geaendert`);
      }

      const genannt = new Set([
        ...v.neu,
        ...v.geaendert,
        ...v.gleich,
        ...v.entfernt,
        ...v.unberuehrt,
      ]);
      for (const id of [...vorherIds, ...nachherIds]) {
        assert.ok(genannt.has(id), `${wo}: "${id}" kommt in der Vorschau gar nicht vor`);
      }
    }
  }
}

// ─── 2. `merge` nimmt nie etwas weg ────────────────────────────────────────
{
  const vorhanden = [satz('a', 'A'), satz('b', 'B'), satz('c', 'C')];
  const eingehend = [satz('a', 'A neu')];

  const m = sortenVorschau(vorhanden, eingehend, 'merge');
  assert.deepEqual(m.entfernt, [], 'zusammenfuehren meldet Entfernungen');
  // Dieselben zwei Ids, die `replace` loeschen wuerde — hier als das, was
  // sie sind. Ohne diese Zeile waere „nimmt nichts weg" eine Behauptung
  // ueber eine leere Liste statt eine Aussage ueber b und c.
  assert.deepEqual(m.unberuehrt.sort(), ['b', 'c'], 'zusammenfuehren sagt nicht, was stehen bleibt');
  assert.deepEqual(
    wendeAn(vorhanden, eingehend, 'merge').map((x) => x.id).sort(),
    ['a', 'b', 'c'],
    'zusammenfuehren hat tatsaechlich etwas weggenommen',
  );

  const r = sortenVorschau(vorhanden, eingehend, 'replace');
  assert.deepEqual(r.entfernt.sort(), ['b', 'c'], 'ersetzen verschweigt, was wegfaellt');
  assert.deepEqual(r.unberuehrt, [], 'ersetzen laesst angeblich etwas unberuehrt');
}

// ─── 3. Eine v1-Datei ist keine Aenderung ──────────────────────────────────
//
// ADR-005, Regel 2: eine Projektion darf nicht ueberschreiben. Die Datei ohne
// `deviceTypeId` sagt zu diesem Feld NICHTS — nach dem Zusammenfuehren steht
// der Datensatz unveraendert da, und genau so muss ihn die Vorschau melden.
{
  const vorhanden = [satz('a', 'Source Four', { deviceTypeId: 'guid-1', manufacturer: 'ETC' })];
  const v1 = [satz('a', 'Source Four')];

  const m = sortenVorschau(vorhanden, v1, 'merge');
  assert.deepEqual(m.gleich, ['a'], 'die v1-Datei wird als Aenderung gemeldet');
  assert.deepEqual(m.geaendert, [], 'die v1-Datei wird als Aenderung gemeldet');

  // Im Modus `replace` IST sie eine Aenderung — dort loescht sie die
  // Typ-Identitaet wirklich, und die Vorschau muss das zeigen statt zu
  // beruhigen.
  const r = sortenVorschau(vorhanden, v1, 'replace');
  assert.deepEqual(r.geaendert, ['a'], 'ersetzen verschweigt den Verlust der Typ-Identitaet');
}

// ─── 4. Feldweise, nicht als Zeichenkette ──────────────────────────────────
{
  const vorhanden = [{ id: 'a', model: 'X', manufacturer: 'ETC' }];
  // Dieselben Werte, andere Reihenfolge im Objekt-Literal.
  const gedreht = [{ manufacturer: 'ETC', model: 'X', id: 'a' }];

  assert.deepEqual(
    sortenVorschau(vorhanden, gedreht, 'replace').gleich,
    ['a'],
    'die Feld-Reihenfolge entscheidet ueber "geaendert"',
  );

  // `undefined` heisst „Feld nicht da" — nicht „Feld auf undefined gesetzt".
  const explizit = [{ id: 'a', model: 'X', manufacturer: 'ETC', deviceTypeId: undefined }];
  assert.deepEqual(
    sortenVorschau(vorhanden, explizit, 'replace').gleich,
    ['a'],
    'ein explizit undefiniertes Feld gilt als Inhalt',
  );

  // Aber ein echter Unterschied bleibt einer.
  assert.deepEqual(
    sortenVorschau(vorhanden, [{ id: 'a', model: 'Y', manufacturer: 'ETC' }], 'replace').geaendert,
    ['a'],
    'ein echter Unterschied faellt durch',
  );
}

// ─── 5. Alle vier Sorten ───────────────────────────────────────────────────
//
// Der Import bringt Artikel, Lagerorte, Sets und Einheiten in einer Datei —
// und `replace` loescht alle vier. Eine Vorschau, die nur die Artikel zaehlt,
// zeigt beim gefaehrlichsten Fall die kleinste Zahl.
{
  const voll = {
    items: [satz('i1', 'A'), satz('i2', 'B')],
    nodes: [satz('n1', 'Regal')],
    sets: [satz('s1', 'Set')],
    units: [satz('u1', 'Einheit')],
  };
  const leer = { items: [], nodes: [], sets: [], units: [] };

  const v = importVorschau(voll, leer, 'replace');
  for (const sorte of VORSCHAU_SORTEN) {
    assert.ok(v[sorte].entfernt.length > 0, `Sorte "${sorte}" wird bei "ersetzen" verschwiegen`);
  }
  assert.equal(vorschauSumme(v).entfernt, 5, 'die Summe zaehlt nicht alle vier Sorten');

  // Eine Datei, die eine Sorte gar nicht mitbringt, ist im Modus `merge`
  // kein Grund, sie anzufassen.
  const nurArtikel = importVorschau(voll, { items: [satz('i3', 'C')] }, 'merge');
  assert.deepEqual(nurArtikel.items.neu, ['i3']);
  assert.deepEqual(nurArtikel.nodes, {
    neu: [],
    geaendert: [],
    gleich: [],
    entfernt: [],
    unberuehrt: ['n1'],
  });
}

// ─── 6. „Nichts zu tun" ist eine Antwort ───────────────────────────────────
{
  const bestand = {
    items: [satz('i1', 'A')],
    nodes: [satz('n1', 'Regal')],
    sets: [],
    units: [],
  };

  // Dieselbe Datei nochmal: zwei Datensaetze kommen an, keiner aendert etwas.
  const nochmal = importVorschau(bestand, bestand, 'merge');
  assert.equal(vorschauSumme(nochmal).gleich, 2, 'die unveraenderten Datensaetze fehlen in der Summe');
  assert.ok(vorschauIstLeer(nochmal), '"gleich" wird als Arbeit gezaehlt');

  // Und eine leere Datei im Modus `merge` erst recht: sie laesst alles stehen.
  const garnichts = importVorschau(bestand, {}, 'merge');
  assert.equal(vorschauSumme(garnichts).unberuehrt, 2);
  assert.ok(vorschauIstLeer(garnichts), '"unberuehrt" wird als Arbeit gezaehlt');

  // Ein einziger neuer Datensatz macht daraus einen Import.
  const einer = importVorschau(bestand, { items: [satz('i2', 'B')] }, 'merge');
  assert.ok(!vorschauIstLeer(einer), 'ein neuer Datensatz gilt als "nichts zu tun"');

  // Und im Modus `replace` ist eine leere Datei alles andere als leer.
  const alles = importVorschau(bestand, {}, 'replace');
  assert.ok(!vorschauIstLeer(alles), 'eine leere Datei loescht den Bestand und gilt als "nichts zu tun"');
  assert.equal(vorschauSumme(alles).entfernt, 2);
}

// ─── 7. Die Vorschau schreibt nichts ───────────────────────────────────────
//
// Sie laeuft, waehrend der Nutzer noch entscheidet. Wuerde sie ihre Eingaben
// anfassen, waere der Import beim Abbrechen halb passiert.
{
  // Mehr als ein Element, und BEWUSST nicht nach Id sortiert: mit einer
  // einelementigen Liste waere ein Umsortieren an Ort und Stelle nicht
  // messbar, und genau das ist bei der Gegenprobe herausgekommen — die
  // Zusicherung war gruen zu haben, ohne dass sie galt.
  const vorhanden = [satz('c', 'C', { manufacturer: 'ETC' }), satz('a', 'A'), satz('b', 'B')];
  const eingehend = [satz('b', 'B neu'), satz('a', 'A')];
  const vorherKopie = JSON.parse(JSON.stringify(vorhanden)) as Satz[];
  const eingehendKopie = JSON.parse(JSON.stringify(eingehend)) as Satz[];

  sortenVorschau(vorhanden, eingehend, 'merge');
  sortenVorschau(vorhanden, eingehend, 'replace');

  assert.deepEqual(vorhanden, vorherKopie, 'die Vorschau hat den Bestand veraendert');
  assert.deepEqual(eingehend, eingehendKopie, 'die Vorschau hat die eingehende Datei veraendert');
}

// ─── 8. Der Weg ist verdrahtet ─────────────────────────────────────────────
//
// Kommentare fallen vorher weg: dieser Guard darf nicht von Prosa
// zufriedenzustellen sein, die den alten Aufruf bloss ERWAEHNT — der Kopf
// dieser Datei zitiert ihn selbst.
{
  const roh = lies('../src/inventory/InventoryDialog.tsx');
  const dialog = roh
    .split('\n')
    .filter((z) => !/^\s*(\/\/|\*|\/\*)/.test(z))
    .join('\n');

  assert.ok(
    !/window\.confirm/.test(dialog),
    'der Import fragt weiter per window.confirm — ohne Zahlen und ohne Abbruch',
  );
  assert.match(dialog, /importVorschau\(/, 'der Dialog rechnet keine Vorschau');
  assert.match(dialog, /vorschauSumme\(/, 'die Vorschau nennt keine Zahlen');

  // Drei Ausgaenge, und der dritte ist der, den es vorher nicht gab.
  //
  // Als blosses `/setPending\(null\)/` war diese Zeile unverdient: dieselbe
  // Anweisung steht in `doImportConfirm`, das `pending` nach dem Schreiben
  // leert. Wer den Abbruch-Knopf entfernte, blieb gruen. Geprueft wird der
  // KLICK-HANDLER — und zwar der, nicht seine Aufschrift: die vendorte
  // Suite-Kopie beschriftet ihn ueber `t()`, und ein Waechter, der an einer
  // richtigen Aenderung rot wird, wird geaendert statt gelesen.
  assert.match(
    dialog,
    /onClick=\{\(\) => setPending\(null\)\}/,
    'es gibt keinen Weg, den Import abzubrechen',
  );
  assert.match(
    dialog,
    /onClick=\{doImportConfirm\}/,
    'der Importieren-Knopf loest den Import nicht aus',
  );
  // Beide Modi werden AUFGEZAEHLT. Faellt einer weg, ist die Wahl keine mehr.
  assert.match(
    dialog,
    /\(\['merge', 'replace'\] as ImportMode\[\]\)\.map/,
    'der Modus-Schalter bietet nicht beide Antworten',
  );
  // Mit SCHLIESSENDEM Anfuehrungszeichen. Ohne es war diese Zeile von
  // `inventory.previewMergeHint` zu haben — der Erklaertext neben dem
  // Schalter haette den Schalter selbst ersetzt, und die Gegenprobe „der
  // Modus-Schalter fehlt" kam gruen zurueck.
  for (const [key, klage] of [
    ['inventory.previewCancel', 'der Abbruch hat keine Beschriftung'],
    ['inventory.previewMerge', 'die Antwort "zusammenfuehren" hat keine Beschriftung'],
    ['inventory.previewReplace', 'die Antwort "ersetzen" hat keine Beschriftung'],
  ] as [string, string][]) {
    assert.ok(dialog.includes(`'${key}'`), klage);
  }

  // Importiert wird der Modus, den die gezeigte Vorschau gerechnet hat.
  assert.match(
    dialog,
    /importSnapshot\(pending\.snap, pending\.mode\)/,
    'importiert wird nicht der Modus, den die Vorschau gezeigt hat',
  );

  // Die EN-Seite: eine Beschriftung, die nur auf Deutsch existiert, ist im
  // englischen Betrieb ein Schluessel-Name auf einem Knopf.
  //
  // GELESEN WIRD DER GANZE ORDNER, nicht `index.ts`. Hier stand der einzelne
  // Dateipfad, und upstream stimmt er — aber die vendorte Suite-Kopie teilt
  // dasselbe Woerterbuch auf `src/i18n/en/*.ts` auf. Dieser Guard wird
  // mitvendoriert; ein mitvendorierter Guard, der in der Kopie an einer
  // richtigen Struktur scheitert, wird dort geloescht statt gelesen.
  const en = i18nQuellen('../src/i18n');
  for (const key of [
    'inventory.previewTitle',
    'inventory.previewCancel',
    'inventory.previewMerge',
    'inventory.previewReplace',
    'inventory.previewNothing',
    'inventory.previewRemoves',
  ]) {
    assert.ok(en.includes(`'${key}'`), `EN-Uebersetzung fehlt: ${key}`);
  }

  const pkg = JSON.parse(lies('../package.json')) as { scripts?: Record<string, string> };
  assert.ok(pkg.scripts?.['preview:check'], 'preview:check fehlt in package.json');
}

console.log('OK inventory-import-preview-check: der Import zeigt vorher, was er tut — und laesst sich abbrechen.');
