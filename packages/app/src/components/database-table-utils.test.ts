import { describe, expect, test } from 'bun:test';
import {
  cellIsInRange,
  databaseCreationPreviewValue,
  databaseLinkHref,
  databaseTableAggregate,
  displayValue,
  initialCellDraft,
  invalidExternalValueText,
  multiSelectDraftValues,
  normalizedCellRange,
  projectedGhostValues,
  sourceProperties,
} from './database-table-utils';

describe('database table pure helpers', () => {
  test('normalizes and tests rectangular ranges', () => {
    const range = { anchorRow: 3, anchorColumn: 4, focusRow: 1, focusColumn: 2 };
    expect(normalizedCellRange(range)).toEqual({
      rowStart: 1,
      rowEnd: 3,
      columnStart: 2,
      columnEnd: 4,
    });
    expect(cellIsInRange(range, 2, 3)).toBe(true);
    expect(cellIsInRange(range, 0, 3)).toBe(false);
  });

  test('builds bounded deterministic aggregate requests', () => {
    expect(databaseTableAggregate({ prop_b: 'sum', prop_a: 'count' })).toEqual({
      groupBy: [],
      calculations: [
        { id: 'table_calculation_0', function: 'count', propertyId: 'prop_a' },
        { id: 'table_calculation_1', function: 'sum', propertyId: 'prop_b' },
      ],
      groupLimit: 100,
      membershipLimit: 100,
    });
    expect(databaseTableAggregate({})).toBeUndefined();
  });

  test('keeps title first and filters ghost values to supported database values', () => {
    const properties = [
      { id: 'status', name: 'Status', type: 'text' as const },
      { id: 'title', name: 'Title', type: 'title' as const },
    ];
    expect(sourceProperties({ properties }).map((property) => property.id)).toEqual([
      'title',
      'status',
    ]);
    expect(projectedGhostValues({ title: 'Task', count: 2, nested: { ignored: true } })).toEqual({
      title: 'Task',
      count: 2,
    });
  });

  test('formats values and drafts without React state', () => {
    const property = { id: 'title', name: 'Title', type: 'title' as const };
    expect(displayValue(property, 'Task')).toBe('Task');
    expect(initialCellDraft(property, 'Task')).toBe('Task');
    expect(databaseLinkHref({ id: 'url', name: 'URL', type: 'url' }, 'https://example.test')).toBe(
      'https://example.test',
    );
    expect(multiSelectDraftValues('["a","b"]')).toEqual(['a', 'b']);
    expect(multiSelectDraftValues('not-json')).toEqual([]);
    expect(invalidExternalValueText({ value: 1 })).toBe('{"value":1}');
    expect(databaseCreationPreviewValue(['Task', 2])).toBe('Task, 2');
  });
});
