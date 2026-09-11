import React, { useState } from 'react';
import Icon from './Icon';
import type { Fixture, Truss } from '../types';
import { fixtureLibrary } from '../core/fixtureLibrary';
import type { ThreePointConfig } from '../core/autoLighting';
import { useTranslation } from '../i18n';

interface Props {
  targetLux: number; // from heatmap target, 0 = off
  trusses: Truss[];
  onGenerate: (config: ThreePointConfig) => void;
  onCancel: () => void;
}

// Die Beschriftungen stehen auf Modulebene und koennen den Hook nicht
// aufrufen. Deshalb traegt jeder Eintrag seinen Schluessel mit; uebersetzt
// wird beim Rendern, wo `t` verfuegbar ist.
const CONTRAST_PRESETS = [
  { key: 'dlg.3pt.ratio15', label: '1.5:1 – Sehr weich (Flat/TV)', value: 1.5 },
  { key: 'dlg.3pt.ratio2', label: '2:1 – Weich (Deakins Standard)', value: 2 },
  { key: 'dlg.3pt.ratio3', label: '3:1 – Natürlich', value: 3 },
  { key: 'dlg.3pt.ratio4', label: '4:1 – Dramatisch', value: 4 },
  { key: 'dlg.3pt.ratio8', label: '8:1 – Noir / Low-Key', value: 8 },
];

const ThreePointDialog: React.FC<Props> = ({ targetLux, trusses, onGenerate, onCancel }) => {
  const { t } = useTranslation();
  const [keyId, setKeyId] = useState('etc-s4-26');
  const [fillId, setFillId] = useState('fresnel-1kw');
  const [backId, setBackId] = useState('etc-s4-36');
  const [contrastRatio, setContrastRatio] = useState(2);
  const [backRatio, setBackRatio] = useState(1.0);
  const [keyDim, setKeyDim] = useState(100);
  const [localTargetLux, setLocalTargetLux] = useState(targetLux);
  const [trussId, setTrussId] = useState('');
  const [distance, setDistance] = useState(4);

  const handleSubmit = () => {
    const keyF = fixtureLibrary.find((f) => f.id === keyId) ?? fixtureLibrary[0];
    const fillF = fixtureLibrary.find((f) => f.id === fillId) ?? fixtureLibrary[0];
    const backF = fixtureLibrary.find((f) => f.id === backId) ?? fixtureLibrary[0];
    const sel = trusses.find((tr) => tr.id === trussId);
    onGenerate({
      keyFixture: keyF,
      fillFixture: fillF,
      backFixture: backF,
      contrastRatio,
      backRatio,
      targetLux: localTargetLux,
      keyDimming: keyDim,
      truss: sel ? { x1: sel.x1, y1: sel.y1, x2: sel.x2, y2: sel.y2, height: sel.height } : undefined,
      throwDistance: distance,
    });
  };

  const useTargetMode = localTargetLux > 0;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal three-point-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('dlg.3pt.title', 'Configure three-point lighting')}</h3>
        <p className="dialog-hint">
          {t('dlg.3pt.hint', 'Lighting the way a cinematographer would: the key sets the brightness, the fill follows from the contrast ratio, the back light is the accent.')}
        </p>

        {/* Target Lux */}
        <div className="three-point-role">
          <div className="three-point-role-label"><Icon name="tag" size={13} />{t('dlg.3pt.goal', 'Lighting target')}</div>
          <div className="three-point-dim">
            <span>{t('dlg.3pt.keyTarget', 'Key target')}</span>
            <input type="number" min={0} max={100000} step={10}
              value={localTargetLux}
              onChange={(e) => setLocalTargetLux(Number(e.target.value))}
              style={{ width: 80, textAlign: 'right' }}
            />
            <span>lx</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {useTargetMode
              ? t('dlg.3pt.dimmedTo', 'Key is dimmed to {key} lx, fill to {fill} lx')
                  .replace('{key}', String(localTargetLux))
                  .replace('{fill}', String(Math.round(localTargetLux / contrastRatio)))
              : t('dlg.3pt.manual', 'Manual: the key dimmer is used as set')}
          </div>
        </div>

        {/* Position: truss + distance so throws aren't random */}
        <div className="three-point-role">
          <div className="three-point-role-label"><Icon name="plan2d" size={13} />{t('dlg.3pt.position', 'Fixture positions')}</div>
          <select value={trussId} onChange={(e) => setTrussId(e.target.value)}>
            <option value="">{t('dlg.3pt.freePos', 'Free position (no truss)')}</option>
            {trusses.map((tr, i) => (
              <option key={tr.id} value={tr.id}>{tr.label || `${t('dlg.3pt.trussN', 'Truss')} ${i + 1}`} · h={tr.height} m</option>
            ))}
          </select>
          <label className="three-point-dim" style={{ marginTop: 6 }}>
            <span>{t('dlg.3pt.distance', 'Distance to the person')}</span>
            <input type="range" min={1.5} max={12} step={0.5} value={distance}
              onChange={(e) => setDistance(Number(e.target.value))} />
            <span className="dim-val">{distance.toFixed(1)} m</span>
          </label>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {trussId
              ? t('dlg.3pt.onTruss', 'Key and fill go onto the truss (same height, clean spacing). The back light stays behind the person.')
              : t('dlg.3pt.noTruss', 'Without a truss: key and fill stand at the distance set here (instead of at random).')}
          </div>
        </div>

        {/* Contrast Ratio */}
        <div className="three-point-role">
          <div className="three-point-role-label"><Icon name="distribute" size={13} />{t('dlg.3pt.ratio', 'Contrast ratio (key : fill)')}</div>
          <select value={contrastRatio}
            onChange={(e) => setContrastRatio(Number(e.target.value))}>
            {CONTRAST_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{t(p.key, p.label)}</option>
            ))}
          </select>
          <div className="three-point-dim" style={{ marginTop: 6 }}>
            <span>{t('dlg.3pt.backStrength', 'Back strength')}</span>
            <input type="range" min={0.3} max={2.0} step={0.1}
              value={backRatio}
              onChange={(e) => setBackRatio(Number(e.target.value))} />
            <span className="dim-val">{backRatio.toFixed(1)}×</span>
          </div>
        </div>

        {/* Fixture selectors */}
        <div className="three-point-role">
          <div className="three-point-role-label"><Icon name="beam" size={13} />{t('dlg.3pt.key', 'Key (main light)')}</div>
          <select value={keyId} onChange={(e) => setKeyId(e.target.value)}>
            {fixtureLibrary.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.manufacturer}) – {f.beamAngle}°</option>
            ))}
          </select>
          {!useTargetMode && (
            <label className="three-point-dim">
              <span>{t('dlg.3pt.dimmer', 'Dimmer')}</span>
              <input type="range" min={0} max={100} value={keyDim}
                onChange={(e) => setKeyDim(Number(e.target.value))} />
              <span className="dim-val">{keyDim}%</span>
            </label>
          )}
        </div>

        <div className="three-point-role">
          <div className="three-point-role-label"><Icon name="heatmap" size={13} />{t('dlg.3pt.fill', 'Fill')}</div>
          <select value={fillId} onChange={(e) => setFillId(e.target.value)}>
            {fixtureLibrary.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.manufacturer}) – {f.beamAngle}°</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {useTargetMode
              ? t('dlg.3pt.calcLux', 'Dimmer is calculated: ~{lx} lx')
                  .replace('{lx}', String(Math.round(localTargetLux / contrastRatio)))
              : t('dlg.3pt.calcRatio', 'Dimmer is calculated: key/{ratio}')
                  .replace('{ratio}', String(contrastRatio))}
          </div>
        </div>

        <div className="three-point-role">
          <div className="three-point-role-label"><Icon name="autolight" size={13} />{t('dlg.3pt.back', 'Back (rim light)')}</div>
          <select value={backId} onChange={(e) => setBackId(e.target.value)}>
            {fixtureLibrary.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.manufacturer}) – {f.beamAngle}°</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {t('dlg.3pt.backIntensity', 'Back intensity:')} {backRatio.toFixed(1)}× Key
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
          <button className="primary" onClick={handleSubmit}>{t('dlg.3pt.generate', 'Generate')}</button>
        </div>
      </div>
    </div>
  );
};

export default ThreePointDialog;
