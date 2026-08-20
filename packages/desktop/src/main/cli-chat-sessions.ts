import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const MAX_SESSIONS = 40;
const MAX_TITLE_LENGTH = 36;
const MAX_TRANSCRIPT_MESSAGES = 400;
const MAX_TRANSCRIPT_CHARACTERS = 1_000_000;
const sessionFileCache = new Map<string, string>();

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

async function parseJsonLines(path: string): Promise<unknown[]> {
  try {
    return (await readFile(path, 'utf8'))
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

async function jsonlFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  try {
    const files: string[] = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) files.push(...(await jsonlFiles(path, depth + 1)));
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path);
    }
    return files;
  } catch {
    return [];
  }
}

async function fileModifiedAt(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

function sessionCacheKey(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
  readonly cli: 'codex' | 'claude';
  readonly sessionId: string;
}): string {
  return `${resolve(options.homeDir)}\u0000${resolve(options.projectRoot)}\u0000${options.cli}\u0000${options.sessionId}`;
}

function cacheSessionFile(
  options: {
    readonly homeDir: string;
    readonly projectRoot: string;
    readonly cli: 'codex' | 'claude';
    readonly sessionId: string;
  },
  path: string,
): void {
  sessionFileCache.set(sessionCacheKey(options), path);
}

async function codexSessions(
  homeDir: string,
  projectRoot: string,
): Promise<NativeCliChatSession[]> {
  const index = new Map<string, SessionTitle>();
  for (const raw of await parseJsonLines(join(homeDir, '.codex', 'session_index.jsonl'))) {
    const row = record(raw);
    const sessionId = row?.id;
    const title = shortTitle(row?.thread_name);
    if (typeof sessionId !== 'string' || title === null) continue;
    index.set(sessionId, { title, updatedAt: timestamp(row?.updated_at) });
  }

  const sessions = new Map<string, NativeCliChatSession>();
  for (const path of await jsonlFiles(join(homeDir, '.codex', 'sessions'))) {
    const rows = (await parseJsonLines(path)).map(record).filter((row) => row !== null);
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
    let latest = Math.max(await fileModifiedAt(path), indexed?.updatedAt ?? 0);
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
    cacheSessionFile({ homeDir, projectRoot, cli: 'codex', sessionId }, path);
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

async function claudeSessions(
  homeDir: string,
  projectRoot: string,
): Promise<NativeCliChatSession[]> {
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

  for (const raw of await parseJsonLines(join(homeDir, '.claude', 'history.jsonl'))) {
    const row = record(raw);
    if (!sameProject(row?.project, projectRoot) || typeof row?.sessionId !== 'string') continue;
    const candidate = ensure(row.sessionId);
    candidate.matchesProject = true;
    candidate.title = shortTitle(row.display) ?? candidate.title;
    candidate.updatedAt = Math.max(candidate.updatedAt, timestamp(row.timestamp));
  }

  const projectDirectory = projectRoot.replace(/[\\/]/g, '-');
  for (const path of await jsonlFiles(join(homeDir, '.claude', 'projects', projectDirectory))) {
    const fallbackTime = await fileModifiedAt(path);
    for (const raw of await parseJsonLines(path)) {
      const row = record(raw);
      if (typeof row?.sessionId !== 'string') continue;
      const candidate = ensure(row.sessionId);
      candidate.matchesProject ||= sameProject(row.cwd, projectRoot);
      if (candidate.matchesProject) {
        cacheSessionFile({ homeDir, projectRoot, cli: 'claude', sessionId: row.sessionId }, path);
      }
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
export async function listNativeCliChatSessions(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
}): Promise<NativeCliChatSession[]> {
  return [
    ...(await codexSessions(options.homeDir, options.projectRoot)),
    ...(await claudeSessions(options.homeDir, options.projectRoot)),
  ]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_SESSIONS);
}

async function readCodexTranscript(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
  readonly sessionId: string;
}): Promise<NativeCliChatMessage[]> {
  const cacheOptions = { ...options, cli: 'codex' as const };
  const cachedPath = sessionFileCache.get(sessionCacheKey(cacheOptions));
  const paths =
    cachedPath === undefined
      ? await jsonlFiles(join(options.homeDir, '.codex', 'sessions'))
      : [cachedPath];
  for (const path of paths) {
    const rows = (await parseJsonLines(path)).map(record).filter((row) => row !== null);
    const meta = rows.find((row) => row.type === 'session_meta');
    const payload = record(meta?.payload);
    const id =
      typeof payload?.id === 'string'
        ? payload.id
        : typeof payload?.session_id === 'string'
          ? payload.session_id
          : null;
    if (id !== options.sessionId || !sameProject(payload?.cwd, options.projectRoot)) continue;
    cacheSessionFile(cacheOptions, path);

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

async function readClaudeTranscript(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
  readonly sessionId: string;
}): Promise<NativeCliChatMessage[]> {
  const cacheOptions = { ...options, cli: 'claude' as const };
  const cachedPath = sessionFileCache.get(sessionCacheKey(cacheOptions));
  const projectDirectory = options.projectRoot.replace(/[\\/]/g, '-');
  const paths =
    cachedPath === undefined
      ? await jsonlFiles(join(options.homeDir, '.claude', 'projects', projectDirectory))
      : [cachedPath];
  for (const path of paths) {
    const rows = (await parseJsonLines(path)).map(record).filter((row) => row !== null);
    const belongsToSession = rows.some(
      (row) => row.sessionId === options.sessionId && sameProject(row.cwd, options.projectRoot),
    );
    if (!belongsToSession) continue;
    cacheSessionFile(cacheOptions, path);

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
export async function readNativeCliChatSession(options: {
  readonly homeDir: string;
  readonly projectRoot: string;
  readonly cli: 'codex' | 'claude';
  readonly sessionId: string;
}): Promise<NativeCliChatMessage[]> {
  return options.cli === 'codex' ? readCodexTranscript(options) : readClaudeTranscript(options);
}
