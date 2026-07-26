import { describe, expect, test } from 'bun:test';
import type { DatabaseQueryResult } from '@nedian0brien/synapsenote-core';
import {
  applyInlineManualRecordOrder,
  mergeInlineManualRecordOrder,
} from './inline-database-utils';

function result(ids: readonly string[]): DatabaseQueryResult {
  return {
    records: ids.map((id) => ({ id, path: `${id}.md`, values: {} })),
    total: ids.length,
  } as DatabaseQueryResult;
}

describe('inline database manual record order', () => {
  test('orders known records and leaves newly loaded records stable at the end', () => {
    const original = result(['rec_a', 'rec_b', 'rec_c', 'rec_new']);
    const ordered = applyInlineManualRecordOrder(original, ['rec_c', 'rec_a', 'rec_b']);
    expect(ordered.records.map((record) => record.id)).toEqual([
      'rec_c',
      'rec_a',
      'rec_b',
      'rec_new',
    ]);
    expect(original.records.map((record) => record.id)).toEqual([
      'rec_a',
      'rec_b',
      'rec_c',
      'rec_new',
    ]);
  });

  test('keeps unloaded IDs while replacing the current page order', () => {
    expect(
      mergeInlineManualRecordOrder(
        ['rec_a', 'rec_unloaded', 'rec_b', 'rec_c'],
        ['rec_c', 'rec_a', 'rec_b'],
      ),
    ).toEqual(['rec_c', 'rec_unloaded', 'rec_a', 'rec_b']);
  });
});
