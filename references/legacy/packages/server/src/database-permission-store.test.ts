import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabasePermissionStore } from './database-permission-store.ts';

const tempDirs: string[] = [];

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

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('DatabasePermissionStore', () => {
  test('accepts a valid pre-public-share policy and upgrades its revision in memory', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-permissions-'));
    tempDirs.push(projectDir);
    const store = createDatabasePermissionStore({ projectDir });
    const created = await store.upsert({
      databaseId: 'db_tasks',
      principalId: 'user:collaborator',
      actions: ['query'],
      actorId: 'user:owner',
      expectedRevision: 'sha256:empty',
    });
    const legacyRevision = `sha256:${createHash('sha256')
      .update(stable(created.state.grants))
      .digest('hex')}`;
    const path = join(projectDir, '.ok', 'local', 'database-permissions', 'v1', 'policy.json');
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, grants: created.state.grants, revision: legacyRevision })}\n`,
      { mode: 0o600 },
    );
    const upgraded = await createDatabasePermissionStore({ projectDir }).snapshot();
    expect(upgraded.publicShares).toEqual({});
    expect(upgraded.revision).toMatch(/^sha256:/);
    expect(upgraded.revision).not.toBe(legacyRevision);
  });

  test('creates, edits, shares, and revokes revision-bound owner-only grants', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-permissions-'));
    tempDirs.push(projectDir);
    let tick = 0;
    const store = createDatabasePermissionStore({
      projectDir,
      now: () => new Date(Date.UTC(2026, 6, 21, 0, 0, tick++)),
    });
    expect(await store.snapshot()).toEqual({
      version: 1,
      grants: {},
      publicShares: {},
      revision: 'sha256:empty',
    });
    const created = await store.upsert({
      databaseId: 'db_tasks',
      principalId: 'user:collaborator',
      actions: ['describe', 'query'],
      actorId: 'user:owner',
      expectedRevision: 'sha256:empty',
    });
    expect(created.grant).toMatchObject({
      databaseId: 'db_tasks',
      principalId: 'user:collaborator',
      actions: ['describe', 'query'],
      createdBy: 'user:owner',
    });
    const persisted = await createDatabasePermissionStore({
      projectDir,
    }).snapshot();
    expect(persisted).toEqual(created.state);
    expect(
      statSync(join(projectDir, '.ok', 'local', 'database-permissions', 'v1', 'policy.json')).mode &
        0o777,
    ).toBe(0o600);

    const edited = await store.upsert({
      id: created.grant.id,
      databaseId: 'db_tasks',
      principalId: 'user:collaborator',
      actions: ['alter_schema', 'describe', 'query'],
      actorId: 'user:owner',
      expectedRevision: created.state.revision,
    });
    expect(edited.grant.createdAt).toBe(created.grant.createdAt);
    expect(edited.grant.updatedAt).not.toBe(created.grant.updatedAt);
    await expect(
      store.remove({
        id: created.grant.id,
        actorId: 'user:owner',
        expectedRevision: created.state.revision,
      }),
    ).rejects.toMatchObject({ code: 'permission_revision_changed' });
    const removed = await store.remove({
      id: created.grant.id,
      actorId: 'user:owner',
      expectedRevision: edited.state.revision,
    });
    expect(removed.grants).toEqual({});
  });

  test('prevents a different manager from replacing or revoking a grant', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-permissions-'));
    tempDirs.push(projectDir);
    const store = createDatabasePermissionStore({ projectDir });
    const created = await store.upsert({
      databaseId: null,
      principalId: 'user:builder',
      actions: ['create_database'],
      actorId: 'user:owner',
      expectedRevision: 'sha256:empty',
    });
    await expect(
      store.upsert({
        id: created.grant.id,
        databaseId: null,
        principalId: 'user:builder',
        actions: ['create_database', 'manage_permissions'],
        actorId: 'user:other',
        expectedRevision: created.state.revision,
      }),
    ).rejects.toMatchObject({ code: 'permission_store_unsafe' });
    await expect(
      store.remove({
        id: created.grant.id,
        actorId: 'user:other',
        expectedRevision: created.state.revision,
      }),
    ).rejects.toMatchObject({ code: 'permission_store_unsafe' });
  });

  test('persists named roles only with their canonical action expansion', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-permissions-'));
    tempDirs.push(projectDir);
    const store = createDatabasePermissionStore({ projectDir });
    await expect(
      store.upsert({
        databaseId: 'db_tasks',
        principalId: 'user:editor',
        role: 'content_editor',
        actions: ['query', 'alter_schema'],
        actorId: 'user:owner',
        expectedRevision: 'sha256:empty',
      }),
    ).rejects.toThrow(/content_editor/);
    const saved = await store.upsert({
      databaseId: 'db_tasks',
      principalId: 'user:editor',
      role: 'content_editor',
      actions: [
        'catalog',
        'describe',
        'read_record',
        'search',
        'query',
        'aggregate',
        'expand_relation',
        'pack_context',
        'create_record',
        'update_record',
        'delete_record',
      ],
      actorId: 'user:owner',
      expectedRevision: 'sha256:empty',
    });
    expect(saved.grant.role).toBe('content_editor');
    expect(saved.grant.actions).toEqual([
      'aggregate',
      'catalog',
      'create_record',
      'delete_record',
      'describe',
      'expand_relation',
      'pack_context',
      'query',
      'read_record',
      'search',
      'update_record',
    ]);
  });

  test('stores only hashed share-link tokens and resolves active policies without an oracle', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-permissions-'));
    tempDirs.push(projectDir);
    const store = createDatabasePermissionStore({
      projectDir,
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });
    const created = await store.upsertPublicShare({
      target: { kind: 'record', databaseId: 'db_tasks', recordId: 'rec_one' },
      access: 'link',
      propertyIds: ['prop_title'],
      allowBody: false,
      allowFormSubmission: false,
      expiresAt: '2026-07-22T00:00:00.000Z',
      actorId: 'user:owner',
      expectedRevision: 'sha256:empty',
    });
    expect(created.token).toMatch(/^dbsharetoken_/);
    expect(created.policy).toMatchObject({
      access: 'link',
      target: { kind: 'record', recordId: 'rec_one' },
      tokenHash: expect.stringMatching(/^sha256:/),
    });
    const serialized = readFileSync(
      join(projectDir, '.ok', 'local', 'database-permissions', 'v1', 'policy.json'),
      'utf8',
    );
    expect(serialized).not.toContain(created.token ?? 'missing-token');
    expect(await store.resolvePublicShare(created.policy.id, 'wrong')).toBeNull();
    expect(
      await store.resolvePublicShare(created.policy.id, created.token ?? undefined),
    ).toMatchObject({
      id: created.policy.id,
      propertyIds: ['prop_title'],
    });

    const rotated = await store.upsertPublicShare({
      id: created.policy.id,
      target: created.policy.target,
      access: 'link',
      propertyIds: ['prop_title'],
      allowBody: true,
      allowFormSubmission: false,
      expiresAt: null,
      rotateToken: true,
      actorId: 'user:owner',
      expectedRevision: created.state.revision,
    });
    expect(rotated.token).toMatch(/^dbsharetoken_/);
    expect(rotated.token).not.toBe(created.token);
    expect(
      await store.resolvePublicShare(created.policy.id, created.token ?? undefined),
    ).toBeNull();
    expect(
      await store.resolvePublicShare(created.policy.id, rotated.token ?? undefined),
    ).not.toBeNull();
    const revoked = await store.revokePublicShare({
      id: created.policy.id,
      actorId: 'user:owner',
      expectedRevision: rotated.state.revision,
    });
    expect(revoked.publicShares[created.policy.id]?.revokedAt).not.toBeNull();
    expect(
      await store.resolvePublicShare(created.policy.id, rotated.token ?? undefined),
    ).toBeNull();
  });
});
