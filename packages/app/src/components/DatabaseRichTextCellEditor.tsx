import type {
  ProjectedDatabasePerson,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import {
  databasePersonMentionMarkup,
  databaseRecordReferenceMarkup,
  projectDatabaseRichText,
} from '@nedian0brien/synapsenote-core';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function DatabaseRichTextCellEditor({
  draft,
  propertyName,
  people = [],
  records = [],
  onDraftChange,
  onSave,
  onCancel,
}: {
  draft: string;
  propertyName: string;
  people?: readonly ProjectedDatabasePerson[];
  records?: readonly ProjectedDatabaseRelationRecord[];
  onDraftChange: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const projection = projectDatabaseRichText(draft);

  const insertAtSelection = (markup: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const next = `${draft.slice(0, start)}${markup}${draft.slice(end)}`;
    onDraftChange(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + markup.length, start + markup.length);
    });
  };

  return (
    <div className="grid min-w-80 gap-2">
      <Textarea
        ref={inputRef}
        autoFocus
        rows={4}
        value={draft}
        aria-label={`Edit ${propertyName}`}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave();
          }
        }}
      />
      <div className="flex flex-wrap gap-1">
        {people.filter((person) => person.active).length > 0 ? (
          <select
            aria-label={`Insert person mention in ${propertyName}`}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value=""
            onChange={(event) => {
              const person = people.find((candidate) => candidate.id === event.currentTarget.value);
              if (person) insertAtSelection(databasePersonMentionMarkup(person.id, person.name));
            }}
          >
            <option value="">Mention person…</option>
            {people
              .filter((person) => person.active)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  @{person.name}
                </option>
              ))}
          </select>
        ) : null}
        {records.length > 0 ? (
          <select
            aria-label={`Insert record reference in ${propertyName}`}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value=""
            onChange={(event) => {
              const record = records.find(
                (candidate) => candidate.id === event.currentTarget.value,
              );
              if (record) insertAtSelection(databaseRecordReferenceMarkup(record.id, record.title));
            }}
          >
            <option value="">Reference record…</option>
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {record.title}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <p className="max-h-20 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
        {projection.plainText || 'Plain-text preview'}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          Markdown · Enter adds a line · Ctrl/⌘+Enter saves
        </span>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
