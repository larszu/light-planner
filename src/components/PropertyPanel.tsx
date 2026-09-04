import React from 'react';
import type { PlacedFixture, Person, StageElement, Fixture, Truss, Wall, Ceiling, Shape, CameraView, WallWindow } from '../types';
import { wallMidHandle, curveControlForMid, wallLength } from '../core/geometry';
import { luxFromFixture, effectiveFieldAngleDeg, explainLux } from '../core/lightCalc';
import type { FixtureCategory, BeamShape, LensType, MountType, WallPresetId } from '../types';
import { WALL_PRESETS, DEFAULT_WALL_MATERIAL, wallPreset } from '../core/surfaceTextures';
import { DEFAULT_TRUSS_CAPACITY } from '../core/patch';
import { gelLibrary } from '../core/gelLibrary';
import { fixtureLibrary } from '../core/fixtureLibrary';
import { getFixtureCCT, cctToRgb } from '../core/colorTemp';
import { isEstimate, isStaleSource } from '../types';
import { useTranslation, translate } from '../i18n';

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
          <button type="button" className="nudge-btn" onClick={() => onChange(clamp(value - step))}>◀</button>
          <input type="number" value={value} step={step} min={min} max={max}
            onChange={(e) => onChange(Number(e.target.value))} />
          <button type="button" className="nudge-btn" onClick={() => onChange(clamp(value + step))}>▶</button>
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
            ? t('prop.showAgain', 'Leuchte wieder einblenden')
            : t('prop.hideTemp', 'Leuchte vorübergehend ausblenden (zählt nicht zur Heatmap)')}
        >
          {f.hidden ? `👁 ${t('prop.show', 'Einblenden')}` : `🚫 ${t('prop.hide', 'Vorübergehend ausblenden')}`}
        </button>
        {f.hidden && <div className="hide-note">{t('prop.hiddenNote', 'Ausgeblendet – diese Leuchte fließt aktuell nicht in die Heatmap ein. Die Werte unten zeigen ihren Beitrag, sobald sie wieder eingeblendet ist.')}</div>}

        {/* Fixture swap */}
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.swapFixture', 'Leuchte tauschen')}</span>
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
          {numField(t('prop.height', 'Höhe (m)'), f.mountingHeight, (v) => onUpdateFixture(f.id, { mountingHeight: v }), 0.5, 0.5, 30)}
        </div>

        <div className="prop-section">
          <span className="prop-section-title">{t('prop.aim', 'Ausrichtung')}</span>
          {numField(t('prop.aimX', 'Ziel X (m)'), f.aimX, (v) => onUpdateFixture(f.id, { aimX: v }))}
          {numField(t('prop.aimY', 'Ziel Y (m)'), f.aimY, (v) => onUpdateFixture(f.id, { aimY: v }))}
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
          <span className="prop-section-title">{t('prop.light', 'Licht')}</span>
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
            {t('prop.beamDetails', 'Strahl-Details')}
            <button type="button" className="beam-help-toggle" onClick={() => setBeamHelp((v) => !v)} title={t('prop.whatIsThis', 'Was bedeutet das?')}>ℹ</button>
          </span>
          <div className="beam-angles">
            <div><span className="ba-dot ba-beam" /> {t('prop.beam50', 'Beam (50 %)')} <strong>{effectiveBeamAngle.toFixed(1)}°</strong></div>
            <div><span className="ba-dot ba-field" /> {t('prop.field10', 'Field (10 %)')} <strong>{effFieldAngle.toFixed(1)}°</strong></div>
            {effCutoff != null && <div><span className="ba-dot ba-cut" /> {t('prop.cutoff', 'Cutoff (2,5 %)')} <strong>{effCutoff.toFixed(1)}°</strong></div>}
            {effectiveZoomRange
              ? <div><span className="ba-dot ba-zoom" /> {t('prop.zoomRange', 'Zoom-Bereich')} <strong>{effectiveZoomRange[0]}–{effectiveZoomRange[1]}°</strong></div>
              : <div><span className="ba-dot ba-zoom" /> {t('prop.zoom', 'Zoom')} <strong>{t('prop.zoomFixed', 'fest')}</strong></div>}
          </div>
          {beamHelp && (
            <div className="beam-help">
              <p><strong>{t('prop.help.beamTitle', 'Beam-Winkel (50 %)')}</strong> {t('prop.help.beamBody', '– der helle Kern: Winkel, bei dem die Intensität auf 50 % des Maximums abfällt (Hotspot/FWHM).')}</p>
              <p><strong>{t('prop.help.fieldTitle', 'Field-Winkel (10 %)')}</strong> {t('prop.help.fieldBody', '– der nutzbare Rand: bei 10 % des Maximums. Immer größer als der Beam-Winkel.')}</p>
              <p><strong>{t('prop.help.cutoffTitle', 'Cutoff (2,5 %)')}</strong> {t('prop.help.cutoffBody', '– wo das Licht praktisch endet.')}</p>
              <p><strong>{t('prop.help.zoomTitle', 'Zoom-Bereich')}</strong> {t('prop.help.zoomBody', '– bei Zoom-Geräten der einstellbare Beam-Winkel (eng ↔ weit). Beam & Field beschreiben die Strahlform bei der aktuellen Zoom-Stellung.')}</p>
            </div>
          )}
        </div>

        {/* Attachment selector */}
        {f.fixture.compatibleAttachments && f.fixture.compatibleAttachments.length > 0 && (
          <div className="prop-section">
            <span className="prop-section-title">{t('prop.attachment', 'Vorsatz / Attachment')}</span>
            <label className="prop-field">
              <span>{t('prop.mounted', 'Montiert')}</span>
              <select
                value={f.activeAttachmentId ?? ''}
                onChange={(e) => onUpdateFixture(f.id, {
                  activeAttachmentId: e.target.value || undefined,
                  currentBeamAngle: undefined, // reset zoom when switching
                })}
              >
                <option value="">{t('prop.noAttachment', 'Kein Vorsatz (Bare)')}</option>
                {f.fixture.compatibleAttachments.map((att) => (
                  <option key={att.id} value={att.id}>
                    {att.name} ({att.type}) +{att.weightAdditional}kg
                  </option>
                ))}
              </select>
            </label>
            {activeAtt && (
              <div className="prop-derived">
                {t('prop.type', 'Typ')}: {activeAtt.type}<br />
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
          <span className="prop-section-title">{t('prop.gel', 'Filter / Gel')}</span>
          <label className="prop-field">
            <span>{t('prop.gelAdd', 'Gel hinzufügen')}</span>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const current = f.gelFilterIds ?? [];
                onUpdateFixture(f.id, { gelFilterIds: [...current, e.target.value] });
              }}
            >
              <option value="">{t('prop.pick', '– Auswählen –')}</option>
              <optgroup label={t('prop.gelCto', 'CTO (Warm)')}>
                {gelLibrary.filter((g) => g.type === 'CTO').map((g) => (
                  <option key={g.id} value={g.id}>{g.brand} {g.code} {g.name} ({Math.round((1 - g.transmissionFactor) * 100)}% {t('prop.gelLoss', 'Verlust')})</option>
                ))}
              </optgroup>
              <optgroup label={t('prop.gelCtb', 'CTB (Kalt)')}>
                {gelLibrary.filter((g) => g.type === 'CTB').map((g) => (
                  <option key={g.id} value={g.id}>{g.brand} {g.code} {g.name} ({Math.round((1 - g.transmissionFactor) * 100)}% {t('prop.gelLoss', 'Verlust')})</option>
                ))}
              </optgroup>
              <optgroup label={t('prop.gelFrost', 'Frost / Diffusion')}>
                {gelLibrary.filter((g) => g.type === 'frost').map((g) => (
                  <option key={g.id} value={g.id}>{g.brand} {g.code} {g.name} ({Math.round((1 - g.transmissionFactor) * 100)}% {t('prop.gelLoss', 'Verlust')})</option>
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
            {t('prop.barnTitle', 'Flügeltore & Folien-Position')}
            <button type="button" className="beam-help-toggle" onClick={() => setBarnHelp((v) => !v)} title={t('prop.explainDiff', 'Unterschiede erklären')}>ℹ</button>
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
                {flapRow(t('prop.top', 'Oben'), bd.top, (v) => setBarn({ top: v }))}
                {flapRow(t('prop.bottom', 'Unten'), bd.bottom, (v) => setBarn({ bottom: v }))}
                {flapRow(t('prop.left', 'Links'), bd.left, (v) => setBarn({ left: v }))}
                {flapRow(t('prop.right', 'Rechts'), bd.right, (v) => setBarn({ right: v }))}
                <div className="reflectance-presets">
                  <button className="refl-btn" onClick={() => onUpdateFixture(f.id, { barnDoors: undefined })}>{t('prop.barnOpenAll', 'Alle öffnen')}</button>
                  <button className="refl-btn" onClick={() => setBarn({ top: 0.6, bottom: 0.6 })}>{t('prop.barnTopBottom', 'Ober/Unter ½')}</button>
                  <button className="refl-btn" onClick={() => setBarn({ left: 0.6, right: 0.6 })}>{t('prop.barnSides', 'Seiten ½')}</button>
                </div>
                <div className="prop-derived">{t('prop.barnNote', 'Schneiden den Strahl seitlich ab (im Bezugsrahmen der Leuchte, mit Rotation gedreht) – fließt direkt in die Heatmap ein.')}</div>
              </>
            );
          })()}
          <div className="prop-field-sub">{t('prop.gelPlacement', 'Folien-Position (Filterrahmen vs. vor den Toren):')}</div>
          <div className="gel-placement-toggle">
            {([
              ['frame', t('prop.gelInFrame', 'Im Rahmen (an Linse)')],
              ['front', t('prop.gelInFront', 'Vor den Flügeltoren')],
            ] as const).map(([val, lbl]) => (
              <button key={val} type="button"
                className={`gp-btn${(f.gelPlacement ?? 'frame') === val ? ' active' : ''}`}
                onClick={() => onUpdateFixture(f.id, { gelPlacement: val })}>{lbl}</button>
            ))}
          </div>
          <div className="prop-derived gel-placement-note">
            {(f.gelPlacement ?? 'frame') === 'frame'
              ? t('prop.gelFrameNote', 'Folie im Farbrahmen direkt an der Linse → scharfer Flügeltor-Schnitt. Sie steht aber am heißesten, kräftige Farben (Dunkelblau/Grün) brennen am schnellsten aus.')
              : t('prop.gelFrontNote', 'Folie hängt vor den Toren → die beleuchtete Folie wird zur neuen, größeren Quelle, der Schnitt wird weicher. Mit echtem Frost werden die Tore praktisch wirkungslos. Dafür bleibt die Folie kühler und hält länger.')}
          </div>
          {barnHelp && (
            <div className="beam-help">
              <p><strong>{t('prop.barnHelp.orderTitle', 'Reihenfolge im Scheinwerfer:')}</strong> {t('prop.barnHelp.orderBody', 'Lampe → Linse → Farbrahmen (Runner) → Flügeltore (mit eigenem Folienschlitz davor).')}</p>
              <p><strong>{t('prop.barnHelp.heatTitle', 'Wärme & Lebensdauer:')}</strong> {t('prop.barnHelp.heatBody', 'Je näher an der Linse, desto heißer. Folie im Rahmen verblasst/verbrennt am schnellsten (IR-Absorption); vor den Toren läuft sie kühler und hält länger.')}</p>
              <p><strong>{t('prop.barnHelp.opticsTitle', 'Optik:')}</strong> {t('prop.barnHelp.opticsBody', 'Diffusion weiter weg = weicher (die beleuchtete Folie wird zur Quelle). Vor die Tore gehängt hebt sie deren Schnitt auf – für einen sauberen Schnitt gehört die Folie in den Rahmen hinter die Tore.')}</p>
            </div>
          )}
        </div>

        <div className="prop-section">
          <span className="prop-section-title">{t('prop.patch', 'Patch / Paperwork')}</span>
          {patchConflicts.has(f.id) && <div className="patch-conflict">⚠ {t('prop.dmxClash', 'DMX-Adresse überschneidet sich')}</div>}
          <label className="prop-field">
            <span>{t('prop.channel', 'Kanal')}</span>
            <input type="number" min={0} value={f.channel ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { channel: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <label className="prop-field">
            <span>{t('prop.unitNo', 'Unit-Nr.')}</span>
            <input type="text" value={f.unitNumber ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { unitNumber: e.target.value || undefined })} />
          </label>
          <label className="prop-field">
            <span>{t('prop.universe', 'Universe')}</span>
            <input type="number" min={1} value={f.universe ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { universe: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <label className="prop-field">
            <span>{t('prop.dmxAddr', 'DMX-Adr.')}</span>
            <input type="number" min={1} max={512} value={f.dmxAddress ?? ''}
              onChange={(e) => onUpdateFixture(f.id, { dmxAddress: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <div className="prop-derived">
            {t('prop.footprint', 'Footprint')}: {f.fixture.dmxChannels && f.fixture.dmxChannels > 0 ? `${f.fixture.dmxChannels} DMX-Ch` : t('prop.dimmer1ch', 'Dimmer (1 Ch)')}
          </div>
          <label className="prop-field">
            <span>{t('prop.purpose', 'Zweck')}</span>
            <input type="text" value={f.purpose ?? ''} placeholder={t('prop.purposePh', 'z. B. Frontlicht')}
              onChange={(e) => onUpdateFixture(f.id, { purpose: e.target.value || undefined })} />
          </label>
        </div>

        {/* Editable technical data – every value can be checked & adjusted per lamp */}
        <div className="prop-section">
          <span className="prop-section-title">
            {t('prop.specs', 'Technische Daten (anpassbar)')}
            <button type="button" className="beam-help-toggle" onClick={() => setShowSpecs((v) => !v)} title={t('prop.toggle', 'Ein-/ausklappen')}>{showSpecs ? '▾' : '▸'}</button>
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
                    title={t('prop.srcStale', 'Beleg bezog sich auf {value}: {source}\nDer Wert wurde seitdem von Hand geändert.')
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
                  title={`${est ? t('prop.estimated', 'Geschätzt') : t('prop.evidence', 'Beleg')}: ${entry.source}`}
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
                <label className="prop-field"><span>{t('prop.manufacturer', 'Hersteller')}</span>
                  <input type="text" value={f.fixture.manufacturer} onChange={(e) => setSpec({ manufacturer: e.target.value })} /></label>
                <label className="prop-field"><span>{t('prop.type', 'Typ')}</span>
                  <input type="text" value={f.fixture.name} onChange={(e) => setSpec({ name: e.target.value })} /></label>
                {sNum(t('prop.wattage', 'Leistung (W)'), f.fixture.wattage, (v) => setSpec({ wattage: v }), 1, undefined, 'wattage')}
                {sNum(t('prop.lumens', 'Lichtstrom (lm)'), f.fixture.lumens, (v) => setSpec({ lumens: v }), 50, t('prop.lumensHint', 'Gesamt-Lichtstrom (Fallback, wenn keine Lux-Referenz)'), 'lumens')}
                {sNum(t('prop.beamSpec', 'Beam 50 % (°)'), f.fixture.beamAngle, (v) => setSpec({ beamAngle: v }), 0.5, t('prop.beamSpecHint', 'Heller Kern (FWHM)'), 'beamAngle')}
                {sNum(t('prop.fieldSpec', 'Field 10 % (°)'), f.fixture.fieldAngle, (v) => setSpec({ fieldAngle: v }), 0.5, t('prop.fieldSpecHint', 'Nutzbarer Rand – treibt die Berechnung (σ)'), 'fieldAngle')}
                {sNum(t('prop.cutoffSpec', 'Cutoff 2,5 % (°)'), f.fixture.cutoffAngle, (v) => setSpec({ cutoffAngle: v || undefined }), 0.5, t('prop.cutoffSpecHint', 'Wo das Licht endet (optional)'), 'cutoffAngle')}
                <label className="prop-field"><span>{t('prop.beamShape', 'Strahlform')}</span>
                  <select value={f.fixture.beamShape} onChange={(e) => setSpec({ beamShape: e.target.value as BeamShape })}>
                    <option value="circular">{t('prop.shapeCircular', 'Kreisförmig')}</option><option value="elliptical">{t('prop.shapeElliptical', 'Elliptisch')}</option>
                    <option value="linear">{t('prop.shapeLinear', 'Linear')}</option><option value="rectangular">{t('prop.shapeRect', 'Rechteckig')}</option>
                  </select></label>
                {f.fixture.beamShape !== 'circular' && sNum(t('prop.beamRatio', 'Beam W:H'), f.fixture.beamRatioWH, (v) => setSpec({ beamRatioWH: v }), 0.1)}
                <label className="prop-field"><span>{t('prop.lensType', 'Linsentyp')}</span>
                  <select value={f.fixture.lensType} onChange={(e) => setSpec({ lensType: e.target.value as LensType })}>
                    <option value="fixed">{t('prop.lensFixed', 'Fest')}</option><option value="zoom">{t('prop.lensZoom', 'Zoom')}</option><option value="interchangeable">{t('prop.lensInter', 'Wechselbar')}</option>
                    <option value="fresnel">Fresnel</option><option value="pc">PC</option><option value="reflector">{t('prop.lensReflector', 'Reflektor')}</option>
                  </select></label>
                <label className="prop-field"><span>{t('prop.mount', 'Befestigung')}</span>
                  <select value={f.fixture.mountType} onChange={(e) => setSpec({ mountType: e.target.value as MountType })}>
                    {Object.keys(MOUNT_LABELS).map((k) => <option key={k} value={k}>{mountLabel(language, k)}</option>)}
                  </select></label>
                {f.fixture.zoomRange && (
                  <div className="prop-field"><span>{t('prop.zoomRangeSpec', 'Zoom-Bereich (°)')}</span>
                    <span className="zoom-range-edit">
                      <input type="number" step={0.5} value={f.fixture.zoomRange[0]} onChange={(e) => setSpec({ zoomRange: [Number(e.target.value), f.fixture.zoomRange![1]] })} />
                      <input type="number" step={0.5} value={f.fixture.zoomRange[1]} onChange={(e) => setSpec({ zoomRange: [f.fixture.zoomRange![0], Number(e.target.value)] })} />
                    </span>
                  </div>
                )}
                {sNum(t('prop.cct', 'Farbtemp. (K, 0=RGBW)'), f.fixture.colorTemp, (v) => setSpec({ colorTemp: v }), 100)}
                {sNum(t('prop.weight', 'Gewicht (kg)'), f.fixture.weight, (v) => setSpec({ weight: v }), 0.1)}
                {sNum('CRI', f.fixture.cri, (v) => setSpec({ cri: v || undefined }), 1)}
                {sNum('TLCI', f.fixture.tlci, (v) => setSpec({ tlci: v || undefined }), 1)}
                {sNum(t('prop.dmxChannels', 'DMX-Kanäle'), f.fixture.dmxChannels, (v) => setSpec({ dmxChannels: v || undefined }), 1)}
                <label className="prop-field"><span>{t('prop.ipRating', 'IP-Schutzart')}</span>
                  <input type="text" value={f.fixture.ipRating ?? ''} onChange={(e) => setSpec({ ipRating: e.target.value || undefined })} /></label>
                <div className="prop-field-sub">{t('prop.photoRef', 'Photometrische Referenz (treibt die Lux-Berechnung):')}</div>
                {sNum(t('prop.refLux', 'Ref. Lux'), photo?.lux, (v) => setSpec({ photometric: { ...(photo ?? { lux: v, distance: 1 }), lux: v } }), 100)}
                {sNum(t('prop.refDistance', 'Ref. Abstand (m)'), photo?.distance, (v) => setSpec({ photometric: { ...(photo ?? { lux: 10000, distance: v }), distance: v } }), 0.5)}
                {sNum(t('prop.refBeam', 'Ref. bei Beam (°)'), photo?.beamAngle, (v) => setSpec({ photometric: { ...(photo ?? { lux: 10000, distance: 1 }), beamAngle: v } }), 0.5, t('prop.refBeamHint', 'Beam-Winkel, bei dem die Lux-Referenz gemessen wurde'))}
              </>
            );
          })()}
        </div>

        {/* Calculation trace – fully visible & manually verifiable */}
        <div className="prop-section">
          <span className="prop-section-title">
            {t('prop.calcTitle', 'Rechenweg (Lux am Zielpunkt)')}
            <button type="button" className="beam-help-toggle" onClick={() => setShowCalc((v) => !v)} title={t('prop.calcShow', 'Rechenweg zeigen')}>{showCalc ? '▾' : '▸'}</button>
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
                      ? <tr><td>{t('prop.calc.reference', 'Referenz')}</td><td>{fmt(b.refLux!)} lx @ {b.refDistance} m</td><td>→ I₀ = lx·d² = <b>{fmt(b.basePeakCd)} cd</b></td></tr>
                      : <tr><td>{t('prop.calc.source', 'Quelle')}</td><td>{fmt(f.fixture.lumens)} lm</td><td>→ I₀ = <b>{fmt(b.basePeakCd)} cd</b></td></tr>}
                    {b.source === 'photometric' && Math.abs(b.zoomComp - 1) > 0.001 &&
                      <tr><td>{t('prop.calc.zoomComp', 'Zoom-Komp.')}</td><td>×{b.zoomComp.toFixed(3)}</td><td>Field {b.fieldAngleDeg.toFixed(1)}°</td></tr>}
                    <tr><td>{t('prop.calc.peak', 'Peak I₀')}</td><td colSpan={2}><b>{fmt(b.peakCd)} cd</b></td></tr>
                    <tr><td>{t('prop.calc.dimmer', 'Dimmer')}</td><td>×{(b.dimming * 100).toFixed(0)} %</td><td>{b.dimming.toFixed(2)}</td></tr>
                    {b.gel < 1 && <tr><td>{t('prop.calc.gel', 'Gel')}</td><td>×{(b.gel * 100).toFixed(0)} %</td><td>{b.gel.toFixed(2)}</td></tr>}
                    <tr><td>{t('prop.calc.gauss', 'Gauss')}</td><td>×{b.gauss.toFixed(3)}</td><td>θ = {b.offAxisDeg.toFixed(1)}°</td></tr>
                    {f.barnDoors && <tr><td>{t('prop.calc.barn', 'Flügeltore')}</td><td>×{b.barnDoor.toFixed(3)}</td><td>{b.barnDoor > 0.999
                      ? t('prop.calc.barnClear', 'Zielpunkt nicht geschnitten')
                      : (f.gelPlacement ?? 'frame') === 'front'
                        ? t('prop.calc.barnSoft', 'weich (vor Toren)')
                        : t('prop.calc.barnSharp', 'scharf (im Rahmen)')}</td></tr>}
                    <tr><td>cos θ<sub>{t('prop.calc.incidence', 'einf.')}</sub></td><td>×{b.cosIncidence.toFixed(3)}</td><td>h = {f.mountingHeight} m</td></tr>
                    <tr><td>÷ d²</td><td>d = {b.distance.toFixed(2)} m</td><td>d² = {fmt(b.distance * b.distance, 1)}</td></tr>
                    <tr className="calc-result"><td>= E</td><td colSpan={2}><b>{fmt(b.lux)} lx</b></td></tr>
                  </tbody>
                </table>
                <div className="calc-note">{t('prop.calc.note', 'Alle Werte stammen aus den anpassbaren Daten oben – so lässt sich jeder Schritt nachrechnen. (Elliptische Korrektur bei nicht-runden Strahlen hier vereinfacht.)')}</div>
              </div>
            );
          })()}
        </div>

        <button className="delete-btn" onClick={() => onDelete(f.id)}>{t('prop.deleteFixture', 'Leuchte löschen')}</button>
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
          {numField(t('prop.size', 'Größe (m)'), p.height, (v) => onUpdatePerson(p.id, { height: v }), 0.05, 0.5, 2.5)}
          <label className="prop-field">
            <span>{t('prop.name', 'Name')}</span>
            <input type="text" value={p.label || ''} onChange={(e) => onUpdatePerson(p.id, { label: e.target.value })} />
          </label>
        </div>
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.poseTitle', 'Haltung & Blick (Foto-Ansicht)')}</span>
          <label className="prop-field">
            <span>{t('prop.pose', 'Haltung')}</span>
            <select value={p.pose ?? 'standing'} onChange={(e) => onUpdatePerson(p.id, { pose: e.target.value as 'standing' | 'sitting' })}>
              <option value="standing">{t('prop.standing', 'Stehend')}</option>
              <option value="sitting">{t('prop.sitting', 'Sitzend')}</option>
            </select>
          </label>
          <label className="prop-field">
            <span>{t('prop.facing', 'Blickrichtung')} ({Math.round(p.facing ?? 270)}°)</span>
            <input type="range" min={0} max={360} step={5} value={p.facing ?? 270}
              onChange={(e) => onUpdatePerson(p.id, { facing: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[
              [`↑ ${t('prop.faceStage', 'Bühne')}`, 90],
              [`↓ ${t('prop.faceAudience', 'Publikum')}`, 270],
              [`← ${t('prop.faceLeft', 'Links')}`, 180],
              [`→ ${t('prop.faceRight', 'Rechts')}`, 0],
            ].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdatePerson(p.id, { facing: v as number })}>{lbl}</button>
            ))}
          </div>
          <div className="prop-derived">{t('prop.poseNote', 'Sitzend pairt gut mit einem Podest/Stuhl darunter. Wirkt im 3D-Foto-Modus.')}</div>
        </div>
        <button className="auto-btn wide" onClick={() => onAutoThreePointForPerson(p.id)}>
          💡 {t('prop.threePoint', '3-Punkt-Licht erzeugen')}
        </button>
        <button className="delete-btn" onClick={() => onDelete(p.id)}>{t('prop.deletePerson', 'Person löschen')}</button>
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
          <h3>{t('prop.stagePoly', 'Bühne (Polygon)')}</h3>
          <div className="prop-section">
            <div className="prop-derived lux-readout">{se.points.length} {t('prop.vertices', 'Eckpunkte')} · {t('prop.bbox', 'Hülle')} {bw.toFixed(1)} × {bd.toFixed(1)} m</div>
            {numField(t('prop.height', 'Höhe (m)'), se.height, (v) => onUpdateStageElement(se.id, { height: v }), 0.1, 0, 5)}
            <label className="prop-field">
              <span>{t('prop.label', 'Bezeichnung')}</span>
              <input type="text" value={se.label || ''} onChange={(e) => onUpdateStageElement(se.id, { label: e.target.value })} />
            </label>
            <div className="prop-derived">{t('prop.stagePolyNote', 'Frei gezeichnete Bühne. Ziehen verschiebt sie samt Umriss.')}</div>
          </div>
          <button className="delete-btn" onClick={() => onDelete(se.id)}>{t('prop.deleteStage', 'Bühne löschen')}</button>
        </div>
      );
    }
    return (
      <div className="property-panel">
        <h3>{t('prop.stageElement', 'Bühnen-Element')}</h3>
        <div className="prop-section">
          {numField('X (m)', se.x, (v) => onUpdateStageElement(se.id, { x: v }))}
          {numField('Y (m)', se.y, (v) => onUpdateStageElement(se.id, { y: v }))}
          {numField(t('prop.width', 'Breite (m)'), se.width, (v) => onUpdateStageElement(se.id, { width: v }), 0.5, 0.5)}
          {numField(t('prop.depth', 'Tiefe (m)'), se.depth, (v) => onUpdateStageElement(se.id, { depth: v }), 0.5, 0.5)}
          {numField(se.height2 != null ? t('prop.heightFront', 'Höhe vorne (m)') : t('prop.height', 'Höhe (m)'), se.height, (v) => onUpdateStageElement(se.id, { height: v }), 0.1, 0.1, 5)}
          <label className="prop-field">
            <span>{t('prop.heightBack', 'Höhe hinten (m)')}</span>
            <input type="number" step={0.1} min={0} value={se.height2 ?? ''} placeholder={t('prop.flat', '= flach')}
              onChange={(e) => onUpdateStageElement(se.id, { height2: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          {numField(t('prop.rotation', 'Rotation (°)'), se.rotation, (v) => onUpdateStageElement(se.id, { rotation: v }), 15, 0, 360)}
          <label className="prop-field">
            <span>{t('prop.label', 'Bezeichnung')}</span>
            <input type="text" value={se.label || ''} onChange={(e) => onUpdateStageElement(se.id, { label: e.target.value })} />
          </label>
          <div className="prop-derived">
            {se.height2 != null && Math.abs(se.height2 - se.height) > 0.01
              ? t('prop.rampNote', 'Rampe / Schräge: {a} m → {b} m (über {d} m Tiefe)')
                  .replace('{a}', String(se.height)).replace('{b}', String(se.height2)).replace('{d}', String(se.depth))
              : t('prop.stageTip', 'Tipp: „Höhe hinten" setzen ergibt eine Rampe/Schräge. Ecken ziehen ändert die Größe.')}
          </div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(se.id)}>{t('prop.deleteElement', 'Element löschen')}</button>
      </div>
    );
  }

  if (selTruss) {
    const tr = selTruss; // nicht `t` -- das ist die Uebersetzungsfunktion
    const len = Math.hypot(tr.x2 - tr.x1, tr.y2 - tr.y1);
    return (
      <div className="property-panel">
        <h3>{t('prop.truss', 'Traverse')}</h3>
        <div className="prop-section">
          <div className="prop-derived lux-readout">{t('prop.length', 'Länge')}: {len.toFixed(2)} m</div>
          {numField(t('prop.startX', 'Start X (m)'), tr.x1, (v) => onUpdateTruss(tr.id, { x1: v }))}
          {numField(t('prop.startY', 'Start Y (m)'), tr.y1, (v) => onUpdateTruss(tr.id, { y1: v }))}
          {numField(t('prop.endX', 'Ende X (m)'), tr.x2, (v) => onUpdateTruss(tr.id, { x2: v }))}
          {numField(t('prop.endY', 'Ende Y (m)'), tr.y2, (v) => onUpdateTruss(tr.id, { y2: v }))}
          {numField(t('prop.trimHeight', 'Trimm-Höhe (m)'), tr.height, (v) => onUpdateTruss(tr.id, { height: v }), 0.5, 0, 30)}
          {numField(t('prop.capacity', 'Traglast (kg)'), tr.capacity ?? DEFAULT_TRUSS_CAPACITY, (v) => onUpdateTruss(tr.id, { capacity: v }), 10, 0, 5000)}
          <label className="prop-field">
            <span>{t('prop.label', 'Bezeichnung')}</span>
            <input type="text" value={tr.label || ''} onChange={(e) => onUpdateTruss(tr.id, { label: e.target.value })} />
          </label>
          <div className="prop-derived">{t('prop.trussLoadNote', 'Last & Auslastung pro Traverse siehe Geräteliste → „Last pro Traverse".')}</div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(tr.id)}>{t('prop.deleteTruss', 'Traverse löschen')}</button>
      </div>
    );
  }

  if (selCamera) {
    const c = selCamera;
    const hDist = Math.hypot(c.aimX - c.x, c.aimY - c.y);
    const tilt = (Math.atan2(c.height, Math.max(0.01, hDist)) * 180) / Math.PI;
    return (
      <div className="property-panel">
        <h3>🎥 {t('prop.camera', 'Kamera')}</h3>
        <button className="auto-btn wide" onClick={() => onLookThroughCamera(c.id)}>
          🎬 {t('prop.lookThrough', 'Durch diese Kamera schauen')}
        </button>
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.posAndView', 'Position & Blick')}</span>
          {numField('X (m)', c.x, (v) => onUpdateCamera(c.id, { x: v }))}
          {numField('Y (m)', c.y, (v) => onUpdateCamera(c.id, { y: v }))}
          {numField(t('prop.eyeHeight', 'Augenhöhe (m)'), c.height, (v) => onUpdateCamera(c.id, { height: v }), 0.1, 0.1, 30)}
          {numField(t('prop.aimX', 'Ziel X (m)'), c.aimX, (v) => onUpdateCamera(c.id, { aimX: v }))}
          {numField(t('prop.aimY', 'Ziel Y (m)'), c.aimY, (v) => onUpdateCamera(c.id, { aimY: v }))}
          <div className="prop-derived">{t('prop.camView', 'Blick')} {hDist.toFixed(1)} m {t('prop.camFar', 'weit')} · {t('prop.camApprox', 'ca.')} {tilt.toFixed(0)}° {t('prop.camDown', 'nach unten')}</div>
        </div>
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.lens', 'Objektiv')}</span>
          <label className="prop-field">
            <span>{t('prop.fov', 'Bildwinkel')} ({c.fov}°)</span>
            <input type="range" min={10} max={110} step={1} value={c.fov}
              onChange={(e) => onUpdateCamera(c.id, { fov: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[
              [`${t('prop.fovTele', 'Tele')} 35°`, 35],
              [`${t('prop.fovNormal', 'Normal')} 50°`, 50],
              [`${t('prop.fovWide', 'Weit')} 75°`, 75],
              [`${t('prop.fovUltra', 'Ultra')} 95°`, 95],
            ].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdateCamera(c.id, { fov: v as number })}>{lbl}</button>
            ))}
          </div>
          <label className="prop-field">
            <span>{t('prop.label', 'Bezeichnung')}</span>
            <input type="text" value={c.label || ''} onChange={(e) => onUpdateCamera(c.id, { label: e.target.value })} />
          </label>
          <div className="prop-derived">{t('prop.fovNote', 'Kleinerer Bildwinkel = mehr „Tele" (engerer Ausschnitt), größerer = Weitwinkel.')}</div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(c.id)}>{t('prop.deleteCamera', 'Kamera löschen')}</button>
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
        <h3>{t('prop.wall', 'Wand')}</h3>
        <div className="prop-section">
          <div className="prop-derived lux-readout">{t('prop.length', 'Länge')}: {len.toFixed(2)} m</div>
          {numField(t('prop.height', 'Höhe (m)'), w.height, (v) => onUpdateWall(w.id, { height: v }), 0.1, 0.1, 20)}
          <label className="prop-field">
            <span>{t('prop.curve', 'Krümmung')}</span>
            <input type="range" min={-1} max={1} step={0.05} value={curveFrac}
              onChange={(e) => setCurve(Number(e.target.value))} />
          </label>
          <div className="prop-derived">{t('prop.curveNote', 'Oder den gelben Griff auf der Wand ziehen, um sie zu biegen.')}</div>
          <label className="prop-field">
            <span>{t('prop.reflectance', 'Reflexion')} ({Math.round(w.reflectance * 100)}%)</span>
            <input type="range" min={0} max={1} step={0.05} value={w.reflectance}
              onChange={(e) => onUpdateWall(w.id, { reflectance: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[
              [t('prop.reflBlack', 'Schwarz'), 0.05],
              [t('prop.reflConcrete', 'Beton'), 0.35],
              [t('prop.reflLight', 'Hell'), 0.6],
              [t('prop.reflWhite', 'Weiß'), 0.85],
            ].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdateWall(w.id, { reflectance: v as number })}>{lbl}</button>
            ))}
          </div>
          <label className="prop-field">
            <span>{t('prop.surface', 'Oberfläche')}</span>
            <select value={w.material ?? DEFAULT_WALL_MATERIAL}
              onChange={(e) => { const id = e.target.value as WallPresetId; onUpdateWall(w.id, { material: id, color: wallPreset(id).defaultColor }); }}>
              {WALL_PRESETS.map((wp) => <option key={wp.id} value={wp.id}>{translate(language, `wallPreset.${wp.id}`, wp.label)}</option>)}
            </select>
          </label>
          <label className="prop-field">
            <span>{t('prop.colour', 'Farbe')}</span>
            <input type="color" value={w.color} onChange={(e) => onUpdateWall(w.id, { color: e.target.value })} />
          </label>
          <label className="prop-field">
            <span>{t('prop.label', 'Bezeichnung')}</span>
            <input type="text" value={w.label || ''} onChange={(e) => onUpdateWall(w.id, { label: e.target.value })} />
          </label>
          <div className="prop-derived">{t('prop.wallNote', 'Oberfläche & Farbe gelten im Render-Modus. Reflektiert Licht diffus in den Raum (Ein-Bounce) – fließt in die Heatmap ein.')}</div>
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
              <div className="prop-section-title">{t('prop.windows', 'Fenster & Glasfront')}</div>
              {wins.length === 0 && (
                <div className="prop-derived">{t('prop.noWindows', 'Keine Fenster. Fenster sind echte Öffnungen – Licht (und die Sonne) fällt durch sie in den Raum.')}</div>
              )}
              {wins.map((win, i) => (
                <div key={win.id} className="window-edit">
                  <div className="window-edit-head">
                    <span>{t('prop.window', 'Fenster')} {i + 1}</span>
                    <button className="window-del" onClick={() => removeWin(win.id)} title={t('prop.removeWindow', 'Fenster entfernen')}>✕</button>
                  </div>
                  {numField(t('prop.winStart', 'Start (m)'), win.start, (v) => updateWin(win.id, { start: v }), 0.1, 0)}
                  {numField(t('prop.width', 'Breite (m)'), win.width, (v) => updateWin(win.id, { width: v }), 0.1, 0.1)}
                  {numField(t('prop.sill', 'Brüstung (m)'), win.sill, (v) => updateWin(win.id, { sill: v }), 0.1, 0, w.height)}
                  {numField(t('prop.winTop', 'Oberkante (m)'), win.top, (v) => updateWin(win.id, { top: v }), 0.1, 0, w.height)}
                  <label className="prop-field">
                    <span>{t('prop.transmittance', 'Lichtdurchlass')} ({Math.round(win.transmittance * 100)}%)</span>
                    <input type="range" min={0} max={1} step={0.05} value={win.transmittance}
                      onChange={(e) => updateWin(win.id, { transmittance: Number(e.target.value) })} />
                  </label>
                  <label className="prop-field">
                    <span>{t('prop.glassTint', 'Glasfarbe')}</span>
                    <input type="color" value={win.tint} onChange={(e) => updateWin(win.id, { tint: e.target.value })} />
                  </label>
                </div>
              ))}
              <div className="window-actions">
                <button onClick={() => addWin(false)}>+ Fenster</button>
                <button onClick={() => addWin(true)}>Glasfront</button>
              </div>
            </div>
          );
        })()}
        <button className="delete-btn" onClick={() => onDelete(w.id)}>Wand löschen</button>
      </div>
    );
  }

  if (selCeiling) {
    const c = selCeiling;
    return (
      <div className="property-panel">
        <h3>{t('prop.ceiling', 'Decke')}</h3>
        <div className="prop-section">
          <div className="prop-derived lux-readout">{c.points.length} {t('prop.vertices', 'Eckpunkte')}</div>
          {numField(t('prop.height', 'Höhe (m)'), c.height, (v) => onUpdateCeiling(c.id, { height: v }), 0.1, 0.5, 30)}
          <label className="prop-field">
            <span>{t('prop.reflectance', 'Reflexion')} ({Math.round(c.reflectance * 100)}%)</span>
            <input type="range" min={0} max={1} step={0.05} value={c.reflectance}
              onChange={(e) => onUpdateCeiling(c.id, { reflectance: Number(e.target.value) })} />
          </label>
          <div className="reflectance-presets">
            {[
              [t('prop.reflDark', 'Dunkel'), 0.1],
              [t('prop.reflConcrete', 'Beton'), 0.4],
              [t('prop.reflLight', 'Hell'), 0.7],
              [t('prop.reflWhite', 'Weiß'), 0.85],
            ].map(([lbl, v]) => (
              <button key={lbl as string} className="refl-btn" onClick={() => onUpdateCeiling(c.id, { reflectance: v as number })}>{lbl}</button>
            ))}
          </div>
          <label className="prop-field">
            <span>{t('prop.colour', 'Farbe')}</span>
            <input type="color" value={c.color} onChange={(e) => onUpdateCeiling(c.id, { color: e.target.value })} />
          </label>
          <div className="prop-derived">{t('prop.ceilingNote', 'Reflektiert nach unten in den Raum. Tipp: „Decke" in der Toolbar erzeugt sie neu aus den Wänden.')}</div>
        </div>
        <button className="delete-btn" onClick={() => onDelete(c.id)}>{t('prop.deleteCeiling', 'Decke löschen')}</button>
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
        <h3>{isRect ? t('prop.shapeRectTitle', 'Fläche (Rechteck)') : sh.type === 'measure' ? t('prop.shapeMeasure', 'Maßlinie') : t('prop.shapeLine', 'Linie')}</h3>
        <div className="prop-section">
          {isRect
            ? <div className="prop-derived lux-readout">{t('prop.shapeSize', 'Größe')}: {w.toFixed(1)} × {h.toFixed(1)} m · {(w * h).toFixed(1)} m²</div>
            : <div className="prop-derived">{sh.label}</div>}
          <p className="prop-hint">{t('prop.shapeHint', 'Kante ziehen verschiebt die Fläche.')}</p>
        </div>
        {isRect && (
          <button className="auto-btn wide" onClick={onAreaLight}>🔆 {t('prop.lightArea', 'Diese Fläche ausleuchten')}</button>
        )}
        <button className="delete-btn" onClick={() => onDelete(sh.id)}>{t('prop.delete', 'Löschen')}</button>
      </div>
    );
  }

  // Multi-selection panel
  if (multiCount > 1) {
    return (
      <div className="property-panel">
        <h3>{multiCount} {t('prop.multiSelected', 'Elemente ausgewählt')}</h3>
        {multiFixtures.length > 0 && (
          <div className="prop-section">
            <span className="prop-section-title">{multiFixtures.length} {t('prop.fixtureCount', 'Leuchte(n)')}</span>
            <ul className="multi-sel-list">
              {multiFixtures.map((f) => (
                <li key={f.id}>{f.fixture.name}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="prop-section">
          <span className="prop-section-title">{t('prop.actions', 'Aktionen')}</span>
          <p className="prop-hint">
            {t('prop.multiMove', 'Verschieben: Ziehe eine der markierten Leuchten.')}<br />
            {t('prop.multiRotate', 'Drehen: Nutze die Toolbar-Buttons zum Rotieren um eine Person.')}
          </p>
          {multiFixtures.length > 0 && (
            <div className="reflectance-presets">
              <button className="refl-btn" onClick={() => { for (const mf of multiFixtures) onUpdateFixture(mf.id, { hidden: true }); }}>🚫 {t('prop.hideShort', 'Ausblenden')}</button>
              <button className="refl-btn" onClick={() => { for (const mf of multiFixtures) onUpdateFixture(mf.id, { hidden: undefined }); }}>👁 {t('prop.show', 'Einblenden')}</button>
            </div>
          )}
        </div>
        <button className="delete-btn" onClick={() => { for (const sid of selectedIds) onDelete(sid); }}>
          {t('prop.deleteAll', 'Alle')} {multiCount} {t('prop.delete', 'löschen')}
        </button>
      </div>
    );
  }

  // No selection
  return (
    <div className="property-panel">
      <h3>{t('prop.title', 'Eigenschaften')}</h3>
      <p className="prop-hint">
        {t('prop.emptyHint', 'Wähle eine Leuchte, Person oder ein Bühnen-Element aus – oder leg direkt los:')}
      </p>
      <div className="prop-section">
        <span className="prop-section-title">{t('prop.quickstart', 'Schnellstart')}</span>
        <ol className="quickstart-list">
          <li><span>📐</span> <strong>{t('prop.qs1Title', 'Grundriss')}</strong> {t('prop.qs1Body', 'importieren – JPG, PNG oder PDF')}</li>
          <li><span>📏</span> <strong>{t('prop.qs2Title', 'Maßstab kalibrieren')}</strong> {t('prop.qs2Body', '– Strecke ziehen, echte Länge eingeben')}</li>
          <li><span>💡</span> {t('prop.qs3', 'Leuchten aus der Bibliothek auf den Plan ziehen')}</li>
        </ol>
      </div>
      <div className="prop-section">
        <span className="prop-section-title">{t('prop.keyboard', 'Tastatur')}</span>
        <div className="shortcut-grid">
          <kbd>{t('prop.kbdSpace', 'Leertaste')}</kbd><span>{t('prop.kbdPan', 'Ansicht verschieben')}</span>
          <kbd>{t('prop.kbdWheel', 'Mausrad')}</kbd><span>{t('prop.kbdZoom', 'Zoomen')}</span>
          <kbd>{t('prop.kbdUndoKey', 'Strg/⌘ Z')}</kbd><span>{t('prop.kbdUndo', 'Rückgängig')}</span>
          <kbd>{t('prop.kbdDel', 'Entf')}</kbd><span>{t('prop.delete', 'Löschen')}</span>
          <kbd>Esc</kbd><span>{t('prop.kbdCancel', 'Abbrechen')}</span>
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
