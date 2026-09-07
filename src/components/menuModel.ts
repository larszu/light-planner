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
    { id: 'file', label: t('menu.file', 'Datei'), items: [
      { label: t('menu.new', 'Neu'), shortcut: 'Strg+N', onClick: p.onNew },
      { label: '', separator: true },
      { label: t('menu.save', 'Speichern (Browser)…'), shortcut: 'Strg+S', onClick: p.onSave },
      { label: t('menu.load', 'Laden (Browser)…'), onClick: p.onLoad },
      { label: '', separator: true },
      { label: t('menu.saveFile', 'Projekt als Datei… (Speicherort wählen)'), onClick: p.onSaveToFile },
      { label: t('menu.loadFile', 'Projekt aus Datei…'), onClick: p.onLoadFromFile },
      { label: '', separator: true },
      { label: t('menu.exportPng', 'Export als PNG…'), onClick: () => p.onExport('png') },
      { label: t('menu.exportJpg', 'Export als JPG…'), onClick: () => p.onExport('jpg') },
      { label: t('menu.exportPdf', 'Export als PDF…'), onClick: () => p.onExport('pdf') },
      { label: '', separator: true },
      { label: t('menu.schedule', 'Geräteliste & Patch…'), onClick: p.onOpenSchedule },
    ] },
    { id: 'edit', label: t('menu.edit', 'Bearbeiten'), items: [
      { label: t('menu.undo', 'Rückgängig'), shortcut: 'Strg+Z', onClick: p.onUndo },
      { label: t('menu.redo', 'Wiederholen'), shortcut: 'Strg+Y', onClick: p.onRedo },
      { label: '', separator: true },
      { label: t('menu.copy', 'Kopieren'), shortcut: 'Strg+C', onClick: p.onCopy },
      { label: t('menu.paste', 'Einfügen'), shortcut: 'Strg+V', onClick: p.onPaste },
      { label: t('menu.duplicate', 'Duplizieren'), shortcut: 'Strg+D', onClick: p.onDuplicate },
    ] },
    { id: 'view', label: t('menu.view', 'Ansicht'), items: [
      { label: t('menu.plan2d', '2D-Plan'), checked: p.viewMode === '2d', onClick: () => p.onViewModeChange('2d') },
      { label: t('menu.preview3d', '3D-Vorschau'), checked: p.viewMode === '3d', onClick: () => p.onViewModeChange('3d') },
      { label: '', separator: true },
      { label: t('menu.heatmap', 'Heatmap'), checked: p.showHeatMap, onClick: p.onToggleHeatMap },
      { label: t('menu.snap', 'Raster einrasten'), checked: p.snapEnabled, onClick: p.onToggleSnap },
    ] },
    { id: 'help', label: t('menu.help', 'Hilfe'), items: [
      { label: t('menu.about', 'Über Light Planner…'), onClick: p.onAbout },
      { label: '', separator: true },
      { label: language === 'de' ? t('menu.language', 'Sprache: English') : 'Sprache: Deutsch', checked: false, onClick: () => setLanguage(language === 'de' ? 'en' : 'de') },
    ] },
  ];
}
