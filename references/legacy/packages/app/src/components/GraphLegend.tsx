import { Trans } from '@lingui/react/macro';
import { useTheme } from 'next-themes';
import type { GraphGroup } from '@/lib/graph-settings-store';
import { cn } from '@/lib/utils';
import { resolveGraphGroupColor } from './graph-groups';

type GraphLegendVariant = 'fullscreen' | 'docked';

interface GraphLegendLayout {
  maxEntries: number;
  containerClassName: string;
  titleClassName: string;
  rowClassName: string;
  swatchClassName: string;
  labelClassName: string;
  overflowClassName: string;
}

const GRAPH_LEGEND_LAYOUTS: Record<GraphLegendVariant, GraphLegendLayout> = {
  fullscreen: {
    maxEntries: 10,
    containerClassName: 'bottom-3 left-3 gap-1 rounded-lg px-3 py-2 text-xs',
    titleClassName: 'mb-1.5',
    rowClassName: 'gap-2',
    swatchClassName: 'size-2.5',
    labelClassName: 'max-w-[140px]',
    overflowClassName: 'pl-[18px]',
  },
  docked: {
    maxEntries: 6,
    containerClassName: 'bottom-2 left-2 gap-0.5 rounded-md px-2 py-1.5 text-[11px]',
    titleClassName: 'mb-1',
    rowClassName: 'gap-1.5',
    swatchClassName: 'size-2',
    labelClassName: 'max-w-[112px]',
    overflowClassName: 'pl-[14px]',
  },
};

function getGraphLegendLayout(variant: GraphLegendVariant): GraphLegendLayout {
  return GRAPH_LEGEND_LAYOUTS[variant];
}

/**
 * The colors currently on the canvas, and nothing else.
 *
 * It used to list frontmatter clusters, from back when every node was tinted by
 * its cluster. Node color now carries only state (see `graph-node-style.ts`),
 * so groups — which the user defines and which really do tint nodes — are the
 * only thing left to explain.
 */
export function GraphLegend({
  groups = [],
  variant = 'fullscreen',
}: {
  groups?: readonly GraphGroup[];
  variant?: GraphLegendVariant;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const layout = getGraphLegendLayout(variant);

  // A group with no query is inert and colors nothing, so it is left out.
  const entries = groups
    .filter((group) => group.query.trim() !== '')
    .map((group) => ({
      key: group.id,
      label: group.query,
      color: resolveGraphGroupColor(group.color, isDark),
    }));

  if (entries.length === 0) return null;

  const visible = entries.slice(0, layout.maxEntries);
  const overflow = entries.length - visible.length;

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10 flex flex-col backdrop-blur-sm',
        layout.containerClassName,
        isDark ? 'bg-black/70 text-gray-200' : 'bg-white/80 text-gray-800 ring-1 ring-black/5',
      )}
    >
      <div
        className={cn(
          'font-medium',
          layout.titleClassName,
          isDark ? 'text-slate-300' : 'text-slate-700',
        )}
      >
        <Trans>Groups</Trans>
      </div>
      {visible.map((entry) => (
        <div key={entry.key} className={cn('flex items-center', layout.rowClassName)}>
          <span
            className={cn('inline-block shrink-0 rounded-full', layout.swatchClassName)}
            style={{ backgroundColor: entry.color }}
          />
          <span className={cn('truncate', layout.labelClassName)}>{entry.label}</span>
        </div>
      ))}
      {overflow > 0 && (
        <div className={cn('text-muted-foreground', layout.overflowClassName)}>
          <Trans>+ {overflow} more</Trans>
        </div>
      )}
    </div>
  );
}
