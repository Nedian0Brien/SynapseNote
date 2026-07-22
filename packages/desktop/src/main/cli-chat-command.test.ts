import { describe, expect, test } from 'bun:test';
import {
  buildCliChatCommand,
  buildCliChatShellCommand,
  type CliChatLaunchInput,
} from './cli-chat-command.ts';

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

  test('adds a structured shell completion fail-safe', () => {
    const command = buildCliChatShellCommand('codex exec --json test');
    expect(command).toContain('synapsenote.command_completed');
    expect(command).toContain('"$?"');
  });
});
