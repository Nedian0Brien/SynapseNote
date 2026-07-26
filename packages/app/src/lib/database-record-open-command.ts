import type {
  DatabaseDefinition,
  DatabaseSource,
  DatabaseView,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import {
  createDatabaseInteractionId,
  recordDatabaseInteractionTrace,
} from './database-interaction-trace';
import {
  databaseRecordPathToHash,
  databaseViewOpenBehavior,
  navigateToDatabaseRecordPath,
} from './database-navigation';
import { closeDatabaseRecordPeek, openDatabaseRecordPeek } from './database-overlay-store';
import { rememberDatabaseRecordNavigation } from './database-record-navigation';

export type DatabaseRecordOpenOrigin = 'inline' | 'workspace' | 'peek';

export interface DatabaseRecordOpenIntent {
  database: DatabaseDefinition;
  source: DatabaseSource;
  view?: DatabaseView;
  record: ProjectedDatabaseRecord;
  recordPaths: readonly string[];
  origin: DatabaseRecordOpenOrigin;
  notionSurface: boolean;
  trigger?: HTMLElement | null;
  onNavigateRecord?: (path: string) => void;
  interactionId?: string;
}

export type DatabaseRecordOpenResult =
  | { status: 'peek'; mode: 'side_peek' | 'center_peek'; interactionId: string }
  | { status: 'full_page'; hash: string; interactionId: string }
  | { status: 'invalid'; reason: string; interactionId: string };

function validIntent(intent: DatabaseRecordOpenIntent): boolean {
  return Boolean(
    intent.database.id &&
      intent.source.id &&
      intent.record.id &&
      intent.record.path &&
      intent.recordPaths.includes(intent.record.path),
  );
}

/**
 * Single command entry point for title clicks, Open buttons, and row actions.
 * It commits navigation memory before choosing a visible outcome so previous
 * and next controls keep the same canonical order after a NodeView refresh.
 */
export function requestOpenDatabaseRecord(
  intent: DatabaseRecordOpenIntent,
): DatabaseRecordOpenResult {
  const interactionId = intent.interactionId ?? createDatabaseInteractionId();
  recordDatabaseInteractionTrace(interactionId, 'command_requested', {
    origin: intent.origin,
    databaseId: intent.database.id,
    sourceId: intent.source.id,
    recordId: intent.record.id,
  });
  if (!validIntent(intent)) {
    recordDatabaseInteractionTrace(interactionId, 'command_rejected', {
      reason: 'incomplete-target',
    });
    return {
      status: 'invalid',
      reason: 'The database record target is incomplete.',
      interactionId,
    };
  }
  rememberDatabaseRecordNavigation({
    databaseId: intent.database.id,
    sourceId: intent.source.id,
    viewId: intent.view?.id,
    paths: intent.recordPaths,
    currentPath: intent.record.path,
  });
  recordDatabaseInteractionTrace(interactionId, 'navigation_memory_written', {
    path: intent.record.path,
  });
  const behavior = intent.view ? databaseViewOpenBehavior(intent.view) : 'full_page';
  if (behavior === 'full_page') {
    const hash = databaseRecordPathToHash(intent.record.path);
    recordDatabaseInteractionTrace(interactionId, 'route_requested', { hash });
    navigateToDatabaseRecordPath(intent.record.path);
    return { status: 'full_page', hash, interactionId };
  }
  openDatabaseRecordPeek({
    database: intent.database,
    source: intent.source,
    record: intent.record,
    mode: behavior,
    notionSurface: intent.notionSurface,
    trigger:
      intent.trigger ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null),
    onNavigateRecord: intent.onNavigateRecord,
    interactionId,
    onOpenFull: () => {
      recordDatabaseInteractionTrace(interactionId, 'route_requested', {
        hash: databaseRecordPathToHash(intent.record.path),
      });
      navigateToDatabaseRecordPath(intent.record.path);
      // The route change is the explicit full-page transition. Clearing the
      // external overlay here prevents a stale peek from surviving a browser
      // hash listener that is scheduled in the same task.
      closeDatabaseRecordPeek('navigation');
    },
  });
  return { status: 'peek', mode: behavior, interactionId };
}
