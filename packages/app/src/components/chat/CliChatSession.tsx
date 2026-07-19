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
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import type { TerminalLaunchIntent } from '../EditorPane';
import { cliIconTargetId } from '../handoff/terminal-cli-display';
import { TerminalGate } from '../TerminalGate';
import { CliChatPanel } from './CliChatPanel';
import type { CliChatId, CliChatSelectionContext } from './cli-chat-types';

export interface CliChatHeaderSession {
  readonly id: string;
  readonly cli: CliChatId;
  readonly title: string;
  readonly openSessionId?: string;
  readonly resumeSessionId?: string;
}

interface CliChatSessionProps {
  readonly bridge: OkDesktopBridge;
  readonly cli: CliChatId;
  readonly launch: TerminalLaunchIntent;
  readonly adoptPtyId?: string | null;
  readonly onPtyId?: (ptyId: string | null) => void;
  readonly onTitleChange?: (title: string) => void;
  readonly onClose?: () => void;
  readonly selectionContext?: CliChatSelectionContext | null;
  readonly sessionId?: string;
  readonly title?: string;
  readonly sessions?: readonly CliChatHeaderSession[];
  readonly onSelectSession?: (id: string) => void;
  readonly onReloadSessions?: () => void;
  readonly onNewChat?: (cli: CliChatId) => void;
  readonly onNativeSessionId?: (sessionId: string) => void;
}

export function CliChatSession({
  bridge,
  cli,
  launch,
  adoptPtyId = null,
  onPtyId,
  onTitleChange,
  onClose,
  selectionContext = null,
  sessionId,
  title,
  sessions = [],
  onSelectSession,
  onReloadSessions,
  onNewChat,
  onNativeSessionId,
}: CliChatSessionProps) {
  const { t } = useLingui();
  const [ptyId, setPtyId] = useState<string | null>(null);
  const fallbackTitle = cli === 'codex' ? t`Codex chat` : t`Claude chat`;
  const previousSessions = sessions.filter((session) => session.id !== sessionId);

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
            {previousSessions.length === 0 ? (
              <DropdownMenuItem disabled>{t`No previous chats`}</DropdownMenuItem>
            ) : (
              previousSessions.map((session) => (
                <DropdownMenuItem key={session.id} onSelect={() => onSelectSession?.(session.id)}>
                  <TargetIcon
                    id={cliIconTargetId(session.cli)}
                    className="size-4"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{session.title}</span>
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
            selectionContext={selectionContext}
            initialSessionId={launch.resumeSessionId}
            onSessionId={(sessionId) => {
              if (ptyId !== null) bridge.terminal.setMeta(ptyId, { chatSessionId: sessionId });
              onNativeSessionId?.(sessionId);
            }}
            onTitleChange={onTitleChange}
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
