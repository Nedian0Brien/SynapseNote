import type { MessageDescriptor } from '@lingui/core';
import type { useLingui } from '@lingui/react/macro';
import type { ConfigBinding, OkignoreBinding } from '@nedian0brien/synapsenote-core';

export type SettingsScope = 'user' | 'project';
export type SettingsTranslate = ReturnType<typeof useLingui>['t'];

/** Schema-backed field metadata consumed by the generic settings controls. */
export interface SettingsFieldDef {
  path: string[];
  label: MessageDescriptor;
  description?: MessageDescriptor;
  control?: 'enum-toggle' | 'enum-select';
  formatOption?: (value: string, translate: SettingsTranslate) => string;
}

export interface SettingsDialogBodyProps {
  activeId: string;
  userBinding: ConfigBinding | null;
  okignoreBinding: OkignoreBinding | null;
  okignoreSynced: boolean;
}
