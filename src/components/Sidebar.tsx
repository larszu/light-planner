import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import type { Fixture, FixtureCategory } from '../types';
import { fixtureLibrary } from '../core/fixtureLibrary';
import FixtureEditor from './FixtureEditor';
import { format, useTranslation, translate } from '../i18n';
import { useDeviceLibrary } from '../store/deviceLibraryStore';
import { deviceUrl } from '../core/deviceLibraryClient';
import DeviceLibraryProposeDialog from './DeviceLibraryProposeDialog';
import { libraryStatusText } from './deviceLibraryText';

interface Props {
  customFixtures: Fixture[];
  onAddCustomFixture: (f: Fixture) => void;
  fixtureToPlace: Fixture | null;
  onSelectFixtureToPlace: (f: Fixture) => void;
}

/**
 * Der Name einer Kategorie — EIN `translate`-Aufruf je Kategorie, mit dem
 * englischen Quelltext daneben.
 *
 * VORHER STAND HIER EINE MAP deutscher Formen, aus der ein einziger Aufruf
 * `translate(language, \`fixtureCategory.${cat}\`, CATEGORY_LABELS[cat])`
 * seinen Fallback zog. Zwei Dinge waren daran falsch, und beide fielen erst
 * im Browser auf (B-77, Bildschirmfoto bei 1440 px):
 *
 *   1. DIE BIBLIOTHEK STAND AUF DEUTSCH, AUCH AUF ENGLISCH. Der Schluessel
 *      `fixtureCategory.*` kam in `i18n/de.ts` NIE vor — dort heisst dieselbe
 *      Sache `fx.cat.*`, wie sie der Leuchten-Editor schon benutzt. Zwei
 *      Schluesselfamilien fuer denselben Begriff, und die eine davon leer:
 *      der Aufruf fiel also immer auf die deutsche Form zurueck. Auf Englisch
 *      las die Liste „Profilscheinwerfer, Stufenlinsen, PAR-Scheinwerfer".
 *   2. DER WAECHTER SAH ES NICHT. `lang:check` liest den Fallback als
 *      LITERAL am Aufruf (`fallbackMuster`). Steht dort ein Ausdruck
 *      (`CATEGORY_LABELS[cat]`), misst er nichts — und meldete „0 deutsch"
 *      ueber fuenfzehn deutsche Beschriftungen. Genau davor warnt CLAUDE.md
 *      mit „nie hinter einem Hilfsmodul verstecken".
 *
 * Die Wiederholung ist deshalb der Punkt und kein Schoenheitsfehler: jede
 * Zeile ist eine, die der Waechter zaehlen kann.
 */
const categoryLabel = (language: 'de' | 'en', cat: FixtureCategory): string => {
  switch (cat) {
    case 'profile': return translate(language, 'fx.cat.profile', 'Profile spot');
    case 'fresnel': return translate(language, 'fx.cat.fresnel', 'Fresnel');
    case 'par': return translate(language, 'fx.cat.par', 'PAR can');
    case 'wash': return translate(language, 'fx.cat.wash', 'LED wash');
    case 'spot': return translate(language, 'fx.cat.spot', 'LED spot');
    case 'beam': return translate(language, 'fx.cat.beam', 'Beam effect');
    case 'moving-wash': return translate(language, 'fx.cat.movingWash', 'Moving head wash');
    case 'moving-spot': return translate(language, 'fx.cat.movingSpot', 'Moving head spot');
    case 'moving-beam': return translate(language, 'fx.cat.movingBeam', 'Moving head beam');
    case 'blinder': return translate(language, 'fx.cat.blinder', 'Blinder / strobe');
    case 'cyc': return translate(language, 'fx.cat.cyc', 'Cyc light');
    case 'flood': return translate(language, 'fx.cat.flood', 'Flood');
    case 'followspot': return translate(language, 'fx.cat.followspot', 'Followspot');
    case 'led-panel': return translate(language, 'fx.cat.ledPanel', 'LED panel');
    case 'custom': return translate(language, 'fx.cat.custom', 'Custom');
  }
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
  const { t, language } = useTranslation();
  const [search, setSearch] = useState('');
  const [expandedCat, setExpandedCat] = useState<FixtureCategory | null>(null); // all categories collapsed by default
  const [showEditor, setShowEditor] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const libInit = useDeviceLibrary((s) => s.init);
  const libEntries = useDeviceLibrary((s) => s.cache.entries);
  const libServer = useDeviceLibrary((s) => s.server);
  useEffect(() => {
    void libInit();
  }, [libInit]);

  const matches = (f: Fixture) =>
    !search ||
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.manufacturer.toLowerCase().includes(search.toLowerCase());

  // Die Bibliothek ist eine eigene, schreibgeschuetzte Quelle: sie steht als
  // eigene Gruppe und mischt sich nicht in die Kategorien des Katalogs.
  const libFiltered = libEntries.filter((e) => matches(e.fixture));
  const allFixtures = [...fixtureLibrary, ...customFixtures];
  const filtered = allFixtures.filter(matches);

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
        <h2>{t('sidebar.title', 'Fixture library')}</h2>
        <span className="sidebar-hint">{t('sidebar.hint', 'Drag & drop or click')}</span>
      </div>

      <div className="sidebar-search">
        {/* `aria-label` und nicht nur `placeholder` (B-77): der Platzhalter
            verschwindet, sobald jemand tippt — danach ist das Feld fuer einen
            Screenreader namenlos. Es war das einzige Feld dieser App ohne
            Namen; `bedienbar:check` in der Suite misst genau das. */}
        <input
          type="text"
          aria-label={t('sidebar.search', 'Search…')}
          placeholder={t('sidebar.search', 'Search…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="sidebar-list">
        {libFiltered.length > 0 && (
          <div className="fixture-group">
            <button className="group-header" onClick={() => setLibOpen(!libOpen)}>
              <span className="group-arrow">{searching || libOpen ? '▾' : '▸'}</span>
              <span>{t('devlib.group', 'Device library')}</span>
              <span className="group-count">{libFiltered.length}</span>
            </button>
            {(searching || libOpen) && (
              <div className="group-items">
                {libFiltered.map(({ slug, status, confirmations, fixture: f }) => (
                  <div key={slug} className="devlib-item">
                    <button
                      className={`fixture-item ${fixtureToPlace?.id === f.id ? 'selected' : ''}`}
                      onClick={() => onSelectFixtureToPlace(f)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, f)}
                    >
                      <div className="fixture-item-name">{f.name}</div>
                      <div className="fixture-item-info">
                        {f.manufacturer} · {categoryLabel(language, f.category)} · {f.wattage}W · {f.beamAngle}°
                      </div>
                      <div className="fixture-item-info">
                        {libraryStatusText(t, status)} · {format(t('devlib.confirmations', '{n} confirmations'), { n: confirmations })}
                      </div>
                    </button>
                    <a
                      className="devlib-link"
                      href={deviceUrl(libServer, slug)}
                      target="_blank"
                      rel="noreferrer"
                      title={t('devlib.openEntry', 'Open in the device library')}
                      aria-label={t('devlib.openEntry', 'Open in the device library')}
                    >
                      ↗
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {grouped.map((g) => {
          const expanded = searching || expandedCat === g.category;
          return (
          <div key={g.category} className="fixture-group">
            <button
              className="group-header"
              onClick={() => setExpandedCat(expandedCat === g.category ? null : g.category)}
            >
              <span className="group-arrow">{expanded ? '▾' : '▸'}</span>
              <span>{categoryLabel(language, g.category)}</span>
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
                        <Icon name="group" size={11} /> {f.compatibleAttachments.length}{' '}
                        {t('sidebar.attachments', 'accessories available')}
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
          {t('sidebar.addCustom', '+ Add custom fixture')}
        </button>
        <button className="add-fixture-btn devlib-propose-btn" onClick={() => setShowPropose(true)}>
          {t('devlib.propose.button', 'Submit to device library…')}
        </button>
      </div>

      {showPropose && (
        <DeviceLibraryProposeDialog fixtures={customFixtures} onClose={() => setShowPropose(false)} />
      )}

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
