import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OkDesktopBridge, OkPtyData, OkPtyExit } from '@/lib/desktop-bridge-types';
import { CliChatPanel } from './CliChatPanel';

afterEach(cleanup);

function makeBridge() {
  const dataSubscribers: Array<(message: OkPtyData) => void> = [];
  const exitSubscribers: Array<(message: OkPtyExit) => void> = [];
  const input = mock((_ptyId: string, _data: string) => {});
  const chatSend = mock(
    (
      _ptyId: string,
      _input: {
        cli: 'codex' | 'claude';
        prompt: string;
        sessionId: string | null;
        permissionMode: 'read-only' | 'workspace-write' | 'full-access';
        modelSettings: {
          model: string;
          effort: string;
          speed: string;
        };
      },
    ) => {},
  );
  const bridge = {
    terminal: {
      input,
      chatSend,
      onData: (callback: (message: OkPtyData) => void) => {
        dataSubscribers.push(callback);
        return () => {};
      },
      onExit: (callback: (message: OkPtyExit) => void) => {
        exitSubscribers.push(callback);
        return () => {};
      },
      cliPreflight: async () => ({ onPath: 'present' as const }),
      claudePreflight: async () => ({
        claude: 'present' as const,
        mcp: 'wired' as const,
        mcpPreApprovable: true,
      }),
    },
  } as unknown as OkDesktopBridge;
  return {
    bridge,
    input,
    chatSend,
    pushData(data: string) {
      for (const callback of dataSubscribers) callback({ ptyId: 'pty-1', data });
    },
  };
}

describe('CliChatPanel', () => {
  test('shows context, sends immediately, and accumulates a structured response', async () => {
    const { bridge, chatSend, pushData } = makeBridge();
    render(
      <CliChatPanel
        bridge={bridge}
        cli="codex"
        ptyId="pty-1"
        initialPrompt={null}
        context={[{ kind: 'document', label: 'notes/today.md' }]}
      />,
    );

    expect(screen.getByText('notes/today.md')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Summarize this' } });
    fireEvent.click(screen.getByLabelText('Send'));
    const userBubble = screen.getByLabelText('You');
    expect(userBubble.textContent).toContain('Summarize this');
    expect(userBubble.getAttribute('data-chat-motion')).toBe('send');
    expect(userBubble.className).toContain('animate-chat-send');
    expect(userBubble.className).toContain('motion-reduce:animate-none');
    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    expect(chatSend.mock.calls[0]?.[1]).toEqual({
      cli: 'codex',
      prompt: 'Summarize this',
      sessionId: null,
      permissionMode: 'workspace-write',
      modelSettings: { model: 'gpt-5.6-sol', effort: 'medium', speed: 'default' },
    });

    act(() => {
      pushData(
        '{"type":"thread.started","thread_id":"thread-1"}\r\n' +
          '{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}\r\n' +
          '{"type":"turn.completed"}\r\n',
      );
    });
    expect(await screen.findByText('Done')).toBeTruthy();
    expect(screen.getByLabelText('Send')).toBeTruthy();
  });

  test('interrupts the active CLI with Ctrl-C', async () => {
    const { bridge, input } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Keep working' } });
    fireEvent.click(screen.getByLabelText('Send'));
    const stop = await screen.findByLabelText('Stop');
    fireEvent.click(stop);
    expect(input.mock.calls.at(-1)?.[1]).toBe('\u0003');
  });

  test('renders assistant and tool events in execution order', () => {
    const { bridge, pushData } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"message-1","type":"agent_message","text":"First response"}}\r\n' +
          '{"type":"item.started","item":{"id":"tool-1","type":"command_execution","command":"Read file"}}\r\n' +
          '{"type":"item.completed","item":{"id":"tool-1","type":"command_execution","command":"Read file","status":"completed"}}\r\n' +
          '{"type":"item.completed","item":{"id":"message-2","type":"agent_message","text":"Second response"}}\r\n',
      );
    });

    const entries = Array.from(screen.getByRole('log').querySelectorAll('[data-chat-entry]')).map(
      (entry) => entry.textContent,
    );
    expect(entries).toEqual(['First response', 'Read file · completed', 'Second response']);
    const completedTool = screen
      .getByRole('log')
      .querySelector('[data-chat-activity-state="completed"]');
    expect(completedTool?.querySelector('[data-chat-tool-icon="completed"]')).not.toBeNull();
  });

  test('renders consecutive Codex response items in separate message bubbles', () => {
    const { bridge, pushData } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"message-1","type":"agent_message","text":"First response"}}\r\n' +
          '{"type":"item.completed","item":{"id":"message-2","type":"agent_message","text":"Second response"}}\r\n',
      );
    });

    const messages = screen.getAllByLabelText('Assistant');
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.textContent)).toEqual([
      'First response',
      'Second response',
    ]);
  });

  test('animates response generation and tool execution state changes', async () => {
    const { bridge, pushData } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Inspect it' } });
    fireEvent.click(screen.getByLabelText('Send'));

    act(() => pushData('{"type":"turn.started"}\r\n'));
    const thinking = screen.getByRole('log').querySelector('[data-chat-activity-state="working"]');
    expect(thinking?.querySelector('[data-chat-generation-dots="true"]')).not.toBeNull();

    act(() => {
      pushData(
        '{"type":"item.started","item":{"id":"tool-motion","type":"command_execution","command":"Read file"}}\r\n',
      );
    });
    const workingTool = screen
      .getByRole('log')
      .querySelector('[data-chat-activity-state="working"]');
    expect(workingTool?.querySelector('[data-chat-tool-icon="working"]')).not.toBeNull();
    expect(workingTool?.className).toContain('animate-chat-activity');

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"tool-motion","type":"command_execution","command":"Read file","status":"completed"}}\r\n',
      );
    });
    const completedTool = screen
      .getByRole('log')
      .querySelector('[data-chat-activity-state="completed"]');
    expect(completedTool?.querySelector('[data-chat-tool-icon="completed"]')).not.toBeNull();

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"answer-motion","type":"agent_message","text":"Finished"}}\r\n',
      );
    });
    const assistant = await screen.findByLabelText('Assistant');
    expect(assistant.getAttribute('data-chat-motion')).toBe('assistant');
    expect(assistant.getAttribute('data-chat-generating')).toBe('true');
    expect(assistant.className).toContain('animate-chat-assistant');
    expect(assistant.querySelector('[data-chat-generation-dots="true"]')).not.toBeNull();

    act(() => pushData('{"type":"turn.completed"}\r\n'));
    expect(assistant.getAttribute('data-chat-generating')).toBeNull();
    expect(assistant.querySelector('[data-chat-generation-dots="true"]')).toBeNull();
  });

  test('renders markdown inside constrained message bubbles', async () => {
    const { bridge, pushData } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"message-1","type":"agent_message","text":"## Summary\\n\\n- **Bold** item\\n\\n`const value = 1`"}}\r\n',
      );
    });

    expect(await screen.findByRole('heading', { level: 2, name: 'Summary' })).toBeTruthy();
    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.getByText('const value = 1').tagName).toBe('CODE');
    const bubble = screen.getByLabelText('Assistant');
    expect(bubble.className).toContain('min-w-0');
    expect(bubble.className).toContain('overflow-hidden');
    expect(bubble.querySelector('[data-chat-markdown="true"]')).not.toBeNull();
  });

  test('places the composer actions below the message field', () => {
    const { bridge } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    const message = screen.getByLabelText('Message');
    const permissions = screen.getByRole('button', { name: 'Permissions: Workspace access' });
    const composer = message.closest('[data-chat-composer="true"]');
    const actions = permissions.closest('[data-chat-composer-actions="true"]');

    expect(composer).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(composer?.contains(actions)).toBe(true);
    expect(message.getAttribute('rows')).toBe('2');
  });

  test('sends the selected permission mode through the structured bridge', async () => {
    const { bridge, chatSend } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Permissions: Workspace access' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Full access/ }));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Make the change' } });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    expect(chatSend.mock.calls[0]?.[1]).toEqual({
      cli: 'codex',
      prompt: 'Make the change',
      sessionId: null,
      permissionMode: 'full-access',
      modelSettings: { model: 'gpt-5.6-sol', effort: 'medium', speed: 'default' },
    });
  });

  test('offers Sol and Luna with effort slider and speed toggle controls', async () => {
    const user = userEvent.setup();
    const { bridge, chatSend } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    const modelTrigger = screen.getByRole('button', {
      name: 'Model settings: GPT-5.6 Sol, effort Medium, speed Standard',
    });
    fireEvent.pointerDown(modelTrigger, { button: 0, ctrlKey: false });
    await screen.findByRole('menuitemradio', { name: 'GPT-5.6 Sol' });
    expect(screen.queryByRole('menuitemradio', { name: 'Default' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'GPT-5.6 Luna' }));

    expect(screen.getByRole('menu')).toBeTruthy();
    const effort = await screen.findByRole('slider', { name: 'Effort' });
    const highTick = screen.getByRole('button', { name: 'Effort: High' });
    expect(screen.getAllByRole('button', { name: /^Effort:/ })).toHaveLength(5);
    await user.hover(highTick);
    expect((await screen.findByRole('tooltip')).textContent).toContain('High');
    await user.unhover(highTick);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    fireEvent.click(highTick);
    expect(highTick.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(effort, { key: 'End' });
    const fast = screen.getByRole('button', { name: 'Fast speed: Off' });
    fireEvent.click(fast);
    expect(
      screen.getByRole('button', { name: 'Fast speed: On' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(
      screen.getByRole('button', {
        name: 'Model settings: GPT-5.6 Luna, effort Max, speed Fast',
      }).textContent,
    ).toContain('GPT-5.6 Luna·Max');

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Use settings' } });
    fireEvent.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    expect(chatSend.mock.calls[0]?.[1].modelSettings).toEqual({
      model: 'gpt-5.6-luna',
      effort: 'max',
      speed: 'fast',
    });
  });

  test('attaches selected lines and document identity to the model prompt', async () => {
    const { bridge, chatSend } = makeBridge();
    render(
      <CliChatPanel
        bridge={bridge}
        cli="codex"
        ptyId="pty-1"
        initialPrompt={null}
        selectionContext={{
          documentTitle: 'Work Log',
          documentPath: 'brain/log.md',
          markdown: 'First selected line\nSecond selected line',
          lineCount: 2,
          startLine: 10,
          endLine: 11,
        }}
      />,
    );

    expect(await screen.findByText('2 lines selected')).toBeTruthy();
    expect(screen.getByText('· Work Log')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Explain this' } });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    const sent = chatSend.mock.calls[0]?.[1];
    expect(sent?.prompt).toContain('"documentTitle": "Work Log"');
    expect(sent?.prompt).toContain('"documentPath": "brain/log.md"');
    expect(sent?.prompt).toContain('"startLine": 10');
    expect(sent?.prompt).toContain('First selected line\\nSecond selected line');
    const userMessage = screen.getByLabelText('You');
    expect(within(userMessage).getByText('Explain this')).toBeTruthy();
    const sentContext = screen.getByLabelText('Attached context: Work Log');
    expect(sentContext.getAttribute('data-chat-sent-selection')).toBe('true');
    expect(userMessage.contains(sentContext)).toBe(false);
    const messageGroup = userMessage.closest('[data-chat-message-group="selection"]');
    expect(messageGroup?.firstElementChild?.contains(sentContext)).toBe(true);
    expect(messageGroup?.lastElementChild).toBe(userMessage);
    expect(sentContext.textContent).toContain('Work Log');
    expect(sentContext.textContent).toContain('2 lines selected');
    expect(sentContext.textContent).toContain('brain/log.md:10-11');
    expect(sentContext.textContent).toContain('First selected line Second selected line');
    expect(sentContext.querySelector('[data-chat-context-snippet="true"]')).not.toBeNull();
    expect(sentContext.querySelector('[data-chat-context-full="true"]')).toBeNull();

    fireEvent.click(within(sentContext).getByRole('button', { name: 'Expand attached context' }));
    expect(
      within(sentContext).getByRole('button', { name: 'Collapse attached context' }),
    ).toBeTruthy();
    expect(sentContext.querySelector('[data-chat-context-snippet="true"]')).toBeNull();
    expect(sentContext.querySelector('[data-chat-context-full="true"]')?.textContent).toContain(
      'First selected line\nSecond selected line',
    );
  });

  test('shows a short context snippet before revealing the complete passage', async () => {
    const { bridge } = makeBridge();
    const completePassage = `Opening sentence ${'supporting context '.repeat(16)}final detail.`;
    render(
      <CliChatPanel
        bridge={bridge}
        cli="codex"
        ptyId="pty-1"
        initialPrompt={null}
        selectionContext={{
          documentTitle: 'Persona2Web.pdf',
          documentPath: 'reading/Persona2Web.pdf',
          markdown: completePassage,
          lineCount: 16,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Translate this' } });
    fireEvent.click(screen.getByLabelText('Send'));
    const sentContext = await screen.findByLabelText('Attached context: Persona2Web.pdf');
    const snippet = sentContext.querySelector('[data-chat-context-snippet="true"]');
    expect(snippet?.textContent?.endsWith('…')).toBe(true);
    expect(snippet?.textContent).not.toContain('final detail.');

    fireEvent.click(within(sentContext).getByRole('button', { name: 'Expand attached context' }));
    expect(sentContext.querySelector('[data-chat-context-full="true"]')?.textContent).toContain(
      completePassage,
    );
  });
});
