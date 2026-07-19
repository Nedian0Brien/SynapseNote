import type { CliChatId, CliChatModelSettings, CliChatPermissionMode } from './cli-chat-types';

const STORAGE_KEY = 'synapsenote.cli-chat-preferences.v1';

export interface CliChatPreferences {
  readonly modelSettings?: CliChatModelSettings;
  readonly permissionMode?: CliChatPermissionMode;
}

type StoredPreferences = Partial<Record<CliChatId, CliChatPreferences>>;

const CODEX_MODELS = new Set([
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.3-codex-spark',
]);
const CLAUDE_MODELS = new Set(['fable', 'opus', 'sonnet']);
const CODEX_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const CLAUDE_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

function isPermissionMode(value: unknown): value is CliChatPermissionMode {
  return value === 'read-only' || value === 'workspace-write' || value === 'full-access';
}

function isModelSettings(cli: CliChatId, value: unknown): value is CliChatModelSettings {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const models = cli === 'codex' ? CODEX_MODELS : CLAUDE_MODELS;
  const efforts = cli === 'codex' ? CODEX_EFFORTS : CLAUDE_EFFORTS;
  if (
    typeof candidate.model !== 'string' ||
    !models.has(candidate.model) ||
    typeof candidate.effort !== 'string' ||
    !efforts.has(candidate.effort) ||
    (candidate.speed !== 'default' && candidate.speed !== 'fast')
  ) {
    return false;
  }
  if (cli === 'claude' && candidate.speed !== 'default') return false;
  if (
    candidate.model === 'gpt-5.3-codex-spark' &&
    (candidate.effort === 'max' || candidate.effort === 'ultra' || candidate.speed === 'fast')
  ) {
    return false;
  }
  return candidate.model !== 'gpt-5.6-luna' || candidate.effort !== 'ultra';
}

function readAll(): StoredPreferences {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as StoredPreferences) : {};
  } catch {
    return {};
  }
}

export function readCliChatPreferences(cli: CliChatId): CliChatPreferences | null {
  const stored = readAll()[cli];
  if (stored == null || typeof stored !== 'object') return null;
  const modelSettings = isModelSettings(cli, stored.modelSettings)
    ? stored.modelSettings
    : undefined;
  const permissionMode = isPermissionMode(stored.permissionMode)
    ? stored.permissionMode
    : undefined;
  return modelSettings === undefined && permissionMode === undefined
    ? null
    : { modelSettings, permissionMode };
}

export function writeCliChatPreferences(cli: CliChatId, next: CliChatPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readAll();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, [cli]: next }));
  } catch {
    // Preferences are an enhancement; storage denial must not block chat.
  }
}
