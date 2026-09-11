import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { themaAnwenden } from './lib/thema';

// Das Thema VOR dem ersten Rendern setzen: sonst zeigt die App fuer einen
// Wimpernschlag das Vorgabe-Thema und springt dann um.
themaAnwenden();

// Standalone build → LightPlanner with the default browser HostAdapter.
// A host app instead does: <LightPlanner adapter={hostAdapter} onEquipmentChange={…} />
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
