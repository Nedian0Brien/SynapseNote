/** Owner-only local persistence for database and session autonomy policy. */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  DATABASE_AUTONOMY_MODES,
  DATABASE_MUTATION_ACTIONS,
  type DatabaseAutonomyMode,
  type DatabaseAutonomyOperation,
  type DatabaseAutonomyScope,
  type DatabaseAutonomyUsage,
  evaluateDatabaseAutonomy,
} from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import { tracedAtomicFs, tracedMkdir } from './fs-traced.ts';

const RevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);
const MAX_POLICY_BYTES = 1024 * 1024;
const SessionTokenHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const UsageSchema = z
  .object({
    records: z.number().int().nonnegative().max(10_000_000),
    actions: z.number().int().nonnegative().max(1_000_000),
    egressBytes: z.number().int().nonnegative().max(1_000_000_000),
  })
  .strict();
const ScopeSchema = z
  .object({
    databaseIds: z.array(z.string().startsWith('db_')).min(1).max(10_000),
    actions: z.array(z.enum(DATABASE_MUTATION_ACTIONS)).min(1),
    propertyIds: z.array(z.string().startsWith('prop_')).max(10_000),
    allowBody: z.boolean(),
    maxRecordsPerAction: z.number().int().positive().max(100_000),
    maxRecordsTotal: z.number().int().positive().max(10_000_000),
    maxActionsTotal: z.number().int().positive().max(1_000_000),
    maxEgressBytesTotal: z.number().int().nonnegative().max(1_000_000_000),
    notBefore: z.string().datetime().optional(),
    expiresAt: z.string().datetime(),
  })
  .strict()
  .superRefine((scope, context) => {
    if (new Set(scope.databaseIds).size !== scope.databaseIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['databaseIds'],
        message: 'Database IDs must be unique',
      });
    }
    if (new Set(scope.actions).size !== scope.actions.length) {
      context.addIssue({ code: 'custom', path: ['actions'], message: 'Actions must be unique' });
    }
    if (new Set(scope.propertyIds).size !== scope.propertyIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['propertyIds'],
        message: 'Property IDs must be unique',
      });
    }
    if (scope.notBefore && Date.parse(scope.notBefore) >= Date.parse(scope.expiresAt)) {
      context.addIssue({
        code: 'custom',
        path: ['notBefore'],
        message: 'notBefore must precede expiresAt',
      });
    }
  });
const StateSchema = z
  .object({
    version: z.literal(1),
    databases: z.record(
      z.string().startsWith('db_'),
      z
        .object({ mode: z.enum(DATABASE_AUTONOMY_MODES), updatedAt: z.string().datetime() })
        .strict(),
    ),
    sessions: z.record(
      z.string().min(1).max(256),
      z
        .object({
          mode: z.enum(DATABASE_AUTONOMY_MODES),
          delegation: ScopeSchema.nullable(),
          sessionTokenHash: SessionTokenHashSchema.nullable(),
          usage: UsageSchema,
          consumedRequestIds: z.array(z.string().regex(/^sha256:[a-f0-9]{64}$/)).max(10_000),
          updatedAt: z.string().datetime(),
        })
        .strict(),
    ),
    revision: RevisionSchema,
    usageRevision: RevisionSchema,
  })
  .strict()
  .superRefine((state, context) => {
    if (Object.keys(state.databases).length > 10_000) {
      context.addIssue({
        code: 'custom',
        path: ['databases'],
        message: 'Database policy limit exceeded',
      });
    }
    if (Object.keys(state.sessions).length > 10_000) {
      context.addIssue({
        code: 'custom',
        path: ['sessions'],
        message: 'Session policy limit exceeded',
      });
    }
    for (const [sessionId, session] of Object.entries(state.sessions)) {
      if ((session.mode === 'autonomous') !== (session.delegation !== null)) {
        context.addIssue({
          code: 'custom',
          path: ['sessions', sessionId, 'delegation'],
          message: 'Only Autonomous sessions require and may carry delegation scope',
        });
      }
      if ((session.mode !== 'review') !== (session.sessionTokenHash !== null)) {
        context.addIssue({
          code: 'custom',
          path: ['sessions', sessionId, 'sessionTokenHash'],
          message: 'Balanced and Autonomous sessions require a server-issued session token',
        });
      }
      if (new Set(session.consumedRequestIds).size !== session.consumedRequestIds.length) {
        context.addIssue({
          code: 'custom',
          path: ['sessions', sessionId, 'consumedRequestIds'],
          message: 'Consumed autonomy request IDs must be unique',
        });
      }
    }
  });

export type DatabaseAutonomyState = z.infer<typeof StateSchema>;
export interface ResolvedDatabaseAutonomyPolicy {
  databaseMode: DatabaseAutonomyMode | undefined;
  sessionMode: DatabaseAutonomyMode | undefined;
  delegation: DatabaseAutonomyScope | undefined;
  usage: DatabaseAutonomyUsage;
  revision: string;
  usageRevision: string;
}

export interface SetDatabaseAutonomySessionPolicyResult {
  state: DatabaseAutonomyState;
  /** Returned once. Only its SHA-256 digest is persisted. */
  sessionToken: string | null;
}

export type DatabaseAutonomyStoreErrorCode =
  | 'autonomy_revision_changed'
  | 'autonomy_budget_exceeded'
  | 'autonomy_store_unsafe'
  | 'autonomy_store_corrupt'
  | 'autonomy_store_io_error';

export class DatabaseAutonomyStoreError extends Error {
  readonly code: DatabaseAutonomyStoreErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseAutonomyStoreErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseAutonomyStoreError';
    this.code = code;
    this.details = details;
  }
}

function errno(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashSessionToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

function sessionTokenMatches(expectedHash: string, token: string | undefined): boolean {
  if (!token) return false;
  const actual = Buffer.from(hashSessionToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type DatabaseAutonomyStateBody = Omit<DatabaseAutonomyState, 'revision' | 'usageRevision'>;

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}

function policyRevisionFor(state: DatabaseAutonomyStateBody): string {
  return digest({
    version: state.version,
    databases: state.databases,
    sessions: Object.fromEntries(
      Object.entries(state.sessions).map(([sessionId, session]) => [
        sessionId,
        {
          mode: session.mode,
          delegation: session.delegation,
          sessionTokenHash: session.sessionTokenHash,
          updatedAt: session.updatedAt,
        },
      ]),
    ),
  });
}

function usageRevisionFor(state: DatabaseAutonomyStateBody): string {
  return digest(
    Object.fromEntries(
      Object.entries(state.sessions).map(([sessionId, session]) => [
        sessionId,
        { usage: session.usage, consumedRequestIds: session.consumedRequestIds },
      ]),
    ),
  );
}

function emptyState(): DatabaseAutonomyState {
  return {
    version: 1,
    databases: {},
    sessions: {},
    revision: 'sha256:empty',
    usageRevision: 'sha256:empty',
  };
}

function finalize(state: DatabaseAutonomyStateBody): DatabaseAutonomyState {
  return StateSchema.parse({
    ...state,
    revision: policyRevisionFor(state),
    usageRevision: usageRevisionFor(state),
  });
}

export class DatabaseAutonomyStore {
  readonly #projectDir: string;
  readonly #root: string;
  readonly #path: string;
  readonly #lockPath: string;
  readonly #commitLockPath: string;
  readonly #now: () => Date;

  constructor(options: { projectDir: string; now?: () => Date }) {
    this.#projectDir = resolve(options.projectDir);
    this.#root = resolve(this.#projectDir, '.ok', 'local', 'database-autonomy', 'v1');
    this.#path = resolve(this.#root, 'policy.json');
    this.#lockPath = resolve(this.#root, '.policy.lock');
    this.#commitLockPath = resolve(this.#projectDir, '.ok', 'databases', '.commit.lock');
    this.#now = options.now ?? (() => new Date());
  }

  async snapshot(): Promise<DatabaseAutonomyState> {
    await this.#assertSafeRoot(false);
    return structuredClone(await this.#read());
  }

  async setDatabaseMode(input: {
    databaseId: string;
    mode: DatabaseAutonomyMode;
    expectedRevision: string;
  }): Promise<DatabaseAutonomyState> {
    return this.#update(input.expectedRevision, (current) => ({
      ...current,
      databases: {
        ...current.databases,
        [input.databaseId]: { mode: input.mode, updatedAt: this.#now().toISOString() },
      },
    }));
  }

  async setSessionPolicy(input: {
    sessionId: string;
    mode: DatabaseAutonomyMode;
    delegation?: DatabaseAutonomyScope;
    expectedRevision: string;
  }): Promise<SetDatabaseAutonomySessionPolicyResult> {
    const sessionToken =
      input.mode === 'review' ? null : `dbsession_${randomBytes(32).toString('base64url')}`;
    const state = await this.#update(input.expectedRevision, (current) => ({
      ...current,
      sessions: {
        ...current.sessions,
        [input.sessionId]: {
          mode: input.mode,
          delegation: input.delegation ? ScopeSchema.parse(input.delegation) : null,
          sessionTokenHash: sessionToken ? hashSessionToken(sessionToken) : null,
          usage: { records: 0, actions: 0, egressBytes: 0 },
          consumedRequestIds: [],
          updatedAt: this.#now().toISOString(),
        },
      },
    }));
    return { state, sessionToken };
  }

  async clearDatabaseMode(input: {
    databaseId: string;
    expectedRevision: string;
  }): Promise<DatabaseAutonomyState> {
    return this.#update(input.expectedRevision, (current) => {
      const databases = { ...current.databases };
      delete databases[input.databaseId];
      return { ...current, databases };
    });
  }

  async clearSessionPolicy(input: {
    sessionId: string;
    expectedRevision: string;
  }): Promise<DatabaseAutonomyState> {
    return this.#update(input.expectedRevision, (current) => {
      const sessions = { ...current.sessions };
      delete sessions[input.sessionId];
      return { ...current, sessions };
    });
  }

  async resolve(
    databaseId: string,
    sessionId: string | undefined,
    sessionToken?: string,
  ): Promise<ResolvedDatabaseAutonomyPolicy> {
    const state = await this.snapshot();
    const candidate = sessionId ? state.sessions[sessionId] : undefined;
    const session =
      candidate?.mode === 'review' ||
      (candidate?.sessionTokenHash && sessionTokenMatches(candidate.sessionTokenHash, sessionToken))
        ? candidate
        : undefined;
    const delegation =
      session?.delegation && Date.parse(session.delegation.expiresAt) > this.#now().getTime()
        ? session.delegation
        : undefined;
    return {
      databaseMode: state.databases[databaseId]?.mode,
      sessionMode: session?.mode,
      delegation,
      usage: session?.usage ?? { records: 0, actions: 0, egressBytes: 0 },
      revision: state.revision,
      usageRevision: state.usageRevision,
    };
  }

  /**
   * Conservatively consumes cumulative autonomy budgets before mutation. The
   * request hash makes retries idempotent. Production calls this while holding
   * the database commit lock; the policy lock still makes direct calls safe.
   */
  async consume(input: {
    databaseId: string;
    sessionId: string;
    sessionToken: string;
    expectedRevision: string;
    requestId: string;
    operations: readonly DatabaseAutonomyOperation[];
  }): Promise<DatabaseAutonomyState> {
    RevisionSchema.parse(input.expectedRevision);
    SessionTokenHashSchema.parse(input.requestId);
    if (input.operations.length === 0) {
      throw new DatabaseAutonomyStoreError(
        'autonomy_budget_exceeded',
        'An automatic commit must consume at least one delegated action',
      );
    }
    await this.#assertSafeRoot(true);
    return withFileLock(this.#lockPath, async () => {
      const current = await this.#read();
      if (current.revision !== input.expectedRevision) {
        throw new DatabaseAutonomyStoreError(
          'autonomy_revision_changed',
          'Database autonomy policy changed before budget consumption',
          { expectedRevision: input.expectedRevision, observedRevision: current.revision },
        );
      }
      const session = current.sessions[input.sessionId];
      if (
        !session ||
        session.mode === 'review' ||
        !session.sessionTokenHash ||
        !sessionTokenMatches(session.sessionTokenHash, input.sessionToken)
      ) {
        throw new DatabaseAutonomyStoreError(
          'autonomy_budget_exceeded',
          'The autonomy session capability is missing, revoked, or invalid',
        );
      }
      if (session.consumedRequestIds.includes(input.requestId)) return structuredClone(current);
      let usage = { ...session.usage };
      const databaseMode = current.databases[input.databaseId]?.mode;
      for (const operation of input.operations) {
        const decision = evaluateDatabaseAutonomy({
          ...operation,
          databaseId: input.databaseId,
          databaseMode,
          sessionMode: session.mode,
          delegation: session.delegation ?? undefined,
          usage,
          now: this.#now(),
        });
        if (decision.decision !== 'allow') {
          throw new DatabaseAutonomyStoreError(
            'autonomy_budget_exceeded',
            'The current autonomy delegation cannot cover this commit',
            { reasons: decision.reasons },
          );
        }
        usage = {
          records: usage.records + operation.recordCount,
          actions: usage.actions + 1,
          egressBytes: usage.egressBytes + (operation.externalEgressBytes ?? 0),
        };
      }
      const { revision: _revision, usageRevision: _usageRevision, ...body } = current;
      return this.#persist(
        finalize({
          ...body,
          sessions: {
            ...body.sessions,
            [input.sessionId]: {
              ...session,
              usage,
              consumedRequestIds: [...session.consumedRequestIds, input.requestId],
            },
          },
        }),
      );
    });
  }

  async #update(
    expectedRevision: string,
    mutate: (current: DatabaseAutonomyStateBody) => DatabaseAutonomyStateBody,
  ): Promise<DatabaseAutonomyState> {
    RevisionSchema.parse(expectedRevision);
    await this.#assertSafeRoot(true);
    await this.#assertCommitRoot();
    return withFileLock(this.#commitLockPath, () =>
      withFileLock(this.#lockPath, async () => {
        const current = await this.#read();
        if (current.revision !== expectedRevision) {
          throw new DatabaseAutonomyStoreError(
            'autonomy_revision_changed',
            'Database autonomy policy changed since it was read',
            { expectedRevision, observedRevision: current.revision },
          );
        }
        const { revision: _revision, usageRevision: _usageRevision, ...body } = current;
        return this.#persist(finalize(mutate(body)));
      }),
    );
  }

  async #persist(next: DatabaseAutonomyState): Promise<DatabaseAutonomyState> {
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_POLICY_BYTES) {
      throw new DatabaseAutonomyStoreError(
        'autonomy_store_io_error',
        'Database autonomy policy exceeds its durable size limit',
        { maxBytes: MAX_POLICY_BYTES },
      );
    }
    await atomicWriteFile(this.#path, serialized, {
      fs: tracedAtomicFs,
      mode: 0o600,
    });
    return structuredClone(next);
  }

  async #read(): Promise<DatabaseAutonomyState> {
    try {
      const stats = await lstat(this.#path);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new DatabaseAutonomyStoreError(
          'autonomy_store_unsafe',
          'Database autonomy policy is not a safe regular file',
        );
      }
      const serialized = await readFile(this.#path, 'utf8');
      if (Buffer.byteLength(serialized, 'utf8') > MAX_POLICY_BYTES) {
        throw new DatabaseAutonomyStoreError(
          'autonomy_store_corrupt',
          'Database autonomy policy exceeds its durable size limit',
        );
      }
      const state = StateSchema.parse(JSON.parse(serialized));
      const { revision, usageRevision, ...body } = state;
      if (revision !== policyRevisionFor(body) || usageRevision !== usageRevisionFor(body)) {
        throw new DatabaseAutonomyStoreError(
          'autonomy_store_corrupt',
          'Database autonomy policy or usage revision does not match its content',
        );
      }
      return state;
    } catch (error) {
      if (error instanceof DatabaseAutonomyStoreError) throw error;
      if (errno(error) === 'ENOENT') return emptyState();
      throw new DatabaseAutonomyStoreError(
        'autonomy_store_corrupt',
        'Database autonomy policy is corrupt or unreadable',
        {},
        error,
      );
    }
  }

  async #assertSafeRoot(create: boolean): Promise<void> {
    let current = this.#projectDir;
    for (const segment of ['.ok', 'local', 'database-autonomy', 'v1']) {
      current = resolve(current, segment);
      try {
        const stats = await lstat(current);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw new DatabaseAutonomyStoreError(
            'autonomy_store_unsafe',
            'Database autonomy storage path is not a safe directory',
            { path: current },
          );
        }
      } catch (error) {
        if (error instanceof DatabaseAutonomyStoreError) throw error;
        if (errno(error) !== 'ENOENT') {
          throw new DatabaseAutonomyStoreError(
            'autonomy_store_io_error',
            'Database autonomy storage path cannot be inspected',
            { path: current },
            error,
          );
        }
        if (!create) return;
        try {
          await tracedMkdir(current, { recursive: false, mode: 0o700 });
        } catch (mkdirError) {
          if (errno(mkdirError) !== 'EEXIST') throw mkdirError;
          const stats = await lstat(current);
          if (stats.isSymbolicLink() || !stats.isDirectory()) {
            throw new DatabaseAutonomyStoreError(
              'autonomy_store_unsafe',
              'Database autonomy storage path raced with an unsafe filesystem entry',
              { path: current },
            );
          }
        }
      }
    }
  }

  async #assertCommitRoot(): Promise<void> {
    const path = resolve(this.#projectDir, '.ok', 'databases');
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new DatabaseAutonomyStoreError(
          'autonomy_store_unsafe',
          'Database commit coordination path is not a safe directory',
          { path },
        );
      }
    } catch (error) {
      if (error instanceof DatabaseAutonomyStoreError) throw error;
      if (errno(error) !== 'ENOENT') throw error;
      try {
        await tracedMkdir(path, { recursive: false, mode: 0o700 });
      } catch (mkdirError) {
        if (errno(mkdirError) !== 'EEXIST') throw mkdirError;
        const stats = await lstat(path);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw new DatabaseAutonomyStoreError(
            'autonomy_store_unsafe',
            'Database commit coordination path raced with an unsafe filesystem entry',
            { path },
          );
        }
      }
    }
  }
}

export function createDatabaseAutonomyStore(options: {
  projectDir: string;
  now?: () => Date;
}): DatabaseAutonomyStore {
  return new DatabaseAutonomyStore(options);
}
