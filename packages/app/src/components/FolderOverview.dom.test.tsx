import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

const pages = new Set(['notes/alpha', 'notes/beta', 'notes/archive/old']);
const pageTitles = new Map([
  ['notes/index', 'Notes'],
  ['notes/alpha', 'Alpha Plan'],
  ['notes/beta', 'Beta Research'],
]);
const pageMeta = new Map([
  ['notes/alpha', { size: 900, modified: '2026-08-07T00:00:00.000Z' }],
  ['notes/beta', { size: 2_000, modified: '2026-08-08T00:00:00.000Z' }],
]);

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
      renderLinguiTemplate(strings, ...values),
  }),
}));

mock.module('@/components/PageListContext', () => ({
  usePageList: () => ({
    pages,
    pageTitles,
    pageMeta,
    folderPaths: new Set(['notes/archive']),
    loading: false,
  }),
}));

const folderConfigHandle = {
  state: {
    status: 'ready' as const,
    data: {
      folder: {
        path: 'notes',
        type: 'directory' as const,
        description: 'A place for working ideas',
        directMdCount: 2,
        recursiveMdCount: 3,
        childDirCount: 1,
        truncated: false,
        templates_available: [],
      },
      frontmatterLocal: null,
    },
  },
  refresh: mock(() => {}),
};

mock.module('@/hooks/use-folder-config', () => ({
  useFolderConfig: () => folderConfigHandle,
}));

mock.module('@/components/FolderDocumentCard', () => ({
  FolderDocumentCard: ({
    entry,
    mode,
  }: {
    entry: { path: string; title: string };
    mode: string;
  }) => (
    <a href={`#/${entry.path}`} data-folder-document-card={entry.path} data-mode={mode}>
      {entry.title}
    </a>
  ),
  FolderMarkdownPreview: ({ markdown }: { markdown: string }) => <span>{markdown}</span>,
  useFolderDocumentPreview: () => ({ status: 'ready', markdown: 'A concise document summary' }),
}));

mock.module('@/components/FolderPropertiesCard', () => ({
  FolderPropertiesCard: () => <section>Folder properties panel</section>,
}));
mock.module('@/components/TemplatesCard', () => ({
  TemplatesCard: () => <section>Templates panel</section>,
}));
mock.module('@/components/FolderTimelineCard', () => ({
  FolderTimelineCard: () => <section>Activity panel</section>,
}));
mock.module('@/components/NewItemDialog', () => ({
  NewItemDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">New document dialog</div> : null,
}));

async function renderOverview() {
  const { FolderOverview } = await import('./FolderOverview');
  return render(<FolderOverview folderPath="notes" />);
}

describe('FolderOverview Craft gallery behavior', () => {
  beforeEach(() => {
    cleanup();
    window.location.hash = '';
    window.localStorage.clear();
  });

  afterEach(cleanup);

  test('renders the folder description, child folder, and preview cards by default', async () => {
    await renderOverview();

    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy();
    expect(screen.getByText('A place for working ideas')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'archive' })).toBeTruthy();
    expect(document.querySelectorAll('[data-folder-document-card]')).toHaveLength(2);
    expect(
      document
        .querySelector('[data-folder-document-card="notes/alpha"]')
        ?.getAttribute('data-mode'),
    ).toBe('preview');
  });

  test('switches between preview, grid, and list views with working controls', async () => {
    const user = userEvent.setup();
    await renderOverview();

    await user.click(screen.getByRole('radio', { name: 'Grid view' }));
    expect(document.querySelector('[data-folder-document-grid]')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'past-7-days' })).toBeTruthy();
    expect(
      document
        .querySelector('[data-folder-document-card="notes/alpha"]')
        ?.getAttribute('data-mode'),
    ).toBe('grid');

    await user.click(screen.getByRole('radio', { name: 'List view' }));
    expect(document.querySelectorAll('[data-folder-document-card]')).toHaveLength(0);
    expect(document.querySelector('[data-folder-document-list]')).toBeTruthy();
    expect(screen.getByText('Last viewed')).toBeTruthy();
    expect(screen.getByText('Created')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Documents' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Alpha Plan/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Beta Research/ })).toBeTruthy();
  });

  test('filters both documents and child folders by name or path', async () => {
    const user = userEvent.setup();
    await renderOverview();

    await user.click(screen.getByRole('button', { name: 'Search this folder' }));
    const input = screen.getByRole('textbox', { name: 'Search this folder' });
    await user.type(input, 'beta');

    expect(document.querySelector('[data-folder-document-card="notes/beta"]')).toBeTruthy();
    expect(document.querySelector('[data-folder-document-card="notes/alpha"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'archive' })).toBeNull();

    await user.clear(input);
    await user.type(input, 'archive');
    expect(screen.getByRole('link', { name: 'archive' })).toBeTruthy();
    expect(document.querySelectorAll('[data-folder-document-card]')).toHaveLength(0);
  });

  test('records a document as last viewed when it is opened from the list', async () => {
    const user = userEvent.setup();
    await renderOverview();

    await user.click(screen.getByRole('radio', { name: 'List view' }));
    await user.click(screen.getByRole('link', { name: /Alpha Plan/ }));

    const stored = JSON.parse(
      window.localStorage.getItem('synapsenote.folder-document-last-viewed.v1') ?? '{}',
    ) as Record<string, string>;
    expect(stored['notes/alpha']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('opens the new-document dialog and preserves folder management in the details sheet', async () => {
    await renderOverview();

    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    expect(screen.getByRole('dialog', { name: '' }).textContent).toContain('New document dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Folder details' }));
    await waitFor(() => expect(screen.getByText('Folder properties panel')).toBeTruthy());
    expect(screen.getByText('Templates panel')).toBeTruthy();
    expect(screen.getByText('Activity panel')).toBeTruthy();
  });
});
