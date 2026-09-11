import React from 'react';
import Icon from './Icon';
import { useTranslation } from '../i18n';

/**
 * Der Rahmen einer Seitenleiste — links wie rechts, offen wie eingeklappt.
 *
 * ─── WARUM ES DIESE KOMPONENTE GIBT ──────────────────────────────────────
 *
 * Verglichen am 2026-09-11 ueber die fuenf Apps der Suite: jede klappte ihre
 * Spalten anders ein, und zwei gar nicht.
 *
 *   cable-planner   Griff IN der Leiste, eingeklappt 32 px mit dem Namen
 *                   senkrecht darin, beide Spalten zusaetzlich ziehbar
 *   multicam        Griff in einem eigenen 20-px-Streifen DANEBEN,
 *                   eingeklappt `w-0` — eingeklappt sagte nichts mehr, was
 *                   dort zugeklappt ist
 *   light-planner   gar nicht einklappbar
 *
 * Wer zwischen den Apps wechselt, musste den Griff also jedes Mal neu
 * suchen — und hier fand er ihn nicht, weil es ihn nicht gab. ADR-007
 * Abschnitt 6 legt den Rahmen fest; der Griff gehoert dazu.
 *
 * Der `cable-planner` ist der Massstab (Eigentuemer-Weisung: „Passe an den
 * Cable planner stand an"), also ist seine Form die hier gebaute.
 *
 * ─── UND WARUM DER KOPF EINE LINIE IST ───────────────────────────────────
 *
 * `.panel-head` gab es laengst — benutzt hat sie nur die Kommandopalette.
 * ADR-007 nennt die Kopflinie ausdruecklich „die Kopfzeile jedes Panels und
 * jedes Dialogs"; die Seitenleisten trugen sie als einzige nicht. Eine
 * Linie in der Akzentfarbe, kein Balken: sie trennt, ohne eine Flaeche zu
 * setzen.
 */
export interface SeitenPanelProps {
  /** Welche Seite — entscheidet ueber Rand und Richtung des Pfeils. */
  seite: 'links' | 'rechts';
  /** Der Name der Spalte. Steht im Kopf und, eingeklappt, senkrecht. */
  titel: string;
  eingeklappt: boolean;
  onUmschalten: (eingeklappt: boolean) => void;
  children: React.ReactNode;
}

const SeitenPanel: React.FC<SeitenPanelProps> = ({
  seite,
  titel,
  eingeklappt,
  onUmschalten,
  children,
}) => {
  const { t } = useTranslation();
  const links = seite === 'links';
  // Eingeklappt zeigt der Pfeil dorthin, wo die Spalte wieder aufgeht.
  const zeichen = eingeklappt === links ? 'chevronRight' : 'chevronLeft';
  // EIGENE SCHLUESSEL und nicht `panel.expand`/`panel.collapse`: die gibt es
  // schon, sie gehoeren den Abschnitten INNERHALB eines Panels
  // (Grundriss, Ebenen, Szenen) und lauten dort schlicht „Expand"/„Collapse".
  // Derselbe Schluessel mit zwei verschiedenen Quelltexten ist eine Dublette,
  // bei der beim Zusammenfuegen der letzte gewinnt — `i18n:check` hat genau
  // das gemeldet, als hier zuerst die vorhandenen Namen standen.
  const oeffnen = t('panel.column.expand', 'Expand column');
  const schliessen = t('panel.column.collapse', 'Collapse column');

  if (eingeklappt) {
    return (
      <aside className={`panel-rail panel-rail-${seite}`}>
        <button
          type="button"
          className="panel-rail-btn"
          onClick={() => onUmschalten(false)}
          title={oeffnen}
          aria-label={`${oeffnen}: ${titel}`}
        >
          <Icon name={zeichen} size={13} />
        </button>
        <button
          type="button"
          className="panel-rail-titel"
          onClick={() => onUmschalten(false)}
          aria-label={`${oeffnen}: ${titel}`}
        >
          {titel}
        </button>
      </aside>
    );
  }

  return (
    <aside className={`seiten-panel seiten-panel-${seite}`}>
      <div className="spaltenkopf panel-head">
        <span className="panel-head-titel">{titel}</span>
        <button
          type="button"
          className="panel-head-btn"
          onClick={() => onUmschalten(true)}
          title={schliessen}
          aria-label={`${schliessen}: ${titel}`}
        >
          <Icon name={zeichen} size={13} />
        </button>
      </div>
      <div className="seiten-panel-body">{children}</div>
    </aside>
  );
};

export default SeitenPanel;
