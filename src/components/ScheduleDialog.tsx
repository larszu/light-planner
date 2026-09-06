import React, { useState } from 'react';
import type { PlacedFixture, Truss, Wall, Ceiling, WorkNote, WorkNoteTarget } from '../types';
import { computePower, fixtureCounts, footprint, trussLoads, circuitBreakdown, colorCounts, nearestTrussId } from '../core/patch';
import { documentFingerprint, stampForStand, type DocumentStamp } from '../core/documentStamp';
import { colorTable, gelCodes, inventoryTable, scheduleOrder, scheduleTable, tableToCsv, type DocumentTable } from '../core/documentTables';
import { versionsFor } from '../utils/versionStore';
import { rigCheck, issueCounts } from '../core/rigCheck';
import { photometricReport, type EvalArea } from '../core/photometrics';
import { buildMvr } from '../core/mvrExport';
import { groupNotes, staleNotes } from '../core/workNotes';
import { gelLibrary } from '../core/gelLibrary';
import { getFixtureCCT, cctToRgb } from '../core/colorTemp';
import Icon from './Icon';
import type { IconName } from './Icon';
import { useTranslation } from '../i18n';

interface Props {
  fixtures: PlacedFixture[];
  trusses: Truss[];
  walls: Wall[];
  ceilings: Ceiling[];
  area: EvalArea | null;
  projectName: string;
  /** Fuer den Stempel: unter dieser Kennung liegen die festgeschriebenen Staende. */
  projectId: string;
  conflicts: Set<string>;
  onAutoNumber: () => void;
  onAutoPatch: () => void;
  onLocate: (ids: string[]) => void;
  onUpdateFixture: (id: string, updates: Partial<PlacedFixture>) => void;
  // ── Bedarf 71 — Arbeits-Notizen aus der Probe ──
  workNotes: WorkNote[];
  /** Legt eine Notiz an. Id und Zeitpunkt kommen vom Wirt, nicht von hier. */
  onAddNote: (target: WorkNoteTarget, text: string) => void;
  onToggleNote: (id: string) => void;
  onRemoveNote: (id: string) => void;
  onClose: () => void;
}

type Tab = 'list' | 'magic' | 'focus' | 'notes' | 'check' | 'photo' | 'load' | 'export';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'list', label: 'Geräteliste & Patch', icon: 'schedule' },
  { id: 'magic', label: 'Magic Sheet', icon: 'grid' },
  { id: 'focus', label: 'Fokus', icon: 'autolight' },
  { id: 'notes', label: 'Notizen', icon: 'tag' },
  { id: 'check', label: 'Prüfung', icon: 'check' },
  { id: 'photo', label: 'Photometrie', icon: 'heatmap' },
  { id: 'load', label: 'Last & Strom', icon: 'truss' },
  { id: 'export', label: 'Export', icon: 'export' },
];

// Literale Schluessel statt `t(\`tab.${id}\`)` -- der Guard `i18n:check` sieht
// nur literale Aufrufe, und ein dynamisch gebauter Schluessel faellt ihm
// durch (gemessen in light#66 an `tool.stage`, das deshalb deutsch im
// englischen Woerterbuch stand).
const tabLabel = (t: (k: string, de: string) => string, id: Tab): string => {
  switch (id) {
    case 'list': return t('sch.tab.list', 'Geräteliste & Patch');
    case 'magic': return t('sch.tab.magic', 'Magic Sheet');
    case 'focus': return t('sch.tab.focus', 'Fokus');
    case 'check': return t('sch.tab.check', 'Prüfung');
    case 'photo': return t('sch.tab.photo', 'Photometrie');
    case 'notes': return t('sch.tab.notes', 'Notizen');
    case 'load': return t('sch.tab.load', 'Last & Strom');
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
const ScheduleDialog: React.FC<Props> = ({ fixtures, trusses, walls, ceilings, area, projectName, projectId, conflicts, onAutoNumber, onAutoPatch, onLocate, onUpdateFixture, workNotes, onAddNote, onToggleNote, onRemoveNote, onClose }) => {
  const { t } = useTranslation();
  const [tab, setTabState] = useState<Tab>(() => {
    try { const saved = localStorage.getItem('lp-tool-tab'); if (saved && TABS.some((x) => x.id === saved)) return saved as Tab; } catch { /* ignore */ }
    return 'list';
  });
  const setTab = (t: Tab) => { setTabState(t); try { localStorage.setItem('lp-tool-tab', t); } catch { /* ignore */ } };

  // BEDARF 71 — der Entwurf liegt lokal: waehrend der Probe wird getippt, und
  // jeder Tastendruck durch den Wirt zu schicken machte die Eingabe zaeh.
  const [noteDraft, setNoteDraft] = useState('');
  // Ziel der naechsten Notiz. Vorbelegt auf den ganzen Plan — das ist das
  // einzige Ziel, das es IMMER gibt; eine geratene Leuchte waere eine
  // Zuordnung, die niemand getroffen hat.
  const [noteTarget, setNoteTarget] = useState<WorkNoteTarget>({ kind: 'plan' });

  const counts = fixtureCounts(fixtures);
  const power = computePower(fixtures);
  const totalWeight = fixtures.reduce((s, f) => s + (f.fixture.weight || 0), 0);
  const issues = rigCheck(fixtures, trusses);
  const ic = issueCounts(issues);
  const photo = photometricReport(fixtures, walls, ceilings, area);
  const loads = trussLoads(fixtures, trusses);
  const circuits = circuitBreakdown(fixtures);
  const colors = colorCounts(fixtures);
  const checkBadge = ic.errors + ic.warnings;

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

  const exportSchedule = () => exportTable('instrument-schedule.csv', scheduleTable);
  const exportInventory = () => exportTable('geraeteliste.csv', inventoryTable);
  const exportColors = () => exportTable('farbliste.csv', colorTable);

  const exportMvr = () => {
    const data = buildMvr(fixtures, trusses, projectName);
    triggerDownload(new Blob([data as BlobPart], { type: 'application/octet-stream' }), `${safe}.mvr`);
  };

  // Magic sheet: channels grouped by purpose (system), each a clickable chip
  // tinted by its effective colour temperature — at-a-glance "what is what".
  const ohneZweck = t('sch.noPurpose', 'Ohne Zweck');
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
    const bodenStative = t('sch.floorStands', 'Boden / Stative');
    for (const f of fixtures) {
      const tid = nearestTrussId(f, trusses);
      const key = tid ? (trusses.find((x) => x.id === tid)?.label || t('sch.truss', 'Traverse')) : bodenStative;
      (m.get(key) ?? m.set(key, []).get(key)!).push(f);
    }
    return [...m.entries()]
      .map(([name, fs]) => ({ name, fs: fs.sort((a, b) => (a.channel ?? 1e9) - (b.channel ?? 1e9)) }))
      .sort((a, b) => (a.name === bodenStative ? 1 : 0) - (b.name === bodenStative ? 1 : 0) || a.name.localeCompare(b.name));
  })();
  const focusedCount = fixtures.filter((f) => f.focused).length;

  const activeLabel = tabLabel(t, tab);

  // ── per-tool panels ──
  const listPanel = (
    <>
      <div className="schedule-actions">
        <button className="btn-secondary" onClick={onAutoNumber}>① {t('sch.autoNumber', 'Auto-Nummerieren')}</button>
        <button className="btn-secondary" onClick={onAutoPatch}>② {t('sch.autoPatch', 'Auto-Patch (DMX)')}</button>
      </div>
      <h4 className="schedule-subhead">{t('sch.inventory', 'Inventar')} ({fixtures.length} {t('sch.fixtures', 'Leuchten')}, {counts.length} {t('sch.types', 'Typen')})</h4>
      <table className="schedule-table">
        <thead><tr><th>{t('sch.qty', 'Anz.')}</th><th>{t('sch.manufacturer', 'Hersteller')}</th><th>{t('sch.type', 'Typ')}</th><th>{t('sch.wEach', 'W/Stk')}</th><th>{t('sch.wTotal', 'W ges.')}</th><th>{t('sch.kgTotal', 'kg ges.')}</th></tr></thead>
        <tbody>
          {counts.map((c) => (
            <tr key={c.manufacturer + c.name}>
              <td><strong>{c.count}</strong></td><td>{c.manufacturer}</td><td>{c.name}</td>
              <td>{c.watts}</td><td>{c.count * c.watts}</td><td>{(c.count * c.weight).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className="schedule-subhead">{t('sch.instrumentSchedule', 'Instrument Schedule')}</h4>
      <table className="schedule-table">
        <thead><tr><th>Unit</th><th>Ch</th><th>DMX</th><th>{t('sch.type', 'Typ')}</th><th>{t('sch.pos', 'Pos (x,y,h)')}</th><th>Gel</th><th>{t('sch.purpose', 'Zweck')}</th></tr></thead>
        <tbody>
          {ordered.map((f) => (
            <tr key={f.id} className={conflicts.has(f.id) ? 'row-conflict' : ''}
              onClick={() => onLocate([f.id])} title={t('sch.locate', 'Im Plan zeigen')}>
              <td>{f.unitNumber ?? '–'}</td>
              <td>{f.channel ?? '–'}</td>
              <td>{f.universe != null && f.dmxAddress != null ? `${f.universe}.${f.dmxAddress}` : (footprint(f) === 0 ? 'Dimmer' : '–')}</td>
              <td>{f.fixture.name}</td>
              <td>{f.x},{f.y} · {f.mountingHeight}m</td>
              <td>{gelCodes(f.gelFilterIds) || '–'}</td>
              <td>{f.purpose || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {colors.length > 0 && (
        <>
          <h4 className="schedule-subhead">Farben &amp; Verbrauch ({colors.reduce((s, c) => s + c.count, 0)} Schnitte)</h4>
          <table className="schedule-table">
            <thead><tr><th>{t('sch.qty', 'Anz.')}</th><th>{t('sch.colour', 'Farbe')}</th><th>{t('sch.brandCode', 'Marke / Code')}</th><th>{t('sch.name', 'Name')}</th><th>{t('sch.type', 'Typ')}</th></tr></thead>
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
      <div className="prop-derived">{t('sch.magicNote', 'Nach Zweck gruppiert · Tönung = effektive Farbtemperatur · Klick zeigt die Leuchte im Plan.')}</div>
    </div>
  );

  // ── BEDARF 71 — Arbeits-Notizen aus der Probe ────────────────────────────
  //
  // Neben der Fokus-Liste und nicht darin: eine Fokus-Notiz beschreibt den
  // Fokus einer Leuchte, eine Arbeits-Notiz ist ein Vorgang. Es gibt mehrere
  // davon, sie haben einen Zeitpunkt, und sie haengen auch an Traversen und am
  // ganzen Plan.
  const noteGroups = groupNotes(workNotes, fixtures, trusses, {
    plan: t('sch.notes.plan', 'Ganzer Plan'),
    truss: t('sch.notes.truss', 'Traverse'),
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
          {workNotes.filter((n) => !n.done).length} {t('sch.of', 'von')} {workNotes.length}{' '}
          {t('sch.notes.open', 'offen')}
        </span>
      </div>

      <div className="focus-rows">
        <div className="focus-row">
          <select
            className="focus-note"
            aria-label={t('sch.notes.target', 'Ziel der Notiz')}
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
            <option value="plan">{t('sch.notes.plan', 'Ganzer Plan')}</option>
            {trusses.map((tr) => (
              <option key={tr.id} value={`t:${tr.id}`}>{tr.label || t('sch.notes.truss', 'Traverse')}</option>
            ))}
            {ordered.map((f) => (
              <option key={f.id} value={`f:${f.id}`}>
                {f.channel != null ? `${f.channel} · ` : ''}{f.fixture.name}
              </option>
            ))}
          </select>
          <input
            className="focus-note"
            placeholder={t('sch.notes.ph', 'Notiz – z. B. zu heiß auf der SL-Wand, CTO rein…')}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitNote(); }}
          />
          <button className="focus-locate" title={t('sch.notes.add', 'Notiz anlegen')} onClick={submitNote}>
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
                <button className={`focus-tick ${n.done ? 'on' : ''}`} title={t('sch.notes.done', 'erledigt')}
                  onClick={() => onToggleNote(n.id)}>
                  {n.done && <Icon name="check" size={14} />}
                </button>
                <span className="focus-info">
                  <b>{n.text}</b>
                  <span>{[n.by, n.at.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ')}</span>
                </span>
                {g.target.kind === 'fixture' && (
                  <button className="focus-locate" title={t('sch.locate', 'Im Plan zeigen')}
                    onClick={() => onLocate([g.target.kind === 'fixture' ? g.target.fixtureId : ''])}>
                    <Icon name="select" size={15} />
                  </button>
                )}
                <button className="focus-locate" title={t('sch.notes.remove', 'Notiz entfernen')}
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
          <div className="schedule-subhead">{t('sch.notes.stale', 'Ziel entfernt')} · {verwaist.length}</div>
          <div className="focus-rows">
            {verwaist.map((n) => (
              <div key={n.id} className="focus-row">
                <span className="focus-info"><b>{n.text}</b><span>{n.at.slice(0, 16).replace('T', ' ')}</span></span>
                <button className="focus-locate" title={t('sch.notes.remove', 'Notiz entfernen')}
                  onClick={() => onRemoveNote(n.id)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="prop-derived">
        {t('sch.notes.hint', 'Die Notizen bleiben in dieser Projektdatei. Sie gehen in keinen Fremdformat-Export (MVR, Venue-Austausch) — sie gehören dir, nicht der Show-Datei eines Pults.')}
      </div>
    </div>
  );

  const focusPanel = (
    <div className="focus-tool">
      <div className="focus-progress">
        <div className="fp-bar"><i style={{ width: `${fixtures.length ? (focusedCount / fixtures.length) * 100 : 0}%` }} /></div>
        <span className="fp-label">{focusedCount} {t('sch.of', 'von')} {fixtures.length} {t('sch.focused', 'fokussiert')}</span>
      </div>
      {focusGroups.map((g) => (
        <div key={g.name} className="focus-group">
          <div className="schedule-subhead">{g.name} · {g.fs.filter((f) => f.focused).length}/{g.fs.length}</div>
          <div className="focus-rows">
            {g.fs.map((f) => (
              <div key={f.id} className={`focus-row ${f.focused ? 'done' : ''}`}>
                <button className={`focus-tick ${f.focused ? 'on' : ''}`} title={t('sch.focused', 'fokussiert')}
                  onClick={() => onUpdateFixture(f.id, { focused: !f.focused })}>
                  {f.focused && <Icon name="check" size={14} />}
                </button>
                <span className="focus-ch">{f.channel ?? '–'}</span>
                <span className="focus-info">
                  <b>{f.fixture.name}</b>
                  <span>{f.purpose || '—'} · {t('sch.target', 'Ziel')} {f.aimX},{f.aimY}</span>
                </span>
                <input className="focus-note" placeholder={t('sch.focusNotePh', 'Fokus-Notiz – z. B. Gesicht Solist, harte Kante…')}
                  value={f.focusNote ?? ''} onChange={(e) => onUpdateFixture(f.id, { focusNote: e.target.value })} />
                <button className="focus-locate" title={t('sch.locate', 'Im Plan zeigen')} onClick={() => onLocate([f.id])}><Icon name="select" size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="prop-derived">{t('sch.focusNote', 'Live beim Einleuchten: abhaken, Fokus-Notiz je Leuchte erfassen, im Plan finden. Wird im Projekt gespeichert und im Schedule-CSV exportiert.')}</div>
    </div>
  );

  const checkPanel = (
    <>
      <div className="rig-pills">
        <span className={`rig-pill ${ic.errors ? 'err' : 'off'}`}>{ic.errors} Fehler</span>
        <span className={`rig-pill ${ic.warnings ? 'warn' : 'off'}`}>{ic.warnings} Warnungen</span>
        <span className="rig-pill info">{ic.infos} Hinweise</span>
      </div>
      {issues.length === 0 ? (
        <div className="rig-clean">✓ {t('sch.checkClean', 'Keine Probleme gefunden.')}</div>
      ) : (
        <ul className="rig-issues">
          {issues.map((i, k) => {
            const locatable = !!i.ids && i.ids.length > 0;
            return (
              <li key={k} className={`rig-issue sev-${i.severity} ${locatable ? 'locatable' : ''}`}
                onClick={locatable ? () => onLocate(i.ids!) : undefined}
                title={locatable ? t('sch.locateAffected', 'Betroffene Leuchten im Plan zeigen') : undefined}>
                <span className="rig-dot" />{i.message}
                {locatable && <Icon name="chevronRight" size={14} className="rig-go" />}
              </li>
            );
          })}
        </ul>
      )}
      <div className="prop-derived">{t('sch.checkScope', 'Geprüft: DMX-Überlappung, doppelte Kanäle, ungepatchte Movers, Traversen-Last, Strom-Headroom.')}</div>
    </>
  );

  const photoPanel = photo ? (
    <>
      <div className="schedule-cards">
        <div className="schedule-card"><span className="sc-val">{lx(photo.avg)} lx</span><span className="sc-label">{t('sch.avg', 'Mittel (Eavg)')}</span></div>
        <div className="schedule-card"><span className="sc-val">{lx(photo.min)} lx</span><span className="sc-label">{t('sch.min', 'Minimum')}</span></div>
        <div className="schedule-card"><span className="sc-val">{lx(photo.max)} lx</span><span className="sc-label">{t('sch.max', 'Maximum')}</span></div>
        <div className={`schedule-card photo-${photo.u0 >= 0.6 ? 'ok' : photo.u0 >= 0.4 ? 'warn' : 'bad'}`}>
          <span className="sc-val">{photo.u0.toFixed(2)}</span><span className="sc-label">U0 = Emin/Eavg · {photo.rating}</span>
        </div>
        <div className="schedule-card"><span className="sc-val">{photo.u2.toFixed(2)}</span><span className="sc-label">U2 = Emin/Emax</span></div>
        <div className="schedule-card"><span className="sc-val">{photo.areaM2.toFixed(1)} m²</span><span className="sc-label">{t('sch.lit', 'ausgeleuchtet')}</span></div>
      </div>
      <div className="prop-derived">{t('sch.photoNote', 'Richtwert (DIN EN 12464 / CIBSE): U0 ≥ 0,6 gut · ≥ 0,4 akzeptabel. Werte über die ausgeleuchtete Bühnenfläche (gleiche Engine wie die Heatmap).')}</div>
    </>
  ) : (
    <div className="tool-empty">{t('sch.photoEmpty', 'Keine beleuchteten Leuchten – Photometrie nicht verfügbar.')}</div>
  );

  const loadPanel = (
    <>
      <h4 className="schedule-subhead">{t('sch.power', 'Leistung')}</h4>
      <div className="schedule-cards">
        <div className="schedule-card"><span className="sc-val">{(power.totalWatts / 1000).toFixed(2)} kW</span><span className="sc-label">{t('sch.totalPower', 'Gesamtleistung')}</span></div>
        <div className="schedule-card"><span className="sc-val">{power.amps1ph.toFixed(1)} A</span><span className="sc-label">{t('sch.singlePhase', '@ 230 V (1-phasig)')}</span></div>
        <div className="schedule-card"><span className="sc-val">{power.ampsPerPhase.toFixed(1)} A</span><span className="sc-label">{t('sch.perPhase', 'pro Phase (3×230 V)')}</span></div>
        <div className="schedule-card"><span className="sc-val">{circuits.length}×</span><span className="sc-label">{t('sch.circuits', 'Stromkreise (16 A, 3 kW)')}</span></div>
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
      <h4 className="schedule-subhead">{t('sch.loadPerTruss', 'Last pro Traverse')} · {totalWeight.toFixed(1)} kg {t('sch.total', 'gesamt')}</h4>
      <table className="schedule-table">
        <thead><tr><th>{t('sch.truss', 'Traverse')}</th><th>{t('sch.fixtures', 'Leuchten')}</th><th>{t('sch.load', 'Last')}</th><th>{t('sch.capacity', 'Traglast')}</th><th>{t('sch.utilisation', 'Auslastung')}</th></tr></thead>
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
            <tr className="row-muted"><td>{t('sch.floorFree', 'Boden / freistehend')}</td><td>{loads.unassigned.count}</td><td>{loads.unassigned.weightKg.toFixed(1)} kg</td><td>–</td><td>–</td></tr>
          )}
          {loads.perTruss.length === 0 && loads.unassigned.count === 0 && (
            <tr><td colSpan={5} className="row-muted">{t('sch.noneAssigned', 'Keine Leuchten zugeordnet.')}</td></tr>
          )}
        </tbody>
      </table>
    </>
  );

  const exportPanel = (
    <div className="export-list">
      <div className="export-row">
        <Icon name="schedule" size={22} className="er-icon" />
        <div className="er-text"><b>{t('sch.exp.schedule', 'Instrument Schedule (CSV)')}</b><span>{t('sch.exp.scheduleNote', 'Patch, Position, Gel & Zweck je Leuchte – für Tabellenkalkulation.')}</span></div>
        <button className="btn-secondary" onClick={exportSchedule}>⬇ CSV</button>
      </div>
      <div className="export-row">
        <Icon name="library" size={22} className="er-icon" />
        <div className="er-text"><b>{t('sch.exp.inventory', 'Geräteliste (CSV)')}</b><span>{t('sch.exp.inventoryNote', 'Stückzahlen je Typ mit Leistung & Gewicht – für Bestellung/Disposition.')}</span></div>
        <button className="btn-secondary" onClick={exportInventory}>⬇ CSV</button>
      </div>
      <div className="export-row">
        <Icon name="heatmap" size={22} className="er-icon" />
        <div className="er-text"><b>{t('sch.exp.colours', 'Farbliste (CSV)')}</b><span>{t('sch.exp.coloursNote', 'Gel-Schnitte je Code – für Farb-Bestellung & Vorbereitung.')}</span></div>
        <button className="btn-secondary" onClick={exportColors} disabled={colors.length === 0}>⬇ CSV</button>
      </div>
      <div className="export-row">
        <Icon name="cube3d" size={22} className="er-icon" />
        <div className="er-text">
          <b>MVR (GDTF/MVR)</b>
          <span>
            {t('sch.exp.mvrNote', 'Lampen mit Positionen & Patch – öffnet in Capture, grandMA3, WYSIWYG, Vectorworks, BlenderDMX.')}
            {/* ADR-005, Regel 3 — die Szene enthaelt nur Fixtures. Vorher stand
                hier „Rig", und die Traverse IST das Rig: der Nutzer bekam eine
                Zusage, die die Datei nicht haelt. */}
            {trusses.length > 0 && (
              <>
                {' '}
                <b>{trusses.length} {t('sch.exp.mvrNoTruss', 'Traverse(n) sind nicht enthalten')}</b>{' '}
                {t('sch.exp.mvrOnlyFixtures', '– MVR bildet hier nur die Lampen ab.')}
              </>
            )}
          </span>
        </div>
        <button className="btn-secondary" onClick={exportMvr}>⬇ .mvr</button>
      </div>
    </div>
  );

  const panels: Record<Tab, React.ReactNode> = { list: listPanel, magic: magicPanel, focus: focusPanel, notes: notesPanel, check: checkPanel, photo: photoPanel, load: loadPanel, export: exportPanel };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal tool-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tool-head">
          <h3><Icon name={TABS.find((x) => x.id === tab)!.icon} size={18} /> {activeLabel}</h3>
          <button className="fp-icon-btn fp-close" onClick={onClose} title={t('common.close', 'Schließen')}>✕</button>
        </div>
        {fixtures.length === 0 ? (
          <div className="tool-empty-wrap"><p className="dialog-hint">{t('sch.empty', 'Noch keine Leuchten platziert.')}</p></div>
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
