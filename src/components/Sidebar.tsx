import React, { useState } from 'react';
import type { Fixture, FixtureCategory } from '../types';
import { fixtureLibrary } from '../core/fixtureLibrary';
import FixtureEditor from './FixtureEditor';

interface Props {
  customFixtures: Fixture[];
  onAddCustomFixture: (f: Fixture) => void;
  fixtureToPlace: Fixture | null;
  onSelectFixtureToPlace: (f: Fixture) => void;
}

const CATEGORY_LABELS: Record<FixtureCategory, string> = {
  profile: 'Profilscheinwerfer',
  fresnel: 'Stufenlinsen',
  par: 'PAR-Scheinwerfer',
  wash: 'LED Wash',
  spot: 'LED Spot',
  beam: 'Beam-Effekt',
  'moving-wash': 'Moving Head Wash',
  'moving-spot': 'Moving Head Spot',
  'moving-beam': 'Moving Head Beam',
  blinder: 'Blinder / Strobe',
  cyc: 'Horizontleuchte',
  flood: 'Fluter',
  followspot: 'Verfolger',
  'led-panel': 'LED-Flächenleuchten',
  custom: 'Eigene',
};

const CATEGORIES: FixtureCategory[] = [
  'profile', 'fresnel', 'par', 'wash', 'spot', 'beam',
  'moving-wash', 'moving-spot', 'moving-beam',
  'blinder', 'cyc', 'flood', 'followspot', 'led-panel', 'custom',
];

const Sidebar: React.FC<Props> = ({
  customFixtures,
  onAddCustomFixture,
  fixtureToPlace,
  onSelectFixtureToPlace,
}) => {
  const [search, setSearch] = useState('');
  const [expandedCat, setExpandedCat] = useState<FixtureCategory | null>(null); // all categories collapsed by default
  const [showEditor, setShowEditor] = useState(false);

  const allFixtures = [...fixtureLibrary, ...customFixtures];
  const filtered = search
    ? allFixtures.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.manufacturer.toLowerCase().includes(search.toLowerCase()),
      )
    : allFixtures;

  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    fixtures: filtered.filter((f) => f.category === cat),
  })).filter((g) => g.fixtures.length > 0);

  // While searching, expand every group that has a match so results aren't
  // hidden inside collapsed categories.
  const searching = search.trim() !== '';

  const handleDragStart = (e: React.DragEvent, fixture: Fixture) => {
    e.dataTransfer.setData('application/fixture', JSON.stringify(fixture));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Leuchten-Bibliothek</h2>
        <span className="sidebar-hint">Drag & Drop oder Klick</span>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="sidebar-list">
        {grouped.map((g) => {
          const expanded = searching || expandedCat === g.category;
          return (
          <div key={g.category} className="fixture-group">
            <button
              className="group-header"
              onClick={() => setExpandedCat(expandedCat === g.category ? null : g.category)}
            >
              <span className="group-arrow">{expanded ? '▾' : '▸'}</span>
              <span>{CATEGORY_LABELS[g.category]}</span>
              <span className="group-count">{g.fixtures.length}</span>
            </button>
            {expanded && (
              <div className="group-items">
                {g.fixtures.map((f) => (
                  <button
                    key={f.id}
                    className={`fixture-item ${fixtureToPlace?.id === f.id ? 'selected' : ''}`}
                    onClick={() => onSelectFixtureToPlace(f)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, f)}
                  >
                    <div className="fixture-item-name">{f.name}</div>
                    <div className="fixture-item-info">
                      {f.manufacturer} · {f.wattage}W · {f.beamAngle}°
                      {f.zoomRange && ` (${f.zoomRange[0]}–${f.zoomRange[1]}°)`}
                    </div>
                    <div className="fixture-item-info">
                      {f.photometric
                        ? `${f.photometric.lux.toLocaleString()} lux@${f.photometric.distance}m`
                        : `${f.lumens.toLocaleString()} lm`}
                      {' · '}
                      {f.colorTempRange
                        ? `${f.colorTempRange[0]}–${f.colorTempRange[1]}K`
                        : f.colorTemp > 0
                        ? `${f.colorTemp}K`
                        : 'RGBW'}
                      · {f.weight}kg
                    </div>
                    {f.compatibleAttachments && f.compatibleAttachments.length > 0 && (
                      <div className="fixture-item-info attachment-hint">
                        🔧 {f.compatibleAttachments.length} Vorsätze verfügbar
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button className="add-fixture-btn" onClick={() => setShowEditor(true)}>
          + Eigene Leuchte anlegen
        </button>
      </div>

      {showEditor && (
        <FixtureEditor
          onSave={(f) => {
            onAddCustomFixture(f);
            setShowEditor(false);
          }}
          onCancel={() => setShowEditor(false)}
        />
      )}
    </div>
  );
};

export default Sidebar;
