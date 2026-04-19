import React, { useState } from 'react';
import type { Fixture } from '../types';
import { fixtureLibrary } from '../data/fixtureLibrary';
import type { ThreePointConfig } from '../utils/autoLighting';

interface Props {
  targetLux: number; // from heatmap target, 0 = off
  onGenerate: (config: ThreePointConfig) => void;
  onCancel: () => void;
}

const CONTRAST_PRESETS = [
  { label: '1.5:1 – Sehr weich (Flat/TV)', value: 1.5 },
  { label: '2:1 – Weich (Deakins Standard)', value: 2 },
  { label: '3:1 – Natürlich', value: 3 },
  { label: '4:1 – Dramatisch', value: 4 },
  { label: '8:1 – Noir / Low-Key', value: 8 },
];

const ThreePointDialog: React.FC<Props> = ({ targetLux, onGenerate, onCancel }) => {
  const [keyId, setKeyId] = useState('etc-s4-26');
  const [fillId, setFillId] = useState('fresnel-1kw');
  const [backId, setBackId] = useState('etc-s4-36');
  const [contrastRatio, setContrastRatio] = useState(2);
  const [backRatio, setBackRatio] = useState(1.0);
  const [keyDim, setKeyDim] = useState(100);
  const [localTargetLux, setLocalTargetLux] = useState(targetLux);

  const handleSubmit = () => {
    const keyF = fixtureLibrary.find((f) => f.id === keyId) ?? fixtureLibrary[0];
    const fillF = fixtureLibrary.find((f) => f.id === fillId) ?? fixtureLibrary[0];
    const backF = fixtureLibrary.find((f) => f.id === backId) ?? fixtureLibrary[0];
    onGenerate({
      keyFixture: keyF,
      fillFixture: fillF,
      backFixture: backF,
      contrastRatio,
      backRatio,
      targetLux: localTargetLux,
      keyDimming: keyDim,
    });
  };

  const useTargetMode = localTargetLux > 0;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal three-point-modal" onClick={(e) => e.stopPropagation()}>
        <h3>3-Punkt-Beleuchtung konfigurieren</h3>
        <p className="dialog-hint">
          Beleuchtung im Stil eines Kameramanns: Key definiert die Helligkeit,
          Fill wird über das Kontrastverhältnis berechnet, Back als Akzent.
        </p>

        {/* Target Lux */}
        <div className="three-point-role">
          <div className="three-point-role-label">🎯 Beleuchtungsziel</div>
          <div className="three-point-dim">
            <span>Key-Ziel</span>
            <input type="number" min={0} max={100000} step={10}
              value={localTargetLux}
              onChange={(e) => setLocalTargetLux(Number(e.target.value))}
              style={{ width: 80, textAlign: 'right' }}
            />
            <span>lx</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {useTargetMode
              ? `Key wird auf ${localTargetLux} lx gedimmt, Fill auf ${Math.round(localTargetLux / contrastRatio)} lx`
              : 'Manuell: Key-Dimmer wird direkt verwendet'}
          </div>
        </div>

        {/* Contrast Ratio */}
        <div className="three-point-role">
          <div className="three-point-role-label">⚖ Kontrastverhältnis (Key : Fill)</div>
          <select value={contrastRatio}
            onChange={(e) => setContrastRatio(Number(e.target.value))}>
            {CONTRAST_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <div className="three-point-dim" style={{ marginTop: 6 }}>
            <span>Back-Stärke</span>
            <input type="range" min={0.3} max={2.0} step={0.1}
              value={backRatio}
              onChange={(e) => setBackRatio(Number(e.target.value))} />
            <span className="dim-val">{backRatio.toFixed(1)}×</span>
          </div>
        </div>

        {/* Fixture selectors */}
        <div className="three-point-role">
          <div className="three-point-role-label">🔆 Key (Hauptlicht)</div>
          <select value={keyId} onChange={(e) => setKeyId(e.target.value)}>
            {fixtureLibrary.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.manufacturer}) – {f.beamAngle}°</option>
            ))}
          </select>
          {!useTargetMode && (
            <label className="three-point-dim">
              <span>Dimmer</span>
              <input type="range" min={0} max={100} value={keyDim}
                onChange={(e) => setKeyDim(Number(e.target.value))} />
              <span className="dim-val">{keyDim}%</span>
            </label>
          )}
        </div>

        <div className="three-point-role">
          <div className="three-point-role-label">🌤 Fill (Fülllicht)</div>
          <select value={fillId} onChange={(e) => setFillId(e.target.value)}>
            {fixtureLibrary.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.manufacturer}) – {f.beamAngle}°</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            {useTargetMode
              ? `Dimmer wird berechnet: ~${Math.round(localTargetLux / contrastRatio)} lx`
              : `Dimmer wird berechnet: Key/${contrastRatio}`}
          </div>
        </div>

        <div className="three-point-role">
          <div className="three-point-role-label">✨ Back (Spitzlicht)</div>
          <select value={backId} onChange={(e) => setBackId(e.target.value)}>
            {fixtureLibrary.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.manufacturer}) – {f.beamAngle}°</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            Back-Intensität: {backRatio.toFixed(1)}× Key
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onCancel}>Abbrechen</button>
          <button className="primary" onClick={handleSubmit}>Generieren</button>
        </div>
      </div>
    </div>
  );
};

export default ThreePointDialog;
