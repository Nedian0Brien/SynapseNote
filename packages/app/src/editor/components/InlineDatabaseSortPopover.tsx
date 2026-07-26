import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SortRule = DatabaseView['sort'][number] & { editorId: string };

interface InlineDatabaseSortPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  source: DatabaseSource;
  initialSort: DatabaseView['sort'];
  initialPropertyId?: string;
  onSave: (sort: DatabaseView['sort']) => void;
}

function createRules(sort: DatabaseView['sort'], initialPropertyId?: string): SortRule[] {
  const rules = sort.map((rule, index) => ({ ...rule, editorId: `inline-sort:${index}` }));
  if (
    initialPropertyId &&
    !rules.some((rule) => rule.propertyId === initialPropertyId) &&
    rules.length < 3
  ) {
    rules.push({ propertyId: initialPropertyId, direction: 'asc', editorId: 'inline-sort:target' });
  }
  return rules;
}

export function InlineDatabaseSortPopover({
  open,
  onOpenChange,
  trigger,
  source,
  initialSort,
  initialPropertyId,
  onSave,
}: InlineDatabaseSortPopoverProps) {
  const [rules, setRules] = useState<SortRule[]>(() => createRules(initialSort, initialPropertyId));

  useEffect(() => {
    if (open) setRules(createRules(initialSort, initialPropertyId));
  }, [open, initialPropertyId, initialSort]);

  const availableProperties = source.properties;
  const addRule = () => {
    const property = availableProperties.find(
      (candidate) => !rules.some((rule) => rule.propertyId === candidate.id),
    );
    if (!property || rules.length >= 3) return;
    setRules((current) => [
      ...current,
      { propertyId: property.id, direction: 'asc', editorId: `inline-sort:${Date.now()}` },
    ]);
  };

  const save = () => {
    onSave(rules.map(({ editorId: _editorId, ...rule }) => rule));
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,calc(100vw-2rem))] space-y-3 p-3">
        <div>
          <h2 className="font-medium text-sm">Sort</h2>
          <p className="text-muted-foreground text-xs">Order pages in this linked view.</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="sr-only">Sort rules</legend>
          {rules.length === 0 ? (
            <p className="rounded border border-dashed p-2 text-muted-foreground text-xs">
              No sort rules. Pages use the source order.
            </p>
          ) : null}
          {rules.map((rule, index) => (
            <div key={rule.editorId} className="flex items-center gap-2" data-inline-sort-rule>
              <Select
                value={rule.propertyId}
                onValueChange={(propertyId) =>
                  setRules((current) =>
                    current.map((candidate) =>
                      candidate.editorId === rule.editorId
                        ? { ...candidate, propertyId }
                        : candidate,
                    ),
                  )
                }
              >
                <SelectTrigger aria-label={`Sort property ${index + 1}`} className="min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableProperties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={rule.direction}
                onValueChange={(direction: 'asc' | 'desc') =>
                  setRules((current) =>
                    current.map((candidate) =>
                      candidate.editorId === rule.editorId
                        ? { ...candidate, direction }
                        : candidate,
                    ),
                  )
                }
              >
                <SelectTrigger aria-label={`Sort direction ${index + 1}`} className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Move sort rule ${index + 1} up`}
                disabled={index === 0}
                onClick={() =>
                  setRules((current) => {
                    if (index === 0) return current;
                    const next = [...current];
                    [next[index - 1], next[index]] = [
                      next[index] as SortRule,
                      next[index - 1] as SortRule,
                    ];
                    return next;
                  })
                }
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Move sort rule ${index + 1} down`}
                disabled={index === rules.length - 1}
                onClick={() =>
                  setRules((current) => {
                    if (index >= current.length - 1) return current;
                    const next = [...current];
                    [next[index], next[index + 1]] = [
                      next[index + 1] as SortRule,
                      next[index] as SortRule,
                    ];
                    return next;
                  })
                }
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove sort rule ${index + 1}`}
                onClick={() =>
                  setRules((current) =>
                    current.filter((candidate) => candidate.editorId !== rule.editorId),
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
        </fieldset>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={addRule}
            disabled={rules.length >= 3}
          >
            <Plus aria-hidden="true" /> Add sort rule
          </Button>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={save}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
