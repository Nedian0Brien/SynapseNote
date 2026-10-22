import { databaseDesiredStateBase } from './database-button.ts';
import type { DatabaseCommitEngine } from './database-commit.ts';
import type { DatabaseFormStateStore } from './database-form-state-store.ts';
import type { DatabasePlanEngine } from './database-plan.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';

export interface CreateDatabaseFormRetentionServiceOptions {
  databaseStore: DatabaseStore;
  databaseRecordIndex: DatabaseRecordIndex;
  databasePlanEngine: DatabasePlanEngine;
  databaseCommitEngine: DatabaseCommitEngine;
  formStateStore: DatabaseFormStateStore;
  now?: () => Date;
}

export class DatabaseFormRetentionService {
  readonly #options: CreateDatabaseFormRetentionServiceOptions;
  readonly #now: () => Date;
  #running = false;

  constructor(options: CreateDatabaseFormRetentionServiceOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
  }

  async run(limit = 100): Promise<{ deleted: string[]; failed: string[] }> {
    if (this.#running) return { deleted: [], failed: [] };
    this.#running = true;
    const deleted: string[] = [];
    const failed: string[] = [];
    try {
      for (const receipt of await this.#options.formStateStore.listDue(
        this.#now().toISOString(),
        limit,
      )) {
        try {
          const definition = this.#options.databaseStore.getById(receipt.databaseId);
          const record = this.#options.databaseRecordIndex.getById(receipt.recordId);
          if (!definition || !record) {
            await this.#options.formStateStore.markDeleted(receipt.id, this.#now().toISOString());
            deleted.push(receipt.recordId);
            continue;
          }
          if (record.databaseId !== receipt.databaseId || record.sourceId !== receipt.sourceId) {
            throw new Error('Retained form response moved outside its original database scope');
          }
          if (!record.revision) throw new Error('Retained form response has no exact revision');
          const source = definition.sources.find((candidate) => candidate.id === receipt.sourceId);
          if (!source) throw new Error('Retained form response source was removed');
          const draft = this.#options.databasePlanEngine.createDraft({
            ...databaseDesiredStateBase(definition),
            sampleRecords: [],
            recordMutations: [],
            recordArchives: [],
            recordDeletions: [
              {
                sourceKey: source.key,
                id: record.id,
                expectedRevision: record.revision,
              },
            ],
          });
          const plan = this.#options.databasePlanEngine.createPlan(draft.id);
          if (!plan.committable)
            throw new Error(`Retention plan blocked: ${plan.conflicts.join(', ')}`);
          await this.#options.databaseCommitEngine.commit({
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: plan.snapshotRevision,
            idempotencyKey: `form-retention:${receipt.id}`,
            approvalToken: this.#options.databaseCommitEngine.expectedApprovalToken(plan.hash),
            actor: { kind: 'system', principalId: `form-retention:${receipt.viewId}` },
          });
          await this.#options.formStateStore.markDeleted(receipt.id, this.#now().toISOString());
          deleted.push(receipt.recordId);
        } catch {
          failed.push(receipt.recordId);
        }
      }
      return { deleted, failed };
    } finally {
      this.#running = false;
    }
  }
}

export function createDatabaseFormRetentionService(
  options: CreateDatabaseFormRetentionServiceOptions,
): DatabaseFormRetentionService {
  return new DatabaseFormRetentionService(options);
}
