// ───────────────────────────────────────────────────────────────────────────
// Die Menueleiste — sie RENDERT das Modell aus `menuModel.ts`.
//
// NUTZER-AUFTRAG 2026-09-11: „Stelle sicher das in allen repos uebergreifend
// das Einstellungen Menue an der gleichen Stelle ist wie im Cable planner und
// das die obere Menueleiste gleich aufgebaut ist."
//
// WAS VORHER DA WAR: ein Hamburger-Knopf, der EINE lange Klappe mit allem
// darin oeffnete — Datei, Bearbeiten, Sprache und „Ueber" untereinander, mit
// Ueberschriften statt Menues. Auf dem Schreibtisch ist das kein Menue,
// sondern eine Liste, die man von oben nach unten liest. Der Cable Planner
// fuehrt fuenf Menues nebeneinander; ADR-007 Abschnitt 6 sagt ausserdem:
// kein Hamburger auf dem Desktop.
//
// WARUM ES DAS MODELL LIEST UND KEINE EIGENE LISTE HAELT: die
// Kommandopalette (Strg/Cmd+K) zeigt dieselben Befehle. Zwei Listen waeren
// die uebliche Art, wie diese Zusage zerfaellt — jemand haengt einen Befehl
// ins Menue und vergisst die Palette.
//
// Die Klassen sind die vorhandenen `tb-*` aus `App.css`: die Klappe sieht
// aus wie vorher, nur haengt sie jetzt an fuenf Titeln statt an einem
// Hamburger.
// ───────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import type { MenuGroup } from './menuModel';

const TopMenu: React.FC<{ groups: MenuGroup[] }> = ({ groups }) => {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Klick daneben schliesst, Escape auch. Der Hamburger kannte nur das
  // Erste; wer die Klappe mit der Tastatur wieder loswerden wollte, musste
  // irgendwohin klicken.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="tb-menubar" ref={ref}>
      {groups.map((g) => (
        <div className="tb-menuwrap" key={g.id}>
          <button
            type="button"
            className={`tb-menutitle ${open === g.id ? 'on' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open === g.id}
            onClick={() => setOpen(open === g.id ? null : g.id)}
          >
            {g.label}
          </button>
          {open === g.id && (
            <div className="tb-dropdown" role="menu">
              {g.items.map((it, i) =>
                it.separator ? (
                  <div className="tb-dd-div" key={`sep-${i}`} />
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="tb-dd-item"
                    key={it.label}
                    onClick={() => {
                      setOpen(null);
                      it.onClick?.();
                    }}
                  >
                    {it.label}
                    {it.shortcut && <kbd>{it.shortcut}</kbd>}
                    {it.checked !== undefined && (
                      <span className={`tb-check ${it.checked ? 'on' : ''}`}>
                        <Icon name="check" size={13} />
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default TopMenu;
