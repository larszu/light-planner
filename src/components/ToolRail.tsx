import React from 'react';
import type { Tool } from '../types';
import Icon, { type IconName } from './Icon';
import { useTranslation } from '../i18n';

interface Props {
  activeTool: Tool;
  onToolChange: (t: Tool) => void;
}

// Vertical tool rail — *only* drawing/placement tools (verbs). View modes,
// render settings and file actions live in the top bar; contextual actions
// (align, auto-light) appear over the canvas when relevant.
// WARUM DIE GRUPPEN EINE FUNKTION VON `t` SIND UND KEINE KONSTANTE.
// Der erste Versuch stand als konstante Liste da und loeste die Schluessel
// dynamisch auf (aus der Tool-Id zusammengesetzt). Das laeuft — und ist genau
// die Form, die `i18n:check` NICHT sehen kann: der Guard sucht Aufrufe mit
// literalem Schluessel. Gemessen war die Folge sofort sichtbar: `tool.stage`
// stand im englischen Woerterbuch als „Podest", und keine Pruefung hat es
// gemeldet, weil kein Schluessel als erreichbar galt. Literale Aufrufe
// kosten hier zwei Zeilen mehr und machen die Luecke sichtbar.
type Entry = { id: Tool; icon: IconName; label: string; hint: string };
type Group = Entry[];

type TFn = (key: string, de: string) => string;

const groupsFor = (t: TFn): Group[] => [
  [
    { id: 'select', icon: 'select', label: t('tool.select', 'Auswahl'), hint: t('tool.select.hint', 'Auswählen & bewegen — V') },
    { id: 'pan', icon: 'pan', label: t('tool.pan', 'Ansicht'), hint: t('tool.pan.hint', 'Ansicht verschieben — Leertaste/H') },
  ],
  [
    { id: 'person', icon: 'person', label: t('tool.person', 'Person'), hint: t('tool.person.hint', 'Person platzieren') },
    { id: 'stage', icon: 'podium', label: t('tool.stage', 'Podest'), hint: t('tool.stage.hint', 'Podest (rechteckig) zeichnen') },
    { id: 'stagepoly', icon: 'stage', label: t('tool.stagepoly', 'Bühne'), hint: t('tool.stagepoly.hint', 'Bühne als Polygon zeichnen') },
    { id: 'truss', icon: 'truss', label: t('tool.truss', 'Traverse'), hint: t('tool.truss.hint', 'Traverse ziehen') },
    { id: 'wall', icon: 'wall', label: t('tool.wall', 'Wand'), hint: t('tool.wall.hint', 'Wand-Pfad zeichnen') },
    { id: 'camera', icon: 'camera', label: t('tool.camera', 'Kamera'), hint: t('tool.camera.hint', 'Kamera-Standpunkt setzen (kein Foto-Modus)') },
  ],
  [
    { id: 'rect', icon: 'rect', label: t('tool.rect', 'Rechteck'), hint: t('tool.rect.hint', 'Rechteck / Markierung zeichnen') },
    { id: 'line', icon: 'line', label: t('tool.line', 'Linie'), hint: t('tool.line.hint', 'Linie zeichnen') },
    { id: 'measure', icon: 'measure', label: t('tool.measure', 'Messen'), hint: t('tool.measure.hint', 'Strecke messen') },
  ],
];

const ToolRail: React.FC<Props> = ({ activeTool, onToolChange }) => {
  const { t } = useTranslation();
  const GROUPS = groupsFor(t);
  return (
  <nav className="toolrail" role="toolbar" aria-label={t('tool.rail', 'Werkzeuge')}>
    {GROUPS.map((group, gi) => (
      <React.Fragment key={gi}>
        {gi > 0 && <div className="toolrail-div" />}
        {group.map((entry) => (
          <button
            key={entry.id}
            className={`toolrail-btn ${activeTool === entry.id ? 'on' : ''}`}
            onClick={() => onToolChange(entry.id)}
            title={`${entry.label} — ${entry.hint}`}
            aria-pressed={activeTool === entry.id}
          >
            <Icon name={entry.icon} size={20} />
            <span className="toolrail-tip">{entry.label}</span>
          </button>
        ))}
      </React.Fragment>
    ))}
  </nav>
  );
};

export default ToolRail;
