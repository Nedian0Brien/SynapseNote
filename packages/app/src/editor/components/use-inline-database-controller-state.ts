import type { DatabaseLinkedViewSettings, DatabaseValue } from '@nedian0brien/synapsenote-core';
import { useEffect, useRef, useState } from 'react';
import type {
  DatabaseInitialRecordAction,
  DatabaseTableViewState,
} from '@/components/DatabaseTableDialog';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import type { DatabaseAgentScope } from '@/components/handoff/database-agent-scope';
import type { DatabasePasteChange } from '@/lib/database-tsv';
import { useDatabaseRefreshScheduler } from '@/lib/use-database-refresh-scheduler';
import { useInlineDatabaseOverlayState } from '@/lib/use-inline-database-overlay-state';
import type { InlineDatabaseReference, InlineDatabaseReferenceData } from './inline-database-types';

/**
 * Owns transient inline-table state. Keeping this state outside the command
 * coordinator prevents a mutation or overlay update from changing the table
 * shell's identity and gives every state family one explicit home.
 */
export function useInlineDatabaseControllerState(input: {
  reference: InlineDatabaseReference;
  referenceData: InlineDatabaseReferenceData;
}) {
  const { reference, referenceData } = input;
  const [localViewOverrides, setLocalViewOverrides] = useState<
    DatabaseLinkedViewSettings | undefined
  >(() => (reference.success ? referenceData.viewOverrides : undefined));
  const referenceViewOverridesKey = reference.success
    ? JSON.stringify(referenceData.viewOverrides ?? null)
    : 'unresolved';
  const referenceSurfaceKey = reference.success
    ? `${referenceData.databaseId}\0${referenceData.sourceId}\0${referenceData.viewId}`
    : 'unresolved';
  useEffect(() => {
    setLocalViewOverrides(
      referenceSurfaceKey === 'unresolved' ||
        referenceViewOverridesKey === 'unresolved' ||
        referenceViewOverridesKey === 'null'
        ? undefined
        : (JSON.parse(referenceViewOverridesKey) as DatabaseLinkedViewSettings),
    );
  }, [referenceSurfaceKey, referenceViewOverridesKey]);

  const { refreshKey: refresh, scheduleRefresh, refreshNow } = useDatabaseRefreshScheduler();
  const [fullDatabaseOpen, setFullDatabaseOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [initialRecordAction, setInitialRecordAction] = useState<DatabaseInitialRecordAction>();
  const [initialTablePaste, setInitialTablePaste] = useState<readonly DatabasePasteChange[]>();
  const [initialDatabaseSurface, setInitialDatabaseSurface] = useState<
    'properties' | 'options' | 'view-settings' | 'view-manager' | 'filters'
  >();
  const [initialViewAction, setInitialViewAction] = useState<
    DatabaseViewManagerInitialAction | undefined
  >();
  const [initialPropertyId, setInitialPropertyId] = useState<string>();
  const [initialSelectedRecordIds, setInitialSelectedRecordIds] = useState<readonly string[]>();
  const [linkedViewSettingsOpen, setLinkedViewSettingsOpen] = useState(false);
  const [linkedFilterOpen, setLinkedFilterOpen] = useState(false);
  const [linkedSortTargetId, setLinkedSortTargetId] = useState<string>();
  const [linkedFilterTargetId, setLinkedFilterTargetId] = useState<string>();
  const [replacementPickerOpen, setReplacementPickerOpen] = useState(false);
  const [inlineContextInspectorScope, setInlineContextInspectorScope] = useState<{
    recordId?: string;
    recordIds?: string[];
    propertyIds?: string[];
  } | null>(null);
  const [inlineAgentScopeOverride, setInlineAgentScopeOverride] =
    useState<DatabaseAgentScope | null>(null);
  const [inlineAgentMenuOpen, setInlineAgentMenuOpen] = useState(false);
  const [inlineCreationOpen, setInlineCreationOpen] = useState(false);
  const [inlineViewManagerOpen, setInlineViewManagerOpen] = useState(false);
  const [inlineSettingsOpen, setInlineSettingsOpen] = useState(false);
  const [inlineActionsMenuOpen, setInlineActionsMenuOpen] = useState(false);
  const [inlineViewManagerInitialAction, setInlineViewManagerInitialAction] = useState<
    DatabaseViewManagerInitialAction | undefined
  >();
  const [inlineTitleEditing, setInlineTitleEditing] = useState(false);
  const [inlineTitleDraft, setInlineTitleDraft] = useState('');
  const [inlineSearchOpen, setInlineSearchOpen] = useState(false);
  const [inlineSearchQuery, setInlineSearchQuery] = useState('');
  const [inlineSearchRequest, setInlineSearchRequest] = useState('');
  const [inlineSearchPageCursor, setInlineSearchPageCursor] = useState<string | null>(null);
  const [focusInlineNewRecordRequest, setFocusInlineNewRecordRequest] = useState<number | null>(
    null,
  );
  const [inlineSaveFeedback, setInlineSaveFeedback] = useState<
    'saved' | 'undone' | 'redone' | null
  >(null);
  const [inlineOptimisticCellValues, setInlineOptimisticCellValues] = useState<
    Map<string, DatabaseValue | undefined>
  >(() => new Map());
  const [inlineSelectedRecordIds, setInlineSelectedRecordIds] = useState<Set<string>>(
    () => new Set(),
  );
  const inlineTableViewStatesRef = useRef(new Map<string, DatabaseTableViewState>());
  const [inlineTableViewStates, setInlineTableViewStates] = useState(
    () => new Map<string, DatabaseTableViewState>(),
  );
  const inlineSaveFeedbackTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const inlineSearchSurfaceKeyRef = useRef<string | null>(null);
  const inlineOverlayState = useInlineDatabaseOverlayState();
  const inlineFilterOpen = inlineOverlayState.overlay?.kind === 'filter';
  const inlineSortOpen = inlineOverlayState.overlay?.kind === 'sort';
  const inlinePropertiesOpen = inlineOverlayState.overlay?.kind === 'properties';
  const inlineFilterTargetId =
    inlineOverlayState.overlay?.kind === 'filter'
      ? inlineOverlayState.overlay.propertyId
      : undefined;
  const inlineSortTargetId =
    inlineOverlayState.overlay?.kind === 'sort' ? inlineOverlayState.overlay.propertyId : undefined;

  return {
    localViewOverrides,
    setLocalViewOverrides,
    refresh,
    scheduleRefresh,
    refreshNow,
    fullDatabaseOpen,
    setFullDatabaseOpen,
    showArchived,
    setShowArchived,
    initialRecordAction,
    setInitialRecordAction,
    initialTablePaste,
    setInitialTablePaste,
    initialDatabaseSurface,
    setInitialDatabaseSurface,
    initialViewAction,
    setInitialViewAction,
    initialPropertyId,
    setInitialPropertyId,
    initialSelectedRecordIds,
    setInitialSelectedRecordIds,
    linkedViewSettingsOpen,
    setLinkedViewSettingsOpen,
    linkedFilterOpen,
    setLinkedFilterOpen,
    linkedSortTargetId,
    setLinkedSortTargetId,
    linkedFilterTargetId,
    setLinkedFilterTargetId,
    replacementPickerOpen,
    setReplacementPickerOpen,
    inlineContextInspectorScope,
    setInlineContextInspectorScope,
    inlineAgentScopeOverride,
    setInlineAgentScopeOverride,
    inlineAgentMenuOpen,
    setInlineAgentMenuOpen,
    inlineCreationOpen,
    setInlineCreationOpen,
    inlineViewManagerOpen,
    setInlineViewManagerOpen,
    inlineSettingsOpen,
    setInlineSettingsOpen,
    inlineActionsMenuOpen,
    setInlineActionsMenuOpen,
    inlineViewManagerInitialAction,
    setInlineViewManagerInitialAction,
    inlineTitleEditing,
    setInlineTitleEditing,
    inlineTitleDraft,
    setInlineTitleDraft,
    inlineSearchOpen,
    setInlineSearchOpen,
    inlineSearchQuery,
    setInlineSearchQuery,
    inlineSearchRequest,
    setInlineSearchRequest,
    inlineSearchPageCursor,
    setInlineSearchPageCursor,
    focusInlineNewRecordRequest,
    setFocusInlineNewRecordRequest,
    inlineSaveFeedback,
    setInlineSaveFeedback,
    inlineOptimisticCellValues,
    setInlineOptimisticCellValues,
    inlineSelectedRecordIds,
    setInlineSelectedRecordIds,
    inlineTableViewStatesRef,
    inlineTableViewStates,
    setInlineTableViewStates,
    inlineSaveFeedbackTimerRef,
    inlineSearchSurfaceKeyRef,
    inlineOverlayState,
    inlineFilterOpen,
    inlineSortOpen,
    inlinePropertiesOpen,
    inlineFilterTargetId,
    inlineSortTargetId,
  };
}
