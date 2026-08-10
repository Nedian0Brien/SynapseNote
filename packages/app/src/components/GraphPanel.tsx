import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { Globe, Maximize2, Scan } from 'lucide-react';
import { useRef, useState } from 'react';
import { GraphLegend } from '@/components/GraphLegend';
import { GraphSettingsPopover } from '@/components/GraphSettingsPopover';
import { GraphView, type GraphViewHandle } from '@/components/GraphView';
import { Button } from '@/components/ui/button';
import { Panel, PanelCount, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type GraphSettings,
  getInitialGraphSettings,
  writeGraphSettings,
} from '@/lib/graph-settings-store';
import { openGraphSurface } from '@/lib/use-graph-route';

const GRAPH_SETTINGS_SCOPE = 'docked' as const;

/**
 * The LOCAL graph — a 2-hop neighborhood around the open document — as a tool
 * in the right rail.
 *
 * The whole-project graph is a content surface (`GraphSurface`, ⌘G) rather than
 * a fullscreen overlay over this panel. That split mirrors how the two are
 * actually read: the neighborhood answers "what is next to this page" while you
 * write, the project graph is something you go and look at. The expand button
 * here opens that surface instead of inflating the rail over the window.
 */
export function GraphPanel({ activeDocName }: { activeDocName: string }) {
  const { t } = useLingui();
  const [stats, setStats] = useState<{ nodes: number; links: number } | null>(null);
  const [clusters, setClusters] = useState<string[]>([]);
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

  return (
    <Panel>
      <PanelHeader className="flex-wrap gap-3">
        <div data-slot="graph-title-cluster" className="flex min-w-0 items-center gap-1.5">
          <PanelTitle>
            <Trans>Graph</Trans>
          </PanelTitle>
          {stats ? (
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
        <div data-slot="graph-controls" className="ml-auto flex items-center gap-2">
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
                  // A shortcut for the Filters switch of the same name, kept in
                  // the header because it is the one filter used mid-exploration.
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
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={t`Open the project graph`}
                  onClick={openGraphSurface}
                >
                  <Maximize2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                <Trans>Open the project graph</Trans>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </PanelHeader>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <GraphView
          ref={graphViewRef}
          activeDocName={activeDocName}
          settings={settings}
          scope="local"
          className="h-full min-h-0"
          docClickBehavior="navigate"
          onStatsChange={(nodes, links, loading) => {
            if (loading) {
              setStats(null);
              return;
            }
            setStats({ nodes, links });
          }}
          onClustersChange={setClusters}
        />
        <GraphLegend clusters={clusters} groups={settings.groups} variant="docked" />
      </div>
    </Panel>
  );
}
