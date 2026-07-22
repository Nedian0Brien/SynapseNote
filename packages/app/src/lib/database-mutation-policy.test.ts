import { describe, expect, test } from 'bun:test';
import {
  DATABASE_UI_MUTATION_POLICY,
  databaseUiMutationReviewMode,
  isDatabaseUiMutationDirectSafe,
} from './database-mutation-policy';

const human = (operation: Parameters<typeof databaseUiMutationReviewMode>[0]['operation']) => ({
  operation,
  actor: 'human' as const,
  principalId: 'user:local',
});

describe('database UI mutation policy', () => {
  test('keeps an explicit review matrix for every supported operation and actor', () => {
    const operations = Object.keys(DATABASE_UI_MUTATION_POLICY) as Array<
      keyof typeof DATABASE_UI_MUTATION_POLICY
    >;
    expect(operations).toHaveLength(13);
    for (const operation of operations) {
      const policy = DATABASE_UI_MUTATION_POLICY[operation];
      expect(policy.agent).toBe('required');
      expect(
        databaseUiMutationReviewMode({
          operation,
          actor: 'agent',
          principalId: 'agent:planner',
        }),
      ).toBe('required');
      expect(
        databaseUiMutationReviewMode({
          operation,
          actor: 'human',
          principalId: 'user:local',
        }),
      ).toBe(policy.human);
    }
  });

  test('allows only routine human operations to skip the ghost review', () => {
    for (const operation of [
      'cell',
      'title',
      'record-create',
      'blank-database-create',
      'view',
    ] as const) {
      expect(databaseUiMutationReviewMode(human(operation))).toBe('automatic');
      expect(isDatabaseUiMutationDirectSafe(human(operation))).toBe(true);
    }
  });

  test('keeps elevated, destructive, and verification operations reviewed', () => {
    for (const operation of [
      'schema',
      'bulk',
      'destructive',
      'permission',
      'external',
      'migration',
      'agent',
      'verification',
    ] as const) {
      expect(databaseUiMutationReviewMode(human(operation))).toBe('required');
      expect(isDatabaseUiMutationDirectSafe(human(operation))).toBe(false);
    }
  });

  test('never grants the human shortcut to an agent actor or non-user principal', () => {
    expect(
      databaseUiMutationReviewMode({
        operation: 'cell',
        actor: 'agent',
        principalId: 'agent:planner',
      }),
    ).toBe('required');
    expect(
      databaseUiMutationReviewMode({
        operation: 'record-create',
        actor: 'human',
        principalId: 'agent:impersonated',
      }),
    ).toBe('required');
  });
});
