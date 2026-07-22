/** Cross-surface notification for Agent Run recovery mutations. */

export const DATABASE_AGENT_RUN_CHANGED_EVENT = 'synapsenote:database-agent-run-changed';

export type DatabaseAgentRunChangeAction = 'undo' | 'retry' | 'resume';

export interface DatabaseAgentRunChangedDetail {
  action: DatabaseAgentRunChangeAction;
  runId: string;
  databaseIds: string[];
  sourceIds: string[];
  recordIds: string[];
}

export function emitDatabaseAgentRunChanged(detail: DatabaseAgentRunChangedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<DatabaseAgentRunChangedDetail>(DATABASE_AGENT_RUN_CHANGED_EVENT, { detail }),
  );
}

export function subscribeToDatabaseAgentRunChanged(
  onChange: (detail: DatabaseAgentRunChangedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail = (event as CustomEvent<DatabaseAgentRunChangedDetail>).detail;
    if (!detail || typeof detail.runId !== 'string') return;
    onChange(detail);
  };
  window.addEventListener(DATABASE_AGENT_RUN_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DATABASE_AGENT_RUN_CHANGED_EVENT, listener);
}
