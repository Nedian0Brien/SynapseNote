import { useLingui } from '@lingui/react/macro';
import { HistoryIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { TargetIcon } from '@/components/handoff/OpenInAgentMenuItem';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import type { TerminalLaunchIntent } from '../EditorPane';
import { cliIconTargetId } from '../handoff/terminal-cli-display';
import { TerminalGate } from '../TerminalGate';
import { CliChatPanel } from './CliChatPanel';
import type { CliChatDocumentContext, CliChatId, CliChatSelectionContext } from './cli-chat-types';

export interface CliChatHeaderSession {
  readonly id: string;
  readonly cli: CliChatId;
  readonly title: string;
  readonly openSessionId?: string;
  readonly resumeSessionId?: string;
  readonly updatedAt?: number;
  readonly preview?: string;
  readonly messageCount?: number;
}

interface CliChatSessionProps {
  readonly bridge: OkDesktopBridge;
  readonly cli: CliChatId;
  readonly launch: TerminalLaunchIntent;
  readonly adoptPtyId?: string | null;
  readonly onPtyId?: (ptyId: string | null) => void;
  readonly onTitleChange?: (title: string) => void;
  readonly onClose?: () => void;
  readonly documentContext?: CliChatDocumentContext | null;
  readonly selectionContext?: CliChatSelectionContext | null;
  readonly sessionId?: string;
  readonly title?: string;
  readonly sessions?: readonly CliChatHeaderSession[];
  readonly onSelectSession?: (id: string) => void;
  readonly onReloadSessions?: () => void;
  readonly onNewChat?: (cli: CliChatId) => void;
  readonly onNativeSessionId?: (sessionId: string) => void;
  readonly onBranchChat?: (cli: CliChatId, prompt: string, displayPrompt: string) => void;
  readonly onInsertChatResponse?: (text: string) => void;
  readonly onReplaceChatSelection?: (text: string) => void;
}

export function CliChatSession({
  bridge,
  cli,
  launch,
  adoptPtyId = null,
  onPtyId,
  onTitleChange,
  onClose,
  documentContext = null,
  selectionContext = null,
  sessionId,
  title,
  sessions = [],
  onSelectSession,
  onReloadSessions,
  onNewChat,
  onNativeSessionId,
  onBranchChat,
  onInsertChatResponse,
  onReplaceChatSelection,
}: CliChatSessionProps) {
  const { t } = useLingui();
  const [ptyId, setPtyId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const fallbackTitle = cli === 'codex' ? t`Codex chat` : t`Claude chat`;
  const previousSessions = sessions.filter((session) => session.id !== sessionId);
  const normalizedHistoryQuery = historyQuery.trim().toLocaleLowerCase();
  const filteredPreviousSessions = previousSessions.filter((session) =>
    normalizedHistoryQuery === ''
      ? true
      : `${session.title} ${session.preview ?? ''}`
          .toLocaleLowerCase()
          .includes(normalizedHistoryQuery),
  );

  function reportPtyId(next: string | null) {
    setPtyId(next);
    onPtyId?.(next);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <TargetIcon id={cliIconTargetId(cli)} className="size-4 shrink-0" aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={title ?? fallbackTitle}>
          {title ?? fallbackTitle}
        </h2>
        <DropdownMenu onOpenChange={(open) => open && onReloadSessions?.()}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" aria-label={t`Load previous chat`}>
              <HistoryIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{t`Previous chats`}</DropdownMenuLabel>
            {previousSessions.length > 0 ? (
              <div className="px-2 pb-2">
                <Input
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder={t`Search chats`}
                  aria-label={t`Search previous chats`}
                  className="h-8 text-xs"
                />
              </div>
            ) : null}
            {previousSessions.length === 0 ? (
              <DropdownMenuItem disabled>{t`No previous chats`}</DropdownMenuItem>
            ) : filteredPreviousSessions.length === 0 ? (
              <DropdownMenuItem disabled>{t`No matching chats`}</DropdownMenuItem>
            ) : (
              filteredPreviousSessions.map((session) => (
                <DropdownMenuItem
                  key={session.id}
                  className="items-start"
                  onSelect={() => onSelectSession?.(session.id)}
                >
                  <TargetIcon
                    id={cliIconTargetId(session.cli)}
                    className="mt-0.5 size-4"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{session.title}</span>
                      {session.updatedAt === undefined ? null : (
                        <time
                          className="shrink-0 text-[10px] text-muted-foreground"
                          dateTime={new Date(session.updatedAt).toISOString()}
                        >
                          {new Intl.DateTimeFormat(undefined, {
                            month: 'short',
                            day: 'numeric',
                          }).format(session.updatedAt)}
                        </time>
                      )}
                    </span>
                    {session.preview ? (
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {session.preview}
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={cli === 'codex' ? t`New Codex chat` : t`New Claude chat`}
          onClick={() => onNewChat?.(cli)}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <CliChatPanel
            bridge={bridge}
            cli={cli}
            ptyId={ptyId}
            initialPrompt={launch.prompt}
            initialDisplayPrompt={launch.displayPrompt}
            context={launch.context}
            documentContext={documentContext}
            selectionContext={selectionContext}
            initialSessionId={launch.resumeSessionId}
            onSessionId={(sessionId) => {
              if (ptyId !== null) bridge.terminal.setMeta(ptyId, { chatSessionId: sessionId });
              onNativeSessionId?.(sessionId);
            }}
            onTitleChange={onTitleChange}
            onBranchFromMessage={(prompt, displayPrompt) =>
              onBranchChat?.(cli, prompt, displayPrompt)
            }
            onInsertInDocument={onInsertChatResponse}
            onReplaceSelection={onReplaceChatSelection}
          />
        </div>
        <div className="invisible pointer-events-none absolute inset-0" inert>
          <TerminalGate
            bridge={bridge}
            launch={null}
            privateHistory
            adoptPtyId={adoptPtyId}
            onPtyId={reportPtyId}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
