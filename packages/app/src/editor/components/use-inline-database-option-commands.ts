import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import type { DatabaseMutationPolicy } from '@/lib/database-mutation-controller';
import {
  createDatabaseSelectOptionChangeDesiredState,
  createDatabaseSelectOptionCreateDesiredState,
} from '@/lib/database-mutations/database-property-advanced-commands';

type RunInlineMutation = (
  desiredState: DatabaseDesiredStateDraftInput,
  policy: DatabaseMutationPolicy,
) => void;

export interface InlineDatabaseOptionCommandsInput {
  isReady: boolean;
  linkedSource: DatabaseSource | null | undefined;
  linkedDatabase: DatabaseDefinition | null | undefined;
  records: readonly ProjectedDatabaseRecord[];
  runInlineMutation: RunInlineMutation;
  setInlineMutationErrorFromCause: (cause: unknown, fallback: string) => void;
}

export function createInlineDatabaseOptionCommands({
  isReady,
  linkedSource,
  linkedDatabase,
  records,
  runInlineMutation,
  setInlineMutationErrorFromCause,
}: InlineDatabaseOptionCommandsInput) {
  const createAndAssignInlineSelectOption = (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'select' | 'multi_select' | 'status' }>,
    name: string,
    selectedOptionIds: readonly string[],
  ): boolean => {
    if (!isReady || !linkedSource || !linkedDatabase) return false;
    try {
      const { desiredState } = createDatabaseSelectOptionCreateDesiredState({
        database: linkedDatabase,
        source: linkedSource,
        property,
        record,
        name,
        selectedOptionIds,
      });
      runInlineMutation(desiredState, { operation: 'option-create' });
      return true;
    } catch (cause) {
      setInlineMutationErrorFromCause(cause, 'Unable to create and assign the Select option');
      return false;
    }
  };

  const reorderInlineSelectOptions = (
    property: Extract<DatabaseProperty, { type: 'select' | 'multi_select' | 'status' }>,
    optionIds: readonly string[],
  ): boolean => {
    if (!isReady || !linkedSource || !linkedDatabase) return false;
    try {
      const { desiredState } = createDatabaseSelectOptionChangeDesiredState({
        database: linkedDatabase,
        source: linkedSource,
        property,
        records,
        recordsComplete: false,
        change: { kind: 'reorder', optionIds },
      });
      runInlineMutation(desiredState, { operation: 'option-reorder' });
      return true;
    } catch (cause) {
      setInlineMutationErrorFromCause(cause, 'Unable to reorder Select options');
      return false;
    }
  };

  return { createAndAssignInlineSelectOption, reorderInlineSelectOptions };
}
