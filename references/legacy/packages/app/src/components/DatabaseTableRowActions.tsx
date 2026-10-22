import { Trans } from '@lingui/react/macro';
import type { DatabaseSource, ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DatabaseGhostState } from '@/lib/database-mutation-client';
import { cn } from '@/lib/utils';
import type { DatabaseTableProps } from './database-table-types';

export interface DatabaseTableRowActionsProps
  extends Pick<
    DatabaseTableProps,
    | 'onDelete'
    | 'onDuplicate'
    | 'onArchive'
    | 'onRequestMove'
    | 'onOpen'
    | 'onOpenContextInspector'
    | 'onOpenAgentScope'
  > {
  databaseId: string;
  viewId: string | null;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  recordLabel: string;
  notionSurface: boolean;
  mutationLocked: boolean;
  ghostCreated: boolean;
  proposedRecord: DatabaseGhostState['diff']['records'][number] | undefined;
  proposedDeletion: boolean;
  proposedArchiveAction: 'archive' | 'restore' | null;
  proposedMove: boolean;
}

export function DatabaseTableRowActions({
  databaseId,
  viewId,
  source,
  record,
  recordLabel,
  notionSurface,
  mutationLocked,
  ghostCreated,
  proposedRecord,
  proposedDeletion,
  proposedArchiveAction,
  proposedMove,
  onDelete,
  onDuplicate,
  onArchive,
  onRequestMove,
  onOpen,
  onOpenContextInspector,
  onOpenAgentScope,
}: DatabaseTableRowActionsProps) {
  const recordActionLabel = (action: string) =>
    `${action} ${notionSurface ? 'page' : 'record'} ${recordLabel}`;
  if (proposedDeletion) {
    return (
      <Badge variant="warning">
        <Trans>Proposed deletion</Trans>
      </Badge>
    );
  }
  if (proposedArchiveAction) {
    return (
      <Badge variant="warning">
        {proposedArchiveAction === 'archive' ? (
          <Trans>Proposed archive</Trans>
        ) : (
          <Trans>Proposed restore</Trans>
        )}
      </Badge>
    );
  }
  if (proposedMove) {
    return (
      <Badge variant="warning">
        <Trans>Proposed move</Trans>
      </Badge>
    );
  }
  if (ghostCreated) return null;

  return (
    <div
      className={cn(
        'flex justify-end gap-1',
        notionSurface && 'gap-0.5',
        notionSurface &&
          'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100',
      )}
      data-database-row-actions
    >
      {record.archivedAt && !notionSurface ? (
        <Badge variant="gray">
          <Trans>Archived</Trans>
        </Badge>
      ) : null}
      {notionSurface ? (
        onOpen ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-6 bg-background px-2 text-[11px] shadow-xs"
            disabled={proposedRecord !== undefined}
            aria-label={recordActionLabel('Open preview for')}
            data-database-row-open-button={record.id}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(record);
            }}
          >
            <Trans>Open</Trans>
          </Button>
        ) : null
      ) : (
        <>
          {onOpen ? (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={mutationLocked || proposedRecord !== undefined}
              aria-label={recordActionLabel('Open')}
              onClick={() => onOpen(record)}
            >
              <ExternalLink />
            </Button>
          ) : null}
          {onOpenContextInspector ? (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={mutationLocked || proposedRecord !== undefined}
              aria-label={recordActionLabel('Inspect context for')}
              onClick={() => onOpenContextInspector(record)}
            >
              <Braces aria-hidden="true" />
            </Button>
          ) : null}
          {onOpenAgentScope ? (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={mutationLocked || proposedRecord !== undefined}
              aria-label={recordActionLabel('Ask agent about')}
              onClick={() =>
                onOpenAgentScope({
                  databaseId,
                  sourceId: source.id,
                  ...(viewId ? { viewId } : {}),
                  recordId: record.id,
                })
              }
            >
              <Sparkles aria-hidden="true" />
            </Button>
          ) : null}
          {onDuplicate ? (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={mutationLocked || proposedRecord !== undefined}
              aria-label={recordActionLabel('Duplicate')}
              onClick={() => onDuplicate(record)}
            >
              <Copy />
            </Button>
          ) : null}
          {onArchive ? (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={mutationLocked || proposedRecord !== undefined}
              aria-label={recordActionLabel(record.archivedAt ? 'Restore' : 'Archive')}
              onClick={() => onArchive(record, record.archivedAt ? 'restore' : 'archive')}
            >
              {record.archivedAt ? <RotateCcw /> : <Archive />}
            </Button>
          ) : null}
          {onRequestMove ? (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={mutationLocked || proposedRecord !== undefined}
              aria-label={recordActionLabel('Move')}
              onClick={() => onRequestMove(record)}
            >
              <MoveRight />
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={mutationLocked || proposedRecord !== undefined}
              aria-label={recordActionLabel('Delete')}
              onClick={() => onDelete(record)}
            >
              <Trash2 />
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
