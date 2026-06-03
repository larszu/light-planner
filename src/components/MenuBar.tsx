import React, { useState, useRef, useEffect } from 'react';
import type { ViewMode } from '../types';
import { useTranslation } from '../i18n';

interface Props {
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

interface MenuItem { label: string; shortcut?: string; onClick?: () => void; separator?: boolean; checked?: boolean }

// Classic desktop-style menu bar (Datei / Bearbeiten / Ansicht).
const MenuBar: React.FC<Props> = (props) => {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { t, language, setLanguage } = useTranslation();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, []);

  const run = (fn?: () => void) => { fn?.(); setOpen(null); };

  const menus: { id: string; label: string; items: MenuItem[] }[] = [
    { id: 'file', label: t('menu.file', 'Datei'), items: [
      { label: t('menu.new', 'Neu'), shortcut: 'Strg+N', onClick: props.onNew },
      { label: '', separator: true },
      { label: t('menu.save', 'Speichern (Browser)…'), shortcut: 'Strg+S', onClick: props.onSave },
      { label: t('menu.load', 'Laden (Browser)…'), onClick: props.onLoad },
      { label: '', separator: true },
      { label: t('menu.saveFile', 'Projekt als Datei… (Speicherort wählen)'), onClick: props.onSaveToFile },
      { label: t('menu.loadFile', 'Projekt aus Datei…'), onClick: props.onLoadFromFile },
      { label: '', separator: true },
      { label: t('menu.exportPng', 'Export als PNG…'), onClick: () => props.onExport('png') },
      { label: t('menu.exportJpg', 'Export als JPG…'), onClick: () => props.onExport('jpg') },
      { label: t('menu.exportPdf', 'Export als PDF…'), onClick: () => props.onExport('pdf') },
      { label: '', separator: true },
      { label: t('menu.schedule', 'Geräteliste & Patch…'), onClick: props.onOpenSchedule },
    ] },
    { id: 'edit', label: t('menu.edit', 'Bearbeiten'), items: [
      { label: t('menu.undo', 'Rückgängig'), shortcut: 'Strg+Z', onClick: props.onUndo },
      { label: t('menu.redo', 'Wiederholen'), shortcut: 'Strg+Y', onClick: props.onRedo },
      { label: '', separator: true },
      { label: t('menu.copy', 'Kopieren'), shortcut: 'Strg+C', onClick: props.onCopy },
      { label: t('menu.paste', 'Einfügen'), shortcut: 'Strg+V', onClick: props.onPaste },
      { label: t('menu.duplicate', 'Duplizieren'), shortcut: 'Strg+D', onClick: props.onDuplicate },
    ] },
    { id: 'view', label: t('menu.view', 'Ansicht'), items: [
      { label: t('menu.plan2d', '2D-Plan'), checked: props.viewMode === '2d', onClick: () => props.onViewModeChange('2d') },
      { label: t('menu.preview3d', '3D-Vorschau'), checked: props.viewMode === '3d', onClick: () => props.onViewModeChange('3d') },
      { label: '', separator: true },
      { label: t('menu.heatmap', 'Heatmap'), checked: props.showHeatMap, onClick: props.onToggleHeatMap },
      { label: t('menu.snap', 'Raster einrasten'), checked: props.snapEnabled, onClick: props.onToggleSnap },
    ] },
    { id: 'help', label: t('menu.help', 'Hilfe'), items: [
      { label: t('menu.about', 'Über Light Planner…'), onClick: props.onAbout },
      { label: '', separator: true },
      { label: language === 'de' ? t('menu.language', 'Sprache: English') : 'Sprache: Deutsch', checked: false, onClick: () => setLanguage(language === 'de' ? 'en' : 'de') },
    ] },
  ];

  return (
    <div className="menubar" ref={ref}>
      <span className="menubar-brand">💡 LightPlanner</span>
      {menus.map((m) => (
        <div key={m.id} className="menu">
          <button
            className={`menu-title ${open === m.id ? 'open' : ''}`}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onMouseEnter={() => { if (open) setOpen(m.id); }}
          >
            {m.label}
          </button>
          {open === m.id && (
            <div className="menu-dropdown">
              {m.items.map((it, i) => (it.separator
                ? <div key={i} className="menu-sep" />
                : <button key={i} className="menu-item" onClick={() => run(it.onClick)}>
                    <span className="menu-check">{it.checked ? '✓' : ''}</span>
                    <span className="menu-label">{it.label}</span>
                    {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
                  </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default MenuBar;
