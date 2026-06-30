import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import type { FloorMaterial, FloorPresetId, SunSettings } from '../types';
import { FLOOR_PRESETS, floorPreset } from '../core/surfaceTextures';

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
        <span className="brand-proj">{p.projectName || 'Unbenannt'}</span>

        <div className="tb-menuwrap">
          <button className={`tb-icon ${open === 'menu' ? 'on' : ''}`} title="Menü"
            onClick={() => setOpen(open === 'menu' ? null : 'menu')}><Icon name="menu" /></button>
          {open === 'menu' && (
            <div className="tb-dropdown">
              <div className="tb-dd-sec">Datei</div>
              <button className="tb-dd-item" onClick={run(p.onNew)}><Icon name="plus" size={15} />Neu<kbd>Strg N</kbd></button>
              <button className="tb-dd-item" onClick={run(p.onSave)}><Icon name="save" size={15} />Speichern (Browser)<kbd>Strg S</kbd></button>
              <button className="tb-dd-item" onClick={run(p.onLoad)}><Icon name="open" size={15} />Laden (Browser)…</button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onSaveToFile)}><Icon name="export" size={15} />Projekt als Datei…</button>
              <button className="tb-dd-item" onClick={run(p.onLoadFromFile)}><Icon name="import" size={15} />Projekt aus Datei…</button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onExportAvplan)} title="Gesamtprojekt (Raum + Licht + Kameras + Verkabelung) verlustfrei exportieren — von allen drei Apps lesbar, fremde Daten bleiben erhalten"><Icon name="export" size={15} />Gesamtprojekt exportieren (.avplan)…</button>
              <button className="tb-dd-item" onClick={run(p.onImportAvplan)} title="Gesamtprojekt (.avplan) importieren — Licht wird bearbeitbar geladen, Kamera-/Verkabelungs-Daten bleiben verlustfrei erhalten"><Icon name="import" size={15} />Gesamtprojekt importieren (.avplan)…</button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onExportVenue)} title="Geteilten Raum (Wände, Bühne, Personen, Floor-Plan) exportieren — importierbar im MultiCam-Planner"><Icon name="export" size={15} />Venue exportieren (.venue.json)…</button>
              <button className="tb-dd-item" onClick={run(p.onImportVenue)} title="Geteilten Raum importieren — ersetzt Wände, Bühne, Personen, Floor-Plan; Lampen bleiben"><Icon name="import" size={15} />Venue importieren…</button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onExportPlot)}><Icon name="schedule" size={15} />Lichtplan drucken (PDF, Titelblock + Legende)…</button>
              <button className="tb-dd-item" onClick={run(() => p.onExport('png'))}>Export als PNG…</button>
              <button className="tb-dd-item" onClick={run(() => p.onExport('jpg'))}>Export als JPG…</button>
              <button className="tb-dd-item" onClick={run(() => p.onExport('pdf'))}>Export als PDF (Bild)…</button>
              <div className="tb-dd-sec">Bearbeiten</div>
              <button className="tb-dd-item" onClick={run(p.onUndo)}><Icon name="undo" size={15} />Rückgängig<kbd>Strg Z</kbd></button>
              <button className="tb-dd-item" onClick={run(p.onRedo)}><Icon name="redo" size={15} />Wiederholen<kbd>Strg Y</kbd></button>
              <button className="tb-dd-item" onClick={run(p.onChanges)}><Icon name="tag" size={15} />Verlauf &amp; Änderungen…</button>
              <button className="tb-dd-item" onClick={run(p.onVersions)}><Icon name="layers" size={15} />Versionen &amp; Vergleich…</button>
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={run(p.onAbout)}><Icon name="info" size={15} />Über LightPlanner</button>
            </div>
          )}
        </div>
      </div>

      {/* ── center: mode switch ── */}
      <div className="tb-modeswitch" role="tablist" aria-label="Ansicht">
        <button className={m === '2d' ? 'on' : ''} onClick={() => p.onSetMode('2d')}><Icon name="plan2d" size={15} />2D-Plan</button>
        <button className={m === '3d' ? 'on' : ''} onClick={() => p.onSetMode('3d')}><Icon name="cube3d" size={15} />3D</button>
        <button className={m === 'photo' ? 'on' : ''} onClick={() => p.onSetMode('photo')} title="Render: fotorealistische Vorschau der 3D-Szene (echte Scheinwerfer, Schatten, Lichtkegel, realistische Personen)"><Icon name="photo" size={15} />Render</button>
      </div>

      {/* ── right: display toggles, render settings, actions ── */}
      <div className="topbar-right">
        <button className={`tb-icon ${p.showHeatMap ? 'on' : ''}`} title="Heatmap (Beleuchtungsstärke einfärben)" onClick={p.onToggleHeatMap}><Icon name="heatmap" /></button>

        <div className="tb-menuwrap">
          <button className={`tb-icon ${open === 'render' ? 'on' : ''}`} title="Anzeige & Render-Einstellungen"
            onClick={() => setOpen(open === 'render' ? null : 'render')}><Icon name="settings" /></button>
          {open === 'render' && (
            <div className="tb-dropdown tb-render">
              {(p.viewMode === '3d' && p.photoMode) ? (
                <>
                  <div className="tb-dd-sec">Render</div>
                  <label className="tb-slider"><span>Belichtung</span>
                    <input type="range" min={0.2} max={3} step={0.05} value={p.exposure} onChange={(e) => p.onExposureChange(+e.target.value)} />
                    <em>{p.exposure.toFixed(2)}</em></label>
                  <label className="tb-slider"><span>Ambiente</span>
                    <input type="range" min={0} max={1.5} step={0.05} value={p.ambience} onChange={(e) => p.onAmbienceChange(+e.target.value)} />
                    <em>{Math.round(p.ambience * 100)}%</em></label>
                  <label className="tb-slider"><span>Dunst / Haze</span>
                    <input type="range" min={0} max={1} step={0.02} value={p.haze} onChange={(e) => p.onHazeChange(+e.target.value)} />
                    <em>{Math.round(p.haze * 100)}%</em></label>
                  <button className="tb-dd-item" onClick={p.onToggleBeams}><Icon name="beam" size={15} />Lichtkegel<span className={`tb-check ${p.showBeams ? 'on' : ''}`}><Icon name="check" size={13} /></span></button>
                  <div className="tb-dd-sec">Boden</div>
                  <div className="tb-chips">
                    {FLOOR_PRESETS.map((fp) => (
                      <button key={fp.id} className={`tb-chip ${p.floor.preset === fp.id ? 'on' : ''}`}
                        onClick={() => p.onFloorChange({ preset: fp.id as FloorPresetId, color: fp.defaultColor })}>{fp.label}</button>
                    ))}
                  </div>
                  <label className="tb-slider"><span>Bodenfarbe</span>
                    <input type="color" value={p.floor.color} onChange={(e) => p.onFloorChange({ ...p.floor, color: e.target.value })} />
                    <em>{floorPreset(p.floor.preset).label}</em></label>
                </>
              ) : (
                <div className="tb-hint">Belichtung, Boden & Lichtkegel erscheinen im <b>Render</b>-Modus.</div>
              )}
              {p.showHeatMap && (
                <>
                  <div className="tb-dd-sec">Heatmap</div>
                  <label className="tb-slider"><span>Skala max</span>
                    <input type="number" min={10} max={100000} step={10} value={p.heatMapScale} onChange={(e) => p.onHeatMapScaleChange(+e.target.value)} />
                    <em>lx</em></label>
                  <label className="tb-slider"><span>Zielwert</span>
                    <input type="number" min={0} max={100000} step={10} value={p.heatMapTarget} onChange={(e) => p.onHeatMapTargetChange(+e.target.value)} />
                    <em>lx</em></label>
                </>
              )}
              <div className="tb-dd-sec">Sonne / Tageslicht</div>
              <button className="tb-dd-item" onClick={() => p.onSunChange({ ...p.sun, enabled: !p.sun.enabled })} title="Echte Sonne: Tageslicht & Schatten aus Standort, Datum und Uhrzeit – fällt durch Fenster in den Raum.">
                <span className="tb-glyph">☀</span>Sonne aktiv<span className={`tb-check ${p.sun.enabled ? 'on' : ''}`}><Icon name="check" size={13} /></span>
              </button>
              {p.sun.enabled && (
                <>
                  <label className="tb-slider"><span>Datum</span>
                    <input type="date" value={p.sun.date} onChange={(e) => p.onSunChange({ ...p.sun, date: e.target.value })} /></label>
                  <label className="tb-slider"><span>Uhrzeit</span>
                    <input type="time" value={p.sun.time} onChange={(e) => p.onSunChange({ ...p.sun, time: e.target.value })} /></label>
                  <label className="tb-slider"><span>Breite</span>
                    <input type="number" min={-90} max={90} step={0.5} value={p.sun.latitude} onChange={(e) => p.onSunChange({ ...p.sun, latitude: +e.target.value })} /><em>°</em></label>
                  <label className="tb-slider"><span>Länge</span>
                    <input type="number" min={-180} max={180} step={0.5} value={p.sun.longitude} onChange={(e) => p.onSunChange({ ...p.sun, longitude: +e.target.value })} /><em>°</em></label>
                  <label className="tb-slider"><span>Norden ↻</span>
                    <input type="range" min={0} max={359} step={1} value={p.sun.northDeg} onChange={(e) => p.onSunChange({ ...p.sun, northDeg: +e.target.value })} /><em>{Math.round(p.sun.northDeg)}°</em></label>
                  <label className="tb-slider"><span>Intensität</span>
                    <input type="number" min={0} max={120000} step={1000} value={p.sun.intensity} onChange={(e) => p.onSunChange({ ...p.sun, intensity: +e.target.value })} /><em>lx</em></label>
                  <div className="tb-hint">{p.sunInfo ? `Sonnenstand: ${p.sunInfo.altitudeDeg.toFixed(0)}° über dem Horizont · Azimut ${p.sunInfo.azimuthDeg.toFixed(0)}° (0 = N). Fällt durch Fenster in den Raum.` : 'Sonne steht unter dem Horizont – kein direktes Tageslicht.'}</div>
                </>
              )}
              <div className="tb-dd-div" />
              <button className="tb-dd-item" onClick={p.onToggleSnap}><Icon name="snap" size={15} />Einrasten<span className={`tb-check ${p.snapStep > 0 ? 'on' : ''}`}><Icon name="check" size={13} /></span></button>
              <button className="tb-dd-item" onClick={p.onToggleFocusNotes} title="Fokus-Notizen je Scheinwerfer im 2D-Plan einblenden"><Icon name="tag" size={15} />Fokus-Notizen (Plan)<span className={`tb-check ${p.showFocusNotes ? 'on' : ''}`}><Icon name="check" size={13} /></span></button>
            </div>
          )}
        </div>

        <button className="tb-icon" title="Grundriss importieren (JPG/PNG/PDF)" onClick={() => fileRef.current?.click()}><Icon name="import" /></button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onUploadFloorPlan(f); e.target.value = ''; }} />

        <span className="tb-div" />
        <button className="tb-btn" onClick={p.onOpenSchedule}><Icon name="schedule" size={15} />Geräteliste</button>
        <button className="tb-btn" onClick={() => p.onExport('png')}><Icon name="export" size={15} />Export</button>
        <button className="tb-btn primary" onClick={p.onSave}><Icon name="save" size={15} />Speichern</button>
      </div>
    </header>
  );
};

export default TopBar;
