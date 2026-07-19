import type { ChatEvent, CliChatId, ParsedChunk, ParserState } from '../cli-chat-types';

// CSI, OSC and single-character escapes. PTY output may wrap JSONL in terminal
// control sequences even when the CLI itself has color disabled.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI_ESCAPE = new RegExp(
  `${ESC}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BEL}]*(?:${BEL}|${ESC}\\\\))`,
  'g',
);

export function createParserState(): ParserState {
  return { buffer: '' };
}

function jsonFromTerminalLine(line: string): unknown | null {
  const clean = line.replace(ANSI_ESCAPE, '').replaceAll('\r', '').trim();
  const start = clean.indexOf('{');
  if (start === -1) return null;
  try {
    return JSON.parse(clean.slice(start));
  } catch {
    return null;
  }
}

function stringAt(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function numberAt(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' ? candidate : undefined;
}

function recordAt(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'object' && candidate !== null
    ? (candidate as Record<string, unknown>)
    : undefined;
}

function valueAt(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function formatToolValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function firstToolText(value: unknown, depth = 0): string | undefined {
  if (value === undefined || value === null || depth > 5) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return firstToolText(JSON.parse(trimmed), depth + 1) ?? trimmed.split(/\r?\n/, 1)[0];
      } catch {
        return trimmed.split(/\r?\n/, 1)[0];
      }
    }
    return trimmed.split(/\r?\n/, 1)[0];
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const text = firstToolText(child, depth + 1);
      if (text !== undefined) return text;
    }
    return undefined;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'text', 'output', 'result', 'content', 'error']) {
      const text = firstToolText(record[key], depth + 1);
      if (text !== undefined) return text;
    }
    return undefined;
  }
  return String(value);
}

function toolPresentation(
  item: Record<string, unknown> | undefined,
  itemType: 'command_execution' | 'mcp_tool_call',
  status: string | undefined,
): { summary?: string; fullDetail?: string } {
  if (status === undefined) return {};
  const failed = /(?:fail|error|cancel)/i.test(status);
  const error = recordAt(item, 'error');
  const errorValue = stringAt(error, 'message') ?? stringAt(item, 'error');
  const outputValue = stringAt(item, 'aggregated_output');
  const resultValue = valueAt(item, 'result');
  const summarySource = failed
    ? (errorValue ?? outputValue ?? resultValue)
    : (outputValue ?? resultValue);
  const summary = firstToolText(summarySource);
  const sections: string[] = [];
  const addSection = (label: string, value: unknown) => {
    const formatted = formatToolValue(value);
    if (formatted !== undefined) sections.push(`${label}\n${formatted}`);
  };

  if (itemType === 'command_execution') {
    const exitCode = numberAt(item, 'exit_code');
    if (outputValue !== undefined || errorValue !== undefined || exitCode !== undefined) {
      addSection('Command', stringAt(item, 'command'));
      addSection('Output', outputValue);
      addSection('Error', errorValue);
      if (exitCode !== undefined) addSection('Exit code', exitCode);
    }
  } else {
    addSection('Arguments', valueAt(item, 'arguments'));
    addSection('Result', resultValue);
    addSection('Error', errorValue);
  }

  return {
    ...(summary === undefined ? {} : { summary }),
    ...(sections.length === 0 ? {} : { fullDetail: sections.join('\n\n') }),
  };
}

function codexEvents(value: unknown): ChatEvent[] {
  const type = stringAt(value, 'type');
  if (type === 'synapsenote.command_completed') {
    const exitCode = numberAt(value, 'exit_code');
    return exitCode === undefined ? [] : [{ type: 'command_exit', exitCode }];
  }
  if (type === 'thread.started') {
    const sessionId = stringAt(value, 'thread_id');
    return sessionId ? [{ type: 'session', sessionId }] : [];
  }
  if (type === 'turn.started') return [{ type: 'status', label: 'Thinking' }];
  if (type === 'turn.completed') return [{ type: 'done', exitCode: 0 }];
  if (type === 'turn.failed') {
    const error = recordAt(value, 'error');
    return [
      { type: 'error', message: stringAt(error, 'message') ?? 'Codex could not finish this turn.' },
      { type: 'done', exitCode: 1 },
    ];
  }
  if (type !== 'item.started' && type !== 'item.completed' && type !== 'item.updated') return [];
  const item = recordAt(value, 'item');
  const itemType = stringAt(item, 'type');
  if (itemType === 'agent_message' && type === 'item.completed') {
    const text = stringAt(item, 'text');
    return text ? [{ type: 'assistant_message', text }] : [];
  }
  if (itemType === 'command_execution' || itemType === 'mcp_tool_call') {
    const sourceId = stringAt(item, 'id');
    const name =
      itemType === 'mcp_tool_call'
        ? (stringAt(item, 'tool') ?? stringAt(item, 'name') ?? 'Tool')
        : (stringAt(item, 'command') ?? 'Command');
    const detail = type === 'item.completed' ? stringAt(item, 'status') : undefined;
    const presentation = toolPresentation(item, itemType, detail);
    return [
      {
        type: 'tool',
        ...(sourceId === undefined ? {} : { sourceId }),
        name,
        ...(detail === undefined ? {} : { detail }),
        ...presentation,
      },
    ];
  }
  if (itemType === 'web_search') {
    const sourceId = stringAt(item, 'id');
    const action = recordAt(item, 'action');
    const actionType = stringAt(action, 'type');
    const query = stringAt(item, 'query') ?? stringAt(action, 'query');
    const url = stringAt(action, 'url');
    const detail =
      type === 'item.completed'
        ? query || url || (actionType && actionType !== 'other' ? actionType : 'completed')
        : undefined;
    return [
      {
        type: 'tool',
        ...(sourceId === undefined ? {} : { sourceId }),
        category: 'web_search',
        name:
          actionType === 'open'
            ? 'Open web page'
            : actionType === 'find'
              ? 'Find on web page'
              : 'Web search',
        ...(detail === undefined ? {} : { detail }),
      },
    ];
  }
  // `item.type = "error"` is a diagnostic stream item, and Codex uses it for
  // non-fatal startup notices as well as recoverable diagnostics. Turn outcome
  // is authoritative: `turn.failed` above surfaces a real chat error, while a
  // later `turn.completed` means these diagnostics must not become red errors.
  return [];
}

function claudeEvents(value: unknown): ChatEvent[] {
  const type = stringAt(value, 'type');
  if (type === 'synapsenote.command_completed') {
    const exitCode = numberAt(value, 'exit_code');
    return exitCode === undefined ? [] : [{ type: 'command_exit', exitCode }];
  }
  if (type === 'system' && stringAt(value, 'subtype') === 'init') {
    const sessionId = stringAt(value, 'session_id');
    return sessionId ? [{ type: 'session', sessionId }] : [];
  }
  if (type === 'system' && stringAt(value, 'subtype') === 'status') {
    const status = stringAt(value, 'status');
    return status ? [{ type: 'status', label: status === 'requesting' ? 'Thinking' : status }] : [];
  }
  if (type === 'stream_event') {
    const event = recordAt(value, 'event');
    const eventType = stringAt(event, 'type');
    if (eventType === 'content_block_delta') {
      const delta = recordAt(event, 'delta');
      const text = stringAt(delta, 'text');
      return text ? [{ type: 'assistant_delta', text }] : [];
    }
    if (eventType === 'content_block_start') {
      const block = recordAt(event, 'content_block');
      if (stringAt(block, 'type') === 'tool_use') {
        const sourceId = stringAt(block, 'id');
        return [
          {
            type: 'tool',
            ...(sourceId === undefined ? {} : { sourceId }),
            name: stringAt(block, 'name') ?? 'Tool',
          },
        ];
      }
    }
    return [];
  }
  if (type === 'result') {
    const failed = (value as Record<string, unknown>).is_error === true;
    const result = stringAt(value, 'result');
    return failed
      ? [
          { type: 'error', message: result ?? 'Claude could not finish this turn.' },
          { type: 'done', exitCode: 1 },
        ]
      : [{ type: 'done', exitCode: 0 }];
  }
  return [];
}

export function parseStructuredChatChunk(
  cli: CliChatId,
  chunk: string,
  state: ParserState,
): ParsedChunk {
  const combined = state.buffer + chunk;
  const lines = combined.split('\n');
  const buffer = lines.pop() ?? '';
  const events: ChatEvent[] = [];
  for (const line of lines) {
    const value = jsonFromTerminalLine(line);
    if (value === null) continue;
    events.push(...(cli === 'codex' ? codexEvents(value) : claudeEvents(value)));
  }
  return { events, state: { buffer } };
}
