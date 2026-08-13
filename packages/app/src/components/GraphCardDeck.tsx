import { Trans, useLingui } from '@lingui/react/macro';
import { ArrowUpRight, Folder, Globe, Hash, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hashFromDocName } from '@/lib/doc-hash';
import { openExternalUrl } from '@/lib/external-link';
import { cn } from '@/lib/utils';
import type { GraphNode } from './graph-view-utils';

/**
 * The selected node's neighbors, as cards.
 *
 * Past reading distance a force graph stops paying for itself: the nodes are
 * bigger but say no more than they did, and the edges run off-screen. At that
 * zoom the useful question is no longer "what is the shape of this" but "what
 * ARE these" — so the neighborhood is re-presented as a list that can carry
 * titles, paths and tags at full size.
 *
 * It overlays the canvas rather than replacing it: the graph keeps simulating
 * underneath, so zooming back out returns to exactly the view the user left,
 * with no re-layout and no lost camera position.
 */
export function GraphCardDeck({
  centerNode,
  neighbors,
  onOpenDoc,
  onFilterByTag,
  onDismiss,
}: {
  centerNode: GraphNode;
  neighbors: readonly GraphNode[];
  onOpenDoc: (node: GraphNode & { kind: 'doc' }) => void;
  onFilterByTag: (tag: string) => void;
  onDismiss: () => void;
}) {
  const { t } = useLingui();

  return (
    <section
      // `inset-0` over the canvas, but the backdrop stays click-through at the
      // edges so a stray click still reaches the graph to dismiss the deck.
      className="pointer-events-none absolute inset-0 z-20 flex flex-col"
      aria-label={t`Neighbors of ${centerNode.label}`}
    >
      <div className="pointer-events-auto flex items-start gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Trans>Neighbors</Trans>
          </div>
          <div className="truncate text-sm font-medium text-foreground">{centerNode.label}</div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t`Close neighbor cards`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        {neighbors.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <Trans>This page has no links yet.</Trans>
          </p>
        ) : (
          <div className="mx-auto grid w-full max-w-4xl grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2">
            {neighbors.map((node) => (
              <GraphNeighborCard
                key={node.id}
                node={node}
                onOpenDoc={onOpenDoc}
                onFilterByTag={onFilterByTag}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function GraphNeighborCard({
  node,
  onOpenDoc,
  onFilterByTag,
}: {
  node: GraphNode;
  onOpenDoc: (node: GraphNode & { kind: 'doc' }) => void;
  onFilterByTag: (tag: string) => void;
}) {
  const { t } = useLingui();

  const { Icon, secondary, action, actionLabel } =
    node.kind === 'doc'
      ? {
          Icon: ArrowUpRight,
          secondary: node.docName,
          action: () => onOpenDoc(node),
          actionLabel: t`Open ${node.label}`,
        }
      : node.kind === 'tag'
        ? {
            Icon: Hash,
            secondary: t`Tag`,
            action: () => onFilterByTag(node.tag),
            actionLabel: t`Filter by ${node.label}`,
          }
        : node.kind === 'folder'
          ? {
              Icon: Folder,
              secondary: node.path,
              action: () => window.location.assign(hashFromDocName(node.path, null)),
              actionLabel: t`Open ${node.path}`,
            }
          : {
              Icon: Globe,
              secondary: node.url,
              // openExternalUrl gates unsafe schemes internally (a node URL can
              // carry any authored scheme), then routes to the OS browser.
              action: () => openExternalUrl(node.url),
              actionLabel: t`Open ${node.url}`,
            };

  return (
    <Button
      variant="outline"
      aria-label={actionLabel}
      className={cn(
        'h-auto w-full items-start justify-start gap-2 px-3 py-2 text-left font-normal',
        'hover:border-border hover:bg-accent',
      )}
      onClick={action}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{node.label}</span>
        <span className="truncate text-xs text-muted-foreground">{secondary}</span>
        {node.kind === 'doc' && node.tags && node.tags.length > 0 ? (
          <span className="truncate pt-0.5 text-xs text-muted-foreground/80">
            {node.tags.map((tag) => `#${tag}`).join(' ')}
          </span>
        ) : null}
      </span>
    </Button>
  );
}

/** The neighbors of a node, for the deck. Undirected — a link either way counts. */
export function getGraphCardNeighbors(
  centerNodeId: string,
  nodes: readonly GraphNode[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): GraphNode[] {
  const neighborIds = adjacency.get(centerNodeId);
  if (!neighborIds || neighborIds.size === 0) return [];
  return nodes.filter((node) => node.id !== centerNodeId && neighborIds.has(node.id));
}
