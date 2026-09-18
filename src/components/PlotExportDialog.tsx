// ───────────────────────────────────────────────────────────────────────────
// DIE EINSTELLUNGEN FUER DEN LICHTPLAN-DRUCK (#123, Kommentar).
//
// „Und den Lichtplan auch als PDF. Gleiche Einstellmoeglichkeiten wie bei
// Cable planner." Dort steht vor dem Plan-PDF ein Blatt mit Papierformat und
// Ausrichtung; hier stand bisher gar nichts — ein Klick, und die Seite war
// so gross wie das Fenster zufaellig war.
//
// GERECHNET WIRD HIER NICHTS. Das Blatt rechnet `utils/plotPage.ts`, und nur
// deshalb kann `npm run plot:check` es messen. Diese Datei sammelt die
// Auswahl ein und zeigt an, was dabei herauskommt.
// ───────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import Icon from './Icon';
import { useTranslation } from '../i18n';
import {
  PAPIERE, ausrichtungFuer, seitenLayout,
  type Ausrichtung, type PapierId,
} from '../utils/plotPage';

export interface PlotExportWahl {
  papier: PapierId;
  ausrichtung: Ausrichtung;
  randMm: number;
  /** Titelblock, Legende und Massstabsbalken unter den Plan setzen. */
  titelblock: boolean;
}

interface Props {
  /** Masse der Zeichenflaeche, damit die Vorschau die echte Seite zeigt. */
  bildBreitePx: number;
  bildHoehePx: number;
  vorgabe?: PlotExportWahl;
  onApply: (wahl: PlotExportWahl) => void;
  onCancel: () => void;
}

const RAENDER = [0, 5, 10, 20];

const PlotExportDialog: React.FC<Props> = ({ bildBreitePx, bildHoehePx, vorgabe, onApply, onCancel }) => {
  const { t } = useTranslation();
  const [papier, setPapier] = useState<PapierId>(vorgabe?.papier ?? 'a3');
  const [ausrichtung, setAusrichtung] = useState<Ausrichtung>(
    vorgabe?.ausrichtung ?? ausrichtungFuer(bildBreitePx, bildHoehePx),
  );
  const [randMm, setRandMm] = useState(vorgabe?.randMm ?? 10);
  const [titelblock, setTitelblock] = useState(vorgabe?.titelblock ?? true);

  const original = papier === 'original';
  const layout = seitenLayout({ bildBreitePx, bildHoehePx, papier, ausrichtung, randMm });
  // Prozent statt Faktor: „das Bild steht mit 64 % seiner Pixelgroesse auf dem
  // Blatt" ist die Auskunft, die jemand vor dem Drucken braucht.
  const prozent = Math.round(layout.massstab * 100);

  const papierLabel = (id: PapierId, fallback: string) => t(`dlg.plot.paper.${id}`, fallback);

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3><Icon name="export" size={14} />{t('dlg.plot.title', 'Print light plot as PDF')}</h3>
        <p className="dialog-hint">
          {t('dlg.plot.hint', 'The plan is placed on the sheet without distortion, centred. The scale bar drawn into the plan stays correct.')}
        </p>

        <div className="scale-input-row">
          <label htmlFor="plot-paper">{t('dlg.plot.paper', 'Paper size')}</label>
          <select id="plot-paper" value={papier} onChange={(e) => setPapier(e.target.value as PapierId)}>
            {PAPIERE.map((p) => (
              <option key={p.id} value={p.id}>{papierLabel(p.id, p.label)}</option>
            ))}
          </select>
        </div>

        <div className="scale-input-row">
          <label htmlFor="plot-orientation">{t('dlg.plot.orientation', 'Orientation')}</label>
          <select
            id="plot-orientation"
            value={ausrichtung}
            disabled={original}
            onChange={(e) => setAusrichtung(e.target.value as Ausrichtung)}
          >
            <option value="quer">{t('dlg.plot.landscape', 'Landscape')}</option>
            <option value="hoch">{t('dlg.plot.portrait', 'Portrait')}</option>
          </select>
        </div>

        <div className="scale-input-row">
          <label htmlFor="plot-margin">{t('dlg.plot.margin', 'Margin')}</label>
          <select
            id="plot-margin"
            value={randMm}
            disabled={original}
            onChange={(e) => setRandMm(Number(e.target.value))}
          >
            {RAENDER.map((mm) => <option key={mm} value={mm}>{mm} mm</option>)}
          </select>
        </div>

        <label className="scale-input-row">
          <input type="checkbox" checked={titelblock} onChange={(e) => setTitelblock(e.target.checked)} />
          <span>{t('dlg.plot.titleBlock', 'Title block, legend and scale bar below the plan')}</span>
        </label>

        <p className="scale-factor-hint">
          {original
            ? t('dlg.plot.originalHint', 'Page as large as the drawing — nothing is scaled, nothing is cropped. No standard paper size.')
            : `${t('dlg.plot.scaleLabel', 'Plan on the sheet:')} ${prozent} %`}
        </p>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
          <button className="btn-primary" onClick={() => onApply({ papier, ausrichtung, randMm, titelblock })}>
            {t('dlg.plot.export', 'Export PDF')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlotExportDialog;
