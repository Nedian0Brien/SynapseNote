import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  test('switches renderers without remounting the shared PTY', () => {
    render(
      <CliChatSession
        bridge={{ terminal: { setMeta: () => {} } } as unknown as OkDesktopBridge}
        cli="codex"
        launch={{ prompt: null, cli: 'codex', nonce: 1 }}
      />,
    );
    expect(terminalMounts).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Chat messages')).toBeTruthy();
    expect(screen.getByText('Raw terminal output')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(terminalMounts).toHaveBeenCalledTimes(1);
  });
});
