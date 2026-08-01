import type {
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseQueryResult,
  DatabaseSelectOptionChange,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { previewDatabaseSelectOptionChange } from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import {
  createDatabaseAddPropertyDesiredState,
  createDatabaseDuplicatePropertyDesiredState,
  createDatabaseRemovePropertyDesiredState,
  createDatabaseRenamePropertyDesiredState,
  createDatabaseReorderPropertiesDesiredState,
  createDatabaseSelectOptionChangeDesiredState,
  createDatabaseTablePasteDesiredState,
  createDatabaseUnsetPropertyValuesDesiredState,
} from '@/lib/database-cell-mutation';
import { createDatabasePropertyDefinitionForAdd } from '@/lib/database-mutations/database-property-catalog';
import {
  databaseDelimitedRecordIds,
  inspectDatabaseImport,
  planDatabaseDelimitedImport,
} from '@/lib/database-csv';
import {
  applyDatabaseUiRedo,
  applyDatabaseUiUndo,
  previewDatabaseUiRedo,
  previewDatabaseUiUndo,
} from '@/lib/database-mutation-client';
import type { DatabaseUiMutationPolicyInput } from '@/lib/database-mutation-policy';
import {
  createDatabasePropertyDeletionPreview,
  type DatabasePropertyDeletionPreview,
} from '@/lib/database-property-deletion';
import { fetchDatabaseRecord } from '@/lib/database-query-client';
import { classifyDatabaseUiProblem } from '@/lib/database-ui-problem';
import type { DatabaseSelectProperty } from './DatabaseTableGrid';

import { databaseSchemaMutationPolicy, isDatabaseSelectProperty } from './DatabaseTableGrid';

import type { DatabaseDescription } from '@/lib/database-catalog-client';
import type { useDatabaseWorkspaceControllerState } from './use-database-workspace-controller-state';
import type { useDatabaseWorkspaceBulkCommands } from './useDatabaseWorkspaceBulkCommands';
import type { useDatabaseWorkspaceMutationCommands } from './useDatabaseWorkspaceMutationCommands';

type DatabaseWorkspaceControllerState = ReturnType<typeof useDatabaseWorkspaceControllerState>;
type DatabaseWorkspaceBulkCommands = ReturnType<typeof useDatabaseWorkspaceBulkCommands>;
type DatabaseWorkspaceMutationCommands = ReturnType<typeof useDatabaseWorkspaceMutationCommands>;

export interface DatabaseWorkspaceSchemaCommandsContext
  extends Pick<
    DatabaseWorkspaceControllerState,
    | 'setOptionPreview'
    | 'setOptionStatus'
    | 'setMutationError'
    | 'optionPreview'
    | 'setPropertyDeletionPreview'
    | 'setPropertiesError'
    | 'setPropertiesRemoveStatus'
    | 'propertiesRemoveStatus'
    | 'mutationStatus'
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
    | 'setPropertiesDialogOpen'
    | 'setPropertiesDialogRenameId'
    | 'undoStatus'
    | 'setUndoStatus'
    | 'setSelectedRecordIds'
    | 'setRefresh'
    | 'setOptimisticViewOrder'
    | 'redoStatus'
    | 'setRedoStatus'
  > {
  description: DatabaseDescription | null;
  result: DatabaseQueryResult | null;
  runMutation: DatabaseWorkspaceMutationCommands['runMutation'];
  collectDatabaseSnapshot: DatabaseWorkspaceBulkCommands['collectDatabaseSnapshot'];
  selectedView: DatabaseView | undefined;
}

export function useDatabaseWorkspaceSchemaCommands(
  context: DatabaseWorkspaceSchemaCommandsContext & Record<string, unknown>,
) {
  const {
    setOptionPreview,
    setOptionStatus,
    description,
    setMutationError,
    optionPreview,
    runMutation,
    setPropertyDeletionPreview,
    setPropertiesError,
    setPropertiesRemoveStatus,
    propertiesRemoveStatus,
    mutationStatus,
    result,
    csvStatus,
    setCsvStatus,
    importPreview,
    setImportPreview,
    setLastUndoToken,
    setLastRedoToken,
    lastUndoToken,
    lastRedoToken,
    selection,
    optionStatus,
    optionPropertyId,
    collectDatabaseSnapshot,
    selectedView,
    setPropertiesDialogOpen,
    setPropertiesDialogRenameId,
    undoStatus,
    setUndoStatus,
    setSelectedRecordIds,
    setRefresh,
    setOptimisticViewOrder,
    redoStatus,
    setRedoStatus,
  } = context;

  const prepareSelectOptionChange = (change: DatabaseSelectOptionChange) => {
    if (!description?.source || !result || optionStatus !== 'idle' || mutationStatus !== 'idle') {
      return;
    }
    const selectedDatabase = description.database;
    const selectedSource = description.source;
    const property = selectedSource.properties.find(
      (candidate: DatabaseProperty): candidate is DatabaseSelectProperty =>
        candidate.id === optionPropertyId && isDatabaseSelectProperty(candidate),
    );
    if (!property) return;
    const requiresComplete = change.kind === 'merge' || change.kind === 'delete';
    setOptionStatus('loading');
    setOptionPreview(null);
    setMutationError(null);
    void (async () => {
      const snapshot = requiresComplete ? await collectDatabaseSnapshot('all') : result;
      const preview = previewDatabaseSelectOptionChange({
        definition: selectedDatabase,
        sourceId: selectedSource.id,
        propertyId: property.id,
        records: snapshot.records,
        change,
      });
      let desiredState: DatabaseDesiredStateDraftInput | null = null;
      if (preview.canApply) {
        try {
          desiredState = createDatabaseSelectOptionChangeDesiredState({
            database: selectedDatabase,
            source: selectedSource,
            property,
            records: snapshot.records,
            recordsComplete:
              requiresComplete || (snapshot.isComplete && snapshot.nextCursor === null),
            change,
          }).desiredState;
        } catch (cause) {
          setMutationError(
            classifyDatabaseUiProblem(cause, 'Unable to compile the Select option change'),
          );
        }
      }
      setOptionPreview({ change, preview, desiredState });
    })()
      .catch((cause: unknown) => {
        setMutationError(
          classifyDatabaseUiProblem(cause, 'Unable to preview the Select option change'),
        );
      })
      .finally(() => setOptionStatus('idle'));
  };

  const planSelectOptionChange = () => {
    if (!optionPreview?.desiredState || mutationStatus !== 'idle') return;
    runMutation(
      optionPreview.desiredState,
      'ui-select-option',
      'Database Select option change failed',
    );
    setOptionPreview(null);
  };

  const addSchemaProperty = (
    input: {
      name: string;
      type: DatabasePropertyType;
      insertBeforePropertyId?: string;
      insertAfterPropertyId?: string;
      relationTarget?: { databaseId: string; sourceId: string };
    },
    policy: DatabaseUiMutationPolicyInput = databaseSchemaMutationPolicy,
  ) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    const selectedSource = description.source;
    const selectedDatabase = description.database;
    setPropertiesError(null);
    try {
      const property = createDatabasePropertyDefinitionForAdd({
        name: input.name,
        type: input.type,
        existingKeys: selectedSource.properties.map((candidate: DatabaseProperty) => candidate.key),
        database: selectedDatabase,
        source: selectedSource,
        ...(input.relationTarget ? { relationTarget: input.relationTarget } : {}),
      });
      const desiredState = createDatabaseAddPropertyDesiredState({
        database: selectedDatabase,
        source: selectedSource,
        ...(selectedView?.id ? { viewId: selectedView.id } : {}),
        ...(input.insertBeforePropertyId
          ? { insertBeforePropertyId: input.insertBeforePropertyId }
          : {}),
        ...(input.insertAfterPropertyId
          ? { insertAfterPropertyId: input.insertAfterPropertyId }
          : {}),
        property,
      });
      setPropertiesDialogOpen(false);
      runMutation(desiredState, 'ui-add-property', 'Add database property failed', { policy });
    } catch (cause) {
      setPropertiesError(classifyDatabaseUiProblem(cause, 'Unable to add the property').message);
    }
  };

  const duplicateSchemaProperty = (property: DatabaseProperty) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseDuplicatePropertyDesiredState({
          database: description.database,
          source: description.source,
          property,
          ...(selectedView?.id ? { viewId: selectedView.id } : {}),
        }),
        'ui-duplicate-property',
        'Duplicate database property failed',
        { policy: databaseSchemaMutationPolicy },
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to duplicate the property'));
    }
  };

  const renameSchemaProperty = (property: DatabaseProperty, name: string) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseRenamePropertyDesiredState({
          database: description.database,
          source: description.source,
          property,
          name,
        }),
        'ui-rename-property',
        'Rename database property failed',
        { policy: databaseSchemaMutationPolicy },
      );
      setPropertiesDialogOpen(false);
      setPropertiesDialogRenameId(null);
    } catch (cause) {
      setPropertiesError(classifyDatabaseUiProblem(cause, 'Unable to rename the property').message);
    }
  };

  const removeSchemaProperty = (property: DatabaseProperty) => {
    if (!description?.source || mutationStatus !== 'idle' || propertiesRemoveStatus !== 'idle') {
      return;
    }
    const selectedSource = description.source;
    const selectedDatabase = description.database;
    setPropertiesError(null);
    setPropertiesRemoveStatus('loading');
    void collectDatabaseSnapshot('all')
      .then((snapshot: DatabaseQueryResult) => {
        const preview = createDatabasePropertyDeletionPreview({
          database: selectedDatabase,
          source: selectedSource,
          property,
          records: snapshot.records,
          recordsComplete: snapshot.isComplete && snapshot.nextCursor === null,
        });
        setPropertiesDialogOpen(false);
        setPropertyDeletionPreview(preview);
      })
      .catch((cause: unknown) => {
        setPropertiesError(
          classifyDatabaseUiProblem(cause, 'Unable to remove the property').message,
        );
      })
      .finally(() => setPropertiesRemoveStatus('idle'));
  };

  const commitPropertyDeletionPreview = (preview: DatabasePropertyDeletionPreview) => {
    if (!description?.source || mutationStatus !== 'idle' || propertiesRemoveStatus !== 'idle') {
      return;
    }
    const selectedSource = description.source;
    const selectedDatabase = description.database;
    try {
      const unsetDesiredState = createDatabaseUnsetPropertyValuesDesiredState({
        database: selectedDatabase,
        source: selectedSource,
        property: preview.property,
        records: preview.records,
        recordsComplete: true,
      });
      setPropertyDeletionPreview(null);
      // Removing a property is two reviewed commits, never one: values must
      // be unset (a record-mutation patch, which preserves record body) while
      // the property still exists in the schema, before the schema drops it.
      // The server can wedge when those commits race, so the second phase is
      // intentionally left as an explicit follow-up from the Properties dialog.
      if (unsetDesiredState) {
        runMutation(
          unsetDesiredState,
          'ui-unset-property',
          'Unset database property value failed',
          {
            policy: databaseSchemaMutationPolicy,
            onCommitted: () => {
              setPropertiesDialogOpen(true);
              setPropertiesError(
                'Values cleared. Review the property deletion again to remove it from the schema.',
              );
            },
          },
        );
      } else {
        const desiredState = createDatabaseRemovePropertyDesiredState({
          database: selectedDatabase,
          source: selectedSource,
          property: preview.property,
        });
        runMutation(desiredState, 'ui-remove-property', 'Remove database property failed', {
          policy: databaseSchemaMutationPolicy,
        });
      }
    } catch (cause) {
      setPropertyDeletionPreview(null);
      setPropertiesDialogOpen(true);
      setPropertiesError(classifyDatabaseUiProblem(cause, 'Unable to remove the property').message);
    }
  };

  const reorderSchemaProperties = (orderedPropertyIds: string[]) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    const selectedSource = description.source;
    const selectedDatabase = description.database;
    setPropertiesError(null);
    try {
      const desiredState = createDatabaseReorderPropertiesDesiredState({
        database: selectedDatabase,
        source: selectedSource,
        orderedPropertyIds,
      });
      setPropertiesDialogOpen(false);
      runMutation(desiredState, 'ui-reorder-properties', 'Reorder database properties failed', {
        policy: databaseSchemaMutationPolicy,
      });
    } catch (cause) {
      setPropertiesError(
        classifyDatabaseUiProblem(cause, 'Unable to reorder the properties').message,
      );
    }
  };

  const inspectImportFile = (file: File) => {
    if (!description?.source || csvStatus !== 'idle' || mutationStatus !== 'idle') return;
    const selectedSource = description.source;
    setCsvStatus('importing');
    setMutationError(null);
    void file
      .arrayBuffer()
      .then((buffer) =>
        inspectDatabaseImport({
          source: selectedSource,
          people: description.database.people,
          bytes: new Uint8Array(buffer),
          filename: file.name,
        }),
      )
      .then((inspection) => setImportPreview({ filename: file.name, inspection }))
      .catch((cause: unknown) => {
        setImportPreview(null);
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to inspect database import'));
      })
      .finally(() => setCsvStatus('idle'));
  };

  const commitImportPreview = () => {
    if (!selection || !description?.source || csvStatus !== 'idle' || mutationStatus !== 'idle') {
      return;
    }
    if (!importPreview || importPreview.inspection.issues.length > 0) return;
    const selectedSource = description.source;
    const selectedDatabase = description.database;
    const selectedAddress = selection;
    const inspection = importPreview.inspection;
    setCsvStatus('importing');
    setMutationError(null);
    void (async () => {
      const recordIds = databaseDelimitedRecordIds(
        selectedSource,
        inspection.contents,
        inspection.delimiter,
      );
      if (recordIds.length === 0) throw new Error('Import file has no record rows');
      const records = await Promise.all(
        recordIds.map((recordId) =>
          fetchDatabaseRecord({ ...selectedAddress, recordId }).then((lookup) => lookup.record),
        ),
      );
      const changes = planDatabaseDelimitedImport({
        source: selectedSource,
        people: selectedDatabase.people,
        contents: inspection.contents,
        delimiter: inspection.delimiter,
        records,
      });
      if (changes.length === 0) throw new Error('Import file has no property changes');
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: selectedDatabase,
          source: selectedSource,
          changes,
        }),
        'ui-delimited-import',
        'Database CSV/TSV import failed',
      );
      setImportPreview(null);
    })()
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to import database CSV/TSV'));
      })
      .finally(() => setCsvStatus('idle'));
  };

  const undoLastChange = () => {
    if (!lastUndoToken || undoStatus !== 'idle' || mutationStatus !== 'idle') return;
    const token = lastUndoToken;
    setMutationError(null);
    setUndoStatus('checking');
    void previewDatabaseUiUndo(token)
      .then((preview) => {
        if (!preview.canApply) {
          const reason = preview.conflicts[0]?.reason ?? 'the canonical state changed';
          throw new Error(`Undo is no longer safe: ${reason}`);
        }
        setUndoStatus('applying');
        return applyDatabaseUiUndo({
          undoToken: token,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-undo-${crypto.randomUUID()}`,
        });
      })
      .then((outcome) => {
        if (!outcome.canApply || outcome.receipt?.status !== 'applied') {
          throw new Error('The database undo was refused');
        }
        setLastUndoToken(null);
        setLastRedoToken(token);
        setOptimisticViewOrder(null);
        setSelectedRecordIds(new Set());
        setRefresh((current: number) => current + 1);
      })
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Database undo failed'));
      })
      .finally(() => setUndoStatus('idle'));
  };

  const redoLastChange = () => {
    if (!lastRedoToken || redoStatus !== 'idle' || mutationStatus !== 'idle') return;
    const token = lastRedoToken;
    setMutationError(null);
    setRedoStatus('checking');
    void previewDatabaseUiRedo(token)
      .then((preview) => {
        if (!preview.canApply) {
          const reason = preview.conflicts[0]?.reason ?? 'the canonical state changed';
          throw new Error(`Redo is no longer safe: ${reason}`);
        }
        setRedoStatus('applying');
        return applyDatabaseUiRedo({
          undoToken: token,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-redo-${crypto.randomUUID()}`,
        });
      })
      .then((outcome) => {
        if (!outcome.canApply || outcome.receipt?.status !== 'applied') {
          throw new Error('The database redo was refused');
        }
        setLastRedoToken(null);
        setLastUndoToken(token);
        setOptimisticViewOrder(null);
        setSelectedRecordIds(new Set());
        setRefresh((current: number) => current + 1);
      })
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Database redo failed'));
      })
      .finally(() => setRedoStatus('idle'));
  };

  return {
    prepareSelectOptionChange,
    planSelectOptionChange,
    addSchemaProperty,
    duplicateSchemaProperty,
    renameSchemaProperty,
    removeSchemaProperty,
    commitPropertyDeletionPreview,
    reorderSchemaProperties,
    inspectImportFile,
    commitImportPreview,
    undoLastChange,
    redoLastChange,
  };
}
