import { useLingui } from '@lingui/react/macro';
import { SendIcon, SquareIcon, TextQuoteIcon, XIcon } from 'lucide-react';
import {
  type KeyboardEvent,
  type SyntheticEvent,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { ChatMessageList } from './ChatMessageList';
import { CliChatModelMenu } from './CliChatModelMenu';
import { CliChatPermissionMenu } from './CliChatPermissionMenu';
import { cliChatReducer, createInitialCliChatState } from './cli-chat-reducer';
import {
  type ChatContextChip,
  type ChatEvent,
  type CliChatId,
  type CliChatModelSettings,
  type CliChatPermissionMode,
  type CliChatSelectionContext,
  composeCliChatPrompt,
  DEFAULT_CLI_CHAT_PERMISSION_MODE,
  defaultCliChatModelSettings,
} from './cli-chat-types';
import { createParserState, parseStructuredChatChunk } from './parsing/stream-parser';

interface CliChatPanelProps {
  readonly bridge: OkDesktopBridge;
  readonly cli: CliChatId;
  readonly ptyId: string | null;
  readonly initialPrompt: string | null;
  readonly initialDisplayPrompt?: string;
  readonly context?: readonly ChatContextChip[];
  readonly selectionContext?: CliChatSelectionContext | null;
  readonly initialSessionId?: string | null;
  readonly onSessionId?: (sessionId: string) => void;
}

export function CliChatPanel({
  bridge,
  cli,
  ptyId,
  initialPrompt,
  initialDisplayPrompt,
  context = [],
  selectionContext = null,
  initialSessionId = null,
  onSessionId,
}: CliChatPanelProps) {
  const { t } = useLingui();
  const [state, dispatch] = useReducer(cliChatReducer, initialSessionId, createInitialCliChatState);
  const [draft, setDraft] = useState('');
  const [permissionMode, setPermissionMode] = useState<CliChatPermissionMode>(
    DEFAULT_CLI_CHAT_PERMISSION_MODE,
  );
  const [modelSettings, setModelSettings] = useState<CliChatModelSettings>(() =>
    defaultCliChatModelSettings(cli),
  );
  const [attachedSelection, setAttachedSelection] = useState<CliChatSelectionContext | null>(null);
  const parserRef = useRef(createParserState());
  const initialSentRef = useRef(false);

  async function sendPrompt(
    prompt: string,
    displayPrompt = prompt,
    displaySelection: CliChatSelectionContext | null = null,
  ): Promise<boolean> {
    const trimmed = prompt.trim();
    if (trimmed === '' || ptyId === null || state.running) return false;
    dispatch({
      type: 'send',
      text: displayPrompt.trim() || trimmed,
      ...(displaySelection === null ? {} : { selectionContext: displaySelection }),
    });
    let installed = false;
    try {
      if (cli === 'claude') {
        installed = (await bridge.terminal.claudePreflight()).claude === 'present';
      } else {
        installed = (await bridge.terminal.cliPreflight(cli)).onPath === 'present';
      }
    } catch {
      installed = false;
    }
    if (!installed) {
      const name = cli === 'codex' ? 'Codex' : 'Claude';
      dispatch({
        type: 'events',
        events: [
          { type: 'error', message: `${name} CLI is not available on PATH.` },
          { type: 'done', exitCode: 127 },
        ],
      });
      return false;
    }
    parserRef.current = createParserState();
    bridge.terminal.chatSend(ptyId, {
      cli,
      prompt: trimmed,
      sessionId: state.sessionId,
      permissionMode,
      modelSettings,
    });
    return true;
  }

  const sendInitialPrompt = useEffectEvent(sendPrompt);

  useEffect(() => {
    if (ptyId === null || initialPrompt === null || initialSentRef.current) return;
    initialSentRef.current = true;
    void sendInitialPrompt(initialPrompt, initialDisplayPrompt ?? initialPrompt);
  }, [initialDisplayPrompt, initialPrompt, ptyId]);

  useEffect(() => {
    if (selectionContext !== null) setAttachedSelection(selectionContext);
  }, [selectionContext]);

  useEffect(() => {
    if (ptyId === null) return;
    const unsubscribeData = bridge.terminal.onData((message) => {
      if (message.ptyId !== ptyId) return;
      const parsed = parseStructuredChatChunk(cli, message.data, parserRef.current);
      parserRef.current = parsed.state;
      if (parsed.events.length > 0) {
        dispatch({ type: 'events', events: parsed.events });
        for (const event of parsed.events) {
          if (event.type === 'session') onSessionId?.(event.sessionId);
        }
      }
    });
    const unsubscribeExit = bridge.terminal.onExit((message) => {
      if (message.ptyId !== ptyId) return;
      const events: ChatEvent[] = [
        { type: 'error', message: t`The CLI process exited unexpectedly.` },
        { type: 'done', exitCode: message.exitCode },
      ];
      dispatch({ type: 'events', events });
    });
    return () => {
      unsubscribeData();
      unsubscribeExit();
    };
  }, [bridge, cli, onSessionId, ptyId, t]);

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.trim() === '') return;
    const instruction = draft;
    const selection = attachedSelection;
    const prompt = composeCliChatPrompt(instruction, selection);
    void sendPrompt(prompt, instruction, selection).then((sent) => {
      if (!sent) return;
      setDraft('');
      setAttachedSelection((current) => (current === selection ? null : current));
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function interrupt() {
    if (ptyId === null || !state.running) return;
    bridge.terminal.input(ptyId, '\u0003');
    dispatch({ type: 'interrupt' });
  }

  return (
    <section aria-label={t`Chat`} className="flex h-full min-h-0 flex-col bg-background">
      {context.length > 0 ? (
        <fieldset className="flex min-w-0 flex-wrap gap-1.5 border-x-0 border-t-0 border-b border-border px-3 py-2">
          <legend className="sr-only">{t`Context`}</legend>
          {context.map((chip) => (
            <span
              key={`${chip.kind}-${chip.label}`}
              className="max-w-56 truncate rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
              title={chip.label}
            >
              {chip.kind === 'selection' ? t`Selection` : chip.label}
            </span>
          ))}
        </fieldset>
      ) : null}
      <ChatMessageList timeline={state.timeline} running={state.running} />
      <form onSubmit={submit} className="border-t border-border p-3">
        <div
          data-chat-composer="true"
          className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-input bg-background shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        >
          {attachedSelection !== null ? (
            <div
              data-chat-selection="true"
              className="mx-2 mt-2 flex min-w-0 items-center gap-1.5 rounded-lg bg-muted/70 px-2 py-1 text-xs text-muted-foreground"
              title={`${attachedSelection.documentTitle} — ${attachedSelection.documentPath}`}
            >
              <TextQuoteIcon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="shrink-0 font-medium text-foreground">
                {attachedSelection.lineCount === 1
                  ? t`1 line selected`
                  : t`${attachedSelection.lineCount} lines selected`}
              </span>
              <span className="min-w-0 truncate">· {attachedSelection.documentTitle}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="ml-auto -mr-1 size-5"
                onClick={() => setAttachedSelection(null)}
                aria-label={t`Remove selected lines`}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          <Textarea
            aria-label={t`Message`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t`Message ${cli === 'codex' ? 'Codex' : 'Claude'}`}
            disabled={ptyId === null}
            rows={2}
            className="max-h-40 min-h-12 resize-none border-0 bg-transparent px-3 pt-3 pb-1 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          />
          <div
            data-chat-composer-actions="true"
            className="flex items-center justify-between px-2 pb-2 pt-1"
          >
            <div className="flex min-w-0 items-center gap-1">
              <CliChatModelMenu
                cli={cli}
                value={modelSettings}
                onValueChange={setModelSettings}
                disabled={state.running}
              />
              <CliChatPermissionMenu
                value={permissionMode}
                onValueChange={setPermissionMode}
                disabled={state.running}
              />
            </div>
            {state.running ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={interrupt}
                aria-label={t`Stop`}
              >
                <SquareIcon />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={ptyId === null || draft.trim() === ''}
                aria-label={t`Send`}
              >
                <SendIcon />
              </Button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
