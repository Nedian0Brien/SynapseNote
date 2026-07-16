import { shellSingleQuote, TERMINAL_CLIS } from '@inkeep/open-knowledge-core';

export interface CliChatLaunchInput {
  readonly cli: 'codex' | 'claude';
  readonly prompt: string;
  readonly sessionId: string | null;
  readonly permissionMode: 'read-only' | 'workspace-write' | 'full-access';
  readonly modelSettings: {
    readonly model:
      | 'gpt-5.6-sol'
      | 'gpt-5.6-terra'
      | 'gpt-5.6-luna'
      | 'gpt-5.3-codex-spark'
      | 'fable'
      | 'opus'
      | 'sonnet';
    readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'ultra' | 'max';
    readonly speed: 'default' | 'fast';
  };
}

// Reuse the same registry-fixed OpenKnowledge MCP approval policy as the
// interactive Codex handoff instead of maintaining a second config string.
const codexOpenKnowledgeApproval = ` ${TERMINAL_CLIS.codex.autoApproveArg}`;

function codexPermissionArgs(mode: CliChatLaunchInput['permissionMode']): string {
  if (mode === 'full-access') {
    return ` --dangerously-bypass-approvals-and-sandbox${codexOpenKnowledgeApproval}`;
  }
  const sandboxMode = mode === 'read-only' ? 'read-only' : 'workspace-write';
  const mcpApproval = mode === 'workspace-write' ? codexOpenKnowledgeApproval : '';
  return ` -c 'approval_policy="never"' -c 'sandbox_mode="${sandboxMode}"'${mcpApproval}`;
}

function claudePermissionArgs(mode: CliChatLaunchInput['permissionMode']): string {
  if (mode === 'full-access') return ' --dangerously-skip-permissions';
  return mode === 'read-only' ? ' --permission-mode plan' : ' --permission-mode acceptEdits';
}

function codexModelArgs(settings: CliChatLaunchInput['modelSettings']): string {
  const model = ` -m ${shellSingleQuote(settings.model)}`;
  const effort = ` -c ${shellSingleQuote(`model_reasoning_effort="${settings.effort}"`)}`;
  const speed =
    settings.speed === 'fast' ? ` -c 'service_tier="fast"' -c 'features.fast_mode=true'` : '';
  return `${model}${effort}${speed}`;
}

function claudeModelArgs(settings: CliChatLaunchInput['modelSettings']): string {
  const model = ` --model ${shellSingleQuote(settings.model)}`;
  const effort = ` --effort ${shellSingleQuote(settings.effort)}`;
  return `${model}${effort}`;
}

/**
 * Commands are written through an interactive PTY, where readline handles C0
 * bytes before the shell can apply quoting. Keep the payload printable at that
 * boundary while preserving human-readable line breaks for the model.
 */
function printablePtyArgument(value: string): string {
  const normalized = value
    .replaceAll('\r\n', '\u2028')
    .replaceAll('\r', '\u2028')
    .replaceAll('\n', '\u2028')
    .replaceAll('\t', '  ');
  return Array.from(normalized, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? '\uFFFD' : character;
  }).join('');
}

/**
 * Build a structured-output command from a closed CLI discriminant. This runs
 * in main so the renderer never supplies an executable string to the PTY.
 */
export function buildCliChatCommand(input: CliChatLaunchInput): string {
  const quotedPrompt = shellSingleQuote(printablePtyArgument(input.prompt));
  const quotedSessionId =
    input.sessionId === null ? null : shellSingleQuote(printablePtyArgument(input.sessionId));
  if (input.cli === 'codex') {
    const permissions = codexPermissionArgs(input.permissionMode);
    const model = codexModelArgs(input.modelSettings);
    return input.sessionId === null
      ? `codex exec --json --color never${permissions}${model} ${quotedPrompt}`
      : `codex exec resume --json${permissions}${model} ${quotedSessionId} ${quotedPrompt}`;
  }
  const permissions = claudePermissionArgs(input.permissionMode);
  const model = claudeModelArgs(input.modelSettings);
  const resume = quotedSessionId === null ? '' : ` --resume ${quotedSessionId}`;
  return `claude --print --verbose --output-format stream-json --include-partial-messages${permissions}${model}${resume} ${quotedPrompt}`;
}

const CODEX_MODELS = new Set([
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.3-codex-spark',
]);
const CLAUDE_MODELS = new Set(['fable', 'opus', 'sonnet']);
const CODEX_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const CLAUDE_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

function hasValidModelSettings(
  cli: CliChatLaunchInput['cli'],
  value: unknown,
): value is CliChatLaunchInput['modelSettings'] {
  if (typeof value !== 'object' || value === null) return false;
  const settings = value as Record<string, unknown>;
  const models = cli === 'codex' ? CODEX_MODELS : CLAUDE_MODELS;
  const efforts = cli === 'codex' ? CODEX_EFFORTS : CLAUDE_EFFORTS;
  const validShape =
    typeof settings.model === 'string' &&
    models.has(settings.model) &&
    typeof settings.effort === 'string' &&
    efforts.has(settings.effort) &&
    (settings.speed === 'default' || (cli === 'codex' && settings.speed === 'fast'));
  if (!validShape || cli === 'claude') return validShape;
  if (
    settings.model === 'gpt-5.3-codex-spark' &&
    (settings.effort === 'max' || settings.effort === 'ultra' || settings.speed === 'fast')
  ) {
    return false;
  }
  return settings.model !== 'gpt-5.6-luna' || settings.effort !== 'ultra';
}

/** Runtime guard at the renderer/main trust boundary. */
export function isCliChatLaunchInput(value: unknown): value is CliChatLaunchInput {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.cli === 'codex' || candidate.cli === 'claude') &&
    typeof candidate.prompt === 'string' &&
    (candidate.sessionId === null || typeof candidate.sessionId === 'string') &&
    hasValidModelSettings(candidate.cli, candidate.modelSettings) &&
    (candidate.permissionMode === 'read-only' ||
      candidate.permissionMode === 'workspace-write' ||
      candidate.permissionMode === 'full-access')
  );
}
