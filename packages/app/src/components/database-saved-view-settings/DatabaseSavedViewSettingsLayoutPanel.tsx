import type { ReactNode } from 'react';

/** Owns layout-specific controls while the dialog runtime coordinates drafts. */
export function DatabaseSavedViewSettingsLayoutPanel({ children }: { children: ReactNode }) {
  return (
    <div data-settings-panel="layout" className="contents">
      {children}
    </div>
  );
}
