// ───────────────────────────────────────────────────────────────────────────
// Das Menue als DATEN — eine Liste, zwei Wege dorthin.
//
// Bis hierher stand das Modell mitten in `MenuBar.tsx`. Die Kommandopalette
// (ADR-007 Abschnitt 6, „derselbe Griff ueberall") braucht dieselben
// Eintraege; sie dort ein zweites Mal zu tippen waere die uebliche Art, wie
// eine solche Zusage zerfaellt — jemand haengt einen Befehl ins Menue und
// vergisst die Palette, und der Griff ist nur noch fast derselbe.
//
// Deshalb baut diese Funktion die Liste, und beide lesen sie.
//
// ─── 2026-09-11: DIE LISTE WIRD JETZT AUCH GERENDERT ──────────────────────
//
// Bis heute las sie genau EINE Datei: `MenuBar.tsx` — die niemand
// importierte und die `App.tsx` nie rendert. Die Kommandopalette hing darin;
// Strg/Cmd+K tat in der laufenden App also nichts, obwohl `brand:check` das
// Gegenteil zusicherte. Der Waechter stand an der falschen Tuer: er las eine
// tote Datei und war darum immer gruen. Dieselbe Form wie B-13 (der
// Sprachschalter, der nur in derselben toten Datei sass), eine Ebene hoeher.
//
// Jetzt liest `TopBar.tsx` die Liste und rendert sie als Menueleiste, und die
// Palette haengt daneben in derselben, wirklich gerenderten Datei.
// `MenuBar.tsx` ist geloescht — eine zweite Menue-Implementierung, die
// niemand sieht, driftet lautlos.
//
// ─── DIE SPRACHE IST HIER RAUS ────────────────────────────────────────────
//
// Sie steht seit 2026-09-11 im Einstellungen-Dialog, wie im Cable Planner
// und in den anderen Apps der Suite. Ein Sprachschalter mitten im
// Hilfe-Menue war die Stelle, an der dieses Repo ihn zufaellig
// untergebracht hatte, nicht die Stelle, an der jemand ihn sucht.
// ───────────────────────────────────────────────────────────────────────────
import type { ViewMode } from '../types';

export interface MenuBarProps {
  viewMode: ViewMode;
  showHeatMap: boolean;
  snapEnabled: boolean;
  onNew: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSaveToFile: () => void;
  onLoadFromFile: () => void;
  onExport: (format: 'png' | 'jpg' | 'pdf') => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onOpenSchedule: () => void;
  onViewModeChange: (m: ViewMode) => void;
  onToggleHeatMap: () => void;
  onToggleSnap: () => void;
  onAbout: () => void;
  // Ab 2026-09-11: was frueher nur im Hamburger stand und der Palette
  // deshalb fehlte. Wer einen Eintrag hier ergaenzt, bekommt ihn in beiden
  // Wegen — das ist der ganze Punkt dieser Datei.
  onExportAvplan: () => void;
  onImportAvplan: () => void;
  onExportVenue: () => void;
  onImportVenue: () => void;
  onExportPlot: () => void;
  onUploadFloorPlan: () => void;
  onChanges: () => void;
  onVersions: () => void;
  onToggleFocusNotes: () => void;
  showFocusNotes: boolean;
  onOpenSettings: () => void;
}

export interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  separator?: boolean;
  checked?: boolean;
}

export interface MenuGroup {
  id: string;
  label: string;
  items: MenuItem[];
}

type Uebersetzen = (key: string, fallback: string) => string;

export function buildMenus(p: MenuBarProps, t: Uebersetzen): MenuGroup[] {
  return [
    // DIE REIHENFOLGE IST DIE DES CABLE PLANNERS: File · Edit · Tools · View
    // · Help. Sie ist keine Geschmacksfrage — wer zwischen zwei Werkzeugen
    // der Suite wechselt, greift nach Muskelgedaechtnis und nicht nach dem
    // Wort. `scripts/chrome-parity.mjs` in der Suite misst sie in allen Apps.
    { id: 'file', label: t('menu.file', 'File'), items: [
      { label: t('menu.new', 'New project'), shortcut: 'Strg+N', onClick: p.onNew },
      { label: t('menu.load', 'Open… (browser)'), onClick: p.onLoad },
      { label: t('menu.loadFile', 'Open project file…'), onClick: p.onLoadFromFile },
      { label: '', separator: true },
      { label: t('menu.save', 'Save (browser)'), shortcut: 'Strg+S', onClick: p.onSave },
      // „Save as…" ist hier NICHT derselbe Aufruf mit anderem Namen: er
      // schreibt in eine DATEI statt in den Browser-Speicher. Zwei Eintraege
      // mit einem Verhalten waeren einer zu viel.
      { label: t('menu.saveFile', 'Save as file…'), onClick: p.onSaveToFile },
      { label: '', separator: true },
      { label: t('menu.exportAvplan', 'Export whole project (.avplan)…'), onClick: p.onExportAvplan },
      { label: t('menu.importAvplan', 'Import whole project (.avplan)…'), onClick: p.onImportAvplan },
      { label: '', separator: true },
      { label: t('menu.exportVenue', 'Export venue (.venue.json)…'), onClick: p.onExportVenue },
      { label: t('menu.importVenue', 'Import venue…'), onClick: p.onImportVenue },
      { label: '', separator: true },
      { label: t('menu.printPlot', 'Print light plot (PDF)…'), onClick: p.onExportPlot },
      { label: t('menu.exportPng', 'Export as PNG…'), onClick: () => p.onExport('png') },
      { label: t('menu.exportJpg', 'Export as JPG…'), onClick: () => p.onExport('jpg') },
      { label: t('menu.exportPdf', 'Export as PDF…'), onClick: () => p.onExport('pdf') },
    ] },
    { id: 'edit', label: t('menu.edit', 'Edit'), items: [
      { label: t('menu.undo', 'Undo'), shortcut: 'Strg+Z', onClick: p.onUndo },
      { label: t('menu.redo', 'Redo'), shortcut: 'Strg+Y', onClick: p.onRedo },
      { label: '', separator: true },
      { label: t('menu.copy', 'Copy'), shortcut: 'Strg+C', onClick: p.onCopy },
      { label: t('menu.paste', 'Paste'), shortcut: 'Strg+V', onClick: p.onPaste },
      { label: t('menu.duplicate', 'Duplicate'), shortcut: 'Strg+D', onClick: p.onDuplicate },
      { label: '', separator: true },
      { label: t('menu.changes', 'History & changes…'), onClick: p.onChanges },
      { label: t('menu.versions', 'Versions & comparison…'), onClick: p.onVersions },
    ] },
    { id: 'tools', label: t('menu.tools', 'Tools'), items: [
      { label: t('menu.schedule', 'Instrument schedule & patch…'), onClick: p.onOpenSchedule },
      { label: t('menu.floorPlan', 'Import floor plan (JPG/PNG/PDF)…'), onClick: p.onUploadFloorPlan },
    ] },
    { id: 'view', label: t('menu.view', 'View'), items: [
      { label: t('menu.plan2d', '2D plan'), checked: p.viewMode === '2d', onClick: () => p.onViewModeChange('2d') },
      { label: t('menu.preview3d', '3D preview'), checked: p.viewMode === '3d', onClick: () => p.onViewModeChange('3d') },
      { label: '', separator: true },
      { label: t('menu.heatmap', 'Heat-map'), checked: p.showHeatMap, onClick: p.onToggleHeatMap },
      { label: t('menu.snap', 'Snap to grid'), checked: p.snapEnabled, onClick: p.onToggleSnap },
      { label: t('menu.focusNotes', 'Focus notes (plan)'), checked: p.showFocusNotes, onClick: p.onToggleFocusNotes },
    ] },
    { id: 'help', label: t('menu.help', 'Help'), items: [
      { label: t('menu.about', 'About Light Planner…'), onClick: p.onAbout },
      { label: '', separator: true },
      // Die Sprache steht im Einstellungen-Dialog. Der Eintrag hier fuehrt
      // dorthin, statt sie ein zweites Mal umzuschalten.
      { label: t('menu.settings', 'Settings…'), onClick: p.onOpenSettings },
    ] },
  ];
}
