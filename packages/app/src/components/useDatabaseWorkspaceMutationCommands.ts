import type {
  DatabaseProperty,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseDesiredStateDraftInput,
  DatabaseMarkdownTableMutationRequest,
} from '@nedian0brien/synapsenote-server';
import { useEffect, useEffectEvent } from 'react';
import { getBranchSnapshot } from '@/lib/current-branch-store';
import { describeDatabase } from '@/lib/database-catalog-client';
import {
  createDatabaseButtonPlan,
  DatabasePlanExecutionError,
  type ExecuteDatabaseUiMutationResult,
  executeDatabaseButtonPlan,
  executeReviewedDatabasePlan,
} from '@/lib/database-mutation-client';
import {
  type DatabaseUiMutationPolicyInput,
  databaseUiMutationReviewMode,
} from '@/lib/database-mutation-policy';
import { executeDatabaseMutation } from '@/lib/database-mutations/database-mutation-gateway';
import { rebaseQueuedDatabaseRecordMutations } from '@/lib/database-mutations/database-record-commands';
import {
  createDatabaseDefaultViewChangeDesiredState,
  createDatabaseViewConfigurationChangeDesiredState,
} from '@/lib/database-mutations/database-view-commands';
import type { OfflineDatabaseMutation } from '@/lib/database-offline-mutation-queue';
import {
  createOfflineDatabaseMutation,
  enqueueOfflineDatabaseMutation,
  offlineDatabaseMutationStore,
  offlineQueueableRecordMutations,
  rebaseOfflineDatabaseMutation,
  reconcileOfflineDatabaseMutations,
} from '@/lib/database-offline-mutation-queue';
import { fetchDatabaseRecord } from '@/lib/database-query-client';
import { classifyDatabaseUiProblem, databaseConflictProblem } from '@/lib/database-ui-problem';
import { getServerInstanceId } from '@/lib/server-instance-store';

import { searchDatabaseRelationRecords } from './DatabaseTableGrid';

import type { DatabaseDescription } from '@/lib/database-catalog-client';
import type { useDatabaseWorkspaceControllerState } from './use-database-workspace-controller-state';

type DatabaseWorkspaceControllerState = ReturnType<typeof useDatabaseWorkspaceControllerState>;

export interface DatabaseWorkspaceMutationCommandsContext
  extends Pick<
    DatabaseWorkspaceControllerState,
    | 'setMutationStatus'
    | 'setRelationCandidates'
    | 'setMutationError'
    | 'setMutationConflict'
    | 'setOfflineQueueMessage'
    | 'setSaveFeedback'
    | 'setMutationProgressVisible'
    | 'setMutationReviewMode'
    | 'setGhost'
    | 'setLastUndoToken'
    | 'setLastRedoToken'
    | 'setSelectedRecordIds'
    | 'setRefresh'
    | 'refreshNow'
    | 'setOptimisticCellValues'
    | 'setRecordPatches'
    | 'selection'
    | 'setOfflineQueue'
    | 'buttonStatus'
    | 'setButtonStatus'
    | 'setButtonPlan'
    | 'buttonPlan'
    | 'mutationStatus'
    | 'offlineQueue'
  > {
  open: boolean;
  reviewResolver: DatabaseWorkspaceControllerState['reviewResolverRef'];
  description: DatabaseDescription | null;
  locallyHandledRecordIdsRef: DatabaseWorkspaceControllerState['locallyHandledRecordIdsRef'];
  queueReconciliationRunning: DatabaseWorkspaceControllerState['queueReconciliationRunningRef'];
}

export function useDatabaseWorkspaceMutationCommands(
  context: DatabaseWorkspaceMutationCommandsContext & Record<string, unknown>,
) {
  'use no memo';
  const {
    open,
    reviewResolver: reviewResolverRef,
    setMutationStatus,
    description,
    setRelationCandidates,
    setMutationError,
    setMutationConflict,
    setOfflineQueueMessage,
    setSaveFeedback,
    setMutationProgressVisible,
    setMutationReviewMode,
    setGhost,
    setLastUndoToken,
    setLastRedoToken,
    setSelectedRecordIds,
    setRefresh,
    refreshNow,
    setOptimisticCellValues,
    setRecordPatches,
    locallyHandledRecordIdsRef,
    selection,
    setOfflineQueue,
    buttonStatus,
    setButtonStatus,
    setButtonPlan,
    buttonPlan,
    mutationStatus,
    queueReconciliationRunning: queueReconciliationRunningRef,
    offlineQueue,
  } = context;

  const finishReview = (approved: boolean) => {
    const resolve = reviewResolverRef.current;
    reviewResolverRef.current = null;
    setMutationStatus(approved ? 'committing' : 'idle');
    resolve?.(approved);
  };

  const searchRelationCandidates = async (
    property: Extract<DatabaseProperty, { type: 'relation' }>,
    query: string,
  ): Promise<ProjectedDatabaseRelationRecord[]> => {
    if (!description) return [];
    const found = await searchDatabaseRelationRecords(description.database, property, query);
    setRelationCandidates((current: ProjectedDatabaseRelationRecord[]) => [
      ...new Map(
        [...current, ...found].map((record: ProjectedDatabaseRelationRecord) => [
          record.id,
          record,
        ]),
      ).values(),
    ]);
    return found;
  };

  const runMutation = (
    desiredState: DatabaseDesiredStateDraftInput,
    idempotencyPrefix: string,
    failureMessage: string,
    options: {
      assertions?: { databaseAbsent?: boolean; createdRecords?: number };
      review?: 'required' | 'automatic';
      policy?: DatabaseUiMutationPolicyInput;
      optimisticCellKey?: string;
      presentation?: 'default' | 'silent';
      recordRefresh?: { databaseId: string; sourceId: string; recordId: string };
      onCommitted?: (
        outcome: Extract<ExecuteDatabaseUiMutationResult, { status: 'committed' }>,
      ) => void;
      onNotCommitted?: () => void;
      onFailed?: () => void;
    } = {},
  ) => {
    const idempotencyKey = `${idempotencyPrefix}-${crypto.randomUUID()}`;
    setMutationError(null);
    setMutationConflict(null);
    setOfflineQueueMessage(null);
    setSaveFeedback(null);
    setMutationProgressVisible(options.presentation !== 'silent');
    const localRecordStartedAt = options.recordRefresh ? Date.now() : null;
    if (options.recordRefresh && localRecordStartedAt !== null) {
      locallyHandledRecordIdsRef.current.set(options.recordRefresh.recordId, localRecordStartedAt);
    }
    const reviewMode = options.policy
      ? databaseUiMutationReviewMode(options.policy)
      : (options.review ?? 'required');
    setMutationReviewMode(reviewMode);
    setMutationStatus('planning');
    void executeDatabaseMutation({
      desiredState,
      actor: { principalId: 'user:local' },
      idempotencyKey,
      ...(options.assertions ? { assertions: options.assertions } : {}),
      review:
        reviewMode === 'automatic'
          ? () => true
          : () =>
              new Promise<boolean>((resolve) => {
                reviewResolverRef.current = resolve;
                setMutationStatus('review');
              }),
      ...(reviewMode === 'required' ? { onGhostStateChange: setGhost } : {}),
    })
      .then(async (outcome) => {
        if (outcome.status !== 'committed') {
          if (options.recordRefresh) {
            locallyHandledRecordIdsRef.current.delete(options.recordRefresh.recordId);
          }
          options.onNotCommitted?.();
        }
        if (outcome.status === 'blocked') {
          setMutationConflict({ plan: outcome.plan });
          setMutationError(
            databaseConflictProblem(
              outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
                'The database change is blocked by the current canonical state',
            ),
          );
        }
        if (outcome.status === 'committed') {
          if (options.presentation !== 'silent') setSaveFeedback('saved');
          setLastUndoToken(outcome.result.undoToken);
          setLastRedoToken(null);
          setSelectedRecordIds(new Set());
          const recordRefresh = options.recordRefresh;
          if (recordRefresh) {
            try {
              const lookup = await fetchDatabaseRecord(recordRefresh);
              setRecordPatches(
                (
                  current: ReadonlyMap<
                    string,
                    { record: ProjectedDatabaseRecord; snapshotRevision: string }
                  >,
                ) => {
                  const next = new Map(current);
                  next.set(recordRefresh.recordId, {
                    record: lookup.record,
                    snapshotRevision: lookup.indexRevision,
                  });
                  return next;
                },
              );
            } catch {
              locallyHandledRecordIdsRef.current.delete(recordRefresh.recordId);
              setRefresh((current: number) => current + 1);
            }
            globalThis.setTimeout(() => {
              if (
                locallyHandledRecordIdsRef.current.get(recordRefresh.recordId) ===
                localRecordStartedAt
              ) {
                locallyHandledRecordIdsRef.current.delete(recordRefresh.recordId);
              }
            }, 1_500);
          } else {
            setRefresh((current: number) => current + 1);
          }
          options.onCommitted?.(outcome);
        }
        if (options.optimisticCellKey) {
              setOptimisticCellValues((current) => {
            if (!current.has(options.optimisticCellKey as string)) return current;
            const next = new Map(current);
            next.delete(options.optimisticCellKey as string);
            return next;
          });
        }
        setMutationStatus('idle');
        setMutationProgressVisible(true);
      })
      .catch(async (cause: unknown) => {
        if (options.recordRefresh) {
          locallyHandledRecordIdsRef.current.delete(options.recordRefresh.recordId);
        }
        if (options.optimisticCellKey) {
              setOptimisticCellValues((current) => {
            if (!current.has(options.optimisticCellKey as string)) return current;
            const next = new Map(current);
            next.delete(options.optimisticCellKey as string);
            return next;
          });
        }
        setMutationStatus('idle');
        setMutationProgressVisible(true);
        const problem = classifyDatabaseUiProblem(cause, failureMessage);
        if (problem.kind === 'conflict' && cause instanceof DatabasePlanExecutionError) {
          setMutationConflict({
            plan: cause.plan,
            replan: () => runMutation(desiredState, idempotencyPrefix, failureMessage, options),
          });
        }
        const recordMutations = offlineQueueableRecordMutations(desiredState);
        if (problem.kind === 'offline' && selection && recordMutations) {
          try {
            const queued = createOfflineDatabaseMutation({
              databaseId: selection.databaseId,
              sourceId: selection.sourceId,
              branch: getBranchSnapshot(),
              serverInstanceId: getServerInstanceId(),
              recordMutations,
              actor: { principalId: 'user:local' },
              idempotencyKey,
              label: failureMessage,
            });
            await enqueueOfflineDatabaseMutation(offlineDatabaseMutationStore, queued);
            setOfflineQueue(await offlineDatabaseMutationStore.list());
            setOfflineQueueMessage(
              'Write queued locally. It will be replanned against current data and require review after reconnecting.',
            );
            setSaveFeedback('queued');
            setMutationError(null);
            return;
          } catch (queueError) {
            setMutationError(
              classifyDatabaseUiProblem(queueError, 'Unable to store the offline database write'),
            );
            return;
          }
        }
        setSaveFeedback('failed');
        setMutationError(problem);
        options.onFailed?.();
      });
  };

  const runMarkdownTable = (
    mutation: DatabaseMarkdownTableMutationRequest,
    options: {
      optimisticCellKey?: string;
      onCommitted?: () => void;
      onFailed?: () => void;
      /**
       * Read back immediately rather than through the coalescing window.
       *
       * The window exists to merge a mutation's local success callback with the
       * collaboration broadcast that follows it, which is right when the change
       * is already on screen — an edited cell renders optimistically, so waiting
       * costs nothing. A created row has nothing to render until the read lands,
       * so the same wait is the whole latency the user sees.
       */
      immediate?: boolean;
    } = {},
  ) => {
    if (mutationStatus !== 'idle') return;
    setMutationError(null);
    setMutationConflict(null);
    setSaveFeedback(null);
    setMutationProgressVisible(true);
    setMutationStatus('planning');
    void executeDatabaseMutation({ storage: 'markdown_table', mutation })
      .then((outcome) => {
        if (options.optimisticCellKey) {
        setOptimisticCellValues((current) => {
            if (!current.has(options.optimisticCellKey as string)) return current;
            const next = new Map(current);
            next.delete(options.optimisticCellKey as string);
            return next;
          });
        }
        if (outcome.changed) setSaveFeedback('saved');
        // The controller context is typed `Record<string, any>`, so a missing
        // `refreshNow` would not fail the build — it would throw here and the
        // create would never refresh at all. Fall back to the coalesced path
        // instead, which is slower but always correct.
        if (options.immediate && typeof refreshNow === 'function') refreshNow();
        else setRefresh((current: number) => current + 1);
        options.onCommitted?.();
      })
      .catch((cause: unknown) => {
        if (options.optimisticCellKey) {
        setOptimisticCellValues((current) => {
            if (!current.has(options.optimisticCellKey as string)) return current;
            const next = new Map(current);
            next.delete(options.optimisticCellKey as string);
            return next;
          });
        }
        const problem = classifyDatabaseUiProblem(cause, 'Database table edit failed');
        setMutationError(problem);
        options.onFailed?.();
      })
      .finally(() => {
        setMutationStatus('idle');
        setMutationProgressVisible(true);
      });
  };

  const commitSavedViewConfiguration = (
    view: DatabaseView,
    idempotencyPrefix: string,
    failureMessage: string,
  ): boolean => {
    if (!description?.source || mutationStatus !== 'idle') return false;
    try {
      runMutation(
        createDatabaseViewConfigurationChangeDesiredState({
          database: description.database,
          source: description.source,
          view,
        }),
        idempotencyPrefix,
        failureMessage,
        {
          policy: { operation: 'view', actor: 'human', principalId: 'user:local' },
        },
      );
      return true;
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, failureMessage));
      return false;
    }
  };

  const commitDefaultViewChange = useEffectEvent((viewId?: string): boolean => {
    if (!description?.source || mutationStatus !== 'idle') return false;
    try {
      runMutation(
        createDatabaseDefaultViewChangeDesiredState({
          database: description.database,
          source: description.source,
          ...(viewId ? { viewId } : {}),
        }),
        `ui-default-view${viewId ? '' : '-clear'}`,
        'Default view change failed',
        { policy: { operation: 'view', actor: 'human', principalId: 'user:local' } },
      );
      return true;
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare default view change'));
      return false;
    }
  });

  const reconcileQueuedWrites = useEffectEvent(async () => {
    if (!selection || queueReconciliationRunningRef.current || typeof indexedDB === 'undefined') {
      return;
    }
    const branch = getBranchSnapshot();
    const serverInstanceId = getServerInstanceId();
    if (!branch || !serverInstanceId) return;
    queueReconciliationRunningRef.current = true;
    setOfflineQueueMessage(null);
    try {
      const reconciliation = await reconcileOfflineDatabaseMutations({
        store: offlineDatabaseMutationStore,
        branch,
        serverInstanceId,
        shouldProcess: (item) =>
          item.databaseId === selection.databaseId && item.sourceId === selection.sourceId,
        rebase: async (item) => {
          const records = new Map<
            string,
            { revision: string | null; values: Readonly<Record<string, unknown>> }
          >();
          for (const mutation of item.recordMutations) {
            if (!mutation.id) continue;
            const current = await fetchDatabaseRecord({
              databaseId: item.databaseId,
              sourceId: item.sourceId,
              recordId: mutation.id,
            });
            records.set(mutation.id, {
              revision: current.record.revision,
              values: current.record.values,
            });
          }
          return rebaseOfflineDatabaseMutation({
            item,
            branch,
            serverInstanceId,
            records,
          });
        },
        execute: async (item) => {
          setMutationStatus('planning');
          const current = await describeDatabase({
            databaseId: item.databaseId,
            sourceId: item.sourceId,
          });
          if (!current.source) return 'blocked';
          const outcome = await executeDatabaseMutation({
            desiredState: rebaseQueuedDatabaseRecordMutations({
              database: current.database,
              recordMutations: item.recordMutations,
            }),
            actor: item.actor,
            idempotencyKey: item.idempotencyKey,
            review: () =>
              new Promise<boolean>((resolve) => {
                reviewResolverRef.current = resolve;
                setMutationStatus('review');
              }),
            onGhostStateChange: setGhost,
          });
          if (outcome.status === 'committed') {
            setLastUndoToken(outcome.result.undoToken);
            setLastRedoToken(null);
          }
          return outcome.status;
        },
        isOfflineError: (cause) =>
          classifyDatabaseUiProblem(cause, 'Offline queue reconciliation failed').kind ===
          'offline',
      });
      setOfflineQueue(await offlineDatabaseMutationStore.list());
      if (reconciliation.committed.length > 0 || reconciliation.converged.length > 0) {
        setOfflineQueueMessage(
          `${reconciliation.committed.length} queued write(s) committed and ${reconciliation.converged.length} already converged.`,
        );
        setRefresh((current: number) => current + 1);
      } else if (reconciliation.blocked.length > 0) {
        setOfflineQueueMessage(
          `${reconciliation.blocked.length} queued write(s) need attention because the workspace or canonical data changed.`,
        );
      }
    } catch (cause) {
      const problem = classifyDatabaseUiProblem(cause, 'Offline queue reconciliation failed');
      if (problem.kind !== 'offline') setMutationError(problem);
    }
    setMutationStatus('idle');
    queueReconciliationRunningRef.current = false;
  });

  useEffect(() => {
    if (!open) return;
    void reconcileQueuedWrites();
  }, [open]);

  const discardQueuedWrites = () => {
    if (!selection) return;
    const scoped = offlineQueue.filter(
      (item: OfflineDatabaseMutation) =>
        item.databaseId === selection.databaseId && item.sourceId === selection.sourceId,
    );
    if (scoped.length === 0) return;
    if (!window.confirm(`Discard ${scoped.length} queued database write(s)?`)) return;
    void Promise.all(
      scoped.map((item: OfflineDatabaseMutation) => offlineDatabaseMutationStore.delete(item.id)),
    )
      .then(() => offlineDatabaseMutationStore.list())
      .then((items) => {
        setOfflineQueue(items);
        setOfflineQueueMessage('Queued writes discarded.');
      })
      .catch((cause: unknown) =>
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to discard queued writes')),
      );
  };

  const runReviewedPlan = (
    plan: Parameters<typeof executeReviewedDatabasePlan>[0]['plan'],
    idempotencyPrefix: string,
    failureMessage: string,
  ) => {
    if (mutationStatus !== 'idle') return;
    setMutationError(null);
    setMutationConflict(null);
    setSaveFeedback(null);
    setMutationStatus('planning');
    void executeReviewedDatabasePlan({
      plan,
      actor: { principalId: 'user:local' },
      idempotencyKey: `${idempotencyPrefix}-${crypto.randomUUID()}`,
      review: () =>
        new Promise<boolean>((resolve) => {
          reviewResolverRef.current = resolve;
          setMutationStatus('review');
        }),
      onGhostStateChange: setGhost,
    })
      .then((outcome) => {
        if (outcome.status === 'blocked') {
          setMutationConflict({ plan: outcome.plan });
          setMutationError(
            databaseConflictProblem(
              outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
                'The property conversion is blocked by the current canonical state',
            ),
          );
        }
        if (outcome.status === 'committed') {
          setSaveFeedback('saved');
          setLastUndoToken(outcome.result.undoToken);
          setLastRedoToken(null);
          setSelectedRecordIds(new Set());
          setRefresh((current: number) => current + 1);
        }
        setMutationStatus('idle');
      })
      .catch((cause: unknown) => {
        setMutationStatus('idle');
        if (cause instanceof DatabasePlanExecutionError) {
          setMutationConflict({ plan: cause.plan });
        }
        setMutationError(classifyDatabaseUiProblem(cause, failureMessage));
      });
  };

  const planButton = (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'button' }>,
  ) => {
    if (!selection || !record.revision || buttonStatus !== 'idle' || mutationStatus !== 'idle') {
      return;
    }
    setMutationError(null);
    setButtonPlan(null);
    setButtonStatus('planning');
    void createDatabaseButtonPlan({
      databaseId: selection.databaseId,
      sourceId: selection.sourceId,
      recordId: record.id,
      propertyId: property.id,
      expectedRecordRevision: record.revision,
    })
      .then((plan) => setButtonPlan(plan))
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to plan the Button action'));
      })
      .finally(() => setButtonStatus('idle'));
  };

  const planDatabaseActionButton = (buttonId: string) => {
    if (!selection || buttonStatus !== 'idle' || mutationStatus !== 'idle') return;
    setMutationError(null);
    setButtonPlan(null);
    setButtonStatus('planning');
    void createDatabaseButtonPlan({
      databaseId: selection.databaseId,
      buttonId,
    })
      .then((plan) => setButtonPlan(plan))
      .catch((cause: unknown) => {
        setMutationError(
          classifyDatabaseUiProblem(cause, 'Unable to plan the database Button action'),
        );
      })
      .finally(() => setButtonStatus('idle'));
  };

  const commitButton = () => {
    if (!buttonPlan || buttonStatus !== 'idle' || mutationStatus !== 'idle') {
      return;
    }
    setButtonStatus('committing');
    setMutationError(null);
    void executeDatabaseButtonPlan({
      plan: buttonPlan,
      actor: { principalId: 'user:local' },
      idempotencyKey: `ui-button-${crypto.randomUUID()}`,
    })
      .then((result) => {
        if (result.undoToken) {
          setLastUndoToken(result.undoToken);
          setLastRedoToken(null);
        }
        if (result.run.state === 'succeeded') {
          setButtonPlan(null);
          setRefresh((current: number) => current + 1);
          return;
        }
        throw new Error(
          result.run.state === 'retry_wait'
            ? 'The database change committed and external delivery is queued for retry.'
            : result.run.error || 'Button execution failed',
        );
      })
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to run the Button action'));
      })
      .finally(() => setButtonStatus('idle'));
  };

  return {
    finishReview,
    searchRelationCandidates,
    runMutation,
    runMarkdownTable,
    commitSavedViewConfiguration,
    commitDefaultViewChange,
    reconcileQueuedWrites,
    discardQueuedWrites,
    runReviewedPlan,
    planButton,
    planDatabaseActionButton,
    commitButton,
  };
}
