import { useState } from 'react';

export type InlineDatabaseOverlay =
  | { kind: 'filter'; propertyId?: string }
  | { kind: 'sort'; propertyId?: string }
  | { kind: 'properties' }
  | null;

/**
 * Owns the document-native popovers as one discriminated state. Advanced
 * workspace dialogs intentionally remain outside this state machine: opening
 * an advanced command first closes the local surface and then hands off to
 * the canonical manager.
 */
export function useInlineDatabaseOverlayState() {
  const [overlay, setOverlay] = useState<InlineDatabaseOverlay>(null);
  return {
    overlay,
    openFilter: (propertyId?: string) =>
      setOverlay({ kind: 'filter', ...(propertyId ? { propertyId } : {}) }),
    openSort: (propertyId?: string) =>
      setOverlay({ kind: 'sort', ...(propertyId ? { propertyId } : {}) }),
    openProperties: () => setOverlay({ kind: 'properties' }),
    close: () => setOverlay(null),
  };
}
