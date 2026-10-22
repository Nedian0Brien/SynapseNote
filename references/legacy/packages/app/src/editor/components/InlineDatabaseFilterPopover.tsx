import type {
  DatabaseFilter,
  DatabaseFilterValue,
  DatabaseProperty,
  DatabaseQueryOperator,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import {
  databaseQueryOperatorsForProperty,
  validateDatabaseFilter,
} from '@nedian0brien/synapsenote-core';
import { Settings2, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
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

interface InlineDatabaseFilterPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  source: DatabaseSource;
  initialWhere?: DatabaseFilter | null;
  initialPropertyId?: string;
  onSave: (where: DatabaseFilter | undefined) => void;
  onOpenAdvanced: () => void;
}

interface FilterDraft {
  propertyId: string;
  operator: DatabaseQueryOperator;
  value: string;
}

function directFilter(filter: DatabaseFilter | null | undefined): FilterDraft | null {
  if (!filter || 'and' in filter || 'or' in filter || 'not' in filter) return null;
  return {
    propertyId: filter.propertyId,
    operator: filter.operator,
    value: 'value' in filter ? String(filter.value ?? '') : '',
  };
}

function isBooleanProperty(property: DatabaseProperty): boolean {
  return (
    property.type === 'checkbox' ||
    (property.type === 'formula' && property.ast.resultType === 'boolean')
  );
}

function isNumericProperty(property: DatabaseProperty): boolean {
  return (
    property.type === 'number' ||
    property.type === 'unique_id' ||
    (property.type === 'formula' && property.ast.resultType === 'number')
  );
}

function draftValue(
  draft: FilterDraft,
  property: DatabaseProperty,
): DatabaseFilterValue | undefined {
  if (draft.operator === 'is_empty' || draft.operator === 'is_not_empty') return undefined;
  if (draft.operator === 'in') {
    const parsed: unknown = JSON.parse(draft.value);
    if (!Array.isArray(parsed)) throw new Error('Use a JSON array for this operator.');
    return parsed as DatabaseFilterValue;
  }
  if (isNumericProperty(property)) {
    const number = Number(draft.value);
    if (!Number.isFinite(number)) throw new Error(`${property.name} requires a number.`);
    return number;
  }
  if (isBooleanProperty(property)) {
    if (draft.value === 'true') return true;
    if (draft.value === 'false') return false;
    throw new Error(`${property.name} requires true or false.`);
  }
  return draft.value;
}

export function InlineDatabaseFilterPopover({
  open,
  onOpenChange,
  trigger,
  source,
  initialWhere,
  initialPropertyId,
  onSave,
  onOpenAdvanced,
}: InlineDatabaseFilterPopoverProps) {
  const firstProperty =
    source.properties.find((property) => property.id === initialPropertyId) ?? source.properties[0];
  const [draft, setDraft] = useState<FilterDraft | null>(() => directFilter(initialWhere));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const current = directFilter(initialWhere);
    setDraft(
      current ??
        (firstProperty
          ? {
              propertyId: firstProperty.id,
              operator: databaseQueryOperatorsForProperty(firstProperty)[0] ?? 'eq',
              value: '',
            }
          : null),
    );
    setError(null);
  }, [open, initialWhere, firstProperty]);

  const property =
    source.properties.find((candidate) => candidate.id === draft?.propertyId) ?? firstProperty;
  const operators = property ? databaseQueryOperatorsForProperty(property) : [];
  const hasValue =
    draft !== null && draft.operator !== 'is_empty' && draft.operator !== 'is_not_empty';

  const apply = () => {
    if (!draft || !property) {
      onSave(undefined);
      onOpenChange(false);
      return;
    }
    try {
      const where = {
        propertyId: property.id,
        operator: draft.operator,
        ...(hasValue ? { value: draftValue(draft, property) } : {}),
      } as DatabaseFilter;
      validateDatabaseFilter(source, where);
      onSave(where);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Filter value is invalid.');
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,calc(100vw-2rem))] space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-medium text-sm">Filters</h2>
            <p className="text-muted-foreground text-xs">Filter pages in this linked view.</p>
          </div>
          <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        {draft && property ? (
          <div className="space-y-2 rounded border p-2" data-inline-filter-rule>
            <Select
              value={draft.propertyId}
              onValueChange={(propertyId) => {
                const nextProperty = source.properties.find(
                  (candidate) => candidate.id === propertyId,
                );
                setDraft({
                  propertyId,
                  operator: nextProperty
                    ? (databaseQueryOperatorsForProperty(nextProperty)[0] ?? 'eq')
                    : 'eq',
                  value: '',
                });
              }}
            >
              <SelectTrigger aria-label="Filter property">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {source.properties.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Select
                value={draft.operator}
                onValueChange={(operator) =>
                  setDraft({ ...draft, operator: operator as DatabaseQueryOperator })
                }
              >
                <SelectTrigger aria-label="Filter operator" className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((operator) => (
                    <SelectItem key={operator} value={operator}>
                      {operator}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Clear filter"
                onClick={() => setDraft(null)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            {hasValue ? (
              <Input
                value={draft.value}
                aria-label={`Filter value for ${property.name}`}
                placeholder={draft.operator === 'in' ? '["value-a"]' : 'Value'}
                onChange={(event) => setDraft({ ...draft, value: event.currentTarget.value })}
              />
            ) : null}
          </div>
        ) : (
          <p className="rounded border border-dashed p-2 text-muted-foreground text-xs">
            No filter applied.
          </p>
        )}
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onOpenAdvanced}>
            Open advanced filters
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
