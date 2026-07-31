import { Trans } from '@lingui/react/macro';
import type { DatabasePropertyType } from '@nedian0brien/synapsenote-core';
import { Plus } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type DatabaseCatalogCandidate, fetchDatabaseCatalog } from '@/lib/database-catalog-client';
import { databaseAddablePropertyGroups } from '@/lib/database-mutations/database-property-catalog';
import { databasePropertyTypeLabel } from '@/lib/database-property-copy';
import { DatabasePropertyTypeIcon } from './database-property-icons';

export interface DatabaseRelationTarget {
  databaseId: string;
  sourceId: string;
}

/** Sentinel for "point at this source", since Select cannot hold an empty value. */
const SELF_TARGET = 'self';

/**
 * Select options carry one string, but a relation target is a database AND a
 * source. Pair them behind a named separator rather than an inline literal —
 * a mangled separator would silently resolve every target back to this source.
 */
const TARGET_SEPARATOR = '/';

function databaseSourceKey(databaseId: string, sourceId: string): string {
  return `${databaseId}${TARGET_SEPARATOR}${sourceId}`;
}

function splitDatabaseSourceKey(value: string): [string | undefined, string | undefined] {
  const [databaseId, sourceId] = value.split(TARGET_SEPARATOR);
  return [databaseId, sourceId];
}

export function DatabasePropertyInsertPopover({
  open,
  setOpen,
  sourceProperties,
  mutationLocked,
  propertyInsertTarget,
  setPropertyInsertTarget,
  newPropertyName,
  setNewPropertyName,
  newPropertyType,
  setNewPropertyType,
  submitAddProperty,
  showLabel = false,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  /** Decides which types this source can support — Rollup needs a Relation. */
  sourceProperties: readonly { type: DatabasePropertyType }[];
  mutationLocked: boolean;
  propertyInsertTarget: { propertyId: string; position: 'before' | 'after' } | null;
  setPropertyInsertTarget: Dispatch<
    SetStateAction<{ propertyId: string; position: 'before' | 'after' } | null>
  >;
  newPropertyName: string;
  setNewPropertyName: Dispatch<SetStateAction<string>>;
  newPropertyType: DatabasePropertyType;
  setNewPropertyType: Dispatch<SetStateAction<DatabasePropertyType>>;
  submitAddProperty: (relationTarget?: DatabaseRelationTarget) => void;
  showLabel?: boolean;
}) {
  // Loaded here rather than threaded down four component layers, matching
  // `InlineDatabasePicker`, and only once the user actually reaches for a
  // relation — every other property type needs no target at all.
  const [candidates, setCandidates] = useState<readonly DatabaseCatalogCandidate[] | null>(null);
  const [relationTarget, setRelationTarget] = useState<string>('');
  const needsTarget = newPropertyType === 'relation';

  useEffect(() => {
    if (!open || !needsTarget || candidates !== null) return;
    const controller = new AbortController();
    void fetchDatabaseCatalog({ signal: controller.signal })
      .then((catalog) => {
        if (!controller.signal.aborted) setCandidates(catalog.candidates);
      })
      .catch(() => {
        // A target list we could not load must not block creation: the seed
        // falls back to a self-relation, which is always valid.
        if (!controller.signal.aborted) setCandidates([]);
      });
    return () => controller.abort();
  }, [candidates, needsTarget, open]);

  const targets = (candidates ?? []).flatMap((database) =>
    database.sources.map((source) => ({
      value: databaseSourceKey(database.id, source.id),
      label: database.name === source.name ? database.name : `${database.name} · ${source.name}`,
    })),
  );

  const submit = () => {
    if (!needsTarget || relationTarget === '' || relationTarget === SELF_TARGET) {
      submitAddProperty();
      return;
    }
    const [databaseId, sourceId] = splitDatabaseSourceKey(relationTarget);
    submitAddProperty(databaseId && sourceId ? { databaseId, sourceId } : undefined);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setPropertyInsertTarget(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={showLabel ? 'sm' : 'icon-xs'}
          className={
            showLabel
              ? 'h-full w-full justify-start rounded-none px-3 font-normal text-muted-foreground hover:bg-muted/35 hover:text-foreground'
              : 'ml-1'
          }
          aria-label="Add property"
          disabled={mutationLocked}
        >
          <Plus aria-hidden="true" />
          {showLabel ? <Trans>Add property</Trans> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="grid gap-3">
          <div>
            <h3 className="font-medium text-sm">
              {propertyInsertTarget ? (
                propertyInsertTarget.position === 'before' ? (
                  <Trans>Insert property to the left</Trans>
                ) : (
                  <Trans>Insert property to the right</Trans>
                )
              ) : (
                <Trans>Add property</Trans>
              )}
            </h3>
            <p className="mt-1 text-muted-foreground text-xs">
              <Trans>Choose a name and type for the new column.</Trans>
            </p>
          </div>
          <Input
            value={newPropertyName}
            aria-label="New property name"
            placeholder="Property name"
            onChange={(event) => setNewPropertyName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
          <fieldset className="max-h-72 overflow-y-auto">
            <legend className="sr-only">Property type</legend>
            {databaseAddablePropertyGroups(sourceProperties).map((group) => (
              <div key={group.id} className="mb-1 last:mb-0">
                <p className="px-2 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.types.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      size="sm"
                      variant={newPropertyType === type ? 'secondary' : 'ghost'}
                      aria-pressed={newPropertyType === type}
                      className="justify-start gap-2"
                      onClick={() => setNewPropertyType(type)}
                    >
                      <DatabasePropertyTypeIcon type={type} className="size-4" />
                      {databasePropertyTypeLabel(type)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          {needsTarget ? (
            <div className="grid gap-1 text-xs">
              <span className="font-medium">
                <Trans>Related database</Trans>
              </span>
              <Select value={relationTarget || SELF_TARGET} onValueChange={setRelationTarget}>
                <SelectTrigger aria-label="Relation target" className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELF_TARGET}>
                    {candidates === null ? 'Loading…' : 'This database (sub-items)'}
                  </SelectItem>
                  {targets.map((target) => (
                    <SelectItem key={target.value} value={target.value}>
                      {target.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Button
            type="button"
            disabled={!newPropertyName.trim() || mutationLocked}
            onClick={submit}
          >
            {propertyInsertTarget ? <Trans>Insert property</Trans> : <Trans>Add property</Trans>}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
