import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabaseFormStateStore,
  databaseFormPrivateKey,
} from './database-form-state-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('DatabaseFormStateStore', () => {
  test('persists content-free submission receipts and rate windows across restarts', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-form-state-'));
    tempDirs.push(projectDir);
    const keyHash = databaseFormPrivateKey('db_tasks:view_form:submission-private');
    const remoteHash = databaseFormPrivateKey('submit:db_tasks:view_form:203.0.113.10');
    const store = createDatabaseFormStateStore(projectDir);
    const receipt = await store.reserve({
      keyHash,
      fingerprint: databaseFormPrivateKey('answers-private'),
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      viewId: 'view_form',
      recordId: 'rec_form_response',
      result: {
        status: 'created',
        recordId: 'rec_form_response',
        submittedAt: '2026-07-21T00:00:00.000Z',
        idempotentReplay: false,
        confirmation: { title: 'Saved', message: 'Thanks', allowAnotherResponse: true },
      },
      deleteAfter: '2026-07-22T00:00:00.000Z',
      now: '2026-07-21T00:00:00.000Z',
    });
    await store.markCreated(receipt.id, '2026-07-21T00:00:01.000Z');
    expect(existsSync(join(projectDir, '.ok', 'local', 'database-form-state.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'form-state.json'))).toBe(false);
    expect(
      await store.consumeRate({
        keyHash: remoteHash,
        nowMs: Date.parse('2026-07-21T00:00:00.000Z'),
        windowSeconds: 60,
        limit: 1,
      }),
    ).toEqual({ allowed: true, retryAfterSeconds: 0 });

    const restarted = createDatabaseFormStateStore(projectDir);
    expect(await restarted.get(keyHash)).toMatchObject({
      state: 'created',
      recordId: 'rec_form_response',
    });
    expect(
      await restarted.consumeRate({
        keyHash: remoteHash,
        nowMs: Date.parse('2026-07-21T00:00:10.000Z'),
        windowSeconds: 60,
        limit: 1,
      }),
    ).toEqual({ allowed: false, retryAfterSeconds: 50 });
    expect(await restarted.listDue('2026-07-22T00:00:00.000Z')).toHaveLength(1);
  });
});
