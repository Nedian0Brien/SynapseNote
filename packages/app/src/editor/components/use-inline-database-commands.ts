import type {
  DatabaseProperty,
  DatabaseValue,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import type { DatabaseViewTabAction } from '@/components/DatabaseViewTabMenu';
import type { DatabaseMutationPolicy } from '@/lib/database-mutation-controller';
import {
  createDatabaseCellMutationDesiredState,
  createDatabaseTablePasteDesiredState,
} from '@/lib/database-mutations/database-cell-commands';
import {
  clearOptimisticCellValue,
  clearOptimisticCellValues,
  optimisticCellKey,
  setOptimisticCellValue,
} from '@/lib/database-mutations/database-mutation-gateway';
import {
  createDatabaseAddPropertyDesiredState,
  createDatabasePropertyDefinitionForAdd,
} from '@/lib/database-mutations/database-property-commands';
import { createDatabaseRecordDesiredState } from '@/lib/database-mutations/database-record-commands';
import type { DatabaseViewLifecycleChange } from '@/lib/database-mutations/database-view-commands';
import {
  createDatabaseDefaultViewChangeDesiredState,
  createDatabasePageTitleDesiredState,
  createDatabaseViewLifecycleChangeDesiredState,
} from '@/lib/database-mutations/database-view-commands';
import { navigateToDatabaseRecordPath } from '@/lib/database-navigation';
import { updateDatabaseRecordPeek } from '@/lib/database-overlay-store';
import { requestOpenDatabaseRecord } from '@/lib/database-record-open-command';
import type { DatabasePasteChange } from '@/lib/database-tsv';
import { classifyDatabaseUiProblem, databaseMutationUiMessage } from '@/lib/database-ui-problem';
import {
  createMarkdownTableCellMutation,
  createMarkdownTableRowCreateMutation,
  markdownTableDefaultValues,
  markdownTableDocumentMarkdown,
  markdownTableDocumentPath,
} from '@/lib/database-markdown-table-client';
import { createInlineHistoryKeyDown } from './inline-database-history';
import type { InlineDatabaseReferenceData } from './inline-database-types';
import {
  databaseViewTabActionToInitialAction,
  linkedViewSettingsFromView,
} from './inline-database-utils';
import type { useInlineDatabaseControllerState } from './use-inline-database-controller-state';
import { createInlineDatabaseOptionCommands } from './use-inline-database-option-commands';
import type { useInlineDatabaseReadState } from './use-inline-database-read-state';

type InlineControllerState = ReturnType<typeof useInlineDatabaseControllerState>;
type InlineReadState = ReturnType<typeof useInlineDatabaseReadState>;
type RunInlineMutation = (
  desiredState: DatabaseDesiredStateDraftInput,
  policy: DatabaseMutationPolicy,
) => void;

export interface UseInlineDatabaseCommandsOptions {
  referenceData: InlineDatabaseReferenceData;
  controller: InlineControllerState;
  read: InlineReadState;
  runInlineMutation: RunInlineMutation;
  runInlineMarkdownTableMutation: (
    mutation: import('@nedian0brien/synapsenote-server').DatabaseMarkdownTableMutationRequest,
    policy: DatabaseMutationPolicy,
  ) => void;
  setInlineMutationError: (value: string | null) => void;
  inlineUndoToken: string | null;
  inlineRedoToken: string | null;
  undoInlineMutation: () => void;
  redoInlineMutation: () => void;
}

export function useInlineDatabaseCommands({
  referenceData,
  controller,
  read,
  runInlineMutation,
  runInlineMarkdownTableMutation,
  setInlineMutationError,
  inlineUndoToken,
  inlineRedoToken,
  undoInlineMutation,
  redoInlineMutation,
}: UseInlineDatabaseCommandsOptions) {
  'use no memo';
  const {
    setInlineOptimisticCellValues,
    setInlineTitleEditing,
    inlineTitleDraft,
    setInitialRecordAction,
    setFullDatabaseOpen,
    setInitialTablePaste,
    inlineOverlayState,
    setInitialDatabaseSurface,
    setInitialPropertyId,
    setInitialViewAction,
    setLinkedSortTargetId,
    setLinkedViewSettingsOpen,
    setLinkedFilterTargetId,
    setLinkedFilterOpen,
    setInlineViewManagerInitialAction,
    setInlineViewManagerOpen,
  } = controller;
  const { state, linkedSource, linkedDatabase, linkedView, activeLinkedView, renderedResult } =
    read;

  const setInlineMutationErrorFromCause = (cause: unknown, fallback: string) => {
    const problem = classifyDatabaseUiProblem(cause, fallback);
    setInlineMutationError(databaseMutationUiMessage(problem.kind));
  };

  const openInlineDatabaseSurface = (
    surface: 'properties' | 'options' | 'view-settings' | 'view-manager' | 'filters',
    propertyId?: string,
    viewAction?: DatabaseViewManagerInitialAction,
    options: { advanced?: boolean } = {},
  ) => {
    if (surface === 'properties') {
      if (!options.advanced) {
        inlineOverlayState.openProperties();
        return;
      }
      setInitialDatabaseSurface('properties');
      setInitialPropertyId(propertyId);
      setFullDatabaseOpen(true);
      return;
    }
    if (surface === 'view-settings') {
      if (!options.advanced) {
        inlineOverlayState.openSort(propertyId);
        return;
      }
      setLinkedSortTargetId(propertyId);
      setLinkedViewSettingsOpen(true);
      return;
    }
    if (surface === 'filters') {
      if (!options.advanced) {
        inlineOverlayState.openFilter(propertyId);
        return;
      }
      setLinkedFilterTargetId(propertyId);
      setLinkedFilterOpen(true);
      return;
    }
    if (surface === 'view-manager' && !options.advanced) {
      setInlineViewManagerInitialAction(viewAction);
      setInlineViewManagerOpen(true);
      return;
    }
    setInitialDatabaseSurface(surface);
    setInitialPropertyId(propertyId);
    setInitialViewAction(viewAction);
    setFullDatabaseOpen(true);
  };

  const openRecord = (record: ProjectedDatabaseRecord) => {
    if (state.status !== 'ready' || !linkedDatabase || !linkedSource) return;
    const outcome = requestOpenDatabaseRecord({
      database: linkedDatabase,
      source: linkedSource,
      view: activeLinkedView,
      record,
      recordPaths: renderedResult?.records.map((item) => item.path) ?? [],
      origin: 'inline',
      notionSurface: true,
      onNavigateRecord: (path) => {
        const nextRecord =
          state.status === 'ready'
            ? renderedResult?.records.find((candidate) => candidate.path === path)
            : undefined;
        if (nextRecord) {
          updateDatabaseRecordPeek({ record: nextRecord });
          return;
        }
        navigateToDatabaseRecordPath(path);
      },
    });
    if (outcome.status === 'invalid') setInlineMutationError(outcome.reason);
  };

  const handleInlineViewTabAction = (
    view: NonNullable<typeof linkedView>,
    action: DatabaseViewTabAction,
  ) => {
    if (action === 'filters') {
      openInlineDatabaseSurface('filters', undefined, undefined, { advanced: true });
      return;
    }
    if (action === 'settings') {
      openInlineDatabaseSurface('view-settings', undefined, undefined, { advanced: true });
      return;
    }
    const initialAction = databaseViewTabActionToInitialAction(view, action);
    openInlineDatabaseSurface('view-manager', undefined, initialAction ?? undefined);
  };

  const commitInlineTitle = () => {
    if (state.status !== 'ready' || !linkedSource || !linkedDatabase) return;
    const nextTitle = inlineTitleDraft.trim();
    if (!nextTitle) {
      setInlineMutationError('A database title is required');
      return;
    }
    if (nextTitle === linkedSource.name) {
      setInlineTitleEditing(false);
      return;
    }
    try {
      runInlineMutation(
        createDatabasePageTitleDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          name: nextTitle,
        }),
        {
          operation: 'title',
          onCommitted: () => setInlineTitleEditing(false),
          onFailed: () => setInlineTitleEditing(true),
        },
      );
    } catch (cause) {
      setInlineMutationErrorFromCause(cause, 'Unable to rename the database');
      setInlineTitleEditing(true);
    }
  };

  const editInlineCell = (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    value: DatabaseValue | undefined,
  ) => {
    if (state.status !== 'ready' || !linkedSource || !linkedDatabase) return;
    const cellKey = optimisticCellKey(record.id, property.id);
    try {
      if (linkedSource.storage?.kind === 'markdown_table' && property.type === 'title') {
        throw new Error('Edit the linked Markdown document title; the owner table stores only its wikilink');
      }
      setInlineOptimisticCellValues((current) => setOptimisticCellValue(current, cellKey, value));
      if (linkedSource.storage?.kind === 'markdown_table') {
        if (!record.storageRevision) {
          throw new Error('The current Markdown owner-table revision is unavailable');
        }
        runInlineMarkdownTableMutation(
          createMarkdownTableCellMutation({
            databaseId: linkedDatabase.id,
            sourceId: linkedSource.id,
            recordId: record.id,
            propertyId: property.id,
            value,
            expectedOwnerRevision: record.storageRevision,
          }),
          { operation: 'cell', optimisticCellKey: cellKey },
        );
        return;
      }
      runInlineMutation(
        createDatabaseCellMutationDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          record,
          property,
          value,
        }),
        { operation: 'cell', optimisticCellKey: cellKey },
      );
    } catch (cause) {
      setInlineOptimisticCellValues((current) => clearOptimisticCellValue(current, cellKey));
      setInlineMutationErrorFromCause(cause, 'Unable to edit the cell');
    }
  };

  const { createAndAssignInlineSelectOption, reorderInlineSelectOptions } =
    createInlineDatabaseOptionCommands({
      isReady: state.status === 'ready',
      linkedSource,
      linkedDatabase,
      records: renderedResult?.records ?? [],
      runInlineMutation,
      setInlineMutationErrorFromCause,
    });

  const createInlineRecord = (title: string) => {
    if (state.status !== 'ready' || !linkedSource || !linkedDatabase) return;
    try {
      if (linkedSource.storage?.kind === 'markdown_table') {
        const normalizedTitle = title.trim();
        if (!normalizedTitle) throw new Error('Title cannot be empty');
        if (!renderedResult?.storageRevision) {
          throw new Error('The current Markdown owner-table revision is unavailable');
        }
        runInlineMarkdownTableMutation(
          createMarkdownTableRowCreateMutation({
            databaseId: linkedDatabase.id,
            sourceId: linkedSource.id,
            documentPath: markdownTableDocumentPath(linkedSource.folder, normalizedTitle),
            documentMarkdown: markdownTableDocumentMarkdown(normalizedTitle),
            values: markdownTableDefaultValues(linkedSource),
            expectedOwnerRevision: renderedResult.storageRevision,
          }),
          { operation: 'record-create' },
        );
        return;
      }
      runInlineMutation(
        createDatabaseRecordDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          title,
          viewId: referenceData.viewId,
        }),
        { operation: 'record-create' },
      );
    } catch (cause) {
      setInlineMutationErrorFromCause(cause, 'Unable to create the inline database page');
    }
  };

  const addInlineProperty = (input: {
    name: string;
    type: DatabaseProperty['type'];
    insertBeforePropertyId?: string;
    insertAfterPropertyId?: string;
  }) => {
    if (state.status !== 'ready' || !linkedSource || !linkedDatabase) return;
    try {
      const property = createDatabasePropertyDefinitionForAdd({
        name: input.name,
        type: input.type,
        existingKeys: linkedSource.properties.map((candidate) => candidate.key),
      });
      runInlineMutation(
        createDatabaseAddPropertyDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          viewId: referenceData.viewId,
          ...(input.insertBeforePropertyId
            ? { insertBeforePropertyId: input.insertBeforePropertyId }
            : {}),
          ...(input.insertAfterPropertyId
            ? { insertAfterPropertyId: input.insertAfterPropertyId }
            : {}),
          property,
        }),
        { operation: 'property-create' },
      );
    } catch (cause) {
      setInlineMutationErrorFromCause(cause, 'Unable to add the inline database property');
    }
  };

  const applyInlineViewChanges = (
    record: ProjectedDatabaseRecord,
    changes: readonly { property: DatabaseProperty; value: DatabaseValue | undefined }[],
  ) => {
    if (changes.length > 0 && state.status === 'ready' && linkedSource && linkedDatabase) {
      const optimisticCellKeys = changes.map((change) =>
        optimisticCellKey(record.id, change.property.id),
      );
      try {
        setInlineOptimisticCellValues((current) => {
          const next = new Map(current);
          for (const change of changes)
            next.set(optimisticCellKey(record.id, change.property.id), change.value);
          return next;
        });
        runInlineMutation(
          createDatabaseTablePasteDesiredState({
            database: linkedDatabase,
            source: linkedSource,
            changes: changes.map((change) => ({ record, ...change })),
          }),
          { operation: 'cell', optimisticCellKeys },
        );
        return;
      } catch (cause) {
        setInlineOptimisticCellValues((current) =>
          clearOptimisticCellValues(current, optimisticCellKeys),
        );
        setInlineMutationErrorFromCause(cause, 'Unable to save the inline database change');
        return;
      }
    }
    setInitialRecordAction({
      kind: 'transition',
      recordId: record.id,
      changes: changes.map((change) => ({
        propertyId: change.property.id,
        ...(change.value === undefined ? {} : { value: change.value }),
      })),
    });
    setFullDatabaseOpen(true);
  };

  const pasteInlineCells = (changes: readonly DatabasePasteChange[]) => {
    if (changes.length === 0) return;
    if (changes.length === 1) {
      const [change] = changes;
      if (change) editInlineCell(change.record, change.property, change.value);
      return;
    }
    setInitialTablePaste(changes);
    setInlineMutationError(null);
    setFullDatabaseOpen(true);
  };

  const commitInlineViewChange = (change: DatabaseViewLifecycleChange) => {
    if (state.status !== 'ready' || !linkedSource || !linkedDatabase) return;
    try {
      runInlineMutation(
        createDatabaseViewLifecycleChangeDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          change,
        }),
        {
          operation: 'view',
          onCommitted: () => {
            setInlineViewManagerInitialAction(undefined);
            setInlineViewManagerOpen(false);
          },
        },
      );
    } catch (cause) {
      setInlineMutationErrorFromCause(cause, 'Unable to update saved view');
    }
  };

  const commitInlineDefaultViewChange = (nextViewId?: string) => {
    if (state.status !== 'ready' || !linkedSource || !linkedDatabase) return;
    try {
      runInlineMutation(
        createDatabaseDefaultViewChangeDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          ...(nextViewId ? { viewId: nextViewId } : {}),
        }),
        { operation: 'view', onCommitted: () => setInlineViewManagerOpen(false) },
      );
    } catch (cause) {
      setInlineMutationErrorFromCause(cause, 'Unable to update default view');
    }
  };

  return {
    openRecord,
    handleInlineViewTabAction,
    commitInlineTitle,
    editInlineCell,
    createAndAssignInlineSelectOption,
    reorderInlineSelectOptions,
    createInlineRecord,
    addInlineProperty,
    applyInlineViewChanges,
    pasteInlineCells,
    openInlineDatabaseSurface,
    linkedViewSettingsFromView,
    commitInlineViewChange,
    commitInlineDefaultViewChange,
    handleInlineHistoryKeyDown: createInlineHistoryKeyDown({
      undoToken: inlineUndoToken,
      redoToken: inlineRedoToken,
      undo: undoInlineMutation,
      redo: redoInlineMutation,
    }),
  };
}
