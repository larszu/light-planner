import React, { createContext, useContext } from 'react';
import type { HostAdapter } from './hostAdapter';
import { browserHost } from './browserHost';

// Inject a HostAdapter near the app root. Cable-Planner wraps the planner with
// its own adapter; standalone it falls back to the browser adapter.
const HostContext = createContext<HostAdapter>(browserHost);

export const HostProvider: React.FC<{ adapter?: HostAdapter; children: React.ReactNode }> = ({ adapter, children }) => (
  <HostContext.Provider value={adapter ?? browserHost}>{children}</HostContext.Provider>
);

export function useHost(): HostAdapter {
  return useContext(HostContext);
}
