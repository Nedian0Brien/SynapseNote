import { msg } from '@lingui/core/macro';
import type { SettingsFieldDef, SettingsTranslate } from './settings-types';

function chatModelLabel(value: string): string {
  if (value === 'gpt-5.6-sol') return 'GPT-5.6 Sol';
  if (value === 'gpt-5.6-terra') return 'GPT-5.6 Terra';
  if (value === 'gpt-5.6-luna') return 'GPT-5.6 Luna';
  if (value === 'gpt-5.3-codex-spark') return 'GPT-5.3 Codex Spark';
  if (value === 'fable') return 'Fable';
  if (value === 'opus') return 'Opus';
  if (value === 'sonnet') return 'Sonnet';
  return value;
}

function sidebarOpenBehaviorLabel(value: string, translate: SettingsTranslate): string {
  if (value === 'new-tab') return translate(msg`New tab`);
  if (value === 'current-tab') return translate(msg`Current tab`);
  return value;
}

/** User-scope schema fields. Project fields stay with their owning section. */
export const FIELDS_USER_PREFERENCES: SettingsFieldDef[] = [
  {
    path: ['appearance', 'theme'],
    label: msg`Theme`,
    description: msg`Light, dark, or follow the OS.`,
    control: 'enum-toggle',
  },
  {
    path: ['editor', 'wordWrap'],
    label: msg`Word wrap`,
    description: msg`Wrap long lines in the markdown source editor.`,
  },
  {
    path: ['editor', 'sidebarOpenBehavior'],
    label: msg`Open sidebar documents in`,
    description: msg`Choose whether selecting a document in the left sidebar opens a new tab or replaces the current tab.`,
    control: 'enum-toggle',
    formatOption: sidebarOpenBehaviorLabel,
  },
  {
    path: ['appearance', 'preview', 'autoOpen'],
    label: msg`Open preview when agent edits`,
    description: msg`When enabled, the agent opens or refreshes the preview after each edit. Disable if you manage your own preview window (OK Desktop, a browser tab on another display, etc.).`,
  },
  {
    path: ['agents', 'chat', 'codexModel'],
    label: msg`Default Codex chat model`,
    description: msg`Used when you start a new Codex chat. You can still change the model in the chat composer.`,
    control: 'enum-select',
    formatOption: chatModelLabel,
  },
  {
    path: ['agents', 'chat', 'claudeModel'],
    label: msg`Default Claude chat model`,
    description: msg`Used when you start a new Claude chat. You can still change the model in the chat composer.`,
    control: 'enum-select',
    formatOption: chatModelLabel,
  },
];

export const COMMITTED_DEFAULT_SELECTED_CLASS =
  'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90';
