import { afterEach, describe, expect, test } from 'bun:test';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { PropertyProvider } from '@/components/PropertyContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { DatabaseRecordPageServices } from './DatabaseRecordPageChrome';
import { DatabaseRecordPageChrome } from './DatabaseRecordPageChrome';

const DUMMY_WS = 'ws://localhost:1/collab';
const hash = `sha256:${'a'.repeat(64)}`;
const providers: HocuspocusProvider[] = [];

const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  contract: {
    purpose: 'Track tasks',
    canonicality: 'canonical',
    vocabulary: ['task'],
    freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
    sensitivity: 'internal',
  },
  sources: [
    {
      id: 'ds_tasks',
      key: 'tasks',
      name: 'Tasks',
      recordMeaning: 'One task',
      folder: 'records',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
        { id: 'prop_owner', key: 'owner', name: 'Owner', type: 'text' },
        { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
        { id: 'prop_internal', key: 'internal', name: 'Internal', type: 'text' },
      ],
      pageLayout: {
        pinnedPropertyIds: ['prop_score'],
        panelPropertyIds: ['prop_owner'],
        hiddenPropertyIds: ['prop_internal'],
        sections: [
          {
            id: 'layout_section_details',
            key: 'details',
            name: 'Details',
            groups: [
              {
                id: 'layout_group_notes',
                key: 'notes',
                name: 'Notes group',
                propertyIds: ['prop_notes'],
              },
            ],
          },
        ],
        fullWidthContent: true,
      },
    },
  ],
  views: [],
});
const source = database.sources.at(0);
if (!source) throw new Error('Expected the test database source');

function provider(): HocuspocusProvider {
  const next = new HocuspocusProvider({ url: DUMMY_WS, name: 'records/rec_first' });
  next.document
    .getText('source')
    .insert(
      0,
      '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_first\ntitle: Canonical title\nscore: 8\nowner: Minjae\nnotes: Important context\ninternal: Hidden value\n---\nBody\n',
    );
  providers.push(next);
  return next;
}

afterEach(() => {
  cleanup();
  while (providers.length > 0) providers.pop()?.destroy();
});

describe('DatabaseRecordPageChrome', () => {
  test('synchronizes the page title and routes owned property edits through the database command', async () => {
    const desiredStates: DatabaseDesiredStateDraftInput[] = [];
    const confirmations: string[] = [];
    const services: DatabaseRecordPageServices = {
      describe: async () => ({
        manifestRevision: hash,
        schemaRevision: hash,
        database,
        source,
        index: {
          state: 'idle',
          revision: hash,
          manifestRevision: hash,
          recordCount: 1,
          issueCount: 0,
          progress: null,
          lastRebuiltAt: null,
          lastIncrementalAt: null,
          lastError: null,
        },
        allowedOperations: ['catalog', 'describe', 'find', 'query', 'pack'],
      }),
      fetchRecord: async () => ({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        manifestRevision: hash,
        indexRevision: hash,
        record: {
          id: 'rec_first',
          path: 'records/rec_first.md',
          revision: hash,
          values: {
            prop_title: 'Canonical title',
            prop_score: 8,
            prop_owner: 'Minjae',
            prop_notes: 'Important context',
            prop_internal: 'Hidden value',
          },
        },
      }),
      executeMutation: (async (input) => {
        desiredStates.push(input.desiredState);
        const plan = {
          id: 'plan_page_title',
          hash,
          snapshotRevision: hash,
          committable: true,
          requiresCommit: true,
          conflicts: [],
          approvals: [],
          risk: {},
          diff: { records: [] },
        } as never;
        const approved = await input.review(plan, {} as never);
        return approved
          ? ({ status: 'converged', draft: {} as never, plan } as const)
          : ({ status: 'review_declined', draft: {} as never, plan } as const);
      }) as DatabaseRecordPageServices['executeMutation'],
      confirm: (message) => {
        confirmations.push(message);
        return true;
      },
    };
    const recordProvider = provider();
    const view = render(
      <TooltipProvider>
        <PropertyProvider>
          <DatabaseRecordPageChrome
            provider={recordProvider}
            docName="records/rec_first"
            docExt=".md"
            fallbackTitle="rec_first"
            services={services}
          />
        </PropertyProvider>
      </TooltipProvider>,
    );

    await waitFor(() =>
      expect(view.getByTestId('page-header-title').textContent).toBe('Canonical title'),
    );
    expect(
      view.container.querySelector(
        '[data-database-record-page-surface][data-record-page-mode="full_page"]',
      ),
    ).not.toBeNull();
    expect(view.getByLabelText('Database breadcrumbs')).toBeDefined();
    expect(view.getByRole('link', { name: 'Tasks' }).getAttribute('href')).toBe(
      '#database/db_tasks/ds_tasks',
    );
    expect(view.getAllByTestId('property-row').map((row) => row.getAttribute('data-key'))).toEqual([
      'score',
      'owner',
      'notes',
      'tags',
    ]);
    expect(view.getByText('Pinned')).toBeDefined();
    expect(view.getByText('Details')).toBeDefined();
    expect(view.getByText('Notes group')).toBeDefined();
    expect(view.queryByText('Hidden value')).toBeNull();
    expect(view.container.querySelector('[data-full-width-content="true"]')).not.toBeNull();
    expect(view.queryByText('_sn')).toBeNull();

    const title = view.getByTestId('page-header-title');
    act(() => title.focus());
    title.textContent = 'Updated title';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Enter' });
    await waitFor(() => expect(desiredStates).toHaveLength(1));
    expect(desiredStates[0]?.recordMutations?.[0]).toMatchObject({
      id: 'rec_first',
      expectedRevision: hash,
      operations: [{ op: 'set', propertyKey: 'title', value: 'Updated title' }],
    });

    const score = view.getByLabelText('score value');
    fireEvent.change(score, { target: { value: '9' } });
    fireEvent.blur(score);
    await waitFor(() => expect(desiredStates).toHaveLength(2));
    expect(desiredStates[1]?.recordMutations?.[0]).toMatchObject({
      operations: [{ op: 'set', propertyKey: 'score', value: 9 }],
    });
    expect(recordProvider.document.getText('source').toString()).toContain('score: 8');
    expect(confirmations).toHaveLength(2);
    expect(confirmations[0]).toContain('Exact plan: plan_page_title');

    fireEvent.click(view.getByRole('button', { name: 'Customize layout' }));
    fireEvent.click(view.getByRole('combobox', { name: 'Owner placement' }));
    fireEvent.click(await view.findByRole('option', { name: 'Hidden' }));
    fireEvent.click(view.getByLabelText('Use full-width page content'));
    fireEvent.click(view.getByRole('button', { name: 'Review layout change' }));
    await waitFor(() => expect(desiredStates).toHaveLength(3));
    expect(desiredStates[2]?.sources[0]?.pageLayout).toMatchObject({
      pinnedPropertyIds: ['prop_score'],
      hiddenPropertyIds: ['prop_owner', 'prop_internal'],
      fullWidthContent: false,
    });
    expect(confirmations[2]).toContain('Apply this record layout');

    fireEvent.click(view.getByRole('button', { name: 'Customize this record' }));
    fireEvent.click(view.getByRole('combobox', { name: 'Owner record placement' }));
    fireEvent.click(await view.findByRole('option', { name: 'Panel' }));
    fireEvent.click(view.getByRole('combobox', { name: 'Notes group record state' }));
    fireEvent.click(await view.findByRole('option', { name: 'Expanded' }));
    fireEvent.click(view.getByRole('combobox', { name: 'Record content width' }));
    fireEvent.click(await view.findByRole('option', { name: 'Full width' }));
    fireEvent.click(view.getByRole('button', { name: 'Review record override' }));
    await waitFor(() => expect(desiredStates).toHaveLength(4));
    expect(desiredStates[3]?.sampleRecords[0]).toMatchObject({
      id: 'rec_first',
      expectedRevision: hash,
      sourceKey: 'tasks',
      pageLayoutOverride: {
        pinnedPropertyIds: [],
        panelPropertyIds: ['prop_owner'],
        hiddenPropertyIds: [],
        groupOverrides: [{ groupId: 'layout_group_notes', collapsed: false }],
        fullWidthContent: true,
      },
    });
    expect(confirmations[3]).toContain('Apply this presentation override');
  });

  test('keeps previous, next, and return-to-view continuity for a record opened from a database view', async () => {
    window.sessionStorage.setItem(
      'synapsenote:database-record-navigation-v1',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        viewId: 'view_table',
        paths: ['records/first.md', 'records/second.md', 'records/third.md'],
        index: 1,
      }),
    );
    const services: DatabaseRecordPageServices = {
      describe: async () => ({
        manifestRevision: hash,
        schemaRevision: hash,
        database,
        source,
        index: {
          state: 'idle',
          revision: hash,
          manifestRevision: hash,
          recordCount: 3,
          issueCount: 0,
          progress: null,
          lastRebuiltAt: null,
          lastIncrementalAt: null,
          lastError: null,
        },
        allowedOperations: ['catalog', 'describe', 'find', 'query', 'pack'],
      }),
      fetchRecord: async () => ({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        manifestRevision: hash,
        indexRevision: hash,
        record: {
          id: 'rec_first',
          path: 'records/second.md',
          revision: hash,
          values: { prop_title: 'Canonical title' },
        },
      }),
      executeMutation: (async () => ({ status: 'review_declined' })) as never,
      confirm: () => true,
    };
    const view = render(
      <TooltipProvider>
        <PropertyProvider>
          <DatabaseRecordPageChrome
            provider={provider()}
            docName="records/second"
            docExt=".md"
            fallbackTitle="second"
            services={services}
          />
        </PropertyProvider>
      </TooltipProvider>,
    );
    await waitFor(() =>
      expect(view.getByTestId('page-header-title').textContent).toBe('Canonical title'),
    );
    expect(view.getByRole('button', { name: 'Previous record' }).hasAttribute('disabled')).toBe(
      false,
    );
    expect(view.getByRole('button', { name: 'Next record' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(view.getByRole('button', { name: 'Next record' }));
    expect(window.location.hash).toBe('#/records/third');
    expect(
      JSON.parse(
        window.sessionStorage.getItem('synapsenote:database-record-navigation-v1') ?? '{}',
      ),
    ).toMatchObject({
      index: 2,
    });
    fireEvent.click(view.getByRole('button', { name: 'Back to database view' }));
    expect(window.location.hash).toBe('#database/db_tasks/ds_tasks/view_table');
  });
});
