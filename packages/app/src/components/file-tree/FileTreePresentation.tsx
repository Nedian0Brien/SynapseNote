import { useLingui } from '@lingui/react/macro';
import { Info, RefreshCw, TriangleAlert } from 'lucide-react';
import { __iconNode as botIcon } from 'lucide-react/dist/esm/icons/bot';
import { __iconNode as link2Icon } from 'lucide-react/dist/esm/icons/link-2';
import type { ReactNode } from 'react';
import {
  MARKDOWN_FILE_ICON_PATH_D,
  MARKDOWN_FILE_ICON_VIEWBOX,
} from '@/components/file-entry-icon';
import {
  FILE_TREE_DENSITY_OPTIONS,
  FILE_TREE_INDENT_GUIDE_CSS,
  FILE_TREE_STICKY_HEADER_CSS,
} from '@/components/file-tree-density';
import { FILE_TREE_EXT_BADGE_CSS } from '@/components/file-tree-extension-badge';
import { FILE_TREE_RENAME_INPUT_CSS } from '@/components/file-tree-rename-chip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  FILE_TREE_EXTERNAL_FILE_DROP_ROOT_ATTR,
  FILE_TREE_EXTERNAL_FILE_DROP_TARGET_ATTR,
} from './useFileTreeDragAndDrop';

export { FILE_TREE_DENSITY_OPTIONS };

export const LINK_DECORATION_ICON_ID = 'ok-file-tree-link-decoration';
export const AGENT_DECORATION_ICON_ID = 'ok-file-tree-agent-decoration';
export const MARKDOWN_FILE_ICON_ID = 'ok-file-tree-markdown';
export { MARKDOWN_FILE_ICON_VIEWBOX };

const AGENT_FILE_NAMES = new Set(['agents', 'agent', 'claude', 'skill']);

export function isAgentTreePath(treePath: string): boolean {
  const name = treePath.split('/').pop()?.replace(/\.md$/i, '').toLowerCase();
  return !!name && AGENT_FILE_NAMES.has(name);
}

type IconNode = [string, Record<string, string>][];

function iconNodeToSvg(iconNode: IconNode): string {
  return iconNode
    .map(([tag, { key: _, ...attrs }]) => {
      const attrString = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${attrString} />`;
    })
    .join('');
}

function createLucideSpriteSymbol(id: string, iconNode: IconNode): string {
  return `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconNodeToSvg(iconNode)}</symbol>`;
}

export const FILE_TREE_DECORATION_SPRITE_SHEET = `<svg data-icon-sprite aria-hidden="true" width="0" height="0">
  ${createLucideSpriteSymbol(LINK_DECORATION_ICON_ID, link2Icon)}
  ${createLucideSpriteSymbol(AGENT_DECORATION_ICON_ID, botIcon)}
  <symbol id="${MARKDOWN_FILE_ICON_ID}" viewBox="${MARKDOWN_FILE_ICON_VIEWBOX}" fill="currentColor"><path d="${MARKDOWN_FILE_ICON_PATH_D}"/></symbol>
</svg>`;

const FILE_TREE_ROOT_DROP_CSS = `
  [data-file-tree-virtualized-root][data-file-tree-root-drag-target="true"] { position: relative; }
  [data-file-tree-virtualized-root][data-file-tree-root-drag-target="true"]::after {
    content: ""; position: absolute; inset: 0; z-index: 20; border-radius: 0.375rem;
    box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--color-primary) 80%, transparent);
    background: color-mix(in oklab, var(--color-primary) 6%, transparent); pointer-events: none;
  }
  @media (forced-colors: active) {
    [data-file-tree-virtualized-root][data-file-tree-root-drag-target="true"]::after { border: 2px solid Highlight; }
  }
`;

const FILE_TREE_EXTERNAL_FILE_DROP_CSS = `
  [data-type="item"][${FILE_TREE_EXTERNAL_FILE_DROP_TARGET_ATTR}="true"] {
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-primary) 72%, transparent);
  }
  [data-file-tree-virtualized-root][${FILE_TREE_EXTERNAL_FILE_DROP_ROOT_ATTR}="true"] { position: relative; }
  [data-file-tree-virtualized-root][${FILE_TREE_EXTERNAL_FILE_DROP_ROOT_ATTR}="true"]::after {
    content: ""; position: absolute; inset: 0; z-index: 20; border-radius: 0.375rem;
    box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--color-primary) 80%, transparent);
    background: color-mix(in oklab, var(--color-primary) 6%, transparent); pointer-events: none;
  }
  @media (forced-colors: active) {
    [data-type="item"][${FILE_TREE_EXTERNAL_FILE_DROP_TARGET_ATTR}="true"] { outline: 2px solid Highlight; outline-offset: -2px; }
    [data-file-tree-virtualized-root][${FILE_TREE_EXTERNAL_FILE_DROP_ROOT_ATTR}="true"]::after { border: 2px solid Highlight; }
  }
`;

export const FILE_TREE_CREATION_CLEARED_ATTR = 'data-ok-creation-cleared';
const FILE_TREE_CREATION_CLEARED_CSS = `
  :host([${FILE_TREE_CREATION_CLEARED_ATTR}]) [data-item-focused="true"] { --trees-focus-ring-color: transparent; }
`;

export const FILE_TREE_UNSAFE_CSS = `${FILE_TREE_EXT_BADGE_CSS}\n${FILE_TREE_RENAME_INPUT_CSS}\n${FILE_TREE_ROOT_DROP_CSS}\n${FILE_TREE_EXTERNAL_FILE_DROP_CSS}\n${FILE_TREE_CREATION_CLEARED_CSS}\n${FILE_TREE_INDENT_GUIDE_CSS}\n${FILE_TREE_STICKY_HEADER_CSS}`;

const SKELETON_ROW_WIDTHS = ['w-3/4', 'w-2/3', 'w-4/5', 'w-1/2', 'w-3/5', 'w-2/3'];

export function FileTreeSkeleton() {
  const { t } = useLingui();
  return (
    <div
      className="flex flex-1 flex-col gap-1 px-2 py-2"
      role="status"
      aria-busy="true"
      aria-label={t`Loading files`}
    >
      {SKELETON_ROW_WIDTHS.map((width, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed static decoration rows
        <div key={index} className="flex h-6 items-center gap-2">
          <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  );
}

export function FileTreeHeaderNotice({
  kind,
  children,
}: {
  kind: 'error' | 'info' | 'reconnecting';
  children: ReactNode;
}) {
  const Icon = kind === 'error' ? TriangleAlert : kind === 'reconnecting' ? RefreshCw : Info;
  return (
    <span
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'mx-2 mb-1 flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs leading-snug',
        kind === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-3.5 shrink-0',
          kind === 'reconnecting' && 'animate-spin motion-reduce:animate-none',
        )}
      />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
