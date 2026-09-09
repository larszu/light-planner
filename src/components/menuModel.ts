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

export function buildMenus(
  p: MenuBarProps,
  t: Uebersetzen,
  language: string,
  setLanguage: (l: 'de' | 'en') => void,
): MenuGroup[] {
  return [
    { id: 'file', label: t('menu.file', 'File'), items: [
      { label: t('menu.new', 'New'), shortcut: 'Strg+N', onClick: p.onNew },
      { label: '', separator: true },
      { label: t('menu.save', 'Save (browser)…'), shortcut: 'Strg+S', onClick: p.onSave },
      { label: t('menu.load', 'Load (browser)…'), onClick: p.onLoad },
      { label: '', separator: true },
      { label: t('menu.saveFile', 'Project to file… (choose location)'), onClick: p.onSaveToFile },
      { label: t('menu.loadFile', 'Open project file…'), onClick: p.onLoadFromFile },
      { label: '', separator: true },
      { label: t('menu.exportPng', 'Export as PNG…'), onClick: () => p.onExport('png') },
      { label: t('menu.exportJpg', 'Export as JPG…'), onClick: () => p.onExport('jpg') },
      { label: t('menu.exportPdf', 'Export as PDF…'), onClick: () => p.onExport('pdf') },
      { label: '', separator: true },
      { label: t('menu.schedule', 'Instrument schedule & patch…'), onClick: p.onOpenSchedule },
    ] },
    { id: 'edit', label: t('menu.edit', 'Edit'), items: [
      { label: t('menu.undo', 'Undo'), shortcut: 'Strg+Z', onClick: p.onUndo },
      { label: t('menu.redo', 'Redo'), shortcut: 'Strg+Y', onClick: p.onRedo },
      { label: '', separator: true },
      { label: t('menu.copy', 'Copy'), shortcut: 'Strg+C', onClick: p.onCopy },
      { label: t('menu.paste', 'Paste'), shortcut: 'Strg+V', onClick: p.onPaste },
      { label: t('menu.duplicate', 'Duplicate'), shortcut: 'Strg+D', onClick: p.onDuplicate },
    ] },
    { id: 'view', label: t('menu.view', 'View'), items: [
      { label: t('menu.plan2d', '2D plan'), checked: p.viewMode === '2d', onClick: () => p.onViewModeChange('2d') },
      { label: t('menu.preview3d', '3D preview'), checked: p.viewMode === '3d', onClick: () => p.onViewModeChange('3d') },
      { label: '', separator: true },
      { label: t('menu.heatmap', 'Heat-map'), checked: p.showHeatMap, onClick: p.onToggleHeatMap },
      { label: t('menu.snap', 'Snap to grid'), checked: p.snapEnabled, onClick: p.onToggleSnap },
    ] },
    { id: 'help', label: t('menu.help', 'Help'), items: [
      { label: t('menu.about', 'About Light Planner…'), onClick: p.onAbout },
      { label: '', separator: true },
      { label: language === 'de' ? t('menu.language', 'Language: English') : 'Sprache: Deutsch', checked: false, onClick: () => setLanguage(language === 'de' ? 'en' : 'de') },
    ] },
  ];
}
