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
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon';
import type { MenuGroup } from './menuModel';

/**
 * B-77 — DIE KLAPPE HAENGT AM FENSTER, NICHT AN DER LEISTE.
 *
 * WAS KAPUTT WAR. `#125` gab `.tb-menubar` ein `overflow: hidden`, damit die
 * Kopfzeile auf schmalen Fenstern nicht zweizeilig wird. Die Klappe ist ein
 * `position: absolute`-Kind DIESER Leiste — also schnitt dasselbe `hidden`
 * sie mit ab. Im Browser nachgemessen (2026-09-13, 1440 px): die Datei-Klappe
 * ist 250 x 505 px gross und davon 250 x 0 px sichtbar. Kein Menue dieser App
 * ging mehr auf; im Bildschirmfoto sieht man nur den aktiven Titel.
 *
 * Das ist die Sorte Fehler, die ein Waechter am Quelltext nicht findet: beide
 * Regeln sind fuer sich richtig, der Schaden entsteht erst aus ihrem
 * Zusammentreffen im Layout. `bedienbar:check` in der Suite oeffnet deshalb
 * seit B-77 jedes Menue und misst, dass die Klappe sichtbar ist.
 *
 * WARUM `fixed` UND NICHT „das `hidden` wieder weg". Weil das `hidden` einen
 * Zweck hat: ohne es bricht die Kopfzeile um und schiebt die ganze Anwendung
 * nach unten. Eine Klappe am VIEWPORT kennt den Beschnitt ihrer Vorfahren
 * nicht — damit darf die Leiste rollen, klemmen oder schrumpfen, ohne dass
 * das Menue etwas davon merkt. Die Koordinaten kommen aus dem Rechteck des
 * Titels und werden nach dem Einhaengen an den Fensterrand geklemmt.
 *
 * Die Klappe bleibt ein Kind der Leiste (kein Portal): der Klick-daneben-
 * Waechter unten prueft `ref.current.contains(...)`, und ein Portal waere
 * ausserhalb — das Menue schloesse sich beim Klick auf den eigenen Eintrag.
 */
const TopMenu: React.FC<{ groups: MenuGroup[] }> = ({ groups }) => {
  const [open, setOpen] = useState<string | null>(null);
  /** Das Rechteck des angeklickten Titels — Ausgangspunkt der Klappe. */
  const [anker, setAnker] = useState<{ links: number; oben: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const klappe = useRef<HTMLDivElement>(null);

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
    // ROLLEN FUEHRT NACH, GROESSE SCHLIESST.
    //
    // Beides muss etwas tun, weil die Klappe am Fenster haengt: sie weiss von
    // sich aus nicht, dass ihr Titel sich bewegt hat. Die Menueleiste rollt
    // unter 820 px waagerecht, also bewegt er sich.
    //
    // Der erste Anlauf SCHLOSS bei beidem, und das war falsch — gemessen im
    // `multicam-planner` mit derselben Bauart: liegt ein Titel ausserhalb der
    // Leiste, rollt ein Klick sie erst dorthin, und das Rollereignis kam NACH
    // dem Klick. Die Klappe ging auf und sofort wieder zu. Nachfuehren ist
    // ausserdem das bessere Verhalten: die Klappe bleibt an ihrem Titel.
    const nachfuehren = () => {
      const knopf = ref.current?.querySelector('.tb-menutitle.on') as HTMLElement | null;
      if (!knopf) return;
      const r = knopf.getBoundingClientRect();
      setAnker({ links: r.left, oben: r.bottom });
    };
    const weg = () => setOpen(null);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    window.addEventListener('resize', weg);
    window.addEventListener('scroll', nachfuehren, true);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('resize', weg);
      window.removeEventListener('scroll', nachfuehren, true);
    };
  }, [open]);

  // NACH dem Einhaengen messen und an den Fensterrand klemmen: vorher ist die
  // Breite der Klappe unbekannt (sie haengt an ihrem laengsten Eintrag), und
  // eine geratene Breite waere auf Deutsch eine andere als auf Englisch.
  useLayoutEffect(() => {
    const el = klappe.current;
    if (!el || !anker) return;
    const r = el.getBoundingClientRect();
    const rand = 8;
    const links = Math.max(rand, Math.min(anker.links, window.innerWidth - rand - r.width));
    const oben = Math.max(rand, Math.min(anker.oben, window.innerHeight - rand - r.height));
    el.style.left = `${links}px`;
    el.style.top = `${oben}px`;
  }, [anker, open]);

  return (
    <div className="tb-menubar" ref={ref}>
      {groups.map((g) => (
        <div className="tb-menuwrap" key={g.id}>
          <button
            type="button"
            className={`tb-menutitle ${open === g.id ? 'on' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open === g.id}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setAnker({ links: r.left, oben: r.bottom });
              setOpen(open === g.id ? null : g.id);
            }}
          >
            {g.label}
          </button>
          {open === g.id && (
            <div className="tb-dropdown tb-menuklappe" role="menu" ref={klappe}>
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
