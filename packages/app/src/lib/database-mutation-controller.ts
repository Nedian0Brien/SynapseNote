import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { useRef, useState } from 'react';
import { useDatabaseMutationHistory } from './database-mutation-history';
import { databaseUiMutationReviewMode } from './database-mutation-policy';
import { executeDatabaseMutation } from './database-mutations/database-mutation-gateway';
import { classifyDatabaseUiProblem, databaseMutationUiMessage } from './database-ui-problem';

type DatabaseMutationOperation =
  | 'cell'
  | 'title'
  | 'record-create'
  | 'property-create'
  | 'option-create'
  | 'option-reorder'
  | 'view';

export interface DatabaseMutationPolicy {
  operation: DatabaseMutationOperation;
  optimisticCellKey?: string;
  optimisticCellKeys?: readonly string[];
  onCommitted?: () => void;
  onFailed?: () => void;
}

export interface DatabaseMutationControllerOptions {
  onRefresh: () => void;
  onSaveFeedback: (kind: 'saved' | 'undone' | 'redone') => void;
  clearOptimisticValues: (keys: readonly string[]) => void;
}

export function useDatabaseMutationController({
  onRefresh,
  onSaveFeedback,
  clearOptimisticValues,
}: DatabaseMutationControllerOptions) {
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');
  const [error, setErrorState] = useState<string | null>(null);
  const [errorKind, setErrorKind] =
    useState<ReturnType<typeof classifyDatabaseUiProblem>['kind']>();
  const activeMutationRef = useRef(false);
  const setError = (value: string | null) => {
    setErrorState(value);
    if (value === null) setErrorKind(undefined);
  };
  const {
    undoToken,
    undoStatus,
    redoToken,
    redoStatus,
    resetForForwardMutation,
    installForwardToken,
    undo,
    redo,
  } = useDatabaseMutationHistory({
    onRefresh,
    onSaveFeedback: (kind) => onSaveFeedback(kind),
    onError: setError,
  });

  const run = (desiredState: DatabaseDesiredStateDraftInput, policy: DatabaseMutationPolicy) => {
    if (
      activeMutationRef.current ||
      status !== 'idle' ||
      undoStatus !== 'idle' ||
      redoStatus !== 'idle'
    )
      return;
    activeMutationRef.current = true;
    setError(null);
    resetForForwardMutation();
    setStatus('saving');
    const optimisticKeys = [
      ...(policy.optimisticCellKey ? [policy.optimisticCellKey] : []),
      ...(policy.optimisticCellKeys ?? []),
    ];
    const clearOptimistic = () => clearOptimisticValues(optimisticKeys);
    void executeDatabaseMutation({
      desiredState,
      actor: { principalId: 'user:local' },
      idempotencyKey: `ui-inline-${policy.operation}-${crypto.randomUUID()}`,
      review: () =>
        databaseUiMutationReviewMode({
          operation: policy.operation,
          actor: 'human',
          principalId: 'user:local',
        }) === 'automatic',
    })
      .then((outcome) => {
        if (outcome.status !== 'committed') {
          clearOptimistic();
          setErrorKind('conflict');
          setError(databaseMutationUiMessage('conflict'));
          onRefresh();
          policy.onFailed?.();
          return;
        }
        // The history model is the single owner of exact server tokens. A
        // forward mutation installs the returned undo token and invalidates
        // redo as part of the same state transition.
        installForwardToken(outcome.result.undoToken);
        onSaveFeedback('saved');
        onRefresh();
        policy.onCommitted?.();
      })
      .catch((cause: unknown) => {
        clearOptimistic();
        const problem = classifyDatabaseUiProblem(cause, 'Unable to save the database change.');
        setErrorKind(problem.kind);
        setError(databaseMutationUiMessage(problem.kind));
        if (problem.kind === 'conflict') onRefresh();
        policy.onFailed?.();
      })
      .finally(() => {
        activeMutationRef.current = false;
        setStatus('idle');
      });
  };

  return {
    status,
    error,
    errorKind,
    setError,
    undoToken,
    undoStatus,
    redoToken,
    redoStatus,
    run,
    undo,
    redo,
  };
}
