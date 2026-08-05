import { useLingui } from '@lingui/react/macro';
import {
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CopyIcon,
  FileCode2Icon,
  FileInputIcon,
  GitBranchIcon,
  Globe2Icon,
  LoaderCircleIcon,
  PencilIcon,
  RefreshCcwIcon,
  ReplaceIcon,
  SparklesIcon,
  SquareTerminalIcon,
  TextQuoteIcon,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { cn } from '@/lib/utils';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatSourceExplorer } from './ChatSourceExplorer';
import { collectChatSources } from './chat-sources';
import type {
  ChatActivity,
  ChatMessage,
  ChatTimelineEntry,
  CliChatSelectionContext,
} from './cli-chat-types';

interface ChatMessageListProps {
  readonly timeline: readonly ChatTimelineEntry[];
  readonly running: boolean;
  readonly bridge: OkDesktopBridge;
  readonly historyLoading?: boolean;
  readonly historyError?: boolean;
  readonly onRetryHistory?: () => void;
  readonly onRetryMessage?: (message: ChatMessage) => void;
  readonly onEditMessage?: (message: ChatMessage) => void;
  readonly onBranchMessage?: (message: ChatMessage) => void;
  readonly onInsertInDocument?: (text: string) => void;
  readonly onReplaceSelection?: (text: string) => void;
  readonly progressLabel?: string;
  readonly elapsedSeconds?: number;
  readonly toolProgress?: string;
  readonly emptyDocumentTitle?: string;
  readonly emptyHasSelection?: boolean;
  readonly emptyAgentLabel?: string;
  readonly emptyPermissionLabel?: string;
  readonly onChooseStarter?: (prompt: string) => void;
}

type ActivityVisualState = 'working' | 'completed' | 'failed' | 'idle';

function activityVisualState(
  entry: ChatActivity,
  index: number,
  timelineLength: number,
  running: boolean,
): ActivityVisualState {
  if (entry.kind === 'error') return 'failed';
  if (entry.kind === 'status') {
    return running && index === timelineLength - 1 ? 'working' : 'idle';
  }
  const detail = entry.detail?.toLowerCase();
  if (detail?.includes('fail') || detail?.includes('error') || detail?.includes('cancel')) {
    return 'failed';
  }
  if (detail !== undefined) return 'completed';
  return running && index === timelineLength - 1 ? 'working' : 'idle';
}

function GenerationDots() {
  return (
    <span
      data-chat-generation-dots="true"
      aria-hidden="true"
      className="inline-flex h-3 items-center gap-1"
    >
      <span className="size-1 animate-chat-generation-dot rounded-full bg-current [animation-delay:-450ms] motion-reduce:animate-none" />
      <span className="size-1 animate-chat-generation-dot rounded-full bg-current [animation-delay:-300ms] motion-reduce:animate-none" />
      <span className="size-1 animate-chat-generation-dot rounded-full bg-current [animation-delay:-150ms] motion-reduce:animate-none" />
    </span>
  );
}

function ToolTypeIcon({
  entry,
  visualState,
}: {
  entry: ChatActivity;
  visualState: ActivityVisualState;
}) {
  const category = entry.category ?? 'tool';
  const Icon =
    category === 'command'
      ? SquareTerminalIcon
      : category === 'file'
        ? FileCode2Icon
        : category === 'web_search'
          ? Globe2Icon
          : category === 'workflow'
            ? WorkflowIcon
            : WrenchIcon;
  return (
    <Icon
      aria-hidden="true"
      data-chat-tool-icon={category}
      className={cn(
        'mt-0.5 size-3 shrink-0',
        visualState === 'working' && 'animate-chat-tool-working motion-reduce:animate-none',
      )}
    />
  );
}

function ActivityLeadingIcon({
  entry,
  visualState,
}: {
  entry: ChatActivity;
  visualState: ActivityVisualState;
}) {
  if (entry.kind === 'tool') return <ToolTypeIcon entry={entry} visualState={visualState} />;
  if (entry.kind === 'error') {
    return <CircleAlertIcon className="mt-0.5 size-3 shrink-0" />;
  }
  return (
    <LoaderCircleIcon
      className={cn(
        'mt-0.5 size-3 shrink-0',
        visualState === 'working' && 'animate-spin motion-reduce:animate-none',
      )}
    />
  );
}

function ToolStatusIcon({ visualState }: { visualState: ActivityVisualState }) {
  if (visualState === 'completed') {
    return (
      <CheckIcon
        aria-hidden="true"
        data-chat-tool-status="completed"
        className="size-3 shrink-0 animate-chat-tool-complete text-primary motion-reduce:animate-none"
      />
    );
  }
  if (visualState === 'failed') {
    return (
      <CircleAlertIcon
        aria-hidden="true"
        data-chat-tool-status="failed"
        className="size-3 shrink-0"
      />
    );
  }
  return null;
}

function ActivityLabel({
  entry,
  visualState,
}: {
  entry: ChatActivity;
  visualState: ActivityVisualState;
}) {
  const label = `${entry.label}${entry.detail ? ` · ${entry.detail}` : ''}`;
  return (
    <span className="flex min-w-0 items-center gap-1" title={label}>
      <span className="min-w-0 truncate">{label}</span>
      {entry.kind === 'tool' ? <ToolStatusIcon visualState={visualState} /> : null}
      {entry.kind === 'status' && visualState === 'working' ? (
        <span className="ml-1.5 text-primary/70">
          <GenerationDots />
        </span>
      ) : null}
    </span>
  );
}

function ChatActivityEntry({
  entry,
  visualState,
}: {
  entry: ChatActivity;
  visualState: ActivityVisualState;
}) {
  const activityClassName = cn(
    'mr-auto min-w-0 max-w-[88%] animate-chat-activity border-l border-border py-0.5 pl-2 text-xs text-muted-foreground transition-[border-color,color,opacity] duration-200 motion-reduce:animate-none motion-reduce:transition-none',
    visualState === 'working' && 'border-primary/50 text-foreground/80',
    visualState === 'failed' && 'border-destructive/60 text-destructive',
  );
  const expandable =
    (visualState === 'completed' || visualState === 'failed') && entry.fullDetail !== undefined;

  if (expandable && entry.fullDetail !== undefined) {
    return (
      <details
        data-chat-entry="activity"
        data-chat-activity-state={visualState}
        data-chat-tool-expandable="true"
        data-chat-error-expandable={visualState === 'failed' ? 'true' : undefined}
        className={cn(activityClassName, 'group w-full')}
      >
        <summary className="flex cursor-pointer list-none items-start gap-1.5 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <ActivityLeadingIcon entry={entry} visualState={visualState} />
          <span className="min-w-0 flex-1">
            <ActivityLabel entry={entry} visualState={visualState} />
            {entry.summary !== undefined ? (
              <span
                data-chat-tool-summary="true"
                data-chat-error-summary={visualState === 'failed' ? 'true' : undefined}
                className={cn(
                  'mt-0.5 block truncate text-[11px]',
                  visualState === 'failed' ? 'text-destructive/80' : 'text-muted-foreground/80',
                )}
                title={entry.summary}
              >
                {entry.summary}
              </span>
            ) : null}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="mt-0.5 size-3 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <pre
          data-chat-tool-details="true"
          data-chat-error-details={visualState === 'failed' ? 'true' : undefined}
          className={cn(
            'mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap rounded-md px-2 py-1.5 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere]',
            visualState === 'failed'
              ? 'bg-destructive/5 text-destructive'
              : 'bg-muted/50 text-foreground/80',
          )}
        >
          {entry.fullDetail}
        </pre>
      </details>
    );
  }

  return (
    <div
      data-chat-entry="activity"
      data-chat-activity-state={visualState}
      className={cn(activityClassName, 'flex items-start gap-1.5')}
    >
      <ActivityLeadingIcon entry={entry} visualState={visualState} />
      <ActivityLabel entry={entry} visualState={visualState} />
    </div>
  );
}

function SentSelectionContext({ selection }: { selection: CliChatSelectionContext }) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const lineLabel =
    selection.lineCount === 1 ? t`1 line selected` : t`${selection.lineCount} lines selected`;
  const location =
    selection.startLine === undefined
      ? selection.documentPath
      : `${selection.documentPath}:${selection.startLine}${
          selection.endLine === undefined || selection.endLine === selection.startLine
            ? ''
            : `-${selection.endLine}`
        }`;
  const normalized = selection.markdown.replace(/\s+/g, ' ').trim();
  const snippetLimit = 180;
  const snippet =
    normalized.length <= snippetLimit
      ? normalized
      : `${normalized
          .slice(0, snippetLimit)
          .replace(/\s+\S*$/, '')
          .trimEnd()}…`;
  const sourceLabel = /\.pdf$/i.test(selection.documentPath) ? t`PDF selection` : t`Selection`;

  return (
    <section
      data-chat-sent-selection="true"
      aria-label={t`Attached context: ${selection.documentTitle}`}
      className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm transition-[border-color,box-shadow] hover:border-border hover:shadow-md"
    >
      <Button
        type="button"
        variant="ghost"
        className="block h-auto min-h-0 w-full cursor-pointer whitespace-normal rounded-none px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={expanded}
        aria-label={expanded ? t`Collapse attached context` : t`Expand attached context`}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
            <TextQuoteIcon aria-hidden="true" className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="min-w-0 truncate text-xs font-semibold"
                title={selection.documentTitle}
              >
                {selection.documentTitle}
              </span>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {sourceLabel}
              </span>
            </span>
            <span
              className="mt-0.5 block truncate text-[11px] text-muted-foreground"
              title={location}
            >
              {location}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            {lineLabel}
            <ChevronDownIcon
              aria-hidden="true"
              className={cn(
                'size-3.5 transition-transform duration-200 motion-reduce:transition-none',
                expanded && 'rotate-180',
              )}
            />
          </span>
        </span>
        {!expanded ? (
          <span
            data-chat-context-snippet="true"
            className="mt-2 block text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
          >
            {snippet}
          </span>
        ) : null}
      </Button>
      {expanded ? (
        <div
          data-chat-context-full="true"
          className="border-t border-border/70 bg-muted/20 px-3 py-3"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t`Selected passage`}
          </div>
          <blockquote className="max-h-80 overflow-y-auto whitespace-pre-wrap border-l-2 border-primary/40 pl-3 text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {selection.markdown}
          </blockquote>
        </div>
      ) : null}
    </section>
  );
}

function MessageActions({
  message,
  retryable,
  onRetry,
  onEdit,
  onBranch,
  onInsertInDocument,
  onReplaceSelection,
}: {
  readonly message: ChatMessage;
  readonly retryable: boolean;
  readonly onRetry?: (message: ChatMessage) => void;
  readonly onEdit?: (message: ChatMessage) => void;
  readonly onBranch?: (message: ChatMessage) => void;
  readonly onInsertInDocument?: (text: string) => void;
  readonly onReplaceSelection?: (text: string) => void;
}) {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);

  function copyMessage() {
    void navigator.clipboard
      .writeText(message.text)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  return (
    <div
      data-chat-message-actions="true"
      className="flex items-center gap-0.5 px-1 opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={copyMessage}
        aria-label={copied ? t`Copied` : t`Copy message`}
      >
        {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </Button>
      {message.role === 'user' && onEdit !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onEdit(message)}
          aria-label={t`Edit message`}
        >
          <PencilIcon aria-hidden="true" />
        </Button>
      ) : null}
      {message.role === 'assistant' && onInsertInDocument !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onInsertInDocument(message.text)}
          aria-label={t`Insert into document`}
        >
          <FileInputIcon aria-hidden="true" />
        </Button>
      ) : null}
      {message.role === 'assistant' && onReplaceSelection !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onReplaceSelection(message.text)}
          aria-label={t`Replace selection`}
        >
          <ReplaceIcon aria-hidden="true" />
        </Button>
      ) : null}
      {retryable && onRetry !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onRetry(message)}
          aria-label={message.role === 'assistant' ? t`Regenerate response` : t`Retry message`}
        >
          <RefreshCcwIcon aria-hidden="true" />
        </Button>
      ) : null}
      {onBranch !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onBranch(message)}
          aria-label={t`Branch from message`}
        >
          <GitBranchIcon aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

export function ChatMessageList({
  timeline,
  running,
  bridge,
  historyLoading = false,
  historyError = false,
  onRetryHistory,
  onRetryMessage,
  onEditMessage,
  onBranchMessage,
  onInsertInDocument,
  onReplaceSelection,
  progressLabel,
  elapsedSeconds = 0,
  toolProgress,
  emptyDocumentTitle,
  emptyHasSelection = false,
  emptyAgentLabel,
  emptyPermissionLabel,
  onChooseStarter,
}: ChatMessageListProps) {
  const { t } = useLingui();
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastEntry = timeline.at(-1);
  let latestUserIndex = -1;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const candidate = timeline[index];
    if (candidate?.type === 'message' && candidate.role === 'user') {
      latestUserIndex = index;
      break;
    }
  }
  const lastEntryContent = `${lastEntry?.id ?? ''}:${
    lastEntry?.type === 'message'
      ? lastEntry.text
      : `${lastEntry?.label ?? ''}${lastEntry?.detail ?? ''}`
  }`;

  useEffect(() => {
    // Re-run as streamed text or the chronological feed grows.
    void lastEntryContent;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lastEntryContent]);

  if (!timeline.some((entry) => entry.type === 'message')) {
    if (historyLoading) {
      return (
        <div
          role="status"
          className="flex min-h-0 flex-1 items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"
        >
          <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
          {t`Loading previous chat…`}
        </div>
      );
    }
    if (historyError) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
          <CircleAlertIcon aria-hidden="true" className="size-5 text-destructive" />
          <p>{t`This previous chat could not be loaded.`}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetryHistory}>
            {t`Try again`}
          </Button>
        </div>
      );
    }
    const starterPrompts = emptyHasSelection
      ? [t`Explain the selected passage`, t`Check the selected claims and sources`]
      : emptyDocumentTitle === undefined
        ? [t`Find related notes in this project`, t`Summarize recent project context`]
        : [
            t`Summarize the current document`,
            t`Find related notes`,
            t`Check claims and sources`,
            t`Suggest focused improvements`,
          ];
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <SparklesIcon aria-hidden="true" className="size-4" />
          </span>
          <h3 className="mt-3 text-sm font-medium text-foreground">
            {emptyDocumentTitle === undefined
              ? t`Ask about this project`
              : t`Ask about ${emptyDocumentTitle}`}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {emptyHasSelection
              ? t`The selected passage will be included with your message.`
              : t`Choose a starting point or write your own request.`}
          </p>
          {emptyAgentLabel === undefined ? null : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {emptyAgentLabel}
              {emptyPermissionLabel === undefined ? '' : ` · ${emptyPermissionLabel}`}
            </p>
          )}
          {onChooseStarter === undefined ? null : (
            <div className="mt-4 grid gap-2 text-left">
              {starterPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto justify-start whitespace-normal py-2 text-xs"
                  onClick={() => onChooseStarter(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="log"
      aria-live={running ? 'off' : 'polite'}
      aria-busy={running}
      aria-label={t`Conversation`}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
    >
      <div className="mx-auto flex min-w-0 w-full max-w-3xl flex-col gap-3">
        {timeline.map((entry, index) => {
          if (entry.type === 'message') {
            const sources = entry.role === 'assistant' ? collectChatSources(timeline, index) : [];
            const generating =
              entry.role === 'assistant' && running && index === timeline.length - 1;
            const messageBubble = (
              <article
                data-chat-entry="message"
                data-chat-motion={entry.role === 'user' ? 'send' : 'assistant'}
                data-chat-generating={generating ? 'true' : undefined}
                aria-label={entry.role === 'user' ? t`You` : t`Assistant`}
                className={cn(
                  'min-w-0 w-fit max-w-[88%] transform-gpu overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed motion-reduce:animate-none',
                  entry.role === 'user'
                    ? 'ml-auto max-w-full origin-bottom-right animate-chat-send bg-primary text-primary-foreground'
                    : 'mr-auto origin-bottom-left animate-chat-assistant border border-border bg-muted/40 text-foreground',
                )}
              >
                <ChatMarkdown text={entry.text} bridge={bridge} />
                {generating ? (
                  <span className="mt-2 flex text-primary/70">
                    <GenerationDots />
                  </span>
                ) : null}
              </article>
            );
            let precedingUser: ChatMessage | undefined = entry.role === 'user' ? entry : undefined;
            if (entry.role === 'assistant') {
              for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
                const candidate = timeline[cursor];
                if (candidate?.type === 'message' && candidate.role === 'user') {
                  precedingUser = candidate;
                  break;
                }
              }
            }
            const retryTarget = entry.role === 'assistant' ? precedingUser : entry;
            const retryable =
              !running &&
              retryTarget !== undefined &&
              timeline.indexOf(retryTarget) === latestUserIndex;
            const messageActions = (
              <MessageActions
                message={entry}
                retryable={retryable}
                onRetry={
                  retryable && retryTarget !== undefined && onRetryMessage !== undefined
                    ? () => onRetryMessage(retryTarget)
                    : undefined
                }
                onEdit={onEditMessage}
                onBranch={onBranchMessage}
                onInsertInDocument={onInsertInDocument}
                onReplaceSelection={onReplaceSelection}
              />
            );
            if (entry.role === 'user' && entry.selectionContext !== undefined) {
              return (
                <div
                  key={entry.id}
                  data-chat-message-group="selection"
                  className="ml-auto flex w-full max-w-[88%] flex-col items-end gap-1.5"
                >
                  <div className="w-full min-w-0">
                    <SentSelectionContext selection={entry.selectionContext} />
                  </div>
                  {messageBubble}
                  {messageActions}
                </div>
              );
            }
            if (entry.role === 'assistant' && sources.length > 0) {
              return (
                <div
                  key={entry.id}
                  data-chat-message-group="assistant-with-sources"
                  className="mr-auto flex w-full max-w-[88%] flex-col items-start gap-1"
                >
                  {messageBubble}
                  {messageActions}
                  <ChatSourceExplorer sources={sources} bridge={bridge} />
                </div>
              );
            }
            return (
              <div
                key={entry.id}
                className={cn(
                  'flex flex-col gap-0.5',
                  entry.role === 'user' ? 'items-end' : 'items-start',
                )}
              >
                {messageBubble}
                {messageActions}
              </div>
            );
          }

          const visualState = activityVisualState(entry, index, timeline.length, running);
          return <ChatActivityEntry key={entry.id} entry={entry} visualState={visualState} />;
        })}
        {running && progressLabel !== undefined ? (
          <div
            role="status"
            aria-live="polite"
            data-chat-turn-progress="true"
            className="mr-auto flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-3 animate-spin motion-reduce:animate-none"
            />
            <span>{progressLabel}</span>
            <span aria-hidden="true">·</span>
            <time>{`${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`}</time>
            {toolProgress === undefined ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span>{t`${toolProgress} tools`}</span>
              </>
            )}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}
