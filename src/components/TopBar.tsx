import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import type { FloorMaterial, SunSettings } from '../types';
import { buildMenus } from './menuModel';
import TopMenu from './TopMenu';
import CommandPalette from './CommandPalette';
import SettingsDialog from './SettingsDialog';
import type { BackdropId } from '../core/surfaceTextures';
import ViewPanel from './ViewPanel';
import { useTranslation } from '../i18n';
import { APP_NAME } from '../version';
import { planAccept } from '../avplan/floorplan';

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
  backdrop: BackdropId;
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
  onBackdropChange: (b: BackdropId) => void;
  onResetRender: () => void;
  onSunChange: (s: SunSettings) => void;
  onHeatMapScaleChange: (v: number) => void;
  onHeatMapTargetChange: (v: number) => void;
  onToggleSnap: () => void;
  onToggleFocusNotes: () => void;
  // actions
  onUploadFloorPlan: (f: File) => void;
  onOpenSchedule: () => void;
  /** Lager/Bestand oeffnen — seit #124 ein Menuepunkt unter „Tools". */
  onOpenInventory: () => void;
  /** DMX-Eingang: Leuchten live aus Pult oder Software fahren. */
  onOpenDmxIn: () => void;
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
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('mousedown', h);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', h); window.removeEventListener('keydown', esc); };
  }, []);
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
      onOpenInventory: p.onOpenInventory,
      onOpenDmxIn: p.onOpenDmxIn,
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
        {/* Signet ohne Tally-Punkt: der Speichern-Knopf traegt schon das eine Rot der Kopfzeile. */}
        <div className="brand-logo" aria-hidden="true">
          <img className="lzm-auf-dunkel" src={`${import.meta.env.BASE_URL}brand/lzm_signet_offwhite.svg`} alt="" draggable={false} />
          <img className="lzm-auf-hell" src={`${import.meta.env.BASE_URL}brand/lzm_signet_navy.svg`} alt="" draggable={false} />
        </div>
        <b className="brand-name">{APP_NAME}</b>
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
        {/* `title` UND `aria-label`: unter 980 px blendet die Stilvorlage die
            Beschriftung aus (#124). Ohne beides waere der Knopf danach fuer
            einen Screenreader namenlos und fuer die Maus stumm. */}
        <button className={m === '2d' ? 'on' : ''} onClick={() => p.onSetMode('2d')} title={t('top.plan2d', '2D plan')} aria-label={t('top.plan2d', '2D plan')}><Icon name="plan2d" size={15} />{t('top.plan2d', '2D plan')}</button>
        <button className={m === '3d' ? 'on' : ''} onClick={() => p.onSetMode('3d')} title={t('top.view3d', '3D')} aria-label={t('top.view3d', '3D')}><Icon name="cube3d" size={15} />{t('top.view3d', '3D')}</button>
        <button className={m === 'photo' ? 'on' : ''} onClick={() => p.onSetMode('photo')} aria-label={t('top.render', 'Render')} title={t('top.renderHint', 'Render: photoreal preview of the 3D scene (real fixtures, shadows, beams, realistic people)')}><Icon name="photo" size={15} />{t('top.render', 'Render')}</button>
      </div>

      {/* ── right: display toggles, render settings, actions ── */}
      <div className="topbar-right">
        <button className={`tb-icon ${p.showHeatMap ? 'on' : ''}`} aria-pressed={p.showHeatMap}
          title={t('top.heatmap', 'Heat-map (colour by illuminance)')} aria-label={t('top.heatmap', 'Heat-map (colour by illuminance)')}
          onClick={p.onToggleHeatMap}><Icon name="heatmap" /></button>

        <div className="tb-menuwrap">
          {/* Beschriftet und mit Regler-Symbol: das Kamera-Symbol, das hier
              stand, war dasselbe wie am Render-Reiter daneben. */}
          <button className={`tb-btn tb-view ${open === 'render' ? 'on' : ''}`} aria-expanded={open === 'render'}
            title={t('top.displaySettings', 'Display & render settings')} aria-label={t('top.displaySettings', 'Display & render settings')}
            onClick={() => setOpen(open === 'render' ? null : 'render')}>
            <Icon name="sliders" size={15} />{t('top.displayShort', 'Display')}<Icon name="chevronDown" size={13} />
          </button>
          {open === 'render' && (
            <ViewPanel
              isRender={m === 'photo'}
              onGoRender={() => p.onSetMode('photo')}
              showHeatMap={p.showHeatMap}
              heatMapScale={p.heatMapScale}
              heatMapTarget={p.heatMapTarget}
              snapOn={p.snapStep > 0}
              showFocusNotes={p.showFocusNotes}
              exposure={p.exposure}
              ambience={p.ambience}
              haze={p.haze}
              showBeams={p.showBeams}
              backdrop={p.backdrop}
              floor={p.floor}
              sun={p.sun}
              sunInfo={p.sunInfo}
              onToggleHeatMap={p.onToggleHeatMap}
              onHeatMapScaleChange={p.onHeatMapScaleChange}
              onHeatMapTargetChange={p.onHeatMapTargetChange}
              onToggleSnap={p.onToggleSnap}
              onToggleFocusNotes={p.onToggleFocusNotes}
              onExposureChange={p.onExposureChange}
              onAmbienceChange={p.onAmbienceChange}
              onHazeChange={p.onHazeChange}
              onToggleBeams={p.onToggleBeams}
              onBackdropChange={p.onBackdropChange}
              onFloorChange={p.onFloorChange}
              onSunChange={p.onSunChange}
              onResetRender={p.onResetRender}
            />
          )}
        </div>

        {/* ─── DREI KNOEPFE WENIGER ────────────────────────────────────────
            NUTZER-MELDUNG (#124): „Geraeteliste, Export, Import etc. kann auch
            in das normale Dropdown-Menue unter Datei etc. integriert werden."

            Grundriss-Import, Geraeteliste/Patch und Export standen hier ALS
            KNOPF und gleichzeitig IM MENUE — dieselbe Sache zweimal, und das
            auf der Seite der Leiste, die mit dem mittigen Umschalter um den
            Platz streitet. Das versteckte Datei-Feld bleibt: der Menuepunkt
            loest es aus.

            „Speichern" bleibt als einziger Knopf stehen. Es ist der einzige
            Griff dieser Leiste, den man mehrmals je Sitzung braucht, und ihn
            in ein Menue zu legen hiesse, ihn zweimal zu klicken. */}
        <input ref={fileRef} type="file" accept={planAccept({ pdf: true })} style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onUploadFloorPlan(f); e.target.value = ''; }} />

        <span className="tb-div" />
        {/* `title` UND `aria-label` wie beim Umschalter daneben: unter 820 px
            blendet die Stilvorlage die Beschriftung aus (B-77), damit die
            Leiste auf einem Telefon ueberhaupt aufgeht. Ohne beides waere der
            Knopf danach namenlos — und ausgerechnet dieser ist der eine, den
            man mehrmals je Sitzung braucht. */}
        <button className="tb-btn primary" onClick={p.onSave}
          title={t('top.save', 'Save')} aria-label={t('top.save', 'Save')}><Icon name="save" size={15} />{t('top.save', 'Save')}</button>

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
