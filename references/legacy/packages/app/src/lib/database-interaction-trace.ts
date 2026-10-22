export type DatabaseInteractionTraceKind =
  | 'command_requested'
  | 'command_rejected'
  | 'navigation_memory_written'
  | 'route_requested'
  | 'overlay_updated'
  | 'overlay_mounted'
  | 'overlay_closed'
  | 'node_view_mounted'
  | 'node_view_unmounted';

export interface DatabaseInteractionTraceEvent {
  id: string;
  kind: DatabaseInteractionTraceKind;
  at: number;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}

let nextInteractionId = 1;
const traces = new Map<string, DatabaseInteractionTraceEvent[]>();

function canTrace(): boolean {
  const env = import.meta.env as ImportMetaEnv | undefined;
  return (
    typeof window !== 'undefined' &&
    (env?.DEV === true || env?.MODE === 'test' || process.env.NODE_ENV === 'test')
  );
}

export function createDatabaseInteractionId(): string {
  const id = `db-interaction-${nextInteractionId}`;
  nextInteractionId += 1;
  return id;
}

export function recordDatabaseInteractionTrace(
  id: string,
  kind: DatabaseInteractionTraceKind,
  details?: Readonly<Record<string, string | number | boolean | null>>,
): void {
  if (!canTrace()) return;
  const events = traces.get(id) ?? [];
  events.push({ id, kind, at: Date.now(), ...(details ? { details } : {}) });
  traces.set(id, events);
}

export function getDatabaseInteractionTrace(id: string): readonly DatabaseInteractionTraceEvent[] {
  return traces.get(id) ?? [];
}

/** Test/diagnostic snapshot used by the production NodeView harness. */
export function getAllDatabaseInteractionTraces(): readonly DatabaseInteractionTraceEvent[] {
  return [...traces.values()].flat();
}

export function resetDatabaseInteractionTraces(): void {
  traces.clear();
  nextInteractionId = 1;
}
