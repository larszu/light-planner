import React from 'react';
import type { PlacedFixture } from '../types';
import { computePower, fixtureCounts, footprint } from '../core/patch';
import { gelLibrary } from '../core/gelLibrary';

interface Props {
  fixtures: PlacedFixture[];
  trussCount: number;
  conflicts: Set<string>;
  onAutoNumber: () => void;
  onAutoPatch: () => void;
  onClose: () => void;
}

const gelCodes = (ids?: string[]) =>
  (ids ?? []).map((id) => gelLibrary.find((g) => g.id === id)?.code ?? '').filter(Boolean).join('+');

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Instrument schedule, equipment inventory and electrical-load paperwork.
const ScheduleDialog: React.FC<Props> = ({ fixtures, trussCount, conflicts, onAutoNumber, onAutoPatch, onClose }) => {
  const counts = fixtureCounts(fixtures);
  const power = computePower(fixtures);
  const totalWeight = fixtures.reduce((s, f) => s + (f.fixture.weight || 0), 0);

  const ordered = [...fixtures].sort((a, b) => (a.channel ?? 1e9) - (b.channel ?? 1e9) || a.y - b.y || a.x - b.x);

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

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal schedule-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="schedule-head">
          <h3>📋 Geräteliste & Patch</h3>
          <button className="fp-icon-btn fp-close" onClick={onClose} title="Schließen">✕</button>
        </div>

        {fixtures.length === 0 ? (
          <p className="dialog-hint">Noch keine Leuchten platziert.</p>
        ) : (
          <>
            <div className="schedule-actions">
              <button className="btn-secondary" onClick={onAutoNumber}>① Auto-Nummerieren</button>
              <button className="btn-secondary" onClick={onAutoPatch}>② Auto-Patch (DMX)</button>
              <span className="schedule-actions-spacer" />
              <button className="btn-secondary" onClick={exportInventory}>⬇ Geräteliste CSV</button>
              <button className="btn-secondary" onClick={exportSchedule}>⬇ Schedule CSV</button>
            </div>

            {conflicts.size > 0 && (
              <div className="schedule-warning">⚠ {conflicts.size} Leuchte(n) mit überlappender DMX-Adresse</div>
            )}

            {/* Electrical load */}
            <div className="schedule-cards">
              <div className="schedule-card">
                <span className="sc-val">{(power.totalWatts / 1000).toFixed(2)} kW</span>
                <span className="sc-label">Gesamtleistung</span>
              </div>
              <div className="schedule-card">
                <span className="sc-val">{power.amps1ph.toFixed(1)} A</span>
                <span className="sc-label">@ 230 V (1-phasig)</span>
              </div>
              <div className="schedule-card">
                <span className="sc-val">{power.ampsPerPhase.toFixed(1)} A</span>
                <span className="sc-label">pro Phase (3×230 V)</span>
              </div>
              <div className="schedule-card">
                <span className="sc-val">{power.circuits16A}×</span>
                <span className="sc-label">16 A-Stromkreise</span>
              </div>
              <div className="schedule-card">
                <span className="sc-val">{totalWeight.toFixed(1)} kg</span>
                <span className="sc-label">Gesamtgewicht{trussCount > 0 ? ` · ${trussCount} Traverse(n)` : ''}</span>
              </div>
            </div>

            {/* Inventory */}
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

            {/* Instrument schedule */}
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
        )}
      </div>
    </div>
  );
};

export default ScheduleDialog;
