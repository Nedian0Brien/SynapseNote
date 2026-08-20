import { afterEach, describe, expect, mock, test } from 'bun:test';
import { ConfigSchema } from '@nedian0brien/synapsenote-core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigContext, type ConfigContextValue } from '@/lib/config-context';
import type { OkDesktopBridge, OkPtyData, OkPtyExit } from '@/lib/desktop-bridge-types';
import { CliChatPanel } from './CliChatPanel';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function makeBridge(history: readonly { role: 'user' | 'assistant'; text: string }[] = []) {
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
        autoApproveOkTools?: boolean;
        modelSettings: {
          model: string;
          effort: string;
          speed: string;
        };
      },
    ) => {},
  );
  const fetchWebPreview = mock(async (url: string) => ({
    url,
    title: 'OpenAI official homepage',
    description: 'Research and deployment of safe artificial intelligence.',
    siteName: 'OpenAI',
    imageDataUrl: 'data:image/png;base64,AQI=',
    faviconDataUrl: 'data:image/png;base64,AwQ=',
  }));
  const readChatSession = mock(async (_cli: 'codex' | 'claude', _sessionId: string) => history);
  const bridge = {
    shell: { fetchWebPreview },
    terminal: {
      input,
      chatSend,
      readChatSession,
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
    readChatSession,
    fetchWebPreview,
    pushData(data: string) {
      for (const callback of dataSubscribers) callback({ ptyId: 'pty-1', data });
    },
  };
}

describe('CliChatPanel', () => {
  test('restores native history before continuing the same session', async () => {
    const { bridge, chatSend, readChatSession } = makeBridge([
      { role: 'user', text: 'Why are graph labels hidden?' },
      { role: 'assistant', text: 'They are gated by the zoom threshold.' },
    ]);
    render(
      <CliChatPanel
        bridge={bridge}
        cli="codex"
        ptyId="pty-1"
        initialPrompt={null}
        initialSessionId="codex-session"
      />,
    );

    expect(screen.getByLabelText('Message').getAttribute('disabled')).not.toBeNull();
    expect(await screen.findByText('Why are graph labels hidden?')).toBeTruthy();
    expect(screen.getByText('They are gated by the zoom threshold.')).toBeTruthy();
    expect(readChatSession).toHaveBeenCalledWith('codex', 'codex-session');

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Show them sooner' } });
    fireEvent.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    expect(chatSend.mock.calls[0]?.[1].sessionId).toBe('codex-session');
  });

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

    const composer = document.querySelector('[data-chat-composer="true"]');
    const documentContext = screen.getByText('notes/today.md');
    expect(composer?.contains(documentContext)).toBe(true);
    expect(document.querySelector('[data-chat-composer-context="true"]')).not.toBeNull();
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
      autoApproveOkTools: true,
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

  test('uses the configured default model for a new chat', async () => {
    const { bridge, chatSend } = makeBridge();
    const config = ConfigSchema.parse({
      agents: {
        autoApproveOkTools: false,
        chat: { codexModel: 'gpt-5.6-terra', claudeModel: 'opus' },
      },
    });
    const configContext = {
      userBinding: null,
      userSynced: true,
      projectBinding: null,
      projectLocalBinding: null,
      okignoreBinding: null,
      okignoreSynced: true,
      userConfig: config,
      projectConfig: config,
      projectSynced: true,
      projectLocalConfig: config,
      projectLocalSynced: true,
      merged: config,
    } satisfies ConfigContextValue;

    render(
      <ConfigContext value={configContext}>
        <CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />
      </ConfigContext>,
    );
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Use my default' } });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    expect(chatSend.mock.calls[0]?.[1].modelSettings).toEqual({
      model: 'gpt-5.6-terra',
      effort: 'medium',
      speed: 'default',
    });
    expect(chatSend.mock.calls[0]?.[1].autoApproveOkTools).toBe(false);
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
    expect(completedTool?.querySelector('[data-chat-tool-icon="command"]')).not.toBeNull();
    expect(completedTool?.querySelector('[data-chat-tool-status="completed"]')).not.toBeNull();
  });

  test('shows Codex web search while running and preserves its query when complete', async () => {
    const { bridge, chatSend, fetchWebPreview, pushData } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Search the web' } });
    fireEvent.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    act(() => {
      pushData(
        '{"type":"item.started","item":{"id":"web-1","type":"web_search","query":"","action":{"type":"other"}}}\r\n',
      );
    });
    expect(
      screen
        .getByText('Web search')
        .closest('[data-chat-activity-state]')
        ?.getAttribute('data-chat-activity-state'),
    ).toBe('working');

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"web-1","type":"web_search","query":"official OpenAI homepage","action":{"type":"search","query":"official OpenAI homepage"}}}\r\n',
      );
      pushData(
        '{"type":"item.completed","item":{"id":"answer-web","type":"agent_message","text":"[OpenAI](https://openai.com/)"}}\r\n',
      );
    });
    const completed = screen
      .getByText(/Web search · official OpenAI homepage/)
      .closest('[data-chat-activity-state]');
    expect(completed?.getAttribute('data-chat-activity-state')).toBe('completed');
    expect(completed?.querySelector('[data-chat-tool-icon="web_search"]')).not.toBeNull();
    expect(completed?.querySelector('[data-chat-tool-status="completed"]')).not.toBeNull();
    const preview = screen.getByRole('link', { name: 'Open OpenAI' });
    expect(preview.getAttribute('href')).toBe('https://openai.com/');
    expect(preview.getAttribute('data-chat-web-preview-layout')).toBe('compact');
    expect(preview.closest('[data-chat-web-previews="true"]')).not.toBeNull();
    expect(screen.getByLabelText('Assistant').contains(preview)).toBe(false);
    expect(preview.closest('[data-chat-message-group="assistant-with-sources"]')).not.toBeNull();
    await waitFor(() => {
      expect(fetchWebPreview).toHaveBeenCalledWith('https://openai.com/');
      expect(preview.querySelector('[data-chat-web-preview-image="true"]')).not.toBeNull();
    });
  });

  test('shows a one-line tool error and expands the complete detail', async () => {
    const { bridge, pushData } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"message-before-error","type":"agent_message","text":"I will try it."}}\r\n' +
          '{"type":"item.completed","item":{"id":"tool-error","type":"command_execution","command":"exec","aggregated_output":"user cancelled MCP tool call\\nServer: open-knowledge\\nRetry after reconnecting.","exit_code":1,"status":"failed"}}\r\n',
      );
    });

    const expandable = document.querySelector<HTMLDetailsElement>(
      '[data-chat-error-expandable="true"]',
    );
    const summary = expandable?.querySelector('[data-chat-error-summary="true"]');
    expect(expandable?.open).toBe(false);
    expect(summary?.textContent).toBe('user cancelled MCP tool call');
    expect(expandable?.textContent).toContain('exec · failed');
    expect(expandable?.querySelector('[data-chat-tool-icon="command"]')).not.toBeNull();
    const failureStatus = expandable?.querySelector('[data-chat-tool-status="failed"]');
    expect(failureStatus).not.toBeNull();
    expect(failureStatus?.previousElementSibling?.textContent).toBe('exec · failed');

    await userEvent.click(expandable?.querySelector('summary') as HTMLElement);
    expect(expandable?.open).toBe(true);
    expect(expandable?.querySelector('[data-chat-error-details="true"]')?.textContent).toContain(
      'Server: open-knowledge\nRetry after reconnecting.',
    );
  });

  test('shows Claude tool-result permission failures on the matching activity', async () => {
    const { bridge, pushData } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="claude" ptyId="pty-1" initialPrompt={null} />);

    act(() => {
      pushData(
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"I will inspect it."}}}\r\n' +
          '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","id":"tool-denied","name":"mcp__synapsenote__current_document"}}}\r\n' +
          '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tool-denied","content":"Claude requested permissions, but they were not granted.","is_error":true}]},"tool_use_result":"Error: permission denied"}\r\n',
      );
    });

    const failed = document.querySelector<HTMLDetailsElement>(
      '[data-chat-error-expandable="true"]',
    );
    expect(failed?.textContent).toContain('mcp__synapsenote__current_document · failed');
    expect(failed?.querySelector('[data-chat-error-summary]')?.textContent).toBe(
      'Claude requested permissions, but they were not granted.',
    );
    await userEvent.click(failed?.querySelector('summary') as HTMLElement);
    expect(failed?.querySelector('[data-chat-error-details]')?.textContent).toContain(
      'Error: permission denied',
    );
  });

  test('shows and expands details for successful exec and write tools', async () => {
    const { bridge, pushData } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"message-before-tools","type":"agent_message","text":"I will create it."}}\r\n' +
          '{"type":"item.completed","item":{"id":"tool-exec","type":"command_execution","command":"bun run check","aggregated_output":"Checks passed\\nNo errors found.","exit_code":0,"status":"completed"}}\r\n' +
          '{"type":"item.completed","item":{"id":"tool-write","type":"mcp_tool_call","tool":"write","arguments":{"document":{"path":"note/example"}},"result":{"content":[{"type":"text","text":"Created note/example.md\\nNo broken links."}]},"status":"completed"}}\r\n',
      );
    });

    const expandables = Array.from(
      document.querySelectorAll<HTMLDetailsElement>('[data-chat-tool-expandable="true"]'),
    );
    expect(expandables).toHaveLength(2);
    expect(
      expandables.map((entry) => entry.querySelector('[data-chat-tool-summary]')?.textContent),
    ).toEqual(['Checks passed', 'Created note/example.md']);
    expect(expandables[0]?.querySelector('[data-chat-tool-icon="command"]')).not.toBeNull();
    expect(expandables[1]?.querySelector('[data-chat-tool-icon="file"]')).not.toBeNull();
    expect(
      expandables.every(
        (entry) => entry.querySelector('[data-chat-tool-status="completed"]') !== null,
      ),
    ).toBe(true);

    await userEvent.click(expandables[1]?.querySelector('summary') as HTMLElement);
    expect(expandables[1]?.open).toBe(true);
    const detail = expandables[1]?.querySelector('[data-chat-tool-details]')?.textContent;
    expect(detail).toContain('Arguments\n{\n  "document":');
    expect(detail).toContain('Result\n{');
    expect(detail).toContain('No broken links.');
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
    expect(workingTool?.querySelector('[data-chat-tool-icon="command"]')).not.toBeNull();
    expect(workingTool?.querySelector('[data-chat-tool-status]')).toBeNull();
    expect(workingTool?.className).toContain('animate-chat-activity');

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"tool-motion","type":"command_execution","command":"Read file","status":"completed"}}\r\n',
      );
    });
    const completedTool = screen
      .getByRole('log')
      .querySelector('[data-chat-activity-state="completed"]');
    expect(completedTool?.querySelector('[data-chat-tool-icon="command"]')).not.toBeNull();
    const completionStatus = completedTool?.querySelector('[data-chat-tool-status="completed"]');
    expect(completionStatus).not.toBeNull();
    expect(completionStatus?.previousElementSibling?.textContent).toBe('Read file · completed');

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

  test('renders assistant markdown full width while user turns stay bubbled', async () => {
    const { bridge, pushData } = makeBridge();
    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Summarize this' } });
    fireEvent.click(screen.getByLabelText('Send'));

    act(() => {
      pushData(
        '{"type":"item.completed","item":{"id":"message-1","type":"agent_message","text":"## Summary\\n\\n- **Bold** item\\n\\n`const value = 1`"}}\r\n',
      );
    });

    expect(await screen.findByRole('heading', { level: 2, name: 'Summary' })).toBeTruthy();
    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.getByText('const value = 1').tagName).toBe('CODE');

    // Long assistant answers span the whole column with no bubble chrome.
    const assistant = screen.getByLabelText('Assistant');
    expect(assistant.className).toContain('min-w-0');
    expect(assistant.className).toContain('w-full');
    expect(assistant.className).not.toContain('rounded-2xl');
    expect(assistant.className).not.toContain('bg-muted');
    expect(assistant.className).not.toContain('border');
    expect(assistant.querySelector('[data-chat-markdown="true"]')).not.toBeNull();

    // Short user turns keep the right-aligned, clipped bubble.
    const userBubble = screen.getByLabelText('You');
    expect(userBubble.className).toContain('rounded-2xl');
    expect(userBubble.className).toContain('bg-primary');
    expect(userBubble.className).toContain('overflow-hidden');
    expect(userBubble.className).toContain('ml-auto');
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
      autoApproveOkTools: true,
      modelSettings: { model: 'gpt-5.6-sol', effort: 'medium', speed: 'default' },
    });
  });

  test('offers Sol and Luna with effort slider and speed toggle controls', async () => {
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
    fireEvent.click(highTick);
    expect(highTick.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(effort, { key: 'End' });
    const fast = screen.getByRole('button', { name: 'Fast speed: Off' });
    fireEvent.click(fast);
    expect(
      screen.getByRole('button', { name: 'Fast speed: On' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    const message = screen.getByLabelText('Message');
    await waitFor(() => expect(document.activeElement).toBe(message));

    expect(
      screen.getByRole('button', {
        name: 'Model settings: GPT-5.6 Luna, effort Max, speed Fast',
      }).textContent,
    ).toContain('GPT-5.6 Luna·Max');

    fireEvent.change(message, { target: { value: 'Use settings' } });
    fireEvent.keyDown(message, { key: 'Enter' });
    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    expect(chatSend.mock.calls[0]?.[1].modelSettings).toEqual({
      model: 'gpt-5.6-luna',
      effort: 'max',
      speed: 'fast',
    });
  });

  test('remembers model, effort, speed, and permission choices for the provider', async () => {
    const { bridge } = makeBridge();
    const first = render(
      <CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: 'Model settings: GPT-5.6 Sol, effort Medium, speed Standard',
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'GPT-5.6 Terra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Effort: High' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fast speed: Off' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Permissions: Workspace access' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Read only/ }));
    first.unmount();

    render(<CliChatPanel bridge={bridge} cli="codex" ptyId="pty-1" initialPrompt={null} />);
    expect(
      screen.getByRole('button', {
        name: 'Model settings: GPT-5.6 Terra, effort High, speed Fast',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Permissions: Read only' })).toBeTruthy();
  });

  test('reports a compact title from the first user message', async () => {
    const { bridge, chatSend } = makeBridge();
    const onTitleChange = mock((_title: string) => {});
    render(
      <CliChatPanel
        bridge={bridge}
        cli="codex"
        ptyId="pty-1"
        initialPrompt={null}
        onTitleChange={onTitleChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Message'), {
      target: {
        value: '  Summarize   the research notes and identify every unresolved question  ',
      },
    });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    expect(onTitleChange).toHaveBeenCalledWith('Summarize the research notes and id…');
  });

  test('injects the currently open editor document into every user prompt', async () => {
    const { bridge, chatSend } = makeBridge();
    render(
      <CliChatPanel
        bridge={bridge}
        cli="codex"
        ptyId="pty-1"
        initialPrompt={null}
        documentContext={{
          documentTitle: 'Research Notes',
          documentPath: 'notes/research.md',
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: '내가 지금 보고 있는 문서 뭐야?' },
    });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    const sent = chatSend.mock.calls[0]?.[1];
    expect(sent?.prompt).toContain('<current_document>');
    expect(sent?.prompt).toContain('"documentTitle": "Research Notes"');
    expect(sent?.prompt).toContain('"documentPath": "notes/research.md"');
    expect(sent?.prompt).toContain('User request:\n내가 지금 보고 있는 문서 뭐야?');
    expect(screen.getByLabelText('You').textContent).toContain('내가 지금 보고 있는 문서 뭐야?');
    expect(screen.getByLabelText('You').textContent).not.toContain('<current_document>');
  });

  test('attaches selected lines and document identity to the model prompt', async () => {
    const { bridge, chatSend } = makeBridge();
    render(
      <CliChatPanel
        bridge={bridge}
        cli="codex"
        ptyId="pty-1"
        initialPrompt={null}
        documentContext={{ documentTitle: 'Work Log', documentPath: 'brain/log.md' }}
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
    expect(screen.getByText('· First selected line Second selected line')).toBeTruthy();
    expect(screen.queryByText('· Work Log')).toBeNull();
    expect(document.querySelector('[data-chat-selection-preview="true"]')?.textContent).toContain(
      'First selected line Second selected line',
    );
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Explain this' } });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(chatSend).toHaveBeenCalledTimes(1));
    const sent = chatSend.mock.calls[0]?.[1];
    expect(sent?.prompt).toContain('"documentTitle": "Work Log"');
    expect(sent?.prompt).toContain('"documentPath": "brain/log.md"');
    expect(sent?.prompt).toContain('"startLine": 10');
    expect(sent?.prompt).toContain('First selected line\\nSecond selected line');
    expect(sent?.prompt).toContain('<current_document>');
    expect(sent?.prompt).toContain('<selected_document>');
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

  test('clears the attached selection when the editor selection is released', async () => {
    const { bridge } = makeBridge();
    const selectionContext = {
      documentTitle: 'Research Note',
      documentPath: 'note/summary/research.md',
      markdown: 'First selected line\nSecond selected line',
      lineCount: 2,
      startLine: 10,
      endLine: 11,
    };
    const { rerender } = render(
      <CliChatPanel
        bridge={bridge}
        cli="codex"
        ptyId="pty-1"
        initialPrompt={null}
        selectionContext={selectionContext}
      />,
    );

    expect(await screen.findByText('2 lines selected')).toBeTruthy();
    rerender(
      <CliChatPanel
        bridge={bridge}
        cli="codex"
        ptyId="pty-1"
        initialPrompt={null}
        selectionContext={null}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('2 lines selected')).toBeNull();
      expect(document.querySelector('[data-chat-selection="true"]')).toBeNull();
    });
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
