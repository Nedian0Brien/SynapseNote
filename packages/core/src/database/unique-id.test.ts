import { describe, expect, test } from 'bun:test';
import { formatDatabaseUniqueId, planDatabaseUniqueIdRepair } from './unique-id.ts';

describe('Unique ID', () => {
  test('formats configurable prefixes without duplicating prefix state per record', () => {
    expect(formatDatabaseUniqueId('TASK', 42)).toBe('TASK-42');
    expect(formatDatabaseUniqueId('', 42)).toBe('42');
    expect(() => formatDatabaseUniqueId('TASK', 0)).toThrow('positive safe integers');
  });

  test('keeps valid owners and allocates above the watermark and observed maximum', () => {
    const plan = planDatabaseUniqueIdRepair(
      [{ id: 'prop_ticket', prefix: 'TASK', nextNumber: 8 }],
      [
        { id: 'rec_a', values: { prop_ticket: 2 } },
        { id: 'rec_b', values: { prop_ticket: 11 } },
        { id: 'rec_c', values: {} },
      ],
    );

    expect(plan.assignments).toEqual([
      {
        recordId: 'rec_c',
        propertyId: 'prop_ticket',
        previous: undefined,
        number: 12,
        formatted: 'TASK-12',
        reason: 'missing',
      },
    ]);
    expect(plan.nextNumbers).toEqual({ prop_ticket: 13 });
  });

  test('repairs invalid and duplicate values deterministically without filling old gaps', () => {
    const plan = planDatabaseUniqueIdRepair(
      [{ id: 'prop_ticket', prefix: 'ISSUE', nextNumber: 20 }],
      [
        { id: 'rec_a', values: { prop_ticket: 4 } },
        { id: 'rec_b', values: { prop_ticket: 4 } },
        { id: 'rec_c', values: { prop_ticket: -1 } },
      ],
    );

    expect(
      plan.assignments.map(({ recordId, number, reason }) => ({ recordId, number, reason })),
    ).toEqual([
      { recordId: 'rec_b', number: 20, reason: 'duplicate' },
      { recordId: 'rec_c', number: 21, reason: 'invalid' },
    ]);
    expect(plan.nextNumbers).toEqual({ prop_ticket: 22 });
  });
});
