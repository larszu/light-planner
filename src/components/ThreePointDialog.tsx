import React, { useState } from 'react';
import type { Fixture, FixtureCategory } from '../types';
import { fixtureLibrary } from '../data/fixtureLibrary';

interface Props {
  onGenerate: (keyFixture: Fixture, fillFixture: Fixture, backFixture: Fixture, keyDim: number, fillDim: number, backDim: number) => void;
  onCancel: () => void;
}

const ROLE_PRESETS: { label: string; category: FixtureCategory; defaultId: string }[] = [
  { label: 'Key (Hauptlicht)', category: 'profile', defaultId: 'etc-s4-26' },
  { label: 'Fill (Fülllicht)', category: 'fresnel', defaultId: 'fresnel-1kw' },
  { label: 'Back (Spitzlicht)', category: 'profile', defaultId: 'etc-s4-36' },
];

const ThreePointDialog: React.FC<Props> = ({ onGenerate, onCancel }) => {
  const [keyId, setKeyId] = useState(ROLE_PRESETS[0].defaultId);
  const [fillId, setFillId] = useState(ROLE_PRESETS[1].defaultId);
  const [backId, setBackId] = useState(ROLE_PRESETS[2].defaultId);
  const [keyDim, setKeyDim] = useState(100);
  const [fillDim, setFillDim] = useState(50);
  const [backDim, setBackDim] = useState(70);

  const handleSubmit = () => {
    const keyF = fixtureLibrary.find((f) => f.id === keyId) ?? fixtureLibrary[0];
    const fillF = fixtureLibrary.find((f) => f.id === fillId) ?? fixtureLibrary[0];
    const backF = fixtureLibrary.find((f) => f.id === backId) ?? fixtureLibrary[0];
    onGenerate(keyF, fillF, backF, keyDim, fillDim, backDim);
  };

  const renderFixtureSelect = (label: string, value: string, onChange: (v: string) => void, dim: number, onDimChange: (v: number) => void) => (
    <div className="three-point-role">
      <div className="three-point-role-label">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {fixtureLibrary.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} ({f.manufacturer}) – {f.beamAngle}°
          </option>
        ))}
      </select>
      <label className="three-point-dim">
        <span>Dimmer</span>
        <input type="range" min={0} max={100} value={dim} onChange={(e) => onDimChange(Number(e.target.value))} />
        <span className="dim-val">{dim}%</span>
      </label>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal three-point-modal" onClick={(e) => e.stopPropagation()}>
        <h3>3-Punkt-Beleuchtung konfigurieren</h3>
        <p className="dialog-hint">Wähle die Leuchtentypen für Key, Fill und Backlight.</p>

        {renderFixtureSelect('🔆 Key (Hauptlicht)', keyId, setKeyId, keyDim, setKeyDim)}
        {renderFixtureSelect('🌤 Fill (Fülllicht)', fillId, setFillId, fillDim, setFillDim)}
        {renderFixtureSelect('✨ Back (Spitzlicht)', backId, setBackId, backDim, setBackDim)}

        <div className="modal-actions">
          <button onClick={onCancel}>Abbrechen</button>
          <button className="primary" onClick={handleSubmit}>Generieren</button>
        </div>
      </div>
    </div>
  );
};

export default ThreePointDialog;
