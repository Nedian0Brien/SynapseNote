import type { DatabaseRecordActor } from '@nedian0brien/synapsenote-core';
import type { EnqueueDatabaseAutomationEventInput } from './database-automation.ts';
import type { DatabaseButtonPlan } from './database-button.ts';
import {
  type DatabaseCommitEngine,
  DatabaseCommitError,
  type DatabaseCommitInput,
  type DatabaseCommitResult,
  type DatabaseUndoInput,
  type DatabaseUndoResult,
} from './database-commit.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import {
  type DatabaseMarkdownTableMutationRequest,
  mutateDatabaseMarkdownTable,
} from './database-data-plane-markdown-adapters.ts';
import type { DatabaseMarkdownTableWriter } from './database-markdown-table-writer.ts';
import type { DatabasePlanArtifact, DatabasePlanEnginePort } from './database-plan-artifacts.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type {
  DatabaseRepairApplyInput,
  DatabaseRepairEngine,
  DatabaseRepairPlan,
  DatabaseRepairPreviewOptions,
  DatabaseRepairResult,
  DatabaseRepairUndoInput,
  DatabaseRepairUndoResult,
} from './database-repair.ts';

type ButtonInvocation = Pick<
  DatabaseButtonPlan,
  'databaseId' | 'sourceId' | 'recordId' | 'propertyId' | 'buttonId'
>;

interface CommitAutomationPort {
  assertReadable(): void;
  assertMutationAllowed(): void;
  assertPlanMutationAccess(plan: DatabasePlanArtifact): void;
  authorizeOperation(input: { action: 'alter_schema'; databaseId: string }): void;
  databases(): readonly { id: string }[];
  planEngine: Pick<DatabasePlanEnginePort, 'getPlan'>;
  recordIndex: Pick<DatabaseRecordIndex, 'getById'>;
  getCommitEngine(): DatabaseCommitEngine | null;
  setCommitEngine(engine: DatabaseCommitEngine): void;
  getRepairEngine(): DatabaseRepairEngine | null;
  setRepairEngine(engine: DatabaseRepairEngine): void;
  getPublisher(): ((input: EnqueueDatabaseAutomationEventInput) => Promise<unknown>) | null;
  setPublisher(publisher: (input: EnqueueDatabaseAutomationEventInput) => Promise<unknown>): void;
  now(): Date;
  bindMutationActorToAccessPrincipal: boolean;
  trustedMutationActor(): DatabaseCommitInput['actor'];
  trustedRecordActor(): DatabaseRecordActor;
  buttonInvocationByPlanId: Map<string, ButtonInvocation>;
  markdownTableWriter: DatabaseMarkdownTableWriter | null;
  stableJson(value: unknown): string;
}

export function createDatabaseCommitAutomationCoordinator(port: CommitAutomationPort) {
  const publishPlanAutomationEvents = async (
    plan: DatabasePlanArtifact,
    result: DatabaseCommitResult,
  ): Promise<void> => {
    const publisher = port.getPublisher();
    if (!publisher) return;
    const databaseId = plan.affectedObjects.databaseIds[0];
    if (!databaseId) return;
    for (const change of plan.diff.records) {
      if (change.action === 'delete') continue;
      const record = port.recordIndex.getById(change.recordId);
      if (!record?.revision) {
        throw new DatabaseDataPlaneError(
          'index_unavailable',
          'Database changes committed but automation events await an exact indexed revision.',
          { recordId: change.recordId, mutationId: result.mutationId },
        );
      }
      if (change.action === 'create') {
        await publisher({
          deduplicationKey: `commit:${result.mutationId}:record:${record.id}`,
          databaseId,
          kind: 'record_added',
          sourceId: record.sourceId,
          recordId: record.id,
          recordRevision: record.revision,
        });
        continue;
      }
      const before = change.before?.values ?? {};
      const after = change.after?.values ?? {};
      for (const propertyId of new Set(Object.keys(before).concat(Object.keys(after)))) {
        if (port.stableJson(before[propertyId]) === port.stableJson(after[propertyId])) continue;
        await publisher({
          deduplicationKey: `commit:${result.mutationId}:record:${record.id}:property:${propertyId}`,
          databaseId,
          kind: 'property_changed',
          sourceId: record.sourceId,
          recordId: record.id,
          recordRevision: record.revision,
          propertyId,
        });
      }
    }
  };

  return {
    configureCommitEngine(engine: DatabaseCommitEngine): void {
      port.setCommitEngine(engine);
    },

    configureAutomationEventPublisher(
      publisher: (input: EnqueueDatabaseAutomationEventInput) => Promise<unknown>,
    ): void {
      port.setPublisher(publisher);
    },

    configureRepairEngine(engine: DatabaseRepairEngine): void {
      port.setRepairEngine(engine);
    },

    async previewRepair(
      ttlSeconds?: number,
      options?: DatabaseRepairPreviewOptions,
    ): Promise<DatabaseRepairPlan> {
      port.assertReadable();
      const engine = port.getRepairEngine();
      if (!engine) {
        throw new DatabaseDataPlaneError('repair_unavailable', 'Database repair is unavailable');
      }
      return engine.preview(ttlSeconds, options);
    },

    async applyRepair(input: DatabaseRepairApplyInput): Promise<DatabaseRepairResult> {
      port.assertMutationAllowed();
      const engine = port.getRepairEngine();
      if (!engine) {
        throw new DatabaseDataPlaneError('repair_unavailable', 'Database repair is unavailable');
      }
      for (const database of port.databases()) {
        port.authorizeOperation({ action: 'alter_schema', databaseId: database.id });
      }
      return engine.apply(
        port.bindMutationActorToAccessPrincipal
          ? { ...input, principalId: port.trustedMutationActor().principalId }
          : input,
      );
    },

    async undoRepair(input: DatabaseRepairUndoInput): Promise<DatabaseRepairUndoResult> {
      port.assertMutationAllowed();
      const engine = port.getRepairEngine();
      if (!engine) {
        throw new DatabaseDataPlaneError('repair_unavailable', 'Database repair is unavailable');
      }
      for (const database of port.databases()) {
        port.authorizeOperation({ action: 'alter_schema', databaseId: database.id });
      }
      return engine.undo(
        port.bindMutationActorToAccessPrincipal
          ? { ...input, principalId: port.trustedMutationActor().principalId }
          : input,
      );
    },

    async commit(input: DatabaseCommitInput): Promise<DatabaseCommitResult> {
      port.assertMutationAllowed();
      const engine = port.getCommitEngine();
      if (!engine) {
        throw new DatabaseCommitError(
          'commit_unavailable',
          'Database commit engine is not configured',
        );
      }
      const exactPlan = port.planEngine.getPlan(input.planId);
      port.assertPlanMutationAccess(exactPlan);
      const result = await engine.commit(
        port.bindMutationActorToAccessPrincipal
          ? { ...input, actor: port.trustedMutationActor() }
          : input,
      );
      await publishPlanAutomationEvents(exactPlan, result);
      const invocation = port.buttonInvocationByPlanId.get(input.planId);
      const publisher = port.getPublisher();
      if (invocation && publisher) {
        const record = invocation.recordId ? port.recordIndex.getById(invocation.recordId) : null;
        if (invocation.recordId && !record?.revision) {
          throw new DatabaseDataPlaneError(
            'index_unavailable',
            'Button changes committed but the invocation event awaits an exact indexed revision.',
            { recordId: invocation.recordId, mutationId: result.mutationId },
          );
        }
        await publisher({
          deduplicationKey: `button:${result.mutationId}`,
          databaseId: invocation.databaseId,
          kind: 'button_invoked',
          sourceId: invocation.sourceId,
          recordId: invocation.recordId,
          recordRevision: record?.revision ?? null,
          propertyId: invocation.propertyId,
          buttonId: invocation.buttonId,
        });
        port.buttonInvocationByPlanId.delete(input.planId);
      }
      return result;
    },

    async mutateMarkdownTable(input: DatabaseMarkdownTableMutationRequest): Promise<unknown> {
      return mutateDatabaseMarkdownTable(
        {
          assertMutationAllowed: port.assertMutationAllowed,
          writer: port.markdownTableWriter,
          authorizeOperation: port.authorizeOperation,
          mutationInput: (mutation) =>
            port.bindMutationActorToAccessPrincipal
              ? { ...mutation, actor: port.trustedRecordActor() }
              : mutation,
        },
        input,
      );
    },

    async publishFormAutomationEvent(receipt: {
      id: string;
      databaseId: string;
      sourceId: string;
      viewId: string;
      recordId: string;
    }): Promise<void> {
      const publisher = port.getPublisher();
      if (!publisher) return;
      const record = port.recordIndex.getById(receipt.recordId);
      if (!record?.revision) {
        throw new DatabaseDataPlaneError(
          'index_unavailable',
          'Form response was committed but its automation event awaits an exact indexed revision.',
          { recordId: receipt.recordId },
        );
      }
      await publisher({
        deduplicationKey: `form:${receipt.id}`,
        databaseId: receipt.databaseId,
        kind: 'form_submitted',
        occurredAt: port.now().toISOString(),
        sourceId: receipt.sourceId,
        recordId: receipt.recordId,
        recordRevision: record.revision,
        viewId: receipt.viewId,
      });
    },

    async undo(input: DatabaseUndoInput): Promise<DatabaseUndoResult> {
      port.assertMutationAllowed();
      const engine = port.getCommitEngine();
      if (!engine) {
        throw new DatabaseCommitError(
          'commit_unavailable',
          'Database commit engine is not configured',
        );
      }
      return engine.undo(
        port.bindMutationActorToAccessPrincipal && input.action === 'apply'
          ? { ...input, actor: port.trustedMutationActor() }
          : input,
      );
    },
  };
}
