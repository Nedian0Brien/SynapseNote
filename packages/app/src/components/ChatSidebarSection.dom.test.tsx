import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { terminalCliId, UNIFIED_AGENT_KEY } from '@/lib/unified-agent-store';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';
import { TerminalLaunchProvider } from './handoff/TerminalLaunchContext';
import { subscribeToTerminalLaunchRequests } from './handoff/terminal-launch-events';

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

    fireEvent.click(screen.getByRole('button', { name: 'Open chat Fix graph labels' }));
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(launches).toEqual([
      {
        prompt: null,
        cli: 'codex',
        options: { resumeSessionId: 'codex-session' },
      },
      { prompt: null, cli: 'codex', options: {} },
    ]);
    unsubscribe();
  });

  test('keeps the Chat section visible with an empty web fallback', async () => {
    const { ChatSidebarSection } = await import('./ChatSidebarSection');
    render(
      <TerminalLaunchProvider value={null}>
        <ChatSidebarSection />
      </TerminalLaunchProvider>,
    );

    expect(screen.getByTestId('chat-sidebar-section')).toBeTruthy();
    expect(screen.getByText('No chats yet.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'New chat' }).getAttribute('disabled'),
    ).not.toBeNull();
  });
});
