import React from 'react';
import type { Tool } from '../types';
import Icon, { type IconName } from './Icon';

interface Props {
  activeTool: Tool;
  onToolChange: (t: Tool) => void;
}

// Vertical tool rail — *only* drawing/placement tools (verbs). View modes,
// render settings and file actions live in the top bar; contextual actions
// (align, auto-light) appear over the canvas when relevant.
type Entry = { id: Tool; icon: IconName; label: string; hint: string };
type Group = Entry[];

const GROUPS: Group[] = [
  [
    { id: 'select', icon: 'select', label: 'Auswahl', hint: 'Auswählen & bewegen — V' },
    { id: 'pan', icon: 'pan', label: 'Ansicht', hint: 'Ansicht verschieben — Leertaste/H' },
  ],
  [
    { id: 'person', icon: 'person', label: 'Person', hint: 'Person platzieren' },
    { id: 'stage', icon: 'podium', label: 'Podest', hint: 'Podest (rechteckig) zeichnen' },
    { id: 'stagepoly', icon: 'stage', label: 'Bühne', hint: 'Bühne als Polygon zeichnen' },
    { id: 'truss', icon: 'truss', label: 'Traverse', hint: 'Traverse ziehen' },
    { id: 'wall', icon: 'wall', label: 'Wand', hint: 'Wand-Pfad zeichnen' },
    { id: 'camera', icon: 'camera', label: 'Kamera', hint: 'Kamera-Standpunkt setzen (kein Foto-Modus)' },
  ],
  [
    { id: 'rect', icon: 'rect', label: 'Rechteck', hint: 'Rechteck / Markierung zeichnen' },
    { id: 'line', icon: 'line', label: 'Linie', hint: 'Linie zeichnen' },
    { id: 'measure', icon: 'measure', label: 'Messen', hint: 'Strecke messen' },
  ],
];

const ToolRail: React.FC<Props> = ({ activeTool, onToolChange }) => (
  <nav className="toolrail" role="toolbar" aria-label="Werkzeuge">
    {GROUPS.map((group, gi) => (
      <React.Fragment key={gi}>
        {gi > 0 && <div className="toolrail-div" />}
        {group.map((t) => (
          <button
            key={t.id}
            className={`toolrail-btn ${activeTool === t.id ? 'on' : ''}`}
            onClick={() => onToolChange(t.id)}
            title={`${t.label} — ${t.hint}`}
            aria-pressed={activeTool === t.id}
          >
            <Icon name={t.icon} size={20} />
            <span className="toolrail-tip">{t.label}</span>
          </button>
        ))}
      </React.Fragment>
    ))}
  </nav>
);

export default ToolRail;
