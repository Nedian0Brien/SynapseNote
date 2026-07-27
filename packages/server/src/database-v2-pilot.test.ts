import { describe, expect, test } from 'bun:test';
import { DatabaseV2PilotReportSchema, runDatabaseV2Pilot } from './database-v2-pilot.ts';

describe('v2 opt-in pilot gate', () => {
  test('emits a content-free go decision with aggregate task evidence', () => {
    const report = runDatabaseV2Pilot({
      workspaceId: 'pilot-fixture-2026-07-27',
      startedAt: '2026-07-20T00:00:00.000Z',
      endedAt: '2026-07-27T00:00:00.000Z',
      datasetMix: { blank: 2, template: 3, existingFolder: 1, inline: 2, migrated: 4 },
      tasks: { planned: 12, completed: 12, failed: 0, recoveryRequired: 0 },
      rollbacks: { requested: 1, completed: 1, conflicted: 0 },
      defects: { critical: 0, high: 0, medium: 1, low: 2 },
    });
    expect(DatabaseV2PilotReportSchema.safeParse(report).success).toBe(true);
    expect(report.decision.outcome).toBe('go');
    expect(JSON.stringify(report)).not.toContain('Atomic');
    expect(JSON.stringify(report)).not.toContain('/Users/');
  });

  test('returns no-go for recovery or high-severity defects', () => {
    const report = runDatabaseV2Pilot({
      workspaceId: 'pilot-fixture-blocked',
      startedAt: '2026-07-27T00:00:00.000Z',
      endedAt: '2026-07-28T00:00:00.000Z',
      datasetMix: { blank: 0, template: 0, existingFolder: 0, inline: 0, migrated: 1 },
      tasks: { planned: 1, completed: 0, failed: 0, recoveryRequired: 1 },
      rollbacks: { requested: 0, completed: 0, conflicted: 0 },
      defects: { high: 1 },
    });
    expect(report.decision.outcome).toBe('no_go');
    expect(report.decision.reasons).toEqual(
      expect.arrayContaining([
        'critical/high defects remain open',
        'one or more tasks require recovery',
      ]),
    );
  });
});
