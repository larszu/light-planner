import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import type { FloorMaterial, FloorPresetId, SunSettings } from '../types';
import { buildMenus } from './menuModel';
import TopMenu from './TopMenu';
import CommandPalette from './CommandPalette';
import SettingsDialog from './SettingsDialog';
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
  // Ab 2026-09-11 im Menue-Modell und damit auch in der Kommandopalette.
  // Sie waren vorher nur an Tastenkuerzeln erreichbar.
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
}

const mode = (p: Props): Mode => (p.viewMode === '2d' ? '2d' : p.photoMode ? 'photo' : '3d');

const TopBar: React.FC<Props> = (p) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<null | 'render'>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, []);
  const run = (fn: () => void) => () => { fn(); setOpen(null); };
  const m = mode(p);

  // Die EINE Liste. Menueleiste und Kommandopalette lesen sie beide; wer
  // einen Befehl ergaenzt, bekommt ihn in beiden Wegen.
  const menus = buildMenus(
    {
      viewMode: p.viewMode,
      showHeatMap: p.showHeatMap,
      snapEnabled: p.snapStep > 0,
      showFocusNotes: p.showFocusNotes,
      onNew: p.onNew,
      onSave: p.onSave,
      onLoad: p.onLoad,
      onSaveToFile: p.onSaveToFile,
      onLoadFromFile: p.onLoadFromFile,
      onExport: p.onExport,
      onUndo: p.onUndo,
      onRedo: p.onRedo,
      onCopy: p.onCopy,
      onPaste: p.onPaste,
      onDuplicate: p.onDuplicate,
      onOpenSchedule: p.onOpenSchedule,
      onViewModeChange: (v) => p.onSetMode(v),
      onToggleHeatMap: p.onToggleHeatMap,
      onToggleSnap: p.onToggleSnap,
      onToggleFocusNotes: p.onToggleFocusNotes,
      onAbout: p.onAbout,
      onExportAvplan: p.onExportAvplan,
      onImportAvplan: p.onImportAvplan,
      onExportVenue: p.onExportVenue,
      onImportVenue: p.onImportVenue,
      onExportPlot: p.onExportPlot,
      // Der Grundriss kommt ueber ein verstecktes Datei-Feld herein; das
      // Menue loest denselben Klick aus wie der Knopf daneben.
      onUploadFloorPlan: () => fileRef.current?.click(),
      onChanges: p.onChanges,
      onVersions: p.onVersions,
      onOpenSettings: () => setSettingsOpen(true),
    },
    t,
  );

  return (
    <header className="topbar" ref={ref}>
      {/* ── left: brand + menu ── */}
      <div className="topbar-left">
        <div className="brand-logo"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" draggable={false} /></div>
        <b className="brand-name">LightPlanner</b>
        <span className="brand-proj">{p.projectName || t('top.untitled', 'Untitled')}</span>

        {/* ─────────────────────────────────────────────────────────────
            DIE MENUELEISTE — fuenf Titel statt eines Hamburgers.

            NUTZER-AUFTRAG 2026-09-11: die obere Leiste in allen Repos gleich
            aufbauen. ADR-007 Abschnitt 6 sagt dazu: Menues links, kein
            Hamburger auf dem Desktop.

            SIE LIEST DAS MODELL. Die Eintraege standen bis heute doppelt: als
            Liste in `menuModel.ts` (fuer die Kommandopalette) und ein zweites
            Mal getippt in dieser Klappe. Die beiden waren laengst
            auseinander — im Hamburger standen .avplan, Venue und der
            Lichtplan-Druck, in der Palette nicht.

            UND DIE PALETTE HAENGT JETZT HIER. Sie war in `MenuBar.tsx`
            montiert — einer Datei, die `App.tsx` nie rendert. Strg/Cmd+K tat
            in der laufenden App also nichts, obwohl `brand:check` das
            Gegenteil zusicherte: der Waechter las die tote Datei.
            ───────────────────────────────────────────────────────────── */}
        <TopMenu groups={menus} />
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
          {/* Regler statt Zahnrad: zwei Zahnraeder nebeneinander, von denen
              eines die App einstellt und das andere das Bild, sind ein Raten. */}
          <button className={`tb-icon ${open === 'render' ? 'on' : ''}`} title={t('top.displaySettings', 'Display & render settings')}
            onClick={() => setOpen(open === 'render' ? null : 'render')}><Icon name="photo" /></button>
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
                <span className="tb-glyph"><Icon name="heatmap" size={13} /></span>{t('top.sunOn', 'Sun active')}<span className={`tb-check ${p.sun.enabled ? 'on' : ''}`}><Icon name="check" size={13} /></span>
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

        {/* RECHTS AUSSEN, als LETZTER Bedienpunkt der Zeile — dieselbe Stelle
            wie im Cable Planner. Nicht zu verwechseln mit dem Zahnrad daneben:
            das sind die Anzeige- und Render-Regler (Belichtung, Boden,
            Strahlen) und keine App-Einstellungen. Bis heute war es der
            einzige Zahnrad-Knopf der Leiste, und damit sah es aus wie beides. */}
        <button
          className="tb-icon"
          title={t('settings.title', 'Settings')}
          aria-label={t('settings.title', 'Settings')}
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="settings" />
        </button>
      </div>

      {/* Die Kommandopalette — Strg/Cmd+K, ADR-007 Abschnitt 6. Sie liest
          DIESELBE Liste wie die Menueleiste daneben. */}
      <CommandPalette groups={menus} />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </header>
  );
};

export default TopBar;
