/**
 * Lazy Settings dialog entry point. The dialog shell owns the frame; this
 * component owns only selection-to-panel dispatch.
 */
import { renderSettingsDialogSection } from './settings-dialog/settings-dialog-section-registry';
import type { SettingsDialogBodyProps } from './settings-types';

export function SettingsDialogBody(props: SettingsDialogBodyProps) {
  return renderSettingsDialogSection(props);
}
