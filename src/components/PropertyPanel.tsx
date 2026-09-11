import React from 'react';
import Icon from './Icon';
import type { PlacedFixture, Person, StageElement, Fixture, Truss, Wall, Ceiling, Shape, CameraView, WallWindow, DmxMode, DmxModeOrigin } from '../types';
import { wallMidHandle, curveControlForMid, wallLength } from '../core/geometry';
import { luxFromFixture, effectiveFieldAngleDeg, explainLux } from '../core/lightCalc';
import type { FixtureCategory, BeamShape, LensType, MountType, WallPresetId } from '../types';
import { WALL_PRESETS, DEFAULT_WALL_MATERIAL, wallPreset } from '../core/surfaceTextures';
import { DEFAULT_TRUSS_CAPACITY, footprint, footprintOrNull, modeOf, modesOf, LEGACY_MODE_ID } from '../core/patch';
import { gelLibrary } from '../core/gelLibrary';
import { fixtureLibrary } from '../core/fixtureLibrary';
import { getFixtureCCT, cctToRgb } from '../core/colorTemp';
import { isEstimate, isStaleSource } from '../types';
import { useTranslation, translate, format } from '../i18n';

/**
 * Die Herkunftsangaben eines DMX-Modus, in der Reihenfolge der Anzeige.
 *
 * Deckungsgleich mit `@avplan/dmx-core` (`ModusHerkunft`), damit ein Plan
 * zwischen Licht- und Kabel-Planer keinen Beleg verliert.
 */
const ORIGIN_ORDER: DmxModeOrigin[] = ['manual', 'gdtf', 'console', 'device', 'estimated'];

const ORIGIN_LABEL = (t: (k: string, f: string) => string): Record<DmxModeOrigin, string> => ({
  manual: t('prop.originManual', 'Manual'),
  gdtf: t('prop.originGdtf', 'GDTF file'),
  console: t('prop.originConsole', 'Console patch'),
  device: t('prop.originDevice', 'Read off the device'),
  estimated: t('prop.originEstimated', 'Estimate'),
});

interface Props {
  fixtures: PlacedFixture[];
  persons: Person[];
  stageElements: StageElement[];
  trusses: Truss[];
  walls: Wall[];
  ceilings: Ceiling[];
  shapes: Shape[];
  cameras: CameraView[];
  selectedIds: Set<string>;
  cursorLux: number | null;
  patchConflicts: Set<string>;
  onUpdateFixture: (id: string, updates: Partial<PlacedFixture>) => void;
  onUpdatePerson: (id: string, updates: Partial<Person>) => void;
  onUpdateStageElement: (id: string, updates: Partial<StageElement>) => void;
  onUpdateTruss: (id: string, updates: Partial<Truss>) => void;
  onUpdateWall: (id: string, updates: Partial<Wall>) => void;
  onUpdateCeiling: (id: string, updates: Partial<Ceiling>) => void;
  onUpdateCamera: (id: string, updates: Partial<CameraView>) => void;
  onLookThroughCamera: (id: string) => void;
  onDelete: (id: string) => void;
  onAutoThreePointForPerson: (personId: string) => void;
  onAreaLight: () => void;
}

// Deutsche Form ist Quellsprache und Fallback; uebersetzt wird ueber
// `translate` gegen denselben Eintrag -- keine zweite Map, die auseinander
// laufen koennte, wenn jemand einen Ansatz ergaenzt.
const MOUNT_LABELS: Record<string, string> = {
  bowens: 'Bowens S-Mount',
  'prolock-bowens': 'ProLock Bowens',
  junior: 'Junior Pin',
  baby: 'Baby Pin',
  clamp: 'C-Clamp',
  yoke: 'Integriertes Joch',
  none: 'Kein Ansatz',
};

const mountLabel = (language: 'de' | 'en', key: string): string =>
  translate(language, `mount.${key}`, MOUNT_LABELS[key] ?? key);

const PropertyPanel: React.FC<Props> = ({
  fixtures,
  persons,
  stageElements,
  trusses,
  walls,
  ceilings,
  shapes,
  cameras,
  selectedIds,
  cursorLux,
  patchConflicts,
  onUpdateFixture,
  onUpdatePerson,
  onUpdateStageElement,
  onUpdateTruss,
  onUpdateWall,
  onUpdateCeiling,
  onUpdateCamera,
  onLookThroughCamera,
  onDelete,
  onAutoThreePointForPerson,
  onAreaLight,
}) => {
  const { t, language } = useTranslation();
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const selFixture = fixtures.find((f) => f.id === selectedId);
  const selPerson = persons.find((p) => p.id === selectedId);
  const selStage = stageElements.find((s) => s.id === selectedId);
  const selTruss = trusses.find((t) => t.id === selectedId);
  const selWall = walls.find((w) => w.id === selectedId);
  const selCeiling = ceilings.find((c) => c.id === selectedId);
  const selShape = shapes.find((s) => s.id === selectedId);
  const selCamera = cameras.find((c) => c.id === selectedId);

  // Multi-selection info
  const multiFixtures = fixtures.filter((f) => selectedIds.has(f.id));
  const multiCount = selectedIds.size;
  const [beamHelp, setBeamHelp] = React.useState(false);
  const [showCalc, setShowCalc] = React.useState(false);
  const [showSpecs, setShowSpecs] = React.useState(true);
  const [barnHelp, setBarnHelp] = React.useState(false);

  const numField = (label: string, value: number, onChange: (v: number) => void, step = 0.1, min?: number, max?: number) => {
    const clamp = (v: number) => {
      if (min != null && v < min) v = min;
      if (max != null && v > max) v = max;
      return Math.round(v * 1000) / 1000; // tame float error from ± step
    };
    return (
      <label className="prop-field prop-pos-field">
        <span>{label}</span>
        <div className="pos-nudge-group">
          <button type="button" className="nudge-btn" onClick={() => onChange(clamp(value - step))} aria-label="−"><Icon name="chevronLeft" size={11} /></button>
          <input type="number" value={value} step={step} min={min} max={max}
            onChange={(e) => onChange(Number(e.target.value))} />
          <button type="button" className="nudge-btn" onClick={() => onChange(clamp(value + step))} aria-label="+"><Icon name="chevronRight" size={11} /></button>
        </div>
      </label>
    );
  };

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
    const effFieldAngle = effectiveFieldAngleDeg(f);
    const fieldRadAtFloor = Math.tan((effFieldAngle / 2) * (Math.PI / 180)) * f.mountingHeight;
    // Effective angles scale with the current zoom relative to the base beam.
    const baseBeam = activeAtt?.beamAngleOverride ?? f.fixture.beamAngle;
    const zoomScale = baseBeam > 0 ? effectiveBeamAngle / baseBeam : 1;
    const effCutoff = f.fixture.cutoffAngle != null ? f.fixture.cutoffAngle * zoomScale : undefined;

    // Compute peak lux at aim point using the real engine
    const peakLux = luxFromFixture(f, f.aimX, f.aimY);

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

        <button
          className={`hide-toggle ${f.hidden ? 'is-hidden' : ''}`}
          onClick={() => onUpdateFixture(f.id, { hidden: !f.hidden })}
          title={f.hidden
            ? t('prop.showAgain', 'Show this fixture again')
            : t('prop.hideTemp', 'Hide this fixture temporarily (excluded from the heat-map)')}
        >
          <Icon name={f.hidden ? 'eye' : 'eyeOff'} size={13} />
          {f.hidden ? t('prop.show', 'Show') : t('prop.hide', 'Hide temporarily')}
        </button>
        {f.hidden && <div className="hide-note">{t('prop.hiddenNote', 'Hidden – this fixture is currently excluded from the heat-map. The values below show its contribution once it is visible again.')}</div>}

        {/* Fixture swap */}
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.swapFixture', 'Swap fixture')}</span>
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
          <span className="prop-section-title">{t('prop.position', 'Position')}</span>
          <label className="prop-field prop-pos-field">
            <span>X (m)</span>
            <div className="pos-nudge-group">
              <button className="nudge-btn" onClick={() => onUpdateFixture(f.id, { x: f.x - 0.5, aimX: f.aimX - 0.5 })}><Icon name="chevronLeft" size={11} /></button>
              <input type="number" value={f.x} step={0.1}
                onChange={(e) => {
                  const dx = Number(e.target.value) - f.x;
                  onUpdateFixture(f.id, { x: f.x + dx, aimX: f.aimX + dx });
                }} />
              <button className="nudge-btn" onClick={() => onUpdateFixture(f.id, { x: f.x + 0.5, aimX: f.aimX + 0.5 })}><Icon name="chevronRight" size={11} /></button>
            </div>
          </label>
          <label className="prop-field prop-pos-field">
            <span>Y (m)</span>
            <div className="pos-nudge-group">
              <button className="nudge-btn" onClick={() => onUpdateFixture(f.id, { y: f.y - 0.5, aimY: f.aimY - 0.5 })}><Icon name="chevronLeft" size={11} /></button>
              <input type="number" value={f.y} step={0.1}
                onChange={(e) => {
                  const dy = Number(e.target.value) - f.y;
                  onUpdateFixture(f.id, { y: f.y + dy, aimY: f.aimY + dy });
                }} />
              <button className="nudge-btn" onClick={() => onUpdateFixture(f.id, { y: f.y + 0.5, aimY: f.aimY + 0.5 })}><Icon name="chevronRight" size={11} /></button>
            </div>
          </label>
          {numField(t('prop.height', 'Height (m)'), f.mountingHeight, (v) => onUpdateFixture(f.id, { mountingHeight: v }), 0.5, 0.5, 30)}
        </div>

        <div className="prop-section">
          <span className="prop-section-title">{t('prop.aim', 'Aim')}</span>
          {numField(t('prop.aimX', 'Target X (m)'), f.aimX, (v) => onUpdateFixture(f.id, { aimX: v }))}
          {numField(t('prop.aimY', 'Target Y (m)'), f.aimY, (v) => onUpdateFixture(f.id, { aimY: v }))}
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
          {numField(t('prop.rotation', 'Rotation (°)'), f.bodyRotation, (v) => onUpdateFixture(f.id, { bodyRotation: v }), 5, 0, 360)}
        </div>

        <div className="prop-section">
          <span className="prop-section-title">{t('prop.light', 'Light')}</span>
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
            {t('prop.beamDia', 'Beam Ø (50 %)')}: {(beamRadAtFloor * 2).toFixed(1)} m<br />
            {t('prop.fieldDia', 'Field Ø (10 %)')}: {(fieldRadAtFloor * 2).toFixed(1)} m<br />
            {t('prop.peak', 'Peak')}: ~{peakLux.toFixed(0)} lux
          </div>
        </div>

        {/* Beam details – beam vs field vs cutoff vs zoom, with explanation */}
        <div className="prop-section">
          <span className="prop-section-title">
            {t('prop.beamDetails', 'Beam details')}
            <button type="button" className="beam-help-toggle" onClick={() => setBeamHelp((v) => !v)} title={t('prop.whatIsThis', 'What does this mean?')}><Icon name="info" size={12} /></button>
          </span>
          <div className="beam-angles">
            <div><span className="ba-dot ba-beam" /> {t('prop.beam50', 'Beam (50 %)')} <strong>{effectiveBeamAngle.toFixed(1)}°</strong></div>
            <div><span className="ba-dot ba-field" /> {t('prop.field10', 'Field (10 %)')} <strong>{effFieldAngle.toFixed(1)}°</strong></div>
            {effCutoff != null && <div><span className="ba-dot ba-cut" /> {t('prop.cutoff', 'Cutoff (2.5 %)')} <strong>{effCutoff.toFixed(1)}°</strong></div>}
            {effectiveZoomRange
              ? <div><span className="ba-dot ba-zoom" /> {t('prop.zoomRange', 'Zoom range')} <strong>{effectiveZoomRange[0]}–{effectiveZoomRange[1]}°</strong></div>
              : <div><span className="ba-dot ba-zoom" /> {t('prop.zoom', 'Zoom')} <strong>{t('prop.zoomFixed', 'fixed')}</strong></div>}
          </div>
          {beamHelp && (
            <div className="beam-help">
              <p><strong>{t('prop.help.beamTitle', 'Beam angle (50 %)')}</strong> {t('prop.help.beamBody', '– the bright core: the angle at which intensity has fallen to 50 % of the maximum (hotspot/FWHM).')}</p>
              <p><strong>{t('prop.help.fieldTitle', 'Field angle (10 %)')}</strong> {t('prop.help.fieldBody', '– the usable edge: at 10 % of the maximum. Always wider than the beam angle.')}</p>
              <p><strong>{t('prop.help.cutoffTitle', 'Cutoff (2.5 %)')}</strong> {t('prop.help.cutoffBody', '– where the light effectively ends.')}</p>
              <p><strong>{t('prop.help.zoomTitle', 'Zoom range')}</strong> {t('prop.help.zoomBody', '– on zoom fixtures the adjustable beam angle (narrow ↔ wide). Beam & field describe the beam shape at the current zoom setting.')}</p>
            </div>
          )}
        </div>

        {/* Attachment selector */}
        {f.fixture.compatibleAttachments && f.fixture.compatibleAttachments.length > 0 && (
          <div className="prop-section">
            <span className="prop-section-title">{t('prop.attachment', 'Attachment')}</span>
            <label className="prop-field">
              <span>{t('prop.mounted', 'Mounted')}</span>
              <select
                value={f.activeAttachmentId ?? ''}
                onChange={(e) => onUpdateFixture(f.id, {
                  activeAttachmentId: e.target.value || undefined,
                  currentBeamAngle: undefined, // reset zoom when switching
                })}
              >
                <option value="">{t('prop.noAttachment', 'No attachment (bare)')}</option>
                {f.fixture.compatibleAttachments.map((att) => (
                  <option key={att.id} value={att.id}>
                    {att.name} ({att.type}) +{att.weightAdditional}kg
                  </option>
                ))}
              </select>
            </label>
            {activeAtt && (
              <div className="prop-derived">
                {t('prop.type', 'Type')}: {activeAtt.type}<br />
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
          <span className="prop-section-title">{t('prop.gel', 'Filter / gel')}</span>
          <label className="prop-field">
            <span>{t('prop.gelAdd', 'Add gel')}</span>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const current = f.gelFilterIds ?? [];
                onUpdateFixture(f.id, { gelFilterIds: [...current, e.target.value] });
              }}
            >
              <option value="">{t('prop.pick', '– Select –')}</option>
              <optgroup label={t('prop.gelCto', 'CTO (warm)')}>
                {gelLibrary.filter((g) => g.type === 'CTO').map((g) => (
                  <option key={g.id} value={g.id}>{g.brand} {g.code} {g.name} ({Math.round((1 - g.transmissionFactor) * 100)}% {t('prop.gelLoss', 'loss')})</option>
                ))}
              </optgroup>
              <optgroup label={t('prop.gelCtb', 'CTB (cool)')}>
                {gelLibrary.filter((g) => g.type === 'CTB').map((g) => (
                  <option key={g.id} value={g.id}>{g.brand} {g.code} {g.name} ({Math.round((1 - g.transmissionFactor) * 100)}% {t('prop.gelLoss', 'loss')})</option>
                ))}
              </optgroup>
              <optgroup label={t('prop.gelFrost', 'Frost / diffusion')}>
                {gelLibrary.filter((g) => g.type === 'frost').map((g) => (
                  <option key={g.id} value={g.id}>{g.brand} {g.code} {g.name} ({Math.round((1 - g.transmissionFactor) * 100)}% {t('prop.gelLoss', 'loss')})</option>
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

        {/* Barn doors (Flügeltore) + where the gels sit – the two interact */}
        <div className="prop-section">
          <span className="prop-section-title">
            {t('prop.barnTitle', 'Barn doors & gel position')}
            <button type="button" className="beam-help-toggle" onClick={() => setBarnHelp((v) => !v)} title={t('prop.explainDiff', 'Explain the difference')}><Icon name="info" size={12} /></button>
          </span>
          {(() => {
            const bd = f.barnDoors ?? { top: 0, bottom: 0, left: 0, right: 0 };
            const setBarn = (patch: Partial<{ top: number; bottom: number; left: number; right: number }>) =>
              onUpdateFixture(f.id, { barnDoors: { ...bd, ...patch } });
            const flapRow = (label: string, value: number, onCh: (v: number) => void) => (
              <label className="prop-field">
                <span>{label} ({Math.round(value * 100)} %)</span>
                <input type="range" min={0} max={1} step={0.05} value={value}
                  onChange={(e) => onCh(Number(e.target.value))} />
              </label>
            );
            return (
              <>
                {flapRow(t('prop.top', 'Top'), bd.top, (v) => setBarn({ top: v }))}
                {flapRow(t('prop.bottom', 'Bottom'), bd.bottom, (v) => setBarn({ bottom: v }))}
                {flapRow(t('prop.left', 'Left'), bd.left, (v) => setBarn({ left: v }))}
                {flapRow(t('prop.right', 'Right'), bd.right, (v) => setBarn({ right: v }))}
                <div className="reflectance-presets">
                  <button className="refl-btn" onClick={() => onUpdateFixture(f.id, { barnDoors: undefined })}>{t('prop.barnOpenAll', 'Open all')}</button>
                  <button className="refl-btn" onClick={() => setBarn({ top: 0.6, bottom: 0.6 })}>{t('prop.barnTopBottom', 'Top/bottom ½')}</button>
                  <button className="refl-btn" onClick={() => setBarn({ left: 0.6, right: 0.6 })}>{t('prop.barnSides', 'Sides ½')}</button>
                </div>
                <div className="prop-derived">{t('prop.barnNote', 'They cut the beam from the side (in the fixture’s own frame of reference, rotated with it) – and feed straight into the heat-map.')}</div>
              </>
            );
          })()}
          <div className="prop-field-sub">{t('prop.gelPlacement', 'Gel position (filter frame vs. in front of the barn doors):')}</div>
          <div className="gel-placement-toggle">
            {([
              ['frame', t('prop.gelInFrame', 'In the frame (at the lens)')],
              ['front', t('prop.gelInFront', 'In front of the barn doors')],
            ] as const).map(([val, lbl]) => (
              <button key={val} type="button"
                className={`gp-btn${(f.gelPlacement ?? 'frame') === val ? ' active' : ''}`}
                onClick={() => onUpdateFixture(f.id, { gelPlacement: val })}>{lbl}</button>
            ))}
          </div>
          <div className="prop-derived gel-placement-note">
            {(f.gelPlacement ?? 'frame') === 'frame'
              ? t('prop.gelFrameNote', 'Gel in the colour frame right at the lens → a crisp barn-door cut. It also sits in the hottest spot, so saturated colours (deep blue/green) burn out fastest.')
              : t('prop.gelFrontNote', 'Gel hung in front of the doors → the lit gel becomes the new, larger source and the cut gets softer. With real frost the doors become practically useless. In exchange the gel runs cooler and lasts longer.')}
          </div>
          {barnHelp && (
            <div className="beam-help">
              <p><strong>{t('prop.barnHelp.orderTitle', 'Order inside the fixture:')}</strong> {t('prop.barnHelp.orderBody', 'Lamp → lens → colour frame (runner) → barn doors (with their own gel slot in front).')}</p>
              <p><strong>{t('prop.barnHelp.heatTitle', 'Heat & service life:')}</strong> {t('prop.barnHelp.heatBody', 'The closer to the lens, the hotter. Gel in the frame fades/burns fastest (IR absorption); in front of the doors it runs cooler and lasts longer.')}</p>
              <p><strong>{t('prop.barnHelp.opticsTitle', 'Optics:')}</strong> {t('prop.barnHelp.opticsBody', 'Diffusion further away = softer (the lit gel becomes the source). Hung in front of the doors it cancels their cut – for a clean cut the gel belongs in the frame behind the doors.')}</p>
            </div>
          )}
        </div>

        <div className="prop-section">
          <span className="prop-section-title">{t('prop.patch', 'Patch / paperwork')}</span>
          {patchConflicts.has(f.id) && <div className="patch-conflict">⚠ {t('prop.dmxClash', 'DMX address overlaps')}</div>}
          <label className="prop-field">
            <span>{t('prop.channel', 'Channel')}</span>
            <input type="number" min={0} value={f.channel ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { channel: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <label className="prop-field">
            <span>{t('prop.unitNo', 'Unit no.')}</span>
            <input type="text" value={f.unitNumber ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { unitNumber: e.target.value || undefined })} />
          </label>
          <label className="prop-field">
            <span>{t('prop.universe', 'Universe')}</span>
            <input type="number" min={1} value={f.universe ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { universe: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <label className="prop-field">
            <span>{t('prop.dmxAddr', 'DMX addr.')}</span>
            <input type="number" min={1} max={512} value={f.dmxAddress ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { dmxAddress: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          {/* ── Betriebsmodus ─────────────────────────────────────────────
              Er steht VOR der Adresse, weil er sie bestimmt: ein Moving Head
              belegt je Betriebsart verschieden viele Kanaele. Wer die Adresse
              zuerst setzt, hat zwischendurch einen Plan, der eine Zahl
              behauptet, die er nicht kennt. */}
          {modesOf(f.fixture).length > 1 && (
            <label className="prop-field">
              <span>{t('prop.dmxMode', 'DMX mode')}</span>
              <select
                value={f.dmxModeId ?? ''}
                onChange={(e) => onUpdateFixture(f.id, { dmxModeId: e.target.value || undefined })}
              >
                <option value="">{t('prop.dmxModeNone', '— not chosen —')}</option>
                {modesOf(f.fixture).map((m) => (
                  <option key={m.id} value={m.id}>
                    {format(t('prop.dmxModeOption', '{name} ({ch} ch)'), { name: m.name, ch: m.channels })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="prop-derived">
            {t('prop.footprint', 'Footprint')}: {(() => {
              const fp = footprintOrNull(f);
              // Drei Zustaende, und die Anzeige unterscheidet sie. „Dimmer"
              // fuer ein Geraet, dessen Modus nur nicht gewaehlt ist, waere
              // die Falschauskunft, die im Saal auffaellt und nicht hier.
              if (fp === null) return t('prop.footprintUnknown', 'unknown — no mode chosen');
              if (fp === 0) return t('prop.dimmer1ch', 'Dimmer (1 ch)');
              const m = modeOf(f);
              return m && m.origin === 'estimated'
                ? format(t('prop.footprintEstimated', '{ch} DMX ch (estimated)'), { ch: fp })
                : format(t('prop.footprintCh', '{ch} DMX ch'), { ch: fp });
            })()}
          </div>
          <label className="prop-field">
            <span>{t('prop.purpose', 'Purpose')}</span>
            <input type="text" value={f.purpose ?? ''} placeholder={t('prop.purposePh', 'e.g. front light')}
              onChange={(e) => onUpdateFixture(f.id, { purpose: e.target.value || undefined })} />
          </label>
        </div>

        {/* Editable technical data – every value can be checked & adjusted per lamp */}
        <div className="prop-section">
          <span className="prop-section-title">
            {t('prop.specs', 'Technical data (editable)')}
            <button type="button" className="beam-help-toggle" onClick={() => setShowSpecs((v) => !v)} title={t('prop.toggle', 'Collapse/expand')}>{showSpecs ? '▾' : '▸'}</button>
          </span>
          {showSpecs && (() => {
            const setSpec = (patch: Partial<Fixture>) => onUpdateFixture(f.id, { fixture: { ...f.fixture, ...patch } });
            // Der Beleg zum Wert, falls einer mitgespeichert wurde.
            //
            // Die Datenblatt-Extraktion liefert zu jedem Feld eine Quelle —
            // ein Zitat oder eine als „geschaetzt" gekennzeichnete
            // Begruendung — und der Dialog zeigt sie an. Gespeichert wurde
            // sie bis dahin nicht, also war spaeter eine geschaetzte
            // Streuwinkel-Angabe von einer abgelesenen nicht mehr zu
            // unterscheiden. Genau diese Zahl geht in die Lichtberechnung.
            const srcMark = (key: string, current: unknown) => {
              const entry = f.fixture.specSource?.[key];
              if (!entry) return null;
              if (isStaleSource(entry, current)) {
                return (
                  <span
                    className="spec-src spec-src-stale"
                    title={t('prop.srcStale', 'The evidence referred to {value}: {source}\nThe value has been changed by hand since.')
                      .replace('{value}', String(entry.value))
                      .replace('{source}', entry.source)}
                  >
                    !
                  </span>
                );
              }
              const est = isEstimate(entry);
              return (
                <span
                  className={est ? 'spec-src spec-src-est' : 'spec-src'}
                  title={`${est ? t('prop.estimated', 'Estimated') : t('prop.evidence', 'Evidence')}: ${entry.source}`}
                >
                  {est ? '≈' : '✓'}
                </span>
              );
            };
            const sNum = (label: string, val: number | undefined, set: (v: number) => void, step = 1, title?: string, srcKey?: string) => (
              <label className="prop-field" title={title}>
                <span>{label}{srcKey ? srcMark(srcKey, val) : null}</span>
                <input type="number" value={val ?? 0} step={step} onChange={(e) => set(Number(e.target.value))} />
              </label>
            );
            const photo = f.fixture.photometric;
            return (
              <>
                <label className="prop-field"><span>{t('prop.manufacturer', 'Manufacturer')}</span>
                  <input type="text" value={f.fixture.manufacturer} onChange={(e) => setSpec({ manufacturer: e.target.value })} /></label>
                <label className="prop-field"><span>{t('prop.type', 'Type')}</span>
                  <input type="text" value={f.fixture.name} onChange={(e) => setSpec({ name: e.target.value })} /></label>
                {sNum(t('prop.wattage', 'Power (W)'), f.fixture.wattage, (v) => setSpec({ wattage: v }), 1, undefined, 'wattage')}
                {sNum(t('prop.lumens', 'Luminous flux (lm)'), f.fixture.lumens, (v) => setSpec({ lumens: v }), 50, t('prop.lumensHint', 'Total luminous flux (fallback when there is no lux reference)'), 'lumens')}
                {sNum(t('prop.beamSpec', 'Beam 50 % (°)'), f.fixture.beamAngle, (v) => setSpec({ beamAngle: v }), 0.5, t('prop.beamSpecHint', 'Bright core (FWHM)'), 'beamAngle')}
                {sNum(t('prop.fieldSpec', 'Field 10 % (°)'), f.fixture.fieldAngle, (v) => setSpec({ fieldAngle: v }), 0.5, t('prop.fieldSpecHint', 'Usable edge – drives the calculation (σ)'), 'fieldAngle')}
                {sNum(t('prop.cutoffSpec', 'Cutoff 2.5 % (°)'), f.fixture.cutoffAngle, (v) => setSpec({ cutoffAngle: v || undefined }), 0.5, t('prop.cutoffSpecHint', 'Where the light ends (optional)'), 'cutoffAngle')}
                <label className="prop-field"><span>{t('prop.beamShape', 'Beam shape')}</span>
                  <select value={f.fixture.beamShape} onChange={(e) => setSpec({ beamShape: e.target.value as BeamShape })}>
                    <option value="circular">{t('prop.shapeCircular', 'Circular')}</option><option value="elliptical">{t('prop.shapeElliptical', 'Elliptical')}</option>
                    <option value="linear">{t('prop.shapeLinear', 'Linear')}</option><option value="rectangular">{t('prop.shapeRect', 'Rectangular')}</option>
                  </select></label>
                {f.fixture.beamShape !== 'circular' && sNum(t('prop.beamRatio', 'Beam W:H'), f.fixture.beamRatioWH, (v) => setSpec({ beamRatioWH: v }), 0.1)}
                <label className="prop-field"><span>{t('prop.lensType', 'Lens type')}</span>
                  <select value={f.fixture.lensType} onChange={(e) => setSpec({ lensType: e.target.value as LensType })}>
                    <option value="fixed">{t('prop.lensFixed', 'Fixed')}</option><option value="zoom">{t('prop.lensZoom', 'Zoom')}</option><option value="interchangeable">{t('prop.lensInter', 'Interchangeable')}</option>
                    <option value="fresnel">Fresnel</option><option value="pc">PC</option><option value="reflector">{t('prop.lensReflector', 'Reflector')}</option>
                  </select></label>
                <label className="prop-field"><span>{t('prop.mount', 'Mount')}</span>
                  <select value={f.fixture.mountType} onChange={(e) => setSpec({ mountType: e.target.value as MountType })}>
                    {Object.keys(MOUNT_LABELS).map((k) => <option key={k} value={k}>{mountLabel(language, k)}</option>)}
                  </select></label>
                {f.fixture.zoomRange && (
                  <div className="prop-field"><span>{t('prop.zoomRangeSpec', 'Zoom range (°)')}</span>
                    <span className="zoom-range-edit">
                      <input type="number" step={0.5} value={f.fixture.zoomRange[0]} onChange={(e) => setSpec({ zoomRange: [Number(e.target.value), f.fixture.zoomRange![1]] })} />
                      <input type="number" step={0.5} value={f.fixture.zoomRange[1]} onChange={(e) => setSpec({ zoomRange: [f.fixture.zoomRange![0], Number(e.target.value)] })} />
                    </span>
                  </div>
                )}
                {sNum(t('prop.cct', 'Colour temp. (K, 0=RGBW)'), f.fixture.colorTemp, (v) => setSpec({ colorTemp: v }), 100)}
                {sNum(t('prop.weight', 'Weight (kg)'), f.fixture.weight, (v) => setSpec({ weight: v }), 0.1)}
                {sNum('CRI', f.fixture.cri, (v) => setSpec({ cri: v || undefined }), 1)}
                {sNum('TLCI', f.fixture.tlci, (v) => setSpec({ tlci: v || undefined }), 1)}
                {sNum(t('prop.dmxChannels', 'DMX channels'), f.fixture.dmxChannels, (v) => setSpec({ dmxChannels: v || undefined }), 1)}
                {/* ── Betriebsmodi ────────────────────────────────────────
                    Die Zeile darueber ist die ALTE Angabe: eine Zahl je
                    Geraet, ohne Modusbegriff. Sie bleibt lesbar, weil jeder
                    gespeicherte Plan sie traegt — aber ein Moving Head hat je
                    Betriebsart einen anderen Fussabdruck, und der wird hier
                    eingetragen. Zu JEDER Kanalzahl gehoert, woher sie kommt:
                    eine Zahl ohne Quelle ist von einer abgelesenen nicht zu
                    unterscheiden, und sie verschiebt im Zweifel jede
                    Folgeadresse im Rig. */}
                {(() => {
                  const modes = modesOf(f.fixture);
                  const geerbt = modes.length === 1 && modes[0]!.id === LEGACY_MODE_ID;
                  const setModes = (next: DmxMode[]) => setSpec({ dmxModes: next });
                  const change = (id: string, part: Partial<DmxMode>) =>
                    setModes(modes.map((m) => (m.id === id ? { ...m, ...part } : m)));
                  return (
                    <div className="prop-modes">
                      <div className="prop-field-sub">
                        {t('prop.dmxModes', 'DMX modes (footprint per operating mode):')}
                      </div>
                      {geerbt && (
                        <div className="prop-derived">
                          {t('prop.dmxModesLegacy', 'One mode carried over from the channel count above; where it came from was never recorded, so it counts as an estimate until someone reads it off the device or the console patch.')}
                        </div>
                      )}
                      {modes.map((m) => (
                        <div key={m.id} className="prop-mode-row">
                          <input
                            type="text" value={m.name}
                            title={t('prop.dmxModeName', 'Mode name as it appears on the device')}
                            onChange={(e) => change(m.id, { name: e.target.value })}
                          />
                          <input
                            type="number" min={1} max={512} value={m.channels}
                            title={t('prop.dmxModeChannels', 'Channels in this mode')}
                            onChange={(e) => change(m.id, { channels: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                          />
                          <select
                            value={m.origin}
                            title={t('prop.dmxModeOrigin', 'Where this channel count comes from')}
                            onChange={(e) => change(m.id, { origin: e.target.value as DmxModeOrigin })}
                          >
                            {ORIGIN_ORDER.map((o) => (
                              <option key={o} value={o}>{ORIGIN_LABEL(t)[o]}</option>
                            ))}
                          </select>
                          <button
                            type="button" className="prop-mode-del"
                            title={t('prop.dmxModeRemove', 'Remove mode')}
                            onClick={() => setModes(modes.filter((x) => x.id !== m.id))}
                          >x</button>
                        </div>
                      ))}
                      <button
                        type="button" className="prop-mode-add"
                        onClick={() => setModes([...modes, {
                          id: `m${modes.length + 1}-${f.fixture.id}`,
                          name: format(t('prop.dmxModeDefault', 'Mode {n}'), { n: modes.length + 1 }),
                          channels: 1,
                          origin: 'manual',
                        }])}
                      >{t('prop.dmxModeAdd', '+ Mode')}</button>
                    </div>
                  );
                })()}
                <label className="prop-field"><span>{t('prop.ipRating', 'IP rating')}</span>
                  <input type="text" value={f.fixture.ipRating ?? ''} onChange={(e) => setSpec({ ipRating: e.target.value || undefined })} /></label>
                <div className="prop-field-sub">{t('prop.photoRef', 'Photometric reference (drives the lux calculation):')}</div>
                {sNum(t('prop.refLux', 'Ref. lux'), photo?.lux, (v) => setSpec({ photometric: { ...(photo ?? { lux: v, distance: 1 }), lux: v } }), 100)}
                {sNum(t('prop.refDistance', 'Ref. distance (m)'), photo?.distance, (v) => setSpec({ photometric: { ...(photo ?? { lux: 10000, distance: v }), distance: v } }), 0.5)}
                {sNum(t('prop.refBeam', 'Ref. at beam (°)'), photo?.beamAngle, (v) => setSpec({ photometric: { ...(photo ?? { lux: 10000, distance: 1 }), beamAngle: v } }), 0.5, t('prop.refBeamHint', 'Beam angle at which the lux reference was measured'))}
              </>
            );
          })()}
        </div>

        {/* Calculation trace – fully visible & manually verifiable */}
        <div className="prop-section">
          <span className="prop-section-title">
            {t('prop.calcTitle', 'Calculation (lux at the target point)')}
            <button type="button" className="beam-help-toggle" onClick={() => setShowCalc((v) => !v)} title={t('prop.calcShow', 'Show the calculation')}>{showCalc ? '▾' : '▸'}</button>
          </span>
          {showCalc && (() => {
            const b = explainLux(f, f.aimX, f.aimY);
            // Zahlformat folgt der Oberflaechensprache -- der Rechenweg soll
            // in beiden Sprachen nachrechenbar sein, und 1.234 heisst im
            // Englischen etwas anderes als im Deutschen.
            const fmt = (n: number, d = 0) =>
              n.toLocaleString(language === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: d });
            return (
              <div className="calc-trace">
                <div className="calc-formula">E = I · cos θ / d²</div>
                <table className="calc-table">
                  <tbody>
                    {b.source === 'photometric'
                      ? <tr><td>{t('prop.calc.reference', 'Reference')}</td><td>{fmt(b.refLux!)} lx @ {b.refDistance} m</td><td>→ I₀ = lx·d² = <b>{fmt(b.basePeakCd)} cd</b></td></tr>
                      : <tr><td>{t('prop.calc.source', 'Source')}</td><td>{fmt(f.fixture.lumens)} lm</td><td>→ I₀ = <b>{fmt(b.basePeakCd)} cd</b></td></tr>}
                    {b.source === 'photometric' && Math.abs(b.zoomComp - 1) > 0.001 &&
                      <tr><td>{t('prop.calc.zoomComp', 'Zoom comp.')}</td><td>×{b.zoomComp.toFixed(3)}</td><td>Field {b.fieldAngleDeg.toFixed(1)}°</td></tr>}
                    <tr><td>{t('prop.calc.peak', 'Peak I₀')}</td><td colSpan={2}><b>{fmt(b.peakCd)} cd</b></td></tr>
                    <tr><td>{t('prop.calc.dimmer', 'Dimmer')}</td><td>×{(b.dimming * 100).toFixed(0)} %</td><td>{b.dimming.toFixed(2)}</td></tr>
                    {b.gel < 1 && <tr><td>{t('prop.calc.gel', 'Gel')}</td><td>×{(b.gel * 100).toFixed(0)} %</td><td>{b.gel.toFixed(2)}</td></tr>}
                    <tr><td>{t('prop.calc.gauss', 'Gauss')}</td><td>×{b.gauss.toFixed(3)}</td><td>θ = {b.offAxisDeg.toFixed(1)}°</td></tr>
                    {f.barnDoors && <tr><td>{t('prop.calc.barn', 'Barn doors')}</td><td>×{b.barnDoor.toFixed(3)}</td><td>{b.barnDoor > 0.999
                      ? t('prop.calc.barnClear', 'target point not cut')
                      : (f.gelPlacement ?? 'frame') === 'front'
                        ? t('prop.calc.barnSoft', 'soft (in front of the doors)')
                        : t('prop.calc.barnSharp', 'sharp (in the frame)')}</td></tr>}
                    <tr><td>cos θ<sub>{t('prop.calc.incidence', 'inc.')}</sub></td><td>×{b.cosIncidence.toFixed(3)}</td><td>h = {f.mountingHeight} m</td></tr>
                    <tr><td>÷ d²</td><td>d = {b.distance.toFixed(2)} m</td><td>d² = {fmt(b.distance * b.distance, 1)}</td></tr>
                    <tr className="calc-result"><td>= E</td><td colSpan={2}><b>{fmt(b.lux)} lx</b></td></tr>
                  </tbody>
                </table>
                <div className="calc-note">{t('prop.calc.note', 'Every value comes from the editable data above – so each step can be checked by hand. (Elliptical correction for non-round beams is simplified here.)')}</div>
              </div>
            );
          })()}
        </div>

        <button className="delete-btn" onClick={() => onDelete(f.id)}>{t('prop.deleteFixture', 'Delete fixture')}</button>
      </div>
    );
  }

  if (selPerson) {
    const p = selPerson;
    return (
      <div className="property-panel">
        <h3>{t('prop.person', 'Person')}</h3>
        <div className="prop-section">
          {numField('X (m)', p.x, (v) => onUpdatePerson(p.id, { x: v }))}
          {numField('Y (m)', p.y, (v) => onUpdatePerson(p.id, { y: v }))}
          {numField(t('prop.size', 'Height (m)'), p.height, (v) => onUpdatePerson(p.id, { height: v }), 0.05, 0.5, 2.5)}
          <label className="prop-field">
            <span>{t('prop.name', 'Name')}</span>
            <input type="text" value={p.label || ''} onChange={(e) => onUpdatePerson(p.id, { label: e.target.value })} />
          </label>
        </div>
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.poseTitle', 'Pose & facing (photo view)')}</span>
          <label className="prop-field">
            <span>{t('prop.pose', 'Pose')}</span>
            <select value={p.pose ?? 'standing'} onChange={(e) => onUpdatePerson(p.id, { pose: e.target.value as 'standing' | 'sitting' })}>
              <option value="standing">{t('prop.standing', 'Standing')}</option>
              <option value="sitting">{t('prop.sitting', 'Sitting')}</option>
            </select>
          </label>
          <label className="prop-field">
            <span>{t('prop.facing', 'Facing')} ({Math.round(p.facing ?? 270)}°)</span>
            <input type="range" min={0} max={360} step={5} value={p.facing ?? 270}
              onChange={(e) => onUpdatePerson(p.id, { facing: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[
              [`↑ ${t('prop.faceStage', 'Stage')}`, 90],
              [`↓ ${t('prop.faceAudience', 'Audience')}`, 270],
              [`← ${t('prop.faceLeft', 'Left')}`, 180],
              [`→ ${t('prop.faceRight', 'Right')}`, 0],
            ].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdatePerson(p.id, { facing: v as number })}>{lbl}</button>
            ))}
          </div>
          <div className="prop-derived">{t('prop.poseNote', 'Sitting pairs well with a riser or chair underneath. Takes effect in the 3D photo mode.')}</div>
        </div>
        <button className="auto-btn wide" onClick={() => onAutoThreePointForPerson(p.id)}>
          <Icon name="autolight" size={13} />
          {t('prop.threePoint', 'Generate three-point light')}
        </button>
        <button className="delete-btn" onClick={() => onDelete(p.id)}>{t('prop.deletePerson', 'Delete person')}</button>
      </div>
    );
  }

  if (selStage) {
    const se = selStage;
    if (se.points && se.points.length >= 3) {
      const xs = se.points.map((p) => p.x), ys = se.points.map((p) => p.y);
      const bw = Math.max(...xs) - Math.min(...xs), bd = Math.max(...ys) - Math.min(...ys);
      return (
        <div className="property-panel">
          <h3>{t('prop.stagePoly', 'Stage (polygon)')}</h3>
          <div className="prop-section">
            <div className="prop-derived lux-readout">{se.points.length} {t('prop.vertices', 'vertices')} · {t('prop.bbox', 'Bounds')} {bw.toFixed(1)} × {bd.toFixed(1)} m</div>
            {numField(t('prop.height', 'Height (m)'), se.height, (v) => onUpdateStageElement(se.id, { height: v }), 0.1, 0, 5)}
            <label className="prop-field">
              <span>{t('prop.label', 'Label')}</span>
              <input type="text" value={se.label || ''} onChange={(e) => onUpdateStageElement(se.id, { label: e.target.value })} />
            </label>
            <div className="prop-derived">{t('prop.stagePolyNote', 'Freely drawn stage. Dragging moves it together with its outline.')}</div>
          </div>
          <button className="delete-btn" onClick={() => onDelete(se.id)}>{t('prop.deleteStage', 'Delete stage')}</button>
        </div>
      );
    }
    return (
      <div className="property-panel">
        <h3>{t('prop.stageElement', 'Stage element')}</h3>
        <div className="prop-section">
          {numField('X (m)', se.x, (v) => onUpdateStageElement(se.id, { x: v }))}
          {numField('Y (m)', se.y, (v) => onUpdateStageElement(se.id, { y: v }))}
          {numField(t('prop.width', 'Width (m)'), se.width, (v) => onUpdateStageElement(se.id, { width: v }), 0.5, 0.5)}
          {numField(t('prop.depth', 'Depth (m)'), se.depth, (v) => onUpdateStageElement(se.id, { depth: v }), 0.5, 0.5)}
          {numField(se.height2 != null ? t('prop.heightFront', 'Height at the front (m)') : t('prop.height', 'Height (m)'), se.height, (v) => onUpdateStageElement(se.id, { height: v }), 0.1, 0.1, 5)}
          <label className="prop-field">
            <span>{t('prop.heightBack', 'Height at the back (m)')}</span>
            <input type="number" step={0.1} min={0} value={se.height2 ?? ''} placeholder={t('prop.flat', '= flat')}
              onChange={(e) => onUpdateStageElement(se.id, { height2: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          {numField(t('prop.rotation', 'Rotation (°)'), se.rotation, (v) => onUpdateStageElement(se.id, { rotation: v }), 15, 0, 360)}
          <label className="prop-field">
            <span>{t('prop.label', 'Label')}</span>
            <input type="text" value={se.label || ''} onChange={(e) => onUpdateStageElement(se.id, { label: e.target.value })} />
          </label>
          <div className="prop-derived">
            {se.height2 != null && Math.abs(se.height2 - se.height) > 0.01
              ? t('prop.rampNote', 'Ramp / slope: {a} m → {b} m (over {d} m of depth)')
                  .replace('{a}', String(se.height)).replace('{b}', String(se.height2)).replace('{d}', String(se.depth))
              : t('prop.stageTip', 'Tip: setting „height at the back" turns it into a ramp. Dragging the corners changes its size.')}
          </div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(se.id)}>{t('prop.deleteElement', 'Delete element')}</button>
      </div>
    );
  }

  if (selTruss) {
    const tr = selTruss; // nicht `t` -- das ist die Uebersetzungsfunktion
    const len = Math.hypot(tr.x2 - tr.x1, tr.y2 - tr.y1);
    return (
      <div className="property-panel">
        <h3>{t('prop.truss', 'Truss')}</h3>
        <div className="prop-section">
          <div className="prop-derived lux-readout">{t('prop.length', 'Length')}: {len.toFixed(2)} m</div>
          {numField(t('prop.startX', 'Start X (m)'), tr.x1, (v) => onUpdateTruss(tr.id, { x1: v }))}
          {numField(t('prop.startY', 'Start Y (m)'), tr.y1, (v) => onUpdateTruss(tr.id, { y1: v }))}
          {numField(t('prop.endX', 'End X (m)'), tr.x2, (v) => onUpdateTruss(tr.id, { x2: v }))}
          {numField(t('prop.endY', 'End Y (m)'), tr.y2, (v) => onUpdateTruss(tr.id, { y2: v }))}
          {numField(t('prop.trimHeight', 'Trim height (m)'), tr.height, (v) => onUpdateTruss(tr.id, { height: v }), 0.5, 0, 30)}
          {numField(t('prop.capacity', 'Load capacity (kg)'), tr.capacity ?? DEFAULT_TRUSS_CAPACITY, (v) => onUpdateTruss(tr.id, { capacity: v }), 10, 0, 5000)}
          <label className="prop-field">
            <span>{t('prop.label', 'Label')}</span>
            <input type="text" value={tr.label || ''} onChange={(e) => onUpdateTruss(tr.id, { label: e.target.value })} />
          </label>
          <div className="prop-derived">{t('prop.trussLoadNote', 'Load & utilisation per truss: see the schedule → „Load per truss".')}</div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(tr.id)}>{t('prop.deleteTruss', 'Delete truss')}</button>
      </div>
    );
  }

  if (selCamera) {
    const c = selCamera;
    const hDist = Math.hypot(c.aimX - c.x, c.aimY - c.y);
    const tilt = (Math.atan2(c.height, Math.max(0.01, hDist)) * 180) / Math.PI;
    return (
      <div className="property-panel">
        <h3><Icon name="camera" size={14} />{t('prop.camera', 'Camera')}</h3>
        <button className="auto-btn wide" onClick={() => onLookThroughCamera(c.id)}>
          <Icon name="camera" size={13} />
          {t('prop.lookThrough', 'Look through this camera')}
        </button>
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.posAndView', 'Position & view')}</span>
          {numField('X (m)', c.x, (v) => onUpdateCamera(c.id, { x: v }))}
          {numField('Y (m)', c.y, (v) => onUpdateCamera(c.id, { y: v }))}
          {numField(t('prop.eyeHeight', 'Eye height (m)'), c.height, (v) => onUpdateCamera(c.id, { height: v }), 0.1, 0.1, 30)}
          {numField(t('prop.aimX', 'Target X (m)'), c.aimX, (v) => onUpdateCamera(c.id, { aimX: v }))}
          {numField(t('prop.aimY', 'Target Y (m)'), c.aimY, (v) => onUpdateCamera(c.id, { aimY: v }))}
          <div className="prop-derived">{t('prop.camView', 'Looks')} {hDist.toFixed(1)} m {t('prop.camFar', 'far')} · {t('prop.camApprox', 'approx.')} {tilt.toFixed(0)}° {t('prop.camDown', 'downwards')}</div>
        </div>
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.lens', 'Lens')}</span>
          <label className="prop-field">
            <span>{t('prop.fov', 'Field of view')} ({c.fov}°)</span>
            <input type="range" min={10} max={110} step={1} value={c.fov}
              onChange={(e) => onUpdateCamera(c.id, { fov: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[
              [`${t('prop.fovTele', 'Tele')} 35°`, 35],
              [`${t('prop.fovNormal', 'Normal')} 50°`, 50],
              [`${t('prop.fovWide', 'Wide')} 75°`, 75],
              [`${t('prop.fovUltra', 'Ultra')} 95°`, 95],
            ].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdateCamera(c.id, { fov: v as number })}>{lbl}</button>
            ))}
          </div>
          <label className="prop-field">
            <span>{t('prop.label', 'Label')}</span>
            <input type="text" value={c.label || ''} onChange={(e) => onUpdateCamera(c.id, { label: e.target.value })} />
          </label>
          <div className="prop-derived">{t('prop.fovNote', 'A smaller field of view means more „tele" (tighter framing), a larger one means wide-angle.')}</div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(c.id)}>{t('prop.deleteCamera', 'Delete camera')}</button>
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
        <h3>{t('prop.wall', 'Wall')}</h3>
        <div className="prop-section">
          <div className="prop-derived lux-readout">{t('prop.length', 'Length')}: {len.toFixed(2)} m</div>
          {numField(t('prop.height', 'Height (m)'), w.height, (v) => onUpdateWall(w.id, { height: v }), 0.1, 0.1, 20)}
          <label className="prop-field">
            <span>{t('prop.curve', 'Curvature')}</span>
            <input type="range" min={-1} max={1} step={0.05} value={curveFrac}
              onChange={(e) => setCurve(Number(e.target.value))} />
          </label>
          <div className="prop-derived">{t('prop.curveNote', 'Or drag the yellow handle on the wall to bend it.')}</div>
          <label className="prop-field">
            <span>{t('prop.reflectance', 'Reflectance')} ({Math.round(w.reflectance * 100)}%)</span>
            <input type="range" min={0} max={1} step={0.05} value={w.reflectance}
              onChange={(e) => onUpdateWall(w.id, { reflectance: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[
              [t('prop.reflBlack', 'Black'), 0.05],
              [t('prop.reflConcrete', 'Concrete'), 0.35],
              [t('prop.reflLight', 'Light'), 0.6],
              [t('prop.reflWhite', 'White'), 0.85],
            ].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdateWall(w.id, { reflectance: v as number })}>{lbl}</button>
            ))}
          </div>
          <label className="prop-field">
            <span>{t('prop.surface', 'Surface')}</span>
            <select value={w.material ?? DEFAULT_WALL_MATERIAL}
              onChange={(e) => { const id = e.target.value as WallPresetId; onUpdateWall(w.id, { material: id, color: wallPreset(id).defaultColor }); }}>
              {WALL_PRESETS.map((wp) => <option key={wp.id} value={wp.id}>{translate(language, `wallPreset.${wp.id}`, wp.label)}</option>)}
            </select>
          </label>
          <label className="prop-field">
            <span>{t('prop.colour', 'Colour')}</span>
            <input type="color" value={w.color} onChange={(e) => onUpdateWall(w.id, { color: e.target.value })} />
          </label>
          <label className="prop-field">
            <span>{t('prop.label', 'Label')}</span>
            <input type="text" value={w.label || ''} onChange={(e) => onUpdateWall(w.id, { label: e.target.value })} />
          </label>
          <div className="prop-derived">{t('prop.wallNote', 'Surface & colour apply in render mode. Reflects light diffusely into the room (single bounce) – and feeds into the heat-map.')}</div>
        </div>
        {(() => {
          const wins = w.windows ?? [];
          const newId = () => 'win-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const setWindows = (next: WallWindow[]) => onUpdateWall(w.id, { windows: next });
          const updateWin = (id: string, patch: Partial<WallWindow>) =>
            setWindows(wins.map((x) => (x.id === id ? { ...x, ...patch } : x)));
          const removeWin = (id: string) => setWindows(wins.filter((x) => x.id !== id));
          const addWin = (glassFront: boolean) => {
            const L = wallLength(w);
            const win: WallWindow = glassFront
              ? { id: newId(), start: 0, width: Math.round(L * 100) / 100, sill: 0, top: w.height, transmittance: 0.9, tint: '#bfe3ff' }
              : { id: newId(), start: Math.max(0, Math.round((L / 2 - 0.6) * 100) / 100), width: Math.min(1.2, Math.round(L * 100) / 100), sill: 0.9, top: Math.min(2.1, w.height), transmittance: 0.85, tint: '#bfe3ff' };
            setWindows([...wins, win]);
          };
          return (
            <div className="prop-section">
              <div className="prop-section-title">{t('prop.windows', 'Windows & glass front')}</div>
              {wins.length === 0 && (
                <div className="prop-derived">{t('prop.noWindows', 'No windows. Windows are real openings – light (and the sun) falls through them into the room.')}</div>
              )}
              {wins.map((win, i) => (
                <div key={win.id} className="window-edit">
                  <div className="window-edit-head">
                    <span>{t('prop.window', 'Window')} {i + 1}</span>
                    <button className="window-del" onClick={() => removeWin(win.id)} title={t('prop.removeWindow', 'Remove window')}>✕</button>
                  </div>
                  {numField(t('prop.winStart', 'Start (m)'), win.start, (v) => updateWin(win.id, { start: v }), 0.1, 0)}
                  {numField(t('prop.width', 'Width (m)'), win.width, (v) => updateWin(win.id, { width: v }), 0.1, 0.1)}
                  {numField(t('prop.sill', 'Sill (m)'), win.sill, (v) => updateWin(win.id, { sill: v }), 0.1, 0, w.height)}
                  {numField(t('prop.winTop', 'Head (m)'), win.top, (v) => updateWin(win.id, { top: v }), 0.1, 0, w.height)}
                  <label className="prop-field">
                    <span>{t('prop.transmittance', 'Transmittance')} ({Math.round(win.transmittance * 100)}%)</span>
                    <input type="range" min={0} max={1} step={0.05} value={win.transmittance}
                      onChange={(e) => updateWin(win.id, { transmittance: Number(e.target.value) })} />
                  </label>
                  <label className="prop-field">
                    <span>{t('prop.glassTint', 'Glass tint')}</span>
                    <input type="color" value={win.tint} onChange={(e) => updateWin(win.id, { tint: e.target.value })} />
                  </label>
                </div>
              ))}
              <div className="window-actions">
                <button onClick={() => addWin(false)}>{t('prop.addWindow', '+ Window')}</button>
                <button onClick={() => addWin(true)}>{t('prop.addGlassFront', 'Glass front')}</button>
              </div>
            </div>
          );
        })()}
        <button className="delete-btn" onClick={() => onDelete(w.id)}>{t('prop.wallDelete', 'Delete wall')}</button>
      </div>
    );
  }

  if (selCeiling) {
    const c = selCeiling;
    return (
      <div className="property-panel">
        <h3>{t('prop.ceiling', 'Ceiling')}</h3>
        <div className="prop-section">
          <div className="prop-derived lux-readout">{c.points.length} {t('prop.vertices', 'vertices')}</div>
          {numField(t('prop.height', 'Height (m)'), c.height, (v) => onUpdateCeiling(c.id, { height: v }), 0.1, 0.5, 30)}
          <label className="prop-field">
            <span>{t('prop.reflectance', 'Reflectance')} ({Math.round(c.reflectance * 100)}%)</span>
            <input type="range" min={0} max={1} step={0.05} value={c.reflectance}
              onChange={(e) => onUpdateCeiling(c.id, { reflectance: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[
              [t('prop.reflDark', 'Dark'), 0.1],
              [t('prop.reflConcrete', 'Concrete'), 0.4],
              [t('prop.reflLight', 'Light'), 0.7],
              [t('prop.reflWhite', 'White'), 0.85],
            ].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdateCeiling(c.id, { reflectance: v as number })}>{lbl}</button>
            ))}
          </div>
          <label className="prop-field">
            <span>{t('prop.colour', 'Colour')}</span>
            <input type="color" value={c.color} onChange={(e) => onUpdateCeiling(c.id, { color: e.target.value })} />
          </label>
          <div className="prop-derived">{t('prop.ceilingNote', 'Reflects downwards into the room. Tip: „Ceiling" in the action bar above the plan rebuilds it from the walls.')}</div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(c.id)}>{t('prop.deleteCeiling', 'Delete ceiling')}</button>
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
        <h3>{isRect ? t('prop.shapeRectTitle', 'Area (rectangle)') : sh.type === 'measure' ? t('prop.shapeMeasure', 'Dimension line') : t('prop.shapeLine', 'Line')}</h3>
        <div className="prop-section">
          {isRect
            ? <div className="prop-derived lux-readout">{t('prop.shapeSize', 'Size')}: {w.toFixed(1)} × {h.toFixed(1)} m · {(w * h).toFixed(1)} m²</div>
            : <div className="prop-derived">{sh.label}</div>}
          <p className="prop-hint">{t('prop.shapeHint', 'Dragging an edge moves the area.')}</p>
        </div>
        {isRect && (
          <button className="auto-btn wide" onClick={onAreaLight}><Icon name="beam" size={13} />{t('prop.lightArea', 'Light up this area')}</button>
        )}
        <button className="delete-btn" onClick={() => onDelete(sh.id)}>{t('prop.delete', 'Delete')}</button>
      </div>
    );
  }

  // Multi-selection panel
  if (multiCount > 1) {
    return (
      <div className="property-panel">
        <h3>{multiCount} {t('prop.multiSelected', 'elements selected')}</h3>
        {multiFixtures.length > 0 && (
          <div className="prop-section">
            <span className="prop-section-title">{multiFixtures.length} {t('prop.fixtureCount', 'fixture(s)')}</span>
            <ul className="multi-sel-list">
              {multiFixtures.map((f) => (
                <li key={f.id}>{f.fixture.name}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.actions', 'Actions')}</span>
          <p className="prop-hint">
            {t('prop.multiMove', 'Move: drag one of the selected fixtures.')}<br />
            {t('prop.multiRotate', 'Rotate: use the rotate buttons in the action bar above the plan to turn the selection around a person.')}
          </p>
          {multiFixtures.length > 0 && (
            <div className="reflectance-presets">
              <button className="refl-btn" onClick={() => { for (const mf of multiFixtures) onUpdateFixture(mf.id, { hidden: true }); }}><Icon name="eyeOff" size={13} />{t('prop.hideShort', 'Hide')}</button>
              <button className="refl-btn" onClick={() => { for (const mf of multiFixtures) onUpdateFixture(mf.id, { hidden: undefined }); }}><Icon name="eye" size={13} />{t('prop.show', 'Show')}</button>
            </div>
          )}
        </div>
        <button className="delete-btn" onClick={() => { for (const sid of selectedIds) onDelete(sid); }}>
          {format(t('prop.deleteAllN', 'Delete all {n}'), { n: multiCount })}
        </button>
      </div>
    );
  }

  // No selection
  return (
    <div className="property-panel">
      <h3>{t('prop.title', 'Properties')}</h3>
      <p className="prop-hint">
        {t('prop.emptyHint', 'Select a fixture, a person or a stage element – or just get started:')}
      </p>
      <div className="prop-section">
        <span className="prop-section-title">{t('prop.quickstart', 'Quick start')}</span>
        <ol className="quickstart-list">
          <li><span><Icon name="plan2d" size={13} /></span> <strong>{t('prop.qs1Title', 'Floor plan')}</strong> {t('prop.qs1Body', 'import – JPG, PNG or PDF')}</li>
          <li><span><Icon name="ruler" size={13} /></span> <strong>{t('prop.qs2Title', 'Calibrate scale')}</strong> {t('prop.qs2Body', '– drag a distance, enter its real length')}</li>
          <li><span><Icon name="fixture" size={13} /></span> {t('prop.qs3', 'Drag fixtures from the library onto the plan')}</li>
        </ol>
      </div>
      <div className="prop-section">
        <span className="prop-section-title">{t('prop.keyboard', 'Keyboard')}</span>
        <div className="shortcut-grid">
          <kbd>{t('prop.kbdSpace', 'Space')}</kbd><span>{t('prop.kbdPan', 'Pan the view')}</span>
          <kbd>{t('prop.kbdWheel', 'Mouse wheel')}</kbd><span>{t('prop.kbdZoom', 'Zoom')}</span>
          <kbd>{t('prop.kbdUndoKey', 'Ctrl/⌘ Z')}</kbd><span>{t('prop.kbdUndo', 'Undo')}</span>
          <kbd>{t('prop.kbdDel', 'Del')}</kbd><span>{t('prop.delete', 'Delete')}</span>
          <kbd>Esc</kbd><span>{t('prop.kbdCancel', 'Cancel')}</span>
        </div>
      </div>
      {cursorLux !== null && (
        <div className="cursor-lux">
          {t('prop.cursor', 'Cursor')}: <strong>{cursorLux.toFixed(0)} lux</strong>
        </div>
      )}
    </div>
  );
};

export default PropertyPanel;
