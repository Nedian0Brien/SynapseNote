import { useEffect } from 'react';
import { useDatabaseMutationController } from '@/lib/database-mutation-controller';
import type { InlineDatabaseReference, InlineDatabaseReferenceData } from './inline-database-types';
import { useInlineDatabaseCommands } from './use-inline-database-commands';
import { useInlineDatabaseControllerState } from './use-inline-database-controller-state';
import { useInlineDatabaseReadState } from './use-inline-database-read-state';

export type { InlineDatabaseReference } from './inline-database-types';

export interface UseInlineDatabaseControllerOptions {
  reference: InlineDatabaseReference;
  databaseId?: string;
  sourceId?: string;
  viewId?: string;
  mode?: 'inline' | 'full-page';
}

export function useInlineDatabaseController({
  reference,
  databaseId,
  sourceId,
  viewId,
  mode,
}: UseInlineDatabaseControllerOptions) {
  'use no memo';
  const referenceData: InlineDatabaseReferenceData = reference.success
    ? reference.data
    : { databaseId: '', sourceId: '', viewId: '', mode: 'inline' };
  const controllerState = useInlineDatabaseControllerState({ reference, referenceData });
  const {
    scheduleRefresh,
    setInlineOptimisticCellValues,
    inlineSaveFeedbackTimerRef,
    inlineOptimisticCellValues,
  } = controllerState;

  const showInlineSaveFeedback = (
    kind: Exclude<typeof controllerState.inlineSaveFeedback, null>,
  ) => {
    if (inlineSaveFeedbackTimerRef.current !== null) {
      globalThis.clearTimeout(inlineSaveFeedbackTimerRef.current);
    }
    controllerState.setInlineSaveFeedback(kind);
    inlineSaveFeedbackTimerRef.current = globalThis.setTimeout(() => {
      inlineSaveFeedbackTimerRef.current = null;
      controllerState.setInlineSaveFeedback(null);
    }, 3_000);
  };

  const clearInlineOptimisticValues = (keys: readonly string[]) => {
    if (keys.length === 0) return;
    setInlineOptimisticCellValues((current) => {
      const next = new Map(current);
      let changed = false;
      for (const key of keys) changed = next.delete(key) || changed;
      return changed ? next : current;
    });
  };

  const mutation = useDatabaseMutationController({
    onRefresh: scheduleRefresh,
    onSaveFeedback: showInlineSaveFeedback,
    clearOptimisticValues: clearInlineOptimisticValues,
  });
  const read = useInlineDatabaseReadState({
    reference,
    referenceData,
    databaseId,
    sourceId,
    viewId,
    mode,
    controller: controllerState,
  });
  const commands = useInlineDatabaseCommands({
    referenceData,
    controller: controllerState,
    read,
    runInlineMutation: mutation.run,
    setInlineMutationError: mutation.setError,
    inlineUndoToken: mutation.undoToken,
    inlineRedoToken: mutation.redoToken,
    undoInlineMutation: mutation.undo,
    redoInlineMutation: mutation.redo,
  });

  useEffect(
    () => () => {
      if (inlineSaveFeedbackTimerRef.current !== null) {
        globalThis.clearTimeout(inlineSaveFeedbackTimerRef.current);
      }
    },
    [inlineSaveFeedbackTimerRef],
  );

  return {
    ...controllerState,
    ...read,
    ...mutation,
    ...commands,
    inlineMutationStatus: mutation.status,
    inlineMutationError: mutation.error,
    inlineUndoToken: mutation.undoToken,
    inlineUndoStatus: mutation.undoStatus,
    inlineRedoToken: mutation.redoToken,
    inlineRedoStatus: mutation.redoStatus,
    undoInlineMutation: mutation.undo,
    redoInlineMutation: mutation.redo,
    inlineOptimisticCellValues,
  };
}
