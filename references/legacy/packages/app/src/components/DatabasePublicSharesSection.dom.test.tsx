import { afterEach, describe, expect, mock, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabasePublicSharesSection } from './DatabasePublicSharesSection';

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  contract: {
    purpose: 'Track tasks',
    canonicality: 'canonical',
    vocabulary: ['tasks'],
    freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
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
        { id: 'prop_tasks_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_tasks_secret', key: 'secret', name: 'Secret', type: 'text' },
      ],
    },
  ],
  views: [
    {
      id: 'view_tasks_table',
      key: 'table',
      name: 'Table',
      sourceId: 'ds_tasks',
      layout: { type: 'table' },
      projection: { propertyIds: ['prop_tasks_title'] },
    },
  ],
});

describe('DatabasePublicSharesSection', () => {
  test('creates a projected current-view link, shows its credential once, and revokes it', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let revision = 'sha256:empty';
    const share = {
      version: 1,
      id: 'dbshare_11111111-1111-4111-8111-111111111111',
      target: { kind: 'view', databaseId: 'db_tasks', viewId: 'view_tasks_table' },
      access: 'link',
      propertyIds: ['prop_tasks_title'],
      allowBody: false,
      allowFormSubmission: false,
      expiresAt: null,
      revokedAt: null,
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    };
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.action === 'list') {
        return Response.json({ action: 'list', shares: [], revision });
      }
      if (body.action === 'upsert') {
        revision = `sha256:${'1'.repeat(64)}`;
        return Response.json({ action: 'upsert', share, token: 'dbsharetoken_once', revision });
      }
      revision = `sha256:${'2'.repeat(64)}`;
      return Response.json({ action: 'revoke', shareId: share.id, revision });
    }) as typeof fetch;

    render(<DatabasePublicSharesSection database={database} selectedViewId="view_tasks_table" />);
    await screen.findByText('Active and revoked links');
    fireEvent.click(screen.getByText('Secret'));
    fireEvent.click(screen.getByRole('button', { name: 'Create public link' }));
    expect(
      ((await screen.findByLabelText('Issued public link')) as HTMLInputElement).value,
    ).toContain('dbsharetoken_once');
    expect(bodies[1]).toMatchObject({
      action: 'upsert',
      target: { kind: 'view', databaseId: 'db_tasks', viewId: 'view_tasks_table' },
      propertyIds: ['prop_tasks_title'],
      expectedRevision: 'sha256:empty',
    });
    fireEvent.click(screen.getByRole('button', { name: `Revoke ${share.id}` }));
    await waitFor(() => expect(screen.queryByText(share.id)).toBeNull());
    expect(bodies[2]).toEqual({
      action: 'revoke',
      shareId: share.id,
      expectedRevision: `sha256:${'1'.repeat(64)}`,
    });
  });

  test('defaults to the open record page when publishing from a record peek', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.action === 'list') {
        return Response.json({ action: 'list', shares: [], revision: 'sha256:empty' });
      }
      return Response.json({
        action: 'upsert',
        share: {
          version: 1,
          id: 'dbshare_22222222-2222-4222-8222-222222222222',
          target: { kind: 'record', databaseId: 'db_tasks', recordId: 'rec_open' },
          access: 'link',
          propertyIds: ['prop_tasks_title', 'prop_tasks_secret'],
          allowBody: false,
          allowFormSubmission: false,
          expiresAt: null,
          revokedAt: null,
          createdAt: '2026-07-21T00:00:00.000Z',
          updatedAt: '2026-07-21T00:00:00.000Z',
        },
        token: 'dbsharetoken_record',
        revision: `sha256:${'3'.repeat(64)}`,
      });
    }) as typeof fetch;
    render(
      <DatabasePublicSharesSection
        database={database}
        selectedViewId="view_tasks_table"
        selectedRecordId="rec_open"
      />,
    );
    await screen.findByText('Active and revoked links');
    fireEvent.click(screen.getByRole('button', { name: 'Create public link' }));
    await screen.findByLabelText('Issued public link');
    expect(bodies[1]).toMatchObject({
      target: { kind: 'record', databaseId: 'db_tasks', recordId: 'rec_open' },
    });
  });
});
