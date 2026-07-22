import { describe, expect, test } from 'bun:test';
import {
  DatabasePublicSharePolicySchema,
  databasePublicShareIsActive,
  databasePublicShareTargetMatches,
} from './public-sharing.ts';

function policy() {
  return DatabasePublicSharePolicySchema.parse({
    version: 1,
    id: 'dbshare_11111111-1111-4111-8111-111111111111',
    target: { kind: 'view', databaseId: 'db_tasks', viewId: 'view_public' },
    access: 'link',
    propertyIds: ['prop_title'],
    allowBody: false,
    allowFormSubmission: false,
    expiresAt: '2026-07-22T00:00:00.000Z',
    revokedAt: null,
    tokenHash: `sha256:${'1'.repeat(64)}`,
    createdBy: 'user:owner',
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
  });
}

describe('database public share policy', () => {
  test('models every public target with projection, expiry, and token invariants', () => {
    const shared = policy();
    for (const target of [
      { kind: 'database', databaseId: 'db_tasks', sourceId: 'ds_tasks' },
      { kind: 'view', databaseId: 'db_tasks', viewId: 'view_public' },
      { kind: 'form', databaseId: 'db_tasks', viewId: 'view_form' },
      { kind: 'chart', databaseId: 'db_tasks', viewId: 'view_chart' },
      { kind: 'record', databaseId: 'db_tasks', recordId: 'rec_one' },
    ]) {
      expect(() => DatabasePublicSharePolicySchema.parse({ ...shared, target })).not.toThrow();
    }
    expect(databasePublicShareIsActive(shared, new Date('2026-07-21T12:00:00.000Z'))).toBe(true);
    expect(databasePublicShareIsActive(shared, new Date('2026-07-22T00:00:00.000Z'))).toBe(false);
    expect(
      databasePublicShareTargetMatches(shared, {
        databaseId: 'db_tasks',
        viewId: 'view_public',
      }),
    ).toBe(true);
    expect(
      databasePublicShareTargetMatches(shared, {
        databaseId: 'db_tasks',
        viewId: 'view_private',
      }),
    ).toBe(false);
    expect(() => DatabasePublicSharePolicySchema.parse({ ...shared, access: 'public' })).toThrow(
      /token/i,
    );
    expect(() =>
      DatabasePublicSharePolicySchema.parse({
        ...shared,
        target: { kind: 'record', databaseId: 'db_tasks', recordId: 'rec_one' },
        allowFormSubmission: true,
      }),
    ).toThrow(/Form/);
  });
});
