import { open, readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const MAX_SESSIONS = 40;
const MAX_TITLE_LENGTH = 36;
const MAX_TRANSCRIPT_MESSAGES = 400;
const MAX_TRANSCRIPT_CHARACTERS = 1_000_000;
const SESSION_LIST_SAMPLE_BYTES = 64 * 1024;
const SESSION_LIST_PROMPT_BYTES = 2 * 1024 * 1024;
const SESSION_LIST_READ_CONCURRENCY = 12;
const sessionFileCache = new Map<string, string>();
const sessionListInFlight = new Map<string, Promise<NativeCliChatSession[]>>();

interface JsonLineSample {
  readonly modifiedAt: number;
  readonly rows: unknown[];
  readonly size: number;
}

interface JsonLineSampleCacheEntry extends JsonLineSample {
  readonly mode: 'head' | 'head-tail';
}

const jsonLineSampleCache = new Map<string, JsonLineSampleCacheEntry>();

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

function parseJsonLineText(text: string): unknown[] {
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        return [];
      }
    });
}

async function parseJsonLines(path: string): Promise<unknown[]> {
  try {
    return parseJsonLineText(await readFile(path, 'utf8'));
  } catch {
    return [];
  }
}

function parseCompleteJsonLines(
  text: string,
  options: { dropFirstPartial?: boolean; dropLastPartial?: boolean },
): unknown[] {
  const lines = text.split('\n');
  if (options.dropFirstPartial) lines.shift();
  if (options.dropLastPartial && !text.endsWith('\n')) lines.pop();
  return lines.flatMap((line) => {
    if (line === '') return [];
    try {
      return [JSON.parse(line) as unknown];
    } catch {
      return [];
    }
  });
}

async function sampleJsonLines(path: string, mode: 'head' | 'head-tail'): Promise<JsonLineSample> {
  try {
    const info = await stat(path);
    const cached = jsonLineSampleCache.get(path);
    if (cached?.mode === mode && cached.size === info.size && cached.modifiedAt === info.mtimeMs) {
      return cached;
    }

    const handle = await open(path, 'r');
    try {
      const headLength = Math.min(info.size, SESSION_LIST_SAMPLE_BYTES);
      const head = Buffer.alloc(headLength);
      if (headLength > 0) await handle.read(head, 0, headLength, 0);
      const rows = parseCompleteJsonLines(head.toString('utf8'), {
        dropLastPartial: headLength < info.size,
      });

      if (mode === 'head-tail' && info.size > headLength) {
        // Listing needs identity/title metadata, not transcript bodies. Claude
        // writes project/session identity near the front and generated-title /
        // last-prompt records near the end, so bounded windows preserve useful
        // labels without reading multi-megabyte tool and assistant payloads.
        const tailStart = Math.max(headLength, info.size - SESSION_LIST_SAMPLE_BYTES);
        const tailLength = info.size - tailStart;
        const tail = Buffer.alloc(tailLength);
        if (tailLength > 0) await handle.read(tail, 0, tailLength, tailStart);
        rows.push(
          ...parseCompleteJsonLines(tail.toString('utf8'), {
            dropFirstPartial: tailStart > 0,
          }),
        );
      }

      const sample: JsonLineSampleCacheEntry = {
        mode,
        modifiedAt: info.mtimeMs,
        rows,
        size: info.size,
      };
      jsonLineSampleCache.set(path, sample);
      return sample;
    } finally {
      await handle.close();
    }
  } catch {
    return { modifiedAt: 0, rows: [], size: 0 };
  }
}

async function readJsonLinesPrefix(path: string, maxBytes: number): Promise<unknown[]> {
  try {
    const info = await stat(path);
    const length = Math.min(info.size, maxBytes);
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(length);
      if (length > 0) await handle.read(buffer, 0, length, 0);
      return parseCompleteJsonLines(buffer.toString('utf8'), {
        dropLastPartial: length < info.size,
      });
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapValue: (value: T) => Promise<R>,
): Promise<R[]> {
  if (values.length === 0) return [];
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapValue(values[index] as T);
      }
    },
  );
  await Promise.all(workers);
  return results;
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

/** The chat transport rewrites every newline as U+2028 so a multi-line prompt
 * survives the PTY's readline, and that separator is what both CLIs persist in
 * their transcripts. Restore real line breaks before the stored prompt is
 * matched against the context envelope or shown to the user. */
function restoreTransportLineBreaks(text: string): string {
  return text.replaceAll('\u2028', '\n');
}

function visibleUserPrompt(value: unknown): string | null {
  const text = messageText(value);
  if (text === null) return null;
  const restored = restoreTransportLineBreaks(text);
  const marker = '\n\nUser request:\n';
  const markerIndex = restored.lastIndexOf(marker);
  const hasSynapseNoteContext =
    restored.includes('<current_document>') ||
    restored.includes('<selected_document>') ||
    restored.includes('<attached_images>');
  return hasSynapseNoteContext && markerIndex >= 0
    ? messageText(restored.slice(markerIndex + marker.length))
    : restored;
}

function firstCodexPrompt(rows: readonly Record<string, unknown>[]): string | null {
  for (const row of rows) {
    const event = record(row.payload);
    if (row.type !== 'event_msg' || event?.type !== 'user_message') continue;
    const title = shortTitle(visibleUserPrompt(event.message));
    if (title !== null) return title;
  }
  return null;
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
    const entries = await readdir(root, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry): Promise<string[]> => {
        const path = join(root, entry.name);
        if (entry.isDirectory()) return jsonlFiles(path, depth + 1);
        return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : [];
      }),
    );
    return files.flat();
  } catch {
    return [];
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

  const paths = await jsonlFiles(join(homeDir, '.codex', 'sessions'));
  // session_meta is the first rollout record and the native session index owns
  // the preferred title. A small prefix is therefore enough to prove project
  // ownership and derive the rare unindexed fallback title; full parsing is
  // reserved for readCodexTranscript after the user opens one chat.
  const discovered = await mapWithConcurrency(
    paths,
    SESSION_LIST_READ_CONCURRENCY,
    async (path): Promise<NativeCliChatSession | null> => {
      const sample = await sampleJsonLines(path, 'head');
      const rows = sample.rows.map(record).filter((row) => row !== null);
      const meta = rows.find((row) => row.type === 'session_meta');
      const payload = record(meta?.payload);
      if (!sameProject(payload?.cwd, projectRoot)) return null;
      const sessionId =
        typeof payload?.id === 'string'
          ? payload.id
          : typeof payload?.session_id === 'string'
            ? payload.session_id
            : null;
      if (sessionId === null) return null;

      const indexed = index.get(sessionId);
      let firstPrompt = firstCodexPrompt(rows);
      let latest = Math.max(sample.modifiedAt, indexed?.updatedAt ?? 0);
      for (const row of rows) {
        latest = Math.max(latest, timestamp(row.timestamp));
      }
      if (
        indexed === undefined &&
        firstPrompt === null &&
        sample.size > SESSION_LIST_SAMPLE_BYTES
      ) {
        // SynapseNote context can make the first user-message JSONL record
        // larger than the 64KB ownership sample. Only the already-matched,
        // unindexed sessions pay this bounded fallback read; unrelated
        // transcripts are never expanded.
        const promptRows = (await readJsonLinesPrefix(path, SESSION_LIST_PROMPT_BYTES))
          .map(record)
          .filter((row) => row !== null);
        firstPrompt = firstCodexPrompt(promptRows);
      }
      cacheSessionFile({ homeDir, projectRoot, cli: 'codex', sessionId }, path);
      return {
        cli: 'codex',
        sessionId,
        title: indexed?.title ?? firstPrompt ?? 'Codex chat',
        updatedAt: latest,
      };
    },
  );
  const sessions = new Map<string, NativeCliChatSession>();
  for (const session of discovered) {
    if (session !== null) sessions.set(session.sessionId, session);
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
  const paths = await jsonlFiles(join(homeDir, '.claude', 'projects', projectDirectory));
  const samples = await mapWithConcurrency(paths, SESSION_LIST_READ_CONCURRENCY, async (path) => ({
    path,
    sample: await sampleJsonLines(path, 'head-tail'),
  }));
  for (const { path, sample } of samples) {
    for (const raw of sample.rows) {
      const row = record(raw);
      if (typeof row?.sessionId !== 'string') continue;
      const candidate = ensure(row.sessionId);
      candidate.matchesProject ||= sameProject(row.cwd, projectRoot);
      if (candidate.matchesProject) {
        cacheSessionFile({ homeDir, projectRoot, cli: 'claude', sessionId: row.sessionId }, path);
      }
      candidate.updatedAt = Math.max(
        candidate.updatedAt,
        timestamp(row.timestamp, sample.modifiedAt),
      );
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
  const cacheKey = `${resolve(options.homeDir)}\u0000${resolve(options.projectRoot)}`;
  const pending = sessionListInFlight.get(cacheKey);
  // The sidebar and chat tab strip mount together and request the same list.
  // Share that discovery pass instead of scanning the native stores twice.
  if (pending !== undefined) return pending;

  const task = Promise.all([
    codexSessions(options.homeDir, options.projectRoot),
    claudeSessions(options.homeDir, options.projectRoot),
  ]).then(([codex, claude]) =>
    [...codex, ...claude]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_SESSIONS),
  );
  sessionListInFlight.set(cacheKey, task);
  void task.then(
    () => {
      if (sessionListInFlight.get(cacheKey) === task) sessionListInFlight.delete(cacheKey);
    },
    () => {
      if (sessionListInFlight.get(cacheKey) === task) sessionListInFlight.delete(cacheKey);
    },
  );
  return task;
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
