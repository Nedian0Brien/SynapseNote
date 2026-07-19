import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';
import { expectVisualClassTokens } from '@/test-utils/visual-contract';

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('./EditorBreadcrumb', () => ({
  EditorBreadcrumb: ({ docName }: { docName: string | null }) => (
    <span data-testid="editor-breadcrumb-probe">{docName}</span>
  ),
}));

// The breadcrumb cell's NotInSidebarIndicator reads merged config through the
// context hook, which throws without a provider — stub the app-default view
// (no toggles set, binding absent) so the toolbar mounts standalone.
mock.module('@/lib/config-provider', () => ({
  useConfigContext: () => ({
    merged: null,
    projectLocalBinding: null,
  }),
}));

describe('EditorToolbar runtime layout', () => {
  afterEach(() => cleanup());

  async function renderToolbar(activeDocName = 'docs/Page.md') {
    const { EditorToolbar } = await import('./EditorToolbar');

    render(
      <TooltipProvider>
        <EditorToolbar
          activeDocName={activeDocName}
          isSourceMode={false}
          sourceDisabled={false}
          onModeChange={() => {}}
          showAddPropertyButton={true}
          onAddProperty={() => {}}
          isPanelCollapsed={false}
          onTogglePanel={() => {}}
        />
      </TooltipProvider>,
    );
  }

  test('toolbar overlay lets editor clicks pass through except the two visible rows', async () => {
    await renderToolbar();

    const toolbar = screen.getByTestId('editor-toolbar');
    expectVisualClassTokens(toolbar.className, ['pointer-events-none']);
    expectVisualClassTokens(screen.getByTestId('document-viewer-header').className, [
      'pointer-events-auto',
    ]);
    expectVisualClassTokens(screen.getByTestId('markdown-format-toolbar').className, [
      'pointer-events-auto',
    ]);
  });

  test('renders the shared identity row and the Markdown contextual toolbar', async () => {
    await renderToolbar();

    const header = screen.getByTestId('document-viewer-header');
    expect(header.getAttribute('data-file-type')).toBe('md');
    expect(header.textContent).toContain('Page');
    expect(header.textContent).toContain('MD');
    expect(screen.getByRole('toolbar', { name: 'Markdown formatting' })).toBeTruthy();
  });

  test('mode toggle sits in the Markdown tool row so the identity row keeps its width', async () => {
    await renderToolbar();

    const sourceButton = screen.getByRole('radio', { name: 'Markdown source' });
    expect(screen.getByTestId('markdown-format-toolbar').contains(sourceButton)).toBe(true);
    expect(screen.getByTestId('document-viewer-header').contains(sourceButton)).toBe(false);
  });

  test('a tree-hidden doc gets the not-in-sidebar indicator beside the breadcrumb', async () => {
    await renderToolbar('.scratch/hidden-note');

    const indicator = screen.getByTestId('not-in-sidebar-indicator');
    expect(screen.getByTestId('document-viewer-header').contains(indicator)).toBe(true);
  });

  test('a doc with a visible tree row renders no indicator', async () => {
    await renderToolbar();

    expect(screen.queryByTestId('not-in-sidebar-indicator')).toBeNull();
  });
});
