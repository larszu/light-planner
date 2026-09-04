import React, { useState } from 'react';
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
        <h3>{t('dlg.3pt.title', '3-Punkt-Beleuchtung konfigurieren')}</h3>
        <p className="dialog-hint">
          {t('dlg.3pt.hint', 'Beleuchtung im Stil eines Kameramanns: Key definiert die Helligkeit, Fill wird über das Kontrastverhältnis berechnet, Back als Akzent.')}
        </p>

        {/* Target Lux */}
        <div className="three-point-role">
          <div className="three-point-role-label">🎯 {t('dlg.3pt.goal', 'Beleuchtungsziel')}</div>
          <div className="three-point-dim">
            <span>{t('dlg.3pt.keyTarget', 'Key-Ziel')}</span>
            <input type="number" min={0} max={100000} step={10}
              value={localTargetLux}
              onChange={(e) => setLocalTargetLux(Number(e.target.value))}
              style={{ width: 80, textAlign: 'right' }}
            />
            <span>lx</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {useTargetMode
              ? t('dlg.3pt.dimmedTo', 'Key wird auf {key} lx gedimmt, Fill auf {fill} lx')
                  .replace('{key}', String(localTargetLux))
                  .replace('{fill}', String(Math.round(localTargetLux / contrastRatio)))
              : t('dlg.3pt.manual', 'Manuell: Key-Dimmer wird direkt verwendet')}
          </div>
        </div>

        {/* Position: truss + distance so throws aren't random */}
        <div className="three-point-role">
          <div className="three-point-role-label">📐 {t('dlg.3pt.position', 'Position der Leuchten')}</div>
          <select value={trussId} onChange={(e) => setTrussId(e.target.value)}>
            <option value="">{t('dlg.3pt.freePos', 'Freie Position (kein Truss)')}</option>
            {trusses.map((tr, i) => (
              <option key={tr.id} value={tr.id}>{tr.label || `${t('dlg.3pt.trussN', 'Traverse')} ${i + 1}`} · h={tr.height} m</option>
            ))}
          </select>
          <label className="three-point-dim" style={{ marginTop: 6 }}>
            <span>{t('dlg.3pt.distance', 'Abstand zur Person')}</span>
            <input type="range" min={1.5} max={12} step={0.5} value={distance}
              onChange={(e) => setDistance(Number(e.target.value))} />
            <span className="dim-val">{distance.toFixed(1)} m</span>
          </label>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {trussId
              ? t('dlg.3pt.onTruss', 'Key & Fill werden auf den Truss gesetzt (gleiche Höhe & saubere Abstände). Back bleibt hinter der Person.')
              : t('dlg.3pt.noTruss', 'Ohne Truss: Key/Fill stehen im eingestellten Abstand zur Person (statt zufällig).')}
          </div>
        </div>

        {/* Contrast Ratio */}
        <div className="three-point-role">
          <div className="three-point-role-label">⚖ {t('dlg.3pt.ratio', 'Kontrastverhältnis (Key : Fill)')}</div>
          <select value={contrastRatio}
            onChange={(e) => setContrastRatio(Number(e.target.value))}>
            {CONTRAST_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{t(p.key, p.label)}</option>
            ))}
          </select>
          <div className="three-point-dim" style={{ marginTop: 6 }}>
            <span>{t('dlg.3pt.backStrength', 'Back-Stärke')}</span>
            <input type="range" min={0.3} max={2.0} step={0.1}
              value={backRatio}
              onChange={(e) => setBackRatio(Number(e.target.value))} />
            <span className="dim-val">{backRatio.toFixed(1)}×</span>
          </div>
        </div>

        {/* Fixture selectors */}
        <div className="three-point-role">
          <div className="three-point-role-label">🔆 {t('dlg.3pt.key', 'Key (Hauptlicht)')}</div>
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
          <div className="three-point-role-label">🌤 {t('dlg.3pt.fill', 'Fill (Fülllicht)')}</div>
          <select value={fillId} onChange={(e) => setFillId(e.target.value)}>
            {fixtureLibrary.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.manufacturer}) – {f.beamAngle}°</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {useTargetMode
              ? t('dlg.3pt.calcLux', 'Dimmer wird berechnet: ~{lx} lx')
                  .replace('{lx}', String(Math.round(localTargetLux / contrastRatio)))
              : t('dlg.3pt.calcRatio', 'Dimmer wird berechnet: Key/{ratio}')
                  .replace('{ratio}', String(contrastRatio))}
          </div>
        </div>

        <div className="three-point-role">
          <div className="three-point-role-label">✨ {t('dlg.3pt.back', 'Back (Spitzlicht)')}</div>
          <select value={backId} onChange={(e) => setBackId(e.target.value)}>
            {fixtureLibrary.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.manufacturer}) – {f.beamAngle}°</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {t('dlg.3pt.backIntensity', 'Back-Intensität:')} {backRatio.toFixed(1)}× Key
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onCancel}>{t('common.cancel', 'Abbrechen')}</button>
          <button className="primary" onClick={handleSubmit}>{t('dlg.3pt.generate', 'Generieren')}</button>
        </div>
      </div>
    </div>
  );
};

export default ThreePointDialog;
