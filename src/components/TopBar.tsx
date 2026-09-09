import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import type { FloorMaterial, FloorPresetId, SunSettings } from '../types';
import { FLOOR_PRESETS, floorPreset } from '../core/surfaceTextures';
import { useTranslation } from '../i18n';

type Mode = '2d' | '3d' | 'photo';

interface Props {
  projectName: string;
  viewMode: '2d' | '3d';
  photoMode: boolean;
  showHeatMap: boolean;
  exposure: number;
  haze: number;
  showBeams: boolean;
  ambience: number;
  floor: FloorMaterial;
  sun: SunSettings;
  sunInfo: { altitudeDeg: number; azimuthDeg: number } | null;
  heatMapScale: number;
  heatMapTarget: number;
  snapStep: number;
  showFocusNotes: boolean;
  // mode + display
  onSetMode: (m: Mode) => void;
  onToggleHeatMap: () => void;
  onExposureChange: (v: number) => void;
  onHazeChange: (v: number) => void;
  onToggleBeams: () => void;
  onAmbienceChange: (v: number) => void;
  onFloorChange: (f: FloorMaterial) => void;
  onSunChange: (s: SunSettings) => void;
  onHeatMapScaleChange: (v: number) => void;
  onHeatMapTargetChange: (v: number) => void;
  onToggleSnap: () => void;
  onToggleFocusNotes: () => void;
  // actions
  onUploadFloorPlan: (f: File) => void;
  onOpenSchedule: () => void;
  onExport: (format: 'png' | 'jpg' | 'pdf') => void;
  onExportPlot: () => void;
  onNew: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSaveToFile: () => void;
  onLoadFromFile: () => void;
  onExportAvplan: () => void;
  onImportAvplan: () => void;
  onExportVenue: () => void;
  onImportVenue: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onVersions: () => void;
  onChanges: () => void;
  onAbout: () => void;
}

const mode = (p: Props): Mode => (p.viewMode === '2d' ? '2d' : p.photoMode ? 'photo' : '3d');

const TopBar: React.FC<Props> = (p) => {
  const { t, language, setLanguage } = useTranslation();
  const [open, setOpen] = useState<null | 'menu' | 'render'>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, []);
  const run = (fn: () => void) => () => { fn(); setOpen(null); };
  const m = mode(p);

  return (
    <header className="topbar" ref={ref}>
      {/* ── left: brand + menu ── */}
      <div className="topbar-left">
        <div className="brand-logo"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" draggable={false} /></div>
        <b className="brand-name">LightPlanner</b>
        <span className="brand-proj">{p.projectName || t('top.untitled', 'Untitled')}</span>

        <div className="tb-menuwrap">
          <button className={`tb-icon ${open === 'menu' ? 'on' : ''}`} title={t('top.menu', 'Menu')}
            onClick={() => setOpen(open === 'menu' ? null : 'menu')}><Icon name="menu" /></button>
          {open === 'menu' && (
            <div className="tb-dropdown">
              <div className="tb-dd-sec">{t('top.file', 'File')}</div>
              <button className="tb-dd-item" onClick={run(p.onNew)}><Icon name="plus" size={15} />{t('top.new', 'New')}<kbd>{t('top.kbdNew', 'Ctrl N')}</kbd></button>
              <button className="tb-dd-item" onClick={run(p.onSave)}><Icon name="save" size={15} />{t('top.saveBrowser', 'Save (browser)')}<kbd>{t('top.kbdSave', 'Ctrl S')}</kbd></button>
              <button className="tb-dd-item" onClick={run(p.onLoad)}><Icon name="open" size={15} />{t('top.loadBrowser', 'Load (browser)…')}</button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onSaveToFile)}><Icon name="export" size={15} />{t('top.saveFile', 'Project to file…')}</button>
              <button className="tb-dd-item" onClick={run(p.onLoadFromFile)}><Icon name="import" size={15} />{t('top.loadFile', 'Open project file…')}</button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onExportAvplan)} title={t('top.exportAvplanHint', 'Export the whole project (venue + light + cameras + cabling) losslessly — readable by all three apps, foreign data is preserved')}><Icon name="export" size={15} />{t('top.exportAvplan', 'Export whole project (.avplan)…')}</button>
              <button className="tb-dd-item" onClick={run(p.onImportAvplan)} title={t('top.importAvplanHint', 'Import a whole project (.avplan) — light is loaded editable, camera/cabling data is preserved losslessly')}><Icon name="import" size={15} />{t('top.importAvplan', 'Import whole project (.avplan)…')}</button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onExportVenue)} title={t('top.exportVenueHint', 'Export the shared venue (walls, stage, people, floor plan) — importable in MultiCam Planner')}><Icon name="export" size={15} />{t('top.exportVenue', 'Export venue (.venue.json)…')}</button>
              <button className="tb-dd-item" onClick={run(p.onImportVenue)} title={t('top.importVenueHint', 'Import a shared venue — replaces walls, stage, people and floor plan; fixtures stay')}><Icon name="import" size={15} />{t('top.importVenue', 'Import venue…')}</button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onExportPlot)}><Icon name="schedule" size={15} />{t('top.printPlot', 'Print light plot (PDF, title block + legend)…')}</button>
              <button className="tb-dd-item" onClick={run(() => p.onExport('png'))}>{t('top.exportPng', 'Export as PNG…')}</button>
              <button className="tb-dd-item" onClick={run(() => p.onExport('jpg'))}>{t('top.exportJpg', 'Export as JPG…')}</button>
              <button className="tb-dd-item" onClick={run(() => p.onExport('pdf'))}>{t('top.exportPdf', 'Export as PDF (image)…')}</button>
              <div className="tb-dd-sec">{t('top.edit', 'Edit')}</div>
              <button className="tb-dd-item" onClick={run(p.onUndo)}><Icon name="undo" size={15} />{t('top.undo', 'Undo')}<kbd>{t('top.kbdUndo', 'Ctrl Z')}</kbd></button>
              <button className="tb-dd-item" onClick={run(p.onRedo)}><Icon name="redo" size={15} />{t('top.redo', 'Redo')}<kbd>{t('top.kbdRedo', 'Ctrl Y')}</kbd></button>
              <button className="tb-dd-item" onClick={run(p.onChanges)}><Icon name="tag" size={15} />{t('top.changes', 'History & changes…')}</button>
              <button className="tb-dd-item" onClick={run(p.onVersions)}><Icon name="layers" size={15} />{t('top.versions', 'Versions & comparison…')}</button>
              <div className="tb-dd-div" />
              {/* B-13, letzter Schritt. Der Schalter lag bisher NUR in
                  `MenuBar.tsx` -- einer Datei, die niemand importiert und die
                  `App.tsx` nie rendert. Die i18n-Infrastruktur war also
                  vollstaendig, und trotzdem konnte kein Nutzer die Sprache
                  wechseln.
                  Er kommt bewusst ZULETZT: waere er vor dem Wickeln
                  freigelegt worden, haette wer Englisch waehlt eine zu
                  ~85 % deutsche Oberflaeche bekommen und die Funktion zu
                  Recht fuer kaputt gehalten. Seit diesem Branch meldet
                  `i18n:check` 0 ungewickelte Komponenten. */}
              <button className="tb-dd-item" onClick={run(() => setLanguage(language === 'de' ? 'en' : 'de'))}>
                <span className="tb-glyph">🌐</span>
                {/* Der Knopf nennt das ZIEL, nicht den aktuellen Zustand. */}
                {language === 'de' ? t('top.langToEn', 'Language: English') : t('top.langToDe', 'Language: Deutsch')}
              </button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onAbout)}><Icon name="info" size={15} />{t('top.about', 'About LightPlanner')}</button>
            </div>
          )}
        </div>
      </div>

      {/* ── center: mode switch ── */}
      <div className="tb-modeswitch" role="tablist" aria-label={t('top.view', 'View')}>
        <button className={m === '2d' ? 'on' : ''} onClick={() => p.onSetMode('2d')}><Icon name="plan2d" size={15} />{t('top.plan2d', '2D plan')}</button>
        <button className={m === '3d' ? 'on' : ''} onClick={() => p.onSetMode('3d')}><Icon name="cube3d" size={15} />{t('top.view3d', '3D')}</button>
        <button className={m === 'photo' ? 'on' : ''} onClick={() => p.onSetMode('photo')} title={t('top.renderHint', 'Render: photoreal preview of the 3D scene (real fixtures, shadows, beams, realistic people)')}><Icon name="photo" size={15} />{t('top.render', 'Render')}</button>
      </div>

      {/* ── right: display toggles, render settings, actions ── */}
      <div className="topbar-right">
        <button className={`tb-icon ${p.showHeatMap ? 'on' : ''}`} title={t('top.heatmap', 'Heat-map (colour by illuminance)')} onClick={p.onToggleHeatMap}><Icon name="heatmap" /></button>

        <div className="tb-menuwrap">
          <button className={`tb-icon ${open === 'render' ? 'on' : ''}`} title={t('top.displaySettings', 'Display & render settings')}
            onClick={() => setOpen(open === 'render' ? null : 'render')}><Icon name="settings" /></button>
          {open === 'render' && (
            <div className="tb-dropdown tb-render">
              {(p.viewMode === '3d' && p.photoMode) ? (
                <>
                  <div className="tb-dd-sec">{t('top.render', 'Render')}</div>
                  <label className="tb-slider"><span>{t('top.exposure', 'Exposure')}</span>
                    <input type="range" min={0.2} max={3} step={0.05} value={p.exposure} onChange={(e) => p.onExposureChange(+e.target.value)} />
                    <em>{p.exposure.toFixed(2)}</em></label>
                  <label className="tb-slider"><span>{t('top.ambience', 'Ambience')}</span>
                    <input type="range" min={0} max={1.5} step={0.05} value={p.ambience} onChange={(e) => p.onAmbienceChange(+e.target.value)} />
                    <em>{Math.round(p.ambience * 100)}%</em></label>
                  <label className="tb-slider"><span>{t('top.haze', 'Haze')}</span>
                    <input type="range" min={0} max={1} step={0.02} value={p.haze} onChange={(e) => p.onHazeChange(+e.target.value)} />
                    <em>{Math.round(p.haze * 100)}%</em></label>
                  <button className="tb-dd-item" onClick={p.onToggleBeams}><Icon name="beam" size={15} />{t('top.beams', 'Beams')}<span className={`tb-check ${p.showBeams ? 'on' : ''}`}><Icon name="check" size={13} /></span></button>
                  <div className="tb-dd-sec">{t('top.floor', 'Floor')}</div>
                  <div className="tb-chips">
                    {FLOOR_PRESETS.map((fp) => (
                      <button key={fp.id} className={`tb-chip ${p.floor.preset === fp.id ? 'on' : ''}`}
                        onClick={() => p.onFloorChange({ preset: fp.id as FloorPresetId, color: fp.defaultColor })}>{fp.label}</button>
                    ))}
                  </div>
                  <label className="tb-slider"><span>{t('top.floorColor', 'Floor colour')}</span>
                    <input type="color" value={p.floor.color} onChange={(e) => p.onFloorChange({ ...p.floor, color: e.target.value })} />
                    <em>{floorPreset(p.floor.preset).label}</em></label>
                </>
              ) : (
                <div className="tb-hint">{t('top.renderOnlyHint', 'Exposure, floor and beams appear in Render mode only.')}</div>
              )}
              {p.showHeatMap && (
                <>
                  <div className="tb-dd-sec">{t('top.heatmapSection', 'Heat-map')}</div>
                  <label className="tb-slider"><span>{t('top.scaleMax', 'Scale max')}</span>
                    <input type="number" min={10} max={100000} step={10} value={p.heatMapScale} onChange={(e) => p.onHeatMapScaleChange(+e.target.value)} />
                    <em>lx</em></label>
                  <label className="tb-slider"><span>{t('top.target', 'Target')}</span>
                    <input type="number" min={0} max={100000} step={10} value={p.heatMapTarget} onChange={(e) => p.onHeatMapTargetChange(+e.target.value)} />
                    <em>lx</em></label>
                </>
              )}
              <div className="tb-dd-sec">{t('top.sun', 'Sun / daylight')}</div>
              <button className="tb-dd-item" onClick={() => p.onSunChange({ ...p.sun, enabled: !p.sun.enabled })} title={t('top.sunHint', 'Real sun: daylight & shadows from location, date and time – falls through windows into the room.')}>
                <span className="tb-glyph">☀</span>{t('top.sunOn', 'Sun active')}<span className={`tb-check ${p.sun.enabled ? 'on' : ''}`}><Icon name="check" size={13} /></span>
              </button>
              {p.sun.enabled && (
                <>
                  <label className="tb-slider"><span>{t('top.date', 'Date')}</span>
                    <input type="date" value={p.sun.date} onChange={(e) => p.onSunChange({ ...p.sun, date: e.target.value })} /></label>
                  <label className="tb-slider"><span>{t('top.time', 'Time')}</span>
                    <input type="time" value={p.sun.time} onChange={(e) => p.onSunChange({ ...p.sun, time: e.target.value })} /></label>
                  <label className="tb-slider"><span>{t('top.latitude', 'Latitude')}</span>
                    <input type="number" min={-90} max={90} step={0.5} value={p.sun.latitude} onChange={(e) => p.onSunChange({ ...p.sun, latitude: +e.target.value })} /><em>°</em></label>
                  <label className="tb-slider"><span>{t('top.longitude', 'Longitude')}</span>
                    <input type="number" min={-180} max={180} step={0.5} value={p.sun.longitude} onChange={(e) => p.onSunChange({ ...p.sun, longitude: +e.target.value })} /><em>°</em></label>
                  <label className="tb-slider"><span>{t('top.north', 'North ↻')}</span>
                    <input type="range" min={0} max={359} step={1} value={p.sun.northDeg} onChange={(e) => p.onSunChange({ ...p.sun, northDeg: +e.target.value })} /><em>{Math.round(p.sun.northDeg)}°</em></label>
                  <label className="tb-slider"><span>{t('top.intensity', 'Intensity')}</span>
                    <input type="number" min={0} max={120000} step={1000} value={p.sun.intensity} onChange={(e) => p.onSunChange({ ...p.sun, intensity: +e.target.value })} /><em>lx</em></label>
                  <div className="tb-hint">{p.sunInfo
                    ? t('top.sunPos', 'Sun position: {alt}° above the horizon · azimuth {az}° (0 = N). Falls through windows into the room.')
                        .replace('{alt}', p.sunInfo.altitudeDeg.toFixed(0))
                        .replace('{az}', p.sunInfo.azimuthDeg.toFixed(0))
                    : t('top.sunBelow', 'The sun is below the horizon – no direct daylight.')}</div>
                </>
              )}
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={p.onToggleSnap}><Icon name="snap" size={15} />{t('top.snap', 'Snap')}<span className={`tb-check ${p.snapStep > 0 ? 'on' : ''}`}><Icon name="check" size={13} /></span></button>
              <button className="tb-dd-item" onClick={p.onToggleFocusNotes} title={t('top.focusNotesHint', 'Show per-fixture focus notes in the 2D plan')}><Icon name="tag" size={15} />{t('top.focusNotes', 'Focus notes (plan)')}<span className={`tb-check ${p.showFocusNotes ? 'on' : ''}`}><Icon name="check" size={13} /></span></button>
            </div>
          )}
        </div>

        <button className="tb-icon" title={t('top.importFloorPlan', 'Import floor plan (JPG/PNG/PDF)')} onClick={() => fileRef.current?.click()}><Icon name="import" /></button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onUploadFloorPlan(f); e.target.value = ''; }} />

        <span className="tb-div" />
        <button className="tb-btn" onClick={p.onOpenSchedule}><Icon name="schedule" size={15} />{t('top.schedule', 'Schedule')}</button>
        <button className="tb-btn" onClick={() => p.onExport('png')}><Icon name="export" size={15} />{t('top.export', 'Export')}</button>
        <button className="tb-btn primary" onClick={p.onSave}><Icon name="save" size={15} />{t('top.save', 'Save')}</button>
      </div>
    </header>
  );
};

export default TopBar;
