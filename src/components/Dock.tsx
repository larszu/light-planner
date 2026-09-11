import React, { useState } from 'react';
import type { Fixture, Layers, LayerKey, Scene } from '../types';
import Sidebar from './Sidebar';
import LayersPanel from './LayersPanel';
import ScenePanel from './ScenePanel';
import Icon, { type IconName } from './Icon';
import { useTranslation } from '../i18n';

interface Props {
  // Library (Bibliothek)
  customFixtures: Fixture[];
  fixtureToPlace: Fixture | null;
  onAddCustomFixture: (f: Fixture) => void;
  onSelectFixtureToPlace: (f: Fixture) => void;
  // Layers (Ebenen)
  layers: Layers;
  layerCounts: Record<LayerKey, number>;
  onToggleLayerVisible: (k: LayerKey) => void;
  onToggleLayerLocked: (k: LayerKey) => void;
  // Scenes (Szenen)
  scenes: Scene[];
  activeSceneId: string | null;
  hiddenCount: number;
  fixtureCount: number;
  onSaveScene: () => void;
  onToggleScene: (id: string) => void;
  onUpdateScene: (id: string) => void;
  onRenameScene: (id: string, name: string) => void;
  onDeleteScene: (id: string) => void;
  onShowAll: () => void;
  // Bedarf 132 — verschieben und ein-/ausruecken. Das Dock reicht nur durch.
  onMoveScene: (id: string, direction: 'up' | 'down') => void;
  onReparentScene: (id: string, parentId: string | null) => void;
  onCaptureActual: (id: string, griff: 'start' | 'ende') => void;
  onSetPlanned: (id: string, minuten: number | null) => void;
}

type TabId = 'library' | 'layers' | 'scenes';

/**
 * Die drei Register der linken Spalte.
 *
 * SCHLUESSEL UND ENGLISCHE QUELLE, nicht der fertige Text: bis zum
 * 2026-09-11 stand hier `label: 'Bibliothek'` und wurde roh gerendert. In
 * einer App, deren Quellsprache seit E-28 Englisch ist, waren das drei
 * unuebersetzbare deutsche Beschriftungen — an der am besten sichtbaren
 * Stelle der Oberflaeche.
 *
 * `lang:check` hat sie nicht gesehen, und das mit System: seine eine Haelfte
 * liest `t('key', 'Text')` WOERTLICH (hier stand gar kein `t`), die andere
 * zaehlt sichtbaren JSX-Text (ein Eintrag in einer Konstante ist keiner).
 * Der Eintrag fiel damit in die Luecke zwischen beiden Messungen. */
const TABS: { id: TabId; icon: IconName }[] = [
  { id: 'library', icon: 'library' },
  { id: 'layers', icon: 'layers' },
  { id: 'scenes', icon: 'scene' },
];

// Single left dock with tabs — replaces the separate library sidebar, the
// floating layers panel and the floating scenes panel.
const Dock: React.FC<Props> = (p) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>('library');

  /**
   * Die Beschriftung eines Registers.
   *
   * Die drei `t()`-Aufrufe stehen AUSGESCHRIEBEN da und nicht als
   * `t(reiter.key, reiter.quelle)` aus der Tabelle. Der erste Anlauf tat
   * genau das, und `i18n:check` fiel: der Lauf liest Quelltext, und ein
   * Schluessel, der erst zur Laufzeit entsteht, ist fuer ihn kein
   * Schluessel. Er meldete prompt „Ohne deutsche Fassung: key".
   *
   * Das ist dieselbe Regel, die in den kleinen Repos der Suite in der
   * CLAUDE.md steht: `t()` nie hinter einem Helfer. Der Preis ist eine
   * Verzweigung, der Gegenwert ist ein Waechter, der etwas sieht.
   */
  const reiterText = (id: TabId) =>
    id === 'library'
      ? t('dock.library', 'Library')
      : id === 'layers'
        ? t('dock.layers', 'Layers')
        : t('dock.scenes', 'Scenes');
  const sceneBadge = p.scenes.length;
  return (
    <aside className="dock">
      <div className="dock-tabs" role="tablist">
        {/* Die Schleifenvariable hiess `t` und haette den Uebersetzer
            verdeckt — genau die Falle, die im `inventory-planner` schon
            einmal zugeschnappt ist. Sie heisst jetzt `reiter`. */}
        {TABS.map((reiter) => (
          <button key={reiter.id} role="tab" aria-selected={tab === reiter.id}
            className={`dock-tab ${tab === reiter.id ? 'on' : ''}`} onClick={() => setTab(reiter.id)}>
            <Icon name={reiter.icon} size={15} />
            <span>{reiterText(reiter.id)}</span>
            {reiter.id === 'scenes' && sceneBadge > 0 && <span className="dock-badge">{sceneBadge}</span>}
          </button>
        ))}
      </div>
      <div className="dock-body">
        {tab === 'library' && (
          <Sidebar
            customFixtures={p.customFixtures}
            fixtureToPlace={p.fixtureToPlace}
            onAddCustomFixture={p.onAddCustomFixture}
            onSelectFixtureToPlace={p.onSelectFixtureToPlace}
          />
        )}
        {tab === 'layers' && (
          <LayersPanel
            layers={p.layers}
            counts={p.layerCounts}
            onToggleVisible={p.onToggleLayerVisible}
            onToggleLocked={p.onToggleLayerLocked}
          />
        )}
        {tab === 'scenes' && (
          <ScenePanel
            scenes={p.scenes}
            activeSceneId={p.activeSceneId}
            hiddenCount={p.hiddenCount}
            fixtureCount={p.fixtureCount}
            onSaveScene={p.onSaveScene}
            onToggleScene={p.onToggleScene}
            onUpdateScene={p.onUpdateScene}
            onRenameScene={p.onRenameScene}
            onDeleteScene={p.onDeleteScene}
            onShowAll={p.onShowAll}
            onMoveScene={p.onMoveScene}
            onReparentScene={p.onReparentScene}
            onCaptureActual={p.onCaptureActual}
            onSetPlanned={p.onSetPlanned}
          />
        )}
      </div>
    </aside>
  );
};

export default Dock;
