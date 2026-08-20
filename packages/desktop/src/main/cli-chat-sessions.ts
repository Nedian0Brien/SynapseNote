import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const MAX_SESSIONS = 40;
const MAX_TITLE_LENGTH = 36;
const MAX_TRANSCRIPT_MESSAGES = 400;
const MAX_TRANSCRIPT_CHARACTERS = 1_000_000;

export interface NativeCliChatSession {
  readonly cli: 'codex' | 'claude';
  readonly sessionId: string;
  readonly title: string;
  readonly updatedAt: number;
}

export interface NativeCliChatMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

interface SessionTitle {
  readonly title: string;
  readonly updatedAt: number;
}

function parseJsonLines(path: string): unknown[] {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as unknown];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function timestamp(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shortTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized === '') return null;
  const characters = Array.from(normalized);
  return characters.length <= MAX_TITLE_LENGTH
    ? normalized
    : `${characters.slice(0, MAX_TITLE_LENGTH - 1).join('')}…`;
}

function messageText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function visibleUserPrompt(value: unknown): string | null {
  const text = messageText(value);
  if (text === null) return null;
  const marker = '\n\nUser request:\n';
  const markerIndex = text.lastIndexOf(marker);
  const hasSynapseNoteContext =
    text.includes('<current_document>') || text.includes('<selected_document>');
  return hasSynapseNoteContext && markerIndex >= 0
    ? messageText(text.slice(markerIndex + marker.length))
    : text;
}

function boundedMessages(messages: readonly NativeCliChatMessage[]): NativeCliChatMessage[] {
  const bounded: NativeCliChatMessage[] = [];
  let characters = 0;
  for (const message of messages.slice(-MAX_TRANSCRIPT_MESSAGES).reverse()) {
    if (characters + message.text.length > MAX_TRANSCRIPT_CHARACTERS) continue;
    bounded.unshift(message);
    characters += message.text.length;
  }
  return bounded;
}

function sameProject(candidate: unknown, projectRoot: string): boolean {
  if (typeof candidate !== 'string') return false;
  const projectRelativePath = relative(resolve(projectRoot), resolve(candidate));
  return (
    projectRelativePath === '' ||
    (!projectRelativePath.startsWith('..') && !isAbsolute(projectRelativePath))
  );
}

function jsonlFiles(root: string, depth = 0): string[] {
  if (!existsSync(root) || depth > 4) return [];
  try {
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return jsonlFiles(path, depth + 1);
      return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : [];
    });
  } catch {
    return [];
  }
}

function fileModifiedAt(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function codexSessions(homeDir: string, projectRoot: string): NativeCliChatSession[] {
  const index = new Map<string, SessionTitle>();
  for (const raw of parseJsonLines(join(homeDir, '.codex', 'session_index.jsonl'))) {
    const row = record(raw);
    const sessionId = row?.id;
    const title = shortTitle(row?.thread_name);
    if (typeof sessionId !== 'string' || title === null) continue;
    index.set(sessionId, { title, updatedAt: timestamp(row?.updated_at) });
  }

  const sessions = new Map<string, NativeCliChatSession>();
  for (const path of jsonlFiles(join(homeDir, '.codex', 'sessions'))) {
    const rows = parseJsonLines(path)
      .map(record)
      .filter((row) => row !== null);
    const meta = rows.find((row) => row.type === 'session_meta');
    const payload = record(meta?.payload);
    if (!sameProject(payload?.cwd, projectRoot)) continue;
    const sessionId =
      typeof payload?.id === 'string'
        ? payload.id
        : typeof payload?.session_id === 'string'
          ? payload.session_id
          : null;
    if (sessionId === null) continue;

    const indexed = index.get(sessionId);
    let firstPrompt: string | null = null;
    let latest = Math.max(fileModifiedAt(path), indexed?.updatedAt ?? 0);
    for (const row of rows) {
      latest = Math.max(latest, timestamp(row.timestamp));
      const event = record(row.payload);
      if (firstPrompt === null && row.type === 'event_msg' && event?.type === 'user_message') {
        firstPrompt = shortTitle(visibleUserPrompt(event.message));
      }
    }
    sessions.set(sessionId, {
      cli: 'codex',
      sessionId,
      title: indexed?.title ?? firstPrompt ?? 'Codex chat',
      updatedAt: latest,
    });
  }
  return [...sessions.values()];
}

function claudeTranscriptText(message: unknown): string | null {
  const value = record(message);
  const content = value?.content;
  if (typeof content === 'string') return messageText(content);
  if (!Array.isArray(content)) return null;
  const text = content
    .flatMap((part) => {
      const item = record(part);
      return item?.type === 'text' && typeof item.text === 'string' ? [item.text] : [];
    })
    .join('\n\n');
  return messageText(text);
}

interface ClaudeCandidate {
  title: string | null;
  aiTitle: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  updatedAt: number;
  matchesProject: boolean;
}

function claudeSessions(homeDir: string, projectRoot: string): NativeCliChatSession[] {
  const candidates = new Map<string, ClaudeCandidate>();
  const ensure = (sessionId: string): ClaudeCandidate => {
    const current = candidates.get(sessionId);
    if (current !== undefined) return current;
    const created: ClaudeCandidate = {
      title: null,
      aiTitle: null,
      firstPrompt: null,
      lastPrompt: null,
      updatedAt: 0,
      matchesProject: false,
    };
    candidates.set(sessionId, created);
    return created;
  };

  for (const raw of parseJsonLines(join(homeDir, '.claude', 'history.jsonl'))) {
    const row = record(raw);
    if (!sameProject(row?.project, projectRoot) || typeof row?.sessionId !== 'string') continue;
    const candidate = ensure(row.sessionId);
    candidate.matchesProject = true;
    candidate.title = shortTitle(row.display) ?? candidate.title;
    candidate.updatedAt = Math.max(candidate.updatedAt, timestamp(row.timestamp));
  }

  const projectDirectory = projectRoot.replace(/[\\/]/g, '-');
  for (const path of jsonlFiles(join(homeDir, '.claude', 'projects', projectDirectory))) {
    const fallbackTime = fileModifiedAt(path);
    for (const raw of parseJsonLines(path)) {
      const row = record(raw);
      if (typeof row?.sessionId !== 'string') continue;
      const candidate = ensure(row.sessionId);
      candidate.matchesProject ||= sameProject(row.cwd, projectRoot);
      candidate.updatedAt = Math.max(candidate.updatedAt, timestamp(row.timestamp, fallbackTime));
      if (row.type === 'ai-title') candidate.aiTitle = shortTitle(row.aiTitle) ?? candidate.aiTitle;
      if (row.type === 'last-prompt') {
        candidate.lastPrompt = shortTitle(row.lastPrompt) ?? candidate.lastPrompt;
      }
      if (row.type === 'user' && candidate.firstPrompt === null) {
        candidate.firstPrompt = shortTitle(visibleUserPrompt(claudeTranscriptText(row.message)));
      }
    }
  }

  return [...candidates.entries()].flatMap(([sessionId, candidate]) =>
    candidate.matchesProject
      ? [
          {
            cli: 'claude' as const,
            sessionId,
            title:
              candidate.aiTitle ??
              candidate.title ??
              candidate.firstPrompt ??
              candidate.lastPrompt ??
              'Claude chat',
            updatedAt: candidate.updatedAt,
          },
        ]
      : [],
  );
}

/** Discover resumable Codex and Claude sessions owned by the active project. */
export function listNativeCliChatSessions(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
}): NativeCliChatSession[] {
  return [
    ...codexSessions(options.homeDir, options.projectRoot),
    ...claudeSessions(options.homeDir, options.projectRoot),
  ]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_SESSIONS);
}

function readCodexTranscript(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
  readonly sessionId: string;
}): NativeCliChatMessage[] {
  for (const path of jsonlFiles(join(options.homeDir, '.codex', 'sessions'))) {
    const rows = parseJsonLines(path)
      .map(record)
      .filter((row) => row !== null);
    const meta = rows.find((row) => row.type === 'session_meta');
    const payload = record(meta?.payload);
    const id =
      typeof payload?.id === 'string'
        ? payload.id
        : typeof payload?.session_id === 'string'
          ? payload.session_id
          : null;
    if (id !== options.sessionId || !sameProject(payload?.cwd, options.projectRoot)) continue;

    const messages = rows.flatMap((row): NativeCliChatMessage[] => {
      if (row.type !== 'event_msg') return [];
      const event = record(row.payload);
      if (event?.type === 'user_message') {
        const text = visibleUserPrompt(event.message);
        return text === null ? [] : [{ role: 'user', text }];
      }
      if (event?.type === 'agent_message') {
        const text = messageText(event.message);
        return text === null ? [] : [{ role: 'assistant', text }];
      }
      return [];
    });
    return boundedMessages(messages);
  }
  return [];
}

function readClaudeTranscript(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
  readonly sessionId: string;
}): NativeCliChatMessage[] {
  const projectDirectory = options.projectRoot.replace(/[\\/]/g, '-');
  for (const path of jsonlFiles(join(options.homeDir, '.claude', 'projects', projectDirectory))) {
    const rows = parseJsonLines(path)
      .map(record)
      .filter((row) => row !== null);
    const belongsToSession = rows.some(
      (row) => row.sessionId === options.sessionId && sameProject(row.cwd, options.projectRoot),
    );
    if (!belongsToSession) continue;

    const messages = rows.flatMap((row): NativeCliChatMessage[] => {
      if (row.sessionId !== options.sessionId || row.isMeta === true || row.isSidechain === true) {
        return [];
      }
      if (row.type !== 'user' && row.type !== 'assistant') return [];
      const message = record(row.message);
      const role = message?.role;
      if (role !== 'user' && role !== 'assistant') return [];
      const text =
        role === 'user'
          ? visibleUserPrompt(claudeTranscriptText(message))
          : claudeTranscriptText(message);
      return text === null ? [] : [{ role, text }];
    });
    return boundedMessages(messages);
  }
  return [];
}

/** Read the human-visible message history for one project-owned native chat. */
export function readNativeCliChatSession(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
  readonly cli: 'codex' | 'claude';
  readonly sessionId: string;
}): NativeCliChatMessage[] {
  return options.cli === 'codex' ? readCodexTranscript(options) : readClaudeTranscript(options);
}
