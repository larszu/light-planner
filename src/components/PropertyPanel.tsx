import React from 'react';
import type { PlacedFixture, Person, StageElement, Fixture, Truss, Wall, Ceiling, Shape } from '../types';
import { wallMidHandle, curveControlForMid } from '../utils/geometry';
import { luxFromFixture, effectiveFieldAngleDeg } from '../utils/lightCalc';
import { gelLibrary, effectiveColorTemp } from '../data/gelLibrary';
import { fixtureLibrary } from '../data/fixtureLibrary';
import { getFixtureCCT, cctToRgb } from '../utils/colorTemp';

interface Props {
  fixtures: PlacedFixture[];
  persons: Person[];
  stageElements: StageElement[];
  trusses: Truss[];
  walls: Wall[];
  ceilings: Ceiling[];
  shapes: Shape[];
  selectedIds: Set<string>;
  cursorLux: number | null;
  patchConflicts: Set<string>;
  onUpdateFixture: (id: string, updates: Partial<PlacedFixture>) => void;
  onUpdatePerson: (id: string, updates: Partial<Person>) => void;
  onUpdateStageElement: (id: string, updates: Partial<StageElement>) => void;
  onUpdateTruss: (id: string, updates: Partial<Truss>) => void;
  onUpdateWall: (id: string, updates: Partial<Wall>) => void;
  onUpdateCeiling: (id: string, updates: Partial<Ceiling>) => void;
  onDelete: (id: string) => void;
  onAutoThreePointForPerson: (personId: string) => void;
  onAreaLight: () => void;
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
  trusses,
  walls,
  ceilings,
  shapes,
  selectedIds,
  cursorLux,
  patchConflicts,
  onUpdateFixture,
  onUpdatePerson,
  onUpdateStageElement,
  onUpdateTruss,
  onUpdateWall,
  onUpdateCeiling,
  onDelete,
  onAutoThreePointForPerson,
  onAreaLight,
}) => {
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const selFixture = fixtures.find((f) => f.id === selectedId);
  const selPerson = persons.find((p) => p.id === selectedId);
  const selStage = stageElements.find((s) => s.id === selectedId);
  const selTruss = trusses.find((t) => t.id === selectedId);
  const selWall = walls.find((w) => w.id === selectedId);
  const selCeiling = ceilings.find((c) => c.id === selectedId);
  const selShape = shapes.find((s) => s.id === selectedId);

  // Multi-selection info
  const multiFixtures = fixtures.filter((f) => selectedIds.has(f.id));
  const multiCount = selectedIds.size;

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
    const fieldRadAtFloor = Math.tan((effectiveFieldAngleDeg(f) / 2) * (Math.PI / 180)) * f.mountingHeight;

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

        {/* Fixture swap */}
        <div className="prop-section">
          <span className="prop-section-title">Leuchte tauschen</span>
          <label className="prop-field">
            <span>Typ</span>
            <select
              value={f.fixture.id}
              onChange={(e) => {
                const newFixture = fixtureLibrary.find((fx) => fx.id === e.target.value);
                if (newFixture) {
                  onUpdateFixture(f.id, {
                    fixture: newFixture,
                    activeAttachmentId: undefined,
                    currentBeamAngle: undefined,
                    currentColorTemp: undefined,
                  });
                }
              }}
            >
              {fixtureLibrary.map((fx) => (
                <option key={fx.id} value={fx.id}>
                  {fx.manufacturer} {fx.name} ({fx.category}, {fx.wattage}W)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="prop-section">
          <span className="prop-section-title">Position</span>
          <label className="prop-field prop-pos-field">
            <span>X (m)</span>
            <div className="pos-nudge-group">
              <button className="nudge-btn" onClick={() => onUpdateFixture(f.id, { x: f.x - 0.5, aimX: f.aimX - 0.5 })}>◀</button>
              <input type="number" value={f.x} step={0.1}
                onChange={(e) => {
                  const dx = Number(e.target.value) - f.x;
                  onUpdateFixture(f.id, { x: f.x + dx, aimX: f.aimX + dx });
                }} />
              <button className="nudge-btn" onClick={() => onUpdateFixture(f.id, { x: f.x + 0.5, aimX: f.aimX + 0.5 })}>▶</button>
            </div>
          </label>
          <label className="prop-field prop-pos-field">
            <span>Y (m)</span>
            <div className="pos-nudge-group">
              <button className="nudge-btn" onClick={() => onUpdateFixture(f.id, { y: f.y - 0.5, aimY: f.aimY - 0.5 })}>◀</button>
              <input type="number" value={f.y} step={0.1}
                onChange={(e) => {
                  const dy = Number(e.target.value) - f.y;
                  onUpdateFixture(f.id, { y: f.y + dy, aimY: f.aimY + dy });
                }} />
              <button className="nudge-btn" onClick={() => onUpdateFixture(f.id, { y: f.y + 0.5, aimY: f.aimY + 0.5 })}>▶</button>
            </div>
          </label>
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
            Beam Ø (50 %): {(beamRadAtFloor * 2).toFixed(1)} m<br />
            Field Ø (10 %): {(fieldRadAtFloor * 2).toFixed(1)} m<br />
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

        {/* Gel Filter Selector (CTO/CTB/Frost) */}
        <div className="prop-section">
          <span className="prop-section-title">Filter / Gel</span>
          <label className="prop-field">
            <span>Gel hinzufügen</span>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const current = f.gelFilterIds ?? [];
                onUpdateFixture(f.id, { gelFilterIds: [...current, e.target.value] });
              }}
            >
              <option value="">– Auswählen –</option>
              <optgroup label="CTO (Warm)">
                {gelLibrary.filter((g) => g.type === 'CTO').map((g) => (
                  <option key={g.id} value={g.id}>{g.brand} {g.code} {g.name} ({Math.round((1 - g.transmissionFactor) * 100)}% Verlust)</option>
                ))}
              </optgroup>
              <optgroup label="CTB (Kalt)">
                {gelLibrary.filter((g) => g.type === 'CTB').map((g) => (
                  <option key={g.id} value={g.id}>{g.brand} {g.code} {g.name} ({Math.round((1 - g.transmissionFactor) * 100)}% Verlust)</option>
                ))}
              </optgroup>
              <optgroup label="Frost / Diffusion">
                {gelLibrary.filter((g) => g.type === 'frost').map((g) => (
                  <option key={g.id} value={g.id}>{g.brand} {g.code} {g.name} ({Math.round((1 - g.transmissionFactor) * 100)}% Verlust)</option>
                ))}
              </optgroup>
            </select>
          </label>
          {f.gelFilterIds && f.gelFilterIds.length > 0 && (
            <div className="gel-stack">
              {f.gelFilterIds.map((gid, idx) => {
                const gel = gelLibrary.find((g) => g.id === gid);
                return gel ? (
                  <div key={idx} className="gel-chip">
                    <span className={`gel-type-badge gel-type-${gel.type.toLowerCase()}`}>{gel.type}</span>
                    <span>{gel.brand} {gel.code}</span>
                    <button className="gel-remove" onClick={() => {
                      const updated = [...(f.gelFilterIds ?? [])];
                      updated.splice(idx, 1);
                      onUpdateFixture(f.id, { gelFilterIds: updated.length > 0 ? updated : undefined });
                    }}>✕</button>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>

        <div className="prop-section">
          <span className="prop-section-title">Patch / Paperwork</span>
          {patchConflicts.has(f.id) && <div className="patch-conflict">⚠ DMX-Adresse überschneidet sich</div>}
          <label className="prop-field">
            <span>Kanal</span>
            <input type="number" min={0} value={f.channel ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { channel: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <label className="prop-field">
            <span>Unit-Nr.</span>
            <input type="text" value={f.unitNumber ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { unitNumber: e.target.value || undefined })} />
          </label>
          <label className="prop-field">
            <span>Universe</span>
            <input type="number" min={1} value={f.universe ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { universe: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <label className="prop-field">
            <span>DMX-Adr.</span>
            <input type="number" min={1} max={512} value={f.dmxAddress ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { dmxAddress: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <div className="prop-derived">
            Footprint: {f.fixture.dmxChannels && f.fixture.dmxChannels > 0 ? `${f.fixture.dmxChannels} DMX-Ch` : 'Dimmer (1 Ch)'}
          </div>
          <label className="prop-field">
            <span>Zweck</span>
            <input type="text" value={f.purpose ?? ''} placeholder="z. B. Frontlicht"
              onChange={(e) => onUpdateFixture(f.id, { purpose: e.target.value || undefined })} />
          </label>
        </div>

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
            {f.gelFilterIds && f.gelFilterIds.length > 0 && (() => {
              const baseCCT = f.currentColorTemp ?? (f.fixture.colorTempRange ? f.fixture.colorTempRange[0] : f.fixture.colorTemp);
              if (baseCCT > 0) {
                const effCCT = effectiveColorTemp(baseCCT, f.gelFilterIds!);
                return <span>Eff. CCT: {effCCT} K</span>;
              }
              return null;
            })()}
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

  if (selTruss) {
    const t = selTruss;
    const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
    return (
      <div className="property-panel">
        <h3>Traverse</h3>
        <div className="prop-section">
          <div className="prop-derived lux-readout">Länge: {len.toFixed(2)} m</div>
          {numField('Start X (m)', t.x1, (v) => onUpdateTruss(t.id, { x1: v }))}
          {numField('Start Y (m)', t.y1, (v) => onUpdateTruss(t.id, { y1: v }))}
          {numField('Ende X (m)', t.x2, (v) => onUpdateTruss(t.id, { x2: v }))}
          {numField('Ende Y (m)', t.y2, (v) => onUpdateTruss(t.id, { y2: v }))}
          {numField('Trimm-Höhe (m)', t.height, (v) => onUpdateTruss(t.id, { height: v }), 0.5, 0, 30)}
          <label className="prop-field">
            <span>Bezeichnung</span>
            <input type="text" value={t.label || ''} onChange={(e) => onUpdateTruss(t.id, { label: e.target.value })} />
          </label>
        </div>
        <button className="delete-btn" onClick={() => onDelete(t.id)}>Traverse löschen</button>
      </div>
    );
  }

  if (selWall) {
    const w = selWall;
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const chord = len || 1;
    const m0x = (w.x1 + w.x2) / 2, m0y = (w.y1 + w.y2) / 2;
    const ppx = -(w.y2 - w.y1) / chord, ppy = (w.x2 - w.x1) / chord;
    const mh = wallMidHandle(w);
    const curveFrac = Math.max(-1, Math.min(1, ((mh.x - m0x) * ppx + (mh.y - m0y) * ppy) / (chord / 2)));
    const setCurve = (frac: number) => {
      if (Math.abs(frac) < 0.02) { onUpdateWall(w.id, { cx: undefined, cy: undefined }); return; }
      const mx = m0x + ppx * frac * (chord / 2), my = m0y + ppy * frac * (chord / 2);
      const c = curveControlForMid(w.x1, w.y1, w.x2, w.y2, mx, my);
      onUpdateWall(w.id, { cx: Math.round(c.x * 100) / 100, cy: Math.round(c.y * 100) / 100 });
    };
    return (
      <div className="property-panel">
        <h3>Wand</h3>
        <div className="prop-section">
          <div className="prop-derived lux-readout">Länge: {len.toFixed(2)} m</div>
          {numField('Höhe (m)', w.height, (v) => onUpdateWall(w.id, { height: v }), 0.1, 0.1, 20)}
          <label className="prop-field">
            <span>Krümmung</span>
            <input type="range" min={-1} max={1} step={0.05} value={curveFrac}
              onChange={(e) => setCurve(Number(e.target.value))} />
          </label>
          <div className="prop-derived">Oder den gelben Griff auf der Wand ziehen, um sie zu biegen.</div>
          <label className="prop-field">
            <span>Reflexion ({Math.round(w.reflectance * 100)}%)</span>
            <input type="range" min={0} max={1} step={0.05} value={w.reflectance}
              onChange={(e) => onUpdateWall(w.id, { reflectance: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[['Schwarz', 0.05], ['Beton', 0.35], ['Hell', 0.6], ['Weiß', 0.85]].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdateWall(w.id, { reflectance: v as number })}>{lbl}</button>
            ))}
          </div>
          <label className="prop-field">
            <span>Farbe</span>
            <input type="color" value={w.color} onChange={(e) => onUpdateWall(w.id, { color: e.target.value })} />
          </label>
          <label className="prop-field">
            <span>Bezeichnung</span>
            <input type="text" value={w.label || ''} onChange={(e) => onUpdateWall(w.id, { label: e.target.value })} />
          </label>
          <div className="prop-derived">Reflektiert Licht diffus in den Raum (Ein-Bounce) – fließt in die Heatmap ein.</div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(w.id)}>Wand löschen</button>
      </div>
    );
  }

  if (selCeiling) {
    const c = selCeiling;
    return (
      <div className="property-panel">
        <h3>Decke</h3>
        <div className="prop-section">
          <div className="prop-derived lux-readout">{c.points.length} Eckpunkte</div>
          {numField('Höhe (m)', c.height, (v) => onUpdateCeiling(c.id, { height: v }), 0.1, 0.5, 30)}
          <label className="prop-field">
            <span>Reflexion ({Math.round(c.reflectance * 100)}%)</span>
            <input type="range" min={0} max={1} step={0.05} value={c.reflectance}
              onChange={(e) => onUpdateCeiling(c.id, { reflectance: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[['Dunkel', 0.1], ['Beton', 0.4], ['Hell', 0.7], ['Weiß', 0.85]].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdateCeiling(c.id, { reflectance: v as number })}>{lbl}</button>
            ))}
          </div>
          <label className="prop-field">
            <span>Farbe</span>
            <input type="color" value={c.color} onChange={(e) => onUpdateCeiling(c.id, { color: e.target.value })} />
          </label>
          <div className="prop-derived">Reflektiert nach unten in den Raum. Tipp: „Decke" in der Toolbar erzeugt sie neu aus den Wänden.</div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(c.id)}>Decke löschen</button>
      </div>
    );
  }

  if (selShape) {
    const sh = selShape;
    const isRect = sh.type === 'rect' && sh.points.length === 2;
    const w = isRect ? Math.abs(sh.points[1].x - sh.points[0].x) : 0;
    const h = isRect ? Math.abs(sh.points[1].y - sh.points[0].y) : 0;
    return (
      <div className="property-panel">
        <h3>{isRect ? 'Fläche (Rechteck)' : sh.type === 'measure' ? 'Maßlinie' : 'Linie'}</h3>
        <div className="prop-section">
          {isRect
            ? <div className="prop-derived lux-readout">Größe: {w.toFixed(1)} × {h.toFixed(1)} m · {(w * h).toFixed(1)} m²</div>
            : <div className="prop-derived">{sh.label}</div>}
          <p className="prop-hint">Kante ziehen verschiebt die Fläche.</p>
        </div>
        {isRect && (
          <button className="auto-btn wide" onClick={onAreaLight}>🔆 Diese Fläche ausleuchten</button>
        )}
        <button className="delete-btn" onClick={() => onDelete(sh.id)}>Löschen</button>
      </div>
    );
  }

  // Multi-selection panel
  if (multiCount > 1) {
    return (
      <div className="property-panel">
        <h3>{multiCount} Elemente ausgewählt</h3>
        {multiFixtures.length > 0 && (
          <div className="prop-section">
            <span className="prop-section-title">{multiFixtures.length} Leuchte(n)</span>
            <ul className="multi-sel-list">
              {multiFixtures.map((f) => (
                <li key={f.id}>{f.fixture.name}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="prop-section">
          <span className="prop-section-title">Aktionen</span>
          <p className="prop-hint">
            Verschieben: Ziehe eine der markierten Leuchten.<br />
            Drehen: Nutze die Toolbar-Buttons zum Rotieren um eine Person.
          </p>
        </div>
        <button className="delete-btn" onClick={() => { for (const sid of selectedIds) onDelete(sid); }}>
          Alle {multiCount} löschen
        </button>
      </div>
    );
  }

  // No selection
  return (
    <div className="property-panel">
      <h3>Eigenschaften</h3>
      <p className="prop-hint">
        Wähle eine Leuchte, Person oder ein Bühnen-Element aus – oder leg direkt los:
      </p>
      <div className="prop-section">
        <span className="prop-section-title">Schnellstart</span>
        <ol className="quickstart-list">
          <li><span>📐</span> <strong>Grundriss</strong> importieren – JPG, PNG oder PDF</li>
          <li><span>📏</span> <strong>Maßstab kalibrieren</strong> – Strecke ziehen, echte Länge eingeben</li>
          <li><span>💡</span> Leuchten aus der Bibliothek auf den Plan ziehen</li>
        </ol>
      </div>
      <div className="prop-section">
        <span className="prop-section-title">Tastatur</span>
        <div className="shortcut-grid">
          <kbd>Leertaste</kbd><span>Ansicht verschieben</span>
          <kbd>Mausrad</kbd><span>Zoomen</span>
          <kbd>Strg/⌘&nbsp;Z</kbd><span>Rückgängig</span>
          <kbd>Entf</kbd><span>Löschen</span>
          <kbd>Esc</kbd><span>Abbrechen</span>
        </div>
      </div>
      {cursorLux !== null && (
        <div className="cursor-lux">
          Cursor: <strong>{cursorLux.toFixed(0)} lux</strong>
        </div>
      )}
    </div>
  );
};

export default PropertyPanel;
