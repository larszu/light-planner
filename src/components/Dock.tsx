import React, { useState } from 'react';
import type { Fixture, Layers, LayerKey, Scene } from '../types';
import Sidebar from './Sidebar';
import LayersPanel from './LayersPanel';
import ScenePanel from './ScenePanel';
import Icon, { type IconName } from './Icon';

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
}

type TabId = 'library' | 'layers' | 'scenes';
const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'library', label: 'Bibliothek', icon: 'library' },
  { id: 'layers', label: 'Ebenen', icon: 'layers' },
  { id: 'scenes', label: 'Szenen', icon: 'scene' },
];

// Single left dock with tabs — replaces the separate library sidebar, the
// floating layers panel and the floating scenes panel.
const Dock: React.FC<Props> = (p) => {
  const [tab, setTab] = useState<TabId>('library');
  const sceneBadge = p.scenes.length;
  return (
    <aside className="dock">
      <div className="dock-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={`dock-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={15} />
            <span>{t.label}</span>
            {t.id === 'scenes' && sceneBadge > 0 && <span className="dock-badge">{sceneBadge}</span>}
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
          />
        )}
      </div>
    </aside>
  );
};

export default Dock;
