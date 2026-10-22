import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { TerminalCli } from '@nedian0brien/synapsenote-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TerminalNewChatButton, type TerminalNewTabChoice } from './TerminalNewChatButton';

function renderButton(
  selected: TerminalNewTabChoice = 'claude',
  visibleClis?: readonly TerminalCli[],
) {
  const onPickCli = mock((_cli: TerminalCli) => {});
  const onPickTerminal = mock(() => {});
  render(
    <TooltipProvider>
      <TerminalNewChatButton
        selected={selected}
        onPickCli={onPickCli}
        onPickTerminal={onPickTerminal}
        visibleClis={visibleClis}
      />
    </TooltipProvider>,
  );
  return { onPickCli, onPickTerminal };
}

describe('TerminalNewChatButton', () => {
  afterEach(() => cleanup());

  test('renders one plus button that opens the new-session menu', async () => {
    const user = userEvent.setup();
    const { onPickCli, onPickTerminal } = renderButton('codex');

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('New chat');
    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(await screen.findByRole('menuitem', { name: 'Codex CLI' })).toBeDefined();
    expect(onPickCli).not.toHaveBeenCalled();
    expect(onPickTerminal).not.toHaveBeenCalled();
  });

  test('the dropdown lists every CLI plus a Terminal option', async () => {
    const user = userEvent.setup();
    renderButton('claude');

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    for (const name of ['Claude CLI', 'Codex CLI', 'OpenCode CLI', 'Cursor CLI']) {
      expect(await screen.findByRole('menuitem', { name })).toBeDefined();
    }
    expect(screen.getByRole('menuitem', { name: 'Terminal' })).toBeDefined();
  });

  test('lists only the CLIs in visibleClis (Claude + detected), hiding the rest', async () => {
    const user = userEvent.setup();
    // The host passes the already-gated list from `visibleTerminalClis`: Claude
    // (always-visible anchor) plus detected `codex`. Antigravity/Cursor weren't
    // detected on PATH, so their rows are absent.
    renderButton('claude', ['claude', 'codex']);

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(await screen.findByRole('menuitem', { name: 'Claude CLI' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Codex CLI' })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: 'Antigravity CLI' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Cursor CLI' })).toBeNull();
    // The bare-shell Terminal row is independent of CLI gating — always present.
    expect(screen.getByRole('menuitem', { name: 'Terminal' })).toBeDefined();
  });

  test('picking a CLI from the dropdown switches the default (persist + launch)', async () => {
    const user = userEvent.setup();
    const { onPickCli, onPickTerminal } = renderButton('claude');

    await user.click(screen.getByRole('button', { name: 'New chat' }));
    await user.click(await screen.findByRole('menuitem', { name: 'OpenCode CLI' }));

    expect(onPickCli).toHaveBeenCalledTimes(1);
    expect(onPickCli).toHaveBeenCalledWith('opencode');
    expect(onPickTerminal).not.toHaveBeenCalled();
  });

  test('marks the current pick with aria-current so it is in the a11y tree', async () => {
    const user = userEvent.setup();
    renderButton('codex');

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    // The active CLI row is programmatically current; siblings + Terminal are not.
    expect(
      (await screen.findByRole('menuitem', { name: 'Codex CLI' })).getAttribute('aria-current'),
    ).toBe('true');
    expect(
      screen.getByRole('menuitem', { name: 'Claude CLI' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Terminal' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  test('marks the Terminal row current when a bare shell is the selection', async () => {
    const user = userEvent.setup();
    renderButton('terminal');

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(
      (await screen.findByRole('menuitem', { name: 'Terminal' })).getAttribute('aria-current'),
    ).toBe('true');
    expect(
      screen.getByRole('menuitem', { name: 'Claude CLI' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  test('picking Terminal from the dropdown switches the default to a bare shell', async () => {
    const user = userEvent.setup();
    const { onPickTerminal, onPickCli } = renderButton('claude');

    await user.click(screen.getByRole('button', { name: 'New chat' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Terminal' }));

    expect(onPickTerminal).toHaveBeenCalledTimes(1);
    expect(onPickCli).not.toHaveBeenCalled();
  });
});
