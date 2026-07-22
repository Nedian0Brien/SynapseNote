import { afterEach, describe, expect, test } from 'bun:test';
import type { DatabasePresenceEntry } from '@nedian0brien/synapsenote-core';
import {
  collectDatabasePresence,
  DATABASE_PRESENCE_STALE_MS,
  type DatabasePresenceTarget,
  publishLocalDatabasePresence,
  resetDatabasePresenceForTests,
  setDatabasePresenceSource,
  subscribeDatabasePresenceTarget,
} from './database-presence';

afterEach(resetDatabasePresenceForTests);

const entry: DatabasePresenceEntry = {
  actor: { kind: 'human', name: 'Ada', color: '#123456', principalId: 'user:ada' },
  databaseId: 'db_tasks',
  sourceId: 'ds_tasks',
  recordId: 'rec_one',
  propertyId: 'prop_status',
  viewId: 'view_board',
  scope: 'cell',
  operation: 'editing',
  updatedAt: 1_000,
};

describe('database system awareness', () => {
  test('collects valid remote entries while excluding local, stale, future, and malformed state', () => {
    const states = new Map<number, unknown>([
      [1, { databasePresence: entry }],
      [2, { databasePresence: { ...entry, actor: { ...entry.actor, name: 'Grace' } } }],
      [3, { databasePresence: { ...entry, updatedAt: 1_000 - DATABASE_PRESENCE_STALE_MS } }],
      [4, { databasePresence: { ...entry, updatedAt: 7_000 } }],
      [5, { databasePresence: { databaseId: 'db_tasks' } }],
    ]);

    expect(collectDatabasePresence(states, 1, 1_000)).toEqual([
      { ...entry, actor: { ...entry.actor, name: 'Grace' } },
    ]);
  });

  test('preserves unrelated system awareness fields and removes only database presence', () => {
    let state: Record<string, unknown> | null = { currentView: { document: 'tasks/one' } };
    const awareness = {
      getLocalState: () => state,
      setLocalState: (next: Record<string, unknown> | null) => {
        state = next;
      },
    };
    publishLocalDatabasePresence(awareness, entry);
    expect(state).toEqual({ currentView: { document: 'tasks/one' }, databasePresence: entry });
    publishLocalDatabasePresence(awareness, null);
    expect(state).toEqual({ currentView: { document: 'tasks/one' } });
  });

  test('restores the prior mounted target when a more specific source closes', () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeDatabasePresenceTarget((target) => seen.push(target));
    const record: DatabasePresenceTarget = {
      databaseId: entry.databaseId,
      sourceId: entry.sourceId,
      recordId: entry.recordId,
      propertyId: null,
      viewId: entry.viewId,
      scope: 'record',
      operation: 'viewing',
    };
    const cell: DatabasePresenceTarget = {
      ...record,
      propertyId: entry.propertyId,
      scope: 'cell',
      operation: 'editing',
    };
    setDatabasePresenceSource('record-page', record);
    setDatabasePresenceSource('cell-editor', cell);
    setDatabasePresenceSource('cell-editor', null);
    unsubscribe();

    expect(seen).toEqual([null, record, cell, record]);
  });
});
