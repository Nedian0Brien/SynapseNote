const MAX_PROMPT_BYTES = 256 * 1024;
export const DATABASE_AGENT_PROMPT_RETENTION_MAX_SECONDS = 7 * 24 * 60 * 60;

export interface DatabaseAgentPromptRetentionMetadata {
  runId: string;
  storage: 'process_memory';
  retainedAt: string;
  expiresAt: string;
  bytes: number;
}

export type DatabaseAgentPromptRetentionErrorCode =
  | 'prompt_retention_invalid'
  | 'prompt_retention_not_found';

export class DatabaseAgentPromptRetentionError extends Error {
  readonly code: DatabaseAgentPromptRetentionErrorCode;

  constructor(code: DatabaseAgentPromptRetentionErrorCode, message: string) {
    super(message);
    this.name = 'DatabaseAgentPromptRetentionError';
    this.code = code;
  }
}

interface RetainedPrompt extends DatabaseAgentPromptRetentionMetadata {
  prompt: string;
  timer: ReturnType<typeof setTimeout>;
}

export class DatabaseAgentPromptRetentionStore {
  readonly #now: () => Date;
  readonly #entries = new Map<string, RetainedPrompt>();

  constructor(options: { now?: () => Date } = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  retain(input: {
    runId: string;
    prompt: string;
    consent: true;
    ttlSeconds: number;
  }): DatabaseAgentPromptRetentionMetadata {
    const bytes = Buffer.byteLength(input.prompt, 'utf8');
    if (
      input.consent !== true ||
      !input.runId.startsWith('run_') ||
      bytes === 0 ||
      bytes > MAX_PROMPT_BYTES ||
      !Number.isInteger(input.ttlSeconds) ||
      input.ttlSeconds < 60 ||
      input.ttlSeconds > DATABASE_AGENT_PROMPT_RETENTION_MAX_SECONDS
    ) {
      throw new DatabaseAgentPromptRetentionError(
        'prompt_retention_invalid',
        'Prompt retention requires explicit consent, a non-empty bounded prompt, and a TTL from 60 seconds to 7 days',
      );
    }
    this.delete(input.runId);
    const retainedAt = this.#now();
    const expiresAt = new Date(retainedAt.getTime() + input.ttlSeconds * 1_000);
    const timer = setTimeout(() => this.delete(input.runId), input.ttlSeconds * 1_000);
    timer.unref?.();
    const entry: RetainedPrompt = {
      runId: input.runId,
      storage: 'process_memory',
      retainedAt: retainedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      bytes,
      prompt: input.prompt,
      timer,
    };
    this.#entries.set(input.runId, entry);
    return this.#metadata(entry);
  }

  get(runId: string): DatabaseAgentPromptRetentionMetadata & { prompt: string } {
    const entry = this.#active(runId);
    if (!entry) {
      throw new DatabaseAgentPromptRetentionError(
        'prompt_retention_not_found',
        'No active retained prompt exists for this run',
      );
    }
    return { ...this.#metadata(entry), prompt: entry.prompt };
  }

  delete(runId: string): boolean {
    const entry = this.#entries.get(runId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.#entries.delete(runId);
    return true;
  }

  clear(): void {
    for (const runId of this.#entries.keys()) this.delete(runId);
  }

  #active(runId: string): RetainedPrompt | null {
    const entry = this.#entries.get(runId);
    if (!entry) return null;
    if (Date.parse(entry.expiresAt) <= this.#now().getTime()) {
      this.delete(runId);
      return null;
    }
    return entry;
  }

  #metadata(entry: RetainedPrompt): DatabaseAgentPromptRetentionMetadata {
    return {
      runId: entry.runId,
      storage: entry.storage,
      retainedAt: entry.retainedAt,
      expiresAt: entry.expiresAt,
      bytes: entry.bytes,
    };
  }
}

export function createDatabaseAgentPromptRetentionStore(
  options: { now?: () => Date } = {},
): DatabaseAgentPromptRetentionStore {
  return new DatabaseAgentPromptRetentionStore(options);
}
