// ───────────────────────────────────────────────────────────────────────────
// Die Einstellungen — hinter dem Knopf rechts aussen in der Kopfzeile, an
// derselben Stelle wie im Cable Planner (ADR-007 Abschnitt 6).
//
// DIE SPRACHE STAND VORHER MITTEN IM HAMBURGER, zwischen „Versionen" und
// „Ueber". Das war die Stelle, an der dieses Repo sie zufaellig
// untergebracht hatte (B-13: davor lag sie in einer Datei, die niemand
// rendert), nicht die Stelle, an der jemand sie sucht.
//
// DAS THEMA IST SEIT DEM 2026-09-11 DA (B-70). Hier stand bis dahin, warum
// es FEHLT: `App.css` sei ein einziges dunkles Stilblatt mit
// festgeschriebenen Flaechen. Die Haelfte davon stimmte — die Flaechen
// hingen laengst an den Variablen, die ADR-007 Stufe 5 eingezogen hat; was
// wirklich fehlte, waren ein zweiter Satz WERTE und ein paar Stellen, die
// noch rohes Hex trugen.
//
// Die andere Haelfte stimmt weiter und steht deshalb als Entscheidung in
// `App.css`: der 2D-Plan und die 3D-Szene drehen sich NICHT mit. Ein
// Lichtplan zeigt eine beleuchtete Buehne — sie hell zu machen hiesse,
// anderes Licht zu behaupten, und genau darueber gibt dieses Werkzeug
// Auskunft. Der Plan ist der Inhalt, nicht die Verpackung.
//
// Beim Umbau fielen SIEBEN Zustaende auf, die weisse Schrift auf die
// Off-White-Aktionsflaeche schrieben — darunter die Zahl am Reiter, die
// sagt, wieviel dort offen ist. Sie waren seit ADR-007 Stufe 5 unlesbar,
// in jedem Thema, und niemandem gemeldet worden.
//
// „Ueber" hat dieses Repo schon als eigenen Dialog (`AboutDialog`), und der
// Hilfe-Eintrag fuehrt weiter dorthin. Hier steht nur die Version — sonst
// gaebe es die Auskunft zweimal.
// ───────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import { APP_VERSION } from '../version';
import { liesThema, setzeThema, type Thema } from '../lib/thema';

const LANGUAGES: { id: 'en' | 'de'; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
];

const SettingsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t, language, setLanguage } = useTranslation();
  const [thema, setThema] = useState<Thema>(liesThema);

  /* Drei Zustaende, weil „System" keine Umschreibung fuer „dunkel" ist. */
  const THEMEN: { id: Thema; label: string; hint: string }[] = [
    { id: 'system', label: t('settings.theme.system', 'System'), hint: t('settings.theme.systemHint', 'Follows the operating system.') },
    { id: 'dunkel', label: t('settings.theme.dark', 'Dark'), hint: t('settings.theme.darkHint', 'Always dark.') },
    { id: 'hell', label: t('settings.theme.light', 'Light'), hint: t('settings.theme.lightHint', 'Always light.') },
  ];

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      /* B-44 — Klick auf den Hintergrund schliesst. Ohne Schutzabfrage: in
         diesem Dialog gibt es kein ungesichertes Eingabefeld, jede Auswahl
         wirkt sofort. */
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label={t('settings.title', 'Settings')}>
        <h3>{t('settings.title', 'Settings')}</h3>

        <h4 className="settings-h">{t('settings.language', 'Language')}</h4>
        <p className="settings-hint">
          {t(
            'settings.languageHint',
            'English is the source language; German is a translation. A missing entry falls back to English.',
          )}
        </p>
        <div className="settings-chips">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`tb-chip ${language === l.id ? 'on' : ''}`}
              onClick={() => setLanguage(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>

        <h4 className="settings-h">{t('settings.theme', 'Theme')}</h4>
        <p className="settings-hint">
          {t(
            'settings.themeHint',
            'The plan view and the 3D scene stay as they are: a light plot shows a lit stage, and making it lighter would claim different light.',
          )}
        </p>
        <div className="settings-chips">
          {THEMEN.map((w) => (
            <button
              key={w.id}
              type="button"
              title={w.hint}
              className={`tb-chip ${thema === w.id ? 'on' : ''}`}
              onClick={() => {
                setThema(w.id);
                setzeThema(w.id);
              }}
            >
              {w.label}
            </button>
          ))}
        </div>

        <h4 className="settings-h">{t('settings.about', 'About')}</h4>
        <p className="settings-hint">LightPlanner v{APP_VERSION}</p>

        <div className="settings-foot">
          <button type="button" className="tb-btn" onClick={onClose}>
            {t('settings.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
