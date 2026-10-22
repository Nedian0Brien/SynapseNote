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
 * The payload is either a fully-composed prompt string (the same one the
 * deep-link puts in `q=`), or `null` for a fresh/resumed promptless chat. It is
 * never a command. The session does the fixed `<bin> '<prompt>'` wrapping per
 * `cli`; this channel never carries an executable command.
 */

import type { TerminalCli } from '@nedian0brien/synapsenote-core';
import type { ChatContextChip } from '../chat/cli-chat-types';

const TERMINAL_LAUNCH_EVENT = 'synapsenote:terminal-launch';

interface TerminalLaunchDetail {
  readonly prompt: string | null;
  readonly cli: TerminalCli;
  readonly displayPrompt?: string;
  readonly context?: readonly ChatContextChip[];
  readonly resumeSessionId?: string;
  readonly surface?: 'dock' | 'main';
}

export function requestTerminalLaunch(
  prompt: string | null,
  cli: TerminalCli,
  optionsOrTarget:
    | {
        readonly displayPrompt?: string;
        readonly context?: readonly ChatContextChip[];
        readonly resumeSessionId?: string;
        readonly surface?: 'dock' | 'main';
      }
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
    prompt: string | null,
    cli: TerminalCli,
    options: {
      readonly displayPrompt?: string;
      readonly context?: readonly ChatContextChip[];
      readonly resumeSessionId?: string;
      readonly surface?: 'dock' | 'main';
    },
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
    if (detail && (typeof detail.prompt === 'string' || detail.prompt === null)) {
      onRequest(detail.prompt, detail.cli, {
        ...(detail.displayPrompt === undefined ? {} : { displayPrompt: detail.displayPrompt }),
        ...(detail.context === undefined ? {} : { context: detail.context }),
        ...(detail.resumeSessionId === undefined
          ? {}
          : { resumeSessionId: detail.resumeSessionId }),
        ...(detail.surface === undefined ? {} : { surface: detail.surface }),
      });
    }
  };
  target.addEventListener(TERMINAL_LAUNCH_EVENT, listener as EventListener);
  return () => target.removeEventListener(TERMINAL_LAUNCH_EVENT, listener as EventListener);
}
