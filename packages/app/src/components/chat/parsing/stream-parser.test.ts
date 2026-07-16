import { describe, expect, test } from 'bun:test';
import { createParserState, parseStructuredChatChunk } from './stream-parser';

describe('structured chat stream parser', () => {
  test('handles arbitrary Codex JSONL chunk boundaries', () => {
    let state = createParserState();
    const first = parseStructuredChatChunk(
      'codex',
      '{"type":"thread.started","thread_id":"abc"}\n{"type":"item.comp',
      state,
    );
    state = first.state;
    const second = parseStructuredChatChunk(
      'codex',
      'leted","item":{"type":"agent_message","text":"Hello"}}\n{"type":"turn.completed"}\n',
      state,
    );
    expect([...first.events, ...second.events]).toEqual([
      { type: 'session', sessionId: 'abc' },
      { type: 'assistant_message', text: 'Hello' },
      { type: 'done', exitCode: 0 },
    ]);
  });

  test('keeps consecutive completed Codex messages as discrete events', () => {
    const input = [
      '{"type":"item.completed","item":{"id":"message-1","type":"agent_message","text":"First"}}',
      '{"type":"item.completed","item":{"id":"message-2","type":"agent_message","text":"Second"}}',
    ].join('\n');

    const parsed = parseStructuredChatChunk('codex', `${input}\n`, createParserState());
    expect(parsed.events).toEqual([
      { type: 'assistant_message', text: 'First' },
      { type: 'assistant_message', text: 'Second' },
    ]);
  });

  test('normalizes Claude deltas, tools, and completion without duplicating assistant events', () => {
    const input = [
      '{"type":"system","subtype":"init","session_id":"claude-id"}',
      '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read"}}}',
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Hi"}]}}',
      '{"type":"result","subtype":"success","is_error":false,"result":"Hi"}',
    ].join('\n');
    const parsed = parseStructuredChatChunk('claude', `${input}\n`, createParserState());
    expect(parsed.events).toEqual([
      { type: 'session', sessionId: 'claude-id' },
      { type: 'tool', name: 'Read' },
      { type: 'assistant_delta', text: 'Hi' },
      { type: 'done', exitCode: 0 },
    ]);
  });

  test('strips terminal controls and ignores non-JSON shell output', () => {
    const parsed = parseStructuredChatChunk(
      'codex',
      '\u001b[32m%\u001b[0m codex exec\r\n\u001b[2K{"type":"turn.started"}\r\n',
      createParserState(),
    );
    expect(parsed.events).toEqual([{ type: 'status', label: 'Thinking' }]);
  });

  test('uses the Codex turn outcome instead of diagnostic error items', () => {
    const input = [
      '{"type":"item.completed","item":{"type":"error","message":"A non-fatal diagnostic."}}',
      '{"type":"turn.failed","error":{"message":"The model request failed."}}',
    ].join('\n');

    const parsed = parseStructuredChatChunk('codex', `${input}\n`, createParserState());
    expect(parsed.events).toEqual([
      { type: 'error', message: 'The model request failed.' },
      { type: 'done', exitCode: 1 },
    ]);
  });
});
