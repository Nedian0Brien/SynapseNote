import { afterEach, describe, expect, mock, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabaseRecordPeek } from './DatabaseRecordPeek';

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  sessionStorage.removeItem('synapsenote:database-record-navigation-v1');
  localStorage.removeItem('synapsenote:database-side-peek-width-v1');
});
const originalFetch = globalThis.fetch;
const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_work',
  key: 'work',
  name: 'Work',
  contract: {
    purpose: 'Track work',
    canonicality: 'canonical',
    vocabulary: ['work'],
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
          id: 'prop_project',
          key: 'project',
          name: 'Project',
          type: 'relation',
          targetSourceId: 'ds_projects',
          cardinality: 'one',
        },
      ],
    },
    {
      id: 'ds_projects',
      key: 'projects',
      name: 'Projects',
      recordMeaning: 'One project',
      folder: 'projects',
      properties: [
        {
          id: 'prop_project_title',
          key: 'title',
          name: 'Title',
          type: 'title',
        },
      ],
    },
  ],
});
const source = database.sources[0];
if (!source) throw new Error('expected source');
const emptyComments = (recordId = 'rec_first') => ({
  revision: `sha256:${'0'.repeat(64)}`,
  document: {
    version: 1,
    databaseId: database.id,
    recordId,
    threads: [],
  },
});

describe('DatabaseRecordPeek context parity', () => {
  test('uploads and persists a comment attachment from the inline composer', async () => {
    const commentRequests: unknown[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/upload') {
        expect(init?.body).toBeInstanceOf(FormData);
        return Response.json({
          src: 'comment-note.txt',
          path: 'attachments/comment-note.txt',
          deduped: false,
        });
      }
      if (url === '/api/databases/comments') {
        const request = JSON.parse(String(init?.body)) as {
          action: string;
          body?: string;
          attachments?: unknown[];
        };
        commentRequests.push(request);
        if (request.action === 'add_thread') {
          return Response.json({
            revision: `sha256:${'b'.repeat(64)}`,
            document: {
              version: 1,
              databaseId: database.id,
              recordId: 'rec_first',
              threads: [
                {
                  id: 'cth_attachment',
                  anchor: { type: 'page' },
                  comments: [
                    {
                      id: 'cmt_attachment',
                      author: { kind: 'human', principal_id: 'user:local' },
                      body: request.body,
                      attachments: request.attachments,
                      mentionedPersonIds: [],
                      createdAt: '2026-07-26T04:00:00.000Z',
                    },
                  ],
                },
              ],
            },
          });
        }
        return Response.json(emptyComments());
      }
      if (url.startsWith('/api/backlinks')) {
        return Response.json({ docName: 'tasks/first', backlinks: [] });
      }
      return Response.json({ docName: 'tasks/first', lifecycle: null, content: '---\n---\n' });
    }) as typeof fetch;

    render(
      <DatabaseRecordPeek
        mode="side_peek"
        database={database}
        source={source}
        record={{
          id: 'rec_first',
          path: 'tasks/first.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'First' },
        }}
        onClose={() => {}}
        onOpenFull={() => {}}
      />,
    );

    const composer = await screen.findByRole('textbox', { name: 'Add comment' });
    const picker = screen.getByLabelText('Choose comment attachments') as HTMLInputElement;
    const openPicker = mock(() => {});
    picker.click = openPicker;
    fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
    expect(openPicker).toHaveBeenCalledTimes(1);
    fireEvent.change(picker, {
      target: {
        files: [new File(['attachment body'], 'comment-note.txt', { type: 'text/plain' })],
      },
    });
    await screen.findByText('comment-note.txt');
    fireEvent.change(composer, { target: { value: 'See attachment.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() =>
      expect(commentRequests.at(-1)).toMatchObject({
        action: 'add_thread',
        body: 'See attachment.',
        attachments: [
          { kind: 'local', path: 'attachments/comment-note.txt', name: 'comment-note.txt' },
        ],
      }),
    );
    expect(await screen.findByRole('link', { name: 'comment-note.txt' })).toBeDefined();
  });

  test('renders a half-screen Notion-style page flow with empty properties and select tags', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/backlinks')) {
        return Response.json({ docName: 'tasks/first', backlinks: [] });
      }
      if (url === '/api/databases/comments') return Response.json(emptyComments());
      return Response.json({
        docName: 'tasks/first',
        lifecycle: null,
        content: '---\n---\n',
      });
    }) as typeof fetch;
    const notionDatabase = DatabaseDefinitionSchema.parse({
      ...database,
      sources: [
        {
          ...source,
          properties: [
            ...source.properties,
            { id: 'prop_due', key: 'due', name: 'Due', type: 'date' },
            {
              id: 'prop_tags',
              key: 'tags',
              name: 'Tags',
              type: 'multi_select',
              options: [
                {
                  id: 'opt_design',
                  key: 'design',
                  name: 'Design',
                  color: 'purple',
                },
                {
                  id: 'opt_review',
                  key: 'review',
                  name: 'Review',
                  color: 'yellow',
                },
              ],
            },
          ],
        },
        database.sources[1],
      ],
    });
    const notionSource = notionDatabase.sources[0];
    if (!notionSource) throw new Error('expected notion source');
    const onClose = mock(() => {});
    const onOpenFull = mock(() => {});

    render(
      <DatabaseRecordPeek
        mode="side_peek"
        database={notionDatabase}
        source={notionSource}
        record={{
          id: 'rec_first',
          path: 'tasks/first.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: {
            prop_title: 'First',
            prop_project: 'rec_project',
            prop_tags: ['opt_design', 'opt_review'],
          },
        }}
        notionSurface
        onClose={onClose}
        onOpenFull={onOpenFull}
      />,
    );

    const emptyBody = await screen.findByText('Press Enter to start writing on this page.');
    expect(document.querySelector('[data-database-side-peek]')).not.toBeNull();
    expect(document.querySelector('[data-database-peek-toolbar]')).not.toBeNull();
    expect(screen.getByTestId('open-in-agent-trigger')).toBeDefined();
    expect(screen.getByText('Design')).toBeDefined();
    expect(screen.getByText('Review')).toBeDefined();
    expect(
      document.querySelector('[data-database-peek-property="prop_due"]')?.textContent,
    ).toContain('Empty');
    const commentComposer = await screen.findByRole('textbox', { name: 'Add comment' });
    expect(commentComposer).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mention a person' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: /Backlinks/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    expect(document.activeElement).toBe(commentComposer);

    fireEvent.click(screen.getByRole('button', { name: 'Add a property' }));
    expect(await screen.findByRole('textbox', { name: 'New property name' })).toBeDefined();
    expect(onOpenFull).not.toHaveBeenCalled();

    fireEvent.click(emptyBody);
    expect(onOpenFull).not.toHaveBeenCalled();

    const sidePeek = document.querySelector<HTMLElement>('[data-database-side-peek]');
    const resizeHandle = screen.getByRole('separator', { name: 'Resize page preview' });
    const initialWidth = Number.parseFloat(sidePeek?.style.width ?? '0');
    fireEvent.pointerDown(resizeHandle, { button: 0, clientX: window.innerWidth - initialWidth });
    fireEvent.pointerMove(window, { clientX: window.innerWidth - initialWidth - 80 });
    fireEvent.pointerUp(window);
    expect(Number.parseFloat(sidePeek?.style.width ?? '0')).toBeGreaterThan(initialWidth);
    expect(resizeHandle.getAttribute('aria-valuenow')).toBe(
      String(Math.round(Number.parseFloat(sidePeek?.style.width ?? '0'))),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close page preview' }));
    expect(onClose).toHaveBeenCalledWith('explicit');
  });

  test('uses canonical icon, cover, body, backlinks, comments, history, and relations', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/backlinks')) {
        return Response.json({
          docName: 'tasks/first',
          backlinks: [
            {
              source: 'notes/context',
              anchor: 'decision',
              title: 'Context',
              snippet: null,
            },
          ],
        });
      }
      if (url === '/api/databases/comments') return Response.json(emptyComments());
      return Response.json({
        docName: 'tasks/first',
        lifecycle: null,
        content: '---\nicon: "📚"\ncover: assets/cover.png\n---\nCanonical body\n',
      });
    }) as typeof fetch;
    render(
      <DatabaseRecordPeek
        mode="center_peek"
        database={database}
        source={source}
        record={{
          id: 'rec_first',
          path: 'tasks/first.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'First', prop_project: 'rec_project' },
        }}
        onClose={() => {}}
        onOpenFull={() => {}}
      />,
    );
    await screen.findByText('Canonical body');
    expect(screen.getByRole('dialog', { name: 'Database record' })).toBeTruthy();
    expect(
      document.querySelector(
        '[data-database-record-page-surface][data-record-page-mode="center_peek"]',
      ),
    ).not.toBeNull();
    expect(screen.getByLabelText('Database breadcrumbs')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Ask agent' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Work' }).getAttribute('href')).toBe(
      '#database/db_work/ds_tasks',
    );
    expect(screen.getByText('📚')).toBeDefined();
    expect(document.querySelector('img[src*="cover.png"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Comments' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'History' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Relations' })).toBeDefined();
    await waitFor(() => expect(screen.getByText('notes/context')).toBeDefined());
    expect(screen.getByRole('link', { name: 'notes/context' }).getAttribute('href')).toBe(
      '#/notes/context#decision',
    );
  });

  test('shows the originating view breadcrumb action when navigation context is available', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/backlinks')) {
        return Response.json({ docName: 'tasks/first', backlinks: [] });
      }
      if (url === '/api/databases/comments') return Response.json(emptyComments());
      return Response.json({
        docName: 'tasks/first',
        lifecycle: null,
        content: '---\n---\nFirst body\n',
      });
    }) as typeof fetch;
    sessionStorage.setItem(
      'synapsenote:database-record-navigation-v1',
      JSON.stringify({
        databaseId: 'db_work',
        sourceId: 'ds_tasks',
        viewId: 'view_table',
        paths: ['tasks/first.md'],
        index: 0,
      }),
    );
    render(
      <DatabaseRecordPeek
        mode="side_peek"
        database={database}
        source={source}
        record={{
          id: 'rec_first',
          path: 'tasks/first.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'First' },
        }}
        onClose={() => {}}
        onOpenFull={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('First body')).toBeDefined());
    expect(screen.queryByText('Back to database view')).toBeNull();
    expect(screen.queryByText('Open full page')).toBeNull();
    expect(screen.queryByText('Advanced machine IDs')).toBeNull();
    expect(screen.getByRole('link', { name: 'Work' }).getAttribute('href')).toBe(
      '#database/db_work/ds_tasks/view_table',
    );
  });

  test('posts comments from the inline composer without opening another dialog', async () => {
    const commentRequests: Record<string, unknown>[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/backlinks')) {
        return Response.json({ docName: 'tasks/first', backlinks: [] });
      }
      if (url === '/api/databases/comments') {
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
        commentRequests.push(request);
        if (request.action === 'read') return Response.json(emptyComments());
        return Response.json({
          revision: `sha256:${'1'.repeat(64)}`,
          document: {
            ...emptyComments().document,
            threads: [
              {
                id: 'cth_first',
                anchor: { type: 'page' },
                comments: [
                  {
                    id: 'cmt_first',
                    author: request.actor,
                    body: request.body,
                    mentionedPersonIds: [],
                    createdAt: '2026-07-26T04:00:00.000Z',
                  },
                ],
              },
            ],
          },
        });
      }
      return Response.json({
        docName: 'tasks/first',
        lifecycle: null,
        content: '---\n---\n',
      });
    }) as typeof fetch;
    const onOpenFull = mock(() => {});
    render(
      <DatabaseRecordPeek
        mode="side_peek"
        database={database}
        source={source}
        record={{
          id: 'rec_first',
          path: 'tasks/first.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'First' },
        }}
        onClose={() => {}}
        onOpenFull={onOpenFull}
      />,
    );

    const composer = await screen.findByRole('textbox', { name: 'Add comment' });
    fireEvent.change(composer, { target: { value: 'Inline comment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }));
    await screen.findByText('Inline comment');
    expect(commentRequests.at(-1)).toMatchObject({
      action: 'add_thread',
      anchor: { type: 'page' },
      body: 'Inline comment',
    });
    expect(screen.queryByRole('dialog', { name: 'Comments' })).toBeNull();
    expect(onOpenFull).not.toHaveBeenCalled();
  });

  test('keeps previous and next navigation inside the originating view order', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/backlinks')) {
        return Response.json({ docName: 'tasks/second', backlinks: [] });
      }
      if (url === '/api/databases/comments') return Response.json(emptyComments('rec_second'));
      return Response.json({
        docName: 'tasks/second',
        lifecycle: null,
        content: '---\n---\nSecond body\n',
      });
    }) as typeof fetch;
    sessionStorage.setItem(
      'synapsenote:database-record-navigation-v1',
      JSON.stringify({
        databaseId: 'db_work',
        sourceId: 'ds_tasks',
        viewId: 'view_table',
        paths: ['tasks/first.md', 'tasks/second.md', 'tasks/third.md'],
        index: 1,
      }),
    );
    const onNavigateRecord = mock((path: string) => path);
    render(
      <DatabaseRecordPeek
        mode="center_peek"
        database={database}
        source={source}
        record={{
          id: 'rec_second',
          path: 'tasks/second.md',
          revision: `sha256:${'b'.repeat(64)}`,
          values: { prop_title: 'Second' },
        }}
        onClose={() => {}}
        onOpenFull={() => {}}
        onNavigateRecord={onNavigateRecord}
      />,
    );
    await waitFor(() => expect(screen.getByText('Second body')).toBeDefined());
    expect(screen.getByRole('button', { name: 'Previous record' }).hasAttribute('disabled')).toBe(
      false,
    );
    expect(screen.getByRole('button', { name: 'Next record' }).hasAttribute('disabled')).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous record' }));
    expect(onNavigateRecord).toHaveBeenCalledWith('tasks/first.md');
    expect(
      JSON.parse(sessionStorage.getItem('synapsenote:database-record-navigation-v1') ?? '{}'),
    ).toMatchObject({ index: 0 });
  });
});
