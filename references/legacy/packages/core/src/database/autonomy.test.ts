import { describe, expect, test } from 'bun:test';
import { evaluateDatabaseAutonomy, resolveDatabaseAutonomyMode } from './autonomy.ts';

const now = new Date('2026-07-20T00:00:00.000Z');
const delegationBudget = {
  propertyIds: ['prop_title', 'prop_status'],
  allowBody: false,
  maxRecordsPerAction: 50,
  maxRecordsTotal: 100,
  maxActionsTotal: 5,
  maxEgressBytesTotal: 0,
  expiresAt: '2026-07-20T01:00:00.000Z',
};

describe('database autonomy policy', () => {
  test('fails closed and composes database and session modes by the stricter setting', () => {
    expect(resolveDatabaseAutonomyMode(undefined, 'autonomous')).toBe('review');
    expect(resolveDatabaseAutonomyMode('autonomous', undefined)).toBe('review');
    expect(resolveDatabaseAutonomyMode('balanced', 'autonomous')).toBe('balanced');
    expect(resolveDatabaseAutonomyMode('autonomous', 'balanced')).toBe('balanced');
  });

  test('review mode requires approval for every write', () => {
    expect(
      evaluateDatabaseAutonomy({
        databaseId: 'db_tasks',
        databaseMode: 'review',
        sessionMode: 'autonomous',
        action: 'update_record',
        recordCount: 1,
        reversible: true,
      }),
    ).toMatchObject({ decision: 'require_approval', reasons: ['review_mode'] });
  });

  test('balanced mode allows only small reversible record edits', () => {
    const base = {
      databaseId: 'db_tasks',
      databaseMode: 'balanced' as const,
      sessionMode: 'balanced' as const,
      recordCount: 20,
      reversible: true,
    };
    expect(evaluateDatabaseAutonomy({ ...base, action: 'update_record' })).toMatchObject({
      decision: 'allow',
      reasons: ['small_reversible_edit'],
    });
    expect(
      evaluateDatabaseAutonomy({ ...base, action: 'bulk_update', recordCount: 21 }),
    ).toMatchObject({
      decision: 'require_approval',
      reasons: ['balanced_action_requires_review', 'balanced_row_limit_exceeded'],
    });
  });

  test('autonomous mode requires an unexpired exact delegation scope', () => {
    const base = {
      databaseId: 'db_tasks',
      databaseMode: 'autonomous' as const,
      sessionMode: 'autonomous' as const,
      action: 'bulk_update' as const,
      recordCount: 50,
      reversible: true,
      now,
    };
    expect(evaluateDatabaseAutonomy(base)).toMatchObject({
      decision: 'require_approval',
      reasons: ['delegation_missing'],
    });
    expect(
      evaluateDatabaseAutonomy({
        ...base,
        delegation: {
          databaseIds: ['db_tasks'],
          actions: ['bulk_update'],
          ...delegationBudget,
        },
      }),
    ).toMatchObject({ decision: 'allow', reasons: ['explicit_delegation'] });
    expect(
      evaluateDatabaseAutonomy({
        ...base,
        delegation: {
          databaseIds: ['db_other'],
          actions: ['update_record'],
          ...delegationBudget,
          maxRecordsPerAction: 10,
          expiresAt: '2026-07-19T23:00:00.000Z',
        },
      }),
    ).toMatchObject({
      decision: 'require_approval',
      reasons: [
        'delegation_expired',
        'database_not_delegated',
        'action_not_delegated',
        'row_budget_exceeded',
      ],
    });
  });

  test('sensitive and irreversible effects always retain approval', () => {
    expect(
      evaluateDatabaseAutonomy({
        databaseId: 'db_tasks',
        databaseMode: 'autonomous',
        sessionMode: 'autonomous',
        action: 'publish',
        recordCount: 1,
        reversible: false,
        publishesData: true,
        externalSideEffect: true,
        delegation: {
          databaseIds: ['db_tasks'],
          actions: ['publish'],
          ...delegationBudget,
          maxRecordsPerAction: 1,
        },
        now,
      }),
    ).toMatchObject({
      decision: 'require_approval',
      reasons: ['public_sharing', 'external_side_effect', 'irreversible_operation'],
    });
  });

  test('derives destructive, permission, public, and external effects from the action itself', () => {
    const expected = {
      delete_record: ['destructive_operation'],
      change_permission: ['permission_change'],
      publish: ['public_sharing', 'external_side_effect'],
      external_communication: ['external_side_effect'],
    } as const;
    for (const [action, reasons] of Object.entries(expected)) {
      expect(
        evaluateDatabaseAutonomy({
          databaseId: 'db_tasks',
          databaseMode: 'autonomous',
          sessionMode: 'autonomous',
          action: action as keyof typeof expected,
          recordCount: 0,
          reversible: true,
          delegation: {
            databaseIds: ['db_tasks'],
            actions: [action as keyof typeof expected],
            ...delegationBudget,
          },
          now,
        }),
      ).toMatchObject({ decision: 'require_approval', reasons });
    }
    expect(
      evaluateDatabaseAutonomy({
        databaseId: 'db_tasks',
        databaseMode: 'autonomous',
        sessionMode: 'autonomous',
        action: 'automation',
        recordCount: 0,
        reversible: true,
        delegation: {
          databaseIds: ['db_tasks'],
          actions: ['update_record'],
          ...delegationBudget,
        },
        now,
      }),
    ).toMatchObject({ decision: 'require_approval', reasons: ['action_not_delegated'] });
  });

  test('applies property, body, cumulative action/row, time, and egress budgets', () => {
    const decision = evaluateDatabaseAutonomy({
      databaseId: 'db_tasks',
      databaseMode: 'autonomous',
      sessionMode: 'autonomous',
      action: 'external_communication',
      recordCount: 2,
      propertyIds: ['prop_secret'],
      touchesBody: true,
      externalEgressBytes: 11,
      externalSideEffect: true,
      reversible: true,
      usage: { records: 99, actions: 5, egressBytes: 0 },
      delegation: {
        databaseIds: ['db_tasks'],
        actions: ['external_communication'],
        ...delegationBudget,
        notBefore: '2026-07-20T00:30:00.000Z',
        maxEgressBytesTotal: 10,
      },
      now,
    });
    expect(decision).toMatchObject({
      decision: 'require_approval',
      reasons: [
        'external_side_effect',
        'delegation_not_active',
        'property_not_delegated',
        'body_not_delegated',
        'cumulative_row_budget_exceeded',
        'action_budget_exceeded',
        'egress_budget_exceeded',
      ],
    });
  });
});
