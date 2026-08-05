import { describe, expect, test } from 'bun:test';
import { cliChatReducer, initialCliChatState } from './cli-chat-reducer';

describe('cliChatReducer', () => {
  test('hydrates a resumable transcript without starting a new turn', () => {
    const state = cliChatReducer(initialCliChatState, {
      type: 'hydrate',
      entries: [
        { role: 'user', text: 'Previous question', timestamp: 1 },
        { role: 'assistant', text: 'Previous answer', timestamp: 2 },
      ],
    });

    expect(state.running).toBe(false);
    expect(state.timeline).toEqual([
      {
        id: 'history-message-1',
        type: 'message',
        role: 'user',
        text: 'Previous question',
        timestamp: 1,
      },
      {
        id: 'history-message-2',
        type: 'message',
        role: 'assistant',
        text: 'Previous answer',
        timestamp: 2,
      },
    ]);
  });

  test('retries a failed user turn in place without duplicating its message', () => {
    const sent = cliChatReducer(initialCliChatState, { type: 'send', text: 'Try this' });
    const failed = cliChatReducer(sent, {
      type: 'events',
      events: [
        { type: 'error', message: 'CLI missing' },
        { type: 'done', exitCode: 127 },
      ],
    });
    const retried = cliChatReducer(failed, { type: 'retry', messageId: 'message-1' });

    expect(retried.running).toBe(true);
    expect(retried.timeline).toEqual([
      { id: 'message-1', type: 'message', role: 'user', text: 'Try this' },
    ]);
  });

  test('accumulates streaming deltas into one assistant message', () => {
    const sent = cliChatReducer(initialCliChatState, { type: 'send', text: 'Hello' });
    const streamed = cliChatReducer(sent, {
      type: 'events',
      events: [
        { type: 'assistant_delta', text: 'Hi' },
        { type: 'assistant_delta', text: ' there' },
        { type: 'done', exitCode: 0 },
      ],
    });
    expect(
      streamed.timeline.map((entry) =>
        entry.type === 'message' ? [entry.role, entry.text] : [entry.kind, entry.label],
      ),
    ).toEqual([
      ['user', 'Hello'],
      ['assistant', 'Hi there'],
    ]);
    expect(streamed.running).toBe(false);
  });

  test('preserves assistant and tool events in execution order', () => {
    const state = cliChatReducer(initialCliChatState, {
      type: 'events',
      events: [
        { type: 'assistant_delta', text: 'I will inspect it.' },
        { type: 'tool', sourceId: 'tool-1', name: 'Read' },
        { type: 'tool', sourceId: 'tool-1', name: 'Read', detail: 'completed' },
        { type: 'assistant_delta', text: 'The file looks good.' },
      ],
    });
    expect(
      state.timeline.map((entry) =>
        entry.type === 'message'
          ? `${entry.role}:${entry.text}`
          : `${entry.kind}:${entry.label}:${entry.detail ?? ''}`,
      ),
    ).toEqual([
      'assistant:I will inspect it.',
      'tool:Read:completed',
      'assistant:The file looks good.',
    ]);
  });

  test('keeps the summary and full detail when a tool activity completes', () => {
    const started = cliChatReducer(initialCliChatState, {
      type: 'events',
      events: [{ type: 'tool', sourceId: 'tool-1', name: 'exec' }],
    });
    const failed = cliChatReducer(started, {
      type: 'events',
      events: [
        {
          type: 'tool',
          sourceId: 'tool-1',
          name: 'exec',
          detail: 'failed',
          summary: 'user cancelled MCP tool call',
          fullDetail: 'Error\nuser cancelled MCP tool call',
        },
      ],
    });

    expect(failed.timeline).toHaveLength(1);
    expect(failed.timeline[0]).toMatchObject({
      type: 'activity',
      kind: 'tool',
      label: 'exec',
      detail: 'failed',
      summary: 'user cancelled MCP tool call',
      fullDetail: 'Error\nuser cancelled MCP tool call',
    });
  });

  test('renders consecutive completed assistant messages as separate entries', () => {
    const state = cliChatReducer(initialCliChatState, {
      type: 'events',
      events: [
        { type: 'assistant_message', text: 'First response' },
        { type: 'assistant_message', text: 'Second response' },
      ],
    });

    expect(
      state.timeline.map((entry) =>
        entry.type === 'message' ? `${entry.role}:${entry.text}` : entry.kind,
      ),
    ).toEqual(['assistant:First response', 'assistant:Second response']);
  });

  test('preserves the exact sent selection on its user message', () => {
    const selectionContext = {
      documentTitle: 'Persona2Web',
      documentPath: 'reading/DLI Lab/Persona2Web.pdf',
      markdown: 'Selected PDF passage',
      lineCount: 1,
    };
    const state = cliChatReducer(initialCliChatState, {
      type: 'send',
      text: 'Explain this',
      selectionContext,
    });

    expect(state.timeline[0]).toMatchObject({
      type: 'message',
      role: 'user',
      text: 'Explain this',
      selectionContext,
    });
  });

  test('ends a still-running turn when the CLI exits before structured completion', () => {
    const sent = cliChatReducer(initialCliChatState, { type: 'send', text: 'Hello' });
    const exited = cliChatReducer(sent, {
      type: 'events',
      events: [{ type: 'command_exit', exitCode: 1 }],
    });

    expect(exited.running).toBe(false);
    expect(exited.timeline.at(-1)).toMatchObject({
      type: 'activity',
      kind: 'error',
      label: 'The CLI exited before completing (code 1).',
    });
  });

  test('ignores the shell completion sentinel after a user interrupt', () => {
    const sent = cliChatReducer(initialCliChatState, { type: 'send', text: 'Hello' });
    const interrupted = cliChatReducer(sent, { type: 'interrupt' });
    const exited = cliChatReducer(interrupted, {
      type: 'events',
      events: [{ type: 'command_exit', exitCode: 130 }],
    });

    expect(exited).toEqual(interrupted);
  });
});
