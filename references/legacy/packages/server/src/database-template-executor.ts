import { applyDatabaseTemplate } from '@nedian0brien/synapsenote-core';
import { databaseDesiredStateBase } from './database-button.ts';
import type { DatabaseCommitEngine } from './database-commit.ts';
import type { DatabasePlanEngine } from './database-plan.ts';
import type { ExecuteDatabaseTemplateInput } from './database-template-scheduler.ts';

export function createDatabaseTemplateExecutor(options: {
  databasePlanEngine: DatabasePlanEngine;
  databaseCommitEngine: DatabaseCommitEngine;
}): (input: ExecuteDatabaseTemplateInput) => Promise<{ recordIds: string[] }> {
  return async ({ definition, template, scheduledFor, runId }) => {
    const source = definition.sources.find((candidate) => candidate.id === template.sourceId);
    if (!source) throw new Error(`Repeating template source "${template.sourceId}" was removed`);
    const applied = applyDatabaseTemplate(definition, {
      sourceId: source.id,
      templateId: template.id,
    });
    const propertyKeyById = new Map(
      source.properties.map((property) => [property.id, property.key] as const),
    );
    const draft = options.databasePlanEngine.createDraft({
      ...databaseDesiredStateBase(definition),
      sampleRecords: [
        {
          sourceKey: source.key,
          values: Object.fromEntries(
            Object.entries(applied.values).map(([propertyId, value]) => {
              const propertyKey = propertyKeyById.get(propertyId);
              if (!propertyKey) {
                throw new Error(`Repeating template property "${propertyId}" was removed`);
              }
              return [propertyKey, value];
            }),
          ),
          body: applied.body,
        },
      ],
      recordMutations: [],
      recordArchives: [],
    });
    const plan = options.databasePlanEngine.createPlan(draft.id);
    if (!plan.committable) {
      throw new Error(`Repeating template plan is blocked: ${plan.conflicts.join(', ')}`);
    }
    await options.databaseCommitEngine.commit({
      planId: plan.id,
      planHash: plan.hash,
      expectedSnapshotRevision: plan.snapshotRevision,
      idempotencyKey: `template-run:${runId}`,
      approvalToken: options.databaseCommitEngine.expectedApprovalToken(plan.hash),
      actor: {
        principalId: `template-owner:${template.repeat?.ownerId ?? 'unknown'}`,
        kind: 'system',
        sessionId: scheduledFor,
      },
      assertions: { createdRecords: 1 },
    });
    return {
      recordIds: plan.diff.records
        .filter((record) => record.before === null && record.after !== null)
        .map((record) => record.recordId),
    };
  };
}
