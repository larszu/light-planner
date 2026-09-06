// ───────────────────────────────────────────────────────────────────────────
// Der Rückweg: den Patch des Pults einlesen und gegen den Plan halten
// (Bedarf 137, P4).
//
//   > Nothing flows back. The console show file holds the only accurate
//   > record after load-in; the plot on the designer's laptop still shows
//   > three-week-old intent.
//
// Belegt an der Nicht-Ziel-Liste von MVR-xchange selbst — „no real-time, live
// change synchronisation", „no mandatory import rules (no single source of
// truth)", „no offline updates for tardy or departing stations"
// (`mvrdevelopment/spec`, user story MVR-xchange) — und daran, dass der
// einzige Weg aus einer ETC-Eos-Show-Datei heraus eine Community-Bibliothek
// ist, die ausdrücklich „not official ETC software" heißt.
//
// Die Bedarfs-Datenbank nennt das die größte Lücke der ganzen Rolle, vom
// Hersteller eingestanden und von niemandem gefüllt: „Even a one-way 'import
// console patch and diff against my plan' is unmatched."
//
// ─── EINBAHNSTRASSE, MIT ABSICHT ───────────────────────────────────────────
//
// Dieses Modul SCHREIBT NICHTS in den Plan. Es liest, was das Pult ausgibt,
// und legt es neben den Plan — als Liste, die jemand durchgeht. Ein
// automatisches Übernehmen wäre die zweite Hälfte des Problems: der Plan
// trägt die Absicht (wo eine Leuchte hängen soll, wofür sie da ist), das Pult
// trägt den Zustand nach dem Aufbau. Wer das eine still über das andere
// schreibt, verliert eines von beiden — genau die Klage aus `showstack#38`
// („NO WAY to reconcile differences -> data loss or manual re-entry").
//
// ─── DIE ENGSTELLE: DIE KANALNUMMER ────────────────────────────────────────
//
// Plan und Pult teilen genau eine Identität: die Kanalnummer. Nicht die id
// (die kennt das Pult nicht), nicht die Position (die kennt es auch nicht),
// nicht der Typ (den schreibt jedes Haus anders).
//
// Und sie ist NICHT eindeutig: mehrere Leuchten dürfen auf einem Kanal
// liegen — das ist im Licht der Normalfall, nicht die Ausnahme. Deshalb wird
// hier gruppiert und nicht zugeordnet: wo auf einer Seite mehrere Zeilen auf
// demselben Kanal stehen, gibt es KEINEN Vergleich, sondern eine benannte
// Auskunft („Kanal 12: 3 Leuchten im Plan, 1 Zeile am Pult"). Ein Vergleich,
// der sich in so einem Fall eine Zeile aussucht, behauptet eine Abweichung,
// die es vielleicht gar nicht gibt.
//
// REIN: keine Datei, kein Netz, keine Uhr.
// ───────────────────────────────────────────────────────────────────────────

import type { PlacedFixture } from '../types';
import type { FieldChange } from './diff';

const UNIVERSE_SIZE = 512;

// ─── Einlesen ──────────────────────────────────────────────────────────────

/** Eine Zeile, wie das Pult sie ausgegeben hat. */
export interface ConsoleRow {
  /** Kanalnummer. Fehlt sie, lässt sich die Zeile nicht zuordnen. */
  channel?: number;
  universe?: number;
  address?: number;
  /** Beschriftung am Pult. */
  label?: string;
  /** Gerätetyp, so wie das Pult ihn schreibt. */
  type?: string;
  /** Zeilennummer in der Datei — damit eine Meldung auffindbar ist. */
  line: number;
}

export type PatchColumn = 'channel' | 'address' | 'label' | 'type';

export interface ColumnMapping {
  column: PatchColumn;
  /** Die Überschrift, wie sie in der Datei stand. */
  header: string;
  index: number;
}

export interface PatchWarning {
  /** 0 = Kopfzeile. */
  line: number;
  message: string;
}

export interface ConsolePatchParse {
  rows: ConsoleRow[];
  /** Welche Spalte wofür gelesen wurde. Steht auf dem Blatt. */
  mapping: ColumnMapping[];
  /** Überschriften, zu denen es keine Bedeutung gibt — nicht stillschweigend geschluckt. */
  ignored: string[];
  /** Welches Trennzeichen erkannt wurde. */
  delimiter: string;
  warnings: PatchWarning[];
}

/**
 * Überschriften, die dieselbe Bedeutung tragen.
 *
 * Verglichen wird NORMALISIERT (Kleinschreibung, alles außer Buchstaben und
 * Ziffern weg). „Fixture Type", „fixture_type" und „FIXTURETYPE" sind
 * dieselbe Spalte — Bedarf 144 beschreibt genau diese Klasse von stillen
 * Fehlschlägen („one undefined or corrupted character in a data field can
 * invalidate the whole exchange").
 */
const HEADER_SYNONYMS: Readonly<Record<PatchColumn, readonly string[]>> = {
  channel: ['channel', 'chan', 'ch', 'kanal', 'kan'],
  address: ['address', 'addr', 'adresse', 'dmx', 'dmxaddress', 'patch', 'startaddress'],
  label: ['label', 'name', 'bezeichnung', 'beschriftung', 'text'],
  type: ['type', 'fixturetype', 'fixture', 'typ', 'geraetetyp', 'gerätetyp', 'instrumenttype', 'instrument'],
};

/** Kleinschreibung, nur Buchstaben und Ziffern. */
const normHeader = (s: string): string => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

/** Für den Vergleich von Typ und Beschriftung: dasselbe, aber mit Leerzeichen. */
export const normText = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();

/**
 * Das Trennzeichen der Datei.
 *
 * Geraten wird nicht: gezählt wird, welches Zeichen in der KOPFZEILE am
 * häufigsten vorkommt. Kommt keines vor, ist die Datei einspaltig und damit
 * kein Patch — das meldet der Aufrufer, statt eine Spalte zu erfinden.
 */
const detectDelimiter = (headerLine: string): string | null => {
  const kandidaten = [';', ',', '\t'];
  let best: string | null = null;
  let max = 0;
  for (const d of kandidaten) {
    const n = headerLine.split(d).length - 1;
    if (n > max) { max = n; best = d; }
  }
  return best;
};

/**
 * Eine Zeile in Felder zerlegen, mit Anführungszeichen nach CSV-Regel.
 *
 * DAS ABSCHLIESSENDE `trim()` IST NICHT KOSMETIK. Es fängt die Byte-Order-Mark
 * ab, die Excel vor die erste Überschrift schreibt — `String.trim()` zählt
 * U+FEFF zum Weissraum. Ohne das läse die erste Spalte „<BOM>Channel", und was
 * an Meldungen herauskommt („nicht gedeutet: <BOM>Gobo") trüge ein
 * unsichtbares Zeichen. Wer hier auf ein eigenes Trimmen umstellt, muss die
 * BOM ausdrücklich mitnehmen; `scripts/console-patch-check.ts` hält es fest.
 */
const splitLine = (line: string, delimiter: string): string[] => {
  const felder: string[] = [];
  let aktuell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { aktuell += '"'; i += 1; } else { inQuotes = false; }
      } else { aktuell += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      felder.push(aktuell); aktuell = '';
    } else {
      aktuell += c;
    }
  }
  felder.push(aktuell);
  return felder.map((f) => f.trim());
};

/**
 * Eine Adresse, wie Pulte sie schreiben.
 *
 * `1/25` heißt Universe 1, Adresse 25. Eine nackte Zahl ist die ABSOLUTE
 * Adresse (Eos schreibt sie so, wenn kein Universe eingestellt ist): 600 ist
 * Universe 2, Adresse 88. Beides ist festgelegt und wird nicht geraten; was
 * keiner der beiden Formen entspricht, ergibt `null` und eine Warnung — nicht
 * die Adresse 0, die es nicht gibt.
 */
export function parseAddress(text: string): { universe: number; address: number } | null {
  const s = text.trim();
  if (!s) return null;
  const geteilt = /^(\d+)\s*[/.]\s*(\d+)$/.exec(s);
  if (geteilt) {
    const universe = Number(geteilt[1]);
    const address = Number(geteilt[2]);
    if (universe < 1 || address < 1 || address > UNIVERSE_SIZE) return null;
    return { universe, address };
  }
  if (!/^\d+$/.test(s)) return null;
  const absolut = Number(s);
  if (absolut < 1) return null;
  return {
    universe: Math.floor((absolut - 1) / UNIVERSE_SIZE) + 1,
    address: ((absolut - 1) % UNIVERSE_SIZE) + 1,
  };
}

/**
 * Liest den Patch-Export eines Pults (CSV oder Tab-getrennt, mit Kopfzeile).
 *
 * Toleranz mit Ansage: unbekannte Spalten werden benannt statt geschluckt,
 * unlesbare Felder ergeben eine Warnung mit Zeilennummer statt einer Null.
 */
export function parseConsolePatch(text: string): ConsolePatchParse {
  const warnings: PatchWarning[] = [];
  // Hier stand einmal ein eigenes Entfernen der Byte-Order-Mark. Es war
  // WIRKUNGSLOS: `splitLine` trimmt jedes Feld, und `String.trim()` zählt
  // U+FEFF zum Weissraum. Eine Zeile, die nichts tut, aber aussieht, als
  // hielte sie eine Zusicherung, ist schlimmer als keine — der Nächste
  // verlässt sich darauf. Was die BOM wirklich abfängt, steht in `splitLine`
  // und wird dort geprüft.
  const zeilen = text.split(/\r?\n/);
  const kopfIndex = zeilen.findIndex((z) => z.trim().length > 0);
  if (kopfIndex < 0) {
    return { rows: [], mapping: [], ignored: [], delimiter: '', warnings: [{ line: 0, message: 'Die Datei ist leer.' }] };
  }

  const delimiter = detectDelimiter(zeilen[kopfIndex]);
  if (!delimiter) {
    return {
      rows: [], mapping: [], ignored: [], delimiter: '',
      warnings: [{ line: kopfIndex + 1, message: 'Kein Trennzeichen gefunden — das sieht nicht nach einem Patch-Export aus.' }],
    };
  }

  const kopf = splitLine(zeilen[kopfIndex], delimiter);
  const mapping: ColumnMapping[] = [];
  const ignored: string[] = [];
  const belegt = new Set<PatchColumn>();
  kopf.forEach((h, index) => {
    const n = normHeader(h);
    const treffer = (Object.keys(HEADER_SYNONYMS) as PatchColumn[])
      .find((c) => HEADER_SYNONYMS[c].includes(n));
    if (!treffer) { if (h) ignored.push(h); return; }
    if (belegt.has(treffer)) {
      // Zwei Spalten mit derselben Bedeutung: die zweite wird NICHT still
      // genommen. Welche gemeint ist, weiß nur der Mensch.
      warnings.push({ line: kopfIndex + 1, message: `Zweite Spalte "${h}" mit derselben Bedeutung — es gilt die erste.` });
      ignored.push(h);
      return;
    }
    belegt.add(treffer);
    mapping.push({ column: treffer, header: h, index });
  });

  if (!belegt.has('channel')) {
    warnings.push({ line: kopfIndex + 1, message: 'Keine Kanal-Spalte gefunden. Ohne Kanalnummer lässt sich nichts zuordnen.' });
  }

  const spalte = (m: ColumnMapping[], c: PatchColumn): number | undefined =>
    m.find((x) => x.column === c)?.index;
  const iChannel = spalte(mapping, 'channel');
  const iAddress = spalte(mapping, 'address');
  const iLabel = spalte(mapping, 'label');
  const iType = spalte(mapping, 'type');

  const rows: ConsoleRow[] = [];
  for (let i = kopfIndex + 1; i < zeilen.length; i += 1) {
    const roh = zeilen[i];
    if (!roh.trim()) continue;
    const felder = splitLine(roh, delimiter);
    const line = i + 1;
    const row: ConsoleRow = { line };

    if (iChannel !== undefined) {
      const s = (felder[iChannel] ?? '').trim();
      if (s) {
        if (/^\d+$/.test(s)) row.channel = Number(s);
        else warnings.push({ line, message: `Kanal "${s}" ist keine Zahl — die Zeile bleibt unzugeordnet.` });
      }
    }
    if (iAddress !== undefined) {
      const s = (felder[iAddress] ?? '').trim();
      if (s) {
        const a = parseAddress(s);
        if (a) { row.universe = a.universe; row.address = a.address; }
        else warnings.push({ line, message: `Adresse "${s}" ist weder "1/25" noch eine Zahl — nicht gelesen.` });
      }
    }
    if (iLabel !== undefined) { const s = (felder[iLabel] ?? '').trim(); if (s) row.label = s; }
    if (iType !== undefined) { const s = (felder[iType] ?? '').trim(); if (s) row.type = s; }

    rows.push(row);
  }

  return { rows, mapping, ignored, delimiter, warnings };
}

// ─── Vergleichen ───────────────────────────────────────────────────────────

export type ReturnKind =
  /** Auf beiden Seiten, und es gibt Unterschiede. */
  | 'changed'
  /** Auf beiden Seiten und gleich — der Normalfall, wird gezählt statt gelistet. */
  | 'unchanged'
  /** Steht nur am Pult: auf der Fläche dazugekommen. */
  | 'only-in-console'
  /** Steht nur im Plan: nie gepatcht oder wieder ausgebaut. */
  | 'only-in-plan'
  /** Auf einer Seite liegen mehrere Einträge auf diesem Kanal — kein Vergleich. */
  | 'ambiguous-channel'
  /** Ohne Kanalnummer: nicht zuzuordnen, aber auch nicht zu verschweigen. */
  | 'no-channel';

export const RETURN_KIND_LABEL: Readonly<Record<ReturnKind, string>> = {
  changed: 'geändert',
  unchanged: 'unverändert',
  'only-in-console': 'nur am Pult',
  'only-in-plan': 'nur im Plan',
  'ambiguous-channel': 'Kanal mehrfach belegt',
  'no-channel': 'ohne Kanalnummer',
};

/** Was auf dem Blatt steht, wo eine Seite nichts hat. */
export const NOT_PATCHED = 'nicht gepatcht';
export const NO_LABEL = 'ohne Beschriftung';
export const NOT_COMPARED = 'nicht verglichen';

export interface PatchReturnEntry {
  kind: ReturnKind;
  channel?: number;
  /** Wie die Zeile heißt — Plan-Name, sonst Pult-Beschriftung. */
  label: string;
  /**
   * Die Unterschiede, in derselben Form wie der Versions-Vergleich
   * (`core/diff.ts`) sie liefert: Feld, vorher, nachher. „Vorher" ist hier
   * IMMER der Plan und „nachher" das Pult — die Richtung steht auf dem Blatt,
   * damit niemand sie sich zusammenreimt.
   */
  differences: FieldChange[];
  /** Die Zeile in der Pult-Datei, falls es eine gibt. */
  line?: number;
}

export interface PatchReturn {
  entries: PatchReturnEntry[];
  /** Wie viele Kanäle wirklich verglichen wurden. */
  compared: number;
  counts: Record<ReturnKind, number>;
}

const adresse = (universe?: number, address?: number): string =>
  address === undefined ? NOT_PATCHED : `${universe ?? 1}/${address}`;

const planLabel = (f: PlacedFixture): string =>
  f.purpose?.trim() || f.unitNumber?.trim() || f.fixture.name;

/**
 * Der Vergleich: Plan gegen Pult, gruppiert über die Kanalnummer.
 *
 * `compareType` und `compareLabel` hängen daran, ob das Pult die Spalte
 * überhaupt geliefert hat. Fehlt sie, wird der Typ NICHT verglichen — sonst
 * meldete das Blatt jede Leuchte als „umgetauscht", nur weil die Datei die
 * Spalte nicht hatte. Was nicht verglichen wurde, steht als
 * `NOT_COMPARED` auf dem Blatt und nicht als „gleich".
 */
export function patchReturn(
  fixtures: readonly PlacedFixture[],
  parse: ConsolePatchParse,
): PatchReturn {
  const hatTyp = parse.mapping.some((m) => m.column === 'type');
  const hatLabel = parse.mapping.some((m) => m.column === 'label');
  const hatAdresse = parse.mapping.some((m) => m.column === 'address');

  const entries: PatchReturnEntry[] = [];
  const counts: Record<ReturnKind, number> = {
    changed: 0, unchanged: 0, 'only-in-console': 0, 'only-in-plan': 0,
    'ambiguous-channel': 0, 'no-channel': 0,
  };
  const zaehle = (e: PatchReturnEntry) => { counts[e.kind] += 1; entries.push(e); };

  const planNachKanal = new Map<number, PlacedFixture[]>();
  for (const f of fixtures) {
    if (f.channel === undefined) {
      zaehle({ kind: 'no-channel', label: planLabel(f), differences: [] });
      continue;
    }
    const liste = planNachKanal.get(f.channel) ?? [];
    liste.push(f);
    planNachKanal.set(f.channel, liste);
  }

  const pultNachKanal = new Map<number, ConsoleRow[]>();
  for (const r of parse.rows) {
    if (r.channel === undefined) {
      zaehle({
        kind: 'no-channel',
        label: r.label ?? NO_LABEL,
        differences: [],
        line: r.line,
      });
      continue;
    }
    const liste = pultNachKanal.get(r.channel) ?? [];
    liste.push(r);
    pultNachKanal.set(r.channel, liste);
  }

  let compared = 0;
  const kanaele = [...new Set([...planNachKanal.keys(), ...pultNachKanal.keys()])].sort((a, b) => a - b);

  for (const kanal of kanaele) {
    const imPlan = planNachKanal.get(kanal) ?? [];
    const amPult = pultNachKanal.get(kanal) ?? [];

    if (imPlan.length === 0) {
      for (const r of amPult) {
        zaehle({
          kind: 'only-in-console',
          channel: kanal,
          label: r.label ?? NO_LABEL,
          line: r.line,
          differences: [
            { field: 'Adresse', from: NOT_PATCHED, to: adresse(r.universe, r.address) },
            { field: 'Typ', from: NOT_PATCHED, to: r.type ?? NOT_COMPARED },
          ],
        });
      }
      continue;
    }
    if (amPult.length === 0) {
      for (const f of imPlan) {
        zaehle({
          kind: 'only-in-plan',
          channel: kanal,
          label: planLabel(f),
          differences: [
            { field: 'Adresse', from: adresse(f.universe, f.dmxAddress), to: NOT_PATCHED },
            { field: 'Typ', from: f.fixture.name, to: NOT_PATCHED },
          ],
        });
      }
      continue;
    }
    if (imPlan.length > 1 || amPult.length > 1) {
      // KEIN Vergleich. Mehrere Leuchten auf einem Kanal sind im Licht
      // normal; welche zu welcher Pult-Zeile gehoert, sagt die Kanalnummer
      // gerade nicht. Wer hier eine aussucht, erfindet eine Abweichung.
      zaehle({
        kind: 'ambiguous-channel',
        channel: kanal,
        label: `Kanal ${kanal}`,
        differences: [
          { field: 'Einträge', from: `${imPlan.length} im Plan`, to: `${amPult.length} am Pult` },
        ],
      });
      continue;
    }

    const f = imPlan[0];
    const r = amPult[0];
    compared += 1;
    const differences: FieldChange[] = [];

    if (hatAdresse) {
      const von = adresse(f.universe, f.dmxAddress);
      const nach = adresse(r.universe, r.address);
      if (von !== nach) differences.push({ field: 'Adresse', from: von, to: nach });
    }
    if (hatTyp && r.type) {
      if (normText(r.type) !== normText(f.fixture.name)
        && normText(r.type) !== normText(`${f.fixture.manufacturer} ${f.fixture.name}`)) {
        differences.push({ field: 'Typ', from: f.fixture.name, to: r.type });
      }
    }
    if (hatLabel && r.label) {
      const von = planLabel(f);
      if (normText(r.label) !== normText(von)) {
        differences.push({ field: 'Beschriftung', from: von, to: r.label });
      }
    }

    zaehle({
      kind: differences.length ? 'changed' : 'unchanged',
      channel: kanal,
      label: planLabel(f),
      line: r.line,
      differences,
    });
  }

  return { entries, compared, counts };
}

/**
 * Das Blatt: nur, was jemanden angeht.
 *
 * `unchanged` fliegt raus — es sind im Regelfall die meisten Zeilen, und eine
 * Liste, in der die Abweichung zwischen hundert „passt" steht, wird nicht
 * gelesen. Die Zahl bleibt in `counts`, damit sichtbar ist, wie viel geprüft
 * wurde; das ist der Unterschied zwischen „nichts gefunden" und „nichts
 * angesehen".
 */
export const returnFindings = (r: PatchReturn): PatchReturnEntry[] =>
  r.entries.filter((e) => e.kind !== 'unchanged');

export const RETURN_HEADERS = ['Kanal', 'Was', 'Bezeichnung', 'Feld', 'Im Plan', 'Am Pult'] as const;

/** Der Rückweg als Tabelle — eine Zeile je Unterschied. */
export function returnTable(r: PatchReturn): { header: string[]; rows: (string | number)[][] } {
  const rows: (string | number)[][] = [];
  for (const e of returnFindings(r)) {
    const kanal = e.channel ?? '';
    if (e.differences.length === 0) {
      rows.push([kanal, RETURN_KIND_LABEL[e.kind], e.label, '', '', '']);
      continue;
    }
    for (const d of e.differences) {
      rows.push([kanal, RETURN_KIND_LABEL[e.kind], e.label, d.field, d.from, d.to]);
    }
  }
  return { header: [...RETURN_HEADERS], rows };
}
