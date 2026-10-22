import { Trans, useLingui } from '@lingui/react/macro';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Copy,
  MessageSquareText,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AgentIcon, agentIconForCli } from '@/components/icons/AgentIcon';
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
import {
  archiveChat,
  archivedChatKey,
  loadArchivedChats,
  subscribeToArchivedChats,
  unarchiveChat,
} from '@/lib/archived-chats';
import { resolveDefaultCli } from '@/lib/default-cli-resolver';
import type { OkCliChatSession, OkDesktopBridge } from '@/lib/desktop-bridge-types';
import {
  CHAT_PANE_DEFAULT_HEIGHT,
  CHAT_PANE_MIN_HEIGHT,
  chatPaneMaxHeight,
  loadChatPaneHeight,
  resolveChatPaneHeight,
  saveChatPaneHeight,
} from '@/lib/sidebar-pane-height';
import { loadStickyAgent } from '@/lib/unified-agent-store';
import { cn } from '@/lib/utils';
import { useTerminalLaunch } from './handoff/TerminalLaunchContext';
import { requestTerminalLaunch } from './handoff/terminal-launch-events';
import { SidebarPaneResizeHandle } from './SidebarPaneResizeHandle';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

/** Display name of a native CLI — the brand as it is written, never translated. */
function cliLabel(cli: 'codex' | 'claude'): string {
  return cli === 'claude' ? 'Claude' : 'Codex';
}

interface ChatSidebarSectionProps {
  readonly bridge?: OkDesktopBridge;
}

/**
 * One chat in the sidebar list. Archived rows use the same row so the way back
 * looks like the way in — only dimmed, and with the inverse archive action.
 */
function ChatRow({
  session,
  isArchived,
  onOpen,
  onCopySessionId,
  onReload,
  onArchive,
  onUnarchive,
}: {
  readonly session: OkCliChatSession;
  readonly isArchived: boolean;
  readonly onOpen: (session: OkCliChatSession) => void;
  readonly onCopySessionId: (session: OkCliChatSession) => void;
  readonly onReload: () => void;
  readonly onArchive: (session: OkCliChatSession) => void;
  readonly onUnarchive: (session: OkCliChatSession) => void;
}) {
  const { t } = useLingui();
  return (
    <SidebarMenuItem>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarMenuButton
            type="button"
            className={cn('h-7', isArchived && 'text-muted-foreground')}
            tooltip={session.title}
            // `aria-label` overrides the row's children, so the visible CLI text
            // never reaches the accessible name: it has to name the provider
            // itself.
            aria-label={t`Open ${cliLabel(session.cli)} chat ${session.title}`}
            onClick={() => onOpen(session)}
          >
            {/* The provider's own mark, brand-colored: which agent owns a chat is
              the first thing the eye needs here, and one generic robot for both
              made every row read the same. */}
            <AgentIcon
              icon={agentIconForCli(session.cli)}
              className="size-3.5 shrink-0"
              brand
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{session.title}</span>
            {/* The mark names the provider at a glance; this keeps it spelled out
              for anyone scanning the column rather than the icons. */}
            <span className="shrink-0 text-[9px] uppercase text-muted-foreground/70">
              {session.cli}
            </span>
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => onOpen(session)}>
            <MessageSquareText aria-hidden="true" />
            <Trans>Open chat</Trans>
          </ContextMenuItem>
          <ContextMenuSeparator />
          {isArchived ? (
            <ContextMenuItem
              data-testid="chat-sidebar-unarchive"
              onSelect={() => onUnarchive(session)}
            >
              <ArchiveRestore aria-hidden="true" />
              <Trans>Unarchive chat</Trans>
            </ContextMenuItem>
          ) : (
            <ContextMenuItem data-testid="chat-sidebar-archive" onSelect={() => onArchive(session)}>
              <Archive aria-hidden="true" />
              <Trans>Archive chat</Trans>
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => onCopySessionId(session)}>
            <Copy aria-hidden="true" />
            <Trans>Copy session ID</Trans>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onReload}>
            <RefreshCw aria-hidden="true" />
            <Trans>Refresh chats</Trans>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  );
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
  // The height the user asked this pane to be, and the two ceilings it is read
  // against: the rows it actually holds, and the window it lives in.
  const [requestedHeight, setRequestedHeight] = useState(loadChatPaneHeight);
  const [listHeight, setListHeight] = useState<number | null>(null);
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const [archived, setArchived] = useState<ReadonlySet<string>>(loadArchivedChats);
  // Archived chats stay one disclosure away rather than gone: putting a chat
  // away is a tidying action, not a delete, so the way back has to be visible
  // from the same list.
  const [showArchived, setShowArchived] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? CHAT_PANE_DEFAULT_HEIGHT * 4 : window.innerHeight,
  );

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

  // A chat can be archived from a chat tab's context menu in this window or in
  // the standalone terminal window; the list follows either.
  useEffect(() => subscribeToArchivedChats(setArchived), []);

  useEffect(() => {
    function trackViewport() {
      setViewportHeight(window.innerHeight);
    }
    trackViewport();
    window.addEventListener('resize', trackViewport);
    return () => window.removeEventListener('resize', trackViewport);
  }, []);

  // The pane never grows past its own rows, so the list's measured height is
  // half of the sizing input — it moves as chats load, arrive, or are filtered.
  useEffect(() => {
    if (listElement === null || typeof ResizeObserver === 'undefined') {
      setListHeight(null);
      return;
    }
    // A zero reading means "not laid out yet" (or a test renderer without
    // layout), not "an empty list" — treat it as unknown so the pane keeps the
    // height the user asked for instead of collapsing to nothing.
    const element = listElement;
    function measure() {
      const height = element.offsetHeight;
      setListHeight(height > 0 ? height : null);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [listElement]);

  // Persist the settled height, not every frame of the drag.
  useEffect(() => {
    const timer = setTimeout(() => saveChatPaneHeight(requestedHeight), 150);
    return () => clearTimeout(timer);
  }, [requestedHeight]);

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

  function archiveSession(session: OkCliChatSession) {
    setArchived(archiveChat(session.cli, session.sessionId));
  }

  function unarchiveSession(session: OkCliChatSession) {
    setArchived(unarchiveChat(session.cli, session.sessionId));
  }

  function copySessionId(session: OkCliChatSession) {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(session.sessionId).catch((error: unknown) => {
      console.warn('[sidebar] could not copy native chat session ID:', error);
    });
  }

  const archivedSessions = sessions.filter((session) =>
    archived.has(archivedChatKey(session.cli, session.sessionId)),
  );
  const activeSessions = sessions.filter(
    (session) => !archived.has(archivedChatKey(session.cli, session.sessionId)),
  );

  const paneHeight = resolveChatPaneHeight({
    requestedHeight,
    contentHeight: listHeight,
    viewportHeight,
  });
  // Dragging below the last chat would only add empty pane, so the handle stops
  // at the list's own height (or the sidebar's share of the window, whichever
  // comes first).
  const maxPaneHeight = Math.max(
    CHAT_PANE_MIN_HEIGHT,
    Math.min(chatPaneMaxHeight(viewportHeight), listHeight ?? chatPaneMaxHeight(viewportHeight)),
  );
  const isResizable = maxPaneHeight > CHAT_PANE_MIN_HEIGHT;

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
          {/* Height, not max-height: the pane is a viewport onto the chat list
              that the seam handle below sizes. `resolveChatPaneHeight` keeps it
              flush with the rows whenever they are shorter than the request, so
              a two-chat project still hugs its list. */}
          <SidebarGroupContent
            className="overflow-y-auto px-1"
            style={{ height: `${paneHeight}px` }}
            data-testid="chat-sidebar-pane"
          >
            <div ref={setListElement} className="pb-1">
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
              {loadState !== 'loading' &&
              loadState !== 'error' &&
              sessions.length > 0 &&
              activeSessions.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  <Trans>Every chat is archived.</Trans>
                </p>
              ) : null}
              {activeSessions.length > 0 ? (
                <SidebarMenu data-testid="chat-sidebar-list">
                  {activeSessions.map((session) => (
                    <ChatRow
                      key={`${session.cli}:${session.sessionId}`}
                      session={session}
                      isArchived={false}
                      onOpen={resumeChat}
                      onCopySessionId={copySessionId}
                      onReload={reloadChats}
                      onArchive={archiveSession}
                      onUnarchive={unarchiveSession}
                    />
                  ))}
                </SidebarMenu>
              ) : null}
              {archivedSessions.length > 0 ? (
                <>
                  {/* The way back to an archived chat, in the list it left. */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 w-full justify-start gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:bg-sidebar-hover"
                    aria-expanded={showArchived}
                    data-testid="chat-sidebar-archived-toggle"
                    onClick={() => setShowArchived((shown) => !shown)}
                  >
                    <ChevronRight
                      className={cn(
                        'size-3.5 shrink-0 transition-transform',
                        showArchived && 'rotate-90',
                      )}
                      aria-hidden="true"
                    />
                    <Trans>Archived ({archivedSessions.length})</Trans>
                  </Button>
                  {showArchived ? (
                    <SidebarMenu data-testid="chat-sidebar-archived-list">
                      {archivedSessions.map((session) => (
                        <ChatRow
                          key={`${session.cli}:${session.sessionId}`}
                          session={session}
                          isArchived
                          onOpen={resumeChat}
                          onCopySessionId={copySessionId}
                          onReload={reloadChats}
                          onArchive={archiveSession}
                          onUnarchive={unarchiveSession}
                        />
                      ))}
                    </SidebarMenu>
                  ) : null}
                </>
              ) : null}
            </div>
          </SidebarGroupContent>
          {isResizable ? (
            <SidebarPaneResizeHandle
              height={paneHeight}
              minHeight={CHAT_PANE_MIN_HEIGHT}
              maxHeight={maxPaneHeight}
              label={t`Resize chat list`}
              onHeightChange={setRequestedHeight}
              onReset={() => setRequestedHeight(CHAT_PANE_DEFAULT_HEIGHT)}
              testId="chat-sidebar-resize"
            />
          ) : null}
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
