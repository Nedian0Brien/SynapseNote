import type {
  DatabaseCalculationFunction,
  DatabaseQueryResult,
  DatabaseSelectOptionChange,
  DatabaseSelectOptionPreview,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseButtonPlan,
  DatabaseDesiredStateDraftInput,
  DatabaseMarkdownTableMutationRequest,
  DatabasePlanArtifact,
} from '@nedian0brien/synapsenote-server';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import type { DatabaseAgentScope } from '@/components/handoff/database-agent-scope';
import type { DatabaseDescription } from '@/lib/database-catalog-client';
import type { DatabaseImportInspection } from '@/lib/database-csv';
import type { DatabaseJsonExportInput } from '@/lib/database-json';
import type {
  DatabaseGhostState,
  ExecuteDatabaseUiMutationResult,
} from '@/lib/database-mutation-client';
import type { DatabaseUiMutationPolicyInput } from '@/lib/database-mutation-policy';
import type { OfflineDatabaseMutation } from '@/lib/database-offline-mutation-queue';
import type { DatabasePropertyDeletionPreview } from '@/lib/database-property-deletion';
import type { DatabasePasteChange } from '@/lib/database-tsv';
import type { DatabaseUiProblem } from '@/lib/database-ui-problem';
import type {
  DatabaseInitialRecordAction,
  DatabaseSelectProperty,
  DatabaseTableSelection,
  LoadStatus,
} from './database-table-types';

/**
 * Render context shared by workspace presentation slices.
 *
 * The runtime owns the controller and supplies this immutable snapshot to
 * header/content/overlay components. Keeping this contract separate avoids
 * importing the runtime from a presentation module and makes the dependency
 * direction explicit while the controller is being split into domains.
 */
// biome-ignore lint/suspicious/noExplicitAny: the presentation context is intentionally transitional during the workspace split.
export type DatabaseWorkspaceRenderContext = Record<string, any>;

type DatabaseWorkspaceMutationStatus = 'idle' | 'planning' | 'review' | 'committing';
type DatabaseWorkspaceButtonStatus = 'idle' | 'planning' | 'committing';
type DatabaseWorkspaceHistoryStatus = 'idle' | 'checking' | 'applying';
type DatabaseWorkspaceCsvStatus =
  | 'idle'
  | 'exporting-current'
  | 'exporting-all'
  | 'exporting-json'
  | 'importing';

interface DatabaseWorkspaceRunMutationOptions {
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
}

/** Reviewed desired-state commit shared by every command domain. */
export type DatabaseWorkspaceRunMutation = (
  desiredState: DatabaseDesiredStateDraftInput,
  idempotencyPrefix: string,
  failureMessage: string,
  options?: DatabaseWorkspaceRunMutationOptions,
) => void;

interface DatabaseWorkspaceRunMarkdownTableOptions {
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
}

/** Owner-table write path for Markdown-backed sources. */
export type DatabaseWorkspaceRunMarkdownTable = (
  mutation: DatabaseMarkdownTableMutationRequest,
  options?: DatabaseWorkspaceRunMarkdownTableOptions,
) => void;

/**
 * Every dependency the runtime can hand to a command hook.
 *
 * Each hook takes its own `Pick` of this catalogue, so a field a hook
 * destructures is a field the call site must supply: omitting one is a build
 * error rather than a `undefined is not a function` inside a promise chain.
 */
interface DatabaseWorkspaceControllerFields {
  // Surface and read state.
  open: boolean;
  isPagePresentation: boolean;
  itemNoun: string;
  onOpenChange: (open: boolean) => void;
  description: DatabaseDescription | null;
  result: DatabaseQueryResult | null;
  selection: DatabaseTableSelection | null;
  catalogStatus: LoadStatus;
  tableStatus: LoadStatus;
  databasePageTitle: string;

  // One-shot handoffs consumed through a ref-backed action key.
  initialRecordAction: DatabaseInitialRecordAction | undefined;
  initialTablePaste: readonly DatabasePasteChange[] | undefined;
  initialDatabaseSurface:
    | 'properties'
    | 'options'
    | 'view-settings'
    | 'view-manager'
    | 'filters'
    | undefined;
  initialViewAction: DatabaseViewManagerInitialAction | undefined;
  initialPropertyId: string | undefined;
  initialSelectedRecordIds: readonly string[] | undefined;
  handledInitialRecordAction: RefObject<string | null>;
  handledInitialTablePaste: RefObject<string | null>;
  handledInitialDatabaseSurface: RefObject<string | null>;
  handledInitialSelectedRecordIds: RefObject<string | null>;

  // Refresh scheduling.
  refreshNow: () => void;
  setRefresh: Dispatch<SetStateAction<number>>;

  // Mutation lifecycle.
  mutationStatus: DatabaseWorkspaceMutationStatus;
  setMutationStatus: Dispatch<SetStateAction<DatabaseWorkspaceMutationStatus>>;
  setMutationReviewMode: Dispatch<SetStateAction<'required' | 'automatic'>>;
  setMutationProgressVisible: Dispatch<SetStateAction<boolean>>;
  setSaveFeedback: Dispatch<SetStateAction<'saved' | 'queued' | 'failed' | null>>;
  setMutationError: Dispatch<SetStateAction<DatabaseUiProblem | null>>;
  setMutationConflict: Dispatch<
    SetStateAction<{ plan: DatabasePlanArtifact; replan?: () => void } | null>
  >;
  setGhost: Dispatch<SetStateAction<DatabaseGhostState | null>>;
  reviewResolver: RefObject<((approved: boolean) => void) | null>;
  runMutation: DatabaseWorkspaceRunMutation;
  runMarkdownTable: DatabaseWorkspaceRunMarkdownTable;
  commitDefaultViewChange: (viewId?: string) => boolean;

  // Undo and redo.
  lastUndoToken: string | null;
  setLastUndoToken: Dispatch<SetStateAction<string | null>>;
  lastRedoToken: string | null;
  setLastRedoToken: Dispatch<SetStateAction<string | null>>;
  undoStatus: DatabaseWorkspaceHistoryStatus;
  setUndoStatus: Dispatch<SetStateAction<DatabaseWorkspaceHistoryStatus>>;
  redoStatus: DatabaseWorkspaceHistoryStatus;
  setRedoStatus: Dispatch<SetStateAction<DatabaseWorkspaceHistoryStatus>>;
  undoLastChange: () => void;
  redoLastChange: () => void;

  // Records.
  selectedRecordIds: Set<string>;
  setSelectedRecordIds: Dispatch<SetStateAction<Set<string>>>;
  setOptimisticCellValues: Dispatch<SetStateAction<Map<string, DatabaseValue | undefined>>>;
  setRecordPatches: Dispatch<
    SetStateAction<Map<string, { record: ProjectedDatabaseRecord; snapshotRevision: string }>>
  >;
  locallyHandledRecordIdsRef: RefObject<Map<string, number>>;
  newRecordTitle: string;
  setNewRecordTitle: Dispatch<SetStateAction<string>>;
  newRecordTemplateId: string;
  setNewRecordOpen: Dispatch<SetStateAction<boolean>>;
  setNewRecordFocusRequest: Dispatch<SetStateAction<number | null>>;
  moveRecord: ProjectedDatabaseRecord | null;
  setMoveRecord: Dispatch<SetStateAction<ProjectedDatabaseRecord | null>>;
  moveTargetSourceId: string;
  setMoveTargetSourceId: Dispatch<SetStateAction<string>>;
  setRelationCandidates: Dispatch<SetStateAction<ProjectedDatabaseRelationRecord[]>>;

  // Offline queue.
  offlineQueue: OfflineDatabaseMutation[];
  setOfflineQueue: Dispatch<SetStateAction<OfflineDatabaseMutation[]>>;
  setOfflineQueueMessage: Dispatch<SetStateAction<string | null>>;
  queueReconciliationRunning: RefObject<boolean>;

  // Button property runs.
  buttonPlan: DatabaseButtonPlan | null;
  setButtonPlan: Dispatch<SetStateAction<DatabaseButtonPlan | null>>;
  buttonStatus: DatabaseWorkspaceButtonStatus;
  setButtonStatus: Dispatch<SetStateAction<DatabaseWorkspaceButtonStatus>>;

  // Saved views and page chrome.
  selectedView: DatabaseView | undefined;
  selectedViewId: string;
  setSelectedViewId: Dispatch<SetStateAction<string>>;
  optimisticViewOrder: readonly string[] | null;
  setOptimisticViewOrder: Dispatch<SetStateAction<readonly string[] | null>>;
  setDraggedViewId: Dispatch<SetStateAction<string | null>>;
  setDragOverViewId: Dispatch<SetStateAction<string | null>>;
  viewRenameTarget: DatabaseView | null;
  setViewRenameTarget: Dispatch<SetStateAction<DatabaseView | null>>;
  setViewManagerOpen: Dispatch<SetStateAction<boolean>>;
  setViewSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setFilterDialogOpen: Dispatch<SetStateAction<boolean>>;
  setAppearanceOpen: Dispatch<SetStateAction<boolean>>;
  setPropertyFilterTargetId: Dispatch<SetStateAction<string | null>>;
  setPropertySortTargetId: Dispatch<SetStateAction<string | null>>;
  tableCalculations: Record<string, DatabaseCalculationFunction>;
  setTableCalculations: Dispatch<SetStateAction<Record<string, DatabaseCalculationFunction>>>;
  preserveSelectionOnRefreshRef: RefObject<boolean>;
  pageTitleDraft: string;
  setPageTitleEditing: Dispatch<SetStateAction<boolean>>;
  pageStatus: 'idle' | 'loading' | 'error';
  setPageStatus: Dispatch<SetStateAction<'idle' | 'loading' | 'error'>>;
  setPageCursor: Dispatch<SetStateAction<string | null>>;
  setPageError: Dispatch<SetStateAction<DatabaseUiProblem | null>>;
  showArchived: boolean;

  // Select options and property surfaces.
  optionId: string;
  setOptionId: Dispatch<SetStateAction<string>>;
  setOptionName: Dispatch<SetStateAction<string>>;
  setOptionColor: Dispatch<SetStateAction<string>>;
  setOptionMergeTargetId: Dispatch<SetStateAction<string>>;
  optionPropertyId: string;
  setOptionPropertyId: Dispatch<SetStateAction<string>>;
  optionStatus: 'idle' | 'loading';
  setOptionStatus: Dispatch<SetStateAction<'idle' | 'loading'>>;
  optionPreview: {
    change: DatabaseSelectOptionChange;
    preview: DatabaseSelectOptionPreview;
    desiredState: DatabaseDesiredStateDraftInput | null;
  } | null;
  setOptionPreview: Dispatch<
    SetStateAction<{
      change: DatabaseSelectOptionChange;
      preview: DatabaseSelectOptionPreview;
      desiredState: DatabaseDesiredStateDraftInput | null;
    } | null>
  >;
  setSelectOptionsOpen: Dispatch<SetStateAction<boolean>>;
  openSelectOptions: (property: DatabaseSelectProperty) => void;
  computedPropertyId: string | null;
  uniqueIdPropertyId: string | null;
  placePropertyId: string | null;
  buttonPropertyId: string | null;
  conversionPropertyId: string | null;
  setPropertiesDialogOpen: Dispatch<SetStateAction<boolean>>;
  setPropertiesDialogRenameId: Dispatch<SetStateAction<string | null>>;
  setPropertiesError: Dispatch<SetStateAction<string | null>>;
  propertiesRemoveStatus: 'idle' | 'loading';
  setPropertiesRemoveStatus: Dispatch<SetStateAction<'idle' | 'loading'>>;
  setPropertyDeletionPreview: Dispatch<SetStateAction<DatabasePropertyDeletionPreview | null>>;

  // Agent handoff.
  agentScopeOverride: DatabaseAgentScope | null;
  setAgentScopeOverride: Dispatch<SetStateAction<DatabaseAgentScope | null>>;
  setAgentMenuOpen: Dispatch<SetStateAction<boolean>>;

  // Import, export, and bulk selection drafts.
  bulkPropertyId: string;
  bulkDraft: string;
  csvStatus: DatabaseWorkspaceCsvStatus;
  setCsvStatus: Dispatch<SetStateAction<DatabaseWorkspaceCsvStatus>>;
  importPreview: { filename: string; inspection: DatabaseImportInspection } | null;
  setImportPreview: Dispatch<
    SetStateAction<{ filename: string; inspection: DatabaseImportInspection } | null>
  >;
  collectDatabaseSnapshot: (scope: 'current' | 'all') => Promise<DatabaseQueryResult>;
  databaseSnapshotToJson: (input: DatabaseJsonExportInput) => string;
}

export type DatabaseWorkspaceMutationCommandsContext = Pick<
  DatabaseWorkspaceControllerFields,
  | 'open'
  | 'reviewResolver'
  | 'setMutationStatus'
  | 'description'
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
  | 'locallyHandledRecordIdsRef'
  | 'selection'
  | 'setOfflineQueue'
  | 'buttonStatus'
  | 'setButtonStatus'
  | 'setButtonPlan'
  | 'buttonPlan'
  | 'mutationStatus'
  | 'queueReconciliationRunning'
  | 'offlineQueue'
>;

export type DatabaseWorkspaceRecordCommandsContext = Pick<
  DatabaseWorkspaceControllerFields,
  | 'description'
  | 'mutationStatus'
  | 'setOptimisticCellValues'
  | 'runMutation'
  | 'runMarkdownTable'
  | 'setMutationError'
  | 'setMutationStatus'
  | 'reviewResolver'
  | 'setGhost'
  | 'setLastUndoToken'
  | 'setLastRedoToken'
  | 'setRefresh'
  | 'newRecordTitle'
  | 'newRecordTemplateId'
  | 'selectedView'
  | 'tableCalculations'
  | 'itemNoun'
  | 'setNewRecordOpen'
  | 'setNewRecordTitle'
  | 'setNewRecordFocusRequest'
  | 'setMoveRecord'
  | 'setMoveTargetSourceId'
  | 'moveRecord'
  | 'moveTargetSourceId'
  | 'open'
  | 'initialRecordAction'
  | 'result'
  | 'handledInitialRecordAction'
>;

export type DatabaseWorkspaceBulkCommandsContext = Pick<
  DatabaseWorkspaceControllerFields,
  | 'description'
  | 'result'
  | 'selectedRecordIds'
  | 'bulkPropertyId'
  | 'bulkDraft'
  | 'setMutationError'
  | 'mutationStatus'
  | 'runMutation'
  | 'setSelectedRecordIds'
  | 'initialTablePaste'
  | 'handledInitialTablePaste'
  | 'open'
  | 'initialDatabaseSurface'
  | 'initialViewAction'
  | 'initialPropertyId'
  | 'handledInitialDatabaseSurface'
  | 'setPropertiesDialogRenameId'
  | 'setPropertiesDialogOpen'
  | 'openSelectOptions'
  | 'setViewRenameTarget'
  | 'commitDefaultViewChange'
  | 'setViewManagerOpen'
  | 'setFilterDialogOpen'
  | 'setViewSettingsOpen'
  | 'initialSelectedRecordIds'
  | 'handledInitialSelectedRecordIds'
  | 'selection'
  | 'showArchived'
  | 'csvStatus'
  | 'setCsvStatus'
  | 'databaseSnapshotToJson'
>;

export type DatabaseWorkspaceSchemaCommandsContext = Pick<
  DatabaseWorkspaceControllerFields,
  | 'setOptionPreview'
  | 'setOptionStatus'
  | 'description'
  | 'setMutationError'
  | 'optionPreview'
  | 'runMutation'
  | 'setPropertyDeletionPreview'
  | 'setPropertiesError'
  | 'setPropertiesRemoveStatus'
  | 'propertiesRemoveStatus'
  | 'mutationStatus'
  | 'result'
  | 'csvStatus'
  | 'setCsvStatus'
  | 'importPreview'
  | 'setImportPreview'
  | 'setLastUndoToken'
  | 'setLastRedoToken'
  | 'lastUndoToken'
  | 'lastRedoToken'
  | 'selection'
  | 'optionStatus'
  | 'optionPropertyId'
  | 'collectDatabaseSnapshot'
  | 'selectedView'
  | 'setPropertiesDialogOpen'
  | 'setPropertiesDialogRenameId'
  | 'undoStatus'
  | 'setUndoStatus'
  | 'setSelectedRecordIds'
  | 'setRefresh'
  | 'setOptimisticViewOrder'
  | 'redoStatus'
  | 'setRedoStatus'
>;

export type DatabaseWorkspaceViewCommandsContext = Pick<
  DatabaseWorkspaceControllerFields,
  | 'description'
  | 'selectedViewId'
  | 'pageStatus'
  | 'setPageStatus'
  | 'setPageCursor'
  | 'result'
  | 'setRefresh'
  | 'locallyHandledRecordIdsRef'
  | 'mutationStatus'
  | 'optionId'
  | 'optimisticViewOrder'
  | 'selection'
  | 'agentScopeOverride'
  | 'setAgentMenuOpen'
  | 'setSelectedViewId'
  | 'setTableCalculations'
  | 'setFilterDialogOpen'
  | 'setViewSettingsOpen'
  | 'setViewManagerOpen'
  | 'setSelectedRecordIds'
  | 'commitDefaultViewChange'
  | 'pageTitleDraft'
  | 'setPageTitleEditing'
  | 'databasePageTitle'
  | 'setMutationError'
  | 'runMutation'
  | 'isPagePresentation'
  | 'open'
  | 'preserveSelectionOnRefreshRef'
  | 'onOpenChange'
  | 'setViewRenameTarget'
  | 'setPageError'
  | 'undoStatus'
  | 'redoStatus'
  | 'lastUndoToken'
  | 'lastRedoToken'
  | 'redoLastChange'
  | 'undoLastChange'
  | 'reviewResolver'
  | 'setGhost'
  | 'setMutationStatus'
  | 'setButtonPlan'
  | 'setButtonStatus'
  | 'setOptimisticViewOrder'
  | 'setDraggedViewId'
  | 'setDragOverViewId'
  | 'catalogStatus'
  | 'tableStatus'
  | 'optionPropertyId'
  | 'setOptionPropertyId'
  | 'setOptionId'
  | 'setOptionName'
  | 'setOptionColor'
  | 'setOptionMergeTargetId'
  | 'setOptionPreview'
  | 'setSelectOptionsOpen'
  | 'computedPropertyId'
  | 'uniqueIdPropertyId'
  | 'placePropertyId'
  | 'buttonPropertyId'
  | 'conversionPropertyId'
  | 'selectedRecordIds'
  | 'setAgentScopeOverride'
  | 'setPropertyFilterTargetId'
  | 'setPropertySortTargetId'
  | 'viewRenameTarget'
  | 'setAppearanceOpen'
>;
