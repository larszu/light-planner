import React from 'react';
import Icon from './Icon';
import type { FloorMaterial, FloorPresetId, SunSettings } from '../types';
import { BACKDROPS, FLOOR_PRESETS, type BackdropId } from '../core/surfaceTextures';
import { format, useTranslation } from '../i18n';

// Die Anzeige- und Render-Einstellungen rechts in der Kopfzeile.
//
// NUTZER-MELDUNG 2026-09-28: „die Einstellungen rechts in der Leiste leichter
// bedienbar und intuitiver". Vorher: ein Kamera-Symbol (dasselbe wie der
// Render-Reiter daneben), dahinter eine Liste, die ausserhalb der
// Render-Ansicht nur „erscheint nur im Render-Modus" sagte, Haekchen, die
// erst beim Hinsehen als Schalter zu erkennen waren, und Bodenvorlagen als
// Wortliste ohne Vorschau. Jetzt: ein beschrifteter Knopf, drei Abschnitte,
// Schalter mit Zustand, Farbfelder mit Vorschau, Regler ueberall bedienbar
// (Doppelklick setzt zurueck) und ein Weg in die Render-Ansicht.

interface Props {
  isRender: boolean;
  onGoRender: () => void;
  showHeatMap: boolean;
  heatMapScale: number;
  heatMapTarget: number;
  snapOn: boolean;
  showFocusNotes: boolean;
  exposure: number;
  ambience: number;
  haze: number;
  showBeams: boolean;
  backdrop: BackdropId;
  floor: FloorMaterial;
  sun: SunSettings;
  sunInfo: { altitudeDeg: number; azimuthDeg: number } | null;
  onToggleHeatMap: () => void;
  onHeatMapScaleChange: (v: number) => void;
  onHeatMapTargetChange: (v: number) => void;
  onToggleSnap: () => void;
  onToggleFocusNotes: () => void;
  onExposureChange: (v: number) => void;
  onAmbienceChange: (v: number) => void;
  onHazeChange: (v: number) => void;
  onToggleBeams: () => void;
  onBackdropChange: (b: BackdropId) => void;
  onFloorChange: (f: FloorMaterial) => void;
  onSunChange: (s: SunSettings) => void;
  onResetRender: () => void;
}

const Toggle: React.FC<{ on: boolean; label: string; hint?: string; icon?: React.ComponentProps<typeof Icon>['name']; onClick: () => void }> =
  ({ on, label, hint, icon, onClick }) => (
    <button type="button" className="vp-toggle" role="switch" aria-checked={on} title={hint} onClick={onClick}>
      {icon && <Icon name={icon} size={15} />}
      <span className="vp-toggle-label">{label}</span>
      <span className={`vp-switch ${on ? 'on' : ''}`} aria-hidden />
    </button>
  );

const Slider: React.FC<{
  label: string; value: number; min: number; max: number; step: number; def: number;
  shown: string; onChange: (v: number) => void; resetHint: string;
}> = ({ label, value, min, max, step, def, shown, onChange, resetHint }) => (
  <label className="tb-slider" title={resetHint} onDoubleClick={() => onChange(def)}>
    <span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    <em>{shown}</em>
  </label>
);

const ViewPanel: React.FC<Props> = (p) => {
  const { t } = useTranslation();
  const resetHint = t('vp.resetHint', 'Double-click to reset');
  const floorLabel = (id: FloorPresetId) => ({
    stage: t('vp.floor.stage', 'Stage floor'),
    concrete: t('vp.floor.concrete', 'Concrete'),
    parquet: t('vp.floor.parquet', 'Parquet'),
    planks: t('vp.floor.planks', 'Floorboards'),
    tiles: t('vp.floor.tiles', 'Tiles'),
    carpet: t('vp.floor.carpet', 'Carpet'),
    solid: t('vp.floor.solid', 'Plain'),
  }[id]);
  const backdropLabel = (id: BackdropId) => ({
    venue: t('vp.bg.venue', 'Hall'),
    blackbox: t('vp.bg.blackbox', 'Black box'),
    studio: t('vp.bg.studio', 'Studio'),
    daylight: t('vp.bg.daylight', 'Daylight'),
  }[id]);

  return (
    <div className="tb-dropdown tb-render vp" role="dialog" aria-label={t('vp.title', 'Display settings')}>
      <section className="vp-sec">
        <header className="vp-head"><span>{t('vp.display', 'Display')}</span></header>
        <Toggle on={p.showHeatMap} icon="heatmap" label={t('vp.heatmap', 'Heat-map')} hint={t('top.heatmap', 'Heat-map (colour by illuminance)')} onClick={p.onToggleHeatMap} />
        {p.showHeatMap && (
          <div className="vp-indent">
            <label className="tb-slider"><span>{t('top.scaleMax', 'Scale max')}</span>
              <input type="number" min={10} max={100000} step={10} value={p.heatMapScale} onChange={(e) => p.onHeatMapScaleChange(+e.target.value)} />
              <em>lx</em></label>
            <label className="tb-slider"><span>{t('top.target', 'Target')}</span>
              <input type="number" min={0} max={100000} step={10} value={p.heatMapTarget} onChange={(e) => p.onHeatMapTargetChange(+e.target.value)} />
              <em>lx</em></label>
          </div>
        )}
        <Toggle on={p.snapOn} icon="snap" label={t('top.snap', 'Snap')} onClick={p.onToggleSnap} />
        <Toggle on={p.showFocusNotes} icon="tag" label={t('top.focusNotes', 'Focus notes (plan)')} hint={t('top.focusNotesHint', 'Show per-fixture focus notes in the 2D plan')} onClick={p.onToggleFocusNotes} />
      </section>

      <section className="vp-sec">
        <header className="vp-head">
          <span>{t('top.render', 'Render')}</span>
          <button type="button" className="vp-link" onClick={p.onResetRender} title={t('vp.resetRenderHint', 'Exposure, ambience, haze and beams back to the defaults')}>
            {t('vp.reset', 'Reset')}
          </button>
        </header>
        {!p.isRender && (
          <div className="vp-note">
            <span>{t('vp.renderOnly', 'These settings shape the Render view.')}</span>
            <button type="button" className="tb-btn" onClick={p.onGoRender}><Icon name="photo" size={14} />{t('vp.goRender', 'Open Render')}</button>
          </div>
        )}

        <div className="vp-label">{t('vp.background', 'Background')}</div>
        <div className="vp-swatches">
          {BACKDROPS.map((b) => (
            <button key={b.id} type="button" className={`vp-sw ${p.backdrop === b.id ? 'on' : ''}`} aria-pressed={p.backdrop === b.id} onClick={() => p.onBackdropChange(b.id)}>
              <i style={{ background: `linear-gradient(${b.top}, ${b.horizon} 70%, ${b.bottom})` }} />
              <span>{backdropLabel(b.id)}</span>
            </button>
          ))}
        </div>

        <div className="vp-label">{t('top.floor', 'Floor')}</div>
        <div className="vp-swatches">
          {FLOOR_PRESETS.map((fp) => (
            <button key={fp.id} type="button" className={`vp-sw ${p.floor.preset === fp.id ? 'on' : ''}`} aria-pressed={p.floor.preset === fp.id}
              onClick={() => p.onFloorChange({ preset: fp.id, color: fp.defaultColor })}>
              <i style={{ background: p.floor.preset === fp.id ? p.floor.color : fp.defaultColor }} />
              <span>{floorLabel(fp.id)}</span>
            </button>
          ))}
        </div>
        <label className="tb-slider"><span>{t('top.floorColor', 'Floor colour')}</span>
          <input type="color" value={p.floor.color} onChange={(e) => p.onFloorChange({ ...p.floor, color: e.target.value })} />
          <em />
        </label>

        <div className="vp-label">{t('vp.light', 'Light & air')}</div>
        <Slider label={t('top.exposure', 'Exposure')} value={p.exposure} min={0.2} max={3} step={0.05} def={1.2} shown={p.exposure.toFixed(2)} onChange={p.onExposureChange} resetHint={resetHint} />
        <Slider label={t('top.ambience', 'Ambience')} value={p.ambience} min={0} max={1.5} step={0.05} def={0.55} shown={`${Math.round(p.ambience * 100)}%`} onChange={p.onAmbienceChange} resetHint={resetHint} />
        <Slider label={t('top.haze', 'Haze')} value={p.haze} min={0} max={1} step={0.02} def={0.15} shown={`${Math.round(p.haze * 100)}%`} onChange={p.onHazeChange} resetHint={resetHint} />
        <Toggle on={p.showBeams} icon="beam" label={t('vp.beams', 'Light beams in haze')} onClick={p.onToggleBeams} />
      </section>

      <section className="vp-sec">
        <header className="vp-head"><span>{t('top.sun', 'Sun / daylight')}</span></header>
        <Toggle on={p.sun.enabled} icon="heatmap" label={t('top.sunOn', 'Sun active')} hint={t('top.sunHint', 'Real sun: daylight & shadows from location, date and time – falls through windows into the room.')}
          onClick={() => p.onSunChange({ ...p.sun, enabled: !p.sun.enabled })} />
        {p.sun.enabled && (
          <div className="vp-indent">
            <label className="tb-slider"><span>{t('top.date', 'Date')}</span>
              <input type="date" value={p.sun.date} onChange={(e) => p.onSunChange({ ...p.sun, date: e.target.value })} /><em /></label>
            <label className="tb-slider"><span>{t('top.time', 'Time')}</span>
              <input type="time" value={p.sun.time} onChange={(e) => p.onSunChange({ ...p.sun, time: e.target.value })} /><em /></label>
            <label className="tb-slider"><span>{t('top.latitude', 'Latitude')}</span>
              <input type="number" min={-90} max={90} step={0.5} value={p.sun.latitude} onChange={(e) => p.onSunChange({ ...p.sun, latitude: +e.target.value })} /><em>°</em></label>
            <label className="tb-slider"><span>{t('top.longitude', 'Longitude')}</span>
              <input type="number" min={-180} max={180} step={0.5} value={p.sun.longitude} onChange={(e) => p.onSunChange({ ...p.sun, longitude: +e.target.value })} /><em>°</em></label>
            <label className="tb-slider"><span>{t('top.north', 'North ↻')}</span>
              <input type="range" min={0} max={359} step={1} value={p.sun.northDeg} onChange={(e) => p.onSunChange({ ...p.sun, northDeg: +e.target.value })} /><em>{Math.round(p.sun.northDeg)}°</em></label>
            <label className="tb-slider"><span>{t('top.intensity', 'Intensity')}</span>
              <input type="number" min={0} max={120000} step={1000} value={p.sun.intensity} onChange={(e) => p.onSunChange({ ...p.sun, intensity: +e.target.value })} /><em>lx</em></label>
            <div className="tb-hint">{p.sunInfo
              ? format(t('top.sunPos', 'Sun position: {alt}° above the horizon · azimuth {az}° (0 = N). Falls through windows into the room.'),
                { alt: p.sunInfo.altitudeDeg.toFixed(0), az: p.sunInfo.azimuthDeg.toFixed(0) })
              : t('top.sunBelow', 'The sun is below the horizon – no direct daylight.')}</div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ViewPanel;
