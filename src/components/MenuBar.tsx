import React, { useState, useRef, useEffect } from 'react';
import type { ViewMode } from '../types';

interface Props {
  viewMode: ViewMode;
  showHeatMap: boolean;
  snapEnabled: boolean;
  onSave: () => void;
  onLoad: () => void;
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
}

interface MenuItem { label: string; shortcut?: string; onClick?: () => void; separator?: boolean; checked?: boolean }

// Classic desktop-style menu bar (Datei / Bearbeiten / Ansicht).
const MenuBar: React.FC<Props> = (props) => {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, []);

  const run = (fn?: () => void) => { fn?.(); setOpen(null); };

  const menus: { id: string; label: string; items: MenuItem[] }[] = [
    { id: 'file', label: 'Datei', items: [
      { label: 'Speichern…', shortcut: 'Strg+S', onClick: props.onSave },
      { label: 'Laden…', onClick: props.onLoad },
      { label: '', separator: true },
      { label: 'Export als PNG', onClick: () => props.onExport('png') },
      { label: 'Export als JPG', onClick: () => props.onExport('jpg') },
      { label: 'Export als PDF', onClick: () => props.onExport('pdf') },
      { label: '', separator: true },
      { label: 'Geräteliste & Patch…', onClick: props.onOpenSchedule },
    ] },
    { id: 'edit', label: 'Bearbeiten', items: [
      { label: 'Rückgängig', shortcut: 'Strg+Z', onClick: props.onUndo },
      { label: 'Wiederholen', shortcut: 'Strg+Y', onClick: props.onRedo },
      { label: '', separator: true },
      { label: 'Kopieren', shortcut: 'Strg+C', onClick: props.onCopy },
      { label: 'Einfügen', shortcut: 'Strg+V', onClick: props.onPaste },
      { label: 'Duplizieren', shortcut: 'Strg+D', onClick: props.onDuplicate },
    ] },
    { id: 'view', label: 'Ansicht', items: [
      { label: '2D-Plan', checked: props.viewMode === '2d', onClick: () => props.onViewModeChange('2d') },
      { label: '3D-Vorschau', checked: props.viewMode === '3d', onClick: () => props.onViewModeChange('3d') },
      { label: '', separator: true },
      { label: 'Heatmap', checked: props.showHeatMap, onClick: props.onToggleHeatMap },
      { label: 'Raster einrasten', checked: props.snapEnabled, onClick: props.onToggleSnap },
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
