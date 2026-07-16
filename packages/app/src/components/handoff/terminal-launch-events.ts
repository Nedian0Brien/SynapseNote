/**
 * Window-scoped pub/sub that carries an "Open in terminal" launch from the
 * handoff menus (mounted across the app shell — header, FileSidebar, FileTree)
 * to the docked terminal, whose open-state + launch-intent live in EditorPane.
 *
 * Mirrors the `doc-panel-events` idiom: the menu surfaces and EditorPane are
 * siblings under the app shell, so a context alone cannot thread state between
 * them without lifting ownership. The provider composes the prompt and fires
 * `requestTerminalLaunch`; EditorPane subscribes and sets visibility + intent.
 *
 * The payload is a fully-composed prompt string (the same one the deep-link
 * puts in `q=`) — never a command — plus the chosen `cli` discriminant. The
 * session does the fixed `<bin> '<prompt>'` wrapping per `cli`; this channel
 * never carries an executable command.
 */

import type { TerminalCli } from '@inkeep/open-knowledge-core';
import type { ChatContextChip } from '../chat/cli-chat-types';

const TERMINAL_LAUNCH_EVENT = 'open-knowledge:terminal-launch';

interface TerminalLaunchDetail {
  readonly prompt: string;
  readonly cli: TerminalCli;
  readonly displayPrompt?: string;
  readonly context?: readonly ChatContextChip[];
}

export function requestTerminalLaunch(
  prompt: string,
  cli: TerminalCli,
  optionsOrTarget:
    | { readonly displayPrompt?: string; readonly context?: readonly ChatContextChip[] }
    | Pick<Window, 'dispatchEvent'>
    | EventTarget = {},
  explicitTarget?: Pick<Window, 'dispatchEvent'> | EventTarget,
): void {
  const optionsIsTarget = 'dispatchEvent' in optionsOrTarget;
  const options = optionsIsTarget ? {} : optionsOrTarget;
  const target =
    (optionsIsTarget ? optionsOrTarget : explicitTarget) ??
    (typeof window === 'undefined' ? new EventTarget() : window);
  target.dispatchEvent(
    new CustomEvent<TerminalLaunchDetail>(TERMINAL_LAUNCH_EVENT, {
      detail: { prompt, cli, ...options },
    }),
  );
}

export function subscribeToTerminalLaunchRequests(
  onRequest: (
    prompt: string,
    cli: TerminalCli,
    options: { readonly displayPrompt?: string; readonly context?: readonly ChatContextChip[] },
  ) => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | EventTarget = typeof window ===
  'undefined'
    ? new EventTarget()
    : window,
): () => void {
  const listener = (event: Event) => {
    const detail =
      event instanceof CustomEvent
        ? (event as CustomEvent<TerminalLaunchDetail>).detail
        : undefined;
    if (detail && typeof detail.prompt === 'string') {
      onRequest(detail.prompt, detail.cli, {
        ...(detail.displayPrompt === undefined ? {} : { displayPrompt: detail.displayPrompt }),
        ...(detail.context === undefined ? {} : { context: detail.context }),
      });
    }
  };
  target.addEventListener(TERMINAL_LAUNCH_EVENT, listener as EventListener);
  return () => target.removeEventListener(TERMINAL_LAUNCH_EVENT, listener as EventListener);
}
