import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { useState } from 'react';
import { useDatabaseMutationHistory } from './database-mutation-history';
import { databaseUiMutationReviewMode } from './database-mutation-policy';
import { executeDatabaseMutation } from './database-mutations/database-mutation-gateway';
import { classifyDatabaseUiProblem, databaseMutationUiMessage } from './database-ui-problem';

export type DatabaseMutationOperation =
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
  const [error, setError] = useState<string | null>(null);
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
    if (status !== 'idle' || undoStatus !== 'idle' || redoStatus !== 'idle') return;
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
          setError(databaseMutationUiMessage('conflict'));
          policy.onFailed?.();
          return;
        }
        clearOptimistic();
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
        setError(databaseMutationUiMessage(problem.kind));
        policy.onFailed?.();
      })
      .finally(() => setStatus('idle'));
  };

  return {
    status,
    error,
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
