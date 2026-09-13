import React, { useRef, useState } from 'react';
import type { FixtureGroup, PlacedFixture, Truss, Wall, Ceiling, WorkNote, WorkNoteTarget } from '../types';
import { computePower, fixtureCounts, footprint, footprintOrNull, trussLoads, circuitBreakdown, colorCounts, nearestTrussId } from '../core/patch';
import { documentFingerprint, stampForStand, type DocumentStamp } from '../core/documentStamp';
import { colorTable, gelCodes, inventoryTable, scheduleOrder, scheduleTable, tableToCsv, type DocumentTable } from '../core/documentTables';
import { tableToPdfBlob } from '../utils/pdfTable';
import {
  RETURN_KIND_LABEL, parseConsolePatch, patchReturn, returnFindings, returnTable,
  type PatchReturn,
} from '../core/consolePatch';
import { versionsFor } from '../utils/versionStore';
import { rigCheck, issueCounts } from '../core/rigCheck';
import {
  preflight, preflightTable, type PreflightVerdict,
} from '../core/preflight';
import {
  PROTOCOL_LABEL, UNIVERSE_HEADERS, artnetReading, readingsDiverge, sacnReading,
  universeReading, universeReadings, universeTable, type DmxProtocol,
} from '../core/universeIdentity';
import {
  CIRCUIT_HEADERS, PHASE_HEADERS, PHASE_LABEL, TEMPLATE_LABEL, circuitLabel, circuitTable,
  distributionFor, phaseTable, type PhaseTemplate,
} from '../core/powerDistribution';
import { fieldContext } from '../core/reportFields';
import {
  REPORTS, renderReport, reportGaps, reportTable, findReport,
} from '../core/reportEngine';
import {
  DROP_LABEL, FORMATS, TARGETS, buildConsoleFile, consoleFileName, exportPreflight,
  type ConsoleTarget,
} from '../core/consoleExport';
import {
  CABLE_HEADERS, KIND_LABEL, LENGTH_BASIS_NOTE, cableGaps, cableRuns, cableTable, cableTotals,
} from '../core/rigCables';
import { shopOrder, shopOrderGaps, shopOrderTable } from '../core/shopOrder';
import {
  FIT_BASIS_NOTE, LABEL_DEFS, PADDING_MM, STOCKS, findLabelDef, findStock, labelSheet,
} from '../core/labelSheet';
import { useInventoryStore } from '../inventory/store';
import { photometricReport, type EvalArea } from '../core/photometrics';
import { buildMvr } from '../core/mvrExport';
import {
  groupTable, mvrOmissions, resolveGroups, UNNAMED_GROUP, type OmissionKind,
} from '../core/fixtureGroups';
import { gdtfSpecNames } from '../core/mvrIdentity';
import { groupNotes, staleNotes } from '../core/workNotes';
import { gelLibrary } from '../core/gelLibrary';
import { getFixtureCCT, cctToRgb } from '../core/colorTemp';
import Icon from './Icon';
import type { IconName } from './Icon';
import { useTranslation, format } from '../i18n';

interface Props {
  fixtures: PlacedFixture[];
  trusses: Truss[];
  walls: Wall[];
  ceilings: Ceiling[];
  area: EvalArea | null;
  projectName: string;
  /** Fuer den Stempel: unter dieser Kennung liegen die festgeschriebenen Staende. */
  projectId: string;
  // ── Bedarf 147 — wie die Universe-Zahlen zu lesen sind ──
  /**
   * Das Protokoll, in dem die `universe`-Zahlen dieses Plans gemeint sind.
   * Es haengt am PROJEKT: die Zahl an der Leuchte war nie falsch, sie war
   * unbestimmt.
   */
  dmxProtocol: DmxProtocol;
  /** Umstellen. Der Wert lebt im Wirt und geht mit in die Datei. */
  onSetProtocol: (p: DmxProtocol) => void;
  // ── Bedarf 141 — Kreise, Phasen und Steckreihenfolge ──
  /**
   * Welche Phasen der Anschluss fuehrt, der dieses Rig speist. Ohne die
   * Angabe bliebe die Last je Phase die ausgeglichene Annahme.
   */
  phaseTemplate: PhaseTemplate;
  onSetPhaseTemplate: (p: PhaseTemplate) => void;
  conflicts: Set<string>;
  onAutoNumber: () => void;
  onAutoPatch: () => void;
  onLocate: (ids: string[]) => void;
  onUpdateFixture: (id: string, updates: Partial<PlacedFixture>) => void;
  // ── Bedarf 139 — Gruppen, die die Uebergabe ueberleben ──
  fixtureGroups: FixtureGroup[];
  /** Umbenennen. Die History haengt am Wirt, nicht hier. */
  onRenameGroup: (id: string, label: string) => void;
  // ── Bedarf 71 — Arbeits-Notizen aus der Probe ──
  workNotes: WorkNote[];
  /** Legt eine Notiz an. Id und Zeitpunkt kommen vom Wirt, nicht von hier. */
  onAddNote: (target: WorkNoteTarget, text: string) => void;
  onToggleNote: (id: string) => void;
  onRemoveNote: (id: string) => void;
  onClose: () => void;
}

type Tab = 'list' | 'magic' | 'focus' | 'notes' | 'papers' | 'check' | 'return' | 'photo' | 'load' | 'export';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'list', label: 'Geräteliste & Patch', icon: 'schedule' },
  { id: 'magic', label: 'Magic Sheet', icon: 'grid' },
  { id: 'focus', label: 'Fokus', icon: 'autolight' },
  { id: 'notes', label: 'Notizen', icon: 'tag' },
  { id: 'papers', label: 'Papiere', icon: 'schedule' },
  { id: 'check', label: 'Prüfung', icon: 'check' },
  { id: 'return', label: 'Rückweg vom Pult', icon: 'import' },
  { id: 'photo', label: 'Photometrie', icon: 'heatmap' },
  { id: 'load', label: 'Last & Strom', icon: 'truss' },
  { id: 'export', label: 'Export', icon: 'export' },
];

// Bedarf 139 — dasselbe Muster wie `tabLabel` darunter, aus demselben Grund:
// literale Schluessel, damit `i18n:check` sie sieht. Ein
// `t(\`sch.exp.omit.${kind}\`)` waere fuer den Guard unsichtbar, und die
// englische Fassung fehlte, ohne dass es jemand meldet.
// Bedarf 142 — literale Schluessel, damit `i18n:check` das Urteil sieht.
const verdictText = (t: (k: string, de: string) => string, v: PreflightVerdict): string => {
  switch (v) {
    case 'blocked': return t('sch.check.blocked', 'Not like this \u2014 at least one error');
    case 'unknown': return t('sch.check.unknown', 'Cannot be judged \u2014 figures are missing');
    case 'check': return t('sch.check.check', 'Look through');
    case 'ready': return t('sch.check.ready', 'Ready');
  }
};

const omissionNoun = (t: (k: string, de: string) => string, kind: OmissionKind): string => {
  switch (kind) {
    case 'trusses': return t('sch.exp.omit.trusses', 'truss(es)');
    case 'groups': return t('sch.exp.omit.groups', 'group(s)');
    case 'gels': return t('sch.exp.omit.gels', 'fixture(s) with gel');
    case 'purposes': return t('sch.exp.omit.purposes', 'fixture(s) with a purpose');
    case 'notes': return t('sch.exp.omit.notes', 'note(s)');
    case 'circuits': return t('sch.exp.omit.circuits', 'circuit(s)');
    case 'cables': return t('sch.exp.omit.cables', 'cable run(s)');
  }
};

// Literale Schluessel statt `t(\`tab.${id}\`)` -- der Guard `i18n:check` sieht
// nur literale Aufrufe, und ein dynamisch gebauter Schluessel faellt ihm
// durch (gemessen in light#66 an `tool.stage`, das deshalb deutsch im
// englischen Woerterbuch stand).
const tabLabel = (t: (k: string, de: string) => string, id: Tab): string => {
  switch (id) {
    case 'list': return t('sch.tab.list', 'Schedule & patch');
    case 'magic': return t('sch.tab.magic', 'Magic sheet');
    case 'focus': return t('sch.tab.focus', 'Focus');
    case 'check': return t('sch.tab.check', 'Check');
    case 'return': return t('sch.tab.return', 'Return from console');
    case 'photo': return t('sch.tab.photo', 'Photometry');
    case 'notes': return t('sch.tab.notes', 'Notes');
    case 'papers': return t('sch.tab.papers', 'Paperwork');
    case 'load': return t('sch.tab.load', 'Load & power');
    case 'export': return t('sch.tab.export', 'Export');
  }
};

const cssRgb = (rgb: [number, number, number]) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
// Representative swatch per gel family (the library has no per-gel RGB).
const gelSwatch = (type: string): string =>
  type === 'CTO' ? '#f0a35e' : type === 'CTB' ? '#7fb6f0'
    : (type === 'frost' || type === 'diffusion') ? '#e8ecf2' : '#9aa7b6';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
/** Fertiges CSV als Datei anbieten. Die BOM haengt an der DATEI, nicht am Dokument. */
function downloadCsv(filename: string, csv: string) {
  triggerDownload(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

const lx = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString());
const utilClass = (u: number) => (u >= 1 ? 'util-over' : u >= 0.8 ? 'util-warn' : 'util-ok');

// A focused multi-tool hub for paperwork, validation, analysis and interchange.
// Each tab is one job, so no single view is overloaded.
const ScheduleDialog: React.FC<Props> = ({ fixtures, trusses, walls, ceilings, area, projectName, projectId, dmxProtocol, onSetProtocol, phaseTemplate, onSetPhaseTemplate, conflicts, onAutoNumber, onAutoPatch, onLocate, onUpdateFixture, fixtureGroups, onRenameGroup, workNotes, onAddNote, onToggleNote, onRemoveNote, onClose }) => {
  const { t } = useTranslation();
  const [tab, setTabState] = useState<Tab>(() => {
    try { const saved = localStorage.getItem('lp-tool-tab'); if (saved && TABS.some((x) => x.id === saved)) return saved as Tab; } catch { /* ignore */ }
    return 'list';
  });
  const setTab = (t: Tab) => { setTabState(t); try { localStorage.setItem('lp-tool-tab', t); } catch { /* ignore */ } };

  // Bedarf 137: der eingelesene Patch lebt NUR hier. Er geht weder in den
  // Projekt-Zustand noch in eine Datei — sonst waere aus dem Nebeneinander
  // schon wieder ein Uebernehmen geworden.
  const patchFileRef = useRef<HTMLInputElement>(null);
  const [parseInfo, setParseInfo] = useState<ReturnType<typeof parseConsolePatch> | null>(null);
  const [rueckweg, setRueckweg] = useState<PatchReturn | null>(null);

  // BEDARF 71 — der Entwurf liegt lokal: waehrend der Probe wird getippt, und
  // jeder Tastendruck durch den Wirt zu schicken machte die Eingabe zaeh.
  const [noteDraft, setNoteDraft] = useState('');
  // Ziel der naechsten Notiz. Vorbelegt auf den ganzen Plan — das ist das
  // einzige Ziel, das es IMMER gibt; eine geratene Leuchte waere eine
  // Zuordnung, die niemand getroffen hat.
  const [noteTarget, setNoteTarget] = useState<WorkNoteTarget>({ kind: 'plan' });

  // BEDARF 143 — welches der Blaetter gerade offen ist. Lokal: die Wahl ist
  // eine Ansicht und keine Projekt-Angabe; sie in die Datei zu schreiben
  // hiesse, dass zwei Leute mit derselben Datei streiten, welches Blatt „das"
  // Blatt ist.
  const [reportId, setReportId] = useState<string>(REPORTS[0].id);

  // BEDARF 146 — an welches Pult die Datei geht. Auch das ist eine Ansicht
  // und keine Projekt-Angabe: dieselbe Show geht mal an ein Eos und mal an
  // etwas anderes.
  const [consoleTarget, setConsoleTarget] = useState<ConsoleTarget>('eos-lightwright');

  // BEDARF 148 — Bogen, Etikettenart und das erste freie Etikett. Alles drei
  // sind Ansichten und keine Projekt-Angaben: welcher Bogen im Drucker liegt,
  // ist eine Eigenschaft des Nachmittags und nicht der Show.
  const [stockId, setStockId] = useState<string>(STOCKS[0].id);
  const [labelDefId, setLabelDefId] = useState<string>(LABEL_DEFS[0].id);
  const [labelStart, setLabelStart] = useState<number>(1);

  const counts = fixtureCounts(fixtures);
  const power = computePower(fixtures);
  const totalWeight = fixtures.reduce((s, f) => s + (f.fixture.weight || 0), 0);
  // BEDARF 142 — der Vorflug-Bericht statt der blossen Rig-Pruefung. Er
  // enthaelt dieselben Befunde (`rigCheck` bleibt die Quelle) plus die
  // semantischen, und er faellt ein Urteil, das „nicht beurteilbar" kennt.
  // BEDARF 147 — das Protokoll geht MIT in die Pruefung. Ohne es liesse sich
  // nicht sagen, ob „Universe 40000" eine gueltige sACN-Zahl oder eine
  // unmoegliche Art-Net-Port-Address ist, und der Bericht schwiege zu beidem.
  const bericht = preflight(fixtures, trusses, dmxProtocol, phaseTemplate);
  const issues = bericht.issues;
  const ic = { errors: bericht.counts.error, warnings: bericht.counts.warning, infos: bericht.counts.info };
  const photo = photometricReport(fixtures, walls, ceilings, area);
  const loads = trussLoads(fixtures, trusses);
  const circuits = circuitBreakdown(fixtures);
  // BEDARF 141 — die Kreise auf Distros, Ausgaenge und Phasen, in
  // Steckreihenfolge. Beide Zahlen — die gerechnete und die angenommene —
  // kommen aus dieser einen Stelle, damit sie nicht zweimal verschieden
  // entstehen koennen.
  const verteilung = distributionFor(fixtures, phaseTemplate);
  const colors = colorCounts(fixtures);
  const checkBadge = ic.errors + ic.warnings;

  // BEDARF 147 — die Universes des Plans mit BEIDEN Lesarten. Eine Zeile je
  // Universe, sortiert nach der Zahl und nicht nach der Reihenfolge der
  // Leuchten: sonst saehe dasselbe Blatt zweimal anders aus.
  const lesarten = universeReadings(fixtures.map((f) => f.universe), dmxProtocol);

  // BEDARF 143 — der Zusammenhang fuer die Felder, EINMAL gebaut und nicht je
  // Zeile: `distributionFor` teilt den ganzen Bestand in Kreise auf, und wer
  // das je Zeile taete, bekaeme bei n Leuchten n Verteilungen.
  const feldKontext = fieldContext(fixtures, trusses, dmxProtocol, phaseTemplate);
  const bericht143 = renderReport(findReport(reportId) ?? REPORTS[0], fixtures, feldKontext);
  const luecken = reportGaps();

  // BEDARF 146 — was die Pult-Datei enthalten WIRD, und was nicht. Vor dem
  // Speichern, nicht danach: „rather than letting the user discover it at
  // load-in".
  const pultVorschau = exportPreflight(fixtures, consoleTarget);

  // BEDARF 145 — die Bestellung faellt aus dem Plan. Der Bestand kommt aus
  // dem projektuebergreifenden Lager, nicht aus dem Projekt: derselbe
  // Scheinwerfer steht dort einmal, egal in wie vielen Plaenen er vorkommt.
  const lagerBestand = useInventoryStore((st) => st.items);
  const bestellung = shopOrder(fixtures, lagerBestand);
  const bestellLuecken = shopOrderGaps(fixtures);

  // BEDARF 148 — der Etikettensatz. Die Felder kommen aus DEMSELBEN Katalog
  // wie die Blaetter (Bedarf 143): am Verteiler klebt dann dieselbe
  // Kreisnummer, die auf der Kreisliste steht.
  const bogen = findStock(stockId) ?? STOCKS[0];
  const etikettenArt = findLabelDef(labelDefId) ?? LABEL_DEFS[0];
  const etiketten = labelSheet(etikettenArt, fixtures, feldKontext, bogen, labelStart);

  const ordered = scheduleOrder(fixtures);
  const safe = (projectName || 'lichtplan').replace(/[^\w.-]+/g, '_');

  /**
   * Stempel fuer eine dieser Listen (ADR-004).
   *
   * Der Fingerabdruck laeuft ueber DEN INHALT DES DOKUMENTS, nicht ueber das
   * Projekt (Regel 1): eine verschobene Leuchte aendert keine Zeile der
   * Farbliste, und ein Hinweis, den alle wegklicken, ist schlimmer als keiner.
   *
   * Der Vergleichsstand kommt aus den Versions-Schnappschuessen — dieselbe
   * Tabellenfunktion, einmal ueber die aktuellen Leuchten und einmal ueber die
   * des Schnappschusses. Gibt es keinen Schnappschuss, nennt der Stempel keine
   * Revision und behauptet keine Abweichung (Regel 2): kein Bezugspunkt, keine
   * Aussage.
   */
  const stempel = (tabelle: (f: PlacedFixture[]) => DocumentTable): DocumentStamp => {
    const stand = versionsFor(projectId)[0];
    const fp = (t: DocumentTable) => documentFingerprint(t.header, t.rows);
    return stampForStand({
      project: projectName || 'Lichtplan',
      current: fp(tabelle(fixtures)),
      committed: stand ? { label: stand.label, fingerprint: fp(tabelle(stand.doc.fixtures ?? [])) } : undefined,
      now: new Date(),
    });
  };

  /** Eine Liste als CSV, mit Stempel-Fusszeile. */
  const exportTable = (dateiname: string, tabelle: (f: PlacedFixture[]) => DocumentTable) =>
    downloadCsv(dateiname, tableToCsv(tabelle(fixtures), stempel(tabelle)));

  // ─── DIESELBE LISTE, GESETZT ──────────────────────────────────────────────
  //
  // NUTZER-MELDUNG (#123): „Man muss Patchlisten und alle anderen, die man
  // aktuell nur als CSV exportieren kann, auch als schoen aufbereitete PDF
  // exportieren koennen."
  //
  // Sie geht durch DIESELBE Tabellen-Funktion und denselben Stempel wie die
  // CSV. Das ist die ganze Absicht: zwei Wege, die dieselbe Liste bauen,
  // waeren zwei Listen — und die eine, die jemand ausdruckt, waere irgendwann
  // nicht mehr die, die jemand auswertet.
  const exportTablePdf = (
    dateiname: string,
    titel: string,
    tabelle: (f: PlacedFixture[]) => DocumentTable,
    untertitel?: string,
  ) => {
    const tb = tabelle(fixtures);
    triggerDownload(
      tableToPdfBlob({ header: tb.header, rows: tb.rows }, {
        title: titel,
        subtitle: untertitel,
        stamp: stempel(tabelle),
      }),
      dateiname,
    );
  };

  const exportSchedule = () => exportTable('instrument-schedule.csv', scheduleTable);
  const exportInventory = () => exportTable('geraeteliste.csv', inventoryTable);
  const exportColors = () => exportTable('farbliste.csv', colorTable);
  // Bedarf 147 — das Universe-Blatt geht denselben Weg wie die anderen
  // Listen und traegt damit denselben Stempel (ADR-004): wer es ausdruckt und
  // ans Gateway mitnimmt, sieht, aus welchem Stand es stammt.
  // Bedarf 141 — die Kreis-Liste ist eines der zwoelf Blaetter aus Bedarf 143
  // und das erste, das ohne die Phasen-Zuordnung gar nicht schreibbar war.
  const exportCircuits = () => exportTable(
    'kreisliste.csv',
    (fs: PlacedFixture[]) => circuitTable(distributionFor(fs, phaseTemplate)),
  );

  // BEDARF 140 — die Kabelliste. Sie geht denselben Weg wie die anderen
  // Blaetter und traegt damit denselben Stempel (ADR-004): das Blatt, das am
  // Ladetag in der Kiste liegt, sagt, aus welchem Stand es stammt.
  const kabelWege = cableRuns(fixtures, trusses, phaseTemplate);
  const kabelSummen = cableTotals(kabelWege);
  const kabelLuecken = cableGaps(fixtures, kabelWege);
  const exportCables = () => exportTable(
    'kabelliste.csv',
    (fs: PlacedFixture[]) => cableTable(cableRuns(fs, trusses, phaseTemplate)),
  );

  // Bedarf 143 — jedes Blatt geht denselben Weg und traegt denselben Stempel.
  // Der Dateiname folgt der Blatt-Kennung, damit zwei Blaetter nicht dieselbe
  // Datei ueberschreiben.
  const exportReport = () => {
    const def = findReport(reportId) ?? REPORTS[0];
    exportTable(`${def.id}.csv`, (fs: PlacedFixture[]) => reportTable(
      renderReport(def, fs, fieldContext(fs, trusses, dmxProtocol, phaseTemplate)),
    ));
  };

  // Bedarf 146 — die Datei fuers Pult. KEIN `downloadCsv`: dort haengt eine
  // Byte-Order-Mark vorn, und die stuende in einer Datei, die ein Pult
  // feldweise liest, im ersten Spaltennamen.
  const exportConsole = () => {
    const text = buildConsoleFile(fixtures, consoleTarget, feldKontext);
    triggerDownload(
      new Blob([text], { type: 'text/plain;charset=utf-8;' }),
      consoleFileName(projectName, consoleTarget),
    );
  };

  // Bedarf 145 — die Bestellliste geht denselben Weg wie die anderen Blaetter
  // und traegt damit denselben Stempel (ADR-004): wer sie verschickt, sieht,
  // aus welchem Stand sie stammt.
  const exportShopOrder = () => exportTable(
    'bestellung.csv',
    (fs: PlacedFixture[]) => shopOrderTable(shopOrder(fs, lagerBestand)),
  );

  const exportUniverses = () => exportTable(
    'universes.csv',
    (fs: PlacedFixture[]) => universeTable(universeReadings(fs.map((f) => f.universe), dmxProtocol)),
  );

  const exportMvr = () => {
    // Bedarf 144: die Projekt-Kennung geht mit — sie ist der Namensraum der
    // MVR-Identitaeten. Ohne sie bekaemen zwei Projekte mit derselben
    // Leuchten-id dieselbe UUID, und wer beide in einen Visualisierer laedt,
    // sieht eine Leuchte statt zweier.
    const data = buildMvr(fixtures, trusses, projectName, projectId);
    triggerDownload(new Blob([data as BlobPart], { type: 'application/octet-stream' }), `${safe}.mvr`);
  };

  // Magic sheet: channels grouped by purpose (system), each a clickable chip
  // tinted by its effective colour temperature — at-a-glance "what is what".
  const ohneZweck = t('sch.noPurpose', 'No purpose');
  const groups = (() => {
    const m = new Map<string, PlacedFixture[]>();
    for (const f of fixtures) {
      // Der Sammelname ist zugleich Gruppen-Schluessel UND Sortier-Kriterium
      // unten. Beide muessen dieselbe Zeichenkette sehen, sonst rutscht die
      // Restgruppe in der englischen Fassung nach oben statt ans Ende.
      const key = (f.purpose && f.purpose.trim()) || ohneZweck;
      (m.get(key) ?? m.set(key, []).get(key)!).push(f);
    }
    return [...m.entries()]
      .map(([name, fs]) => ({ name, fs: fs.sort((a, b) => (a.channel ?? 1e9) - (b.channel ?? 1e9)) }))
      .sort((a, b) => (a.name === ohneZweck ? 1 : 0) - (b.name === ohneZweck ? 1 : 0) || a.name.localeCompare(b.name));
  })();

  // Focus session: group by hanging position (truss) — the order a focus call
  // actually works through the rig — and track per-fixture done + note.
  const focusGroups = (() => {
    const m = new Map<string, PlacedFixture[]>();
    const bodenStative = t('sch.floorStands', 'Floor / stands');
    for (const f of fixtures) {
      const tid = nearestTrussId(f, trusses);
      const key = tid ? (trusses.find((x) => x.id === tid)?.label || t('sch.truss', 'Truss')) : bodenStative;
      (m.get(key) ?? m.set(key, []).get(key)!).push(f);
    }
    return [...m.entries()]
      .map(([name, fs]) => ({ name, fs: fs.sort((a, b) => (a.channel ?? 1e9) - (b.channel ?? 1e9)) }))
      .sort((a, b) => (a.name === bodenStative ? 1 : 0) - (b.name === bodenStative ? 1 : 0) || a.name.localeCompare(b.name));
  })();
  const focusedCount = fixtures.filter((f) => f.focused).length;

  const activeLabel = tabLabel(t, tab);

  // ── BEDARF 139 — Gruppen ────────────────────────────────────────────────
  //
  // Aufgeloest EINMAL, hier: das Blatt, die Liste im Reiter und die
  // Auslassungs-Meldung im Export lesen dieselbe Aufloesung. Zwei Aufloesungen
  // waeren zwei Wahrheiten darueber, wer in einer Gruppe steckt.
  const trussLabelOf = (fixtureId: string): string | undefined => {
    const f = fixtures.find((x) => x.id === fixtureId);
    if (!f) return undefined;
    const tid = nearestTrussId(f, trusses);
    return tid ? (trusses.find((x) => x.id === tid)?.label || undefined) : undefined;
  };
  const gruppen = resolveGroups(fixtureGroups, fixtures, trussLabelOf);
  const auslassungen = mvrOmissions(fixtures, trusses, fixtureGroups, workNotes.length);

  // BEDARF 144 — zwei Typen, ein Dateiname. „Source/Four" und „Source:Four"
  // fielen beide auf `ETC_Source_Four.gdtf`, und der Importer bekam fuer zwei
  // Geraete denselben Bezug — ohne ein Wort. Sie bekommen jetzt eindeutige
  // Namen, und der Fall steht trotzdem da: wer seine GDTF-Bibliothek nach dem
  // Namen durchsucht, findet nur einen von beiden wieder.
  const specKollisionen = gdtfSpecNames(fixtures.map((f) => f.fixture)).collisions;

  const exportGroups = () => {
    const tb = groupTable(gruppen);
    downloadCsv('gruppen.csv', [tb.header, ...tb.rows]
      .map((r) => r.map((v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(';'))
      .join('\r\n'));
  };

  // ── per-tool panels ──
  const listPanel = (
    <>
      <div className="schedule-actions">
        <button className="btn-secondary" onClick={onAutoNumber}>① {t('sch.autoNumber', 'Auto-number')}</button>
        <button className="btn-secondary" onClick={onAutoPatch}>② {t('sch.autoPatch', 'Auto-patch (DMX)')}</button>
      </div>
      {/* BEDARF 139 — Gruppen bekommen einen Namen und ein Blatt. Bis hierher
          hiessen sie „Gruppe 3" und existierten nur auf der Zeichenflaeche;
          wer sie am Pult brauchte, baute sie von Hand nach. */}
      {gruppen.length > 0 && (
        <>
          <h4 className="schedule-subhead">
            {t('sch.groups', 'Groups')} ({gruppen.length})
            <button className="btn-secondary" style={{ marginLeft: 8 }} onClick={exportGroups}>
              <Icon name="export" size={12} /> {t('sch.groups.csv', 'Group sheet (CSV)')}
            </button>
          </h4>
          <table className="schedule-table">
            <thead>
              <tr>
                <th>{t('sch.groups.name', 'Name')}</th>
                <th>{t('sch.groups.members', 'Fixtures')}</th>
                <th>{t('sch.groups.channels', 'Channels')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {gruppen.map((g) => (
                <tr key={g.id}>
                  <td>
                    <input
                      value={g.label === UNNAMED_GROUP ? '' : g.label}
                      placeholder={t('sch.groups.namePh', 'Group name (e.g. \u201cFront warm\u201d)')}
                      onChange={(e) => onRenameGroup(g.id, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    {g.members.length}
                    {/* Ein verschwundenes Mitglied verschwindet nicht still:
                        eine Gruppe, die von acht auf sechs schrumpft, ohne
                        dass es jemand sagt, ist am Pult ein Raetsel. */}
                    {g.missing.length > 0 && (
                      <span className="rig-pill warn" style={{ marginLeft: 6 }}>
                        {g.missing.length} {t('sch.groups.missing', 'deleted')}
                      </span>
                    )}
                  </td>
                  <td>{g.members.map((m) => m.channel ?? '–').join(', ')}</td>
                  <td>
                    <button
                      className="btn-secondary"
                      onClick={() => onLocate(g.members.map((m) => m.fixtureId))}
                    >
                      {t('sch.groups.locate', 'Show in plan')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="prop-derived">
            {t('sch.groups.hint', 'The MVR format has no groups \u2014 this sheet is how they reach the console, the visualiser and the media server.')}
          </div>
        </>
      )}
      <h4 className="schedule-subhead">{t('sch.inventory', 'Inventory')} ({fixtures.length} {t('sch.fixtures', 'fixtures')}, {counts.length} {t('sch.types', 'types')})</h4>
      <table className="schedule-table">
        <thead><tr><th>{t('sch.qty', 'Qty')}</th><th>{t('sch.manufacturer', 'Manufacturer')}</th><th>{t('sch.type', 'Type')}</th><th>{t('sch.wEach', 'W/ea')}</th><th>{t('sch.wTotal', 'W total')}</th><th>{t('sch.kgTotal', 'kg total')}</th></tr></thead>
        <tbody>
          {counts.map((c) => (
            <tr key={c.manufacturer + c.name}>
              <td><strong>{c.count}</strong></td><td>{c.manufacturer}</td><td>{c.name}</td>
              <td>{c.watts}</td><td>{c.count * c.watts}</td><td>{(c.count * c.weight).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className="schedule-subhead">{t('sch.instrumentSchedule', 'Instrument schedule')}</h4>
      <table className="schedule-table">
        {/* BEDARF 147 — der Kopf nennt das Protokoll. „DMX 2.15" allein ist
            unbestimmt: in sACN ist das Universe 2, in Art-Net die
            Port-Address 0:0:2, und ab 16 laufen die beiden auseinander. */}
        <thead><tr><th>Unit</th><th>Ch</th><th>DMX ({PROTOCOL_LABEL[dmxProtocol]})</th><th>{t('sch.type', 'Type')}</th><th>{t('sch.pos', 'Pos (x,y,h)')}</th><th>Gel</th><th>{t('sch.purpose', 'Purpose')}</th></tr></thead>
        <tbody>
          {ordered.map((f) => (
            <tr key={f.id} className={conflicts.has(f.id) ? 'row-conflict' : ''}
              onClick={() => onLocate([f.id])} title={t('sch.locate', 'Show in the plan')}>
              <td>{f.unitNumber ?? '–'}</td>
              <td>{f.channel ?? '–'}</td>
              {/* Die Zelle zeigt die Zahl SO, wie sie im gewaehlten Protokoll
                  am Geraet steht — in Art-Net also „0:0:2.15" statt „2.15".
                  Wer sie abtippt, tippt damit das, was am Node steht. */}
              {/* Ohne Adresse steht hier der GRUND. „Dimmer" fuer eine
                  Leuchte, deren Modus nur nicht gewaehlt ist, waere die
                  Falschauskunft, die erst am Pult auffaellt: der Zettel sagt
                  „braucht keine Adresse", und im Rig fehlt das Geraet. */}
              <td>{f.universe != null && f.dmxAddress != null
                ? `${universeReading(f.universe, dmxProtocol).primary}.${f.dmxAddress}`
                : footprintOrNull(f) === null
                  ? t('sch.noMode', 'no mode')
                  : footprint(f) === 0 ? t('sch.dimmer', 'Dimmer') : '–'}</td>
              <td>{f.fixture.name}</td>
              <td>{f.x},{f.y} · {f.mountingHeight}m</td>
              <td>{gelCodes(f.gelFilterIds) || '–'}</td>
              <td>{f.purpose || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* ── BEDARF 147 — ein Universe ist keine blosse Zahl ──────────────
          Der Beleg (`mvrdevelopment/spec#94`) nennt die Verwechslung von
          Art-Net-Port-Address und sACN-Universe „the classic patch error".
          Beide Lesarten stehen hier NEBENEINANDER, auch die des nicht
          gewaehlten Protokolls: wer das Gateway einstellt, hat oft das andere
          vor sich, und der Sinn dieses Blattes ist, dass ihm der Unterschied
          auffaellt, bevor er ihn tippt. */}
      <h4 className="schedule-subhead">
        {t('sch.uni.head', 'Universes')} ({lesarten.length})
        {lesarten.length > 0 && (
          <button className="btn-secondary" style={{ marginLeft: 8 }} onClick={exportUniverses}>
            &#8595; {t('sch.uni.csv', 'Universe sheet (CSV)')}
          </button>
        )}
        {lesarten.length > 0 && (
          <button
            className="btn-secondary"
            style={{ marginLeft: 6 }}
            onClick={() => exportTablePdf(
              'universes.pdf',
              t('sch.uni.pdfTitle', 'Universe sheet'),
              (fs: PlacedFixture[]) => universeTable(universeReadings(fs.map((f) => f.universe), dmxProtocol)),
              projectName || undefined,
            )}
          >
            &#8595; {t('sch.uni.pdf', 'Universe sheet (PDF)')}
          </button>
        )}
      </h4>
      <div className="schedule-actions">
        <label>
          {t('sch.uni.protocol', 'The universe numbers in this plan are')}{' '}
          <select
            value={dmxProtocol}
            onChange={(e) => onSetProtocol(e.target.value as DmxProtocol)}
          >
            {/* Literale Optionen, keine Schleife ueber die Sprach-Schluessel:
                die Protokollnamen sind Eigennamen und werden nicht uebersetzt. */}
            <option value="sacn">{PROTOCOL_LABEL.sacn}</option>
            <option value="artnet">{PROTOCOL_LABEL.artnet}</option>
          </select>
        </label>
      </div>
      {lesarten.length === 0 ? (
        <div className="prop-derived">
          {t('sch.uni.none', 'Nothing patched yet \u2014 once universes are assigned, both readings appear here side by side.')}
        </div>
      ) : (
        <table className="schedule-table">
          <thead>
            <tr>
              <th>{UNIVERSE_HEADERS[0]}</th>
              <th>{UNIVERSE_HEADERS[1]}</th>
              <th>{UNIVERSE_HEADERS[2]}</th>
              <th>{t('sch.uni.note', 'Note')}</th>
            </tr>
          </thead>
          <tbody>
            {lesarten.map((r) => (
              <tr key={r.value}>
                <td><strong>{r.value}</strong></td>
                {/* Die Spalte des gewaehlten Protokolls ist hervorgehoben —
                    aber die andere bleibt sichtbar. Sie wegzulassen hiesse,
                    genau die Gegenprobe zu streichen, um die es hier geht. */}
                <td className={dmxProtocol === 'artnet' ? 'row-conflict' : undefined}>
                  {artnetReading(r.value)}
                </td>
                <td className={dmxProtocol === 'sacn' ? 'row-conflict' : undefined}>
                  {sacnReading(r.value)}
                </td>
                <td>
                  {r.problem ?? (readingsDiverge(r.value)
                    ? t('sch.uni.diverge', 'From here Art-Net and sACN read differently \u2014 at the node, Net and Sub-Net are no longer 0.')
                    : '\u2014')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="prop-derived">
        {t('sch.uni.hint', 'The setting belongs to the project and travels with the file: the number on the fixture was never wrong, it was undetermined.')}
      </div>
      {colors.length > 0 && (
        <>
          <h4 className="schedule-subhead">Farben &amp; Verbrauch ({colors.reduce((s, c) => s + c.count, 0)} Schnitte)</h4>
          <table className="schedule-table">
            <thead><tr><th>{t('sch.qty', 'Qty')}</th><th>{t('sch.colour', 'Colour')}</th><th>{t('sch.brandCode', 'Brand / code')}</th><th>{t('sch.name', 'Name')}</th><th>{t('sch.type', 'Type')}</th></tr></thead>
            <tbody>
              {colors.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.count}</strong></td>
                  <td><span className="gel-swatch" style={{ background: gelSwatch(c.type) }} /></td>
                  <td>{c.brand} {c.code}</td><td>{c.name}</td><td>{c.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );

  const magicPanel = (
    <div className="magic-sheet">
      {groups.map((g) => (
        <div key={g.name} className="magic-group">
          <div className="magic-group-head">{g.name} <em>{g.fs.length}</em></div>
          <div className="magic-chips">
            {g.fs.map((f) => (
              <button key={f.id} className={`magic-chip ${f.focused ? 'focused' : ''}`} onClick={() => onLocate([f.id])}
                title={`${f.fixture.name} · ${f.x},${f.y} · ${f.mountingHeight} m${f.focused ? ' · fokussiert' : ''}`}>
                <span className="mc-tint" style={{ background: cssRgb(cctToRgb(getFixtureCCT(f))) }} />
                <span className="mc-ch">{f.channel ?? '–'}</span>
                <span className="mc-meta">
                  <span className="mc-type">{f.fixture.name}</span>
                  <span className="mc-gel">{gelCodes(f.gelFilterIds) || `${Math.round(getFixtureCCT(f))} K`}</span>
                </span>
                {f.focused && <span className="mc-done"><Icon name="check" size={11} /></span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="prop-derived">{t('sch.magicNote', 'Grouped by purpose · tint = effective colour temperature · click shows the fixture in the plan.')}</div>
    </div>
  );

  // ── BEDARF 71 — Arbeits-Notizen aus der Probe ────────────────────────────
  //
  // Neben der Fokus-Liste und nicht darin: eine Fokus-Notiz beschreibt den
  // Fokus einer Leuchte, eine Arbeits-Notiz ist ein Vorgang. Es gibt mehrere
  // davon, sie haben einen Zeitpunkt, und sie haengen auch an Traversen und am
  // ganzen Plan.
  const noteGroups = groupNotes(workNotes, fixtures, trusses, {
    plan: t('sch.notes.plan', 'Whole plan'),
    truss: t('sch.notes.truss', 'Truss'),
  });
  const verwaist = staleNotes(workNotes, fixtures, trusses);
  const submitNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    onAddNote(noteTarget, text);
    setNoteDraft('');
  };

  const notesPanel = (
    <div className="focus-tool">
      <div className="focus-progress">
        <span className="fp-label">
          {workNotes.filter((n) => !n.done).length} {t('sch.of', 'of')} {workNotes.length}{' '}
          {t('sch.notes.open', 'open')}
        </span>
      </div>

      <div className="focus-rows">
        <div className="focus-row">
          <select
            className="focus-note"
            aria-label={t('sch.notes.target', 'Note target')}
            value={
              noteTarget.kind === 'plan'
                ? 'plan'
                : noteTarget.kind === 'truss'
                  ? `t:${noteTarget.trussId}`
                  : `f:${noteTarget.fixtureId}`
            }
            onChange={(e) => {
              const v = e.target.value;
              setNoteTarget(
                v === 'plan'
                  ? { kind: 'plan' }
                  : v.startsWith('t:')
                    ? { kind: 'truss', trussId: v.slice(2) }
                    : { kind: 'fixture', fixtureId: v.slice(2) },
              );
            }}
          >
            <option value="plan">{t('sch.notes.plan', 'Whole plan')}</option>
            {trusses.map((tr) => (
              <option key={tr.id} value={`t:${tr.id}`}>{tr.label || t('sch.notes.truss', 'Truss')}</option>
            ))}
            {ordered.map((f) => (
              <option key={f.id} value={`f:${f.id}`}>
                {f.channel != null ? `${f.channel} · ` : ''}{f.fixture.name}
              </option>
            ))}
          </select>
          <input
            className="focus-note"
            placeholder={t('sch.notes.ph', 'Note \u2013 e.g. too hot on the SL wall, add CTO\u2026')}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitNote(); }}
          />
          <button className="focus-locate" title={t('sch.notes.add', 'Add note')} onClick={submitNote}>
            <Icon name="check" size={15} />
          </button>
        </div>
      </div>

      {noteGroups.map((g) => (
        <div key={g.label} className="focus-group">
          <div className="schedule-subhead">{g.label} · {g.open}/{g.notes.length}</div>
          <div className="focus-rows">
            {g.notes.map((n) => (
              <div key={n.id} className={`focus-row ${n.done ? 'done' : ''}`}>
                <button className={`focus-tick ${n.done ? 'on' : ''}`} title={t('sch.notes.done', 'done')}
                  onClick={() => onToggleNote(n.id)}>
                  {n.done && <Icon name="check" size={14} />}
                </button>
                <span className="focus-info">
                  <b>{n.text}</b>
                  <span>{[n.by, n.at.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ')}</span>
                </span>
                {g.target.kind === 'fixture' && (
                  <button className="focus-locate" title={t('sch.locate', 'Show in the plan')}
                    onClick={() => onLocate([g.target.kind === 'fixture' ? g.target.fixtureId : ''])}>
                    <Icon name="select" size={15} />
                  </button>
                )}
                <button className="focus-locate" title={t('sch.notes.remove', 'Remove note')}
                  onClick={() => onRemoveNote(n.id)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Verwaiste Notizen: das Ziel ist weg, die Beobachtung nicht. Sie
          stehen hier, damit jemand sie durchgeht — nicht, damit sie
          verschwinden. */}
      {verwaist.length > 0 && (
        <div className="focus-group">
          <div className="schedule-subhead">{t('sch.notes.stale', 'Target removed')} · {verwaist.length}</div>
          <div className="focus-rows">
            {verwaist.map((n) => (
              <div key={n.id} className="focus-row">
                <span className="focus-info"><b>{n.text}</b><span>{n.at.slice(0, 16).replace('T', ' ')}</span></span>
                <button className="focus-locate" title={t('sch.notes.remove', 'Remove note')}
                  onClick={() => onRemoveNote(n.id)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="prop-derived">
        {t('sch.notes.hint', 'The notes stay in this project file. They go into no foreign-format export (MVR, venue exchange) \u2014 they belong to you, not to a console\u2019s show file.')}
      </div>
    </div>
  );

  const focusPanel = (
    <div className="focus-tool">
      <div className="focus-progress">
        <div className="fp-bar"><i style={{ width: `${fixtures.length ? (focusedCount / fixtures.length) * 100 : 0}%` }} /></div>
        <span className="fp-label">{focusedCount} {t('sch.of', 'of')} {fixtures.length} {t('sch.focused', 'focused')}</span>
      </div>
      {focusGroups.map((g) => (
        <div key={g.name} className="focus-group">
          <div className="schedule-subhead">{g.name} · {g.fs.filter((f) => f.focused).length}/{g.fs.length}</div>
          <div className="focus-rows">
            {g.fs.map((f) => (
              <div key={f.id} className={`focus-row ${f.focused ? 'done' : ''}`}>
                <button className={`focus-tick ${f.focused ? 'on' : ''}`} title={t('sch.focused', 'focused')}
                  onClick={() => onUpdateFixture(f.id, { focused: !f.focused })}>
                  {f.focused && <Icon name="check" size={14} />}
                </button>
                <span className="focus-ch">{f.channel ?? '–'}</span>
                <span className="focus-info">
                  <b>{f.fixture.name}</b>
                  <span>{f.purpose || '—'} · {t('sch.target', 'Target')} {f.aimX},{f.aimY}</span>
                </span>
                <input className="focus-note" placeholder={t('sch.focusNotePh', 'Focus note – e.g. soloist’s face, hard edge…')}
                  value={f.focusNote ?? ''} onChange={(e) => onUpdateFixture(f.id, { focusNote: e.target.value })} />
                <button className="focus-locate" title={t('sch.locate', 'Show in the plan')} onClick={() => onLocate([f.id])}><Icon name="select" size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="prop-derived">{t('sch.focusNote', 'Live during the focus call: tick off, capture a focus note per fixture, find it in the plan. Stored in the project and exported in the schedule CSV.')}</div>
    </div>
  );

  // ── BEDARF 137 — der Rueckweg vom Pult ──────────────────────────────────
  //
  // Nach dem Aufbau liegt der einzige richtige Stand in der Show-Datei des
  // Pults; der Plan auf dem Laptop zeigt die Absicht von vor drei Wochen. Hier
  // kommt der Patch-Export des Pults herein und wird DANEBEN gelegt — gelesen,
  // nicht uebernommen. Was der Plan traegt (wo eine Leuchte haengt, wofuer sie
  // da ist), weiss das Pult nicht; wer das eine ueber das andere schreibt,
  // verliert eines von beiden.
  const returnPanel = (() => {
    const eintraege = rueckweg ? returnFindings(rueckweg) : [];
    return (
      <>
        <div className="schedule-actions">
          <button className="btn-secondary" onClick={() => patchFileRef.current?.click()}>
            {t('sch.return.load', 'Load console patch export (CSV)')}
          </button>
          {rueckweg && (
            <button className="btn-secondary" onClick={() => {
              const tb = returnTable(rueckweg);
              downloadCsv('rueckweg-pult.csv', [tb.header, ...tb.rows]
                .map((r) => r.map((v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(';'))
                .join('\r\n'));
            }}>{t('sch.return.export', 'List as CSV')}</button>
          )}
        </div>
        <input
          ref={patchFileRef}
          type="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => {
            const datei = e.target.files?.[0];
            e.target.value = '';
            if (!datei) return;
            const leser = new FileReader();
            leser.onload = () => {
              const parse = parseConsolePatch(String(leser.result ?? ''));
              setParseInfo(parse);
              setRueckweg(patchReturn(fixtures, parse));
            };
            leser.readAsText(datei);
          }}
        />
        {!rueckweg ? (
          <div className="prop-derived">
            {t('sch.return.hint',
              'The console\u2019s patch export (channel, address, type, label) is held against the plan. Nothing is taken over \u2014 the list is there to be walked through.')}
          </div>
        ) : (
          <>
            <div className="rig-pills">
              <span className="rig-pill info">{rueckweg.compared} {t('sch.return.compared', 'channels compared')}</span>
              <span className={`rig-pill ${rueckweg.counts.changed ? 'warn' : 'off'}`}>{rueckweg.counts.changed} {t('sch.return.changed', 'changed')}</span>
              <span className={`rig-pill ${rueckweg.counts['only-in-console'] ? 'warn' : 'off'}`}>{rueckweg.counts['only-in-console']} {t('sch.return.onlyConsole', 'console only')}</span>
              <span className={`rig-pill ${rueckweg.counts['only-in-plan'] ? 'warn' : 'off'}`}>{rueckweg.counts['only-in-plan']} {t('sch.return.onlyPlan', 'plan only')}</span>
              <span className={`rig-pill ${rueckweg.counts['ambiguous-channel'] ? 'warn' : 'off'}`}>{rueckweg.counts['ambiguous-channel']} {t('sch.return.ambiguous', 'channel used more than once')}</span>
              <span className={`rig-pill ${rueckweg.counts['no-channel'] ? 'warn' : 'off'}`}>{rueckweg.counts['no-channel']} {t('sch.return.noChannel', 'no channel number')}</span>
            </div>
            {parseInfo && (
              <div className="prop-derived">
                {t('sch.return.columns', 'Columns read')}: {parseInfo.mapping.map((m) => `${m.header} → ${m.column}`).join(', ') || t('sch.return.none', 'none')}
                {parseInfo.ignored.length > 0 && ` · ${t('sch.return.ignored', 'not interpreted')}: ${parseInfo.ignored.join(', ')}`}
              </div>
            )}
            {parseInfo && parseInfo.warnings.length > 0 && (
              <ul className="rig-issues">
                {parseInfo.warnings.map((w, k) => (
                  <li key={k} className="rig-issue sev-warning"><span className="rig-dot" />{t('sch.return.line', 'Line')} {w.line}: {w.message}</li>
                ))}
              </ul>
            )}
            {eintraege.length === 0 ? (
              <div className="rig-clean">✓ {t('sch.return.clean', 'The plan matches the console.')}</div>
            ) : (
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>{t('sch.return.channel', 'Channel')}</th>
                    <th>{t('sch.return.what', 'What')}</th>
                    <th>{t('sch.return.label', 'Name')}</th>
                    <th>{t('sch.return.field', 'Field')}</th>
                    <th>{t('sch.return.inPlan', 'In the plan')}</th>
                    <th>{t('sch.return.atConsole', 'At the console')}</th>
                  </tr>
                </thead>
                <tbody>
                  {eintraege.flatMap((e, k) => (e.differences.length ? e.differences : [null]).map((d, j) => (
                    <tr key={`${k}-${j}`}>
                      <td>{e.channel ?? ''}</td>
                      <td>{RETURN_KIND_LABEL[e.kind]}</td>
                      <td>{e.label}</td>
                      <td>{d?.field ?? ''}</td>
                      <td>{d?.from ?? ''}</td>
                      <td>{d?.to ?? ''}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            )}
            <div className="prop-derived">
              {t('sch.return.oneWay', 'One-way street: none of this is written into the plan. The plan carries the intent, the console the state after load-in.')}
            </div>
          </>
        )}
      </>
    );
  })();

  // ── BEDARF 143 — zwoelf Blaetter, ein Modell ─────────────────────────────
  //
  // „all sorts and groupings of the same fields" (jkarp7/showstack#48). Die
  // Blaetter sind BESCHREIBUNGEN in `core/reportEngine.ts`; hier wird nur
  // gezeigt, was `renderReport` liefert. Wer hier Zeilen selbst zusammenbaut,
  // hat das dreizehnte handgepflegte Dokument angelegt — und genau das ist
  // der Zustand, den dieser Bedarf abschafft.
  const papersPanel = (
    <>
      <div className="schedule-actions">
        <label>
          {t('sch.rep.pick', 'Sheet')}{' '}
          <select value={reportId} onChange={(e) => setReportId(e.target.value)}>
            {REPORTS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </label>
        <button className="btn-secondary" onClick={exportReport}>
          &#8595; {t('sch.rep.csv', 'This sheet (CSV)')}
        </button>
        <button
          className="btn-secondary"
          onClick={() => {
            const def = findReport(reportId) ?? REPORTS[0];
            exportTablePdf(
              `${def.id}.pdf`,
              def.label,
              (fs: PlacedFixture[]) => reportTable(
                renderReport(def, fs, fieldContext(fs, trusses, dmxProtocol, phaseTemplate)),
              ),
              projectName || undefined,
            );
          }}
        >
          &#8595; {t('sch.rep.pdf', 'This sheet (PDF)')}
        </button>
      </div>
      <div className="prop-derived">{bericht143.def.purpose}</div>
      <table className="schedule-table">
        <thead>
          <tr>{bericht143.header.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {bericht143.groups.map((g) => (
            <React.Fragment key={g.key}>
              {/* Die Gruppen-Ueberschrift steht als eigene Zeile — und zwar
                  auch in der CSV. Ein Ausdruck, der anders gruppiert als der
                  Bildschirm, ist genau das Auseinanderlaufen, um das es geht. */}
              {bericht143.def.groupBy && (
                <tr className="row-muted">
                  <td colSpan={bericht143.header.length}>
                    <strong>{g.key}</strong> · {g.rows.length}
                  </td>
                </tr>
              )}
              {g.rows.map((row, i) => (
                <tr key={`${g.key}-${i}`}>
                  {row.map((c, j) => <td key={j}>{c}</td>)}
                </tr>
              ))}
            </React.Fragment>
          ))}
          {bericht143.rows.length === 0 && (
            <tr><td colSpan={bericht143.header.length} className="row-muted">
              {t('sch.rep.empty', 'No rows.')}
            </td></tr>
          )}
        </tbody>
      </table>
      {/* Was dieses Modell NICHT schreiben kann — berechnet aus dem
          Feld-Katalog, nicht aufgezaehlt. Eine Aufzaehlung waere der
          Kenntnisstand ihres Autors, und das naechste fehlende Feld fiele
          niemandem auf. */}
      {luecken.length > 0 && (
        <div className="prop-derived">
          {t('sch.rep.gaps', 'Not producible from this model:')}
          <ul>
            {luecken.map((g) => <li key={g.label}>{g.message}</li>)}
          </ul>
        </div>
      )}
      <div className="prop-derived">
        {t('sch.rep.hint', 'Every sheet reads the same fields. Change a column once \u2014 not twelve times.')}
      </div>

      {/* ── BEDARF 148 — Etiketten aus denselben Daten ────────────────────
          „Label output is a print view over the existing circuit/dimmer/
          channel model" — deshalb steht es HIER, auf demselben Blatt-Tab, und
          liest denselben Feld-Katalog. Am Verteiler klebt dann dieselbe
          Kreisnummer, die auf der Kreisliste steht. */}
      <h4 className="schedule-subhead">{t('sch.lbl.head', 'Labels')}</h4>
      <div className="schedule-actions">
        <label>
          {t('sch.lbl.kind', 'Label')}{' '}
          <select value={labelDefId} onChange={(e) => setLabelDefId(e.target.value)}>
            {LABEL_DEFS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <label style={{ marginLeft: 12 }}>
          {t('sch.lbl.stock', 'Sheet')}{' '}
          <select value={stockId} onChange={(e) => setStockId(e.target.value)}>
            {STOCKS.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
          </select>
        </label>
        {/* Etikettenbogen werden selten ganz aufgebraucht. Wer beim naechsten
            Satz wieder bei 1 anfaengt, druckt auf abgezogene Stellen. */}
        <label style={{ marginLeft: 12 }}>
          {t('sch.lbl.startAt', 'First free label')}{' '}
          <input
            type="number"
            min={1}
            max={bogen.columns * bogen.rows}
            value={labelStart}
            onChange={(e) => setLabelStart(Number(e.target.value) || 1)}
            style={{ width: 64 }}
          />
        </label>
        <button className="btn-secondary" style={{ marginLeft: 12 }} onClick={() => window.print()} disabled={etiketten.count === 0}>
          {t('sch.lbl.print', 'Print')}
        </button>
      </div>
      <div className="prop-derived">
        {etikettenArt.purpose} · {bogen.note}
      </div>
      <div className="prop-derived">
        {t('sch.lbl.counts', '{n} label(s) on {p} sheet(s). {r} stay free on the last one \u2014 enter that as \u201cfirst free label\u201d next time.')
          .replace('{n}', String(etiketten.count))
          .replace('{p}', String(etiketten.pages.length))
          .replace('{r}', String(etiketten.leftover))}
      </div>
      {/* Was (geschaetzt) nicht passt, wird MARKIERT und nicht gekuerzt: ein
          abgeschnittener Kreis ist ein falsches Etikett, und ein falsches
          Etikett am Verteiler ist schlimmer als ein leeres. */}
      {etiketten.overflowing > 0 && (
        <div className="rig-pill warn">
          {t('sch.lbl.overflow', '{n} label(s) will probably be too wide \u2014 nothing is truncated. Pick a narrower label or a bigger sheet.')
            .replace('{n}', String(etiketten.overflowing))}
        </div>
      )}
      <div className="prop-derived">{FIT_BASIS_NOTE}</div>
      <div className="label-print-area">
        {etiketten.pages.map((page, pi) => (
          <div
            key={pi}
            className="label-sheet"
            style={{ width: '210mm', height: '297mm' }}
          >
            {page.cells.map((lab, ci) => {
              const spalte = ci % bogen.columns;
              const zeile = Math.floor(ci / bogen.columns);
              const stil: React.CSSProperties = {
                left: `${bogen.marginLeftMm + spalte * bogen.widthMm}mm`,
                top: `${bogen.marginTopMm + zeile * bogen.heightMm}mm`,
                width: `${bogen.widthMm}mm`,
                height: `${bogen.heightMm}mm`,
                padding: `${PADDING_MM}mm`,
              };
              if (!lab) return <div key={ci} className="label-cell is-empty" style={stil} />;
              return (
                <div key={ci} className="label-cell" style={stil}>
                  {lab.lines.map((ln, li) => (
                    <div
                      key={li}
                      className={`label-line ${li === 0 ? 'label-head' : ''} ${ln.fits ? '' : 'overflows'}`}
                      style={{ fontSize: `${ln.fontMm}mm` }}
                      title={ln.fieldLabel}
                    >
                      {ln.text}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );

  const checkPanel = (
    <>
      <div className="rig-pills">
        <span className={`rig-pill ${ic.errors ? 'err' : 'off'}`}>{format(t('rig.pill.errors', '{n} errors'), { n: ic.errors })}</span>
        <span className={`rig-pill ${ic.warnings ? 'warn' : 'off'}`}>{format(t('rig.pill.warnings', '{n} warnings'), { n: ic.warnings })}</span>
        <span className="rig-pill info">{format(t('rig.pill.infos', '{n} notes'), { n: ic.infos })}</span>
        {/* BEDARF 142 — das Urteil, und zwar mit „nicht beurteilbar" darin.
            Ein Plan, dessen Last-Zahlen auf fehlenden Angaben beruhen, ist
            nicht bereit: er ist unbeantwortet. */}
        <span className={`rig-pill ${bericht.verdict === 'ready' ? 'off' : bericht.verdict === 'blocked' ? 'err' : 'warn'}`}>
          {verdictText(t, bericht.verdict)}
        </span>
        <button className="btn-secondary" onClick={() => {
          const tb = preflightTable(bericht);
          downloadCsv('vorflug.csv', [tb.header, ...tb.rows]
            .map((r) => r.map((v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(';'))
            .join('\r\n'));
        }}><Icon name="export" size={12} /> {t('sch.check.csv', 'Report (CSV)')}</button>
      </div>
      {bericht.assumed > 0 && (
        <div className="prop-derived">
          {t('sch.check.assumedNote', 'Careful: {n} finding(s) rest on assumed values (missing weight, missing wattage, estimated truss capacity). Figures derived from them are smaller than reality \u2014 and for a truss load that is the dangerous direction.')
            .replace('{n}', String(bericht.assumed))}
        </div>
      )}
      {issues.length === 0 ? (
        <div className="rig-clean">✓ {t('sch.checkClean', 'No problems found.')}</div>
      ) : (
        <ul className="rig-issues">
          {issues.map((i, k) => {
            const locatable = !!i.ids && i.ids.length > 0;
            return (
              <li key={k} className={`rig-issue sev-${i.severity} ${locatable ? 'locatable' : ''}`}
                onClick={locatable ? () => onLocate(i.ids!) : undefined}
                title={locatable ? t('sch.locateAffected', 'Show the affected fixtures in the plan') : undefined}>
                <span className="rig-dot" />{i.message}
                {i.basis === 'assumed' && (
                  <span className="rig-pill warn" style={{ marginLeft: 6 }}>
                    {t('sch.check.assumed', 'assumed')}
                  </span>
                )}
                {locatable && <Icon name="chevronRight" size={14} className="rig-go" />}
              </li>
            );
          })}
        </ul>
      )}
      <div className="prop-derived">{t('sch.checkScope', 'Checked: DMX overlap, duplicate channels, unpatched movers, truss load, power headroom.')}</div>
    </>
  );

  const photoPanel = photo ? (
    <>
      <div className="schedule-cards">
        <div className="schedule-card"><span className="sc-val">{lx(photo.avg)} lx</span><span className="sc-label">{t('sch.avg', 'Average (Eavg)')}</span></div>
        <div className="schedule-card"><span className="sc-val">{lx(photo.min)} lx</span><span className="sc-label">{t('sch.min', 'Minimum')}</span></div>
        <div className="schedule-card"><span className="sc-val">{lx(photo.max)} lx</span><span className="sc-label">{t('sch.max', 'Maximum')}</span></div>
        <div className={`schedule-card photo-${photo.u0 >= 0.6 ? 'ok' : photo.u0 >= 0.4 ? 'warn' : 'bad'}`}>
          <span className="sc-val">{photo.u0.toFixed(2)}</span><span className="sc-label">U0 = Emin/Eavg · {photo.rating}</span>
        </div>
        <div className="schedule-card"><span className="sc-val">{photo.u2.toFixed(2)}</span><span className="sc-label">U2 = Emin/Emax</span></div>
        <div className="schedule-card"><span className="sc-val">{photo.areaM2.toFixed(1)} m²</span><span className="sc-label">{t('sch.lit', 'lit')}</span></div>
      </div>
      <div className="prop-derived">{t('sch.photoNote', 'Guideline (DIN EN 12464 / CIBSE): U0 ≥ 0.6 good · ≥ 0.4 acceptable. Values across the lit stage area (same engine as the heat-map).')}</div>
    </>
  ) : (
    <div className="tool-empty">{t('sch.photoEmpty', 'No lit fixtures – photometry unavailable.')}</div>
  );

  const loadPanel = (
    <>
      <h4 className="schedule-subhead">{t('sch.power', 'Power')}</h4>
      <div className="schedule-cards">
        <div className="schedule-card"><span className="sc-val">{(power.totalWatts / 1000).toFixed(2)} kW</span><span className="sc-label">{t('sch.totalPower', 'Total power')}</span></div>
        <div className="schedule-card"><span className="sc-val">{power.amps1ph.toFixed(1)} A</span><span className="sc-label">{t('sch.singlePhase', '@ 230 V (single phase)')}</span></div>
        {/* BEDARF 141 — hier stand bis 2026-09-07 `power.ampsPerPhase`, also
            `Gesamtlast / 3`: die Last einer AUSGEGLICHENEN Anlage, und damit
            eines Zustands, den niemand hat. Den Automaten wirft die SCHWERSTE
            Phase. Die Annahme steht jetzt daneben statt an ihrer Stelle. */}
        <div className={`schedule-card ${verteilung.peak && verteilung.peak.amps > 16 ? 'photo-bad' : ''}`}>
          <span className="sc-val">{(verteilung.peak?.amps ?? 0).toFixed(1)} A</span>
          <span className="sc-label">
            {t('sch.pwr.peak', 'heaviest phase')}
            {verteilung.peak ? ` · ${PHASE_LABEL[verteilung.peak.phase]}` : ''}
          </span>
        </div>
        <div className="schedule-card">
          <span className="sc-val">{power.ampsPerPhase.toFixed(1)} A</span>
          <span className="sc-label">{t('sch.pwr.assumed', 'assumed balanced')}</span>
        </div>
        <div className="schedule-card"><span className="sc-val">{circuits.length}×</span><span className="sc-label">{t('sch.circuits', 'Circuits (16 A, 3 kW)')}</span></div>
      </div>
      {circuits.length > 0 && (
        <div className="circuit-strip">
          {circuits.map((c) => (
            <div key={c.index} className="circuit-chip" title={`${c.fixtureCount} Leuchten · ${c.watts} W`}>
              <span className="cc-name">C{c.index}</span>
              <span className={`cc-bar ${utilClass(c.utilization)}`}><i style={{ width: `${Math.min(100, c.utilization * 100)}%` }} /></span>
              <span className="cc-val">{c.watts} W</span>
            </div>
          ))}
        </div>
      )}
      {/* ── BEDARF 141 — Kreise, Phasen und Steckreihenfolge ─────────────
          Der Beleg (`jkarp7/showstack#41`, `#39`) nennt drei Dinge, die dem
          Plan fehlten: AB/AC/ABC-Vorlagen, die Last JE PHASE, und die
          Punkt-Kreis-Schreibweise „3-2" (Distro 3, Ausgang 2). Die dritte ist
          keine Verzierung: sie ist die einzige Bezeichnung, die jemand am
          Steckfeld wiederfindet. */}
      <h4 className="schedule-subhead">
        {t('sch.pwr.phases', 'Phases & circuits')}
        {verteilung.assignments.length > 0 && (
          <button className="btn-secondary" style={{ marginLeft: 8 }} onClick={exportCircuits}>
            &#8595; {t('sch.pwr.csv', 'Circuit list (CSV)')}
          </button>
        )}
        {verteilung.assignments.length > 0 && (
          <button
            className="btn-secondary"
            style={{ marginLeft: 6 }}
            onClick={() => exportTablePdf(
              'kreisliste.pdf',
              t('sch.pwr.pdfTitle', 'Circuit list'),
              (fs: PlacedFixture[]) => circuitTable(distributionFor(fs, phaseTemplate)),
              projectName || undefined,
            )}
          >
            &#8595; {t('sch.pwr.pdf', 'Circuit list (PDF)')}
          </button>
        )}
      </h4>
      <div className="schedule-actions">
        <label>
          {t('sch.pwr.template', 'The service carries')}{' '}
          <select
            value={phaseTemplate}
            onChange={(e) => onSetPhaseTemplate(e.target.value as PhaseTemplate)}
          >
            {/* Literale Optionen: die vier Vorlagen aus dem Beleg, nicht eine
                frei zusammenstellbare Menge. „L2+L3 ohne L1" findet niemand
                vor — „eine Phase ist belegt" schon. */}
            <option value="ABC">{TEMPLATE_LABEL.ABC}</option>
            <option value="AB">{TEMPLATE_LABEL.AB}</option>
            <option value="AC">{TEMPLATE_LABEL.AC}</option>
            <option value="A">{TEMPLATE_LABEL.A}</option>
          </select>
        </label>
      </div>
      <table className="schedule-table">
        <thead>
          <tr>
            <th>{PHASE_HEADERS[0]}</th>
            <th>{t('sch.pwr.hCircuits', 'Circuits')}</th>
            <th>W</th>
            <th>A</th>
          </tr>
        </thead>
        <tbody>
          {verteilung.phases.map((ph) => (
            <tr key={ph.phase} className={ph.amps > 16 ? 'row-conflict' : ''}>
              <td>{PHASE_LABEL[ph.phase]}</td>
              <td>{ph.circuits}</td>
              <td>{Math.round(ph.watts)}</td>
              <td>{ph.amps.toFixed(1)} A</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Der Betrag, um den der Plan zu gut aussah — als Satz und nicht als
          Fussnote. Null heisst: die Anlage ist ausgeglichen, die alte Zahl
          stimmte. Alles darueber ist der Unterschied zur Wirklichkeit. */}
      <div className="prop-derived">
        {verteilung.understatedAmps >= 1
          ? t('sch.pwr.understated', 'Unbalanced: the heaviest phase carries {d} A more than the balanced assumption ({a} A). Difference between heaviest and lightest phase: {i} A.')
            .replace('{d}', verteilung.understatedAmps.toFixed(1))
            .replace('{a}', verteilung.assumedAmpsPerPhase.toFixed(1))
            .replace('{i}', verteilung.imbalanceAmps.toFixed(1))
          : t('sch.pwr.balanced', 'Evenly distributed \u2014 the balanced assumption holds here.')}
      </div>
      {verteilung.assignments.length > 0 && (
        <table className="schedule-table">
          <thead>
            <tr>
              <th>{CIRCUIT_HEADERS[0]}</th>
              <th>{PHASE_HEADERS[0]}</th>
              <th>{t('sch.fixtures', 'fixtures')}</th>
              <th>W</th>
              <th>A</th>
              <th>{t('sch.utilisation', 'Utilisation')}</th>
            </tr>
          </thead>
          <tbody>
            {verteilung.assignments.map((a) => (
              <tr key={a.index} className={a.overloaded ? 'row-conflict' : ''}>
                {/* Die Punkt-Kreis-Schreibweise, nicht die laufende Nummer:
                    „Kreis 14" sagt niemandem, wo er steht. */}
                <td><strong>{circuitLabel(a)}</strong></td>
                <td>{PHASE_LABEL[a.phase]}</td>
                <td>{a.fixtureCount}</td>
                <td>{Math.round(a.watts)}</td>
                <td>{a.amps.toFixed(1)}{a.overloaded ? ' \u26a0' : ''}</td>
                <td>
                  <span className={`util-bar ${utilClass(a.utilization)}`}><i style={{ width: `${Math.min(100, a.utilization * 100)}%` }} /></span>
                  <span className="util-pct">{Math.round(a.utilization * 100)} %</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* ── BEDARF 140 — die Wege, die dieser Plan bedeutet ───────────────
          „MVR has NO CABLE ENTITY […] individual cables and the connections
          need to be specified in the MVR file." (`mvrdevelopment/spec#296`
          und `#288`, beide offen)

          Sie steht hier und nicht in einem eigenen Reiter: die Kette bricht am
          Kreis, und der Kreis steht eine Tabelle weiter oben. Wer die Wege
          woanders sucht, vergleicht sie nicht mit dem, woraus sie folgen. */}
      <h4 className="schedule-subhead">
        {t('sch.cbl.head', 'Cable runs')}
        {kabelSummen.map((sum) => (
          <span key={sum.kind}>
            {' · '}{KIND_LABEL[sum.kind]}: {sum.runs} × {sum.metres.toFixed(1)} m
            {sum.unknown > 0
              ? ` ${t('sch.cbl.plusUnknown', '(+ {n} without length)').replace('{n}', String(sum.unknown))}`
              : ''}
          </span>
        ))}
      </h4>
      {/* Die Grundlage steht ueber der Tabelle und nicht darunter: wer die
          Zahlen liest, soll vorher wissen, was sie sind. */}
      <div className="prop-derived">{t('sch.cbl.basis', LENGTH_BASIS_NOTE)}</div>
      {kabelLuecken.map((l) => (
        <div key={l.kind} className="schedule-warning">{l.message}</div>
      ))}
      {kabelWege.length > 0 && (
        <table className="schedule-table">
          <thead>
            <tr>
              <th>{t('sch.cbl.col.kind', 'Kind')}</th>
              <th>{t('sch.cbl.col.from', 'From')}</th>
              <th>{t('sch.cbl.col.to', 'To')}</th>
              <th>{t('sch.truss', 'Truss')}</th>
              <th>{CABLE_HEADERS[4]}</th>
              <th>{t('sch.cbl.col.connector', 'Connector')}</th>
            </tr>
          </thead>
          <tbody>
            {cableTable(kabelWege).rows.map((r, i) => (
              <tr key={kabelWege[i].id} className={kabelWege[i].from.kind === 'source' ? 'row-muted' : ''}>
                {r.map((z, j) => <td key={j}>{z}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4 className="schedule-subhead">{t('sch.loadPerTruss', 'Load per truss')} · {totalWeight.toFixed(1)} kg {t('sch.total', 'in total')}</h4>
      <table className="schedule-table">
        <thead><tr><th>{t('sch.truss', 'Truss')}</th><th>{t('sch.fixtures', 'fixtures')}</th><th>{t('sch.load', 'Load')}</th><th>{t('sch.capacity', 'Capacity')}</th><th>{t('sch.utilisation', 'Utilisation')}</th></tr></thead>
        <tbody>
          {loads.perTruss.map((tr) => (
            <tr key={tr.id} className={tr.overloaded ? 'row-conflict' : ''}>
              <td>{tr.label}</td><td>{tr.fixtureCount}</td><td>{tr.weightKg.toFixed(1)} kg</td><td>{tr.capacityKg} kg</td>
              <td>
                <span className={`util-bar ${utilClass(tr.utilization)}`}><i style={{ width: `${Math.min(100, tr.utilization * 100)}%` }} /></span>
                <span className="util-pct">{Math.round(tr.utilization * 100)} %{tr.overloaded ? ' ⚠' : ''}</span>
              </td>
            </tr>
          ))}
          {loads.unassigned.count > 0 && (
            <tr className="row-muted"><td>{t('sch.floorFree', 'Floor / free-standing')}</td><td>{loads.unassigned.count}</td><td>{loads.unassigned.weightKg.toFixed(1)} kg</td><td>–</td><td>–</td></tr>
          )}
          {loads.perTruss.length === 0 && loads.unassigned.count === 0 && (
            <tr><td colSpan={5} className="row-muted">{t('sch.noneAssigned', 'No fixtures assigned.')}</td></tr>
          )}
        </tbody>
      </table>
    </>
  );

  const exportPanel = (
    <div className="export-list">
      <div className="export-row">
        <Icon name="schedule" size={22} className="er-icon" />
        <div className="er-text"><b>{t('sch.exp.schedule', 'Instrument schedule (CSV)')}</b><span>{t('sch.exp.scheduleNote', 'Patch, position, gel & purpose per fixture – for a spreadsheet.')}</span></div>
        <button className="btn-secondary" onClick={exportSchedule}><Icon name="export" size={12} /> CSV</button>
        <button className="btn-secondary" onClick={() => exportTablePdf('instrument-schedule.pdf', t('sch.exp.schedule.pdfTitle', 'Instrument schedule'), scheduleTable, projectName || undefined)}><Icon name="export" size={12} /> PDF</button>
      </div>
      <div className="export-row">
        <Icon name="truss" size={22} className="er-icon" />
        <div className="er-text"><b>{t('sch.exp.cables', 'Cable list (CSV)')}</b><span>{t('sch.exp.cablesNote', 'Power and DMX runs with length and connector — what MVR does not carry.')}</span></div>
        <button className="btn-secondary" onClick={exportCables}><Icon name="export" size={12} /> CSV</button>
        <button className="btn-secondary" onClick={() => exportTablePdf('kabelliste.pdf', t('sch.exp.cables.pdfTitle', 'Cable list'), (fs: PlacedFixture[]) => cableTable(cableRuns(fs, trusses, phaseTemplate)), projectName || undefined)}><Icon name="export" size={12} /> PDF</button>
      </div>
      <div className="export-row">
        <Icon name="library" size={22} className="er-icon" />
        <div className="er-text"><b>{t('sch.exp.inventory', 'Equipment list (CSV)')}</b><span>{t('sch.exp.inventoryNote', 'Counts per type with power & weight – for ordering and logistics.')}</span></div>
        <button className="btn-secondary" onClick={exportInventory}><Icon name="export" size={12} /> CSV</button>
        <button className="btn-secondary" onClick={() => exportTablePdf('geraeteliste.pdf', t('sch.exp.inventory.pdfTitle', 'Equipment list'), inventoryTable, projectName || undefined)}><Icon name="export" size={12} /> PDF</button>
      </div>
      <div className="export-row">
        <Icon name="heatmap" size={22} className="er-icon" />
        <div className="er-text"><b>{t('sch.exp.colours', 'Colour list (CSV)')}</b><span>{t('sch.exp.coloursNote', 'Gel cuts per code – for ordering colour and prepping it.')}</span></div>
        <button className="btn-secondary" onClick={exportColors} disabled={colors.length === 0}><Icon name="export" size={12} /> CSV</button>
        <button className="btn-secondary" onClick={() => exportTablePdf('farbliste.pdf', t('sch.exp.colours.pdfTitle', 'Colour list'), colorTable, projectName || undefined)} disabled={colors.length === 0}><Icon name="export" size={12} /> PDF</button>
      </div>
      <div className="export-row">
        <Icon name="tag" size={22} className="er-icon" />
        <div className="er-text">
          <b>{t('sch.exp.groups', 'Group sheet (CSV)')}</b>
          <span>{t('sch.exp.groupsNote', 'One row per group member with channel, unit, type and position \u2014 what otherwise gets rebuilt by hand on the console, in the visualiser and in the media server.')}</span>
        </div>
        <button className="btn-secondary" onClick={exportGroups} disabled={gruppen.length === 0}><Icon name="export" size={12} /> CSV</button>
        <button className="btn-secondary" onClick={() => exportTablePdf('gruppen.pdf', t('sch.exp.groups.pdfTitle', 'Group sheet'), () => groupTable(gruppen), projectName || undefined)} disabled={gruppen.length === 0}><Icon name="export" size={12} /> PDF</button>
      </div>
      {/* ── BEDARF 145 — die Bestellung faellt aus dem Plan ──────────────
          „Users must manually type equipment items" (jkarp7/showstack#29),
          obwohl die Daten laengst da sind. Aufgeteilt wird nach eigenem und
          fremdem Bestand — ENTSCHIEDEN wird nichts: was man nimmt, weiss der
          Disponent. Und jede Zeile sagt, worauf ihre Deckung beruht: die
          Zuordnung Plan-Geraet zu Lager-Artikel ist ein Vergleich von
          Zeichenketten und keine Tatsache. */}
      <div className="export-row">
        <Icon name="library" size={22} className="er-icon" />
        <div className="er-text">
          <b>{t('sch.exp.shop', 'Shop order (CSV)')}</b>
          <span>
            {t('sch.exp.shopNote', 'Demand from the plan, covered from stock: owned, foreign (goes back) and what is left over.')}
          </span>
          {bestellung.unmatched > 0 && (
            <span className="rig-pill warn">
              {t('sch.exp.shopUnmatched', '{n} line(s) with no stock item \u2014 nobody vouched for those.')
                .replace('{n}', String(bestellung.unmatched))}
            </span>
          )}
          {/* Was die Quelle nennt und dieser Plan nicht hergibt — berechnet,
              nicht aufgezaehlt. Eine leere Rubrik saehe aus, als waere
              nichts noetig. */}
          {bestellLuecken.length > 0 && (
            <span className="prop-derived">
              {t('sch.exp.shopGaps', 'Not from this plan:')}{' '}
              {bestellLuecken.map((g) => g.label).join(' · ')}
            </span>
          )}
        </div>
        <button
          className="btn-secondary"
          onClick={exportShopOrder}
          disabled={bestellung.lines.length === 0}
        >&#8595; CSV</button>
        <button
          className="btn-secondary"
          onClick={() => exportTablePdf(
            'bestellung.pdf',
            t('sch.exp.shop.pdfTitle', 'Shop order'),
            (fs: PlacedFixture[]) => shopOrderTable(shopOrder(fs, lagerBestand)),
            projectName || undefined,
          )}
          disabled={bestellung.lines.length === 0}
        >&#8595; PDF</button>
      </div>
      {/* ── BEDARF 146 — den Patch ans Pult schicken statt abtippen ──────
          Der Beleg nennt zwei Fallen ausdruecklich: Eos will Tabulatoren und
          Windows-Zeilenenden, und es verwirft Zeilen ohne bekannten
          Geraetetyp — beides ohne ein Wort. Die Empfehlung der Quelle ist
          deshalb keine Funktion, sondern eine Warnung: „rather than letting
          the user discover it at load-in". */}
      <div className="export-row">
        <Icon name="export" size={22} className="er-icon" />
        <div className="er-text">
          <b>{t('sch.exp.console', 'Patch for the console')}</b>
          <span>
            <select
              value={consoleTarget}
              onChange={(e) => setConsoleTarget(e.target.value as ConsoleTarget)}
              style={{ marginRight: 8 }}
            >
              {TARGETS.map((id) => (
                <option key={id} value={id}>{FORMATS[id].label}</option>
              ))}
            </select>
            {pultVorschau.note}
          </span>
          {/* Was NICHT mitgeht, mit Grund — vor dem Speichern. Eine Datei,
              die stillschweigend die Haelfte verliert, ist schlimmer als
              keine: am Pult sieht man ihr nicht an, dass sie unvollstaendig
              ist, und gesucht wird dann beim Geraet. */}
          {pultVorschau.dropped.length > 0 && (
            <span className="rig-pill warn">
              {t('sch.exp.consoleDropped', '{n} of {m} rows will NOT be included:')
                .replace('{n}', String(pultVorschau.dropped.length))
                .replace('{m}', String(fixtures.length))}
              {' '}
              {[...new Set(pultVorschau.dropped.map((d) => d.reason))]
                .map((r) => DROP_LABEL[r]).join(' · ')}
            </span>
          )}
          {pultVorschau.unverifiable > 0 && (
            <span className="prop-derived">
              {t('sch.exp.consoleUnverifiable', 'Whether the remaining {n} rows arrive depends on the console\u2019s fixture library. This machine cannot know that \u2014 the import decides.')
                .replace('{n}', String(pultVorschau.unverifiable))}
            </span>
          )}
        </div>
        <button className="btn-secondary" onClick={exportConsole} disabled={pultVorschau.written === 0}>
          &#8595; {FORMATS[consoleTarget].extension.toUpperCase()}
        </button>
      </div>
      <div className="export-row">
        <Icon name="cube3d" size={22} className="er-icon" />
        <div className="er-text">
          <b>MVR (GDTF/MVR)</b>
          <span>
            {t('sch.exp.mvrNote', 'Fixtures with positions & patch – opens in Capture, grandMA3, WYSIWYG, Vectorworks, BlenderDMX.')}
          </span>
          {/* ADR-005, Regel 3 UND Bedarf 139. Hier stand die Ehrlichkeit
              frueher fuer genau EINEN Fall — die Traversen —, weil den einmal
              jemand bemerkt hatte. Gruppen, Farben, Zwecke und Notizen gingen
              daneben genauso verloren, ohne ein Wort. Was fehlt, rechnet jetzt
              `mvrOmissions` aus; diese Liste ist damit kein Kenntnisstand,
              sondern ein Ergebnis. */}
          {specKollisionen.length > 0 && (
            <ul className="rig-issues">
              {specKollisionen.map((c) => (
                <li key={c.file} className="rig-issue sev-warning">
                  <span className="rig-dot" />
                  <b>{t('sch.exp.specClash', 'Same GDTF file name')}</b> — {c.types.join(', ')}{' '}
                  {t('sch.exp.specClashNote', '\u2013 the names differ only in characters a file name cannot carry. They get distinct references, but your GDTF library may know only one of them.')}
                </li>
              ))}
            </ul>
          )}
          {auslassungen.length > 0 && (
            <ul className="rig-issues">
              {auslassungen.map((o) => (
                <li key={o.kind} className="rig-issue sev-warning">
                  <span className="rig-dot" />
                  <b>{o.count} {omissionNoun(t, o.kind)}</b> — {o.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="btn-secondary" onClick={exportMvr}><Icon name="export" size={12} /> .mvr</button>
      </div>
    </div>
  );

  const panels: Record<Tab, React.ReactNode> = { list: listPanel, magic: magicPanel, focus: focusPanel, notes: notesPanel, papers: papersPanel, check: checkPanel, return: returnPanel, photo: photoPanel, load: loadPanel, export: exportPanel };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal tool-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tool-head">
          <h3><Icon name={TABS.find((x) => x.id === tab)!.icon} size={18} /> {activeLabel}</h3>
          <button className="fp-icon-btn fp-close" onClick={onClose} title={t('common.close', 'Close')}>✕</button>
        </div>
        {fixtures.length === 0 ? (
          <div className="tool-empty-wrap"><p className="dialog-hint">{t('sch.empty', 'No fixtures placed yet.')}</p></div>
        ) : (
          <div className="tool-body">
            <nav className="tool-nav">
              {TABS.map((tb) => (
                <button key={tb.id} className={tab === tb.id ? 'on' : ''} onClick={() => setTab(tb.id)}>
                  <Icon name={tb.icon} size={16} /><span>{tabLabel(t, tb.id)}</span>
                  {tb.id === 'check' && checkBadge > 0 && <span className={`nav-badge ${ic.errors ? 'err' : 'warn'}`}>{checkBadge}</span>}
                </button>
              ))}
            </nav>
            <div className="tool-content">{panels[tab]}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleDialog;
