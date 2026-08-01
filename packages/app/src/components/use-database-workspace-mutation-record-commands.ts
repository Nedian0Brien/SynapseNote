import { getBranchSnapshot } from '@/lib/current-branch-store';
import { describeDatabase } from '@/lib/database-catalog-client';
import {
  createDatabaseCellMutationDesiredState,
  createDatabaseDefaultViewChangeDesiredState,
  createDatabaseRecordArchiveDesiredState,
  createDatabaseRecordCopyDesiredState,
  createDatabaseRecordDeletionDesiredState,
  createDatabaseRecordDesiredState,
  createDatabaseRecordMoveDesiredState,
  createDatabaseViewConfigurationChangeDesiredState,
  rebaseQueuedDatabaseRecordMutations,
} from '@/lib/database-cell-mutation';
import {
  createDatabaseButtonPlan,
  createDatabaseVerificationPlan,
  DatabasePlanExecutionError,
  executeDatabaseButtonPlan,
  executeDatabaseUiMutation,
  executeReviewedDatabasePlan,
} from '@/lib/database-mutation-client';
import { databaseUiMutationReviewMode } from '@/lib/database-mutation-policy';
import {
  createOfflineDatabaseMutation,
  enqueueOfflineDatabaseMutation,
  offlineDatabaseMutationStore,
  offlineQueueableRecordMutations,
  reconcileOfflineDatabaseMutations,
} from '@/lib/database-offline-mutation-queue';
import { classifyDatabaseUiProblem, databaseConflictProblem } from '@/lib/database-ui-problem';
import { getServerInstanceId } from '@/lib/server-instance-store';
import { searchDatabaseRelationRecords } from './DatabaseTableGrid';
import type { DatabaseTableDialogProps } from './database-workspace-types';
import type { useDatabaseWorkspaceControllerState } from './use-database-workspace-controller-state';
import { useDatabaseWorkspaceMutationCommands } from './useDatabaseWorkspaceMutationCommands';
import { useDatabaseWorkspaceRecordCommands } from './useDatabaseWorkspaceRecordCommands';

type WorkspaceState = ReturnType<typeof useDatabaseWorkspaceControllerState>;
type MutationInput = Parameters<typeof useDatabaseWorkspaceMutationCommands>[0];
type RecordInput = Parameters<typeof useDatabaseWorkspaceRecordCommands>[0];

/** Owns typed mutation and record-command input construction. */
export function useDatabaseWorkspaceMutationRecordCommands({
  props,
  state,
  description,
  result,
  selectedView,
  itemNoun,
}: {
  props: DatabaseTableDialogProps;
  state: WorkspaceState;
  description: MutationInput['description'];
  result: RecordInput['result'];
  selectedView: RecordInput['selectedView'];
  itemNoun: RecordInput['itemNoun'];
}) {
  const { open, initialRecordAction } = props;
  const {
    refreshNow,
    reviewResolverRef,
    setMutationStatus,
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
    setOptimisticCellValues,
    setRecordPatches,
    locallyHandledRecordIdsRef,
    selection,
    offlineQueue,
    setOfflineQueue,
    queueReconciliationRunningRef,
    buttonStatus,
    setButtonStatus,
    setButtonPlan,
    buttonPlan,
    mutationStatus,
    newRecordTitle,
    newRecordTemplateId,
    tableCalculations,
    setNewRecordOpen,
    setNewRecordTitle,
    setNewRecordFocusRequest,
    setMoveRecord,
    setMoveTargetSourceId,
    moveRecord,
    moveTargetSourceId,
    handledInitialRecordActionRef,
  } = state;
  const mutationCommands = useDatabaseWorkspaceMutationCommands({
    open,
    refreshNow,
    reviewResolver: reviewResolverRef,
    setMutationStatus,
    description,
    searchDatabaseRelationRecords,
    setRelationCandidates,
    setMutationError,
    setMutationConflict,
    setOfflineQueueMessage,
    setSaveFeedback,
    setMutationProgressVisible,
    databaseUiMutationReviewMode,
    setMutationReviewMode,
    executeDatabaseUiMutation,
    setGhost,
    setLastUndoToken,
    setLastRedoToken,
    setSelectedRecordIds,
    setRefresh,
    setOptimisticCellValues,
    setRecordPatches,
    locallyHandledRecordIdsRef,
    selection,
    getBranchSnapshot,
    getServerInstanceId,
    offlineQueueableRecordMutations,
    createOfflineDatabaseMutation,
    enqueueOfflineDatabaseMutation,
    offlineDatabaseMutationStore,
    setOfflineQueue,
    queueReconciliationRunning: queueReconciliationRunningRef,
    offlineQueue,
    classifyDatabaseUiProblem,
    DatabasePlanExecutionError,
    reconcileOfflineDatabaseMutations,
    describeDatabase,
    rebaseQueuedDatabaseRecordMutations,
    databaseConflictProblem,
    createDatabaseViewConfigurationChangeDesiredState,
    createDatabaseDefaultViewChangeDesiredState,
    executeReviewedDatabasePlan,
    createDatabaseButtonPlan,
    executeDatabaseButtonPlan,
    buttonStatus,
    setButtonStatus,
    setButtonPlan,
    buttonPlan,
    mutationStatus,
  });
  const recordCommands = useDatabaseWorkspaceRecordCommands({
    description,
    mutationStatus,
    setOptimisticCellValues,
    runMutation: mutationCommands.runMutation,
    runMarkdownTable: mutationCommands.runMarkdownTable,
    setMutationError,
    classifyDatabaseUiProblem,
    createDatabaseCellMutationDesiredState,
    createDatabaseVerificationPlan,
    setMutationStatus,
    executeReviewedDatabasePlan,
    reviewResolver: reviewResolverRef,
    setGhost,
    databaseConflictProblem,
    setLastUndoToken,
    setLastRedoToken,
    setRefresh,
    newRecordTitle,
    newRecordTemplateId,
    selectedView,
    tableCalculations,
    itemNoun,
    setNewRecordOpen,
    setNewRecordTitle,
    setNewRecordFocusRequest,
    setMoveRecord,
    setMoveTargetSourceId,
    moveRecord,
    moveTargetSourceId,
    createDatabaseRecordDesiredState,
    createDatabaseRecordDeletionDesiredState,
    createDatabaseRecordCopyDesiredState,
    createDatabaseRecordArchiveDesiredState,
    createDatabaseRecordMoveDesiredState,
    open,
    initialRecordAction,
    result,
    handledInitialRecordAction: handledInitialRecordActionRef,
  });
  return { ...mutationCommands, ...recordCommands };
}
