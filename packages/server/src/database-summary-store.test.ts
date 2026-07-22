import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseSummaryStore, DatabaseSummaryStoreError } from './database-summary-store.ts';

const tempDirs: string[] = [];
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-summary-store-'));
  tempDirs.push(projectDir);
  const store = createDatabaseSummaryStore({
    projectDir,
    now: () => new Date('2026-07-19T10:05:00.000Z'),
    generateUuid: () => '00000000-0000-4000-8000-000000000001',
  });
  const input = {
    databaseId: 'db_notes',
    sourceId: 'ds_notes',
    recordId: 'rec_one',
    summary: 'Token-efficient generated context.',
    sourceHash: HASH_A,
    schemaRevision: HASH_B,
    createdAt: '2026-07-19T10:00:00.000Z',
    modelProvenance: {
      provider: 'example-provider',
      model: 'summary-model',
      modelRevision: '2026-07-01',
      promptRevision: 'record-summary-v1',
      generationId: 'generation-123',
    },
  };
  return { projectDir, store, input };
}

describe('DatabaseSummaryStore', () => {
  test('stores only provenance-bearing summaries in private local derived state', async () => {
    const { projectDir, store, input } = fixture();
    const stored = await store.put(input);
    const path = join(projectDir, '.ok', 'local', 'database-summaries', 'v1', 'rec_one.json');
    expect(stored).toMatchObject({
      id: 'sum_00000000000040008000000000000001',
      sourceHash: HASH_A,
      createdAt: input.createdAt,
      modelProvenance: { model: 'summary-model', promptRevision: 'record-summary-v1' },
      state: { stale: false, checkedAt: input.createdAt },
    });
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(stored);

    await expect(
      store.put({ ...input, modelProvenance: undefined } as never),
    ).rejects.toMatchObject({ code: 'invalid_summary' });
  });

  test('persists stale transitions and never returns stale generated text as fresh context', async () => {
    const { store, input } = fixture();
    await store.put(input);
    expect(
      await store.getFresh('rec_one', {
        sourceHash: HASH_A,
        schemaRevision: HASH_B,
        checkedAt: '2026-07-19T10:01:00.000Z',
      }),
    ).toMatchObject({ state: { stale: false } });
    expect(
      await store.getFresh('rec_one', {
        sourceHash: HASH_B,
        schemaRevision: HASH_B,
        checkedAt: '2026-07-19T10:02:00.000Z',
      }),
    ).toBeNull();
    expect(await store.inspect('rec_one')).toMatchObject({
      state: { stale: true, reason: 'source_changed' },
    });
    expect(await store.invalidate('rec_one')).toMatchObject({
      state: { stale: true, reason: 'manually_invalidated' },
    });
  });

  test('serializes concurrent first writes without producing a partial artifact', async () => {
    const { projectDir, input } = fixture();
    const first = createDatabaseSummaryStore({
      projectDir,
      generateUuid: () => '00000000-0000-4000-8000-000000000011',
    });
    const second = createDatabaseSummaryStore({
      projectDir,
      generateUuid: () => '00000000-0000-4000-8000-000000000022',
    });
    await Promise.all([
      first.put(input),
      second.put({ ...input, summary: 'A newer complete summary.' }),
    ]);
    const stored = await first.inspect('rec_one');
    expect(stored?.summary).toBeOneOf([
      'Token-efficient generated context.',
      'A newer complete summary.',
    ]);
    expect(stored?.state).toMatchObject({ stale: false });
  });

  test('fails closed for corrupt or symbolic-link entries', async () => {
    const { projectDir, store } = fixture();
    const root = join(projectDir, '.ok', 'local', 'database-summaries', 'v1');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'rec_one.json'), '{broken', 'utf8');
    await expect(store.inspect('rec_one')).rejects.toBeInstanceOf(DatabaseSummaryStoreError);

    rmSync(join(root, 'rec_one.json'));
    const outside = join(projectDir, 'outside.json');
    writeFileSync(outside, '{}', 'utf8');
    symlinkSync(outside, join(root, 'rec_one.json'));
    await expect(store.inspect('rec_one')).rejects.toMatchObject({
      code: 'summary_store_unsafe',
    });
  });
});
