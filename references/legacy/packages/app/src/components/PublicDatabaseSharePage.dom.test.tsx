import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PublicDatabaseSharePage } from './PublicDatabaseSharePage';

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const share = {
  version: 1,
  id: 'dbshare_11111111-1111-4111-8111-111111111111',
  target: { kind: 'database', databaseId: 'db_tasks', sourceId: 'ds_tasks' },
  access: 'link',
  propertyIds: ['prop_tasks_title'],
  allowBody: false,
  allowFormSubmission: false,
  expiresAt: null,
  revokedAt: null,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
};

describe('PublicDatabaseSharePage', () => {
  test('renders only the server-projected fields from a valid share', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.action === 'resolve') return Response.json({ action: 'resolve', share });
      return Response.json({
        action: 'query',
        share,
        result: {
          records: [
            {
              id: 'rec_first',
              values: { prop_tasks_title: 'Visible title' },
            },
          ],
        },
      });
    }) as typeof fetch;

    render(<PublicDatabaseSharePage shareId={share.id} token="dbsharetoken_once" />);
    expect(await screen.findByText('Visible title')).toBeTruthy();
    expect(screen.getByText('prop_tasks_title')).toBeTruthy();
    expect(screen.queryByText('prop_tasks_code')).toBeNull();
    expect(bodies).toEqual([
      { action: 'resolve', shareId: share.id, token: 'dbsharetoken_once' },
      {
        action: 'query',
        shareId: share.id,
        token: 'dbsharetoken_once',
        query: { select: ['prop_tasks_title'] },
      },
    ]);
  });

  test('uses the same unavailable page for rejected credentials', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ detail: 'Not found' }, { status: 404 }),
    ) as typeof fetch;
    render(<PublicDatabaseSharePage shareId={share.id} token="dbsharetoken_wrong" />);
    expect(await screen.findByText('This database link is unavailable')).toBeTruthy();
    expect(screen.queryByText('Not found')).toBeNull();
  });

  test('renders and submits an explicitly enabled public Form share', async () => {
    const formShare = {
      ...share,
      target: { kind: 'form', databaseId: 'db_tasks', viewId: 'view_tasks_form' },
      allowFormSubmission: true,
    };
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.action === 'resolve') return Response.json({ action: 'resolve', share: formShare });
      if (body.action === 'describe') {
        return Response.json({
          action: 'describe',
          share: formShare,
          result: {
            database: {
              version: 1,
              id: 'db_tasks',
              key: 'tasks',
              name: 'Tasks',
              contract: {
                purpose: 'Collect tasks',
                canonicality: 'canonical',
                vocabulary: ['tasks'],
                freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
                sensitivity: 'public',
              },
              sources: [
                {
                  id: 'ds_tasks',
                  key: 'tasks',
                  name: 'Tasks',
                  recordMeaning: 'One task',
                  folder: 'tasks',
                  properties: [
                    { id: 'prop_tasks_title', key: 'title', name: 'Title', type: 'title' },
                  ],
                },
              ],
              views: [
                {
                  id: 'view_tasks_form',
                  key: 'form',
                  name: 'Task form',
                  sourceId: 'ds_tasks',
                  layout: {
                    type: 'form',
                    configuration: {
                      access: 'public',
                      title: 'Task form',
                      questions: [
                        {
                          id: 'frmq_001_title',
                          propertyId: 'prop_tasks_title',
                          label: 'Task title',
                          required: true,
                        },
                      ],
                      defaults: {},
                      confirmation: {
                        title: 'Thanks',
                        message: 'Saved.',
                        allowAnotherResponse: false,
                      },
                      closedMessage: 'Closed.',
                      fileUploads: { enabled: false, maxFilesPerQuestion: 5 },
                      spamProtection: {
                        honeypot: true,
                        minimumCompletionSeconds: 0,
                        rateLimit: { maxSubmissions: 10, windowSeconds: 60 },
                      },
                      duplicateSubmission: { type: 'allow' },
                      retention: { type: 'workspace' },
                    },
                  },
                  sort: [],
                  groups: [],
                  projection: { propertyIds: ['prop_tasks_title'], body: 'hidden' },
                },
              ],
            },
          },
        });
      }
      return Response.json({
        action: 'submit_form',
        share: formShare,
        result: {
          status: 'created',
          recordId: 'rec_created',
          submittedAt: '2026-07-21T12:00:00.000Z',
          idempotentReplay: false,
          confirmation: { title: 'Thanks', message: 'Saved.', allowAnotherResponse: false },
        },
      });
    }) as typeof fetch;

    render(<PublicDatabaseSharePage shareId={share.id} token="dbsharetoken_once" />);
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Ship public form' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
    expect(await screen.findByText('Thanks')).toBeTruthy();
    expect(bodies[2]).toMatchObject({
      action: 'submit_form',
      shareId: share.id,
      token: 'dbsharetoken_once',
      answers: { prop_tasks_title: 'Ship public form' },
      honeypot: '',
    });
  });
});
