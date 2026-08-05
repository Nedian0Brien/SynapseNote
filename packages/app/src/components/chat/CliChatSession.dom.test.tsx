import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

const terminalMounts = mock(() => {});

mock.module('../TerminalGate', () => ({
  TerminalGate: ({ onPtyId }: { onPtyId?: (ptyId: string) => void }) => {
    useState(() => {
      terminalMounts();
      return true;
    });
    useEffect(() => {
      onPtyId?.('pty-1');
    }, [onPtyId]);
    return <div>Raw terminal output</div>;
  },
}));

mock.module('./CliChatPanel', () => ({
  CliChatPanel: () => <div>Chat messages</div>,
}));

const { CliChatSession } = await import('./CliChatSession');

afterEach(() => {
  cleanup();
  terminalMounts.mockClear();
});

describe('CliChatSession', () => {
  test('shows the chat title and session actions while keeping the shared PTY mounted', async () => {
    const user = userEvent.setup();
    const onSelectSession = mock((_id: string) => {});
    const onNewChat = mock((_cli: string) => {});
    const onReloadSessions = mock(() => {});
    render(
      <CliChatSession
        bridge={{ terminal: { setMeta: () => {} } } as unknown as OkDesktopBridge}
        cli="codex"
        launch={{ prompt: null, cli: 'codex', nonce: 1 }}
        sessionId="current"
        title="Summarize the research notes"
        sessions={[
          { id: 'current', cli: 'codex', title: 'Summarize the research notes' },
          { id: 'older', cli: 'claude', title: 'Compare source arguments' },
        ]}
        onSelectSession={onSelectSession}
        onReloadSessions={onReloadSessions}
        onNewChat={onNewChat}
      />,
    );
    expect(terminalMounts).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Chat messages')).toBeTruthy();
    expect(screen.getByText('Raw terminal output')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Summarize the research notes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Terminal' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Load previous chat' }));
    expect(onReloadSessions).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole('menuitem', { name: 'Compare source arguments' }));
    expect(onSelectSession).toHaveBeenCalledWith('older');

    fireEvent.click(screen.getByRole('button', { name: 'New Codex chat' }));
    expect(onNewChat).toHaveBeenCalledWith('codex');
    expect(terminalMounts).toHaveBeenCalledTimes(1);
  });

  test('searches previous chats by title or transcript preview', async () => {
    const user = userEvent.setup();
    render(
      <CliChatSession
        bridge={{ terminal: { setMeta: () => {} } } as unknown as OkDesktopBridge}
        cli="codex"
        launch={{ prompt: null, cli: 'codex', nonce: 1 }}
        sessionId="current"
        sessions={[
          { id: 'current', cli: 'codex', title: 'Current chat' },
          {
            id: 'research',
            cli: 'codex',
            title: 'Research notes',
            preview: 'Evidence about citations',
            updatedAt: Date.UTC(2026, 7, 5),
            messageCount: 4,
          },
          {
            id: 'planning',
            cli: 'claude',
            title: 'Release planning',
            preview: 'Milestone checklist',
            updatedAt: Date.UTC(2026, 7, 4),
            messageCount: 2,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Load previous chat' }));
    await user.type(screen.getByRole('textbox', { name: 'Search previous chats' }), 'citations');
    expect(screen.getByText('Research notes')).toBeTruthy();
    expect(screen.queryByText('Release planning')).toBeNull();
  });
});
