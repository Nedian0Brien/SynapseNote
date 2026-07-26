import { describe, expect, test } from 'bun:test';
import {
  buildCliChatCommand,
  buildCliChatShellCommand,
  type CliChatLaunchInput,
} from './cli-chat-command.ts';
import { SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS } from './cli-chat-system-instructions.ts';

const input: CliChatLaunchInput = {
  cli: 'codex',
  prompt: 'Reply OK',
  sessionId: null,
  permissionMode: 'workspace-write',
  modelSettings: {
    model: 'gpt-5.6-luna',
    effort: 'medium',
    speed: 'fast',
  },
};

describe('CLI chat command', () => {
  test('does not create a partial Codex MCP server override by default', () => {
    const command = buildCliChatCommand(input);
    expect(command).not.toContain('mcp_servers.synapsenote');
  });

  test('adds the Codex MCP approval override only after the server is confirmed', () => {
    const command = buildCliChatCommand(input, { autoApproveOkTools: true });
    expect(command).toContain('mcp_servers.synapsenote.default_tools_approval_mode');
  });

  test('forces read-only filesystem access in data-plane-only deployment mode', () => {
    const command = buildCliChatCommand(
      { ...input, permissionMode: 'full-access' },
      { autoApproveOkTools: true, dataPlaneOnlyWrites: true },
    );
    expect(command).toContain('sandbox_mode="read-only"');
    expect(command).toContain('mcp_servers.synapsenote.default_tools_approval_mode');
    expect(command).not.toContain('dangerously-bypass-approvals-and-sandbox');
    expect(command).not.toContain('sandbox_mode="workspace-write"');
  });

  test('reuses the guarded Claude MCP trust and tool approval policy', () => {
    const command = buildCliChatCommand(
      {
        ...input,
        cli: 'claude',
        modelSettings: { model: 'sonnet', effort: 'medium', speed: 'default' },
      },
      { autoApproveOkTools: true, mcpPreApprove: true },
    );
    expect(command).toContain('enabledMcpjsonServers');
    expect(command).toContain('mcp__synapsenote');
    expect(command).toContain('mcp__synapsenote__delete');
  });

  test('does not add the write-capable Claude allow rule in read-only mode', () => {
    const command = buildCliChatCommand(
      {
        ...input,
        cli: 'claude',
        permissionMode: 'read-only',
        modelSettings: { model: 'sonnet', effort: 'medium', speed: 'default' },
      },
      { autoApproveOkTools: true, mcpPreApprove: true },
    );
    expect(command).toContain('enabledMcpjsonServers');
    expect(command).not.toContain('permissions');
  });

  test('injects SynapseNote knowledge guidance as Codex developer instructions', () => {
    const command = buildCliChatCommand(input);
    expect(command).toContain('developer_instructions=');
    expect(command).toContain('SynapseNote knowledge steward');
    expect(command).toContain('Reply OK');
  });

  test('appends the same guidance to Claude system instructions', () => {
    const command = buildCliChatCommand({
      ...input,
      cli: 'claude',
      modelSettings: { model: 'sonnet', effort: 'medium', speed: 'default' },
    });
    expect(command).toContain('--append-system-prompt');
    expect(command).toContain('SynapseNote knowledge steward');
    expect(command).toContain('Reply OK');
  });

  test('keeps system guidance on resumed conversations', () => {
    const command = buildCliChatCommand({ ...input, sessionId: 'session-123' });
    expect(command).toContain('codex exec resume');
    expect(command).toContain('developer_instructions=');
  });

  test('system guidance remains corpus-agnostic and defers to project structure', () => {
    expect(SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS).toContain('Discover the configured content root');
    expect(SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS).toContain('Do not create `raw/`, `wiki/`');
    expect(SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS).toContain('obtain explicit user approval');
    expect(SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS).toContain('do not mutate the workspace');
  });

  test('prefers injected current-document context, then SynapseNote, over screen history', () => {
    expect(SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS).toContain(
      'include a `<current_document>` block supplied by SynapseNote',
    );
    expect(SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS).toContain(
      'use the SynapseNote `current_document` MCP tool first',
    );
    expect(SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS).toContain('Never substitute Chronicle');
    expect(SYNAPSENOTE_CHAT_SYSTEM_INSTRUCTIONS).toContain('instead of guessing');
  });

  test('adds a structured shell completion fail-safe', () => {
    const command = buildCliChatShellCommand('codex exec --json test');
    expect(command).toContain('synapsenote.command_completed');
    expect(command).toContain('"$?"');
  });
});
