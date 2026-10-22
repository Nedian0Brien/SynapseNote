import { afterEach, describe, expect, mock, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseAutomationsDialog } from './DatabaseAutomationsDialog';

const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  people: [
    {
      id: 'person_owner',
      key: 'owner',
      name: 'Owner',
      kind: 'agent',
      subjectId: 'agent:owner',
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
      properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
    },
  ],
  automations: [
    {
      id: 'auto_daily',
      key: 'daily',
      name: 'Daily review',
      version: 2,
      enabled: false,
      ownerId: 'person_owner',
      trigger: {
        kind: 'schedule',
        schedule: { kind: 'daily', time: '09:00' },
        timeZone: 'Asia/Seoul',
      },
      actions: [
        {
          id: 'notify',
          kind: 'notification',
          recipientIds: ['person_owner'],
          title: 'Review tasks',
        },
      ],
    },
  ],
});

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('DatabaseAutomationsDialog', () => {
  test('edits a versioned definition and shows content-free durable history', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            action: 'list',
            runs: [
              {
                version: 1,
                id: 'autorun_one',
                eventId: 'aevt_one',
                databaseId: 'db_tasks',
                automationId: 'auto_daily',
                automationVersion: 2,
                ownerId: 'person_owner',
                schemaRevision: `sha256:${'a'.repeat(64)}`,
                state: 'succeeded',
                attempt: 1,
                createdAt: '2026-07-21T00:00:00.000Z',
                startedAt: '2026-07-21T00:00:00.000Z',
                finishedAt: '2026-07-21T00:00:01.000Z',
                nextAttemptAt: null,
                internalRequired: false,
                internalMutationId: null,
                actions: [
                  {
                    actionId: 'notify',
                    kind: 'notification',
                    state: 'succeeded',
                    receiptId: 'notice_1',
                    error: null,
                  },
                ],
                errorCode: null,
                error: null,
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const onChange = mock(() => {});
    render(
      <DatabaseAutomationsDialog
        open
        onOpenChange={() => {}}
        database={database}
        busy={false}
        onChange={onChange}
      />,
    );

    expect(await screen.findByText('attempt 1 · verified')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit automation' }));
    fireEvent.change(screen.getByLabelText('Automation name'), {
      target: { value: 'Daily task review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'auto_daily',
        name: 'Daily task review',
        version: 2,
        ownerId: 'person_owner',
        trigger: expect.objectContaining({ kind: 'schedule' }),
      }),
    ]);
  });
});
