// ───────────────────────────────────────────────────────────────────────────
// Die Einstellungen — hinter dem Knopf rechts aussen in der Kopfzeile, an
// derselben Stelle wie im Cable Planner (ADR-007 Abschnitt 6).
//
// DIE SPRACHE STAND VORHER MITTEN IM HAMBURGER, zwischen „Versionen" und
// „Ueber". Das war die Stelle, an der dieses Repo sie zufaellig
// untergebracht hatte (B-13: davor lag sie in einer Datei, die niemand
// rendert), nicht die Stelle, an der jemand sie sucht.
//
// DAS THEMA FEHLT, UND ZWAR GEMESSEN. Der gemeinsame Grundstock der Suite
// ist Sprache, Thema und Ueber. Ein Hell-Thema ist in dieser App kein
// Token-Tausch: `App.css` ist ein einziges dunkles Stilblatt mit
// festgeschriebenen Flaechen, dazu kommt der 2D-Canvas, der seine Farben
// selbst malt, und die 3D-Szene. Ein Umschalter, der eine halb umgefaerbte
// App liefert, ist schlimmer als keiner — er sieht aus wie eine Faehigkeit.
// Die Umstellung steht als B-70 im Backlog der Suite und NICHT als
// ausgegrauter Punkt in diesem Dialog.
//
// „Ueber" hat dieses Repo schon als eigenen Dialog (`AboutDialog`), und der
// Hilfe-Eintrag fuehrt weiter dorthin. Hier steht nur die Version — sonst
// gaebe es die Auskunft zweimal.
// ───────────────────────────────────────────────────────────────────────────
import React, { useEffect } from 'react';
import { useTranslation } from '../i18n';
import { APP_VERSION } from '../version';

const LANGUAGES: { id: 'en' | 'de'; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
];

const SettingsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t, language, setLanguage } = useTranslation();

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
