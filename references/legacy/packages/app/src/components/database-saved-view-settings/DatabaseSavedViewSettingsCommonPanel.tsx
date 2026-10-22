import type { ReactNode } from 'react';

/**
 * Stable ownership boundary for view-wide settings (opening, query, and
 * projection controls). The runtime owns state; this panel owns the shared
 * presentation region so the remaining settings can be extracted without
 * changing the dialog contract.
 */
export function DatabaseSavedViewSettingsCommonPanel({ children }: { children: ReactNode }) {
  return (
    <div data-settings-panel="common" className="contents">
      {children}
    </div>
  );
}
