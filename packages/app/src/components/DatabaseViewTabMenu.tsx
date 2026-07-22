import { Trans } from '@lingui/react/macro';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Pencil,
  Settings2,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type DatabaseViewTabAction =
  | 'filters'
  | 'settings'
  | 'rename'
  | 'duplicate'
  | 'favorite'
  | 'move-left'
  | 'move-right'
  | 'make-default'
  | 'clear-default'
  | 'delete'
  | 'manage';

export function DatabaseViewTabMenu({
  source,
  view,
  index,
  count,
  busy,
  onAction,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  index: number;
  count: number;
  busy: boolean;
  onAction: (action: DatabaseViewTabAction) => void;
}) {
  const isDefault = source.defaultViewId === view.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className="-ml-1 rounded-l-none"
          aria-label={`View options for ${view.name}`}
          data-active-view-menu
          data-view-tab-menu
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{view.name}</DropdownMenuLabel>
        <DropdownMenuItem disabled={busy} onSelect={() => onAction('filters')}>
          <Trans>Filters</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => onAction('settings')}>
          <Settings2 aria-hidden="true" /> <Trans>View settings</Trans>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={() => onAction('rename')}>
          <Pencil aria-hidden="true" /> <Trans>Rename</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => onAction('duplicate')}>
          <Copy aria-hidden="true" /> <Trans>Duplicate</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => onAction('favorite')}>
          <Star aria-hidden="true" />
          {view.favorite === true ? <Trans>Remove from favorites</Trans> : <Trans>Favorite</Trans>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy || index <= 0} onSelect={() => onAction('move-left')}>
          <ChevronLeft aria-hidden="true" /> <Trans>Move left</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy || index >= count - 1}
          onSelect={() => onAction('move-right')}
        >
          <ChevronRight aria-hidden="true" /> <Trans>Move right</Trans>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isDefault ? (
          <DropdownMenuItem disabled={busy} onSelect={() => onAction('clear-default')}>
            <Trans>Clear default</Trans>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={busy} onSelect={() => onAction('make-default')}>
            <Star aria-hidden="true" /> <Trans>Make default</Trans>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={busy || isDefault} onSelect={() => onAction('delete')}>
          <Trash2 aria-hidden="true" />
          {isDefault ? <Trans>Cannot delete default</Trans> : <Trans>Delete</Trans>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={() => onAction('manage')}>
          <Settings2 aria-hidden="true" /> <Trans>Manage views</Trans>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
