import type {
  DatabaseProperty,
  DatabaseQueryResult,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import { Check, FileText, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { DatabaseDateCellEditor } from '@/components/DatabaseDateCellEditor';
import { DatabaseFilesCellEditor } from '@/components/DatabaseFilesCellEditor';
import { DatabasePlaceCellEditor } from '@/components/DatabasePlaceCellEditor';
import { DatabaseRelationCellEditor } from '@/components/DatabaseRelationCellEditor';
import { DatabaseSelectCellEditor } from '@/components/DatabaseSelectCellEditor';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DatabaseTableCellEditing } from './database-table-cell-types';
import type { DatabaseTableProps } from './database-table-types';
import { multiSelectDraftValues } from './database-table-utils';

interface DatabaseTableCellEditingContentProps
  extends Pick<
    DatabaseTableProps,
    'onRelationSearch' | 'onCreateSelectOption' | 'onReorderSelectOptions' | 'onOpen'
  > {
  property: DatabaseProperty;
  record: ProjectedDatabaseRecord;
  notionSurface: boolean;
  people: readonly ProjectedDatabasePerson[];
  relationRecords: readonly ProjectedDatabaseRelationRecord[];
  fileStates: DatabaseQueryResult['fileStates'];
  personLabels: { agent: string; inactive: string };
  recordLabel: string;
  editing: DatabaseTableCellEditing;
  onSaveEdit: (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    draftOverride?: string,
  ) => void;
  onCancelEdit: (record: ProjectedDatabaseRecord, property: DatabaseProperty) => void;
  setEditing: Dispatch<SetStateAction<DatabaseTableCellEditing | null>>;
}

/** Editor-only branch for a cell; it owns no mutation, focus, or geometry state. */
export function DatabaseTableCellEditingContent({
  property,
  record,
  notionSurface,
  people,
  relationRecords,
  fileStates,
  personLabels,
  recordLabel,
  editing,
  onRelationSearch,
  onCreateSelectOption,
  onReorderSelectOptions,
  onOpen,
  onSaveEdit,
  onCancelEdit,
  setEditing,
}: DatabaseTableCellEditingContentProps) {
  const inlineScalarEditor =
    notionSurface && ['title', 'text', 'number', 'url', 'email', 'phone'].includes(property.type);

  if (property.type === 'select' || property.type === 'multi_select') {
    return (
      <DatabaseSelectCellEditor
        property={property}
        draft={editing.draft}
        onDraftChange={(draft) => setEditing({ ...editing, draft })}
        onCreateOption={
          onCreateSelectOption
            ? (name, selectedOptionIds) =>
                onCreateSelectOption(record, property, name, selectedOptionIds)
            : undefined
        }
        onReorderOptions={
          onReorderSelectOptions
            ? (optionIds) => onReorderSelectOptions(property, optionIds)
            : undefined
        }
        onCommit={(draft) => onSaveEdit(record, property, draft)}
        onCancel={() => onCancelEdit(record, property)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex min-w-56 items-center gap-1',
        notionSurface && 'w-full min-w-0',
        property.type === 'title' && 'w-full min-w-0 max-w-full overflow-hidden',
      )}
      data-title-cell-content={property.type === 'title' ? '' : undefined}
      data-title-cell-editing={property.type === 'title' ? '' : undefined}
    >
      {property.type === 'title' ? (
        onOpen ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-5 shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            aria-label={`Open ${notionSurface ? 'page' : 'record'} ${recordLabel}`}
            data-record-title-open={record.id}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(record);
            }}
          >
            <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          </Button>
        ) : notionSurface ? (
          <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null
      ) : null}
      {property.type === 'checkbox' ? (
        <Checkbox
          autoFocus
          checked={editing.draft === 'true'}
          aria-label={`Edit ${property.name}`}
          onCheckedChange={(checked) =>
            setEditing({ ...editing, draft: checked === true ? 'true' : 'false' })
          }
        />
      ) : property.type === 'text' ? (
        <Textarea
          autoFocus
          rows={1}
          dir="auto"
          value={editing.draft}
          aria-label={`Edit ${property.name}`}
          data-database-cell-editor-control="true"
          onChange={(event) => setEditing({ ...editing, draft: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSaveEdit(record, property);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancelEdit(record, property);
            }
          }}
          className={cn(
            notionSurface
              ? 'h-5 min-h-5 resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-0 leading-5 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent'
              : 'h-8 min-h-8 resize-none py-1.5',
          )}
        />
      ) : property.type === 'date' ? (
        <DatabaseDateCellEditor
          key={`${record.id}:${property.id}`}
          draft={editing.draft}
          propertyName={property.name}
          onDraftChange={(draft) => setEditing({ ...editing, draft })}
        />
      ) : property.type === 'files' ? (
        <DatabaseFilesCellEditor
          draft={editing.draft}
          propertyName={property.name}
          parentDocName={record.path}
          fileStates={fileStates}
          onDraftChange={(draft) => setEditing({ ...editing, draft })}
        />
      ) : property.type === 'place' ? (
        <DatabasePlaceCellEditor
          draft={editing.draft}
          property={property}
          onDraftChange={(draft) => setEditing({ ...editing, draft })}
        />
      ) : property.type === 'relation' ? (
        <DatabaseRelationCellEditor
          property={property}
          draft={editing.draft}
          knownRecords={relationRecords}
          searchRecords={
            onRelationSearch ? (query) => onRelationSearch(property, query) : undefined
          }
          onDraftChange={(draft) => setEditing({ ...editing, draft })}
        />
      ) : property.type === 'status' ? (
        <Select
          value={editing.draft}
          onValueChange={(value) => setEditing({ ...editing, draft: value })}
        >
          <SelectTrigger size="sm" aria-label={`Edit ${property.name}`}>
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent data-database-cell-editor-surface="">
            {property.options
              .filter((option) => option.archived !== true || option.id === editing.draft)
              .map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {property.type === 'status' && 'groupId' in option
                    ? `${
                        property.groups.find((group) => group.id === option.groupId)?.name ??
                        'Status'
                      } · ${option.name}`
                    : option.name}
                  {option.archived === true ? ' (archived)' : ''}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      ) : property.type === 'person' ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">{`Edit ${property.name}`}</legend>
          {people
            .map((person) => ({
              id: person.id,
              name: person.name,
              available: person.active,
              suffix: `${person.kind === 'agent' ? ` (${personLabels.agent})` : ''}${
                person.active ? '' : ` (${personLabels.inactive})`
              }`,
            }))
            .map((option) => {
              const selected = multiSelectDraftValues(editing.draft);
              if (!option.available && !selected.includes(option.id)) return null;
              return (
                <div key={option.id} className="flex items-center gap-1 text-xs">
                  <Checkbox
                    checked={selected.includes(option.id)}
                    aria-label={`${option.name} for ${property.name}`}
                    onCheckedChange={(checked) => {
                      const next = new Set(selected);
                      if (checked === true) {
                        if (!property.multiple) next.clear();
                        next.add(option.id);
                      } else next.delete(option.id);
                      setEditing({ ...editing, draft: JSON.stringify([...next]) });
                    }}
                  />
                  {option.name}
                  {option.suffix}
                </div>
              );
            })}
        </fieldset>
      ) : (
        <Input
          autoFocus
          dir="auto"
          value={editing.draft}
          type={
            property.type === 'number'
              ? 'number'
              : property.type === 'email'
                ? 'email'
                : property.type === 'phone'
                  ? 'tel'
                  : property.type === 'url'
                    ? 'url'
                    : 'text'
          }
          step={property.type === 'number' ? 'any' : undefined}
          inputMode={
            property.type === 'number'
              ? 'decimal'
              : property.type === 'phone'
                ? 'tel'
                : property.type === 'email'
                  ? 'email'
                  : property.type === 'url'
                    ? 'url'
                    : undefined
          }
          aria-label={`Edit ${property.name}`}
          data-database-cell-editor-control="true"
          onChange={(event) => setEditing({ ...editing, draft: event.currentTarget.value })}
          onBlur={(event) => {
            if (property.type !== 'title') return;
            const editingContainer = event.currentTarget.closest('[data-title-cell-editing]');
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && editingContainer?.contains(nextTarget)) return;
            if (event.currentTarget.value === editing.initialDraft) {
              setEditing(null);
              return;
            }
            onSaveEdit(record, property, event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') onSaveEdit(record, property);
            if (event.key === 'Escape') onCancelEdit(record, property);
          }}
          className={cn(
            property.type === 'title'
              ? 'h-5 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 font-inherit font-medium text-foreground text-sm leading-5 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent'
              : 'h-8',
            notionSurface &&
              property.type !== 'title' &&
              'rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent',
          )}
        />
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        className={inlineScalarEditor ? 'sr-only' : undefined}
        aria-label="Save cell edit"
        onClick={() => onSaveEdit(record, property)}
      >
        <Check />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className={inlineScalarEditor ? 'sr-only' : undefined}
        aria-label="Cancel cell edit"
        onClick={() => onCancelEdit(record, property)}
      >
        <X />
      </Button>
    </div>
  );
}
