import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const MAX_SESSIONS = 40;
const MAX_TITLE_LENGTH = 36;

export interface NativeCliChatSession {
  readonly cli: 'codex' | 'claude';
  readonly sessionId: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly preview: string;
  readonly messageCount: number;
}

export interface NativeCliChatTranscriptEntry {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly timestamp?: number;
}

export interface NativeCliChatTranscript extends NativeCliChatSession {
  readonly entries: readonly NativeCliChatTranscriptEntry[];
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

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

function contentText(content: unknown): string | null {
  if (typeof content === 'string') return normalizedText(content);
  if (!Array.isArray(content)) return null;
  const parts = content.flatMap((candidate) => {
    const item = record(candidate);
    if (item === null) return [];
    const type = item.type;
    if (type !== 'text' && type !== 'input_text' && type !== 'output_text') return [];
    const text = normalizedText(item.text);
    return text === null ? [] : [text];
  });
  return parts.length === 0 ? null : parts.join('\n\n');
}

function appendTranscriptEntry(
  entries: NativeCliChatTranscriptEntry[],
  role: NativeCliChatTranscriptEntry['role'],
  text: string | null,
  at?: number,
): void {
  if (text === null) return;
  const previous = entries.at(-1);
  if (previous?.role === role && previous.text === text) return;
  entries.push({ role, text, ...(at === undefined || at === 0 ? {} : { timestamp: at }) });
}

function codexTranscript(rows: readonly Record<string, unknown>[]): NativeCliChatTranscriptEntry[] {
  const entries: NativeCliChatTranscriptEntry[] = [];
  for (const row of rows) {
    const at = timestamp(row.timestamp);
    const payload = record(row.payload);
    if (payload === null) continue;
    if (row.type === 'event_msg') {
      if (payload.type === 'user_message') {
        appendTranscriptEntry(entries, 'user', normalizedText(payload.message), at);
      } else if (payload.type === 'agent_message') {
        appendTranscriptEntry(entries, 'assistant', normalizedText(payload.message), at);
      }
      continue;
    }
    if (row.type !== 'response_item' || payload.type !== 'message') continue;
    const role = payload.role;
    if (role !== 'user' && role !== 'assistant') continue;
    appendTranscriptEntry(entries, role, contentText(payload.content), at);
  }
  return entries;
}

function claudeTranscript(
  rows: readonly Record<string, unknown>[],
): NativeCliChatTranscriptEntry[] {
  const entries: NativeCliChatTranscriptEntry[] = [];
  for (const row of rows) {
    if (row.type !== 'user' && row.type !== 'assistant') continue;
    const message = record(row.message);
    if (message === null) continue;
    appendTranscriptEntry(
      entries,
      row.type,
      contentText(message.content),
      timestamp(row.timestamp),
    );
  }
  return entries;
}

function transcriptPreview(entries: readonly NativeCliChatTranscriptEntry[]): string {
  const last = entries.at(-1)?.text.replace(/\s+/g, ' ').trim() ?? '';
  const characters = Array.from(last);
  return characters.length <= 88 ? last : `${characters.slice(0, 87).join('')}…`;
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
        firstPrompt = shortTitle(event.message);
      }
    }
    const entries = codexTranscript(rows);
    sessions.set(sessionId, {
      cli: 'codex',
      sessionId,
      title: indexed?.title ?? firstPrompt ?? 'Codex chat',
      updatedAt: latest,
      preview: transcriptPreview(entries),
      messageCount: entries.length,
    });
  }
  return [...sessions.values()];
}

function claudeMessageText(message: unknown): string | null {
  const value = record(message);
  return shortTitle(contentText(value?.content));
}

interface ClaudeCandidate {
  title: string | null;
  aiTitle: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  updatedAt: number;
  matchesProject: boolean;
  entries: NativeCliChatTranscriptEntry[];
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
      entries: [],
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
    const rows = parseJsonLines(path)
      .map(record)
      .filter((row) => row !== null);
    for (const row of rows) {
      if (typeof row.sessionId !== 'string') continue;
      const candidate = ensure(row.sessionId);
      candidate.matchesProject ||= sameProject(row.cwd, projectRoot);
      candidate.updatedAt = Math.max(candidate.updatedAt, timestamp(row.timestamp, fallbackTime));
      if (row.type === 'ai-title') candidate.aiTitle = shortTitle(row.aiTitle) ?? candidate.aiTitle;
      if (row.type === 'last-prompt') {
        candidate.lastPrompt = shortTitle(row.lastPrompt) ?? candidate.lastPrompt;
      }
      if (row.type === 'user' && candidate.firstPrompt === null) {
        candidate.firstPrompt = claudeMessageText(row.message);
      }
      if (row.type === 'user' || row.type === 'assistant') {
        const message = record(row.message);
        appendTranscriptEntry(
          candidate.entries,
          row.type,
          contentText(message?.content),
          timestamp(row.timestamp, fallbackTime),
        );
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
            preview: transcriptPreview(candidate.entries),
            messageCount: candidate.entries.length,
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

/** Load a normalized, read-only transcript for one project-owned native session. */
export function loadNativeCliChatSession(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
  readonly cli: 'codex' | 'claude';
  readonly sessionId: string;
}): NativeCliChatTranscript | null {
  const session = listNativeCliChatSessions(options).find(
    (candidate) => candidate.cli === options.cli && candidate.sessionId === options.sessionId,
  );
  if (session === undefined) return null;

  if (options.cli === 'codex') {
    for (const path of jsonlFiles(join(options.homeDir, '.codex', 'sessions'))) {
      const rows = parseJsonLines(path)
        .map(record)
        .filter((row) => row !== null);
      const meta = rows.find((row) => row.type === 'session_meta');
      const payload = record(meta?.payload);
      const sessionId =
        typeof payload?.id === 'string'
          ? payload.id
          : typeof payload?.session_id === 'string'
            ? payload.session_id
            : null;
      if (sessionId !== options.sessionId || !sameProject(payload?.cwd, options.projectRoot)) {
        continue;
      }
      return { ...session, entries: codexTranscript(rows) };
    }
    return null;
  }

  const projectDirectory = options.projectRoot.replace(/[\\/]/g, '-');
  const rows = jsonlFiles(join(options.homeDir, '.claude', 'projects', projectDirectory)).flatMap(
    (path) =>
      parseJsonLines(path)
        .map(record)
        .filter(
          (row): row is Record<string, unknown> =>
            row !== null &&
            row.sessionId === options.sessionId &&
            (row.cwd === undefined || sameProject(row.cwd, options.projectRoot)),
        ),
  );
  return { ...session, entries: claudeTranscript(rows) };
}
