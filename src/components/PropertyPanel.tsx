import React from 'react';
import type { PlacedFixture, Person, StageElement } from '../types';
import { luxFromFixture } from '../utils/lightCalc';

interface Props {
  fixtures: PlacedFixture[];
  persons: Person[];
  stageElements: StageElement[];
  selectedId: string | null;
  cursorLux: number | null;
  onUpdateFixture: (id: string, updates: Partial<PlacedFixture>) => void;
  onUpdatePerson: (id: string, updates: Partial<Person>) => void;
  onUpdateStageElement: (id: string, updates: Partial<StageElement>) => void;
  onDelete: (id: string) => void;
  onAutoThreePointForPerson: (personId: string) => void;
}

const MOUNT_LABELS: Record<string, string> = {
  bowens: 'Bowens S-Mount',
  'prolock-bowens': 'ProLock Bowens',
  junior: 'Junior Pin',
  baby: 'Baby Pin',
  clamp: 'C-Clamp',
  yoke: 'Integriertes Joch',
  none: 'Kein Ansatz',
};

const PropertyPanel: React.FC<Props> = ({
  fixtures,
  persons,
  stageElements,
  selectedId,
  cursorLux,
  onUpdateFixture,
  onUpdatePerson,
  onUpdateStageElement,
  onDelete,
  onAutoThreePointForPerson,
}) => {
  const selFixture = fixtures.find((f) => f.id === selectedId);
  const selPerson = persons.find((p) => p.id === selectedId);
  const selStage = stageElements.find((s) => s.id === selectedId);

  const numField = (label: string, value: number, onChange: (v: number) => void, step = 0.1, min?: number, max?: number) => (
    <label className="prop-field">
      <span>{label}</span>
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );

  if (selFixture) {
    const f = selFixture;
    const hDist = Math.sqrt((f.aimX - f.x) ** 2 + (f.aimY - f.y) ** 2);
    const tiltDeg = (Math.atan2(hDist, f.mountingHeight) * 180) / Math.PI;
    const panDeg = (Math.atan2(f.aimY - f.y, f.aimX - f.x) * 180) / Math.PI;

    // Get effective beam angle considering attachment
    const activeAtt = f.activeAttachmentId
      ? f.fixture.compatibleAttachments?.find((a) => a.id === f.activeAttachmentId)
      : undefined;
    const effectiveBeamAngle = f.currentBeamAngle ?? activeAtt?.beamAngleOverride ?? f.fixture.beamAngle;
    const effectiveZoomRange = activeAtt?.zoomRangeOverride ?? f.fixture.zoomRange;
    const beamRadAtFloor = Math.tan((effectiveBeamAngle / 2) * (Math.PI / 180)) * f.mountingHeight;

    // Compute peak lux at aim point using the real engine
    const peakLux = luxFromFixture(f, f.aimX, f.aimY);
    const totalWeight = f.fixture.weight + (activeAtt?.weightAdditional ?? 0);

    // Pan/tilt from aim point, allow setting directly
    const setPanTilt = (newPanDeg: number, newTiltDeg: number) => {
      const tiltRad = (newTiltDeg * Math.PI) / 180;
      const panRad = (newPanDeg * Math.PI) / 180;
      const dist = f.mountingHeight * Math.tan(tiltRad);
      const aimX = f.x + dist * Math.cos(panRad);
      const aimY = f.y + dist * Math.sin(panRad);
      onUpdateFixture(f.id, { aimX, aimY });
    };

    return (
      <div className="property-panel">
        <h3>{f.fixture.name}</h3>
        {activeAtt && <div className="prop-attachment-badge">+ {activeAtt.name}</div>}

        <div className="prop-section">
          <span className="prop-section-title">Position</span>
          {numField('X (m)', f.x, (v) => onUpdateFixture(f.id, { x: v }))}
          {numField('Y (m)', f.y, (v) => onUpdateFixture(f.id, { y: v }))}
          {numField('Höhe (m)', f.mountingHeight, (v) => onUpdateFixture(f.id, { mountingHeight: v }), 0.5, 0.5, 30)}
        </div>

        <div className="prop-section">
          <span className="prop-section-title">Ausrichtung</span>
          {numField('Ziel X (m)', f.aimX, (v) => onUpdateFixture(f.id, { aimX: v }))}
          {numField('Ziel Y (m)', f.aimY, (v) => onUpdateFixture(f.id, { aimY: v }))}
          <label className="prop-field">
            <span>Pan ({panDeg.toFixed(1)}°)</span>
            <input type="range" min={-180} max={180} step={1} value={panDeg}
              onChange={(e) => setPanTilt(Number(e.target.value), tiltDeg)} />
          </label>
          <label className="prop-field">
            <span>Tilt ({tiltDeg.toFixed(1)}°)</span>
            <input type="range" min={0} max={90} step={1} value={tiltDeg}
              onChange={(e) => setPanTilt(panDeg, Number(e.target.value))} />
          </label>
          {numField('Rotation (°)', f.bodyRotation, (v) => onUpdateFixture(f.id, { bodyRotation: v }), 5, 0, 360)}
        </div>

        <div className="prop-section">
          <span className="prop-section-title">Licht</span>
          {effectiveZoomRange && (
            <label className="prop-field">
              <span>Zoom ({effectiveBeamAngle.toFixed(0)}°)</span>
              <input type="range" min={effectiveZoomRange[0]} max={effectiveZoomRange[1]} step={0.5}
                value={effectiveBeamAngle}
                onChange={(e) => onUpdateFixture(f.id, { currentBeamAngle: Number(e.target.value) })} />
            </label>
          )}
          <label className="prop-field">
            <span>Dimmer ({f.dimming}%)</span>
            <input type="range" min={0} max={100} step={1} value={f.dimming}
              onChange={(e) => onUpdateFixture(f.id, { dimming: Number(e.target.value) })} />
          </label>
          {f.fixture.colorTempRange && (
            <label className="prop-field">
              <span>CCT ({f.currentColorTemp ?? f.fixture.colorTempRange[0]} K)</span>
              <input type="range"
                min={f.fixture.colorTempRange[0]} max={f.fixture.colorTempRange[1]} step={100}
                value={f.currentColorTemp ?? f.fixture.colorTempRange[0]}
                onChange={(e) => onUpdateFixture(f.id, { currentColorTemp: Number(e.target.value) })} />
            </label>
          )}
          <div className="prop-derived lux-readout">
            Beam Ø: {(beamRadAtFloor * 2).toFixed(1)} m<br />
            Peak: ~{peakLux.toFixed(0)} lux
          </div>
        </div>

        {/* Attachment selector */}
        {f.fixture.compatibleAttachments && f.fixture.compatibleAttachments.length > 0 && (
          <div className="prop-section">
            <span className="prop-section-title">Vorsatz / Attachment</span>
            <label className="prop-field">
              <span>Montiert</span>
              <select
                value={f.activeAttachmentId ?? ''}
                onChange={(e) => onUpdateFixture(f.id, {
                  activeAttachmentId: e.target.value || undefined,
                  currentBeamAngle: undefined, // reset zoom when switching
                })}
              >
                <option value="">Kein Vorsatz (Bare)</option>
                {f.fixture.compatibleAttachments.map((att) => (
                  <option key={att.id} value={att.id}>
                    {att.name} ({att.type}) +{att.weightAdditional}kg
                  </option>
                ))}
              </select>
            </label>
            {activeAtt && (
              <div className="prop-derived">
                Typ: {activeAtt.type}<br />
                {activeAtt.beamAngleOverride && `Beam: ${activeAtt.beamAngleOverride}°`}
                {activeAtt.zoomRangeOverride && ` (${activeAtt.zoomRangeOverride[0]}–${activeAtt.zoomRangeOverride[1]}°)`}
                {activeAtt.photometricOverride && (
                  <><br />Ref: {activeAtt.photometricOverride.lux.toLocaleString()} lux@{activeAtt.photometricOverride.distance}m</>
                )}
              </div>
            )}
          </div>
        )}

        <div className="prop-section">
          <span className="prop-section-title">Info</span>
          <div className="prop-info-grid">
            <span>{f.fixture.manufacturer}</span>
            <span>{f.fixture.wattage} W</span>
            {f.fixture.photometric
              ? <span>{f.fixture.photometric.lux.toLocaleString()} lux@{f.fixture.photometric.distance}m</span>
              : <span>{f.fixture.lumens.toLocaleString()} lm</span>}
            <span>Beam: {f.fixture.beamAngle}°</span>
            <span>Field: {f.fixture.fieldAngle}°</span>
            <span>{f.fixture.beamShape}</span>
            <span>{f.fixture.lensType}</span>
            <span>{f.fixture.colorTempRange
              ? `${f.fixture.colorTempRange[0]}–${f.fixture.colorTempRange[1]} K`
              : f.fixture.colorTemp > 0 ? `${f.fixture.colorTemp} K` : 'RGBW'}</span>
            <span>{MOUNT_LABELS[f.fixture.mountType] ?? f.fixture.mountType}</span>
            <span>{totalWeight.toFixed(1)} kg</span>
            {f.fixture.cri && <span>CRI {f.fixture.cri}</span>}
            {f.fixture.tlci && <span>TLCI {f.fixture.tlci}</span>}
            {f.fixture.ipRating && <span>IP{f.fixture.ipRating}</span>}
            {f.fixture.dmxChannels && <span>{f.fixture.dmxChannels} DMX-Ch</span>}
          </div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(f.id)}>Leuchte löschen</button>
      </div>
    );
  }

  if (selPerson) {
    const p = selPerson;
    return (
      <div className="property-panel">
        <h3>Person</h3>
        <div className="prop-section">
          {numField('X (m)', p.x, (v) => onUpdatePerson(p.id, { x: v }))}
          {numField('Y (m)', p.y, (v) => onUpdatePerson(p.id, { y: v }))}
          {numField('Größe (m)', p.height, (v) => onUpdatePerson(p.id, { height: v }), 0.05, 0.5, 2.5)}
          <label className="prop-field">
            <span>Name</span>
            <input type="text" value={p.label || ''} onChange={(e) => onUpdatePerson(p.id, { label: e.target.value })} />
          </label>
        </div>
        <button className="auto-btn wide" onClick={() => onAutoThreePointForPerson(p.id)}>
          💡 3-Punkt-Licht erzeugen
        </button>
        <button className="delete-btn" onClick={() => onDelete(p.id)}>Person löschen</button>
      </div>
    );
  }

  if (selStage) {
    const se = selStage;
    return (
      <div className="property-panel">
        <h3>Bühnen-Element</h3>
        <div className="prop-section">
          {numField('X (m)', se.x, (v) => onUpdateStageElement(se.id, { x: v }))}
          {numField('Y (m)', se.y, (v) => onUpdateStageElement(se.id, { y: v }))}
          {numField('Breite (m)', se.width, (v) => onUpdateStageElement(se.id, { width: v }), 0.5, 0.5)}
          {numField('Tiefe (m)', se.depth, (v) => onUpdateStageElement(se.id, { depth: v }), 0.5, 0.5)}
          {numField('Höhe (m)', se.height, (v) => onUpdateStageElement(se.id, { height: v }), 0.1, 0.1, 5)}
          {numField('Rotation (°)', se.rotation, (v) => onUpdateStageElement(se.id, { rotation: v }), 15, 0, 360)}
          <label className="prop-field">
            <span>Bezeichnung</span>
            <input type="text" value={se.label || ''} onChange={(e) => onUpdateStageElement(se.id, { label: e.target.value })} />
          </label>
        </div>
        <button className="delete-btn" onClick={() => onDelete(se.id)}>Element löschen</button>
      </div>
    );
  }

  // No selection
  return (
    <div className="property-panel">
      <h3>Eigenschaften</h3>
      <p className="prop-hint">
        Wähle eine Leuchte, Person oder Bühnen-Element aus, um Eigenschaften zu bearbeiten.
      </p>
      {cursorLux !== null && (
        <div className="cursor-lux">
          Cursor: <strong>{cursorLux.toFixed(0)} lux</strong>
        </div>
      )}
    </div>
  );
};

export default PropertyPanel;
