import type {
  DatabaseCalculationFunction,
  DatabaseFilter,
  DatabaseProperty,
  DatabaseSource,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { useEffect, useEffectEvent } from 'react';
import {
  createMarkdownTableCellMutation,
  createMarkdownTableLifecycleMutation,
  createMarkdownTableRowCreateMutation,
  createMarkdownTableRowDeleteMutation,
  createMarkdownTableTitleMutation,
  markdownTableDefaultValues,
  markdownTableDocumentMarkdown,
  markdownTableDocumentPath,
} from '@/lib/database-markdown-table-client';
import {
  createDatabaseVerificationPlan,
  executeReviewedDatabasePlan,
} from '@/lib/database-mutation-client';
import {
  createDatabaseCellMutationDesiredState,
  createDatabaseTablePasteDesiredState,
} from '@/lib/database-mutations/database-cell-commands';
import {
  optimisticCellKey,
  setOptimisticCellValue,
} from '@/lib/database-mutations/database-mutation-gateway';
import {
  createDatabaseSelectOptionChangeDesiredState,
  createDatabaseSelectOptionCreateDesiredState,
} from '@/lib/database-mutations/database-property-advanced-commands';
import {
  createDatabaseRecordArchiveDesiredState,
  createDatabaseRecordCopyDesiredState,
  createDatabaseRecordDeletionDesiredState,
  createDatabaseRecordDesiredState,
  createDatabaseRecordMoveDesiredState,
} from '@/lib/database-mutations/database-record-commands';
import { classifyDatabaseUiProblem, databaseConflictProblem } from '@/lib/database-ui-problem';
import type { DatabaseInitialRecordAction } from './DatabaseTableGrid';

import type { DatabaseWorkspaceControllerContext } from './database-workspace-context';

function filterReferencesProperty(filter: DatabaseFilter, propertyId: string): boolean {
  if ('and' in filter) return filter.and.some((item) => filterReferencesProperty(item, propertyId));
  if ('or' in filter) return filter.or.some((item) => filterReferencesProperty(item, propertyId));
  if ('not' in filter) return filterReferencesProperty(filter.not, propertyId);
  return filter.propertyId === propertyId;
}

function canPatchSelectRecordLocally(
  view: DatabaseView | undefined,
  propertyId: string,
  calculations: Readonly<Record<string, DatabaseCalculationFunction>>,
): boolean {
  if (view && view.layout.type !== 'table') return false;
  if (view?.sort.some((item) => item.propertyId === propertyId)) return false;
  if (view?.groups.some((item) => item.propertyId === propertyId)) return false;
  if (view?.where && filterReferencesProperty(view.where, propertyId)) return false;
  if (view?.conditionalColors.some((rule) => filterReferencesProperty(rule.where, propertyId))) {
    return false;
  }
  return calculations[propertyId] === undefined;
}

export function useDatabaseWorkspaceRecordCommands(context: DatabaseWorkspaceControllerContext) {
  const {
    description,
    mutationStatus,
    setOptimisticCellValues,
    runMutation,
    runMarkdownTable,
    setMutationError,
    setMutationStatus,
    reviewResolver: reviewResolverRef,
    setGhost,
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
    open,
    initialRecordAction,
    result,
    handledInitialRecordAction: handledInitialRecordActionRef,
  } = context;

  const editCell = (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    value: DatabaseValue | undefined,
  ) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    if (description.source.storage?.kind === 'markdown_table') {
      if (!record.storageRevision) {
        setMutationError(
          classifyDatabaseUiProblem(
            new Error('The current Markdown owner-table revision is unavailable'),
            'Unable to prepare the cell edit',
          ),
        );
        return;
      }
      if (property.type === 'title' && typeof value !== 'string') {
        setMutationError(
          classifyDatabaseUiProblem(
            new Error('A Markdown document title must be text'),
            'Unable to prepare the cell edit',
          ),
        );
        return;
      }
    }
    try {
      const cellKey = optimisticCellKey(record.id, property.id);
      setOptimisticCellValues((current: ReadonlyMap<string, DatabaseValue | undefined>) =>
        setOptimisticCellValue(current, cellKey, value),
      );
      if (description.source.storage?.kind === 'markdown_table') {
        const mutation =
          property.type === 'title'
            ? createMarkdownTableTitleMutation({
                databaseId: description.database.id,
                sourceId: description.source.id,
                recordId: record.id,
                title: value as string,
                expectedOwnerRevision: record.storageRevision as string,
              })
            : createMarkdownTableCellMutation({
                databaseId: description.database.id,
                sourceId: description.source.id,
                recordId: record.id,
                propertyId: property.id,
                value,
                expectedOwnerRevision: record.storageRevision as string,
              });
        runMarkdownTable(mutation, { optimisticCellKey: cellKey });
        return;
      }
      runMutation(
        createDatabaseCellMutationDesiredState({
          database: description.database,
          source: description.source,
          record,
          property,
          value,
        }),
        'ui-cell',
        'Database cell edit failed',
        {
          policy: { operation: 'cell', actor: 'human', principalId: 'user:local' },
          optimisticCellKey: cellKey,
          ...(property.type === 'select' || property.type === 'multi_select'
            ? {
                presentation: 'silent' as const,
                ...(canPatchSelectRecordLocally(selectedView, property.id, tableCalculations)
                  ? {
                      recordRefresh: {
                        databaseId: description.database.id,
                        sourceId: description.source.id,
                        recordId: record.id,
                      },
                    }
                  : {}),
              }
            : {}),
        },
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the cell edit'));
    }
  };

  const createAndAssignSelectOption = (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'select' | 'multi_select' | 'status' }>,
    name: string,
    selectedOptionIds: readonly string[],
  ): boolean => {
    if (!description?.source || mutationStatus !== 'idle') return false;
    try {
      const { desiredState } = createDatabaseSelectOptionCreateDesiredState({
        database: description.database,
        source: description.source,
        property,
        record,
        name,
        selectedOptionIds,
      });
      runMutation(desiredState, 'ui-option-create', 'Create and assign Select option failed', {
        policy: { operation: 'option-create', actor: 'human', principalId: 'user:local' },
        presentation: 'silent',
      });
      return true;
    } catch (cause) {
      setMutationError(
        classifyDatabaseUiProblem(cause, 'Unable to create and assign the Select option'),
      );
      return false;
    }
  };

  const reorderSelectOptions = (
    property: Extract<DatabaseProperty, { type: 'select' | 'multi_select' | 'status' }>,
    optionIds: readonly string[],
  ): boolean => {
    if (!description?.source || mutationStatus !== 'idle') return false;
    try {
      const { desiredState } = createDatabaseSelectOptionChangeDesiredState({
        database: description.database,
        source: description.source,
        property,
        records: result?.records ?? [],
        recordsComplete: false,
        change: { kind: 'reorder', optionIds },
      });
      runMutation(desiredState, 'ui-option-reorder', 'Reorder Select options failed', {
        policy: { operation: 'option-reorder', actor: 'human', principalId: 'user:local' },
        presentation: 'silent',
      });
      return true;
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to reorder Select options'));
      return false;
    }
  };

  const changeVerification = (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'verification' }>,
    action: 'verify' | 'renew' | 'unverify',
  ) => {
    if (!description?.source || mutationStatus !== 'idle' || !record.revision) return;
    if (action !== 'unverify' && !record.evidenceRevision) {
      setMutationError(
        classifyDatabaseUiProblem(null, 'The current evidence revision is unavailable'),
      );
      return;
    }
    setMutationError(null);
    setMutationStatus('planning');
    const lifecycleBase = {
      databaseId: description.database.id,
      sourceId: description.source.id,
      recordId: record.id,
      propertyId: property.id,
      expectedRevision: record.revision,
    } as const;
    const lifecycle =
      action === 'renew'
        ? {
            ...lifecycleBase,
            action,
            expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            evidenceRevision: record.evidenceRevision as string,
          }
        : action === 'verify'
          ? {
              ...lifecycleBase,
              action,
              evidenceRevision: record.evidenceRevision as string,
            }
          : { ...lifecycleBase, action };
    void createDatabaseVerificationPlan({
      lifecycle,
      actor: { principalId: 'user:local' },
    })
      .then(async ({ plan }) => {
        const outcome = await executeReviewedDatabasePlan({
          plan,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-verification-${crypto.randomUUID()}`,
          assertions: { databaseAbsent: false, createdRecords: 1 },
          review: () =>
            new Promise<boolean>((resolve) => {
              reviewResolverRef.current = resolve;
              setMutationStatus('review');
            }),
          onGhostStateChange: setGhost,
        });
        if (outcome.status === 'blocked') {
          setMutationError(
            databaseConflictProblem(
              outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
                'The Verification change is blocked by the current canonical state',
            ),
          );
        }
        if (outcome.status === 'committed') {
          setLastUndoToken(outcome.result.undoToken);
          setLastRedoToken(null);
          setRefresh((current: number) => current + 1);
        }
      })
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Verification change failed'));
      })
      .finally(() => setMutationStatus('idle'));
  };

  const createRecord = (title = newRecordTitle, options: { focusAfterCreate?: boolean } = {}) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    if (description.source.storage?.kind === 'markdown_table') {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        setMutationError(
          classifyDatabaseUiProblem(
            new Error('Title cannot be empty'),
            `Unable to prepare the new ${itemNoun}`,
          ),
        );
        return;
      }
      if (!result?.storageRevision) {
        setMutationError(
          classifyDatabaseUiProblem(
            new Error('The current Markdown owner-table revision is unavailable'),
            `Unable to prepare the new ${itemNoun}`,
          ),
        );
        return;
      }
      if (newRecordTemplateId !== '__auto__' && newRecordTemplateId !== '__blank__') {
        setMutationError(
          classifyDatabaseUiProblem(
            new Error('Templates are not yet supported by the v2 owner-table row writer'),
            `Unable to prepare the new ${itemNoun}`,
          ),
        );
        return;
      }
      try {
        const documentPath = markdownTableDocumentPath(description.source.folder, normalizedTitle);
        runMarkdownTable(
          createMarkdownTableRowCreateMutation({
            databaseId: description.database.id,
            sourceId: description.source.id,
            documentPath,
            documentMarkdown: markdownTableDocumentMarkdown(normalizedTitle),
            values: markdownTableDefaultValues(description.source),
            expectedOwnerRevision: result.storageRevision,
          }),
          {
            onCommitted: options.focusAfterCreate
              ? () => setNewRecordFocusRequest((current: number | null) => (current ?? 0) + 1)
              : undefined,
          },
        );
        setNewRecordOpen(false);
        setNewRecordTitle('');
      } catch (cause) {
        setMutationError(classifyDatabaseUiProblem(cause, `Unable to prepare the new ${itemNoun}`));
      }
      return;
    }
    try {
      const desiredState = createDatabaseRecordDesiredState({
        database: description.database,
        source: description.source,
        title,
        ...(newRecordTemplateId === '__auto__'
          ? { viewId: selectedView?.id }
          : newRecordTemplateId === '__blank__'
            ? { body: '', skipTemplate: true }
            : { templateId: newRecordTemplateId }),
      });
      setNewRecordOpen(false);
      setNewRecordTitle('');
      runMutation(desiredState, 'ui-record-create', `Database ${itemNoun} creation failed`, {
        policy: { operation: 'record-create', actor: 'human', principalId: 'user:local' },
        onCommitted: options.focusAfterCreate
          ? () => setNewRecordFocusRequest((current: number | null) => (current ?? 0) + 1)
          : undefined,
      });
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, `Unable to prepare the new ${itemNoun}`));
    }
  };

  const deleteRecord = (record: ProjectedDatabaseRecord) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    if (description.source.storage?.kind === 'markdown_table' && !record.storageRevision) {
      setMutationError(
        classifyDatabaseUiProblem(
          new Error('The current Markdown owner-table revision is unavailable'),
          `Unable to prepare the ${itemNoun} deletion`,
        ),
      );
      return;
    }
    try {
      if (description.source.storage?.kind === 'markdown_table') {
        runMarkdownTable(
          createMarkdownTableRowDeleteMutation({
            databaseId: description.database.id,
            sourceId: description.source.id,
            recordId: record.id,
            expectedOwnerRevision: record.storageRevision as string,
          }),
        );
        return;
      }
      runMutation(
        createDatabaseRecordDeletionDesiredState({
          database: description.database,
          source: description.source,
          record,
        }),
        'ui-record-delete',
        `Database ${itemNoun} deletion failed`,
      );
    } catch (cause) {
      setMutationError(
        classifyDatabaseUiProblem(cause, `Unable to prepare the ${itemNoun} deletion`),
      );
    }
  };

  const duplicateRecord = (record: ProjectedDatabaseRecord) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseRecordCopyDesiredState({
          database: description.database,
          source: description.source,
          record,
        }),
        'ui-record-copy',
        `Database ${itemNoun} duplication failed`,
      );
    } catch (cause) {
      setMutationError(
        classifyDatabaseUiProblem(cause, `Unable to prepare the ${itemNoun} duplicate`),
      );
    }
  };

  const changeArchiveState = (record: ProjectedDatabaseRecord, action: 'archive' | 'restore') => {
    if (!description?.source || mutationStatus !== 'idle') return;
    if (description.source.storage?.kind === 'markdown_table' && !record.storageRevision) {
      setMutationError(
        classifyDatabaseUiProblem(
          new Error('The current Markdown owner-table revision is unavailable'),
          `Unable to prepare the ${itemNoun} ${action}`,
        ),
      );
      return;
    }
    try {
      if (description.source.storage?.kind === 'markdown_table') {
        runMarkdownTable(
          createMarkdownTableLifecycleMutation({
            databaseId: description.database.id,
            sourceId: description.source.id,
            recordId: record.id,
            archived: action === 'archive',
            expectedOwnerRevision: record.storageRevision as string,
          }),
        );
        return;
      }
      runMutation(
        createDatabaseRecordArchiveDesiredState({
          database: description.database,
          source: description.source,
          record,
          action,
        }),
        `ui-record-${action}`,
        `Database ${itemNoun} ${action} failed`,
      );
    } catch (cause) {
      setMutationError(
        classifyDatabaseUiProblem(cause, `Unable to prepare the ${itemNoun} ${action}`),
      );
    }
  };

  const planMove = () => {
    if (!description?.source || !moveRecord || mutationStatus !== 'idle') return;
    const targetSource = description.database.sources.find(
      (source: DatabaseSource) => source.id === moveTargetSourceId,
    );
    if (!targetSource) {
      setMutationError(classifyDatabaseUiProblem(null, 'Choose a valid target source'));
      return;
    }
    try {
      runMutation(
        createDatabaseRecordMoveDesiredState({
          database: description.database,
          source: description.source,
          targetSource,
          record: moveRecord,
        }),
        'ui-record-move',
        `Database ${itemNoun} move failed`,
      );
      setMoveRecord(null);
      setMoveTargetSourceId('');
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, `Unable to prepare the ${itemNoun} move`));
    }
  };

  const applyInitialRecordAction = useEffectEvent(
    (action: DatabaseInitialRecordAction, record?: ProjectedDatabaseRecord) => {
      if (action.kind === 'create') {
        setNewRecordOpen(true);
        return;
      }
      if (!record) return;
      switch (action.kind) {
        case 'duplicate':
          duplicateRecord(record);
          break;
        case 'move':
          setMoveRecord(record);
          setMoveTargetSourceId('');
          break;
        case 'archive':
        case 'restore':
          changeArchiveState(record, action.kind);
          break;
        case 'delete':
          deleteRecord(record);
          break;
        case 'transition': {
          if (!description?.source) return;
          const changes = action.changes.map((change) => {
            const property = description.source?.properties.find(
              (candidate: DatabaseProperty) => candidate.id === change.propertyId,
            );
            if (!property)
              throw new Error(`Board transition property ${change.propertyId} is missing`);
            return { record, property, value: change.value };
          });
          runMutation(
            createDatabaseTablePasteDesiredState({
              database: description.database,
              source: description.source,
              changes,
            }),
            'ui-board-transition',
            'Board transition failed',
          );
          break;
        }
      }
    },
  );

  // Initial record actions are consumed by an action key so refresh and
  // StrictMode cannot duplicate a canonical mutation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref-backed one-shot action guard
  useEffect(() => {
    if (!open || !initialRecordAction || !description?.source || !result) return;
    const actionKey =
      initialRecordAction.kind === 'create'
        ? 'create'
        : `${initialRecordAction.kind}:${initialRecordAction.recordId}:${
            initialRecordAction.kind === 'transition'
              ? JSON.stringify(initialRecordAction.changes)
              : ''
          }`;
    if (handledInitialRecordActionRef.current === actionKey) return;
    if (initialRecordAction.kind === 'create') {
      handledInitialRecordActionRef.current = actionKey;
      applyInitialRecordAction(initialRecordAction);
      return;
    }
    const record = result.records.find(
      (candidate: ProjectedDatabaseRecord) => candidate.id === initialRecordAction.recordId,
    );
    if (!record) return;
    handledInitialRecordActionRef.current = actionKey;
    applyInitialRecordAction(initialRecordAction, record);
  }, [open, initialRecordAction, description, result]);

  return {
    editCell,
    createAndAssignSelectOption,
    reorderSelectOptions,
    changeVerification,
    createRecord,
    deleteRecord,
    duplicateRecord,
    changeArchiveState,
    planMove,
    applyInitialRecordAction,
  };
}
