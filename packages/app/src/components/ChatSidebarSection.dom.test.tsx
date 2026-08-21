import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { terminalCliId, UNIFIED_AGENT_KEY } from '@/lib/unified-agent-store';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';
import { TerminalLaunchProvider } from './handoff/TerminalLaunchContext';
import { subscribeToTerminalLaunchRequests } from './handoff/terminal-launch-events';

const clipboardWrite = mock(async (_text: string) => {});

function PassThrough({
  children,
  asChild: _asChild,
  ...props
}: {
  children?: ReactNode;
  asChild?: boolean;
  [key: string]: unknown;
}) {
  return <div {...props}>{children}</div>;
}

function Button({
  children,
  asChild: _asChild,
  ...props
}: {
  children?: ReactNode;
  asChild?: boolean;
  [key: string]: unknown;
}) {
  return (
    <button type="button" {...props}>
      {children}
    </button>
  );
}

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

mock.module('@/components/ui/sidebar', () => ({
  SidebarGroup: PassThrough,
  SidebarGroupAction: Button,
  SidebarGroupContent: PassThrough,
  SidebarGroupLabel: PassThrough,
  SidebarMenu: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <ul {...props}>{children}</ul>
  ),
  SidebarMenuButton: Button,
  SidebarMenuItem: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <li {...props}>{children}</li>
  ),
}));

mock.module('@/components/ui/button', () => ({
  Button,
}));

describe('ChatSidebarSection', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    clipboardWrite.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
  });

  afterEach(cleanup);

  test('lists project chats and launches fresh or resumed conversations', async () => {
    const bridge = {
      terminal: {
        listChatSessions: mock(() =>
          Promise.resolve([
            {
              cli: 'codex' as const,
              sessionId: 'codex-session',
              title: 'Fix graph labels',
              updatedAt: 2,
            },
            {
              cli: 'claude' as const,
              sessionId: 'claude-session',
              title: 'Review database flow',
              updatedAt: 1,
            },
          ]),
        ),
      },
    } as unknown as OkDesktopBridge;
    window.localStorage.setItem(UNIFIED_AGENT_KEY, terminalCliId('codex'));
    const launches: unknown[] = [];
    const unsubscribe = subscribeToTerminalLaunchRequests((prompt, cli, options) => {
      launches.push({ prompt, cli, options });
    });

    const { ChatSidebarSection } = await import('./ChatSidebarSection');
    render(
      <TerminalLaunchProvider
        value={{ launchInTerminal: () => {}, installedClis: { codex: true } }}
      >
        <ChatSidebarSection bridge={bridge} />
      </TerminalLaunchProvider>,
    );

    await waitFor(() => expect(screen.getByText('Fix graph labels')).toBeTruthy());
    expect(screen.getByText('Review database flow')).toBeTruthy();

    // Each row wears its provider's mark, not one shared robot.
    const codexRow = screen.getByRole('button', { name: 'Open Codex chat Fix graph labels' });
    const claudeRow = screen.getByRole('button', { name: 'Open Claude chat Review database flow' });
    expect(codexRow.querySelector('svg')?.getAttribute('aria-label')).toBe('Codex icon');
    expect(claudeRow.querySelector('svg')?.getAttribute('aria-label')).toBe('Claude icon');
    // Brand-colored, and the color rides on the custom property so the row's
    // hover/active `color` cascade cannot repaint the mark.
    expect(claudeRow.querySelector('svg')?.getAttribute('style')).toContain('#D97757');
    expect(codexRow.querySelector('svg')?.getAttribute('style')).toContain('--ok-brand-color');
    // The provider stays spelled out beside the mark.
    expect(codexRow.textContent).toContain('codex');
    expect(claudeRow.textContent).toContain('claude');

    fireEvent.click(screen.getByRole('button', { name: 'Open Codex chat Fix graph labels' }));
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(launches).toEqual([
      {
        prompt: null,
        cli: 'codex',
        options: { resumeSessionId: 'codex-session', surface: 'main' },
      },
      { prompt: null, cli: 'codex', options: { surface: 'main' } },
    ]);
    unsubscribe();
  });

  test('opens a main-pane chat from the empty web fallback', async () => {
    const launches: unknown[] = [];
    const unsubscribe = subscribeToTerminalLaunchRequests((prompt, cli, options) => {
      launches.push({ prompt, cli, options });
    });
    const { ChatSidebarSection } = await import('./ChatSidebarSection');
    render(
      <TerminalLaunchProvider value={null}>
        <ChatSidebarSection />
      </TerminalLaunchProvider>,
    );

    expect(screen.getByTestId('chat-sidebar-section')).toBeTruthy();
    expect(screen.getByText('No chats yet.')).toBeTruthy();
    const newChat = screen.getByRole('button', { name: 'New chat' });
    expect(newChat.getAttribute('disabled')).toBeNull();
    fireEvent.click(newChat);
    expect(launches).toEqual([{ prompt: null, cli: 'claude', options: { surface: 'main' } }]);
    unsubscribe();
  });

  test('resizes the chat pane from the seam handle and remembers the height', async () => {
    const bridge = {
      terminal: {
        listChatSessions: mock(() =>
          Promise.resolve([
            {
              cli: 'codex' as const,
              sessionId: 'codex-session',
              title: 'Fix graph labels',
              updatedAt: 2,
            },
          ]),
        ),
      },
    } as unknown as OkDesktopBridge;
    const { ChatSidebarSection } = await import('./ChatSidebarSection');
    const { CHAT_PANE_HEIGHT_STORAGE_KEY } = await import('@/lib/sidebar-pane-height');
    render(
      <TerminalLaunchProvider
        value={{ launchInTerminal: () => {}, installedClis: { codex: true } }}
      >
        <ChatSidebarSection bridge={bridge} />
      </TerminalLaunchProvider>,
    );

    await screen.findByRole('button', { name: 'Open Codex chat Fix graph labels' });
    const pane = screen.getByTestId('chat-sidebar-pane');
    expect(pane.style.height).toBe('208px');

    const handle = screen.getByTestId('chat-sidebar-resize');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    await waitFor(() => expect(pane.style.height).toBe('192px'));
    expect(handle.getAttribute('aria-valuenow')).toBe('192');

    fireEvent.keyDown(handle, { key: 'PageDown' });
    await waitFor(() => expect(pane.style.height).toBe('256px'));

    // Double-click restores the default split.
    fireEvent.doubleClick(handle);
    await waitFor(() => expect(pane.style.height).toBe('208px'));

    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    await waitFor(() =>
      expect(window.localStorage.getItem(CHAT_PANE_HEIGHT_STORAGE_KEY)).toBe('224'),
    );
  });

  test('opens a row context menu with safe chat actions', async () => {
    const listChatSessions = mock(() =>
      Promise.resolve([
        {
          cli: 'codex' as const,
          sessionId: 'codex-session',
          title: 'Fix graph labels',
          updatedAt: 2,
        },
      ]),
    );
    const bridge = { terminal: { listChatSessions } } as unknown as OkDesktopBridge;
    const launches: unknown[] = [];
    const unsubscribe = subscribeToTerminalLaunchRequests((prompt, cli, options) => {
      launches.push({ prompt, cli, options });
    });
    const { ChatSidebarSection } = await import('./ChatSidebarSection');
    render(
      <TerminalLaunchProvider
        value={{ launchInTerminal: () => {}, installedClis: { codex: true } }}
      >
        <ChatSidebarSection bridge={bridge} />
      </TerminalLaunchProvider>,
    );

    const row = await screen.findByRole('button', { name: 'Open Codex chat Fix graph labels' });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open chat' }));
    expect(launches).toEqual([
      {
        prompt: null,
        cli: 'codex',
        options: { resumeSessionId: 'codex-session', surface: 'main' },
      },
    ]);

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy session ID' }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith('codex-session'));

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Refresh chats' }));
    await waitFor(() => expect(listChatSessions).toHaveBeenCalledTimes(2));
    unsubscribe();
  });
});
