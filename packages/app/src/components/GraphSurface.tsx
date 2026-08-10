import { t } from '@lingui/core/macro';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import {
  type HubEntry,
  HubsSuccessSchema,
  isOrphanMode,
  ORPHAN_MODES,
  type OrphanEntry,
  type OrphanMode,
  OrphansSuccessSchema,
  ProblemDetailsSchema,
} from '@nedian0brien/synapsenote-core';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Globe, Hash, Scan } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GraphCardDeck } from '@/components/GraphCardDeck';
import { GraphLegend } from '@/components/GraphLegend';
import { GraphSettingsPopover } from '@/components/GraphSettingsPopover';
import { GraphView, type GraphViewHandle } from '@/components/GraphView';
import {
  type GraphNode,
  type GraphNodeSelection,
  getHashForGraphDocSelection,
} from '@/components/graph-view-utils';
import { usePageList } from '@/components/PageListContext';
import { resolveTargetNavigationIntent } from '@/components/target-navigation-intent';
import { Button } from '@/components/ui/button';
import { PanelBody, PanelCount, PanelEmpty, PanelError } from '@/components/ui/panel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { hashFromDocName } from '@/lib/doc-hash';
import { openExternalUrl } from '@/lib/external-link';
import {
  type GraphSettings,
  getInitialGraphSettings,
  writeGraphSettings,
} from '@/lib/graph-settings-store';

const HUB_LIMIT = 50;
const GRAPH_SETTINGS_SCOPE = 'fullscreen' as const;

type GraphSurfaceMode = 'explore' | 'orphans' | 'hubs';

function modeLabel(mode: GraphSurfaceMode): string {
  if (mode === 'explore') return t`Explore`;
  if (mode === 'orphans') return t`Orphans`;
  return t`Hubs`;
}

function orphanModeLabel(mode: OrphanMode): string {
  if (mode === 'incoming') return t`No Incoming`;
  if (mode === 'outgoing') return t`No Outgoing`;
  return t`Both`;
}

async function fetchOrphans(mode: OrphanMode): Promise<OrphanEntry[]> {
  const res = await fetch(`/api/orphans?mode=${encodeURIComponent(mode)}`);
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const problem = ProblemDetailsSchema.safeParse(body);
    const status = res.status;
    const statusText = res.statusText;
    throw new Error(
      problem.success ? problem.data.title : t`Server error: ${status} ${statusText}`,
    );
  }
  const success = OrphansSuccessSchema.safeParse(body);
  if (!success.success) throw new Error(t`Failed to load orphan pages`);
  return success.data.orphans;
}

async function fetchHubs(limit: number): Promise<HubEntry[]> {
  const res = await fetch(`/api/hubs?limit=${encodeURIComponent(String(limit))}`);
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const problem = ProblemDetailsSchema.safeParse(body);
    const status = res.status;
    const statusText = res.statusText;
    throw new Error(
      problem.success ? problem.data.title : t`Server error: ${status} ${statusText}`,
    );
  }
  const success = HubsSuccessSchema.safeParse(body);
  if (!success.success) throw new Error(t`Failed to load hub pages`);
  return success.data.hubs;
}

function navigateToDoc(docName: string) {
  window.location.assign(hashFromDocName(docName));
}

function getOrphanDescription(mode: OrphanMode): string {
  if (mode === 'incoming') {
    return t`Project-level pages with no incoming graph edges.`;
  }
  if (mode === 'outgoing') {
    return t`Project-level pages with no outgoing graph edges.`;
  }
  return t`Project-level pages with neither incoming nor outgoing graph edges.`;
}

function getOrphanEmptyState(mode: OrphanMode): string {
  if (mode === 'incoming') {
    return t`No pages are missing incoming graph links.`;
  }
  if (mode === 'outgoing') {
    return t`No pages are missing outgoing graph links.`;
  }
  return t`No disconnected pages. Pages appear here only when they have no incoming and no outgoing graph edges.`;
}

function OrphansView({
  mode,
  onModeChange,
}: {
  mode: OrphanMode;
  onModeChange: (mode: OrphanMode) => void;
}) {
  const { t } = useLingui();
  const {
    data: orphans = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['orphans', mode],
    queryFn: () => fetchOrphans(mode),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              <Trans>Project-level disconnected pages</Trans>
            </p>
            <p className="text-xs text-muted-foreground">{getOrphanDescription(mode)}</p>
          </div>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={mode}
            aria-label={t`Orphan mode`}
            onValueChange={(value) => {
              if (value && isOrphanMode(value)) {
                onModeChange(value);
              }
            }}
          >
            {ORPHAN_MODES.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {orphanModeLabel(value)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
      <PanelBody aria-busy={isLoading}>
        {error ? (
          <PanelError>
            {error instanceof Error ? error.message : t`Failed to load orphan pages`}
          </PanelError>
        ) : orphans.length === 0 && !isLoading ? (
          <PanelEmpty>{getOrphanEmptyState(mode)}</PanelEmpty>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {orphans.map((entry) => (
              <Button
                key={entry.docName}
                variant="outline"
                className="h-auto w-full justify-start px-3 py-2 text-left font-normal"
                onClick={() => navigateToDoc(entry.docName)}
              >
                <span className="flex min-w-0 flex-col items-start">
                  <span className="truncate text-sm font-medium">{entry.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{entry.docName}</span>
                </span>
              </Button>
            ))}
          </div>
        )}
      </PanelBody>
    </div>
  );
}

function HubsView() {
  const { t } = useLingui();
  const {
    data: hubs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['hubs', HUB_LIMIT],
    queryFn: () => fetchHubs(HUB_LIMIT),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            <Trans>Top linked pages</Trans>
          </p>
          <p className="text-xs text-muted-foreground">
            <Trans>
              Project-level pages ordered by inbound link count, up to {HUB_LIMIT} results.
            </Trans>
          </p>
        </div>
      </div>
      <PanelBody aria-busy={isLoading}>
        {error ? (
          <PanelError>
            {error instanceof Error ? error.message : t`Failed to load hub pages`}
          </PanelError>
        ) : hubs.length === 0 && !isLoading ? (
          <PanelEmpty>
            <Trans>No hub pages yet. Hubs appear once pages accumulate inbound graph links.</Trans>
          </PanelEmpty>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {hubs.map((hub) => (
              <Button
                key={hub.docName}
                variant="outline"
                className="h-auto w-full justify-between px-3 py-2 text-left font-normal"
                onClick={() => navigateToDoc(hub.docName)}
              >
                <span className="flex min-w-0 flex-col items-start">
                  <span className="truncate text-sm font-medium">{hub.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{hub.docName}</span>
                </span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                  {hub.count}
                </span>
              </Button>
            ))}
          </div>
        )}
      </PanelBody>
    </div>
  );
}

/**
 * The whole-project link graph, as a content surface rather than a rail panel.
 *
 * Opened by ⌘G or from the rail's local graph. It is the peer of the editor and
 * the folder overview: an editor tab, in the content column, with the rail free
 * to keep showing tools alongside it. The rail's graph tab stays the LOCAL
 * (2-hop) view; this is the global one.
 *
 * `activeDocName` is the document the user came from, so the graph can still
 * mark and center on where they were. It is not "the open document" — the open
 * tab is the graph itself.
 */
export function GraphSurface({ activeDocName }: { activeDocName: string | null }) {
  const { t } = useLingui();
  const {
    folderPaths,
    loading: pageListLoading,
    pages,
    pagesBySlug,
    pagesByBasename,
  } = usePageList();
  const [mode, setMode] = useState<GraphSurfaceMode>('explore');
  const [orphanMode, setOrphanMode] = useState<OrphanMode>('both');
  const [selectedNode, setSelectedNode] = useState<GraphNodeSelection | null>(null);
  const [stats, setStats] = useState<{ nodes: number; links: number } | null>(null);
  const [cardDeck, setCardDeck] = useState<{
    centerNode: GraphNode;
    neighbors: GraphNode[];
  } | null>(null);
  const graphViewRef = useRef<GraphViewHandle>(null);
  const [settings, setSettings] = useState<GraphSettings>(() =>
    getInitialGraphSettings(GRAPH_SETTINGS_SCOPE),
  );

  const updateSettings = (next: GraphSettings) => {
    setSettings(next);
    writeGraphSettings(GRAPH_SETTINGS_SCOPE, next);
  };

  const nodeCount = stats?.nodes ?? 0;
  const linkCount = stats?.links ?? 0;
  const showUrlNodes = settings.filters.showExternalNodes;

  useEffect(() => {
    if (mode !== 'explore' && selectedNode !== null) {
      setSelectedNode(null);
    }
  }, [mode, selectedNode]);

  const selectedNodeIntent =
    selectedNode?.kind === 'doc' && !pageListLoading
      ? resolveTargetNavigationIntent(selectedNode.docName, {
          pages,
          folderPaths,
          pagesBySlug,
          pagesByBasename,
        })
      : null;
  const selectedDocDisplayState = selectedNodeIntent?.displayState ?? 'doc';
  const hashForSelectedNode = (
    selection: Parameters<typeof getHashForGraphDocSelection>[0],
  ): string => selectedNodeIntent?.hash ?? getHashForGraphDocSelection(selection);

  // Opening a document from the graph REPLACES the graph in the content column
  // — the graph is a tab, and navigating a tab is what a link does. The old
  // overlay had to collapse itself first; there is nothing to collapse now.
  const selectedNodeState =
    selectedNode === null
      ? null
      : selectedNode.kind === 'doc' && selectedDocDisplayState === 'missing'
        ? {
            eyebrow: t`Broken link`,
            description: t`This page doesn't exist yet. Open it to create the page in the editor.`,
            Icon: AlertTriangle,
            actionLabel: t`Create page`,
            secondaryLabel: selectedNode.docName,
            onAction: () => window.location.assign(hashForSelectedNode(selectedNode)),
          }
        : selectedNode.kind === 'doc' && selectedNode.docName === activeDocName
          ? {
              eyebrow: t`Already open`,
              description: t`This document is open in another tab. Use Open to switch to it.`,
              Icon: CheckCircle2,
              actionLabel: t`Open`,
              secondaryLabel: selectedNode.docName,
              onAction: () => window.location.assign(hashForSelectedNode(selectedNode)),
            }
          : selectedNode.kind === 'doc'
            ? {
                eyebrow: t`Selected in graph`,
                description: t`Open this document in the editor.`,
                Icon: ArrowUpRight,
                actionLabel: t`Open`,
                secondaryLabel: selectedNode.docName,
                onAction: () => window.location.assign(hashForSelectedNode(selectedNode)),
              }
            : selectedNode.kind === 'tag'
              ? {
                  eyebrow: t`Selected tag`,
                  description: t`Narrow the graph to the pages carrying this tag.`,
                  Icon: Hash,
                  actionLabel: t`Filter by tag`,
                  secondaryLabel: `#${selectedNode.tag}`,
                  onAction: () => {
                    updateSettings({
                      ...settings,
                      filters: { ...settings.filters, query: `tag:${selectedNode.tag}` },
                    });
                    setSelectedNode(null);
                  },
                }
              : {
                  eyebrow: t`Selected in graph`,
                  description: t`Open this link in a new tab.`,
                  Icon: ArrowUpRight,
                  actionLabel: t`Open link`,
                  secondaryLabel: selectedNode.url,
                  onAction: () => {
                    // openExternalUrl gates unsafe schemes internally (a node URL
                    // can carry any authored scheme), then routes to the OS
                    // browser / new tab.
                    openExternalUrl(selectedNode.url);
                  },
                };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="text-sm font-medium">
            <Trans>Graph</Trans>
          </h2>
          {mode === 'explore' && stats ? (
            <div className="flex items-center gap-0.5">
              <PanelCount>
                <Plural value={nodeCount} one="# node" other="# nodes" />
              </PanelCount>
              <PanelCount>
                <Plural value={linkCount} one="# link" other="# links" />
              </PanelCount>
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={mode}
            aria-label={t`Graph mode`}
            onValueChange={(value) => {
              if (value === 'explore' || value === 'orphans' || value === 'hubs') {
                setMode(value);
              }
            }}
          >
            {(['explore', 'orphans', 'hubs'] as const).map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {modeLabel(value)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex items-center gap-0.5">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={
                    showUrlNodes ? t`Hide external URL nodes` : t`Show external URL nodes`
                  }
                  aria-pressed={showUrlNodes}
                  onClick={() =>
                    updateSettings({
                      ...settings,
                      filters: { ...settings.filters, showExternalNodes: !showUrlNodes },
                    })
                  }
                >
                  <Globe
                    className={
                      showUrlNodes
                        ? 'size-4 text-sidebar-accent-foreground'
                        : 'size-4 text-muted-foreground'
                    }
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                {showUrlNodes ? (
                  <Trans>Hide external URL nodes</Trans>
                ) : (
                  <Trans>Show external URL nodes</Trans>
                )}
              </TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={t`Fit graph to view`}
                  onClick={() => graphViewRef.current?.zoomToFit()}
                >
                  <Scan className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                <Trans>Fit to view</Trans>
              </TooltipContent>
            </Tooltip>
            <GraphSettingsPopover
              scope={GRAPH_SETTINGS_SCOPE}
              settings={settings}
              isExpanded={false}
              onSettingsChange={updateSettings}
            />
          </div>
        </div>
      </div>

      {mode === 'explore' ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <GraphView
            ref={graphViewRef}
            activeDocName={activeDocName ?? ''}
            settings={settings}
            scope="global"
            selectedNodeId={selectedNode?.id ?? null}
            className="h-full min-h-0"
            docClickBehavior="select"
            onSelectNode={setSelectedNode}
            onBackgroundClick={() => {
              if (selectedNode !== null) setSelectedNode(null);
            }}
            onStatsChange={(nodes, links, loading) => {
              if (loading) {
                setStats(null);
                return;
              }
              setStats({ nodes, links });
            }}
            onCardModeChange={setCardDeck}
          />
          <GraphLegend groups={settings.groups} variant="fullscreen" />
          {cardDeck ? (
            <GraphCardDeck
              centerNode={cardDeck.centerNode}
              neighbors={cardDeck.neighbors}
              onOpenDoc={(node) =>
                window.location.assign(hashFromDocName(node.docName, node.anchor))
              }
              onFilterByTag={(tag) => {
                updateSettings({
                  ...settings,
                  filters: { ...settings.filters, query: `tag:${tag}` },
                });
                setSelectedNode(null);
              }}
              // Dropping the selection drops the deck with it: the mode is
              // derived from (selection, zoom), so this is the one lever that
              // does not fight the user's camera.
              onDismiss={() => setSelectedNode(null)}
            />
          ) : null}
          {cardDeck === null && selectedNode !== null && selectedNodeState ? (
            <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex justify-center">
              <div
                role="status"
                aria-label={t`Selected graph item`}
                className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-xl border border-border/70 bg-background/95 px-4 py-3 text-sm shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85"
              >
                <selectedNodeState.Icon className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {selectedNodeState.eyebrow}
                  </div>
                  <div className="truncate font-medium text-foreground">{selectedNode.label}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {selectedNodeState.secondaryLabel}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedNodeState.description}
                  </div>
                </div>
                <Button size="sm" className="shrink-0" onClick={selectedNodeState.onAction}>
                  {selectedNodeState.actionLabel}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {mode === 'orphans' ? <OrphansView mode={orphanMode} onModeChange={setOrphanMode} /> : null}
      {mode === 'hubs' ? <HubsView /> : null}
    </div>
  );
}
