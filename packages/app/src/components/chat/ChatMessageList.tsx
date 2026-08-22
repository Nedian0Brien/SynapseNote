import { useLingui } from '@lingui/react/macro';
import { TERMINAL_CLIS } from '@nedian0brien/synapsenote-core';
import {
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  FileCode2Icon,
  Globe2Icon,
  LoaderCircleIcon,
  SquareTerminalIcon,
  TextQuoteIcon,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TargetIcon } from '@/components/handoff/OpenInAgentMenuItem';
import { cliIconTargetId } from '@/components/handoff/terminal-cli-display';
import { Button } from '@/components/ui/button';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { cn } from '@/lib/utils';
import { ChatMarkdown } from './ChatMarkdown';
import type {
  ChatActivity,
  ChatTimelineEntry,
  CliChatId,
  CliChatImageAttachment,
  CliChatSelectionContext,
} from './cli-chat-types';
import { WebPreviewCards } from './WebPreviewCards';
import { extractWebPreviewLinks } from './web-preview-links';

interface ChatMessageListProps {
  readonly timeline: readonly ChatTimelineEntry[];
  readonly running: boolean;
  readonly bridge: OkDesktopBridge;
  readonly emptyLabel?: string;
  readonly emptyLoading?: boolean;
  readonly providerOptions?: readonly CliChatId[];
  readonly selectedProvider?: CliChatId;
  readonly onProviderSelect?: (provider: CliChatId) => void;
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
    'w-full min-w-0 animate-chat-activity border-l border-border py-0.5 pl-2 text-xs text-muted-foreground transition-[border-color,color,opacity] duration-200 motion-reduce:animate-none motion-reduce:transition-none',
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

/**
 * Images the user attached to a turn, shown above their bubble. The agent got
 * the file path, but the reader needs to see WHICH picture they sent — a
 * filename row would make a scrolled-back conversation unreadable.
 */
function SentImageAttachments({ images }: { images: readonly CliChatImageAttachment[] }) {
  const { t } = useLingui();
  return (
    <ul data-chat-sent-images="true" className="flex flex-wrap justify-end gap-1.5">
      {images.map((image) => {
        const label = image.path.split('/').at(-1) ?? image.path;
        return (
          <li key={image.path}>
            <img
              data-chat-sent-image={image.path}
              src={image.previewSrc}
              alt={
                image.alt === undefined || image.alt === ''
                  ? t`Attached image: ${label}`
                  : image.alt
              }
              title={image.path}
              className="size-16 rounded-lg border border-border bg-muted object-cover"
            />
          </li>
        );
      })}
    </ul>
  );
}

function SentSelectionContext({ selection }: { selection: CliChatSelectionContext }) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const blockReference = selection.blockReference;
  if (blockReference !== undefined) {
    const metadata = [blockReference.title, blockReference.language]
      .filter((value): value is string => value !== undefined && value !== '')
      .join(' · ');
    return (
      <section
        data-chat-sent-selection="true"
        data-chat-sent-block-reference="true"
        aria-label={t`Attached context: ${selection.documentTitle}`}
        className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card px-3 py-2.5 text-card-foreground shadow-sm"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
            <TextQuoteIcon aria-hidden="true" className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold" title={selection.documentTitle}>
              {selection.documentTitle}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {selection.documentPath}
            </span>
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {t`Code block ${blockReference.index}`}
          </span>
        </span>
        {metadata === '' ? null : (
          <span className="mt-2 block text-xs text-muted-foreground">{metadata}</span>
        )}
      </section>
    );
  }
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

export function ChatMessageList({
  timeline,
  running,
  bridge,
  emptyLabel,
  emptyLoading = false,
  providerOptions = [],
  selectedProvider,
  onProviderSelect,
}: ChatMessageListProps) {
  const { t } = useLingui();
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastEntry = timeline.at(-1);
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
    const showProviderChooser =
      !emptyLoading && onProviderSelect !== undefined && providerOptions.length > 0;
    return (
      <div
        role={emptyLoading ? 'status' : undefined}
        data-chat-history-loading={emptyLoading ? 'true' : undefined}
        className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground"
      >
        {emptyLoading ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            <span>{emptyLabel ?? t`Ask about your current document or project.`}</span>
          </span>
        ) : showProviderChooser ? (
          <section
            aria-labelledby="new-chat-provider-heading"
            className="@container/provider w-full max-w-xl px-2 sm:px-4"
            data-chat-provider-surface="true"
          >
            <h2
              id="new-chat-provider-heading"
              className="text-xl font-semibold tracking-tight text-foreground"
            >
              {t`Start a new chat`}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {emptyLabel ?? t`Ask about your current document or project.`}
            </p>
            <fieldset
              className="mt-6 grid w-full gap-3 @min-[28rem]/provider:grid-cols-2"
              data-chat-provider-chooser="true"
            >
              <legend className="sr-only">{t`Choose a model provider`}</legend>
              {providerOptions.map((provider) => {
                const selected = provider === selectedProvider;
                const label = TERMINAL_CLIS[provider].displayName;
                const vendor = provider === 'claude' ? t`Anthropic` : t`OpenAI`;
                return (
                  <Button
                    key={provider}
                    type="button"
                    variant="outline"
                    className={cn(
                      'relative h-auto min-h-24 justify-start gap-3 rounded-2xl p-4 text-left shadow-none transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-sm motion-reduce:transform-none motion-reduce:transition-none',
                      selected && 'border-primary/50 bg-primary/5 ring-1 ring-primary/20',
                    )}
                    aria-label={label}
                    aria-pressed={selected}
                    onClick={() => onProviderSelect(provider)}
                  >
                    <TargetIcon
                      id={cliIconTargetId(provider)}
                      className="size-8"
                      aria-hidden="true"
                      data-chat-provider-icon={provider}
                    />
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                      <span className="text-base font-semibold text-foreground">{label}</span>
                      <span className="text-xs font-normal text-muted-foreground">{vendor}</span>
                    </span>
                    {selected ? (
                      <CheckIcon
                        aria-hidden="true"
                        className="absolute right-3 top-3 size-4 text-primary"
                      />
                    ) : null}
                  </Button>
                );
              })}
            </fieldset>
          </section>
        ) : (
          <span>{emptyLabel ?? t`Ask about your current document or project.`}</span>
        )}
      </div>
    );
  }

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label={t`Conversation`}
      className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto px-4 py-5"
    >
      <div className="mx-auto flex min-w-0 w-full max-w-3xl flex-col gap-3">
        {timeline.map((entry, index) => {
          if (entry.type === 'message') {
            let followsWebSearch = false;
            if (entry.role === 'assistant') {
              for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
                const prior = timeline[cursor];
                if (prior?.type === 'message' && prior.role === 'user') break;
                if (prior?.type === 'activity' && prior.category === 'web_search') {
                  followsWebSearch = true;
                  break;
                }
              }
            }
            const previewLinks = followsWebSearch ? extractWebPreviewLinks(entry.text) : [];
            const generating =
              entry.role === 'assistant' && running && index === timeline.length - 1;
            // User turns stay in a compact bubble; assistant turns are long-form
            // prose, so they drop the bubble and read across the full column.
            const messageBubble = (
              <article
                data-chat-entry="message"
                data-chat-motion={entry.role === 'user' ? 'send' : 'assistant'}
                data-chat-generating={generating ? 'true' : undefined}
                aria-label={entry.role === 'user' ? t`You` : t`Assistant`}
                className={cn(
                  'min-w-0 transform-gpu text-sm leading-relaxed motion-reduce:animate-none',
                  entry.role === 'user'
                    ? 'ml-auto w-fit max-w-[88%] origin-bottom-right animate-chat-send overflow-hidden rounded-2xl bg-primary px-3.5 py-2.5 text-primary-foreground'
                    : 'w-full max-w-full animate-chat-assistant py-1 text-foreground',
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
            const sentImages = entry.role === 'user' ? (entry.imageAttachments ?? []) : [];
            if (
              entry.role === 'user' &&
              (entry.selectionContext !== undefined || sentImages.length > 0)
            ) {
              return (
                <div
                  key={entry.id}
                  data-chat-message-group={
                    entry.selectionContext !== undefined ? 'selection' : 'images'
                  }
                  className="flex w-full min-w-0 flex-col items-end gap-1.5"
                >
                  {entry.selectionContext !== undefined ? (
                    <div className="w-full min-w-0">
                      <SentSelectionContext selection={entry.selectionContext} />
                    </div>
                  ) : null}
                  {sentImages.length > 0 ? <SentImageAttachments images={sentImages} /> : null}
                  {messageBubble}
                </div>
              );
            }
            if (entry.role === 'assistant' && previewLinks.length > 0) {
              return (
                <div
                  key={entry.id}
                  data-chat-message-group="assistant-with-sources"
                  className="flex w-full min-w-0 flex-col items-start gap-1"
                >
                  {messageBubble}
                  <WebPreviewCards links={previewLinks} bridge={bridge} />
                </div>
              );
            }
            return (
              <div key={entry.id} className="w-full min-w-0 max-w-full">
                {messageBubble}
              </div>
            );
          }

          const visualState = activityVisualState(entry, index, timeline.length, running);
          return <ChatActivityEntry key={entry.id} entry={entry} visualState={visualState} />;
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
