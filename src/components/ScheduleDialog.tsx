import React, { useState } from 'react';
import type { PlacedFixture, Truss, Wall, Ceiling } from '../types';
import { computePower, fixtureCounts, footprint, trussLoads, circuitBreakdown } from '../core/patch';
import { rigCheck, issueCounts } from '../core/rigCheck';
import { photometricReport, type EvalArea } from '../core/photometrics';
import { buildMvr } from '../core/mvrExport';
import { gelLibrary } from '../core/gelLibrary';
import Icon from './Icon';
import type { IconName } from './Icon';

interface Props {
  fixtures: PlacedFixture[];
  trusses: Truss[];
  walls: Wall[];
  ceilings: Ceiling[];
  area: EvalArea | null;
  projectName: string;
  conflicts: Set<string>;
  onAutoNumber: () => void;
  onAutoPatch: () => void;
  onClose: () => void;
}

type Tab = 'list' | 'check' | 'photo' | 'load' | 'export';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'list', label: 'Geräteliste & Patch', icon: 'schedule' },
  { id: 'check', label: 'Prüfung', icon: 'check' },
  { id: 'photo', label: 'Photometrie', icon: 'heatmap' },
  { id: 'load', label: 'Last & Strom', icon: 'truss' },
  { id: 'export', label: 'Export', icon: 'export' },
];

const gelCodes = (ids?: string[]) =>
  (ids ?? []).map((id) => gelLibrary.find((g) => g.id === id)?.code ?? '').filter(Boolean).join('+');

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(';')).join('\r\n');
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

const lx = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString());
const utilClass = (u: number) => (u >= 1 ? 'util-over' : u >= 0.8 ? 'util-warn' : 'util-ok');

// A focused multi-tool hub for paperwork, validation, analysis and interchange.
// Each tab is one job, so no single view is overloaded.
const ScheduleDialog: React.FC<Props> = ({ fixtures, trusses, walls, ceilings, area, projectName, conflicts, onAutoNumber, onAutoPatch, onClose }) => {
  const [tab, setTabState] = useState<Tab>(() => {
    try { const t = localStorage.getItem('lp-tool-tab'); if (t && TABS.some((x) => x.id === t)) return t as Tab; } catch { /* ignore */ }
    return 'list';
  });
  const setTab = (t: Tab) => { setTabState(t); try { localStorage.setItem('lp-tool-tab', t); } catch { /* ignore */ } };

  const counts = fixtureCounts(fixtures);
  const power = computePower(fixtures);
  const totalWeight = fixtures.reduce((s, f) => s + (f.fixture.weight || 0), 0);
  const issues = rigCheck(fixtures, trusses);
  const ic = issueCounts(issues);
  const photo = photometricReport(fixtures, walls, ceilings, area);
  const loads = trussLoads(fixtures, trusses);
  const circuits = circuitBreakdown(fixtures);
  const checkBadge = ic.errors + ic.warnings;

  const ordered = [...fixtures].sort((a, b) => (a.channel ?? 1e9) - (b.channel ?? 1e9) || a.y - b.y || a.x - b.x);
  const safe = (projectName || 'lichtplan').replace(/[^\w.-]+/g, '_');

  const exportSchedule = () => {
    const header = ['Unit', 'Kanal', 'Universe', 'Adresse', 'Typ', 'Hersteller', 'X (m)', 'Y (m)', 'Höhe (m)', 'Gel', 'Zweck', 'W', 'kg'];
    const rows = ordered.map((f) => [
      f.unitNumber ?? '', f.channel ?? '', f.universe ?? '', f.dmxAddress ?? '',
      f.fixture.name, f.fixture.manufacturer, f.x, f.y, f.mountingHeight,
      gelCodes(f.gelFilterIds), f.purpose ?? '', f.fixture.wattage, f.fixture.weight,
    ]);
    downloadCsv('instrument-schedule.csv', [header, ...rows]);
  };
  const exportInventory = () => {
    const header = ['Anzahl', 'Hersteller', 'Typ', 'W/Stk', 'kg/Stk', 'W gesamt', 'kg gesamt'];
    const rows = counts.map((c) => [c.count, c.manufacturer, c.name, c.watts, c.weight, c.count * c.watts, (c.count * c.weight).toFixed(1)]);
    downloadCsv('geraeteliste.csv', [header, ...rows]);
  };
  const exportMvr = () => {
    const data = buildMvr(fixtures, trusses, projectName);
    triggerDownload(new Blob([data as BlobPart], { type: 'application/octet-stream' }), `${safe}.mvr`);
  };

  const activeLabel = TABS.find((t) => t.id === tab)!.label;

  // ── per-tool panels ──
  const listPanel = (
    <>
      <div className="schedule-actions">
        <button className="btn-secondary" onClick={onAutoNumber}>① Auto-Nummerieren</button>
        <button className="btn-secondary" onClick={onAutoPatch}>② Auto-Patch (DMX)</button>
      </div>
      <h4 className="schedule-subhead">Inventar ({fixtures.length} Leuchten, {counts.length} Typen)</h4>
      <table className="schedule-table">
        <thead><tr><th>Anz.</th><th>Hersteller</th><th>Typ</th><th>W/Stk</th><th>W ges.</th><th>kg ges.</th></tr></thead>
        <tbody>
          {counts.map((c) => (
            <tr key={c.manufacturer + c.name}>
              <td><strong>{c.count}</strong></td><td>{c.manufacturer}</td><td>{c.name}</td>
              <td>{c.watts}</td><td>{c.count * c.watts}</td><td>{(c.count * c.weight).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className="schedule-subhead">Instrument Schedule</h4>
      <table className="schedule-table">
        <thead><tr><th>Unit</th><th>Ch</th><th>DMX</th><th>Typ</th><th>Pos (x,y,h)</th><th>Gel</th><th>Zweck</th></tr></thead>
        <tbody>
          {ordered.map((f) => (
            <tr key={f.id} className={conflicts.has(f.id) ? 'row-conflict' : ''}>
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
    </>
  );

  const checkPanel = (
    <>
      <div className="rig-pills">
        <span className={`rig-pill ${ic.errors ? 'err' : 'off'}`}>{ic.errors} Fehler</span>
        <span className={`rig-pill ${ic.warnings ? 'warn' : 'off'}`}>{ic.warnings} Warnungen</span>
        <span className="rig-pill info">{ic.infos} Hinweise</span>
      </div>
      {issues.length === 0 ? (
        <div className="rig-clean">✓ Keine Probleme gefunden.</div>
      ) : (
        <ul className="rig-issues">
          {issues.map((i, k) => (
            <li key={k} className={`rig-issue sev-${i.severity}`}><span className="rig-dot" />{i.message}</li>
          ))}
        </ul>
      )}
      <div className="prop-derived">Geprüft: DMX-Überlappung, doppelte Kanäle, ungepatchte Movers, Traversen-Last, Strom-Headroom.</div>
    </>
  );

  const photoPanel = photo ? (
    <>
      <div className="schedule-cards">
        <div className="schedule-card"><span className="sc-val">{lx(photo.avg)} lx</span><span className="sc-label">Mittel (Eavg)</span></div>
        <div className="schedule-card"><span className="sc-val">{lx(photo.min)} lx</span><span className="sc-label">Minimum</span></div>
        <div className="schedule-card"><span className="sc-val">{lx(photo.max)} lx</span><span className="sc-label">Maximum</span></div>
        <div className={`schedule-card photo-${photo.u0 >= 0.6 ? 'ok' : photo.u0 >= 0.4 ? 'warn' : 'bad'}`}>
          <span className="sc-val">{photo.u0.toFixed(2)}</span><span className="sc-label">U0 = Emin/Eavg · {photo.rating}</span>
        </div>
        <div className="schedule-card"><span className="sc-val">{photo.u2.toFixed(2)}</span><span className="sc-label">U2 = Emin/Emax</span></div>
        <div className="schedule-card"><span className="sc-val">{photo.areaM2.toFixed(1)} m²</span><span className="sc-label">ausgeleuchtet</span></div>
      </div>
      <div className="prop-derived">Richtwert (DIN EN 12464 / CIBSE): U0 ≥ 0,6 gut · ≥ 0,4 akzeptabel. Werte über die ausgeleuchtete Bühnenfläche (gleiche Engine wie die Heatmap).</div>
    </>
  ) : (
    <div className="tool-empty">Keine beleuchteten Leuchten – Photometrie nicht verfügbar.</div>
  );

  const loadPanel = (
    <>
      <h4 className="schedule-subhead">Leistung</h4>
      <div className="schedule-cards">
        <div className="schedule-card"><span className="sc-val">{(power.totalWatts / 1000).toFixed(2)} kW</span><span className="sc-label">Gesamtleistung</span></div>
        <div className="schedule-card"><span className="sc-val">{power.amps1ph.toFixed(1)} A</span><span className="sc-label">@ 230 V (1-phasig)</span></div>
        <div className="schedule-card"><span className="sc-val">{power.ampsPerPhase.toFixed(1)} A</span><span className="sc-label">pro Phase (3×230 V)</span></div>
        <div className="schedule-card"><span className="sc-val">{circuits.length}×</span><span className="sc-label">Stromkreise (16 A, 3 kW)</span></div>
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
      <h4 className="schedule-subhead">Last pro Traverse · {totalWeight.toFixed(1)} kg gesamt</h4>
      <table className="schedule-table">
        <thead><tr><th>Traverse</th><th>Leuchten</th><th>Last</th><th>Traglast</th><th>Auslastung</th></tr></thead>
        <tbody>
          {loads.perTruss.map((t) => (
            <tr key={t.id} className={t.overloaded ? 'row-conflict' : ''}>
              <td>{t.label}</td><td>{t.fixtureCount}</td><td>{t.weightKg.toFixed(1)} kg</td><td>{t.capacityKg} kg</td>
              <td>
                <span className={`util-bar ${utilClass(t.utilization)}`}><i style={{ width: `${Math.min(100, t.utilization * 100)}%` }} /></span>
                <span className="util-pct">{Math.round(t.utilization * 100)} %{t.overloaded ? ' ⚠' : ''}</span>
              </td>
            </tr>
          ))}
          {loads.unassigned.count > 0 && (
            <tr className="row-muted"><td>Boden / freistehend</td><td>{loads.unassigned.count}</td><td>{loads.unassigned.weightKg.toFixed(1)} kg</td><td>–</td><td>–</td></tr>
          )}
          {loads.perTruss.length === 0 && loads.unassigned.count === 0 && (
            <tr><td colSpan={5} className="row-muted">Keine Leuchten zugeordnet.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );

  const exportPanel = (
    <div className="export-list">
      <div className="export-row">
        <Icon name="schedule" size={22} className="er-icon" />
        <div className="er-text"><b>Instrument Schedule (CSV)</b><span>Patch, Position, Gel & Zweck je Leuchte – für Tabellenkalkulation.</span></div>
        <button className="btn-secondary" onClick={exportSchedule}>⬇ CSV</button>
      </div>
      <div className="export-row">
        <Icon name="library" size={22} className="er-icon" />
        <div className="er-text"><b>Geräteliste (CSV)</b><span>Stückzahlen je Typ mit Leistung & Gewicht – für Bestellung/Disposition.</span></div>
        <button className="btn-secondary" onClick={exportInventory}>⬇ CSV</button>
      </div>
      <div className="export-row">
        <Icon name="cube3d" size={22} className="er-icon" />
        <div className="er-text"><b>MVR (GDTF/MVR)</b><span>Rig mit Positionen & Patch – öffnet in Capture, grandMA3, WYSIWYG, Vectorworks, BlenderDMX.</span></div>
        <button className="btn-secondary" onClick={exportMvr}>⬇ .mvr</button>
      </div>
    </div>
  );

  const panels: Record<Tab, React.ReactNode> = { list: listPanel, check: checkPanel, photo: photoPanel, load: loadPanel, export: exportPanel };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal tool-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tool-head">
          <h3><Icon name={TABS.find((t) => t.id === tab)!.icon} size={18} /> {activeLabel}</h3>
          <button className="fp-icon-btn fp-close" onClick={onClose} title="Schließen">✕</button>
        </div>
        {fixtures.length === 0 ? (
          <div className="tool-empty-wrap"><p className="dialog-hint">Noch keine Leuchten platziert.</p></div>
        ) : (
          <div className="tool-body">
            <nav className="tool-nav">
              {TABS.map((t) => (
                <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                  <Icon name={t.icon} size={16} /><span>{t.label}</span>
                  {t.id === 'check' && checkBadge > 0 && <span className={`nav-badge ${ic.errors ? 'err' : 'warn'}`}>{checkBadge}</span>}
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
