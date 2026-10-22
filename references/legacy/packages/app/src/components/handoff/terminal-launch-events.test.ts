import { describe, expect, test } from 'bun:test';
import type { TerminalCli } from '@nedian0brien/synapsenote-core';
import { requestTerminalLaunch, subscribeToTerminalLaunchRequests } from './terminal-launch-events';

describe('terminal-launch-events', () => {
  test('delivers the composed prompt + chosen CLI from request to subscriber', () => {
    const target = new EventTarget();
    const received: Array<{ prompt: string | null; cli: TerminalCli }> = [];
    const unsub = subscribeToTerminalLaunchRequests(
      (prompt, cli) => received.push({ prompt, cli }),
      target,
    );

    requestTerminalLaunch("Let's work on `foo.md` using SynapseNote.", 'codex', target);
    expect(received).toEqual([
      { prompt: "Let's work on `foo.md` using SynapseNote.", cli: 'codex' },
    ]);

    unsub();
    requestTerminalLaunch('after unsubscribe', 'cursor', target);
    expect(received).toHaveLength(1);
  });

  test('delivers a promptless resumable chat request', () => {
    const target = new EventTarget();
    const received: unknown[] = [];
    const unsub = subscribeToTerminalLaunchRequests(
      (prompt, cli, options) => received.push({ prompt, cli, options }),
      target,
    );

    requestTerminalLaunch(
      null,
      'claude',
      { resumeSessionId: 'session-42', surface: 'main' },
      target,
    );

    expect(received).toEqual([
      {
        prompt: null,
        cli: 'claude',
        options: { resumeSessionId: 'session-42', surface: 'main' },
      },
    ]);
    unsub();
  });
});
