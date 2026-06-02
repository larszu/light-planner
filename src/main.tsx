import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { HostProvider } from './integration/hostContext';

// Standalone build → browser HostAdapter. When embedded in a host app, wrap
// <App/> with <HostProvider adapter={hostAdapter}> instead.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HostProvider>
      <App />
    </HostProvider>
  </React.StrictMode>,
);
