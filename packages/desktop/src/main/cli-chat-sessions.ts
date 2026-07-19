import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const MAX_SESSIONS = 40;
const MAX_TITLE_LENGTH = 36;

export interface NativeCliChatSession {
  readonly cli: 'codex' | 'claude';
  readonly sessionId: string;
  readonly title: string;
  readonly updatedAt: number;
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
    sessions.set(sessionId, {
      cli: 'codex',
      sessionId,
      title: indexed?.title ?? firstPrompt ?? 'Codex chat',
      updatedAt: latest,
    });
  }
  return [...sessions.values()];
}

function claudeMessageText(message: unknown): string | null {
  const value = record(message);
  const content = value?.content;
  if (typeof content === 'string') return shortTitle(content);
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    const item = record(part);
    if (item?.type === 'text') {
      const text = shortTitle(item.text);
      if (text !== null) return text;
    }
  }
  return null;
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
        candidate.firstPrompt = claudeMessageText(row.message);
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
