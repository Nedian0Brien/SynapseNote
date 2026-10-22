import { afterEach, describe, expect, test } from 'bun:test';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { PageHeaderRenameRequest } from '@/lib/page-header-rename-events';
import { subscribeToPageHeaderRename } from '@/lib/page-header-rename-events';
import { PageHeader } from './PageHeader';

const DUMMY_WS = 'ws://localhost:1/collab';
const providers: HocuspocusProvider[] = [];
const unsubscribers: Array<() => void> = [];

function makeProvider(): HocuspocusProvider {
  const provider = new HocuspocusProvider({ url: DUMMY_WS, name: 'notes/old' });
  providers.push(provider);
  return provider;
}

afterEach(() => {
  cleanup();
  while (unsubscribers.length > 0) unsubscribers.pop()?.();
  while (providers.length > 0) providers.pop()?.destroy();
});

describe('PageHeader inline filename editing', () => {
  test('clicking the title edits and submits the extensionless filename', async () => {
    let received: PageHeaderRenameRequest | null = null;
    unsubscribers.push(
      subscribeToPageHeaderRename(async (request) => {
        received = request;
        return { ok: true };
      }),
    );
    const view = render(
      <PageHeader
        provider={makeProvider()}
        docName="notes/old"
        docExt=".mdx"
        fallbackTitle="old"
      />,
    );

    const title = view.getByTestId('page-header-title');
    act(() => title.focus());
    expect(document.activeElement).toBe(title);

    title.textContent = 'new title';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Enter' });

    await waitFor(() =>
      expect(received).toEqual({
        docName: 'notes/old',
        docExt: '.mdx',
        nextTitle: 'new title',
      }),
    );
    expect(view.getByTestId('page-header-title').textContent).toBe('new title');
  });

  test('Escape cancels without dispatching a rename', () => {
    let requests = 0;
    unsubscribers.push(
      subscribeToPageHeaderRename(async () => {
        requests += 1;
        return { ok: true };
      }),
    );
    const view = render(
      <PageHeader provider={makeProvider()} docName="notes/old" docExt=".md" fallbackTitle="old" />,
    );

    const title = view.getByTestId('page-header-title');
    act(() => title.focus());
    title.textContent = 'discard me';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Escape' });

    expect(requests).toBe(0);
    expect(view.getByTestId('page-header-title').textContent).toBe('old');
  });

  test('database titles use the verified commit callback and never dispatch a file rename', async () => {
    let renameRequests = 0;
    let committedTitle: string | null = null;
    unsubscribers.push(
      subscribeToPageHeaderRename(async () => {
        renameRequests += 1;
        return { ok: true };
      }),
    );
    const view = render(
      <PageHeader
        provider={makeProvider()}
        docName="records/rec_first"
        docExt=".md"
        fallbackTitle="rec_first"
        databaseTitle="Canonical title"
        onDatabaseTitleCommit={async (nextTitle) => {
          committedTitle = nextTitle;
          return { ok: true };
        }}
      />,
    );

    const title = view.getByTestId('page-header-title');
    act(() => title.focus());
    title.textContent = 'Updated title';
    fireEvent.input(title);
    fireEvent.keyDown(title, { key: 'Enter' });

    await waitFor(() => expect(committedTitle).toBe('Updated title'));
    expect(renameRequests).toBe(0);
    expect(title.textContent).toBe('Updated title');
  });
});
