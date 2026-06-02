import React, { useEffect } from 'react';
import App from './App';
import { HostProvider } from './integration/hostContext';
import type { HostAdapter } from './integration/hostAdapter';
import { useProjectStore } from './store/projectStore';
import { fixturesToEquipment, type CpEquipmentItem } from './integration/equipment';
import type { LightingDocument } from './store/lightingDocument';

export interface LightPlannerProps {
  /** Platform seam — files / export / AI. Defaults to the browser adapter. */
  adapter?: HostAdapter;
  /** Fires with the live lighting document on every change. */
  onDocumentChange?: (doc: LightingDocument) => void;
  /** Fires with the fixtures mapped to cable-planner equipment on every change. */
  onEquipmentChange?: (equipment: CpEquipmentItem[]) => void;
}

// Embeddable entry point. A host (Cable-Planner) renders this with its own
// HostAdapter and reads the live plan via the callbacks:
//
//   <LightPlanner
//     adapter={createCablePlannerHost({ onSaveDocument, onLoadDocument, aiExtract })}
//     onEquipmentChange={(eq) => eq.forEach(addEquipment)}
//   />
//
// Standalone, main.tsx renders it with the default browser adapter.
const LightPlanner: React.FC<LightPlannerProps> = ({ adapter, onDocumentChange, onEquipmentChange }) => {
  useEffect(() => {
    if (!onDocumentChange && !onEquipmentChange) return;
    const emit = (doc: LightingDocument | null) => {
      if (!doc) return;
      onDocumentChange?.(doc);
      onEquipmentChange?.(fixturesToEquipment(doc.fixtures));
    };
    emit(useProjectStore.getState().document);
    return useProjectStore.subscribe((s) => emit(s.document));
  }, [onDocumentChange, onEquipmentChange]);

  return (
    <HostProvider adapter={adapter}>
      <App />
    </HostProvider>
  );
};

export default LightPlanner;
