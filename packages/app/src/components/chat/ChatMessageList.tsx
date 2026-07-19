import { useLingui } from '@lingui/react/macro';
import {
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  TextQuoteIcon,
  WrenchIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { cn } from '@/lib/utils';
import { ChatMarkdown } from './ChatMarkdown';
import type { ChatActivity, ChatTimelineEntry, CliChatSelectionContext } from './cli-chat-types';
import { WebPreviewCards } from './WebPreviewCards';
import { extractWebPreviewLinks } from './web-preview-links';

interface ChatMessageListProps {
  readonly timeline: readonly ChatTimelineEntry[];
  readonly running: boolean;
  readonly bridge: OkDesktopBridge;
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

function ActivityIcon({
  entry,
  visualState,
}: {
  entry: ChatActivity;
  visualState: ActivityVisualState;
}) {
  if (entry.kind === 'tool') {
    if (visualState === 'completed') {
      return (
        <CheckIcon
          data-chat-tool-icon="completed"
          className="mt-0.5 size-3 shrink-0 animate-chat-tool-complete text-primary motion-reduce:animate-none"
        />
      );
    }
    if (visualState === 'failed') {
      return <CircleAlertIcon data-chat-tool-icon="failed" className="mt-0.5 size-3 shrink-0" />;
    }
    return (
      <WrenchIcon
        data-chat-tool-icon={visualState}
        className={cn(
          'mt-0.5 size-3 shrink-0',
          visualState === 'working' && 'animate-chat-tool-working motion-reduce:animate-none',
        )}
      />
    );
  }
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

function ActivityLabel({
  entry,
  visualState,
}: {
  entry: ChatActivity;
  visualState: ActivityVisualState;
}) {
  const label = `${entry.label}${entry.detail ? ` · ${entry.detail}` : ''}`;
  return (
    <span className="block min-w-0 truncate" title={label}>
      {label}
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
          <ActivityIcon entry={entry} visualState={visualState} />
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
      <ActivityIcon entry={entry} visualState={visualState} />
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

export function ChatMessageList({ timeline, running, bridge }: ChatMessageListProps) {
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
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {t`Ask about your current document or project.`}
      </div>
    );
  }

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label={t`Conversation`}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
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
                </div>
              );
            }
            if (entry.role === 'assistant' && previewLinks.length > 0) {
              return (
                <div
                  key={entry.id}
                  data-chat-message-group="assistant-with-sources"
                  className="mr-auto flex w-full max-w-[88%] flex-col items-start gap-1"
                >
                  {messageBubble}
                  <WebPreviewCards links={previewLinks} bridge={bridge} />
                </div>
              );
            }
            return <div key={entry.id}>{messageBubble}</div>;
          }

          const visualState = activityVisualState(entry, index, timeline.length, running);
          return <ChatActivityEntry key={entry.id} entry={entry} visualState={visualState} />;
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
