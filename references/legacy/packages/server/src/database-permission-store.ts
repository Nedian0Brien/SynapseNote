/** Owner-only local persistence for database action grants. */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  DATABASE_PERMISSION_ACTIONS,
  DATABASE_PERMISSION_ROLES,
  type DatabasePermissionAction,
  type DatabasePermissionRole,
  type DatabasePublicSharePolicy,
  DatabasePublicSharePolicySchema,
  type DatabasePublicShareTarget,
  databasePermissionRoleActions,
  databasePublicShareIsActive,
} from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';
import { tracedAtomicFs, tracedMkdir } from './fs-traced.ts';

const RevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);
const MAX_POLICY_BYTES = 1024 * 1024;
const GrantSchema = z
  .object({
    id: z.string().regex(/^dbgrant_[a-f0-9-]{36}$/),
    databaseId: z.string().startsWith('db_').nullable(),
    principalId: z.string().trim().min(1).max(256),
    role: z.enum(DATABASE_PERMISSION_ROLES),
    actions: z
      .array(z.enum(DATABASE_PERMISSION_ACTIONS))
      .min(1)
      .max(DATABASE_PERMISSION_ACTIONS.length),
    createdBy: z.string().trim().min(1).max(256),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((grant, context) => {
    if (new Set(grant.actions).size !== grant.actions.length) {
      context.addIssue({
        code: 'custom',
        path: ['actions'],
        message: 'Actions must be unique',
      });
    }
    if (grant.role !== 'custom') {
      const expected = [...databasePermissionRoleActions(grant.role)].sort();
      const actual = [...grant.actions].sort();
      if (
        expected.length !== actual.length ||
        expected.some((action, index) => action !== actual[index])
      ) {
        context.addIssue({
          code: 'custom',
          path: ['actions'],
          message: `Actions must exactly match the ${grant.role} role`,
        });
      }
    }
  });
const StateSchema = z
  .object({
    version: z.literal(1),
    grants: z.record(z.string(), GrantSchema),
    publicShares: z.record(z.string(), DatabasePublicSharePolicySchema).default({}),
    revision: RevisionSchema,
  })
  .strict();

export type DatabasePermissionGrant = z.infer<typeof GrantSchema>;
export type DatabasePermissionState = z.infer<typeof StateSchema>;

export class DatabasePermissionStoreError extends Error {
  readonly code:
    | 'permission_revision_changed'
    | 'permission_store_unsafe'
    | 'permission_store_corrupt'
    | 'permission_store_io_error';
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabasePermissionStoreError['code'],
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabasePermissionStoreError';
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

type DatabasePermissionStateBody = Omit<DatabasePermissionState, 'revision'>;

function finalize(body: DatabasePermissionStateBody): DatabasePermissionState {
  const grants = Object.fromEntries(
    Object.entries(body.grants).sort(([left], [right]) => left.localeCompare(right)),
  );
  const publicShares = Object.fromEntries(
    Object.entries(body.publicShares).sort(([left], [right]) => left.localeCompare(right)),
  );
  return StateSchema.parse({
    version: 1,
    grants,
    publicShares,
    revision: `sha256:${createHash('sha256')
      .update(stable({ grants, publicShares }))
      .digest('hex')}`,
  });
}

function emptyState(): DatabasePermissionState {
  return { version: 1, grants: {}, publicShares: {}, revision: 'sha256:empty' };
}

function tokenHash(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

function tokenMatches(expectedHash: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(expectedHash);
  const actual = Buffer.from(tokenHash(token));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class DatabasePermissionStore {
  readonly #projectDir: string;
  readonly #root: string;
  readonly #path: string;
  readonly #lockPath: string;
  readonly #commitLockPath: string;
  readonly #now: () => Date;
  #current: DatabasePermissionState = emptyState();

  constructor(options: { projectDir: string; now?: () => Date }) {
    this.#projectDir = resolve(options.projectDir);
    this.#root = resolve(this.#projectDir, '.ok', 'local', 'database-permissions', 'v1');
    this.#path = resolve(this.#root, 'policy.json');
    this.#lockPath = resolve(this.#root, '.policy.lock');
    this.#commitLockPath = resolve(this.#projectDir, '.ok', 'databases', '.commit.lock');
    this.#now = options.now ?? (() => new Date());
  }

  async snapshot(): Promise<DatabasePermissionState> {
    await this.#assertSafeRoot(false);
    this.#current = await this.#read();
    return structuredClone(this.#current);
  }

  /** Synchronous policy view for the request-time access resolver. */
  current(): DatabasePermissionState {
    return structuredClone(this.#current);
  }

  async upsert(input: {
    id?: string;
    databaseId: string | null;
    principalId: string;
    role?: DatabasePermissionRole;
    actions: readonly DatabasePermissionAction[];
    actorId: string;
    expectedRevision: string;
  }): Promise<{
    state: DatabasePermissionState;
    grant: DatabasePermissionGrant;
  }> {
    let saved: DatabasePermissionGrant | undefined;
    const state = await this.#update(input.expectedRevision, (current) => {
      const id = input.id ?? `dbgrant_${randomUUID()}`;
      const previous = current.grants[id];
      if (previous && previous.createdBy !== input.actorId) {
        throw new DatabasePermissionStoreError(
          'permission_store_unsafe',
          'Only the grant creator may replace this database permission',
          { grantId: id },
        );
      }
      const timestamp = this.#now().toISOString();
      saved = GrantSchema.parse({
        id,
        databaseId: input.databaseId,
        principalId: input.principalId,
        role: input.role ?? 'custom',
        actions: [...input.actions].sort(),
        createdBy: previous?.createdBy ?? input.actorId,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
      return { ...current, grants: { ...current.grants, [id]: saved } };
    });
    if (!saved) throw new Error('Database permission grant was not persisted');
    return { state, grant: structuredClone(saved) };
  }

  async remove(input: {
    id: string;
    actorId: string;
    expectedRevision: string;
  }): Promise<DatabasePermissionState> {
    return this.#update(input.expectedRevision, (current) => {
      const previous = current.grants[input.id];
      if (!previous) return current;
      if (previous.createdBy !== input.actorId) {
        throw new DatabasePermissionStoreError(
          'permission_store_unsafe',
          'Only the grant creator may revoke this database permission',
          { grantId: input.id },
        );
      }
      const grants = { ...current.grants };
      delete grants[input.id];
      return { ...current, grants };
    });
  }

  async upsertPublicShare(input: {
    id?: string;
    target: DatabasePublicShareTarget;
    access: 'public' | 'link';
    propertyIds: readonly string[];
    allowBody: boolean;
    allowFormSubmission: boolean;
    expiresAt: string | null;
    rotateToken?: boolean;
    actorId: string;
    expectedRevision: string;
  }): Promise<{
    state: DatabasePermissionState;
    policy: DatabasePublicSharePolicy;
    /** Returned only when a link token is first issued or explicitly rotated. */
    token: string | null;
  }> {
    let saved: DatabasePublicSharePolicy | undefined;
    let issuedToken: string | null = null;
    const state = await this.#update(input.expectedRevision, (current) => {
      const id = input.id ?? `dbshare_${randomUUID()}`;
      const previous = current.publicShares[id];
      if (previous && previous.createdBy !== input.actorId) {
        throw new DatabasePermissionStoreError(
          'permission_store_unsafe',
          'Only the share creator may replace this public database policy',
          { shareId: id },
        );
      }
      const needsToken =
        input.access === 'link' &&
        (!previous || previous.access !== 'link' || input.rotateToken === true);
      issuedToken = needsToken ? `dbsharetoken_${randomBytes(32).toString('base64url')}` : null;
      const timestamp = this.#now().toISOString();
      saved = DatabasePublicSharePolicySchema.parse({
        version: 1,
        id,
        target: input.target,
        access: input.access,
        propertyIds: [...input.propertyIds].sort(),
        allowBody: input.allowBody,
        allowFormSubmission: input.allowFormSubmission,
        expiresAt: input.expiresAt,
        revokedAt: null,
        tokenHash:
          input.access === 'public'
            ? null
            : issuedToken
              ? tokenHash(issuedToken)
              : previous?.tokenHash,
        createdBy: previous?.createdBy ?? input.actorId,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
      return {
        ...current,
        publicShares: { ...current.publicShares, [id]: saved },
      };
    });
    if (!saved) throw new Error('Database public share policy was not persisted');
    return { state, policy: structuredClone(saved), token: issuedToken };
  }

  async revokePublicShare(input: {
    id: string;
    actorId: string;
    expectedRevision: string;
  }): Promise<DatabasePermissionState> {
    return this.#update(input.expectedRevision, (current) => {
      const previous = current.publicShares[input.id];
      if (!previous) return current;
      if (previous.createdBy !== input.actorId) {
        throw new DatabasePermissionStoreError(
          'permission_store_unsafe',
          'Only the share creator may revoke this public database policy',
          { shareId: input.id },
        );
      }
      const timestamp = this.#now().toISOString();
      return {
        ...current,
        publicShares: {
          ...current.publicShares,
          [input.id]: {
            ...previous,
            revokedAt: timestamp,
            updatedAt: timestamp,
          },
        },
      };
    });
  }

  async resolvePublicShare(id: string, token?: string): Promise<DatabasePublicSharePolicy | null> {
    const policy = (await this.snapshot()).publicShares[id];
    if (!policy || !databasePublicShareIsActive(policy, this.#now())) return null;
    if (policy.access === 'link' && (!policy.tokenHash || !tokenMatches(policy.tokenHash, token))) {
      return null;
    }
    return structuredClone(policy);
  }

  async #update(
    expectedRevision: string,
    mutate: (state: DatabasePermissionStateBody) => DatabasePermissionStateBody,
  ): Promise<DatabasePermissionState> {
    RevisionSchema.parse(expectedRevision);
    await this.#assertSafeRoot(true);
    await this.#assertCommitRoot();
    return withFileLock(this.#commitLockPath, () =>
      withFileLock(this.#lockPath, async () => {
        const current = await this.#read();
        if (current.revision !== expectedRevision) {
          throw new DatabasePermissionStoreError(
            'permission_revision_changed',
            'Database permissions changed since they were read',
            { expectedRevision, observedRevision: current.revision },
          );
        }
        const { revision: _revision, ...body } = current;
        return this.#persist(finalize(mutate(body)));
      }),
    );
  }

  async #persist(next: DatabasePermissionState): Promise<DatabasePermissionState> {
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > MAX_POLICY_BYTES) {
      throw new DatabasePermissionStoreError(
        'permission_store_io_error',
        'Database permission policy exceeds its durable size limit',
      );
    }
    await atomicWriteFile(this.#path, serialized, {
      fs: tracedAtomicFs,
      mode: 0o600,
    });
    this.#current = structuredClone(next);
    return structuredClone(next);
  }

  async #read(): Promise<DatabasePermissionState> {
    try {
      const stats = await lstat(this.#path);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new DatabasePermissionStoreError(
          'permission_store_unsafe',
          'Database permission policy is not a safe regular file',
        );
      }
      const serialized = await readFile(this.#path, 'utf8');
      if (Buffer.byteLength(serialized) > MAX_POLICY_BYTES) {
        throw new DatabasePermissionStoreError(
          'permission_store_corrupt',
          'Database permission policy exceeds its durable size limit',
        );
      }
      const raw: unknown = JSON.parse(serialized);
      const state = StateSchema.parse(raw);
      const { revision, ...body } = state;
      const currentRevision = finalize(body).revision;
      if (revision === currentRevision) return state;
      const isLegacyState =
        !!raw && typeof raw === 'object' && !Array.isArray(raw) && !('publicShares' in raw);
      const legacyRevision = `sha256:${createHash('sha256')
        .update(stable(state.grants))
        .digest('hex')}`;
      if (isLegacyState && revision === legacyRevision) {
        // Upgrade the in-memory revision. The next revision-bound mutation
        // persists the v1 shape with an explicit publicShares collection.
        return finalize(body);
      }
      throw new DatabasePermissionStoreError(
        'permission_store_corrupt',
        'Database permission revision does not match its content',
      );
    } catch (error) {
      if (error instanceof DatabasePermissionStoreError) throw error;
      if (errno(error) === 'ENOENT') return emptyState();
      throw new DatabasePermissionStoreError(
        'permission_store_corrupt',
        'Database permission policy is corrupt or unreadable',
        {},
        error,
      );
    }
  }

  async #assertSafeRoot(create: boolean): Promise<void> {
    let current = this.#projectDir;
    for (const segment of ['.ok', 'local', 'database-permissions', 'v1']) {
      current = resolve(current, segment);
      try {
        const stats = await lstat(current);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw new DatabasePermissionStoreError(
            'permission_store_unsafe',
            'Database permission storage path is not a safe directory',
          );
        }
      } catch (error) {
        if (error instanceof DatabasePermissionStoreError) throw error;
        if (errno(error) !== 'ENOENT') throw error;
        if (!create) return;
        try {
          await tracedMkdir(current, { recursive: false, mode: 0o700 });
        } catch (mkdirError) {
          if (errno(mkdirError) !== 'EEXIST') throw mkdirError;
          const stats = await lstat(current);
          if (stats.isSymbolicLink() || !stats.isDirectory()) {
            throw new DatabasePermissionStoreError(
              'permission_store_unsafe',
              'Database permission storage path raced with an unsafe filesystem entry',
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
      if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('unsafe');
    } catch (error) {
      if (errno(error) !== 'ENOENT') {
        throw new DatabasePermissionStoreError(
          'permission_store_unsafe',
          'Database commit coordination path is unsafe',
          {},
          error,
        );
      }
      try {
        await tracedMkdir(path, { recursive: false, mode: 0o700 });
      } catch (mkdirError) {
        if (errno(mkdirError) !== 'EEXIST') throw mkdirError;
        const stats = await lstat(path);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw new DatabasePermissionStoreError(
            'permission_store_unsafe',
            'Database commit coordination path raced with an unsafe filesystem entry',
          );
        }
      }
    }
  }
}

export function createDatabasePermissionStore(options: {
  projectDir: string;
  now?: () => Date;
}): DatabasePermissionStore {
  return new DatabasePermissionStore(options);
}
