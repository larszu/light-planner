// ───────────────────────────────────────────────────────────────────────────
// ADR-007 Abschnitt 6 — „Kommandopalette auf Strg/Cmd + K in jeder App,
// derselbe Griff ueberall."
//
// SIE HAT KEINE EIGENE LISTE. Was sie anbietet, ist woertlich das Menue: die
// `MenuGroup[]`, die auch die Menueleiste zeichnet, kommen hier herein und
// werden flachgeklopft. Damit gibt es keinen Befehl, den die Palette kennt
// und das Menue nicht — und keinen, den jemand ins Menue haengt und in der
// Palette vergisst. Genau das ist der Weg, auf dem „derselbe Griff ueberall"
// still zu „fast derselbe Griff" wird.
//
// Trenner und Haken bleiben draussen: ein Trenner ist kein Befehl, und der
// Haken („Heatmap ✓") ist ein Zustand, der in einer Suchliste nur verwirrt.
// Der Eintrag steht trotzdem drin — er schaltet um, das ist der Befehl.
// ───────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuGroup } from './menuModel';
import { useTranslation } from '../i18n';

interface Props {
  groups: MenuGroup[];
}

interface Befehl {
  id: string;
  group: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

const CommandPalette: React.FC<Props> = ({ groups }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [suche, setSuche] = useState('');
  const [aktiv, setAktiv] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const befehle = useMemo<Befehl[]>(
    () =>
      groups.flatMap((g) =>
        g.items
          .filter((it) => !it.separator && it.onClick)
          .map((it, i) => ({
            id: `${g.id}:${i}`,
            group: g.label,
            label: it.label,
            shortcut: it.shortcut,
            run: it.onClick!,
          })),
      ),
    [groups],
  );

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    if (!s) return befehle;
    return befehle.filter((b) => `${b.group} ${b.label}`.toLowerCase().includes(s));
  }, [befehle, suche]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
        setSuche('');
        setAktiv(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const ausfuehren = useCallback((b: Befehl | undefined) => {
    if (!b) return;
    setOpen(false);
    b.run();
  }, []);

  if (!open) return null;

  return (
    <div
      className="cmdk-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label={t('cmdk.title', 'Commands')}>
        <div className="panel-head">
          <input
            ref={inputRef}
            className="cmdk-input"
            value={suche}
            onChange={(e) => {
              setSuche(e.target.value);
              setAktiv(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAktiv((i) => Math.min(i + 1, treffer.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAktiv((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                ausfuehren(treffer[aktiv]);
              }
            }}
            placeholder={t('cmdk.placeholder', 'Type a command…')}
          />
        </div>
        <ul className="cmdk-list">
          {treffer.length === 0 && <li className="cmdk-empty">{t('cmdk.empty', 'No matching command.')}</li>}
          {treffer.map((b, i) => (
            <li key={b.id}>
              <button
                type="button"
                className={`cmdk-item ${i === aktiv ? 'on' : ''}`}
                onMouseEnter={() => setAktiv(i)}
                onClick={() => ausfuehren(b)}
              >
                <span className="cmdk-group">{b.group}</span>
                <span className="cmdk-label">{b.label}</span>
                {b.shortcut && <span className="cmdk-shortcut">{b.shortcut}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default CommandPalette;
