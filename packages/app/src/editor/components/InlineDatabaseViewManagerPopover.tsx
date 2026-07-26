import { Trans } from '@lingui/react/macro';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { ChevronDown, ChevronUp, Copy, Plus, Settings2, Star, Trash2, X } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DatabaseViewLifecycleChange } from '@/lib/database-cell-mutation';
import {
  createDefaultDatabaseTableView,
  duplicateDatabaseView,
} from '@/lib/database-view-lifecycle';
import { cn } from '@/lib/utils';

export interface InlineDatabaseViewManagerPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DatabaseSource;
  views: readonly DatabaseView[];
  activeViewId: string;
  busy: boolean;
  initialAction?: DatabaseViewManagerInitialAction;
  onSelectView: (viewId: string) => void;
  onChange: (change: DatabaseViewLifecycleChange) => void;
  onDefaultViewChange: (viewId?: string) => void;
}

function initialActionKey(action?: DatabaseViewManagerInitialAction): string {
  if (!action) return '';
  return `${action.kind}:${action.viewId}:${'favorite' in action ? action.favorite : ''}`;
}

/**
 * Compact, inline-first saved-view management. The full workspace manager is
 * intentionally still available for advanced layout configuration, while all
 * lifecycle operations stay close to the linked database tabs.
 */
export function InlineDatabaseViewManagerPopover({
  open,
  onOpenChange,
  source,
  views,
  activeViewId,
  busy,
  initialAction,
  onSelectView,
  onChange,
  onDefaultViewChange,
}: InlineDatabaseViewManagerPopoverProps) {
  'use no memo';
  const [newViewName, setNewViewName] = useState('');
  const [renameViewId, setRenameViewId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // A ref is intentional here: StrictMode runs effects twice on mount, and a
  // state update from the first pass is not guaranteed to be visible to the
  // second pass. Mark the action before dispatching so a refresh or StrictMode
  // probe can never issue the same lifecycle mutation twice.
  const handledActionRef = useRef('');

  const submitChange = useEffectEvent((change: DatabaseViewLifecycleChange) => {
    if (busy) return;
    onChange(change);
  });

  const beginRename = useEffectEvent((view: DatabaseView) => {
    setRenameViewId(view.id);
    setRenameValue(view.name);
  });

  const commitRename = () => {
    if (!renameViewId) return;
    const name = renameValue.trim();
    if (!name) return;
    submitChange({ kind: 'rename', viewId: renameViewId, name });
    setRenameViewId(null);
  };

  const createView = () => {
    const name = newViewName.trim();
    if (!name || busy) return;
    const view = createDefaultDatabaseTableView({
      source,
      existingViews: views,
      name,
      uuid: crypto.randomUUID(),
    });
    submitChange({ kind: 'create', view });
    setNewViewName('');
  };

  useEffect(() => {
    if (!open || !initialAction || busy) return;
    const key = initialActionKey(initialAction);
    if (key === handledActionRef.current) return;
    const view = views.find((candidate) => candidate.id === initialAction.viewId);
    if (!view) return;
    handledActionRef.current = key;
    if (initialAction.kind === 'rename') {
      beginRename(view);
      return;
    }
    if (initialAction.kind === 'make-default') {
      onDefaultViewChange(view.id);
      return;
    }
    if (initialAction.kind === 'clear-default') {
      onDefaultViewChange();
      return;
    }
    if (initialAction.kind === 'duplicate') {
      submitChange({
        kind: 'duplicate',
        view: duplicateDatabaseView({
          view,
          existingViews: views,
          uuid: crypto.randomUUID(),
        }),
      });
      return;
    }
    submitChange(initialAction);
  }, [open, initialAction, busy, views, onDefaultViewChange]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Manage saved views"
          data-database-inline-view-manager-trigger
        >
          <Settings2 aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        role="dialog"
        aria-label="Manage saved views"
        className="w-[min(25rem,calc(100vw-2rem))] p-3"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h4 className="font-medium text-sm">
              <Trans>Manage saved views</Trans>
            </h4>
            <p className="text-muted-foreground text-xs">
              <Trans>Manage views without leaving the document.</Trans>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{views.length}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              data-slot="dialog-close"
              onClick={() => onOpenChange(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>

        <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Saved views">
          {views.map((view, index) => {
            const isDefault = source.defaultViewId === view.id;
            const isActive = activeViewId === view.id;
            const isRenaming = renameViewId === view.id;
            return (
              <li
                key={view.id}
                className={cn(
                  'rounded-md border p-2',
                  isActive ? 'border-primary/50 bg-primary/5' : 'border-border/60',
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm"
                    onClick={() => onSelectView(view.id)}
                    disabled={busy}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {view.name}
                  </button>
                  {isDefault ? (
                    <Star
                      className="size-3.5 shrink-0 fill-current text-amber-500"
                      aria-label="Default view"
                    />
                  ) : null}
                  <span className="text-muted-foreground text-[10px] uppercase">
                    {view.layout.type}
                  </span>
                </div>
                {isRenaming ? (
                  <div className="mt-2 flex gap-1.5">
                    <Input
                      value={renameValue}
                      autoFocus
                      aria-label={`Rename ${view.name}`}
                      className="h-7 text-xs"
                      onChange={(event) => setRenameValue(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename();
                        if (event.key === 'Escape') setRenameViewId(null);
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-7"
                      onClick={commitRename}
                      disabled={busy}
                    >
                      <Trans>Save</Trans>
                    </Button>
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => beginRename(view)}
                    disabled={busy}
                  >
                    <Trans>Rename</Trans>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      submitChange({
                        kind: 'favorite',
                        viewId: view.id,
                        favorite: view.favorite !== true,
                      })
                    }
                    disabled={busy}
                  >
                    <Star className="mr-1 size-3" />
                    {view.favorite ? <Trans>Unfavorite</Trans> : <Trans>Favorite</Trans>}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      submitChange({ kind: 'reorder', viewId: view.id, direction: -1 })
                    }
                    disabled={busy || index === 0}
                    aria-label={`Move ${view.name} up`}
                  >
                    <ChevronUp className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => submitChange({ kind: 'reorder', viewId: view.id, direction: 1 })}
                    disabled={busy || index === views.length - 1}
                    aria-label={`Move ${view.name} down`}
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                  {isDefault ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onDefaultViewChange()}
                      disabled={busy}
                    >
                      <Trans>Clear default</Trans>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onDefaultViewChange(view.id)}
                      disabled={busy}
                    >
                      <Trans>Make default</Trans>
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      submitChange({
                        kind: 'duplicate',
                        view: duplicateDatabaseView({
                          view,
                          existingViews: views,
                          uuid: crypto.randomUUID(),
                        }),
                      })
                    }
                    disabled={busy}
                  >
                    <Copy className="mr-1 size-3" />
                    <Trans>Duplicate</Trans>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => submitChange({ kind: 'delete', viewId: view.id })}
                    disabled={busy || views.length <= 1 || isDefault}
                  >
                    <Trash2 className="mr-1 size-3" />
                    <Trans>Delete</Trans>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex gap-1.5 border-t pt-3">
          <Input
            value={newViewName}
            aria-label="New inline saved view name"
            placeholder="New view"
            className="h-8"
            onChange={(event) => setNewViewName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') createView();
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0"
            onClick={createView}
            disabled={busy || !newViewName.trim()}
          >
            <Plus className="mr-1 size-3.5" />
            <Trans>New view</Trans>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
