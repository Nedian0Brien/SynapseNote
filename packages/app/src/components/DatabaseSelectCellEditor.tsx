import { Trans, useLingui } from '@lingui/react/macro';
import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { GripVertical, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { databaseInlineOptionColorClass, multiSelectDraftValues } from './database-table-utils';

type DatabaseSelectCellProperty = Extract<DatabaseProperty, { type: 'select' | 'multi_select' }>;

function selectedOptionIds(property: DatabaseSelectCellProperty, draft: string): string[] {
  return property.type === 'select' ? (draft === '' ? [] : [draft]) : multiSelectDraftValues(draft);
}

export function DatabaseSelectCellEditor({
  property,
  draft,
  onDraftChange,
  onCreateOption,
  onReorderOptions,
  onCommit,
  onCancel,
}: {
  property: DatabaseSelectCellProperty;
  draft: string;
  onDraftChange: (draft: string) => void;
  onCreateOption?: (name: string, selectedOptionIds: readonly string[]) => boolean;
  onReorderOptions?: (optionIds: readonly string[]) => boolean;
  onCommit: (draft: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);
  const initialDraftRef = useRef(draft);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [orderedOptionIds, setOrderedOptionIds] = useState(() =>
    property.options.map((option) => option.id),
  );
  const [draggedOptionId, setDraggedOptionId] = useState<string | null>(null);
  const selectedIds = selectedOptionIds(property, draft);
  const selectedOptions = selectedIds.flatMap((optionId) => {
    const option = property.options.find((candidate) => candidate.id === optionId);
    return option ? [option] : [];
  });
  const orderedOptions = orderedOptionIds.flatMap((optionId) => {
    const option = property.options.find((candidate) => candidate.id === optionId);
    return option ? [option] : [];
  });
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = orderedOptions.filter(
    (option) =>
      (option.archived !== true || selectedIds.includes(option.id)) &&
      (normalizedQuery === '' || option.name.toLocaleLowerCase().includes(normalizedQuery)),
  );
  const createName = query.trim();
  const canCreate = Boolean(
    onCreateOption &&
      createName &&
      !property.options.some(
        (option) =>
          option.archived !== true &&
          option.name.localeCompare(createName, undefined, { sensitivity: 'accent' }) === 0,
      ),
  );
  const activeOption = visibleOptions[Math.min(activeIndex, visibleOptions.length - 1)];

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, visibleOptions.length - 1)));
  }, [visibleOptions.length]);

  useEffect(() => {
    setOrderedOptionIds(property.options.map((option) => option.id));
  }, [property.options]);

  const finishCommit = (nextDraft: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onCommit(nextDraft);
  };

  const finishCancel = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onCancel();
  };

  const finishClose = () => {
    if (draft === initialDraftRef.current) {
      finishCancel();
      return;
    }
    finishCommit(draft);
  };

  const commitOption = (optionId: string) => {
    if (property.type === 'select') {
      finishCommit(optionId);
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(optionId)) next.delete(optionId);
    else next.add(optionId);
    onDraftChange(JSON.stringify([...next]));
    setQuery('');
  };

  const removeOption = (optionId: string) => {
    if (property.type === 'select') {
      if (!property.required) finishCommit('');
      return;
    }
    onDraftChange(JSON.stringify(selectedIds.filter((selectedId) => selectedId !== optionId)));
  };

  const createAndAssignOption = () => {
    if (!canCreate || !onCreateOption) return;
    finishedRef.current = true;
    if (!onCreateOption(createName, selectedIds)) finishedRef.current = false;
  };

  const reorderOption = (optionId: string, targetOptionId: string) => {
    if (!onReorderOptions || optionId === targetOptionId) return;
    const next = [...orderedOptionIds];
    const fromIndex = next.indexOf(optionId);
    const targetIndex = next.indexOf(targetOptionId);
    if (fromIndex < 0 || targetIndex < 0) return;
    next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, optionId);
    if (onReorderOptions(next)) setOrderedOptionIds(next);
  };

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) finishClose();
      }}
    >
      <PopoverAnchor asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 min-w-28 max-w-full justify-start gap-1 overflow-hidden rounded-md border-ring/60 px-1.5 text-left shadow-xs"
          aria-label={`Editing ${property.name}`}
          onClick={() => inputRef.current?.focus()}
        >
          {selectedOptions.length > 0 ? (
            <span className="flex min-w-0 flex-wrap gap-1 overflow-hidden">
              {selectedOptions.map((option) => (
                <span
                  key={option.id}
                  className={cn(
                    'inline-flex min-w-0 max-w-32 items-center gap-0.5 rounded-sm px-2 py-0.5 text-xs',
                    databaseInlineOptionColorClass(option.color),
                  )}
                >
                  <span className="truncate">{option.name}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="truncate text-muted-foreground text-xs">
              <Trans>Choose an option</Trans>
            </span>
          )}
        </Button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={-32}
        className="w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-md p-0"
        aria-label={`Edit ${property.name}`}
        data-database-select-picker={property.id}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={finishClose}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          finishCancel();
        }}
      >
        <div className="flex min-h-10 flex-wrap items-center gap-1 border-b px-2 py-1.5">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className={cn(
                'inline-flex min-w-0 max-w-36 items-center gap-0.5 rounded-sm pl-2 text-xs',
                databaseInlineOptionColorClass(option.color),
              )}
            >
              <span className="truncate py-0.5">{option.name}</span>
              {property.required && property.type === 'select' ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-4 rounded-full opacity-60 hover:bg-black/10 hover:opacity-100 focus-visible:ring-1 dark:hover:bg-white/10"
                  aria-label={`Remove ${option.name} from ${property.name}`}
                  onClick={() => removeOption(option.id)}
                >
                  <X className="size-3" aria-hidden="true" />
                </Button>
              )}
            </span>
          ))}
          <div className="flex min-w-20 flex-1 items-center">
            <Input
              ref={inputRef}
              role="combobox"
              aria-label={`Edit ${property.name}`}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={activeOption ? `${listboxId}-${activeOption.id}` : undefined}
              value={query}
              placeholder={selectedOptions.length > 0 ? '' : t`Type to select or create`}
              className="h-7 min-w-16 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    visibleOptions.length === 0 ? 0 : (current + 1) % visibleOptions.length,
                  );
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    visibleOptions.length === 0
                      ? 0
                      : (current - 1 + visibleOptions.length) % visibleOptions.length,
                  );
                  return;
                }
                if (event.key === 'Enter' && canCreate) {
                  event.preventDefault();
                  createAndAssignOption();
                  return;
                }
                if (event.key === 'Enter' && activeOption) {
                  event.preventDefault();
                  commitOption(activeOption.id);
                  return;
                }
                if (event.key === 'Tab' && property.type === 'multi_select') {
                  finishCommit(draft);
                  return;
                }
                if (event.key === 'Backspace' && query === '' && selectedOptions.length > 0) {
                  const lastOption = selectedOptions.at(-1);
                  if (lastOption && !(property.required && property.type === 'select')) {
                    event.preventDefault();
                    removeOption(lastOption.id);
                  }
                }
              }}
            />
          </div>
        </div>
        <p className="px-3 pt-2 pb-1 font-medium text-muted-foreground text-xs">
          {onCreateOption ? (
            <Trans>Select or create an option</Trans>
          ) : property.type === 'multi_select' ? (
            <Trans>Select one or more options</Trans>
          ) : (
            <Trans>Select an option</Trans>
          )}
        </p>
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${property.name} options`}
          aria-multiselectable={property.type === 'multi_select' ? 'true' : undefined}
          className="max-h-60 overflow-y-auto px-1 pb-1"
        >
          {visibleOptions.map((option, index) => {
            const selected = selectedIds.includes(option.id);
            return (
              <div
                key={option.id}
                id={`${listboxId}-${option.id}`}
                role="option"
                aria-selected={selected}
                aria-label={option.name}
                tabIndex={-1}
                draggable={false}
                className={cn(
                  'flex min-h-8 w-full cursor-pointer items-center gap-1 rounded-sm px-1 py-1 text-left text-sm hover:bg-accent',
                  index === activeIndex && 'bg-accent',
                )}
                onMouseMove={() => setActiveIndex(index)}
                onDragOver={(event) => {
                  if (!draggedOptionId) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedOptionId) reorderOption(draggedOptionId, option.id);
                  setDraggedOptionId(null);
                }}
                onClick={() => commitOption(option.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  commitOption(option.id);
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  draggable={Boolean(onReorderOptions)}
                  disabled={!onReorderOptions}
                  aria-label={`Move ${option.name}`}
                  className="size-5 cursor-grab rounded-sm p-0 text-muted-foreground opacity-60 hover:bg-transparent hover:opacity-100 disabled:opacity-30 active:cursor-grabbing"
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    setDraggedOptionId(option.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', option.id);
                  }}
                  onDragEnd={() => setDraggedOptionId(null)}
                  onKeyDown={(event) => {
                    const currentIndex = orderedOptionIds.indexOf(option.id);
                    const targetIndex =
                      event.key === 'ArrowUp'
                        ? currentIndex - 1
                        : event.key === 'ArrowDown'
                          ? currentIndex + 1
                          : -1;
                    const targetId = orderedOptionIds[targetIndex];
                    if (!targetId) return;
                    event.preventDefault();
                    event.stopPropagation();
                    reorderOption(option.id, targetId);
                  }}
                >
                  <GripVertical className="size-3.5" aria-hidden="true" />
                </Button>
                <span
                  className={cn(
                    'inline-flex min-w-0 max-w-[15rem] rounded-sm px-2 py-0.5 text-xs',
                    databaseInlineOptionColorClass(option.color),
                  )}
                >
                  <span className="truncate">{option.name}</span>
                </span>
                {option.archived === true ? (
                  <span className="text-muted-foreground text-xs">
                    <Trans>archived</Trans>
                  </span>
                ) : null}
              </div>
            );
          })}
          {canCreate ? (
            <Button
              type="button"
              variant="ghost"
              role="option"
              aria-selected="false"
              aria-label={`Create ${createName}`}
              className="h-8 w-full justify-start gap-2 rounded-sm px-2 font-normal text-sm"
              onClick={createAndAssignOption}
            >
              <Plus className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <Trans>Create “{createName}”</Trans>
            </Button>
          ) : null}
          {visibleOptions.length === 0 && !canCreate ? (
            <p className="px-3 py-5 text-center text-muted-foreground text-sm">
              <Trans>No matching options.</Trans>
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
