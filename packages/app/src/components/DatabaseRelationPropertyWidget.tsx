import { useLingui } from '@lingui/react/macro';
import type { DatabaseProperty, FrontmatterValue } from '@nedian0brien/synapsenote-core';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { ListWidget, TextWidget } from '@/components/PropertyWidgets';
import { Button } from '@/components/ui/button';
import { databaseRecordPathToHash } from '@/lib/database-navigation';
import type { DatabaseRelationNavigationItem } from '@/lib/database-relation-navigation';

type DatabaseRelationProperty = Extract<DatabaseProperty, { type: 'relation' }>;

export function DatabaseRelationPropertyWidget({
  keyName,
  property,
  value,
  targets,
  loading = false,
  onCommit,
}: {
  keyName: string;
  property: DatabaseRelationProperty;
  value: FrontmatterValue;
  targets: readonly DatabaseRelationNavigationItem[];
  loading?: boolean;
  onCommit: (next: FrontmatterValue) => void;
}) {
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  const selectedIds =
    property.cardinality === 'one'
      ? typeof value === 'string' && value.length > 0
        ? [value]
        : []
      : Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : [];
  const targetById = new Map(targets.map((target) => [target.recordId, target]));

  if (editing) {
    if (property.cardinality === 'one') {
      return (
        <TextWidget
          keyName={keyName}
          value={typeof value === 'string' ? value : ''}
          onCommit={(next) => {
            setEditing(false);
            onCommit(next);
          }}
        />
      );
    }
    return (
      <ListWidget
        keyName={keyName}
        value={selectedIds}
        onCommit={(next) => {
          setEditing(false);
          onCommit(next);
        }}
      />
    );
  }

  return (
    <div
      className="group flex min-h-7 min-w-0 items-center gap-1 rounded-md px-2 py-1"
      data-database-relation-value
      data-key={keyName}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {selectedIds.length === 0 ? (
          <span className="text-muted-foreground text-sm">{t`Empty`}</span>
        ) : (
          selectedIds.map((recordId) => {
            const target = targetById.get(recordId);
            if (!target) {
              return (
                <span
                  key={recordId}
                  className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs"
                  data-database-relation-unavailable
                  data-record-id={recordId}
                >
                  {recordId} · {t`unavailable`}
                </span>
              );
            }
            return (
              <a
                key={recordId}
                href={databaseRecordPathToHash(target.path)}
                className="max-w-full truncate rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-database-relation-link
                data-record-id={recordId}
              >
                {target.title}
              </a>
            );
          })
        )}
        {loading ? (
          <span className="text-muted-foreground text-xs" role="status">
            {t`Loading related records`}
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t`Edit ${keyName}`}
        onClick={() => setEditing(true)}
        className="shrink-0 text-muted-foreground/0 hover:text-foreground focus-visible:text-muted-foreground group-hover:text-muted-foreground/60"
        data-database-relation-edit
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
