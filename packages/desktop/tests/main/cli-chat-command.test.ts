import { describe, expect, test } from 'bun:test';
import { buildCliChatCommand, isCliChatLaunchInput } from '../../src/main/cli-chat-command';

const codexModelSettings = {
  model: 'gpt-5.6-sol',
  effort: 'medium',
  speed: 'default',
} as const;
const claudeModelSettings = { model: 'sonnet', effort: 'medium', speed: 'default' } as const;

describe('CLI chat command boundary', () => {
  test('quotes prompts and resumes without accepting a free-form executable', () => {
    expect(
      buildCliChatCommand({
        cli: 'codex',
        prompt: "don't run $(oops)",
        sessionId: null,
        permissionMode: 'workspace-write',
        modelSettings: codexModelSettings,
      }),
    ).toBe(
      "codex exec --json --color never -c 'approval_policy=\"never\"' -c 'sandbox_mode=\"workspace-write\"' -c 'mcp_servers.open-knowledge.default_tools_approval_mode=\"approve\"' -m 'gpt-5.6-sol' -c 'model_reasoning_effort=\"medium\"' 'don'\\''t run $(oops)'",
    );
    expect(
      buildCliChatCommand({
        cli: 'claude',
        prompt: 'next',
        sessionId: 'session-id',
        permissionMode: 'read-only',
        modelSettings: claudeModelSettings,
      }),
    ).toContain("--permission-mode plan --model 'sonnet' --effort 'medium' --resume 'session-id'");
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
    expect(codexCommand).toContain(
      '-c \'mcp_servers.open-knowledge.default_tools_approval_mode="approve"\'',
    );
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

  test('keeps write-capable OpenKnowledge MCP tools unavailable in read-only mode', () => {
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
