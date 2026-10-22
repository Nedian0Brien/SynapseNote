import { afterEach, describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatabaseOverlayHost } from '@/components/DatabaseOverlayHost';
import {
  getDatabaseInteractionTrace,
  resetDatabaseInteractionTraces,
} from './database-interaction-trace';
import { databaseRecordPathToHash, navigateToDatabaseRecordPath } from './database-navigation';
import {
  closeDatabaseRecordPeek,
  getDatabaseOverlaySnapshot,
  resetDatabaseOverlayState,
} from './database-overlay-store';
import { requestOpenDatabaseRecord } from './database-record-open-command';

const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  contract: {
    purpose: 'Track tasks',
    canonicality: 'canonical',
    vocabulary: ['task'],
    freshness: { expectation: 'realtime' },
    sensitivity: 'internal',
  },
  sources: [
    {
      id: 'ds_tasks',
      key: 'tasks',
      name: 'Tasks',
      recordMeaning: 'One task',
      folder: 'tasks',
      properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
    },
  ],
  views: [
    {
      id: 'view_table',
      key: 'table',
      sourceId: 'ds_tasks',
      name: 'Tasks',
      layout: { type: 'table' },
      projection: { propertyIds: ['prop_title'] },
      sort: [],
    },
  ],
});
const source = database.sources[0];
const view = database.views[0];
if (!source || !view) throw new Error('database fixture is incomplete');
const originalFetch = globalThis.fetch;

const record = {
  id: 'rec_first',
  path: 'tasks/first.md',
  revision: `sha256:${'a'.repeat(64)}`,
  values: { prop_title: 'First task' },
};

afterEach(() => {
  cleanup();
  resetDatabaseOverlayState();
  resetDatabaseInteractionTraces();
  globalThis.fetch = originalFetch;
  window.location.hash = '';
});

describe('database record open command', () => {
  test('keeps the peek visible when its host is remounted', async () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;

    const viewRoot = render(<DatabaseOverlayHost />);
    let outcome!: ReturnType<typeof requestOpenDatabaseRecord>;
    act(() => {
      outcome = requestOpenDatabaseRecord({
        database,
        source,
        view,
        record,
        recordPaths: [record.path],
        origin: 'inline',
        notionSurface: true,
      });
    });
    expect(outcome.status).toBe('peek');
    expect(outcome.mode).toBe('side_peek');
    expect(outcome.interactionId).toMatch(/^db-interaction-/);
    expect(getDatabaseInteractionTrace(outcome.interactionId).map((event) => event.kind)).toEqual([
      'command_requested',
      'navigation_memory_written',
      'overlay_updated',
      'overlay_mounted',
    ]);
    viewRoot.rerender(<DatabaseOverlayHost />);
    expect(await screen.findByRole('button', { name: 'Open full page' })).toBeTruthy();
    expect(getDatabaseOverlaySnapshot().recordPeek?.record.id).toBe(record.id);
  });

  test('reproduces the installed-app failure shape without closing on remount or same pointer', async () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
    const user = userEvent.setup();
    const viewRoot = render(
      <>
        <button
          type="button"
          onClick={(event) =>
            requestOpenDatabaseRecord({
              database,
              source,
              view,
              record,
              recordPaths: [record.path],
              origin: 'inline',
              notionSurface: true,
              trigger: event.currentTarget,
            })
          }
        >
          Open
        </button>
        <DatabaseOverlayHost />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const interactionId = getDatabaseOverlaySnapshot().recordPeek?.interactionId;
    expect(interactionId).toMatch(/^db-interaction-/);

    // This is the concrete failure shape observed in the installed app:
    // the editor host is replaced while the pointer transaction is settling.
    // The root overlay must survive both operations and must not emit a
    // same-pointer/outside dismissal before the pointer-up is complete.
    viewRoot.rerender(
      <>
        <button type="button">Open</button>
        <DatabaseOverlayHost />
      </>,
    );
    expect(await screen.findByRole('button', { name: 'Open full page' })).toBeTruthy();
    const trace = getDatabaseInteractionTrace(String(interactionId));
    expect(trace.map((event) => event.kind)).not.toContain('overlay_closed');
    expect(getDatabaseOverlaySnapshot().recordPeek?.record.id).toBe(record.id);
  });

  test('uses the canonical route adapter for full-page opens', () => {
    const fullPageView = { ...view, openBehavior: 'full_page' as const };
    let outcome!: ReturnType<typeof requestOpenDatabaseRecord>;
    act(() => {
      outcome = requestOpenDatabaseRecord({
        database,
        source,
        view: fullPageView,
        record,
        recordPaths: [record.path],
        origin: 'workspace',
        notionSurface: true,
      });
    });
    expect(outcome.status).toBe('full_page');
    expect(outcome.hash).toBe(databaseRecordPathToHash(record.path));
    expect(outcome.interactionId).toMatch(/^db-interaction-/);
    expect(window.location.hash).toBe(databaseRecordPathToHash(record.path));
    expect(getDatabaseOverlaySnapshot().recordPeek).toBeNull();
  });

  test('records Escape as a distinct overlay dismiss reason', () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
    render(<DatabaseOverlayHost />);
    let outcome!: ReturnType<typeof requestOpenDatabaseRecord>;
    act(() => {
      outcome = requestOpenDatabaseRecord({
        database,
        source,
        view,
        record,
        recordPaths: [record.path],
        origin: 'inline',
        notionSurface: true,
      });
    });
    act(() => closeDatabaseRecordPeek('escape'));
    expect(getDatabaseOverlaySnapshot().recordPeek).toBeNull();
    const closed = getDatabaseInteractionTrace(outcome.interactionId).find(
      (event) => event.kind === 'overlay_closed',
    );
    expect(closed?.details).toMatchObject({ reason: 'escape' });
  });

  test('classifies every supported dismiss path and keeps the interaction id', () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
    render(<DatabaseOverlayHost />);
    const reasons = ['explicit', 'escape', 'outside', 'navigation'] as const;
    for (const reason of reasons) {
      let outcome!: ReturnType<typeof requestOpenDatabaseRecord>;
      act(() => {
        outcome = requestOpenDatabaseRecord({
          database,
          source,
          view,
          record,
          recordPaths: [record.path],
          origin: 'inline',
          notionSurface: true,
        });
      });
      act(() => closeDatabaseRecordPeek(reason));
      const closed = getDatabaseInteractionTrace(outcome.interactionId).find(
        (event) => event.kind === 'overlay_closed',
      );
      expect(closed?.details).toMatchObject({ reason });
      resetDatabaseOverlayState();
      resetDatabaseInteractionTraces();
    }
  });

  test('uses a real pointer sequence without same-pointer dismissal', async () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
    const user = userEvent.setup();
    let outcome: ReturnType<typeof requestOpenDatabaseRecord> | undefined;
    function Trigger() {
      return (
        <button
          type="button"
          onClick={(event) => {
            outcome = requestOpenDatabaseRecord({
              database,
              source,
              view,
              record,
              recordPaths: [record.path],
              origin: 'inline',
              notionSurface: true,
              trigger: event.currentTarget,
            });
          }}
        >
          Open
        </button>
      );
    }
    render(
      <>
        <Trigger />
        <DatabaseOverlayHost />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(outcome?.status).toBe('peek');
    expect(await screen.findByRole('button', { name: 'Open full page' })).toBeTruthy();
    expect(getDatabaseOverlaySnapshot().recordPeek?.record.id).toBe(record.id);
  });

  test('restores focus to the initiating trigger after close', async () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
    const user = userEvent.setup();
    let trigger: HTMLButtonElement | null = null;
    function Trigger() {
      return (
        <button
          ref={(node) => {
            trigger = node;
          }}
          type="button"
          onClick={(event) =>
            requestOpenDatabaseRecord({
              database,
              source,
              view,
              record,
              recordPaths: [record.path],
              origin: 'inline',
              notionSurface: true,
              trigger: event.currentTarget,
            })
          }
        >
          Open
        </button>
      );
    }
    render(
      <>
        <Trigger />
        <DatabaseOverlayHost />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    act(() => closeDatabaseRecordPeek('explicit'));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(document.activeElement).toBe(trigger);
  });

  test('records the full-page transition and navigation dismiss as one interaction', async () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
    render(<DatabaseOverlayHost />);
    let outcome!: ReturnType<typeof requestOpenDatabaseRecord>;
    act(() => {
      outcome = requestOpenDatabaseRecord({
        database,
        source,
        view,
        record,
        recordPaths: [record.path],
        origin: 'inline',
        notionSurface: true,
      });
    });
    const openFullPage = await screen.findByRole('button', { name: 'Open full page' });
    fireEvent.click(openFullPage);
    expect(window.location.hash).toBe(databaseRecordPathToHash(record.path));
    expect(getDatabaseOverlaySnapshot().recordPeek).toBeNull();
    expect(getDatabaseInteractionTrace(outcome.interactionId).map((event) => event.kind)).toEqual([
      'command_requested',
      'navigation_memory_written',
      'overlay_updated',
      'overlay_mounted',
      'route_requested',
      'overlay_closed',
    ]);
    expect(
      getDatabaseInteractionTrace(outcome.interactionId).find(
        (event) => event.kind === 'overlay_closed',
      )?.details,
    ).toMatchObject({ reason: 'navigation' });
  });

  test('rejects a record that is not part of the active projection', () => {
    let outcome!: ReturnType<typeof requestOpenDatabaseRecord>;
    act(() => {
      outcome = requestOpenDatabaseRecord({
        database,
        source,
        view,
        record,
        recordPaths: [],
        origin: 'inline',
        notionSurface: true,
      });
    });
    expect(outcome.status).toBe('invalid');
    expect(window.location.hash).toBe('');
    expect(getDatabaseOverlaySnapshot().recordPeek).toBeNull();
  });

  test('does not rewrite an already active hash', () => {
    window.location.hash = databaseRecordPathToHash(record.path);
    navigateToDatabaseRecordPath(record.path);
    expect(window.location.hash).toBe(databaseRecordPathToHash(record.path));
  });
});
