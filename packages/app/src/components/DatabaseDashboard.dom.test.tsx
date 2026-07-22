import { afterEach, describe, expect, mock, test } from 'bun:test';
import { DatabaseDefinitionSchema, type DatabaseQueryResult } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabaseDashboard } from './DatabaseDashboard';

const hash = `sha256:${'a'.repeat(64)}`;
const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_work',
  key: 'work',
  name: 'Work',
  contract: {
    purpose: 'Track work',
    canonicality: 'canonical',
    vocabulary: ['work'],
    freshness: { expectation: 'daily', maxAgeSeconds: 86_400 },
    sensitivity: 'internal',
  },
  sources: [
    {
      id: 'ds_work',
      key: 'work',
      name: 'Work',
      recordMeaning: 'One task',
      folder: 'work',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
        {
          id: 'prop_related',
          key: 'related',
          name: 'Related',
          type: 'relation',
          targetSourceId: 'ds_work',
        },
      ],
    },
  ],
  views: [
    {
      id: 'view_work_table',
      key: 'table',
      name: 'Work table',
      sourceId: 'ds_work',
      layout: { type: 'table', configuration: {} },
      groups: [],
      projection: { propertyIds: ['prop_title', 'prop_status'] },
    },
    {
      id: 'view_work_related',
      key: 'related',
      name: 'Related work',
      sourceId: 'ds_work',
      layout: { type: 'table', configuration: {} },
      groups: [],
      projection: { propertyIds: ['prop_title'] },
    },
    {
      id: 'view_work_dashboard',
      key: 'dashboard',
      name: 'Work dashboard',
      sourceId: 'ds_work',
      layout: {
        type: 'dashboard',
        configuration: {
          rows: [
            {
              id: 'dshr_overview',
              height: 'medium',
              widgets: [
                { id: 'dshw_source', viewId: 'view_work_table', width: 2 },
                { id: 'dshw_target', viewId: 'view_work_related', width: 2 },
              ],
            },
          ],
          globalFilters: [
            {
              id: 'dshf_open',
              key: 'open',
              name: 'Only with status',
              enabledByDefault: true,
              clauses: [
                {
                  sourceId: 'ds_work',
                  where: { propertyId: 'prop_status', operator: 'is_not_empty' },
                },
              ],
            },
          ],
          interactions: [
            {
              sourceWidgetId: 'dshw_source',
              targetWidgetId: 'dshw_target',
              targetRelationPropertyId: 'prop_related',
            },
          ],
        },
      },
      groups: [],
      projection: { propertyIds: ['prop_title'] },
    },
  ],
});
const dashboard = database.views.find((view) => view.id === 'view_work_dashboard');
if (!dashboard) throw new Error('missing Dashboard fixture');

function result(viewId: string): DatabaseQueryResult {
  const target = viewId === 'view_work_related';
  return {
    sourceId: 'ds_work',
    snapshotRevision: hash,
    matched: 1,
    returned: 1,
    isComplete: true,
    nextCursor: null,
    truncatedBy: null,
    indexFreshness: 'snapshot',
    records: [
      {
        id: target ? 'rec_target' : 'rec_source',
        path: target ? 'work/target.md' : 'work/source.md',
        revision: hash,
        values: {
          prop_title: target ? 'Target task' : 'Source task',
          prop_status: 'Open',
          prop_related: target ? ['rec_source'] : [],
        },
      },
    ],
    aggregation: null,
  };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('DatabaseDashboard', () => {
  test('loads responsive widgets, toggles global filters, and links Relation selections', async () => {
    const requests: Array<Record<string, unknown>> = [];
    globalThis.fetch = mock(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { viewId: string };
      requests.push(body as unknown as Record<string, unknown>);
      return new Response(JSON.stringify(result(body.viewId)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const onOpen = mock(() => {});
    render(
      <DatabaseDashboard
        databaseId={database.id}
        database={database}
        view={dashboard}
        onOpen={onOpen}
      />,
    );
    expect(document.querySelector('[data-dashboard-row="dshr_overview"]')?.className).toContain(
      'md:grid-cols-4',
    );
    expect(document.querySelector('[data-dashboard-widget="dshw_source"]')?.className).toContain(
      'md:col-span-2',
    );
    await screen.findByText('Source task');
    await screen.findByText('Target task');
    expect(
      requests.slice(0, 2).every((request) => JSON.stringify(request).includes('prop_status')),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Source task' }));
    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.viewId === 'view_work_related' &&
            JSON.stringify(request).includes('prop_related') &&
            JSON.stringify(request).includes('rec_source'),
        ),
      ).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open selected Source task' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_source' }));

    fireEvent.click(screen.getByRole('button', { name: 'Only with status' }));
    await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(5));
    expect(
      screen.getByRole('button', { name: 'Only with status' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
