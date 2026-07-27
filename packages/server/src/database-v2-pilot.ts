import { createHash } from 'node:crypto';
import { z } from 'zod';

export const DatabaseV2PilotReportSchema = z
  .object({
    version: z.literal(1),
    mode: z.literal('opt_in_rehearsal'),
    workspaceFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    durationDays: z.number().finite().nonnegative().max(31),
    datasetMix: z
      .object({
        blank: z.number().int().nonnegative(),
        template: z.number().int().nonnegative(),
        existingFolder: z.number().int().nonnegative(),
        inline: z.number().int().nonnegative(),
        migrated: z.number().int().nonnegative(),
      })
      .strict(),
    tasks: z
      .object({
        planned: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        recoveryRequired: z.number().int().nonnegative(),
      })
      .strict(),
    rollbacks: z
      .object({
        requested: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        conflicted: z.number().int().nonnegative(),
      })
      .strict(),
    defects: z
      .object({
        critical: z.number().int().nonnegative(),
        high: z.number().int().nonnegative(),
        medium: z.number().int().nonnegative(),
        low: z.number().int().nonnegative(),
      })
      .strict(),
    decision: z
      .object({
        outcome: z.enum(['go', 'no_go']),
        reasons: z.array(z.string().min(1)).min(1).max(12),
        nextAction: z.string().min(1).max(500),
      })
      .strict(),
  })
  .strict();

export type DatabaseV2PilotReport = z.infer<typeof DatabaseV2PilotReportSchema>;

export interface DatabaseV2PilotInput {
  workspaceId: string;
  startedAt: string;
  endedAt: string;
  datasetMix: DatabaseV2PilotReport['datasetMix'];
  tasks: DatabaseV2PilotReport['tasks'];
  rollbacks: DatabaseV2PilotReport['rollbacks'];
  defects?: Partial<DatabaseV2PilotReport['defects']>;
}

/**
 * Compile a content-free, opt-in pilot decision.  The report intentionally
 * accepts only aggregate counters so titles, paths, cells, and customer data
 * cannot leak into release evidence.
 */
export function runDatabaseV2Pilot(input: DatabaseV2PilotInput): DatabaseV2PilotReport {
  const started = Date.parse(input.startedAt);
  const ended = Date.parse(input.endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    throw new Error('Pilot timestamps must be valid and end after start');
  }
  const defects = {
    critical: input.defects?.critical ?? 0,
    high: input.defects?.high ?? 0,
    medium: input.defects?.medium ?? 0,
    low: input.defects?.low ?? 0,
  };
  for (const [name, value] of Object.entries({
    ...input.datasetMix,
    ...input.tasks,
    ...input.rollbacks,
    ...defects,
  })) {
    if (!Number.isInteger(value) || value < 0)
      throw new Error(`Pilot counter "${name}" must be non-negative`);
  }
  if (input.tasks.completed + input.tasks.failed > input.tasks.planned) {
    throw new Error('Pilot completed and failed task counts exceed planned tasks');
  }
  if (input.rollbacks.completed + input.rollbacks.conflicted > input.rollbacks.requested) {
    throw new Error('Pilot rollback outcomes exceed requested rollbacks');
  }
  const reasons: string[] = [];
  if (defects.critical > 0 || defects.high > 0) reasons.push('critical/high defects remain open');
  if (input.tasks.recoveryRequired > 0) reasons.push('one or more tasks require recovery');
  if (input.rollbacks.conflicted > 0) reasons.push('one or more rollback requests conflicted');
  if (input.tasks.failed > 0) reasons.push('one or more pilot tasks failed');
  const outcome = reasons.length === 0 ? 'go' : 'no_go';
  if (reasons.length === 0)
    reasons.push('all bounded pilot tasks completed without recovery or high-severity defects');
  const report = {
    version: 1 as const,
    mode: 'opt_in_rehearsal' as const,
    workspaceFingerprint: `sha256:${createHash('sha256').update(input.workspaceId).digest('hex')}`,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationDays: (ended - started) / 86_400_000,
    datasetMix: structuredClone(input.datasetMix),
    tasks: structuredClone(input.tasks),
    rollbacks: structuredClone(input.rollbacks),
    defects,
    decision: {
      outcome,
      reasons,
      nextAction:
        outcome === 'go'
          ? 'Proceed to the separately approved v2 default-writer release record.'
          : 'Keep v2 opt-in, remediate the listed aggregate gates, and rerun the pilot.',
    },
  };
  return DatabaseV2PilotReportSchema.parse(report);
}
