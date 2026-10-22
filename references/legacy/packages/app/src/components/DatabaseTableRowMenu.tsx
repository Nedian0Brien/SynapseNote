import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Trans } from '@lingui/react/macro';
import type { DatabaseQueryResult, DatabaseSource } from '@nedian0brien/synapsenote-core';
import {
  Archive,
  Braces,
  Copy,
  ExternalLink,
  MoveRight,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { type RefObject, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { DatabaseRowMenu, DatabaseTableProps } from './database-table-types';

export function DatabaseTableRowMenu({
  rowMenu,
  rowMenuRef,
  databaseId,
  source,
  viewId,
  result,
  mutationLocked,
  onOpen,
  onOpenContextInspector,
  onOpenAgentScope,
  onDuplicate,
  onArchive,
  onRequestMove,
  onDelete,
  setRowMenu,
}: {
  rowMenu: DatabaseRowMenu | null;
  rowMenuRef: RefObject<HTMLDivElement | null>;
  databaseId: string;
  source: DatabaseSource;
  viewId: string | null;
  result: DatabaseQueryResult;
  mutationLocked: boolean;
  onOpen?: DatabaseTableProps['onOpen'];
  onOpenContextInspector?: DatabaseTableProps['onOpenContextInspector'];
  onOpenAgentScope?: DatabaseTableProps['onOpenAgentScope'];
  onDuplicate?: DatabaseTableProps['onDuplicate'];
  onArchive?: DatabaseTableProps['onArchive'];
  onRequestMove?: DatabaseTableProps['onRequestMove'];
  onDelete?: DatabaseTableProps['onDelete'];
  setRowMenu: (value: DatabaseRowMenu | null) => void;
}) {
  useEffect(() => {
    if (!rowMenu) return;
    const menu = rowMenuRef.current;
    const { anchor } = rowMenu;
    if (!menu || !anchor.isConnected) {
      setRowMenu(null);
      return;
    }

    const updatePosition = () => {
      void computePosition(anchor, menu, {
        strategy: 'fixed',
        placement: 'left-start',
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        menu.style.left = `${Math.round(x)}px`;
        menu.style.top = `${Math.round(y)}px`;
      });
    };
    const stopAutoUpdate = autoUpdate(anchor, menu, updatePosition);
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menu.contains(event.target) || anchor.contains(event.target)) return;
      setRowMenu(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    menu.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();

    return () => {
      stopAutoUpdate();
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [rowMenu, rowMenuRef, setRowMenu]);

  if (!rowMenu) return null;
  const record = result.records.find((candidate) => candidate.id === rowMenu.recordId);
  if (!record) return null;
  const visibleLabel = rowMenu.recordLabel;
  const actionLabel = (action: string) => `${action} page ${visibleLabel}`;
  const close = (restoreFocus = false) => {
    setRowMenu(null);
    if (restoreFocus) requestAnimationFrame(() => rowMenu.anchor.focus());
  };

  return (
    <div
      ref={rowMenuRef}
      role="menu"
      aria-label={`Page actions for ${visibleLabel}`}
      className="fixed z-[100] w-56 rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      data-database-row-handle-menu={record.id}
      onKeyDown={(event) => {
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
        ];
        if (event.key === 'Escape') {
          event.preventDefault();
          close(true);
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || items.length === 0) {
          return;
        }
        event.preventDefault();
        const current = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : event.key === 'ArrowDown'
                ? (current + 1) % items.length
                : (current - 1 + items.length) % items.length;
        items[next]?.focus();
      }}
    >
      <div className="truncate px-1.5 py-1 text-xs font-medium text-muted-foreground">
        {visibleLabel}
      </div>
      {onOpen ? (
        <Button
          role="menuitem"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          aria-label={actionLabel('Open')}
          onClick={() => {
            close();
            onOpen(record);
          }}
        >
          <ExternalLink /> <Trans>Open</Trans>
        </Button>
      ) : null}
      {onOpenContextInspector ? (
        <Button
          role="menuitem"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          aria-label={actionLabel('Inspect context for')}
          disabled={mutationLocked}
          onClick={() => {
            close();
            onOpenContextInspector(record);
          }}
        >
          <Braces /> <Trans>Inspect context</Trans>
        </Button>
      ) : null}
      {onOpenAgentScope ? (
        <Button
          role="menuitem"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          aria-label={actionLabel('Ask agent about')}
          disabled={mutationLocked}
          onClick={() => {
            close();
            onOpenAgentScope({
              databaseId,
              sourceId: source.id,
              ...(viewId ? { viewId } : {}),
              recordId: record.id,
            });
          }}
        >
          <Sparkles /> <Trans>Ask agent</Trans>
        </Button>
      ) : null}
      {onDuplicate ? (
        <Button
          role="menuitem"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          aria-label={actionLabel('Duplicate')}
          disabled={mutationLocked}
          onClick={() => {
            close();
            onDuplicate(record);
          }}
        >
          <Copy /> <Trans>Duplicate</Trans>
        </Button>
      ) : null}
      {onArchive ? (
        <Button
          role="menuitem"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          aria-label={actionLabel(record.archivedAt ? 'Restore' : 'Archive')}
          disabled={mutationLocked}
          onClick={() => {
            close();
            onArchive(record, record.archivedAt ? 'restore' : 'archive');
          }}
        >
          {record.archivedAt ? <RotateCcw /> : <Archive />}
          {record.archivedAt ? <Trans>Restore</Trans> : <Trans>Archive</Trans>}
        </Button>
      ) : null}
      {onRequestMove ? (
        <Button
          role="menuitem"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          aria-label={actionLabel('Move')}
          disabled={mutationLocked}
          onClick={() => {
            close();
            onRequestMove(record);
          }}
        >
          <MoveRight /> <Trans>Move</Trans>
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          role="menuitem"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive"
          aria-label={actionLabel('Delete')}
          disabled={mutationLocked}
          onClick={() => {
            close();
            onDelete(record);
          }}
        >
          <Trash2 /> <Trans>Delete</Trans>
        </Button>
      ) : null}
    </div>
  );
}
