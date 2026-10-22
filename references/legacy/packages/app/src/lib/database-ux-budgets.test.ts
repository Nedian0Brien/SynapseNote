import { describe, expect, test } from 'bun:test';
import {
  DATABASE_UX_LATENCY_BUDGETS_MS,
  databaseUxLatencyWithinBudget,
} from './database-ux-budgets';

describe('database UX latency budgets', () => {
  test('keeps the five document-native interaction budgets explicit', () => {
    expect(DATABASE_UX_LATENCY_BUDGETS_MS).toEqual({
      shell: 250,
      firstData: 1_000,
      viewSwitch: 500,
      cellSave: 750,
      recordPeek: 400,
    });
  });

  test('classifies measured samples against the named budget', () => {
    expect(databaseUxLatencyWithinBudget('shell', 249)).toBe(true);
    expect(databaseUxLatencyWithinBudget('shell', 251)).toBe(false);
    expect(databaseUxLatencyWithinBudget('cellSave', Number.NaN)).toBe(false);
    expect(databaseUxLatencyWithinBudget('recordPeek', -1)).toBe(false);
  });
});
