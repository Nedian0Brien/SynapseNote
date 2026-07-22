import { Trans } from '@lingui/react/macro';
import type {
  DatabaseDefinition,
  DatabaseSource,
  DatabaseTemplate,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseTemplateRun } from '@nedian0brien/synapsenote-server';
import { Archive, ArrowDown, ArrowUp, Copy, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { DatabaseTemplateLifecycleChange } from '@/lib/database-cell-mutation';

function stableKey(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(normalized) ? normalized.slice(0, 128) : `template-${normalized || 'new'}`;
}

function templateId(): string {
  return `tpl_${crypto.randomUUID().replaceAll('-', '')}`;
}

interface Draft {
  id: string;
  key: string;
  name: string;
  description: string;
  body: string;
  propertyValues: string;
  sourceDefault: boolean;
  viewIds: string[];
  entryPoints: string;
  order: number;
  repeatEnabled: boolean;
  repeatKind: 'daily' | 'weekly' | 'monthly' | 'interval';
  repeatTime: string;
  repeatWeekdays: string;
  repeatDay: string;
  repeatEvery: string;
  repeatUnit: 'hours' | 'days' | 'weeks';
  repeatAnchor: string;
  repeatTimeZone: string;
  repeatOwnerId: string;
  repeatPaused: boolean;
  retryMaxAttempts: string;
  retryBackoffSeconds: string;
  retryMultiplier: string;
  mode: 'create' | 'edit';
}

function draftFor(template: DatabaseTemplate): Draft {
  return {
    id: template.id,
    key: template.key,
    name: template.name,
    description: template.description ?? '',
    body: template.body,
    propertyValues: JSON.stringify(template.propertyValues, null, 2),
    sourceDefault: template.defaultFor.source,
    viewIds: [...template.defaultFor.viewIds],
    entryPoints: template.defaultFor.entryPoints.join(', '),
    order: template.order,
    repeatEnabled: template.repeat !== undefined,
    repeatKind: template.repeat?.schedule.kind ?? 'daily',
    repeatTime:
      template.repeat?.schedule.kind === 'daily' ||
      template.repeat?.schedule.kind === 'weekly' ||
      template.repeat?.schedule.kind === 'monthly'
        ? template.repeat.schedule.time
        : '09:00',
    repeatWeekdays:
      template.repeat?.schedule.kind === 'weekly'
        ? template.repeat.schedule.weekdays.join(',')
        : '1',
    repeatDay:
      template.repeat?.schedule.kind === 'monthly' ? String(template.repeat.schedule.day) : '1',
    repeatEvery:
      template.repeat?.schedule.kind === 'interval' ? String(template.repeat.schedule.every) : '1',
    repeatUnit:
      template.repeat?.schedule.kind === 'interval' ? template.repeat.schedule.unit : 'days',
    repeatAnchor:
      template.repeat?.schedule.kind === 'interval'
        ? template.repeat.schedule.anchor
        : new Date().toISOString(),
    repeatTimeZone: template.repeat?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    repeatOwnerId: template.repeat?.ownerId ?? '',
    repeatPaused: template.repeat?.paused ?? true,
    retryMaxAttempts: String(template.repeat?.retry.maxAttempts ?? 3),
    retryBackoffSeconds: String(template.repeat?.retry.initialBackoffSeconds ?? 60),
    retryMultiplier: String(template.repeat?.retry.multiplier ?? 2),
    mode: 'edit',
  };
}

function templateFromDraft(draft: Draft, source: DatabaseSource): DatabaseTemplate {
  const parsed: unknown = JSON.parse(draft.propertyValues || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Property defaults must be a JSON object keyed by stable property ID');
  }
  const name = draft.name.trim();
  if (!name) throw new Error('Template name is required');
  let repeat: DatabaseTemplate['repeat'];
  if (draft.repeatEnabled) {
    if (!draft.repeatOwnerId) throw new Error('Repeating templates require an owner');
    const timeSchedule = { time: draft.repeatTime };
    const schedule =
      draft.repeatKind === 'daily'
        ? { kind: 'daily' as const, ...timeSchedule }
        : draft.repeatKind === 'weekly'
          ? {
              kind: 'weekly' as const,
              weekdays: [
                ...new Set(
                  draft.repeatWeekdays
                    .split(',')
                    .map((value) => Number(value.trim()))
                    .filter(Number.isInteger),
                ),
              ],
              ...timeSchedule,
            }
          : draft.repeatKind === 'monthly'
            ? { kind: 'monthly' as const, day: Number(draft.repeatDay), ...timeSchedule }
            : {
                kind: 'interval' as const,
                every: Number(draft.repeatEvery),
                unit: draft.repeatUnit,
                anchor: draft.repeatAnchor,
              };
    repeat = {
      schedule,
      timeZone: draft.repeatTimeZone.trim(),
      ownerId: draft.repeatOwnerId,
      paused: draft.repeatPaused,
      retry: {
        maxAttempts: Number(draft.retryMaxAttempts),
        initialBackoffSeconds: Number(draft.retryBackoffSeconds),
        multiplier: Number(draft.retryMultiplier),
      },
    };
  }
  return {
    id: draft.id,
    key: draft.key.trim() || stableKey(name),
    name,
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    sourceId: source.id,
    propertyValues: parsed as Record<string, unknown>,
    body: draft.body,
    order: draft.order,
    archivedAt: null,
    defaultFor: {
      source: draft.sourceDefault,
      viewIds: draft.viewIds,
      entryPoints: [
        ...new Set(
          draft.entryPoints
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
    },
    ...(repeat ? { repeat } : {}),
  };
}

export function DatabaseTemplatesDialog({
  open,
  onOpenChange,
  database,
  source,
  views,
  busy,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: DatabaseDefinition;
  source: DatabaseSource;
  views: readonly DatabaseView[];
  busy: boolean;
  onChange: (change: DatabaseTemplateLifecycleChange) => void;
}) {
  const templates = [...database.templates]
    .filter((template) => template.sourceId === source.id)
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<DatabaseTemplateRun[]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setRunsError(null);
    void fetch('/api/databases/template-runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ databaseId: database.id, limit: 100 }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok) throw new Error(`Template history failed with HTTP ${response.status}`);
        if (
          !result ||
          typeof result !== 'object' ||
          !Array.isArray((result as { runs?: unknown }).runs)
        ) {
          throw new Error('Template history returned an invalid response');
        }
        setRuns((result as { runs: DatabaseTemplateRun[] }).runs);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setRunsError(cause instanceof Error ? cause.message : 'Unable to load template history');
      });
    return () => controller.abort();
  }, [database.id, open]);

  const save = () => {
    if (!draft) return;
    try {
      const template = templateFromDraft(draft, source);
      onChange({ kind: draft.mode === 'create' ? 'create' : 'update', template });
      setDraft(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid template');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Database templates</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Reuse typed property defaults and Markdown starter content when creating records.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                setDraft({
                  id: templateId(),
                  key: '',
                  name: '',
                  description: '',
                  body: '',
                  propertyValues: '{}',
                  sourceDefault: false,
                  viewIds: [],
                  entryPoints: '',
                  order: templates.length,
                  repeatEnabled: false,
                  repeatKind: 'daily',
                  repeatTime: '09:00',
                  repeatWeekdays: '1',
                  repeatDay: '1',
                  repeatEvery: '1',
                  repeatUnit: 'days',
                  repeatAnchor: new Date().toISOString(),
                  repeatTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  repeatOwnerId:
                    database.people.find((person) => person.active !== false)?.id ?? '',
                  repeatPaused: true,
                  retryMaxAttempts: '3',
                  retryBackoffSeconds: '60',
                  retryMultiplier: '2',
                  mode: 'create',
                })
              }
            >
              <Plus /> <Trans>New template</Trans>
            </Button>
          </div>
          {draft ? (
            <section className="space-y-3 rounded-md border p-4" aria-label="Template editor">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label>
                  <Trans>Name</Trans>
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        name: event.currentTarget.value,
                        ...(draft.mode === 'create'
                          ? { key: stableKey(event.currentTarget.value) }
                          : {}),
                      })
                    }
                  />
                </Label>
                <Label>
                  <Trans>Stable key</Trans>
                  <Input
                    value={draft.key}
                    onChange={(event) => setDraft({ ...draft, key: event.currentTarget.value })}
                  />
                </Label>
              </div>
              <Label>
                <Trans>Description</Trans>
                <Input
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.currentTarget.value })
                  }
                />
              </Label>
              <Label>
                <Trans>Property defaults (JSON by property ID)</Trans>
                <Textarea
                  className="min-h-28 font-mono"
                  value={draft.propertyValues}
                  onChange={(event) =>
                    setDraft({ ...draft, propertyValues: event.currentTarget.value })
                  }
                />
              </Label>
              <Label>
                <Trans>Markdown starter body</Trans>
                <Textarea
                  className="min-h-36 font-mono"
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.currentTarget.value })}
                />
              </Label>
              <Label className="flex items-center gap-2">
                <Checkbox
                  checked={draft.sourceDefault}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, sourceDefault: checked === true })
                  }
                />
                <Trans>Default for this data source</Trans>
              </Label>
              {views.length > 0 ? (
                <fieldset className="space-y-2 rounded border p-3">
                  <legend className="px-1 text-sm">
                    <Trans>Default in views</Trans>
                  </legend>
                  {views.map((view) => (
                    <Label key={view.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={draft.viewIds.includes(view.id)}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            viewIds:
                              checked === true
                                ? [...draft.viewIds, view.id]
                                : draft.viewIds.filter((id) => id !== view.id),
                          })
                        }
                      />
                      {view.name}
                    </Label>
                  ))}
                </fieldset>
              ) : null}
              <Label>
                <Trans>Creation entry points</Trans>
                <Input
                  placeholder="quick_capture, command_palette"
                  value={draft.entryPoints}
                  onChange={(event) =>
                    setDraft({ ...draft, entryPoints: event.currentTarget.value })
                  }
                />
              </Label>
              <Label className="flex items-center gap-2">
                <Checkbox
                  checked={draft.repeatEnabled}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, repeatEnabled: checked === true })
                  }
                />
                <Trans>Repeat this template</Trans>
              </Label>
              {draft.repeatEnabled ? (
                <fieldset className="grid gap-3 rounded border p-3 sm:grid-cols-2">
                  <legend className="px-1 text-sm">
                    <Trans>Repeat schedule</Trans>
                  </legend>
                  <Label>
                    <Trans>Frequency</Trans>
                    <Select
                      value={draft.repeatKind}
                      onValueChange={(value) =>
                        setDraft({
                          ...draft,
                          repeatKind: value as Draft['repeatKind'],
                        })
                      }
                    >
                      <SelectTrigger aria-label="Frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="interval">Interval</SelectItem>
                      </SelectContent>
                    </Select>
                  </Label>
                  {draft.repeatKind === 'interval' ? (
                    <>
                      <Label>
                        <Trans>Every</Trans>
                        <Input
                          type="number"
                          min="1"
                          max="365"
                          value={draft.repeatEvery}
                          onChange={(event) =>
                            setDraft({ ...draft, repeatEvery: event.currentTarget.value })
                          }
                        />
                      </Label>
                      <Label>
                        <Trans>Interval unit</Trans>
                        <Select
                          value={draft.repeatUnit}
                          onValueChange={(value) =>
                            setDraft({
                              ...draft,
                              repeatUnit: value as Draft['repeatUnit'],
                            })
                          }
                        >
                          <SelectTrigger aria-label="Interval unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                            <SelectItem value="weeks">Weeks</SelectItem>
                          </SelectContent>
                        </Select>
                      </Label>
                      <Label className="sm:col-span-2">
                        <Trans>Anchor time (ISO)</Trans>
                        <Input
                          value={draft.repeatAnchor}
                          onChange={(event) =>
                            setDraft({ ...draft, repeatAnchor: event.currentTarget.value })
                          }
                        />
                      </Label>
                    </>
                  ) : (
                    <Label>
                      <Trans>Local time</Trans>
                      <Input
                        type="time"
                        value={draft.repeatTime}
                        onChange={(event) =>
                          setDraft({ ...draft, repeatTime: event.currentTarget.value })
                        }
                      />
                    </Label>
                  )}
                  {draft.repeatKind === 'weekly' ? (
                    <Label className="sm:col-span-2">
                      <Trans>Weekdays (1=Monday, comma-separated)</Trans>
                      <Input
                        value={draft.repeatWeekdays}
                        onChange={(event) =>
                          setDraft({ ...draft, repeatWeekdays: event.currentTarget.value })
                        }
                      />
                    </Label>
                  ) : null}
                  {draft.repeatKind === 'monthly' ? (
                    <Label>
                      <Trans>Day of month</Trans>
                      <Input
                        type="number"
                        min="1"
                        max="28"
                        value={draft.repeatDay}
                        onChange={(event) =>
                          setDraft({ ...draft, repeatDay: event.currentTarget.value })
                        }
                      />
                    </Label>
                  ) : null}
                  <Label>
                    <Trans>Timezone</Trans>
                    <Input
                      value={draft.repeatTimeZone}
                      onChange={(event) =>
                        setDraft({ ...draft, repeatTimeZone: event.currentTarget.value })
                      }
                    />
                  </Label>
                  <Label>
                    <Trans>Owner</Trans>
                    <Select
                      value={draft.repeatOwnerId}
                      onValueChange={(value) => setDraft({ ...draft, repeatOwnerId: value })}
                    >
                      <SelectTrigger aria-label="Owner">
                        <SelectValue placeholder="Choose owner" />
                      </SelectTrigger>
                      <SelectContent>
                        {database.people.map((person) => (
                          <SelectItem
                            key={person.id}
                            value={person.id}
                            disabled={person.active === false}
                          >
                            {person.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Label>
                  <Label>
                    <Trans>Retry attempts</Trans>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={draft.retryMaxAttempts}
                      onChange={(event) =>
                        setDraft({ ...draft, retryMaxAttempts: event.currentTarget.value })
                      }
                    />
                  </Label>
                  <Label>
                    <Trans>Initial retry delay (seconds)</Trans>
                    <Input
                      type="number"
                      min="1"
                      max="86400"
                      value={draft.retryBackoffSeconds}
                      onChange={(event) =>
                        setDraft({ ...draft, retryBackoffSeconds: event.currentTarget.value })
                      }
                    />
                  </Label>
                  <Label>
                    <Trans>Retry multiplier</Trans>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="0.1"
                      value={draft.retryMultiplier}
                      onChange={(event) =>
                        setDraft({ ...draft, retryMultiplier: event.currentTarget.value })
                      }
                    />
                  </Label>
                  <Label className="flex items-center gap-2 self-end">
                    <Checkbox
                      checked={draft.repeatPaused}
                      onCheckedChange={(checked) =>
                        setDraft({ ...draft, repeatPaused: checked === true })
                      }
                    />
                    <Trans>Paused</Trans>
                  </Label>
                </fieldset>
              ) : null}
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft(null);
                    setError(null);
                  }}
                >
                  <Trans>Cancel</Trans>
                </Button>
                <Button disabled={busy} onClick={save}>
                  <Trans>Save template</Trans>
                </Button>
              </div>
            </section>
          ) : null}
          <div className="space-y-2">
            {templates.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                <Trans>No database templates yet.</Trans>
              </p>
            ) : (
              templates.map((template, index) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {template.name}
                      {template.defaultFor.source ? ' · Default' : ''}
                      {template.archivedAt ? ' · Archived' : ''}
                      {template.repeat
                        ? template.repeat.paused
                          ? ' · Repeating paused'
                          : ' · Repeating'
                        : ''}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {template.key} · {Object.keys(template.propertyValues).length} properties
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit ${template.name}`}
                      disabled={busy || template.archivedAt !== null}
                      onClick={() => setDraft(draftFor(template))}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Duplicate ${template.name}`}
                      disabled={busy}
                      onClick={() =>
                        onChange({
                          kind: 'duplicate',
                          template: {
                            ...structuredClone(template),
                            id: templateId(),
                            key: `${template.key}-copy`,
                            name: `${template.name} copy`,
                            order: templates.length,
                            archivedAt: null,
                            defaultFor: { source: false, viewIds: [], entryPoints: [] },
                            ...(template.repeat
                              ? { repeat: { ...structuredClone(template.repeat), paused: true } }
                              : {}),
                          },
                        })
                      }
                    >
                      <Copy />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${template.name} up`}
                      disabled={busy || index === 0 || template.archivedAt !== null}
                      onClick={() =>
                        onChange({ kind: 'reorder', templateId: template.id, direction: -1 })
                      }
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${template.name} down`}
                      disabled={
                        busy || index === templates.length - 1 || template.archivedAt !== null
                      }
                      onClick={() =>
                        onChange({ kind: 'reorder', templateId: template.id, direction: 1 })
                      }
                    >
                      <ArrowDown />
                    </Button>
                    {template.archivedAt ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Restore ${template.name}`}
                        disabled={busy}
                        onClick={() => onChange({ kind: 'restore', templateId: template.id })}
                      >
                        <RotateCcw />
                      </Button>
                    ) : (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Archive ${template.name}`}
                        disabled={busy}
                        onClick={() =>
                          onChange({
                            kind: 'archive',
                            templateId: template.id,
                            archivedAt: new Date().toISOString(),
                          })
                        }
                      >
                        <Archive />
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${template.name}`}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Permanently delete template "${template.name}"?`))
                          onChange({ kind: 'delete', templateId: template.id });
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <section className="space-y-2 border-t pt-4" aria-label="Repeating template history">
            <h3 className="font-medium text-sm">
              <Trans>Repeating template history</Trans>
            </h3>
            {runsError ? (
              <p className="text-destructive text-sm" role="alert">
                {runsError}
              </p>
            ) : runs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                <Trans>No repeating template runs yet.</Trans>
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {runs
                  .filter((run) => templates.some((template) => template.id === run.templateId))
                  .map((run) => (
                    <li
                      key={run.id}
                      className="flex justify-between gap-3 rounded border px-3 py-2"
                    >
                      <span className="truncate">
                        {templates.find((template) => template.id === run.templateId)?.name ??
                          run.templateId}
                        {' · '}
                        {run.state}
                        {' · attempt '}
                        {run.attempt}
                      </span>
                      <time className="shrink-0 text-muted-foreground" dateTime={run.scheduledFor}>
                        {new Date(run.scheduledFor).toLocaleString()}
                      </time>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
