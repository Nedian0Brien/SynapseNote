import { describe, expect, test } from 'bun:test';
import {
  emitDatabaseAgentRunChanged,
  subscribeToDatabaseAgentRunChanged,
} from './database-agent-run-events';

describe('database Agent Run change events', () => {
  test.skipIf(typeof window === 'undefined')(
    'broadcasts scoped recovery changes and supports unsubscribe',
    () => {
      const changes: unknown[] = [];
      const unsubscribe = subscribeToDatabaseAgentRunChanged((detail) => changes.push(detail));
      emitDatabaseAgentRunChanged({
        action: 'undo',
        runId: 'run_events',
        databaseIds: ['db_tasks'],
        sourceIds: ['ds_tasks'],
        recordIds: ['rec_first'],
      });
      expect(changes).toEqual([
        {
          action: 'undo',
          runId: 'run_events',
          databaseIds: ['db_tasks'],
          sourceIds: ['ds_tasks'],
          recordIds: ['rec_first'],
        },
      ]);
      unsubscribe();
      emitDatabaseAgentRunChanged({
        action: 'retry',
        runId: 'run_events_retry',
        databaseIds: ['db_tasks'],
        sourceIds: ['ds_tasks'],
        recordIds: [],
      });
      expect(changes).toHaveLength(1);
    },
  );
});
