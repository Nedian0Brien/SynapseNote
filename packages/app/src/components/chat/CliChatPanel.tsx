import { useLingui } from '@lingui/react/macro';
import { SendIcon, SquareIcon, TextQuoteIcon, XIcon } from 'lucide-react';
import {
  type KeyboardEvent,
  type SyntheticEvent,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { lightRenderMarkdownPreview } from '@/editor/selection-context';
import { ConfigContext } from '@/lib/config-context';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { recordOnboardingAskedAi } from '@/lib/onboarding-signals';
import { ChatMessageList } from './ChatMessageList';
import { CliChatModelMenu } from './CliChatModelMenu';
import { CliChatPermissionMenu } from './CliChatPermissionMenu';
import { readCliChatPreferences, writeCliChatPreferences } from './cli-chat-preferences-store';
import { cliChatReducer, createInitialCliChatState } from './cli-chat-reducer';
import { shortCliChatTitle } from './cli-chat-title';
import {
  type ChatContextChip,
  type ChatEvent,
  type CliChatDocumentContext,
  type CliChatId,
  type CliChatImageAttachment,
  type CliChatModel,
  type CliChatModelSettings,
  type CliChatPermissionMode,
  type CliChatSelectionContext,
  composeCliChatPrompt,
  DEFAULT_CLI_CHAT_PERMISSION_MODE,
  defaultCliChatModelSettings,
} from './cli-chat-types';
import { createParserState, parseStructuredChatChunk } from './parsing/stream-parser';

/** Last path segment — the label a reader recognizes for an attached image. */
function attachmentBasename(path: string): string {
  return path.split('/').at(-1) ?? path;
}

interface CliChatPanelProps {
  readonly bridge: OkDesktopBridge;
  readonly cli: CliChatId;
  readonly ptyId: string | null;
  readonly isActive?: boolean;
  readonly initialPrompt: string | null;
  readonly initialDisplayPrompt?: string;
  readonly context?: readonly ChatContextChip[];
  readonly documentContext?: CliChatDocumentContext | null;
  readonly selectionContext?: CliChatSelectionContext | null;
  /** Images staged from a note's image block, shown as removable thumbnails in
   *  the composer. Owned by the pane so the attachment survives this panel
   *  remounting and so sending from one session clears it everywhere. */
  readonly imageAttachments?: readonly CliChatImageAttachment[];
  readonly onImageAttachmentsChange?: (next: readonly CliChatImageAttachment[]) => void;
  readonly initialSessionId?: string | null;
  readonly onSessionId?: (sessionId: string) => void;
  readonly onTitleChange?: (title: string) => void;
  readonly providerOptions?: readonly CliChatId[];
  readonly onProviderChange?: (provider: CliChatId) => void;
}

export function CliChatPanel({
  bridge,
  cli,
  ptyId,
  isActive = true,
  initialPrompt,
  initialDisplayPrompt,
  context = [],
  documentContext = null,
  selectionContext = null,
  imageAttachments = [],
  onImageAttachmentsChange,
  initialSessionId = null,
  onSessionId,
  onTitleChange,
  providerOptions = [],
  onProviderChange,
}: CliChatPanelProps) {
  const { t } = useLingui();
  const configContext = use(ConfigContext);
  const preferredModel: CliChatModel | undefined =
    cli === 'codex'
      ? configContext?.userConfig?.agents.chat.codexModel
      : configContext?.userConfig?.agents.chat.claudeModel;
  const defaultModelReady = configContext === null || configContext.userSynced;
  const [rememberedPreferences] = useState(() => readCliChatPreferences(cli));
  const [state, dispatch] = useReducer(cliChatReducer, initialSessionId, createInitialCliChatState);
  const [historyLoading, setHistoryLoading] = useState(initialSessionId !== null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<CliChatPermissionMode>(
    rememberedPreferences?.permissionMode ?? DEFAULT_CLI_CHAT_PERMISSION_MODE,
  );
  const [modelSettings, setModelSettings] = useState<CliChatModelSettings>(
    () => rememberedPreferences?.modelSettings ?? defaultCliChatModelSettings(cli, preferredModel),
  );
  const [dismissedSelection, setDismissedSelection] = useState<CliChatSelectionContext | null>(
    null,
  );
  const attachedSelection = selectionContext === dismissedSelection ? null : selectionContext;
  const attachedSelectionPreview =
    attachedSelection === null ? '' : lightRenderMarkdownPreview(attachedSelection.markdown);
  const parserRef = useRef(createParserState());
  const initialSentRef = useRef(false);
  // A resumed native conversation already owns its title; only a fresh session
  // derives one from the first user instruction.
  const titleReportedRef = useRef(initialSessionId !== null);
  const modelWasChangedRef = useRef(rememberedPreferences?.modelSettings !== undefined);
  const previousCliRef = useRef(cli);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (previousCliRef.current === cli) return;
    previousCliRef.current = cli;
    const preferences = readCliChatPreferences(cli);
    setPermissionMode(preferences?.permissionMode ?? DEFAULT_CLI_CHAT_PERMISSION_MODE);
    setModelSettings(
      preferences?.modelSettings ?? defaultCliChatModelSettings(cli, preferredModel),
    );
    modelWasChangedRef.current = preferences?.modelSettings !== undefined;
    parserRef.current = createParserState();
    initialSentRef.current = false;
    titleReportedRef.current = initialSessionId !== null;
  }, [cli, initialSessionId, preferredModel]);

  useEffect(() => {
    if (initialSessionId === null) {
      setHistoryLoading(false);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    void bridge.terminal
      .readChatSession(cli, initialSessionId)
      .then((messages) => {
        if (cancelled) return;
        dispatch({ type: 'hydrate', messages });
        setHistoryLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[chat] failed to restore native chat history:', error);
        setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, cli, initialSessionId]);

  useEffect(() => {
    if (configContext === null || !defaultModelReady || modelWasChangedRef.current) return;
    const next = defaultCliChatModelSettings(cli, preferredModel);
    setModelSettings((current) =>
      current.model === next.model && current.effort === next.effort && current.speed === next.speed
        ? current
        : next,
    );
  }, [cli, configContext, defaultModelReady, preferredModel]);

  async function sendPrompt(
    prompt: string,
    displayPrompt = prompt,
    displaySelection: CliChatSelectionContext | null = null,
    displayImages: readonly CliChatImageAttachment[] = [],
  ): Promise<boolean> {
    const trimmed = prompt.trim();
    if (trimmed === '' || ptyId === null || !state.transportReady) return false;
    setSendError(null);
    if (!titleReportedRef.current) {
      titleReportedRef.current = true;
      onTitleChange?.(
        shortCliChatTitle(displayPrompt, cli === 'codex' ? t`Codex chat` : t`Claude chat`),
      );
    }
    dispatch({
      type: 'send',
      text: displayPrompt.trim() || trimmed,
      ...(displaySelection === null ? {} : { selectionContext: displaySelection }),
      ...(displayImages.length === 0 ? {} : { imageAttachments: displayImages }),
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
      const message = `${name} CLI is not available on PATH.`;
      setSendError(message);
      dispatch({
        type: 'dispatch_rejected',
        message,
      });
      return false;
    }
    parserRef.current = createParserState();
    // The onboarding card's "Ask AI" step completes on a question that actually
    // reached an agent — this is the surface that dispatches one.
    recordOnboardingAskedAi();
    let dispatchResult: Awaited<ReturnType<typeof bridge.terminal.chatSend>>;
    try {
      dispatchResult = await bridge.terminal.chatSend(ptyId, {
        cli,
        prompt: trimmed,
        sessionId: state.sessionId,
        permissionMode,
        autoApproveOkTools: configContext?.userConfig?.agents.autoApproveOkTools ?? true,
        modelSettings,
      });
    } catch {
      dispatchResult = { ok: false, reason: 'dispatch-failed' };
    }
    if (!dispatchResult || !dispatchResult.ok) {
      setSendError(t`The chat turn could not be sent. Try again.`);
      dispatch({ type: 'dispatch_rejected' });
      return false;
    }
    return true;
  }

  const sendInitialPrompt = useEffectEvent(sendPrompt);

  useEffect(() => {
    if (ptyId === null || initialPrompt === null || initialSentRef.current || !defaultModelReady) {
      return;
    }
    initialSentRef.current = true;
    void sendInitialPrompt(
      composeCliChatPrompt(initialPrompt, documentContext, null),
      initialDisplayPrompt ?? initialPrompt,
    );
  }, [defaultModelReady, documentContext, initialDisplayPrompt, initialPrompt, ptyId]);

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
        { type: 'command_exit', exitCode: message.exitCode },
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
    const images = imageAttachments;
    const prompt = composeCliChatPrompt(instruction, documentContext, selection, images);
    void sendPrompt(prompt, instruction, selection, images).then((sent) => {
      if (!sent) return;
      setDraft('');
      setDismissedSelection(selection);
      // The staged images belong to this turn now — clearing them leaves the
      // composer empty for the next question instead of silently re-sending
      // the same picture with every follow-up.
      if (images.length > 0) onImageAttachmentsChange?.([]);
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
    <section
      aria-label={t`Chat`}
      className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-background"
    >
      <ChatMessageList
        timeline={state.timeline}
        running={state.running}
        isActive={isActive}
        bridge={bridge}
        emptyLabel={historyLoading ? t`Loading chat history` : undefined}
        emptyLoading={historyLoading}
        providerOptions={initialSessionId === null ? providerOptions : []}
        selectedProvider={cli}
        onProviderSelect={(provider) => {
          if (provider === cli) textareaRef.current?.focus();
          else onProviderChange?.(provider);
        }}
      />
      <form onSubmit={submit} className="min-w-0 max-w-full p-3">
        <div
          data-chat-composer="true"
          className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-input bg-background shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        >
          {context.length > 0 ? (
            <fieldset
              data-chat-composer-context="true"
              className="mx-2 mt-2 flex min-w-0 flex-wrap gap-1.5"
            >
              <legend className="sr-only">{t`Context`}</legend>
              {context.map((chip) => (
                <span
                  key={`${chip.kind}-${chip.label}`}
                  data-chat-context-chip="true"
                  className="max-w-56 truncate rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
                  title={chip.label}
                >
                  {chip.kind === 'selection' ? t`Selection` : chip.label}
                </span>
              ))}
            </fieldset>
          ) : null}
          {attachedSelection !== null ? (
            <div
              data-chat-selection="true"
              className="mx-2 mt-2 flex min-w-0 items-center gap-1.5 rounded-lg bg-muted/70 px-2 py-1 text-xs text-muted-foreground"
              title={`${attachedSelectionPreview}\n${attachedSelection.documentTitle} — ${attachedSelection.documentPath}`}
            >
              <TextQuoteIcon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="shrink-0 font-medium text-foreground">
                {attachedSelection.lineCount === 1
                  ? t`1 line selected`
                  : t`${attachedSelection.lineCount} lines selected`}
              </span>
              <span className="min-w-0 truncate" data-chat-selection-preview="true">
                · {attachedSelectionPreview || attachedSelection.documentTitle}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="ml-auto -mr-1 size-5"
                onClick={() => setDismissedSelection(attachedSelection)}
                aria-label={t`Remove selected lines`}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {sendError === null ? null : (
            <p role="alert" className="mx-3 mt-2 text-xs text-destructive">
              {sendError}
            </p>
          )}
          {imageAttachments.length > 0 ? (
            <ul
              data-chat-image-attachments="true"
              className="mx-2 mt-2 flex min-w-0 flex-wrap gap-2"
            >
              {imageAttachments.map((image) => {
                const label = attachmentBasename(image.path);
                return (
                  <li
                    key={image.path}
                    data-chat-image-attachment={image.path}
                    className="relative shrink-0"
                  >
                    {/* The thumbnail is the whole affordance: the reader
                        recognizes the picture they picked far faster than a
                        filename, and the path stays available on hover for the
                        rare same-looking pair. */}
                    <img
                      src={image.previewSrc}
                      alt={image.alt === undefined || image.alt === '' ? label : image.alt}
                      title={image.path}
                      className="size-14 rounded-lg border border-border bg-muted object-cover"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-xs"
                      className="-top-1.5 -right-1.5 absolute size-5 rounded-full border border-border shadow-sm"
                      onClick={() =>
                        onImageAttachmentsChange?.(
                          imageAttachments.filter((other) => other.path !== image.path),
                        )
                      }
                      aria-label={t`Remove attached image ${label}`}
                    >
                      <XIcon aria-hidden="true" className="size-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Textarea
            ref={textareaRef}
            aria-label={t`Message`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t`Message ${cli === 'codex' ? 'Codex' : 'Claude'}`}
            disabled={ptyId === null || historyLoading}
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
                onValueChange={(next) => {
                  modelWasChangedRef.current = true;
                  setModelSettings(next);
                  writeCliChatPreferences(cli, { modelSettings: next, permissionMode });
                }}
                disabled={!state.transportReady}
                onClose={() => textareaRef.current?.focus()}
              />
              <CliChatPermissionMenu
                value={permissionMode}
                onValueChange={(next) => {
                  setPermissionMode(next);
                  writeCliChatPreferences(cli, { modelSettings, permissionMode: next });
                }}
                disabled={!state.transportReady}
                onClose={() => textareaRef.current?.focus()}
              />
            </div>
            {!state.transportReady ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={interrupt}
                disabled={!state.running}
                aria-label={t`Stop`}
              >
                <SquareIcon />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={ptyId === null || historyLoading || draft.trim() === ''}
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
