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

function recordAt(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'object' && candidate !== null
    ? (candidate as Record<string, unknown>)
    : undefined;
}

function codexEvents(value: unknown): ChatEvent[] {
  const type = stringAt(value, 'type');
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
    return [
      {
        type: 'tool',
        ...(sourceId === undefined ? {} : { sourceId }),
        name,
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
