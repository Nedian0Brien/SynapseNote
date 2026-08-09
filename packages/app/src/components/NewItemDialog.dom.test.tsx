import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

let singleFileMode = false;

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('@/components/PageListContext', () => ({
  usePageList: () => ({
    addPage: mock(() => {}),
  }),
  // Nullable variant of the hook above — see the DocumentContext note; an
  // omitted re-export fails the whole file at load, not just this query.
  useOptionalPageList: () => ({
    addPage: mock(() => {}),
  }),
}));

mock.module('@/hooks/use-folder-config', () => ({
  useFolderConfig: () => ({
    state: {
      status: 'ready',
      data: { folder: { templates_available: [] } },
    },
  }),
}));

mock.module('@/lib/single-file-mode', () => ({
  useSingleFileMode: () => singleFileMode,
}));

describe('NewItemDialog database entry point', () => {
  afterEach(() => {
    cleanup();
    singleFileMode = false;
  });

  test('offers Database as a first-class normal new-page type', async () => {
    const commands: string[] = [];
    const listener = (event: Event) => {
      commands.push(String((event as CustomEvent<string>).detail));
    };
    window.addEventListener('synapsenote:database-slash-command', listener);
    try {
      const { NewItemDialog } = await import('./NewItemDialog');
      const onOpenChange = mock(() => {});
      render(<NewItemDialog open onOpenChange={onOpenChange} kind="file" initialDir="" />);

      expect(screen.getByRole('group', { name: 'New page type' })).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Page' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      const databaseButton = screen.getByRole('button', { name: 'Database' });
      expect(databaseButton.getAttribute('type')).toBe('button');
      expect(databaseButton.getAttribute('data-testid')).toBe('new-item-dialog-new-database');
      fireEvent.click(databaseButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(commands).toEqual(['new']);
    } finally {
      window.removeEventListener('synapsenote:database-slash-command', listener);
    }
  });

  test('hides the database choice in single-file mode', async () => {
    singleFileMode = true;
    const { NewItemDialog } = await import('./NewItemDialog');
    render(<NewItemDialog open onOpenChange={() => {}} kind="file" initialDir="" />);

    expect(screen.queryByTestId('new-item-dialog-new-database')).toBeNull();
  });
});
