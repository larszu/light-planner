import React from 'react';
import ReactDOM from 'react-dom/client';
import LightPlanner from './LightPlanner';

// Standalone build → LightPlanner with the default browser HostAdapter.
// A host app instead does: <LightPlanner adapter={hostAdapter} onEquipmentChange={…} />
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LightPlanner />
  </React.StrictMode>,
);
