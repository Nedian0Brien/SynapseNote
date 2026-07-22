import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseAutonomyStore } from './database-autonomy-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-autonomy-'));
  tempDirs.push(projectDir);
  let tick = 0;
  const store = createDatabaseAutonomyStore({
    projectDir,
    now: () => new Date(Date.UTC(2026, 6, 20, 0, 0, tick++)),
  });
  return { projectDir, store };
}

describe('DatabaseAutonomyStore', () => {
  test('persists database and session modes with optimistic revisions and owner-only files', async () => {
    const { projectDir, store } = fixture();
    expect(await store.snapshot()).toEqual({
      version: 1,
      databases: {},
      sessions: {},
      revision: 'sha256:empty',
      usageRevision: 'sha256:empty',
    });
    const database = await store.setDatabaseMode({
      databaseId: 'db_tasks',
      mode: 'autonomous',
      expectedRevision: 'sha256:empty',
    });
    const session = await store.setSessionPolicy({
      sessionId: 'session-1',
      mode: 'autonomous',
      expectedRevision: database.revision,
      delegation: {
        databaseIds: ['db_tasks'],
        actions: ['update_record'],
        propertyIds: ['prop_title'],
        allowBody: false,
        maxRecordsPerAction: 20,
        maxRecordsTotal: 100,
        maxActionsTotal: 10,
        maxEgressBytesTotal: 0,
        expiresAt: '2026-07-20T01:00:00.000Z',
      },
    });
    expect(session.sessionToken).toMatch(/^dbsession_/);
    expect(await createDatabaseAutonomyStore({ projectDir }).snapshot()).toEqual(session.state);
    expect(
      await store.resolve('db_tasks', 'session-1', session.sessionToken ?? undefined),
    ).toMatchObject({
      databaseMode: 'autonomous',
      sessionMode: 'autonomous',
      delegation: { maxRecordsPerAction: 20 },
      revision: session.state.revision,
    });
    expect(await store.resolve('db_tasks', 'session-1', 'dbsession_wrong')).toMatchObject({
      databaseMode: 'autonomous',
      sessionMode: undefined,
      delegation: undefined,
    });
    const path = join(projectDir, '.ok', 'local', 'database-autonomy', 'v1', 'policy.json');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    await expect(
      store.setDatabaseMode({
        databaseId: 'db_tasks',
        mode: 'review',
        expectedRevision: database.revision,
      }),
    ).rejects.toMatchObject({ code: 'autonomy_revision_changed' });
  });

  test('drops expired delegation while retaining the restrictive session mode', async () => {
    const { store } = fixture();
    const { state, sessionToken } = await store.setSessionPolicy({
      sessionId: 'session-expired',
      mode: 'autonomous',
      expectedRevision: 'sha256:empty',
      delegation: {
        databaseIds: ['db_tasks'],
        actions: ['bulk_update'],
        propertyIds: [],
        allowBody: false,
        maxRecordsPerAction: 100,
        maxRecordsTotal: 100,
        maxActionsTotal: 1,
        maxEgressBytesTotal: 0,
        expiresAt: '2026-07-19T23:59:59.000Z',
      },
    });
    expect(await store.resolve('db_tasks', 'session-expired', sessionToken ?? undefined)).toEqual({
      databaseMode: undefined,
      sessionMode: 'autonomous',
      delegation: undefined,
      usage: { records: 0, actions: 0, egressBytes: 0 },
      revision: state.revision,
      usageRevision: state.usageRevision,
    });
  });

  test('durably and idempotently consumes cumulative delegation budgets', async () => {
    const { store } = fixture();
    const database = await store.setDatabaseMode({
      databaseId: 'db_tasks',
      mode: 'autonomous',
      expectedRevision: 'sha256:empty',
    });
    const configured = await store.setSessionPolicy({
      sessionId: 'session-budget',
      mode: 'autonomous',
      expectedRevision: database.revision,
      delegation: {
        databaseIds: ['db_tasks'],
        actions: ['update_record'],
        propertyIds: ['prop_title'],
        allowBody: false,
        maxRecordsPerAction: 5,
        maxRecordsTotal: 5,
        maxActionsTotal: 1,
        maxEgressBytesTotal: 0,
        expiresAt: '2026-07-20T01:00:00.000Z',
      },
    });
    const input = {
      databaseId: 'db_tasks',
      sessionId: 'session-budget',
      sessionToken: configured.sessionToken ?? '',
      expectedRevision: configured.state.revision,
      requestId: `sha256:${'1'.repeat(64)}`,
      operations: [
        {
          action: 'update_record' as const,
          recordCount: 5,
          propertyIds: ['prop_title'],
          reversible: true,
        },
      ],
    };
    const consumed = await store.consume(input);
    expect(consumed.revision).toBe(configured.state.revision);
    expect(consumed.usageRevision).not.toBe(configured.state.usageRevision);
    expect(consumed.sessions['session-budget']?.usage).toEqual({
      records: 5,
      actions: 1,
      egressBytes: 0,
    });
    expect(await store.consume(input)).toEqual(consumed);
    await expect(
      store.consume({
        ...input,
        requestId: `sha256:${'2'.repeat(64)}`,
        operations: [{ ...input.operations[0], recordCount: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'autonomy_budget_exceeded' });
  });

  test('detects content tampering instead of trusting its stored revision', async () => {
    const { projectDir, store } = fixture();
    await store.setDatabaseMode({
      databaseId: 'db_tasks',
      mode: 'balanced',
      expectedRevision: 'sha256:empty',
    });
    const path = join(projectDir, '.ok', 'local', 'database-autonomy', 'v1', 'policy.json');
    const tampered = JSON.parse(readFileSync(path, 'utf8')) as {
      databases: Record<string, { mode: string }>;
    };
    if (tampered.databases.db_tasks) tampered.databases.db_tasks.mode = 'autonomous';
    writeFileSync(path, JSON.stringify(tampered), { mode: 0o600 });
    await expect(store.snapshot()).rejects.toMatchObject({ code: 'autonomy_store_corrupt' });
  });
});
