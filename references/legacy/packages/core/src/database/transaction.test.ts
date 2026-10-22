import { describe, expect, test } from 'bun:test';
import {
  DatabaseTransactionReceiptSchema,
  DatabaseUndoReceiptSchema,
  parseDatabaseTransactionReceipt,
  serializeDatabaseTransactionReceipt,
} from './transaction.ts';

const sha = (character: string) => `sha256:${character.repeat(64)}`;
const git = (character: string) => `sha1:${character.repeat(40)}`;

function receipt() {
  return {
    version: 1,
    mutationId: 'mut_01',
    planId: 'plan_01',
    planHash: sha('a'),
    intentSummary: 'Apply a reviewed record update across one database source.',
    tool: { name: 'synapsenote-server/database-commit', version: '0.30.1' },
    dataSources: { databaseIds: ['db_tasks'], sourceIds: ['ds_tasks'] },
    idempotencyKeyHash: sha('b'),
    actor: { principalId: 'agent:codex', kind: 'agent', sessionId: 'session-1' },
    committedAt: '2026-07-19T10:00:00+09:00',
    base: { gitHead: git('1'), snapshotRevision: sha('c') },
    result: { gitHead: git('2'), snapshotRevision: sha('d') },
    files: [
      {
        operation: 'update',
        path: 'content/tasks/alpha.md',
        before: { sha256: sha('e'), gitBlob: git('3'), bytes: 100 },
        after: { sha256: sha('f'), gitBlob: git('4'), bytes: 120 },
      },
      {
        operation: 'rename',
        oldPath: 'content/tasks/old.md',
        path: 'content/tasks/new.md',
        before: { sha256: sha('0'), gitBlob: git('5'), bytes: 80 },
        after: { sha256: sha('0'), gitBlob: git('5'), bytes: 80 },
      },
    ],
    verification: {
      status: 'passed',
      checks: [{ code: 'required_values', status: 'passed', message: 'All values present' }],
    },
    undo: {
      tokenId: 'undo_01',
      strategy: 'git_three_way_reverse',
      expectedSnapshotRevision: sha('d'),
    },
  };
}

describe('database Git transaction receipts', () => {
  test('round-trips a deterministic, content-free multi-file receipt', () => {
    const serialized = serializeDatabaseTransactionReceipt(receipt());
    expect(serialized.endsWith('\n')).toBe(true);
    expect(parseDatabaseTransactionReceipt(serialized)).toEqual(
      DatabaseTransactionReceiptSchema.parse(receipt()),
    );
    expect(serialized).not.toContain('frontmatter');
    expect(serialized).not.toContain('markdown');
    expect(serialized).toContain('Apply a reviewed record update');
    expect(serialized).toContain('synapsenote-server/database-commit');
    expect(serializeDatabaseTransactionReceipt(JSON.parse(serialized))).toBe(serialized);
  });

  test('rejects path reuse, snapshot-unbound undo, raw content, and inconsistent verification', () => {
    const duplicate = receipt();
    duplicate.files[1] = { ...duplicate.files[1], path: 'content/tasks/alpha.md' };
    expect(DatabaseTransactionReceiptSchema.safeParse(duplicate).success).toBe(false);
    expect(
      DatabaseTransactionReceiptSchema.safeParse({
        ...receipt(),
        undo: { ...receipt().undo, expectedSnapshotRevision: sha('9') },
      }).success,
    ).toBe(false);
    expect(
      DatabaseTransactionReceiptSchema.safeParse({ ...receipt(), markdown: '# secret' }).success,
    ).toBe(false);
    expect(
      DatabaseTransactionReceiptSchema.safeParse({
        ...receipt(),
        dataSources: { databaseIds: ['db_tasks'], sourceIds: ['ds_tasks', 'ds_tasks'] },
      }).success,
    ).toBe(false);
    expect(
      DatabaseTransactionReceiptSchema.safeParse({
        ...receipt(),
        verification: {
          status: 'passed',
          checks: [{ code: 'unique', status: 'failed', message: 'Duplicate' }],
        },
      }).success,
    ).toBe(false);
  });

  test('requires explicit conflicts on refusal and clean result revisions on success', () => {
    const base = {
      version: 1,
      undoId: 'undo_apply_01',
      mutationId: 'mut_01',
      checkedAt: '2026-07-19T10:01:00+09:00',
      expectedSnapshotRevision: sha('d'),
      observedSnapshotRevision: sha('d'),
    };
    expect(
      DatabaseUndoReceiptSchema.parse({
        ...base,
        status: 'applied',
        resultSnapshotRevision: sha('c'),
        resultGitHead: git('1'),
        conflicts: [],
      }),
    ).toBeDefined();
    expect(
      DatabaseUndoReceiptSchema.safeParse({ ...base, status: 'refused', conflicts: [] }).success,
    ).toBe(false);
    expect(
      DatabaseUndoReceiptSchema.safeParse({
        ...base,
        status: 'refused',
        conflicts: [
          {
            path: 'content/tasks/alpha.md',
            reason: 'path_changed',
            expectedSha256: sha('f'),
            observedSha256: sha('9'),
          },
        ],
      }).success,
    ).toBe(true);
  });
});
