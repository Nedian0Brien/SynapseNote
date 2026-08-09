import { afterEach, describe, expect, mock, test } from 'bun:test';
import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  DatabaseDefinitionSchema,
  DatabaseRecordCommentsSchema,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { PropertyProvider } from '@/components/PropertyContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DatabaseCatalogClientError } from '@/lib/database-catalog-client';
import type {
  DatabaseCommentRequest,
  DatabaseCommentSnapshot,
} from '@/lib/database-comments-client';
import { DatabaseQueryClientError } from '@/lib/database-query-client';
import { useDatabaseRecordHeader } from '@/lib/database-record-header';
import { emitDatabaseChanged } from '@/lib/documents-events';
import type { DatabaseRecordPageServices } from './DatabaseRecordPageChrome';
import { DatabaseRecordPageChrome } from './DatabaseRecordPageChrome';

const DUMMY_WS = 'ws://localhost:1/collab';
const hash = `sha256:${'a'.repeat(64)}`;
const providers: HocuspocusProvider[] = [];

function DatabaseRecordHeaderProbe({ docName }: { docName: string }) {
  const header = useDatabaseRecordHeader(docName);
  return <div data-testid="database-record-header-probe">{JSON.stringify(header)}</div>;
}

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
const emptyComments = DatabaseRecordCommentsSchema.parse({
  version: 1,
  databaseId: database.id,
  recordId: 'rec_first',
  threads: [],
});
const databaseWithMove = DatabaseDefinitionSchema.parse({
  ...database,
  sources: [
    source,
    {
      id: 'ds_archive',
      key: 'archive',
      name: 'Archive',
      recordMeaning: 'Archived task',
      folder: 'archive',
      properties: [{ id: 'prop_archive_title', key: 'title', name: 'Title', type: 'title' }],
    },
  ],
  sourceMappings: [
    {
      sourceId: source.id,
      targetSourceId: 'ds_archive',
      propertyMappings: [
        {
          sourcePropertyId: 'prop_title',
          targetPropertyId: 'prop_archive_title',
          optionMappings: [],
        },
      ],
    },
  ],
});
const relationSource = {
  ...source,
  properties: [
    ...source.properties,
    {
      id: 'prop_project',
      key: 'project',
      name: 'Project',
      type: 'relation' as const,
      targetSourceId: 'ds_projects',
      cardinality: 'one' as const,
    },
  ],
};
const databaseWithRelation = DatabaseDefinitionSchema.parse({
  ...database,
  sources: [
    relationSource,
    {
      id: 'ds_projects',
      key: 'projects',
      name: 'Projects',
      recordMeaning: 'One project',
      folder: 'projects',
      properties: [{ id: 'prop_project_title', key: 'title', name: 'Title', type: 'title' }],
    },
  ],
});

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
  test('keeps the normal document body below the property panel', async () => {
    const view = render(
      <TooltipProvider>
        <PropertyProvider>
          <DatabaseRecordPageChrome
            provider={provider()}
            docName="notes/blank"
            docExt=".md"
            fallbackTitle="blank"
            body={<div data-testid="record-body-editor">Editable document body</div>}
          />
        </PropertyProvider>
      </TooltipProvider>,
    );

    const bodyHost = view.getByTestId('record-body-editor');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const bodySurface = bodyHost.closest('[data-database-record-body]');
    expect(bodySurface?.getAttribute('data-record-body-position')).toBe('below-properties');

    const pageHeader = view.container.querySelector('[data-testid="page-header"]');
    expect(pageHeader).not.toBeNull();
    expect(
      (pageHeader?.compareDocumentPosition(bodySurface ?? bodyHost) ?? 0) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

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
    const commentRequests: DatabaseCommentRequest[] = [];
    const commentsRequest = async (
      input: DatabaseCommentRequest,
    ): Promise<DatabaseCommentSnapshot> => {
      commentRequests.push(input);
      return { revision: hash, document: emptyComments };
    };
    const forceSync = mock(() => {});
    recordProvider.forceSync = forceSync;
    recordProvider.unsyncedChanges = 0;
    const view = render(
      <TooltipProvider>
        <PropertyProvider>
          <DatabaseRecordPageChrome
            provider={recordProvider}
            docName="records/rec_first"
            docExt=".md"
            fallbackTitle="rec_first"
            body={<div data-testid="record-body-editor">Editable record body</div>}
            services={services}
            commentsRequest={commentsRequest}
          />
          <DatabaseRecordHeaderProbe docName="records/rec_first" />
        </PropertyProvider>
      </TooltipProvider>,
    );

    await waitFor(() =>
      expect(view.getByTestId('page-header-title').textContent).toBe('Canonical title'),
    );
    const recordSurface = view.container.querySelector<HTMLElement>(
      '[data-database-record-page-surface][data-record-page-mode="full_page"]',
    );
    expect(recordSurface).not.toBeNull();
    expect(recordSurface?.getAttribute('data-database-id')).toBe('db_tasks');
    expect(recordSurface?.getAttribute('data-source-id')).toBe('ds_tasks');
    expect(recordSurface?.getAttribute('data-record-id')).toBe('rec_first');
    expect(recordSurface?.hasAttribute('data-database-machine-ids')).toBe(false);
    expect(recordSurface?.querySelector('[data-database-machine-ids]')).toBeNull();
    expect(view.queryByLabelText('Database breadcrumbs')).toBeNull();
    expect(view.queryByText('Advanced machine IDs')).toBeNull();
    expect(
      JSON.parse(view.getByTestId('database-record-header-probe').textContent ?? 'null'),
    ).toEqual({
      databaseName: 'Tasks',
      databaseHref: '#database/db_tasks/ds_tasks',
      sourceName: 'Tasks',
      sourceHref: '#database/db_tasks/ds_tasks',
      recordTitle: 'Canonical title',
    });
    const recordToolbar = view.container.querySelector<HTMLElement>(
      '[data-database-record-toolbar]',
    );
    expect(recordToolbar).not.toBeNull();
    expect(recordToolbar?.classList.contains('flex-wrap')).toBe(false);
    expect(recordToolbar?.parentElement?.classList.contains('editor-content-aligned')).toBe(true);
    expect(view.getByRole('button', { name: 'Ask agent' })).toBeDefined();
    const commentComposer = await view.findByRole('textbox', { name: 'Add comment' });
    const commentsSection = commentComposer.closest('[data-database-peek-comments]');
    expect(commentsSection).not.toBeNull();
    expect(view.queryByRole('dialog', { name: 'Comments' })).toBeNull();
    expect(commentRequests.at(0)).toMatchObject({ action: 'read', recordId: 'rec_first' });
    expect(view.queryByRole('button', { name: 'Comments' })).toBeNull();
    const bodyHost = view.getByTestId('record-body-editor');
    const bodySurface = bodyHost.closest('[data-database-record-body]');
    expect(bodySurface?.getAttribute('data-record-body-position')).toBe('below-properties');
    expect(
      (commentsSection?.compareDocumentPosition(bodySurface ?? bodyHost) ?? 0) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      view
        .getAllByTestId('property-row')
        .every(
          (row) =>
            (row.compareDocumentPosition(bodySurface ?? bodyHost) &
              Node.DOCUMENT_POSITION_FOLLOWING) !==
            0,
        ),
    ).toBe(true);
    act(() => {
      emitDatabaseChanged({
        v: 1,
        ch: 'database-changed',
        seq: 1,
        scope: 'records',
        reasons: ['record-update'],
        databaseIds: ['db_tasks'],
        sourceIds: ['ds_tasks'],
        recordIds: ['rec_first'],
        affectedIdsComplete: true,
        index: {
          state: 'idle',
          revision: hash,
          manifestRevision: hash,
          recordCount: 1,
          issueCount: 0,
          progress: null,
        },
      });
    });
    expect(forceSync).toHaveBeenCalledTimes(1);
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
    expect(view.queryByRole('button', { name: 'Comments' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Page history' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Permissions' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Customize appearance' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Customize this page' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Customize layout' })).toBeNull();

    const openPageMenu = () => {
      const trigger = view.getByRole('button', { name: 'More page actions' });
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.click(trigger);
    };
    openPageMenu();
    expect(view.getByRole('menuitem', { name: 'Page history' })).toBeDefined();
    expect(view.getByRole('menuitem', { name: 'Permissions' })).toBeDefined();
    expect(view.getByRole('menuitem', { name: 'Customize this page' })).toBeDefined();
    expect(view.getByRole('menuitem', { name: 'Customize layout' })).toBeDefined();
    fireEvent.click(view.getByRole('menuitem', { name: 'Customize appearance' }));
    expect(view.getByRole('heading', { name: 'Customize record page' })).toBeDefined();
    fireEvent.change(view.getByRole('textbox', { name: 'Record page icon' }), {
      target: { value: '🧭' },
    });
    fireEvent.change(view.getByRole('textbox', { name: 'Record page cover' }), {
      target: { value: 'assets/record-cover.png' },
    });
    fireEvent.click(view.getByRole('button', { name: 'Save appearance' }));
    await waitFor(() => {
      const nextSource = recordProvider.document.getText('source').toString();
      expect(nextSource).toContain('icon: 🧭');
      expect(nextSource).toContain('cover: assets/record-cover.png');
    });
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

    openPageMenu();
    fireEvent.click(view.getByRole('menuitem', { name: 'Customize layout' }));
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
    expect(confirmations[2]).toContain('Apply this page layout');

    openPageMenu();
    fireEvent.click(view.getByRole('menuitem', { name: 'Customize this page' }));
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

  test('mirrors row duplicate, archive, move, and delete actions from the page menu', async () => {
    const desiredStates: DatabaseDesiredStateDraftInput[] = [];
    const services: DatabaseRecordPageServices = {
      describe: async () => ({
        manifestRevision: hash,
        schemaRevision: hash,
        database: databaseWithMove,
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
          values: { prop_title: 'Canonical title' },
        },
      }),
      executeMutation: (async (input) => {
        desiredStates.push(input.desiredState);
        const plan = {
          id: `plan_record_action_${String(desiredStates.length)}`,
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
      confirm: () => true,
    };
    const view = render(
      <TooltipProvider>
        <PropertyProvider>
          <DatabaseRecordPageChrome
            provider={provider()}
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

    const openActions = () => {
      const trigger = view.getByRole('button', { name: 'More page actions' });
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.click(trigger);
    };
    openActions();
    expect(view.getByRole('menuitem', { name: 'Duplicate page' })).toBeDefined();
    expect(view.getByRole('menuitem', { name: 'Archive page' })).toBeDefined();
    expect(view.getByRole('menuitem', { name: 'Move page' })).toBeDefined();
    expect(view.getByRole('menuitem', { name: 'Delete page' })).toBeDefined();
    fireEvent.click(view.getByRole('menuitem', { name: 'Duplicate page' }));
    await waitFor(() => expect(desiredStates).toHaveLength(1));
    expect(desiredStates[0]?.recordCopies?.[0]).toMatchObject({
      id: 'rec_first',
      expectedRevision: hash,
      sourceKey: 'tasks',
    });

    openActions();
    fireEvent.click(view.getByRole('menuitem', { name: 'Archive page' }));
    await waitFor(() => expect(desiredStates).toHaveLength(2));
    expect(desiredStates[1]?.recordArchives?.[0]).toMatchObject({
      id: 'rec_first',
      expectedRevision: hash,
      action: 'archive',
    });

    openActions();
    fireEvent.click(view.getByRole('menuitem', { name: 'Move page' }));
    fireEvent.click(await view.findByRole('combobox', { name: 'Move target source' }));
    fireEvent.click(await view.findByRole('option', { name: /Archive/ }));
    fireEvent.click(view.getByRole('button', { name: 'Plan move' }));
    await waitFor(() => expect(desiredStates).toHaveLength(3));
    expect(desiredStates[2]?.recordMoves?.[0]).toMatchObject({
      id: 'rec_first',
      expectedRevision: hash,
      sourceKey: 'tasks',
      targetSourceKey: 'archive',
    });

    openActions();
    fireEvent.click(view.getByRole('menuitem', { name: 'Delete page' }));
    await waitFor(() => expect(desiredStates).toHaveLength(4));
    expect(desiredStates[3]?.recordDeletions?.[0]).toMatchObject({
      id: 'rec_first',
      expectedRevision: hash,
      sourceKey: 'tasks',
    });
  });

  test('opens relation property targets as canonical pages without a database dialog', async () => {
    const relationProvider = new HocuspocusProvider({ url: DUMMY_WS, name: 'records/rec_first' });
    relationProvider.document
      .getText('source')
      .insert(
        0,
        '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_first\ntitle: Canonical title\nproject: rec_project\n---\nBody\n',
      );
    providers.push(relationProvider);
    const services: DatabaseRecordPageServices = {
      describe: async () => ({
        manifestRevision: hash,
        schemaRevision: hash,
        database: databaseWithRelation,
        source: relationSource,
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
      fetchRecord: (async ({ sourceId }) => ({
        databaseId: 'db_tasks',
        sourceId,
        manifestRevision: hash,
        indexRevision: hash,
        record:
          sourceId === 'ds_projects'
            ? {
                id: 'rec_project',
                path: 'projects/roadmap.md',
                revision: hash,
                values: { prop_project_title: 'Roadmap' },
              }
            : {
                id: 'rec_first',
                path: 'records/rec_first.md',
                revision: hash,
                values: { prop_title: 'Canonical title', prop_project: 'rec_project' },
              },
      })) as DatabaseRecordPageServices['fetchRecord'],
      executeMutation: (async () => ({ status: 'review_declined' })) as never,
      confirm: () => true,
    };
    const view = render(
      <TooltipProvider>
        <PropertyProvider>
          <DatabaseRecordPageChrome
            provider={relationProvider}
            docName="records/rec_first"
            docExt=".md"
            fallbackTitle="rec_first"
            services={services}
          />
        </PropertyProvider>
      </TooltipProvider>,
    );

    const relationLink = await view.findByRole('link', { name: 'Roadmap' });
    expect(relationLink.getAttribute('href')).toBe('#/projects/roadmap');
    expect(relationLink.getAttribute('data-record-id')).toBe('rec_project');
    expect(
      view.container.querySelector('[data-database-relation-value][data-key="project"]'),
    ).not.toBeNull();
    expect(view.queryByRole('dialog')).toBeNull();
  });

  test('renders an explicit missing record state with a safe database back action', async () => {
    const services: DatabaseRecordPageServices = {
      describe: async () => {
        throw new DatabaseCatalogClientError('The record source no longer exists', 404);
      },
      fetchRecord: async () => {
        throw new DatabaseQueryClientError('The record no longer exists', { status: 404 });
      },
      executeMutation: (async () => ({ status: 'review_declined' })) as never,
      confirm: () => true,
    };
    const view = render(
      <TooltipProvider>
        <PropertyProvider>
          <DatabaseRecordPageChrome
            provider={provider()}
            docName="records/rec_first"
            docExt=".md"
            fallbackTitle="rec_first"
            body={<div data-testid="record-body-editor">Record body</div>}
            services={services}
          />
        </PropertyProvider>
      </TooltipProvider>,
    );

    const notice = await view.findByRole('alert');
    expect(notice.getAttribute('data-database-record-state')).toBe('missing');
    expect(view.getByRole('button', { name: 'Back to database view' })).toBeDefined();
    expect(view.queryByTestId('record-body-editor')).toBeNull();
  });

  test('renders permission denial without exposing record content or a retry action', async () => {
    const services: DatabaseRecordPageServices = {
      describe: async () => {
        throw new DatabaseCatalogClientError('This record is restricted', 403);
      },
      fetchRecord: async () => {
        throw new DatabaseQueryClientError('This record is restricted', { status: 403 });
      },
      executeMutation: (async () => ({ status: 'review_declined' })) as never,
      confirm: () => true,
    };
    const view = render(
      <TooltipProvider>
        <PropertyProvider>
          <DatabaseRecordPageChrome
            provider={provider()}
            docName="records/rec_first"
            docExt=".md"
            fallbackTitle="rec_first"
            body={<div data-testid="record-body-editor">Record body</div>}
            services={services}
          />
        </PropertyProvider>
      </TooltipProvider>,
    );

    const notice = await view.findByRole('alert');
    expect(notice.getAttribute('data-database-record-state')).toBe('permission');
    expect(view.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(view.queryByTestId('record-body-editor')).toBeNull();
  });

  test('marks archived records and exposes Restore instead of Archive', async () => {
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
          archivedAt: '2026-07-20T01:02:03.000Z',
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
            docName="records/rec_first"
            docExt=".md"
            fallbackTitle="rec_first"
            services={services}
          />
        </PropertyProvider>
      </TooltipProvider>,
    );

    expect(await view.findByText(/This page is archived/)).toBeDefined();
    const actions = view.getByRole('button', { name: 'More page actions' });
    fireEvent.pointerDown(actions, { button: 0 });
    fireEvent.click(actions);
    expect(await view.findByRole('menuitem', { name: 'Restore page' })).toBeDefined();
    expect(view.queryByRole('menuitem', { name: 'Archive page' })).toBeNull();
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
    expect(view.getByRole('button', { name: 'Previous page' }).hasAttribute('disabled')).toBe(
      false,
    );
    expect(view.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(view.getByRole('button', { name: 'Next page' }));
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
