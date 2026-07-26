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
      '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"WebSearch"}}}',
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Hi"}]}}',
      '{"type":"result","subtype":"success","is_error":false,"result":"Hi"}',
    ].join('\n');
    const parsed = parseStructuredChatChunk('claude', `${input}\n`, createParserState());
    expect(parsed.events).toEqual([
      { type: 'session', sessionId: 'claude-id' },
      { type: 'tool', category: 'file', name: 'Read' },
      { type: 'tool', category: 'web_search', name: 'WebSearch' },
      { type: 'assistant_delta', text: 'Hi' },
      { type: 'done', exitCode: 0 },
    ]);
  });

  test('matches Claude tool results to their started activity', () => {
    const input = [
      '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","id":"tool-ok","name":"Bash"}}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tool-ok","content":"/workspace","is_error":false}]},"tool_use_result":{"stdout":"/workspace","stderr":""}}',
      '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","id":"tool-denied","name":"mcp__synapsenote__current_document"}}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tool-denied","content":"Permission was not granted.","is_error":true}]},"tool_use_result":"Error: permission denied"}',
    ].join('\n');

    const parsed = parseStructuredChatChunk('claude', `${input}\n`, createParserState());
    expect(parsed.events).toEqual([
      { type: 'tool', sourceId: 'tool-ok', category: 'command', name: 'Bash' },
      {
        type: 'tool',
        sourceId: 'tool-ok',
        detail: 'completed',
        summary: '/workspace',
        fullDetail: 'Result\n{\n  "stdout": "/workspace",\n  "stderr": ""\n}',
      },
      {
        type: 'tool',
        sourceId: 'tool-denied',
        category: 'tool',
        name: 'mcp__synapsenote__current_document',
      },
      {
        type: 'tool',
        sourceId: 'tool-denied',
        detail: 'failed',
        summary: 'Permission was not granted.',
        fullDetail: 'Error\nError: permission denied',
      },
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

  test('parses the shell completion sentinel for startup failures', () => {
    const parsed = parseStructuredChatChunk(
      'codex',
      'Error loading config.toml: invalid transport\r\n' +
        '{"type":"synapsenote.command_completed","exit_code":1}\r\n',
      createParserState(),
    );
    expect(parsed.events).toEqual([{ type: 'command_exit', exitCode: 1 }]);
  });

  test('surfaces Codex web search start and completion as one tool activity', () => {
    const input = [
      '{"type":"item.started","item":{"id":"web-1","type":"web_search","query":"","action":{"type":"other"}}}',
      '{"type":"item.completed","item":{"id":"web-1","type":"web_search","query":"official OpenAI homepage","action":{"type":"search","query":"official OpenAI homepage"}}}',
    ].join('\n');

    const parsed = parseStructuredChatChunk('codex', `${input}\n`, createParserState());
    expect(parsed.events).toEqual([
      { type: 'tool', sourceId: 'web-1', category: 'web_search', name: 'Web search' },
      {
        type: 'tool',
        sourceId: 'web-1',
        category: 'web_search',
        name: 'Web search',
        detail: 'official OpenAI homepage',
      },
    ]);
  });

  test('preserves Codex tool failure details for the chat UI', () => {
    const input = [
      '{"type":"item.started","item":{"id":"tool-1","type":"mcp_tool_call","tool":"exec","status":"in_progress"}}',
      '{"type":"item.completed","item":{"id":"tool-1","type":"mcp_tool_call","tool":"exec","error":{"message":"user cancelled MCP tool call"},"status":"failed"}}',
      '{"type":"item.completed","item":{"id":"tool-2","type":"command_execution","command":"bun test","aggregated_output":"Assertion failed\\nExpected 1, received 2\\n","exit_code":1,"status":"failed"}}',
    ].join('\n');

    const parsed = parseStructuredChatChunk('codex', `${input}\n`, createParserState());
    expect(parsed.events).toEqual([
      { type: 'tool', sourceId: 'tool-1', category: 'command', name: 'exec' },
      {
        type: 'tool',
        sourceId: 'tool-1',
        category: 'command',
        name: 'exec',
        detail: 'failed',
        summary: 'user cancelled MCP tool call',
        fullDetail: 'Error\nuser cancelled MCP tool call',
      },
      {
        type: 'tool',
        sourceId: 'tool-2',
        category: 'command',
        name: 'bun test',
        detail: 'failed',
        summary: 'Assertion failed',
        fullDetail:
          'Command\nbun test\n\nOutput\nAssertion failed\nExpected 1, received 2\n\nExit code\n1',
      },
    ]);
  });

  test('preserves successful command and MCP details for expansion', () => {
    const input = [
      '{"type":"item.completed","item":{"id":"tool-1","type":"command_execution","command":"bun run build","aggregated_output":"Build complete\\n12 modules bundled\\n","exit_code":0,"status":"completed"}}',
      '{"type":"item.completed","item":{"id":"tool-2","type":"mcp_tool_call","tool":"write","arguments":{"document":{"path":"note/example"}},"result":{"content":[{"type":"text","text":"Created note/example.md\\nNo broken links."}]},"status":"completed"}}',
    ].join('\n');

    const parsed = parseStructuredChatChunk('codex', `${input}\n`, createParserState());
    expect(parsed.events).toEqual([
      {
        type: 'tool',
        sourceId: 'tool-1',
        category: 'command',
        name: 'bun run build',
        detail: 'completed',
        summary: 'Build complete',
        fullDetail:
          'Command\nbun run build\n\nOutput\nBuild complete\n12 modules bundled\n\nExit code\n0',
      },
      {
        type: 'tool',
        sourceId: 'tool-2',
        category: 'file',
        name: 'write',
        detail: 'completed',
        summary: 'Created note/example.md',
        fullDetail:
          'Arguments\n{\n  "document": {\n    "path": "note/example"\n  }\n}\n\nResult\n{\n  "content": [\n    {\n      "type": "text",\n      "text": "Created note/example.md\\nNo broken links."\n    }\n  ]\n}',
      },
    ]);
  });
});
