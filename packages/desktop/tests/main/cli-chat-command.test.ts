import { describe, expect, test } from 'bun:test';
import { buildCliChatCommand, isCliChatLaunchInput } from '../../src/main/cli-chat-command';

const codexModelSettings = {
  model: 'gpt-5.6-sol',
  effort: 'medium',
  speed: 'default',
} as const;
const claudeModelSettings = { model: 'sonnet', effort: 'medium', speed: 'default' } as const;

describe('CLI chat command boundary', () => {
  test('cannot widen a data-plane-only launch through renderer permission input', () => {
    const command = buildCliChatCommand(
      {
        cli: 'codex',
        prompt: 'update the database',
        sessionId: null,
        permissionMode: 'full-access',
        modelSettings: codexModelSettings,
      },
      { autoApproveOkTools: true, dataPlaneOnlyWrites: true },
    );
    expect(command).toContain('sandbox_mode="read-only"');
    expect(command).not.toContain('dangerously-bypass-approvals-and-sandbox');
  });

  test('quotes prompts and resumes without accepting a free-form executable', () => {
    const codex = buildCliChatCommand({
      cli: 'codex',
      prompt: "don't run $(oops)",
      sessionId: null,
      permissionMode: 'workspace-write',
      modelSettings: codexModelSettings,
    });
    expect(codex).toStartWith(
      "codex exec --json --color never -c 'approval_policy=\"never\"' -c 'sandbox_mode=\"workspace-write\"' -m 'gpt-5.6-sol' -c 'model_reasoning_effort=\"medium\"' -c 'developer_instructions=",
    );
    expect(codex).toEndWith(" 'don'\\''t run $(oops)'");

    const claude = buildCliChatCommand({
      cli: 'claude',
      prompt: 'next',
      sessionId: 'session-id',
      permissionMode: 'read-only',
      modelSettings: claudeModelSettings,
    });
    expect(claude).toContain("--permission-mode plan --model 'sonnet' --effort 'medium'");
    expect(claude).toContain("--append-system-prompt '");
    expect(claude).toEndWith(" --resume 'session-id' 'next'");
  });

  test('omits the Claude positional prompt when stdin transport is selected', () => {
    const prompt = "document: don't run $(oops)";
    const command = buildCliChatCommand(
      {
        cli: 'claude',
        prompt,
        sessionId: 'session-id',
        permissionMode: 'read-only',
        modelSettings: claudeModelSettings,
      },
      { promptViaStdin: true },
    );
    expect(command).toContain("--resume 'session-id'");
    expect(command).not.toContain(prompt);
    expect(command).not.toContain('$(oops)');
    expect(command.endsWith("'session-id'")).toBe(true);
  });

  test('keeps terminal control bytes out of the interactive command', () => {
    const command = buildCliChatCommand({
      cli: 'codex',
      prompt: 'first\nsecond\u0003touch /tmp/nope',
      sessionId: 'thread\u0004-id',
      permissionMode: 'read-only',
      modelSettings: codexModelSettings,
    });

    expect(
      Array.from(command).every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint > 31 && codePoint !== 127;
      }),
    ).toBe(true);
    expect(command).toContain('first\u2028second�touch /tmp/nope');
    expect(command).toContain('thread�-id');
  });

  test('maps the full-access preset to each CLI dangerous-mode flag', () => {
    const codexCommand = buildCliChatCommand({
      cli: 'codex',
      prompt: 'go',
      sessionId: 'thread-id',
      permissionMode: 'full-access',
      modelSettings: codexModelSettings,
    });
    expect(codexCommand).toContain(
      'codex exec resume --json --dangerously-bypass-approvals-and-sandbox',
    );
    expect(codexCommand).not.toContain('mcp_servers.synapsenote');
    expect(
      buildCliChatCommand(
        {
          cli: 'codex',
          prompt: 'go',
          sessionId: 'thread-id',
          permissionMode: 'full-access',
          modelSettings: codexModelSettings,
        },
        { autoApproveOkTools: true },
      ),
    ).toContain('-c \'mcp_servers.synapsenote.default_tools_approval_mode="approve"\'');
    expect(
      buildCliChatCommand({
        cli: 'claude',
        prompt: 'go',
        sessionId: null,
        permissionMode: 'full-access',
        modelSettings: claudeModelSettings,
      }),
    ).toContain('--dangerously-skip-permissions');
  });

  test('keeps write-capable SynapseNote MCP tools unavailable in read-only mode', () => {
    const command = buildCliChatCommand({
      cli: 'codex',
      prompt: 'inspect',
      sessionId: null,
      permissionMode: 'read-only',
      modelSettings: codexModelSettings,
    });

    expect(command).toContain('-c \'sandbox_mode="read-only"\'');
    expect(command).not.toContain('default_tools_approval_mode');
  });

  test('adds Claude MCP trust and safe auto-approval only when verified', () => {
    const command = buildCliChatCommand(
      {
        cli: 'claude',
        prompt: 'inspect',
        sessionId: null,
        permissionMode: 'workspace-write',
        modelSettings: claudeModelSettings,
      },
      { autoApproveOkTools: true, mcpPreApprove: true },
    );

    expect(command).toContain('enabledMcpjsonServers');
    expect(command).toContain('"allow":["mcp__synapsenote","Bash(ok open:*)"]');
    expect(command).toContain('mcp__synapsenote__delete');
  });

  test('maps model, effort, and speed through fixed CLI-specific arguments', () => {
    expect(
      buildCliChatCommand({
        cli: 'codex',
        prompt: 'go',
        sessionId: null,
        permissionMode: 'workspace-write',
        modelSettings: { model: 'gpt-5.6-sol', effort: 'max', speed: 'fast' },
      }),
    ).toContain(
      "-m 'gpt-5.6-sol' -c 'model_reasoning_effort=\"max\"' -c 'service_tier=\"fast\"' -c 'features.fast_mode=true'",
    );
    expect(
      buildCliChatCommand({
        cli: 'claude',
        prompt: 'go',
        sessionId: null,
        permissionMode: 'workspace-write',
        modelSettings: { model: 'sonnet', effort: 'xhigh', speed: 'default' },
      }),
    ).toContain("--model 'sonnet' --effort 'xhigh'");
  });

  test('rejects values outside the closed launch contract', () => {
    const valid = {
      cli: 'codex',
      prompt: 'ok',
      sessionId: null,
      permissionMode: 'workspace-write',
      modelSettings: codexModelSettings,
    };
    expect(isCliChatLaunchInput(valid)).toBe(true);
    expect(isCliChatLaunchInput({ ...valid, cli: 'bash' })).toBe(false);
    expect(isCliChatLaunchInput({ ...valid, prompt: 42 })).toBe(false);
    expect(isCliChatLaunchInput({ ...valid, autoApproveOkTools: 'yes' })).toBe(false);
    expect(isCliChatLaunchInput({ ...valid, permissionMode: 'unrestricted' })).toBe(false);
    expect(
      isCliChatLaunchInput({
        ...valid,
        modelSettings: { model: 'opus', effort: 'high', speed: 'default' },
      }),
    ).toBe(false);
    expect(
      isCliChatLaunchInput({
        ...valid,
        modelSettings: { model: 'gpt-5.6', effort: 'high', speed: 'turbo' },
      }),
    ).toBe(false);
    expect(
      isCliChatLaunchInput({
        ...valid,
        modelSettings: { model: 'gpt-5.6-luna', effort: 'ultra', speed: 'default' },
      }),
    ).toBe(false);
    expect(
      isCliChatLaunchInput({
        ...valid,
        modelSettings: { model: 'gpt-5.3-codex-spark', effort: 'high', speed: 'fast' },
      }),
    ).toBe(false);
  });
});
