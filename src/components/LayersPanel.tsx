import React, { useState } from 'react';
import { useTranslation } from '../i18n';
import Icon, { type IconName } from './Icon';
import type { Layers, LayerKey } from '../types';

interface Props {
  layers: Layers;
  counts: Record<LayerKey, number>;
  onToggleVisible: (key: LayerKey) => void;
  onToggleLocked: (key: LayerKey) => void;
}

/**
 * Order top→bottom = front→back, like a Photoshop layer stack.
 *
 * ZEICHEN AUS DEM ICON-SATZ, NICHT AUS DER ZEICHENTABELLE. Bis zum 2026-09-11
 * standen hier acht Piktogramme (💡🧍▦⬛📐🟫🧱🗺). `Icon.tsx` sagt in seiner
 * ersten Zeile, wofuer es da ist — „replacing the emoji icons across the UI" —
 * und die Ebenen-Liste war einer der Orte, die nie umgestellt wurden.
 *
 * Das ist kein Geschmack, sondern eine Frage der Erkennbarkeit: ein
 * Piktogramm kommt aus der Schriftart des Systems. Es hat seine eigene Farbe,
 * seine eigene Strichstaerke und auf Windows, macOS und Linux drei
 * verschiedene Formen — neben einem Strichsymbol mit 1,7 px in `currentColor`
 * sieht das aus wie zwei verschiedene Programme. Genau daneben, in derselben
 * Spalte, stehen die Reiter des Docks mit eben diesen Strichsymbolen.
 */
const ROWS: { key: LayerKey; icon: IconName }[] = [
  { key: 'fixtures', icon: 'fixture' },
  { key: 'persons', icon: 'person' },
  { key: 'trusses', icon: 'truss' },
  { key: 'stage', icon: 'stage' },
  { key: 'shapes', icon: 'rect' },
  { key: 'ceilings', icon: 'ceiling' },
  { key: 'walls', icon: 'wall' },
  { key: 'floorPlan', icon: 'plan2d' },
];

/**
 * Der Name einer Ebene — als SCHALTER und nicht als Feld in `ROWS`.
 *
 * Der Name stand bis 2026-09-10 als deutsches Literal in der Tabelle oben, in
 * einem Repo mit Quellsprache `en` (E-28). Der Sprachmix-Zaehler sah ihn nicht:
 * er liest JSX-Text, Attribute und Rueckfragen, nicht die Felder eines
 * Modul-Objekts. Acht Beschriftungen, die niemand messen konnte.
 *
 * Der Schalter statt eines `schluessel`-Feldes hat denselben Grund: `t()` mit
 * einer Variablen als Schluessel ist fuer `i18n:check` nicht mehr aufloesbar,
 * und die acht Eintraege im Woerterbuch gaelten dort ab sofort als
 * unerreichbar. Ein Waechter, der von einer Umformung blind wird, ist teurer
 * als die acht Zeilen hier.
 */
const ebenenName = (t: (key: string, en: string) => string, key: LayerKey): string => {
  switch (key) {
    case 'fixtures': return t('panel.layers.fixtures', 'Fixtures');
    case 'persons': return t('panel.layers.persons', 'People');
    case 'trusses': return t('panel.layers.trusses', 'Trusses');
    case 'stage': return t('panel.layers.stage', 'Stage / risers');
    case 'shapes': return t('panel.layers.shapes', 'Shapes & dimensions');
    case 'ceilings': return t('panel.layers.ceilings', 'Ceilings');
    case 'walls': return t('panel.layers.walls', 'Walls');
    case 'floorPlan': return t('panel.layers.floorPlan', 'Floor plan');
  }
};

// Floating "Ebenen" overview: toggle visibility (eye) and lock per category.
const LayersPanel: React.FC<Props> = ({ layers, counts, onToggleVisible, onToggleLocked }) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`layers-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="lp-header">
        <span className="lp-title"><Icon name="layers" size={14} />{t('panel.layers.title', 'Layers')}</span>
        <button className="lp-icon-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? t('panel.expand', 'Expand') : t('panel.collapse', 'Collapse')}>
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={13} />
        </button>
      </div>
      {!collapsed && (
        <ul className="lp-list">
          {ROWS.map(({ key, icon }) => {
            const l = layers[key];
            const n = counts[key];
            return (
              <li key={key} className={`lp-row ${l.visible ? '' : 'lp-off'}`}>
                <button
                  className="lp-eye"
                  onClick={() => onToggleVisible(key)}
                  title={l.visible ? t('panel.layers.hide', 'Hide') : t('panel.layers.show', 'Show')}
                ><Icon name={l.visible ? 'eye' : 'eyeOff'} size={14} /></button>
                <button
                  className={`lp-lock ${l.locked ? 'on' : ''}`}
                  onClick={() => onToggleLocked(key)}
                  title={l.locked ? t('panel.layers.unlock', 'Unlock') : t('panel.layers.lock', 'Lock (not selectable)')}
                ><Icon name={l.locked ? 'lock' : 'unlock'} size={14} /></button>
                <span className="lp-name"><span className="lp-ico"><Icon name={icon} size={14} /></span>{ebenenName(t, key)}</span>
                <span className="lp-count">{n}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LayersPanel;
