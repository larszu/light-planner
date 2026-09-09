import React, { useState } from 'react';
import type { LightSide, LightArea, AreaLightConfig } from '../core/autoLighting';
import { fixtureLibrary } from '../core/fixtureLibrary';
import { useTranslation } from '../i18n';
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
  const { t } = useTranslation();
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
    // Hiess frueher `t` -- seit die Uebersetzerfunktion so heisst, waere das
    // eine Verdeckung, die erst beim naechsten t()-Aufruf hier auffaellt.
    const sel = trusses.find((tr) => tr.id === trussId);
    if (!sel && sides.size === 0) return;
    const fixture = fixtureLibrary.find((f) => f.id === fixtureId) as Fixture | undefined;
    onGenerate({
      sides: [...sides], targetLux, fixture, cross,
      truss: sel ? { x1: sel.x1, y1: sel.y1, x2: sel.x2, y2: sel.y2, height: sel.height } : undefined,
      throwDistance: distance,
    });
  };

  const SideBtn: React.FC<{ s: LightSide; label: string; cls: string }> = ({ s, label, cls }) => (
    <button
      type="button"
      className={`compass-btn ${cls} ${sides.has(s) ? 'on' : ''}`}
      onClick={() => toggle(s)}
      title={`${t('dlg.area.lightFrom', 'Light from')} ${label}`}
    >{label[0]}</button>
  );

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal area-light-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>🔆 {t('dlg.area.title', 'Light up area')}</h3>
        {/* Zwei Schluessel statt einem: die Groesse steht fett MITTEN im Satz.
            Ein einziger Schluessel mit Platzhalter koennte die Auszeichnung
            nicht tragen, und ein Satz um das Markup herum zerschnitten ist die
            haeufigste Art, eine Uebersetzung unuebersetzbar zu machen. */}
        <p className="dialog-hint">
          {t('dlg.area.hintPre', 'Selected area')} <strong>{w} × {d} m</strong>
          {t('dlg.area.hintPost', '. Choose which sides the light should come from – the target lux is reached evenly no matter how many sides you pick.')}
        </p>

        <div className="area-light-body">
          <div className="compass">
            {/* Der Knopf zeigt den ERSTEN BUCHSTABEN des Labels (label[0]).
                Uebersetzt wird daraus im Englischen N/W/E/S statt N/W/O/S --
                die Himmelsrichtung stimmt in beiden Sprachen, weil sie aus
                demselben Wort kommt. */}
            <SideBtn s="N" label={t('dlg.area.north', 'North')} cls="c-n" />
            <SideBtn s="W" label={t('dlg.area.west', 'West')} cls="c-w" />
            <div className="compass-center">{t('dlg.area.area', 'Area')}</div>
            <SideBtn s="E" label={t('dlg.area.east', 'East')} cls="c-e" />
            <SideBtn s="S" label={t('dlg.area.south', 'South')} cls="c-s" />
          </div>

          <div className="area-light-controls">
            <div className="preset-row">
              <button type="button" className="btn-secondary" onClick={() => setPreset(['N'])}>{t('dlg.area.preset1', 'One side (N)')}</button>
              <button type="button" className="btn-secondary" onClick={() => setPreset(['N', 'S'])}>{t('dlg.area.presetNS', 'Crossed N–S')}</button>
              <button type="button" className="btn-secondary" onClick={() => setPreset(['E', 'W'])}>{t('dlg.area.presetEW', 'Crossed E–W')}</button>
              <button type="button" className="btn-secondary" onClick={() => setPreset(['N', 'E', 'S', 'W'])}>{t('dlg.area.presetAll', 'All sides')}</button>
            </div>

            <label className="area-field">
              <span>{t('dlg.area.targetLux', 'Target illuminance')}</span>
              <span className="area-input-unit">
                <input type="number" min={1} step={50} value={targetLux}
                  onChange={(e) => setTargetLux(Number(e.target.value))} />
                <span>lx</span>
              </span>
            </label>

            <label className="area-field">
              <span>{t('dlg.area.fixtureType', 'Fixture type')}</span>
              <select value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
                {washFixtures.map((f) => (
                  <option key={f.id} value={f.id}>{f.manufacturer} {f.name}</option>
                ))}
              </select>
            </label>

            {/* Straight vs cross beams */}
            <label className="area-field">
              <span>{t('dlg.area.distribution', 'Distribution')}</span>
              <span className="dist-toggle">
                <button type="button" className={!cross ? 'on' : ''} onClick={() => setCross(false)}>{t('dlg.area.straight', 'Straight')}</button>
                <button type="button" className={cross ? 'on' : ''} onClick={() => setCross(true)}>{t('dlg.area.cross', 'Crossed')}</button>
              </span>
            </label>

            {/* Truss & distance so throws aren't random */}
            <label className="area-field">
              <span>{t('dlg.area.truss', 'Truss')}</span>
              <select value={trussId} onChange={(e) => setTrussId(e.target.value)}>
                <option value="">{t('dlg.area.sidesOption', 'Sides (see compass)')}</option>
                {trusses.map((tr, i) => (
                  <option key={tr.id} value={tr.id}>{tr.label || `${t('dlg.area.trussN', 'Truss')} ${i + 1}`} · h={tr.height} m</option>
                ))}
              </select>
            </label>

            {!trussId && (
              <label className="area-field">
                <span>{t('dlg.area.throw', 'Distance / throw')}</span>
                <span className="area-input-unit">
                  <input type="number" min={1} step={0.5} value={distance}
                    onChange={(e) => setDistance(Number(e.target.value))} />
                  <span>m</span>
                </span>
              </label>
            )}

            <div className="area-summary">
              {cross
                ? t('dlg.area.crossHint', '⤬ Crossed: beams cross each other – even and modelling (McCandless). Works from the front alone, too.')
                : t('dlg.area.straightHint', '‖ Straight: parallel beams, frontal look with a steeper fall-off.')}
              <div className="area-physics">
                {t('dlg.area.physics', 'Physics: illuminance falls with 1/d² (inverse-square law) and with the cosine of the angle of incidence. Two beams crossed at ~45° each compensate the fall-off of the opposite side → more even, and with less flat shadows than a blunt frontal light.')}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
          <button className="btn-primary" onClick={submit} disabled={!trussId && sides.size === 0}>{t('dlg.area.generate', 'Generate')}</button>
        </div>
      </div>
    </div>
  );
};

export default AreaLightDialog;
