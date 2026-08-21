/**
 * RTL behavior tests for the folder overview's right-click menu.
 *
 * What matters here is the contract with the rest of the app: which verbs each
 * item kind offers, and that every mutating verb leaves through the shared
 * FileTree bus instead of being reimplemented on this surface. The Radix
 * primitives are replaced with plain-DOM doubles (same pattern as
 * `FileSidebar.dom.test.tsx`) so the assertions read against real menu items.
 *
 * Invocation: `bun run test:dom` from `packages/app/`.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { subscribeToCreateTopLevelFile } from '@/lib/create-file-events';
import {
  subscribeToFileTreeMenuActionDelete,
  subscribeToFileTreeMenuActionDuplicate,
  subscribeToFileTreeMenuActionRename,
} from '@/lib/file-tree-menu-action-events';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

const PassThrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
const MenuButton = ({
  children,
  disabled,
  onSelect,
  ...props
}: {
  children?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  [key: string]: unknown;
}) => (
  <button type="button" role="menuitem" disabled={disabled} onClick={() => onSelect?.()} {...props}>
    {children}
  </button>
);

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
      renderLinguiTemplate(strings, ...values),
  }),
}));

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: PassThrough,
  // `sideOffset` / `align` are Radix positioning props, not DOM attributes —
  // drop them so React doesn't warn about unknown attributes on the double.
  DropdownMenuContent: ({
    children,
    sideOffset: _sideOffset,
    align: _align,
    ...props
  }: {
    children?: ReactNode;
    sideOffset?: number;
    align?: string;
  }) => <div {...props}>{children}</div>,
  DropdownMenuItem: MenuButton,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: PassThrough,
  DropdownMenuSubContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: MenuButton,
  DropdownMenuTrigger: PassThrough,
}));

mock.module('@/components/PageListContext', () => ({
  usePageList: () => ({ pageMeta: new Map([['notes/alpha', { docExt: '.mdx' }]]) }),
}));

mock.module('@/lib/use-workspace', () => ({
  useWorkspace: () => ({ contentDir: '/vault', pathSeparator: '/' }),
}));

mock.module('@/hooks/use-git-sync-status', () => ({
  useGitSyncStatusDetailed: () => ({ status: { hasRemote: false }, fetchError: null }),
}));

mock.module('@/components/handoff/useInstalledAgents', () => ({
  useInstalledAgents: () => ({ states: {} }),
  isElectronHostDefault: () => false,
}));

mock.module('@/components/handoff/useHandoffDispatch', () => ({
  useHandoffDispatch: () => ({ dispatch: async () => ({ ok: true }) }),
  buildHandoffInput: () => null,
  buildFolderHandoffInput: () => null,
}));

mock.module('@/components/handoff/OpenInAgentContextSubmenu', () => ({
  OpenInAgentContextSubmenu: () => <div data-testid="send-to-ai" />,
}));

const clipboardWrites: string[] = [];
mock.module('@/components/path-menu-actions', () => ({
  revealInFileManagerLabel: () => 'Reveal in Finder',
  copyPathToClipboard: async (text: string) => {
    clipboardWrites.push(text);
  },
}));

const { useFolderItemContextMenu } = await import('./folder-item-context-menu');

function Host({
  target,
  title,
}: {
  target: Parameters<typeof useFolderItemContextMenu>[0];
  title: string;
}) {
  const { onContextMenu, menu } = useFolderItemContextMenu(target, title);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: test host stands in for the overview's own card element
    <div data-testid="item" onContextMenu={onContextMenu}>
      {title}
      {menu}
    </div>
  );
}

function openMenu() {
  fireEvent.contextMenu(screen.getByTestId('item'));
}

afterEach(() => {
  cleanup();
  clipboardWrites.length = 0;
});

describe('folder overview item context menu', () => {
  test('stays closed until the item is right-clicked', () => {
    render(<Host target={{ kind: 'file', docName: 'notes/alpha' }} title="Alpha" />);
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
    openMenu();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
  });

  test('anchors under the body so a hover-lifted card cannot displace the menu', () => {
    render(<Host target={{ kind: 'file', docName: 'notes/alpha' }} title="Alpha" />);
    openMenu();

    // The anchor positions itself in viewport coordinates, and `position: fixed`
    // resolves against the nearest transformed ancestor when one exists. The
    // overview's cards lift on hover — the state the pointer is in at
    // right-click — so an anchor left inside the card opened the menu offset by
    // the card's own position. Living under the body is what keeps it honest.
    const menuAnchor = document.querySelector('[data-folder-item-menu-anchor]');
    expect(menuAnchor).toBeTruthy();
    expect(menuAnchor?.parentElement).toBe(document.body);
    expect(screen.getByTestId('item').contains(menuAnchor)).toBe(false);
  });

  test('a file offers duplicate / rename / delete and no folder-only verbs', () => {
    render(<Host target={{ kind: 'file', docName: 'notes/alpha' }} title="Alpha" />);
    openMenu();
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete Alpha' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'New file' })).toBeNull();
  });

  test('a folder offers New file and no duplicate', () => {
    const requests: unknown[] = [];
    const unsubscribe = subscribeToCreateTopLevelFile((request) => requests.push(request));
    try {
      render(<Host target={{ kind: 'folder', folderPath: 'notes/archive' }} title="Archive" />);
      openMenu();
      expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).toBeNull();
      fireEvent.click(screen.getByRole('menuitem', { name: 'New file' }));
    } finally {
      unsubscribe();
    }
    expect(requests).toEqual([{ initialDir: 'notes/archive' }]);
  });

  test('mutating verbs leave through the FileTree bus rather than acting here', () => {
    const renamed: unknown[] = [];
    const duplicated: unknown[] = [];
    const deleted: unknown[] = [];
    const unsubscribers = [
      subscribeToFileTreeMenuActionRename((target) => renamed.push(target)),
      subscribeToFileTreeMenuActionDuplicate((target) => duplicated.push(target)),
      subscribeToFileTreeMenuActionDelete((target) => deleted.push(target)),
    ];
    try {
      render(<Host target={{ kind: 'file', docName: 'notes/alpha' }} title="Alpha" />);
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Alpha' }));
    } finally {
      for (const unsubscribe of unsubscribers) unsubscribe();
    }
    const target = { kind: 'doc', target: 'notes/alpha', docName: 'notes/alpha' };
    expect(renamed).toEqual([target]);
    expect(duplicated).toEqual([target]);
    expect(deleted).toEqual([target]);
  });

  test('copy path uses the document extension from the page list', () => {
    render(<Host target={{ kind: 'file', docName: 'notes/alpha' }} title="Alpha" />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Relative path' }));
    expect(clipboardWrites).toEqual(['notes/alpha.mdx']);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Full path' }));
    expect(clipboardWrites).toEqual(['notes/alpha.mdx', '/vault/notes/alpha.mdx']);
  });

  test('a folder copies its own path, with no extension appended', () => {
    render(<Host target={{ kind: 'folder', folderPath: 'notes/archive' }} title="Archive" />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Relative path' }));
    expect(clipboardWrites).toEqual(['notes/archive']);
  });
});
