import { useState } from 'react';
import {
  applyDatabaseUiRedo,
  applyDatabaseUiUndo,
  previewDatabaseUiRedo,
  previewDatabaseUiUndo,
} from './database-mutation-client';
import { classifyDatabaseUiProblem, databaseMutationUiMessage } from './database-ui-problem';

export interface DatabaseMutationHistoryOptions {
  onRefresh: () => void;
  onSaveFeedback: (kind: 'undone' | 'redone') => void;
  onError: (message: string) => void;
}

/**
 * Server-backed undo/redo state for database mutations.
 *
 * History is deliberately independent from save-feedback presentation. A
 * status toast can expire without dropping an exact server token, and a
 * forward mutation can invalidate redo without coupling that rule to table or
 * overlay rendering.
 */
export function useDatabaseMutationHistory({
  onRefresh,
  onSaveFeedback,
  onError,
}: DatabaseMutationHistoryOptions) {
  const [undoToken, setUndoToken] = useState<string | null>(null);
  const [undoStatus, setUndoStatus] = useState<'idle' | 'checking' | 'applying'>('idle');
  const [redoToken, setRedoToken] = useState<string | null>(null);
  const [redoStatus, setRedoStatus] = useState<'idle' | 'checking' | 'applying'>('idle');

  const resetForForwardMutation = () => {
    setUndoToken(null);
    setRedoToken(null);
  };

  const installForwardToken = (token: string | null | undefined) => {
    setUndoToken(token ?? null);
    setRedoToken(null);
  };

  const undo = () => {
    if (!undoToken || undoStatus !== 'idle' || redoStatus !== 'idle') return;
    const token = undoToken;
    setUndoStatus('checking');
    void previewDatabaseUiUndo(token)
      .then((preview) => {
        if (!preview.canApply) {
          throw new Error(
            'The database changed while this action was in progress. Reload the latest state and try again.',
          );
        }
        setUndoStatus('applying');
        return applyDatabaseUiUndo({
          undoToken: token,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-inline-undo-${crypto.randomUUID()}`,
        });
      })
      .then((outcome) => {
        if (!outcome.canApply || outcome.receipt?.status !== 'applied') {
          throw new Error(
            'The database undo could not be applied. Reload the latest state and try again.',
          );
        }
        setUndoToken(null);
        setRedoToken(token);
        onSaveFeedback('undone');
        onRefresh();
      })
      .catch((cause: unknown) => {
        const isStaleHistory =
          cause instanceof Error && cause.message.includes('changed while this action');
        const problem = classifyDatabaseUiProblem(cause, 'The database undo could not be applied.');
        // Keep the token after a recoverable failure so the user can retry the
        // exact operation without silently losing history.
        if (isStaleHistory) {
          onError(databaseMutationUiMessage('conflict'));
        } else {
          onError(databaseMutationUiMessage(problem.kind));
        }
      })
      .finally(() => setUndoStatus('idle'));
  };

  const redo = () => {
    if (!redoToken || redoStatus !== 'idle' || undoStatus !== 'idle') return;
    const token = redoToken;
    setRedoStatus('checking');
    void previewDatabaseUiRedo(token)
      .then((preview) => {
        if (!preview.canApply) {
          throw new Error(
            'The database changed while this action was in progress. Reload the latest state and try again.',
          );
        }
        setRedoStatus('applying');
        return applyDatabaseUiRedo({
          undoToken: token,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-inline-redo-${crypto.randomUUID()}`,
        });
      })
      .then((outcome) => {
        if (!outcome.canApply || outcome.receipt?.status !== 'applied') {
          throw new Error(
            'The database redo could not be applied. Reload the latest state and try again.',
          );
        }
        setRedoToken(null);
        setUndoToken(token);
        onSaveFeedback('redone');
        onRefresh();
      })
      .catch((cause: unknown) => {
        const isStaleHistory =
          cause instanceof Error && cause.message.includes('changed while this action');
        const problem = classifyDatabaseUiProblem(cause, 'The database redo could not be applied.');
        onError(databaseMutationUiMessage(isStaleHistory ? 'conflict' : problem.kind));
      })
      .finally(() => setRedoStatus('idle'));
  };

  return {
    undoToken,
    undoStatus,
    redoToken,
    redoStatus,
    resetForForwardMutation,
    installForwardToken,
    undo,
    redo,
  };
}
