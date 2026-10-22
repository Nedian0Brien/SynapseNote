import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseDefinition } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseTemplatesDialog } from './DatabaseTemplatesDialog';

const database: DatabaseDefinition = {
  version: 1,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  people: [
    {
      id: 'person_scheduler',
      key: 'scheduler',
      name: 'Scheduler',
      kind: 'agent',
      subjectId: 'agent:template-scheduler',
      active: true,
    },
  ],
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
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        {
          id: 'prop_status',
          key: 'status',
          name: 'Status',
          type: 'select',
          options: [{ id: 'opt_todo', key: 'todo', name: 'To do' }],
        },
      ],
    },
  ],
  views: [
    {
      id: 'view_inbox',
      key: 'inbox',
      name: 'Inbox',
      sourceId: 'ds_tasks',
      layout: { type: 'table', configuration: {} },
      projection: { propertyIds: ['prop_title', 'prop_status'], body: 'hidden' },
    },
  ],
  templates: [
    {
      id: 'tpl_existing',
      key: 'existing',
      name: 'Existing',
      sourceId: 'ds_tasks',
      propertyValues: {},
      body: '',
      order: 0,
      archivedAt: null,
      defaultFor: { source: false, viewIds: [], entryPoints: [] },
    },
  ],
};

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('DatabaseTemplatesDialog', () => {
  test('authors typed defaults, Markdown, and scoped defaults as one lifecycle change', async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ runs: [] }), { status: 200 }),
    );
    const onChange = mock(() => {});
    const source = database.sources[0];
    if (!source) throw new Error('missing template source fixture');
    render(
      <DatabaseTemplatesDialog
        open
        onOpenChange={() => {}}
        database={database}
        source={source}
        views={database.views}
        busy={false}
        onChange={onChange}
      />,
    );
    expect(await screen.findByText('No repeating template runs yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bug report' } });
    fireEvent.change(screen.getByLabelText('Property defaults (JSON by property ID)'), {
      target: { value: '{"prop_status":"opt_todo"}' },
    });
    fireEvent.change(screen.getByLabelText('Markdown starter body'), {
      target: { value: '## Reproduction\n' },
    });
    fireEvent.click(screen.getByLabelText('Default for this data source'));
    fireEvent.click(screen.getByLabelText('Inbox'));
    fireEvent.change(screen.getByLabelText('Creation entry points'), {
      target: { value: 'quick_capture' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        template: expect.objectContaining({
          key: 'bug-report',
          propertyValues: { prop_status: 'opt_todo' },
          body: '## Reproduction\n',
          defaultFor: { source: true, viewIds: ['view_inbox'], entryPoints: ['quick_capture'] },
        }),
      }),
    );
  });

  test('authors an owned repeat schedule and displays durable run history', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            runs: [
              {
                version: 1,
                id: 'tplrun_aaaaaaaa000040008000000000000000',
                databaseId: 'db_tasks',
                templateId: 'tpl_existing',
                ownerId: 'person_scheduler',
                scheduledFor: '2026-07-21T00:00:00.000Z',
                state: 'succeeded',
                attempt: 1,
                startedAt: '2026-07-21T00:00:00.000Z',
                finishedAt: '2026-07-21T00:00:01.000Z',
                nextAttemptAt: null,
                recordIds: ['rec_daily'],
                error: null,
                revision: `sha256:${'a'.repeat(64)}`,
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const onChange = mock(() => {});
    const source = database.sources[0];
    if (!source) throw new Error('missing template source fixture');
    render(
      <DatabaseTemplatesDialog
        open
        onOpenChange={() => {}}
        database={database}
        source={source}
        views={database.views}
        busy={false}
        onChange={onChange}
      />,
    );
    expect(await screen.findByText(/Existing · succeeded · attempt 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Daily review' } });
    fireEvent.click(screen.getByLabelText('Repeat this template'));
    fireEvent.click(screen.getByLabelText('Paused'));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'create',
        template: expect.objectContaining({
          repeat: {
            schedule: { kind: 'daily', time: '09:00' },
            timeZone: expect.any(String),
            ownerId: 'person_scheduler',
            paused: false,
            retry: { maxAttempts: 3, initialBackoffSeconds: 60, multiplier: 2 },
          },
        }),
      }),
    );
  });
});
