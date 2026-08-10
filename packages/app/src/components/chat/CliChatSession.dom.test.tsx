import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
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
  test('renders both panes over one shared PTY, with no header of its own', async () => {
    render(
      <CliChatSession
        bridge={{ terminal: { setMeta: () => {} } } as unknown as OkDesktopBridge}
        cli="codex"
        launch={{ prompt: null, cli: 'codex', nonce: 1 }}
      />,
    );
    // The chat view and the hidden raw-terminal view share a single PTY — the
    // invariant this file exists to protect.
    expect(terminalMounts).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Chat messages')).toBeTruthy();
    expect(screen.getByText('Raw terminal output')).toBeTruthy();

    // The session's title is its tab in the strip above, and "previous chats" /
    // "new chat" are verbs on the whole chat surface — all three moved to that
    // strip (see TerminalTabStrip.dom.test.tsx). Keeping a header here repeated
    // the tab verbatim and stacked a third band on the rail.
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load previous chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New Codex chat' })).toBeNull();
  });
});
