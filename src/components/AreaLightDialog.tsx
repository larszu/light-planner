import React, { useState } from 'react';
import type { LightSide, LightArea, AreaLightConfig } from '../core/autoLighting';
import { fixtureLibrary } from '../core/fixtureLibrary';
import type { Fixture, Truss } from '../types';

interface Props {
  area: LightArea;
  defaultTargetLux: number;
  trusses: Truss[];
  onGenerate: (config: AreaLightConfig) => void;
  onCancel: () => void;
}

// Fixtures that make sense for an even wash (soft-edged / wide).
const WASH_CATEGORIES = ['fresnel', 'wash', 'flood', 'par', 'cyc', 'led-panel'];

const AreaLightDialog: React.FC<Props> = ({ area, defaultTargetLux, trusses, onGenerate, onCancel }) => {
  const [sides, setSides] = useState<Set<LightSide>>(new Set<LightSide>(['N', 'S']));
  const [targetLux, setTargetLux] = useState(defaultTargetLux > 0 ? defaultTargetLux : 1000);
  const washFixtures = fixtureLibrary.filter((f) => WASH_CATEGORIES.includes(f.category));
  const [fixtureId, setFixtureId] = useState((washFixtures.find((f) => f.id === 'fresnel-1kw') ?? washFixtures[0])?.id);
  const [cross, setCross] = useState(true);
  const [trussId, setTrussId] = useState('');
  const [distance, setDistance] = useState(5);

  const w = (area.maxX - area.minX).toFixed(1);
  const d = (area.maxY - area.minY).toFixed(1);

  const toggle = (s: LightSide) => setSides((prev) => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });
  const setPreset = (arr: LightSide[]) => setSides(new Set(arr));

  const submit = () => {
    const t = trusses.find((tr) => tr.id === trussId);
    if (!t && sides.size === 0) return;
    const fixture = fixtureLibrary.find((f) => f.id === fixtureId) as Fixture | undefined;
    onGenerate({
      sides: [...sides], targetLux, fixture, cross,
      truss: t ? { x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, height: t.height } : undefined,
      throwDistance: distance,
    });
  };

  const SideBtn: React.FC<{ s: LightSide; label: string; cls: string }> = ({ s, label, cls }) => (
    <button
      type="button"
      className={`compass-btn ${cls} ${sides.has(s) ? 'on' : ''}`}
      onClick={() => toggle(s)}
      title={`Licht von ${label}`}
    >{label[0]}</button>
  );

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal area-light-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>🔆 Fläche ausleuchten</h3>
        <p className="dialog-hint">
          Markierte Fläche <strong>{w} × {d} m</strong>. Wähle, von welchen Seiten das Licht kommen soll –
          der Ziel-Lux-Wert wird unabhängig von der Seitenzahl gleichmäßig erreicht.
        </p>

        <div className="area-light-body">
          <div className="compass">
            <SideBtn s="N" label="Norden" cls="c-n" />
            <SideBtn s="W" label="Westen" cls="c-w" />
            <div className="compass-center">Fläche</div>
            <SideBtn s="E" label="Osten" cls="c-e" />
            <SideBtn s="S" label="Süden" cls="c-s" />
          </div>

          <div className="area-light-controls">
            <div className="preset-row">
              <button type="button" className="btn-secondary" onClick={() => setPreset(['N'])}>Einseitig (N)</button>
              <button type="button" className="btn-secondary" onClick={() => setPreset(['N', 'S'])}>Über Kreuz N–S</button>
              <button type="button" className="btn-secondary" onClick={() => setPreset(['E', 'W'])}>Über Kreuz O–W</button>
              <button type="button" className="btn-secondary" onClick={() => setPreset(['N', 'E', 'S', 'W'])}>Alle Seiten</button>
            </div>

            <label className="area-field">
              <span>Ziel-Beleuchtung</span>
              <span className="area-input-unit">
                <input type="number" min={1} step={50} value={targetLux}
                  onChange={(e) => setTargetLux(Number(e.target.value))} />
                <span>lx</span>
              </span>
            </label>

            <label className="area-field">
              <span>Leuchtentyp</span>
              <select value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
                {washFixtures.map((f) => (
                  <option key={f.id} value={f.id}>{f.manufacturer} {f.name}</option>
                ))}
              </select>
            </label>

            {/* Straight vs cross beams */}
            <label className="area-field">
              <span>Verteilung</span>
              <span className="dist-toggle">
                <button type="button" className={!cross ? 'on' : ''} onClick={() => setCross(false)}>Gerade</button>
                <button type="button" className={cross ? 'on' : ''} onClick={() => setCross(true)}>Über Kreuz</button>
              </span>
            </label>

            {/* Truss & distance so throws aren't random */}
            <label className="area-field">
              <span>Truss</span>
              <select value={trussId} onChange={(e) => setTrussId(e.target.value)}>
                <option value="">Seiten (siehe Kompass)</option>
                {trusses.map((t, i) => (
                  <option key={t.id} value={t.id}>{t.label || `Traverse ${i + 1}`} · h={t.height} m</option>
                ))}
              </select>
            </label>

            {!trussId && (
              <label className="area-field">
                <span>Abstand / Wurf</span>
                <span className="area-input-unit">
                  <input type="number" min={1} step={0.5} value={distance}
                    onChange={(e) => setDistance(Number(e.target.value))} />
                  <span>m</span>
                </span>
              </label>
            )}

            <div className="area-summary">
              {cross
                ? '⤬ Über Kreuz: Strahlen kreuzen sich – gleichmäßig & modellierend (McCandless). Geht auch nur von vorne.'
                : '‖ Gerade: parallele Strahlen, frontaler Look mit stärkerem Helligkeitsabfall.'}
              <div className="area-physics">
                Physik: Beleuchtungsstärke fällt mit 1/d² (Abstandsgesetz) und mit cos des Einfallswinkels.
                Zwei gekreuzte Lichter aus ~45° gleichen den Abfall der jeweils anderen Seite aus → gleichmäßiger
                und weniger flache Schatten als ein stumpf-frontales Licht.
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button className="btn-primary" onClick={submit} disabled={!trussId && sides.size === 0}>Erzeugen</button>
        </div>
      </div>
    </div>
  );
};

export default AreaLightDialog;
