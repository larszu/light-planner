import React, { useState, useRef, useEffect } from 'react';
import type { ViewMode } from '../types';
import { useTranslation } from '../i18n';
import { buildMenus, type MenuBarProps } from './menuModel';
import CommandPalette from './CommandPalette';


// Classic desktop-style menu bar (Datei / Bearbeiten / Ansicht).
const MenuBar: React.FC<MenuBarProps> = (props) => {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { t, language, setLanguage } = useTranslation();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, []);

  const run = (fn?: () => void) => { fn?.(); setOpen(null); };

  const menus = buildMenus(props, t, language, setLanguage)

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
      {/* ADR-007 Abschnitt 6: derselbe Griff ueberall. Die Palette haengt
          HIER und nicht in App.tsx, weil `menus` genau hier entsteht — so
          kann sie gar keine andere Liste bekommen als die Menueleiste. */}
      <CommandPalette groups={menus} />
    </div>
  );
};

export default MenuBar;
