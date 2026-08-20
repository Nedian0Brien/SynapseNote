import { Trans, useLingui } from '@lingui/react/macro';
import { Bot, ChevronRight, Copy, MessageSquareText, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { resolveDefaultCli } from '@/lib/default-cli-resolver';
import type { OkCliChatSession, OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { loadStickyAgent } from '@/lib/unified-agent-store';
import { useTerminalLaunch } from './handoff/TerminalLaunchContext';
import { requestTerminalLaunch } from './handoff/terminal-launch-events';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

interface ChatSidebarSectionProps {
  readonly bridge?: OkDesktopBridge;
}

/**
 * Project-scoped native chat history in the main sidebar.
 *
 * The desktop bridge remains the single source of truth: it already discovers
 * Codex and Claude sessions, validates that they belong to this project, and
 * returns them newest-first. The web editor keeps the same section shape but
 * has no native session filesystem, so it presents an empty list.
 */
export function ChatSidebarSection({ bridge }: ChatSidebarSectionProps) {
  const { t } = useLingui();
  const terminalLaunch = useTerminalLaunch();
  const [open, setOpen] = useState(true);
  const [sessions, setSessions] = useState<readonly OkCliChatSession[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const canLoadChats = typeof bridge?.terminal?.listChatSessions === 'function';

  useEffect(() => {
    if (!open || !canLoadChats || bridge === undefined) return;
    let cancelled = false;
    setLoadState('loading');
    void bridge.terminal
      .listChatSessions()
      .then((nextSessions) => {
        if (cancelled) return;
        setSessions(nextSessions);
        setLoadState('success');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(
          `[sidebar] native CLI session discovery failed (attempt ${loadAttempt + 1}):`,
          error,
        );
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, canLoadChats, loadAttempt, open]);

  function startNewChat() {
    const cli = resolveDefaultCli(loadStickyAgent(), terminalLaunch?.installedClis ?? {});
    requestTerminalLaunch(null, cli, { surface: 'main' });
  }

  function resumeChat(session: OkCliChatSession) {
    requestTerminalLaunch(null, session.cli, {
      resumeSessionId: session.sessionId,
      surface: 'main',
    });
  }

  function reloadChats() {
    setLoadAttempt((attempt) => attempt + 1);
  }

  function copySessionId(session: OkCliChatSession) {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(session.sessionId).catch((error: unknown) => {
      console.warn('[sidebar] could not copy native chat session ID:', error);
    });
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/chats shrink-0"
      data-testid="chat-sidebar-section"
    >
      <SidebarGroup className="px-0">
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger
            className="flex w-full items-center gap-1.5"
            data-testid="chat-sidebar-trigger"
          >
            <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
            <Trans>Chat</Trans>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/chats:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <SidebarGroupAction
          title={t`New chat`}
          aria-label={t`New chat`}
          onClick={startNewChat}
          data-testid="chat-sidebar-new"
        >
          <Plus aria-hidden="true" />
        </SidebarGroupAction>
        <CollapsibleContent>
          <SidebarGroupContent className="max-h-52 overflow-y-auto px-1 pb-1">
            {loadState === 'loading' ? (
              <p className="px-2 py-1 text-xs text-muted-foreground" role="status">
                <Trans>Loading chats</Trans>
              </p>
            ) : null}
            {loadState === 'error' ? (
              <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">
                  <Trans>Could not load chats</Trans>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t`Retry loading chats`}
                  onClick={reloadChats}
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
            {loadState !== 'loading' && loadState !== 'error' && sessions.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                <Trans>No chats yet.</Trans>
              </p>
            ) : null}
            {sessions.length > 0 ? (
              <SidebarMenu data-testid="chat-sidebar-list">
                {sessions.map((session) => (
                  <SidebarMenuItem key={`${session.cli}:${session.sessionId}`}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <SidebarMenuButton
                          type="button"
                          className="h-7"
                          tooltip={session.title}
                          aria-label={t`Open chat ${session.title}`}
                          onClick={() => resumeChat(session)}
                        >
                          <Bot className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{session.title}</span>
                          <span className="shrink-0 text-[9px] uppercase text-muted-foreground/70">
                            {session.cli}
                          </span>
                        </SidebarMenuButton>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-44">
                        <ContextMenuItem onSelect={() => resumeChat(session)}>
                          <MessageSquareText aria-hidden="true" />
                          <Trans>Open chat</Trans>
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => copySessionId(session)}>
                          <Copy aria-hidden="true" />
                          <Trans>Copy session ID</Trans>
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={reloadChats}>
                          <RefreshCw aria-hidden="true" />
                          <Trans>Refresh chats</Trans>
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : null}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
