import { Trans } from '@lingui/react/macro';
import type { DatabaseDateValue } from '@nedian0brien/synapsenote-core';
import {
  parseSerializedDatabaseDateValue,
  serializeDatabaseDateValue,
} from '@nedian0brien/synapsenote-core';
import { useId, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createDatabaseDateEditorState,
  type DatabaseDateEditorState,
  databaseDateEditorValue,
  setDatabaseDateEditorTimeMode,
} from '@/lib/database-date-editor';

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

const DATABASE_TIME_ZONES = [
  ...new Set([
    'UTC',
    ...((
      Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }
    ).supportedValuesOf?.('timeZone') ?? ['Asia/Seoul', 'America/New_York', 'Europe/London']),
  ]),
];

function initialValue(draft: string): DatabaseDateValue {
  try {
    return parseSerializedDatabaseDateValue(draft);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function DatabaseDateCellEditor({
  draft,
  propertyName,
  onDraftChange,
}: {
  draft: string;
  propertyName: string;
  onDraftChange: (draft: string) => void;
}) {
  const [state, setState] = useState(() =>
    createDatabaseDateEditorState(initialValue(draft), localTimeZone()),
  );
  const [error, setError] = useState<string | null>(null);
  const controlId = useId();
  const id = (name: string) => `${controlId}-${name}`;
  const commit = (next: DatabaseDateEditorState) => {
    setState(next);
    try {
      onDraftChange(serializeDatabaseDateValue(databaseDateEditorValue(next)));
      setError(null);
    } catch (cause) {
      onDraftChange('__invalid_database_date__');
      setError(cause instanceof Error ? cause.message : 'Invalid date value');
    }
  };
  const update = (patch: Partial<DatabaseDateEditorState>) => commit({ ...state, ...patch });
  return (
    <fieldset className="grid min-w-72 gap-2 rounded-md border p-2 text-xs">
      <legend className="px-1 font-medium">
        <Trans>Edit {propertyName}</Trans>
      </legend>
      <label className="grid gap-1" htmlFor={id('start')}>
        <span>
          <Trans>Start</Trans>
        </span>
        <Input
          id={id('start')}
          autoFocus
          type={state.hasTime ? 'datetime-local' : 'date'}
          step={state.hasTime ? 1 : undefined}
          value={state.start}
          aria-label={`Start ${propertyName}`}
          onChange={(event) => update({ start: event.currentTarget.value })}
        />
      </label>
      <label className="flex items-center gap-2" htmlFor={id('time')}>
        <Checkbox
          id={id('time')}
          checked={state.hasTime}
          aria-label={`Include time for ${propertyName}`}
          onCheckedChange={(checked) =>
            commit(setDatabaseDateEditorTimeMode(state, checked === true))
          }
        />
        <Trans>Include time</Trans>
      </label>
      <label className="flex items-center gap-2" htmlFor={id('end-enabled')}>
        <Checkbox
          id={id('end-enabled')}
          checked={state.endEnabled}
          aria-label={`Include end for ${propertyName}`}
          onCheckedChange={(checked) =>
            update({
              endEnabled: checked === true,
              ...(checked !== true && state.reminderAnchor === 'end'
                ? { reminderAnchor: 'start' as const }
                : {}),
            })
          }
        />
        <Trans>Include end</Trans>
      </label>
      {state.endEnabled ? (
        <label className="grid gap-1" htmlFor={id('end')}>
          <span>
            <Trans>End</Trans>
          </span>
          <Input
            id={id('end')}
            type={state.hasTime ? 'datetime-local' : 'date'}
            step={state.hasTime ? 1 : undefined}
            value={state.end}
            aria-label={`End ${propertyName}`}
            onChange={(event) => update({ end: event.currentTarget.value })}
          />
        </label>
      ) : null}
      {state.hasTime || state.reminderEnabled || state.timeZoneExplicit ? (
        <label className="grid gap-1" htmlFor={id('timezone')}>
          <span>
            <Trans>Timezone</Trans>
          </span>
          <Input
            id={id('timezone')}
            list={id('timezone-list')}
            value={state.timeZone}
            aria-label={`Timezone for ${propertyName}`}
            onChange={(event) =>
              update({ timeZone: event.currentTarget.value, timeZoneExplicit: true })
            }
          />
          <datalist id={id('timezone-list')}>
            {DATABASE_TIME_ZONES.map((timeZone) => (
              <option key={timeZone} value={timeZone} />
            ))}
          </datalist>
        </label>
      ) : null}
      <label className="flex items-center gap-2" htmlFor={id('reminder-enabled')}>
        <Checkbox
          id={id('reminder-enabled')}
          checked={state.reminderEnabled}
          aria-label={`Add reminder for ${propertyName}`}
          onCheckedChange={(checked) => update({ reminderEnabled: checked === true })}
        />
        <Trans>Add reminder</Trans>
      </label>
      {state.reminderEnabled ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1" htmlFor={id('reminder-anchor')}>
            <span>
              <Trans>Anchor</Trans>
            </span>
            <Select
              value={state.reminderAnchor}
              onValueChange={(value) => update({ reminderAnchor: value as 'start' | 'end' })}
            >
              <SelectTrigger
                id={id('reminder-anchor')}
                size="sm"
                aria-label={`Reminder anchor for ${propertyName}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">
                  <Trans>Start</Trans>
                </SelectItem>
                {state.endEnabled ? (
                  <SelectItem value="end">
                    <Trans>End</Trans>
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1" htmlFor={id('reminder-minutes')}>
            <span>
              <Trans>Minutes before</Trans>
            </span>
            <Input
              id={id('reminder-minutes')}
              type="number"
              min={0}
              max={525_600}
              step={1}
              value={state.reminderMinutesBefore}
              aria-label={`Reminder minutes for ${propertyName}`}
              onChange={(event) => update({ reminderMinutesBefore: event.currentTarget.value })}
            />
          </label>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
