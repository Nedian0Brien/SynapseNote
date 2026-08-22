import {
  buildClaudeSettingsArg,
  shellSingleQuote,
  TERMINAL_CLIS,
} from '@nedian0brien/synapsenote-core';
import { SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS } from './cli-chat-system-instructions.ts';

export interface CliChatLaunchInput {
  readonly cli: 'codex' | 'claude';
  readonly prompt: string;
  readonly sessionId: string | null;
  readonly permissionMode: 'read-only' | 'workspace-write' | 'full-access';
  readonly autoApproveOkTools?: boolean;
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

export interface CliChatCommandOptions {
  /**
   * Codex's per-server approval override is only valid when the named MCP
   * server already exists in the user's global config. A partial `-c` override
   * makes Codex reject its entire config before emitting structured events.
   */
  readonly autoApproveOkTools?: boolean;
  /** Force a read-only filesystem; the paired MCP server exposes only Data Plane tools. */
  readonly dataPlaneOnlyWrites?: boolean;
  /** Trust the project-local Claude MCP entry only after main verifies it is
   * SynapseNote's own managed configuration. */
  readonly mcpPreApprove?: boolean;
}

// Reuse the same registry-fixed SynapseNote MCP approval policy as the
// interactive Codex handoff instead of maintaining a second config string.
const codexSynapseNoteApproval = ` ${TERMINAL_CLIS.codex.autoApproveArg}`;

function codexPermissionArgs(
  mode: CliChatLaunchInput['permissionMode'],
  autoApproveOkTools: boolean,
  dataPlaneOnlyWrites: boolean,
): string {
  const mcpApproval = autoApproveOkTools ? codexSynapseNoteApproval : '';
  if (mode === 'full-access') {
    return ` --dangerously-bypass-approvals-and-sandbox${mcpApproval}`;
  }
  const sandboxMode = mode === 'read-only' ? 'read-only' : 'workspace-write';
  const workspaceMcpApproval = mode === 'workspace-write' || dataPlaneOnlyWrites ? mcpApproval : '';
  return ` -c 'approval_policy="never"' -c 'sandbox_mode="${sandboxMode}"'${workspaceMcpApproval}`;
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
 * Apply the same product guidance at each one-shot invocation. Both CLIs
 * reconstruct their request context when resuming a saved session, so the
 * instruction must ride on fresh and resumed commands alike.
 */
function systemInstructionArgs(cli: CliChatLaunchInput['cli']): string {
  const printable = printablePtyArgument(SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS);
  if (cli === 'codex') {
    const tomlString = JSON.stringify(printable);
    return ` -c ${shellSingleQuote(`developer_instructions=${tomlString}`)}`;
  }
  return ` --append-system-prompt ${shellSingleQuote(printable)}`;
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
export function buildCliChatCommand(
  input: CliChatLaunchInput,
  options: CliChatCommandOptions & { readonly promptViaStdin?: boolean } = {},
): string {
  const permissionMode = options.dataPlaneOnlyWrites === true ? 'read-only' : input.permissionMode;
  const quotedPrompt = shellSingleQuote(printablePtyArgument(input.prompt));
  const promptInput =
    options.promptViaStdin === true ? (input.cli === 'codex' ? ' -' : '') : ` ${quotedPrompt}`;
  const quotedSessionId =
    input.sessionId === null ? null : shellSingleQuote(printablePtyArgument(input.sessionId));
  if (input.cli === 'codex') {
    const permissions = codexPermissionArgs(
      permissionMode,
      options.autoApproveOkTools === true,
      options.dataPlaneOnlyWrites === true,
    );
    const model = codexModelArgs(input.modelSettings);
    const systemInstructions = systemInstructionArgs(input.cli);
    return input.sessionId === null
      ? `codex exec --json --color never${permissions}${model}${systemInstructions}${promptInput}`
      : `codex exec resume --json${permissions}${model}${systemInstructions} ${quotedSessionId}${promptInput}`;
  }
  const permissions = claudePermissionArgs(permissionMode);
  const claudeSettings = buildClaudeSettingsArg({
    mcpPreApprove: options.mcpPreApprove === true,
    // Read-only must never inherit the write-capable MCP allow rule. Full
    // access already carries Claude's explicit permission bypass.
    autoApproveOkTools: permissionMode === 'workspace-write' && options.autoApproveOkTools === true,
  });
  const settings = claudeSettings === '' ? '' : ` ${claudeSettings}`;
  const model = claudeModelArgs(input.modelSettings);
  const systemInstructions = systemInstructionArgs(input.cli);
  const resume = quotedSessionId === null ? '' : ` --resume ${quotedSessionId}`;
  return `claude --print --verbose --output-format stream-json --include-partial-messages${permissions}${settings}${model}${systemInstructions}${resume}${promptInput}`;
}

/**
 * Keep the interactive shell PTY alive while still reporting that the one-shot
 * CLI command itself returned. Codex/Claude normally emit their own structured
 * completion event; this sentinel is a fail-safe for startup/config failures
 * that only print plain stderr and would otherwise leave Chat spinning forever.
 */
export function buildCliChatShellCommand(command: string): string {
  return `${command}; printf '\\n{"type":"synapsenote.command_completed","exit_code":%d}\\n' "$?"`;
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
    (candidate.autoApproveOkTools === undefined ||
      typeof candidate.autoApproveOkTools === 'boolean') &&
    hasValidModelSettings(candidate.cli, candidate.modelSettings) &&
    (candidate.permissionMode === 'read-only' ||
      candidate.permissionMode === 'workspace-write' ||
      candidate.permissionMode === 'full-access')
  );
}
