import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
  clearOptimisticCellValue,
  clearOptimisticCellValues,
  executeDatabaseMutation,
  optimisticCellKey,
  setOptimisticCellValue,
} from './database-mutation-gateway';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('database mutation gateway', () => {
  test('keeps optimistic patches scoped to the affected entity', () => {
    const first = optimisticCellKey('rec_one', 'prop_title');
    const second = optimisticCellKey('rec_two', 'prop_title');
    const seeded = setOptimisticCellValue(new Map(), first, 'draft one');
    const both = setOptimisticCellValue(seeded, second, 'draft two');
    const oneCleared = clearOptimisticCellValue(both, first);

    expect([...oneCleared.entries()]).toEqual([[second, 'draft two']]);
    expect([...clearOptimisticCellValues(both, [first, second]).entries()]).toEqual([]);
  });

  test('rolls back only the failed operation and preserves unrelated draft, selection, and row state', () => {
    const first = optimisticCellKey('rec_one', 'prop_title');
    const second = optimisticCellKey('rec_two', 'prop_title');
    const selection = new Set(['rec_one', 'rec_two']);
    const draft = setOptimisticCellValue(new Map(), first, 'pending one');
    const pending = setOptimisticCellValue(draft, second, 'pending two');
    const rolledBack = clearOptimisticCellValue(pending, first);

    expect([...rolledBack.entries()]).toEqual([[second, 'pending two']]);
    expect([...selection]).toEqual(['rec_one', 'rec_two']);
    expect(draft.get(first)).toBe('pending one');
  });

  test('routes an explicit v2 owner-table command without entering the v1 plan writer', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        operation: 'update_cell',
        changed: true,
        receipt: { version: 1, mutationId: 'mut_gateway_v2' },
      }),
    ) as unknown as typeof fetch;
    const result = await executeDatabaseMutation({
      storage: 'markdown_table',
      mutation: {
        operation: 'update_cell',
        input: {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          recordId: 'rec_task',
          propertyId: 'prop_status',
          value: 'done',
          expectedOwnerRevision: `sha256:${'a'.repeat(64)}`,
        },
      },
    });
    expect(result).toMatchObject({
      operation: 'update_cell',
      changed: true,
      receipt: { mutationId: 'mut_gateway_v2' },
    });
  });
});
