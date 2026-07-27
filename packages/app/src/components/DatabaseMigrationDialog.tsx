import { Trans } from '@lingui/react/macro';
import type { DatabaseMarkdownV2MigrationTitleChoice } from '@nedian0brien/synapsenote-core';
import type {
  DatabaseManifestMigrationPreview,
  DatabaseTask,
} from '@nedian0brien/synapsenote-server';
import { Loader2, Pause, Play, RotateCcw, ShieldAlert } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
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

interface RequestOptions {
  signal?: AbortSignal;
}

export interface DatabaseMigrationChoiceState {
  ownerChoices: Readonly<
    Record<string, Readonly<Record<string, { path: string; blockId: string }>>>
  >;
  titleChoices: Readonly<
    Record<string, Readonly<Record<string, DatabaseMarkdownV2MigrationTitleChoice>>>
  >;
}

/**
 * App-side client for the versioned task API. The server owns the exact
 * preview/plan hash; this module deliberately forwards that opaque payload
 * instead of reconstructing migration paths in the browser.
 */
export async function previewDatabaseMigration(
  input: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<DatabaseManifestMigrationPreview> {
  const response = await fetch('/api/databases/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action: 'preview_migration', ...input }),
    signal: options.signal,
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && 'detail' in value && typeof value.detail === 'string'
        ? value.detail
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!value || typeof value !== 'object' || !('preview' in value)) {
    throw new Error('Invalid migration preview response');
  }
  return (value as { preview: DatabaseManifestMigrationPreview }).preview;
}

export async function startDatabaseMigration(
  input: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<DatabaseTask> {
  const response = await fetch('/api/databases/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action: 'start', task: { operation: 'migration', ...input } }),
    signal: options.signal,
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!value || typeof value !== 'object' || !('task' in value)) {
    throw new Error('Invalid migration task response');
  }
  return (value as { task: DatabaseTask }).task;
}

/** Reload a durable task after an app restart; no optimistic state is reused. */
export async function inspectDatabaseMigration(
  taskId: string,
  options: RequestOptions = {},
): Promise<DatabaseTask> {
  const response = await fetch('/api/databases/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action: 'get', taskId }),
    signal: options.signal,
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!value || typeof value !== 'object' || !('task' in value)) {
    throw new Error('Invalid migration task inspection response');
  }
  return (value as { task: DatabaseTask }).task;
}

export async function cancelDatabaseMigration(
  taskId: string,
  expectedRevision: string,
  options: RequestOptions = {},
): Promise<DatabaseTask> {
  const response = await fetch('/api/databases/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action: 'cancel', taskId, expectedRevision }),
    signal: options.signal,
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!value || typeof value !== 'object' || !('task' in value)) {
    throw new Error('Invalid migration cancellation response');
  }
  return (value as { task: DatabaseTask }).task;
}

export async function resumeDatabaseMigration(
  taskId: string,
  expectedRevision: string,
  options: RequestOptions = {},
): Promise<DatabaseTask> {
  const response = await fetch('/api/databases/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action: 'resume', taskId, expectedRevision }),
    signal: options.signal,
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!value || typeof value !== 'object' || !('task' in value)) {
    throw new Error('Invalid migration resume response');
  }
  return (value as { task: DatabaseTask }).task;
}

export async function retryDatabaseMigration(
  taskId: string,
  expectedRevision: string,
  options: RequestOptions = {},
): Promise<DatabaseTask> {
  const response = await fetch('/api/databases/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action: 'retry', taskId, expectedRevision }),
    signal: options.signal,
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!value || typeof value !== 'object' || !('task' in value)) {
    throw new Error('Invalid migration retry response');
  }
  return (value as { task: DatabaseTask }).task;
}

export async function rollbackDatabaseMigration(
  taskId: string,
  expectedRevision: string,
  options: RequestOptions = {},
): Promise<{ taskId: string; status: 'applied' | 'already_applied'; restored: number }> {
  const response = await fetch('/api/databases/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action: 'rollback', taskId, expectedRevision }),
    signal: options.signal,
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!value || typeof value !== 'object' || !('rollback' in value)) {
    throw new Error('Invalid migration rollback response');
  }
  return (
    value as {
      rollback: { taskId: string; status: 'applied' | 'already_applied'; restored: number };
    }
  ).rollback;
}

/** Stable browser-only key used to reconnect a durable migration after reload. */
export function databaseMigrationTaskStorageKey(
  databaseIdOrIds: string | readonly string[],
): string {
  const ids = typeof databaseIdOrIds === 'string' ? [databaseIdOrIds] : [...databaseIdOrIds];
  const scope = [...new Set(ids)].sort().join(',');
  return `synapsenote:database:migration-task:${scope}`;
}

function readPersistedMigrationTaskId(databaseId: string): string | null {
  try {
    return globalThis.localStorage?.getItem(databaseMigrationTaskStorageKey(databaseId)) ?? null;
  } catch {
    return null;
  }
}

function persistMigrationTaskId(databaseId: string, taskId: string | null): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    if (taskId) storage.setItem(databaseMigrationTaskStorageKey(databaseId), taskId);
    else storage.removeItem(databaseMigrationTaskStorageKey(databaseId));
  } catch {
    // Private browsing and embedded desktop webviews may deny local storage.
  }
}

export function migrationTaskProgress(task: DatabaseTask): number {
  const total = task.progress.total;
  if (total === null || total <= 0) return task.state === 'succeeded' ? 1 : 0;
  return Math.min(1, Math.max(0, task.progress.completed / total));
}

export function migrationTaskNeedsRecovery(task: DatabaseTask): boolean {
  const recovery = task.problem?.recovery;
  const recoveryAction =
    recovery && typeof recovery === 'object' && 'action' in recovery
      ? (recovery as { action?: unknown }).action
      : undefined;
  return (
    task.state === 'failed' &&
    (task.problem?.code === 'task_execution_failed' ||
      task.problem?.code === 'task_recovery_required' ||
      recoveryAction === 'restart_task')
  );
}

export function migrationTaskCanRollback(task: DatabaseTask): boolean {
  return task.operation === 'migration' && task.state === 'succeeded' && task.finishedAt !== null;
}

export function migrationTaskCanRetry(task: DatabaseTask): boolean {
  return (
    task.operation === 'migration' && task.state === 'failed' && task.problem?.retryable === true
  );
}

/** Bind task start to the timestamp and hash returned by the exact preview. */
export function databaseMigrationStartInput(
  databaseIdOrIds: string | readonly string[],
  preview: DatabaseManifestMigrationPreview,
  choices: DatabaseMigrationChoiceState = { ownerChoices: {}, titleChoices: {} },
): Record<string, unknown> | null {
  const databaseIds =
    typeof databaseIdOrIds === 'string' ? [databaseIdOrIds] : [...databaseIdOrIds];
  const approvedItems = databaseIds.map((databaseId) =>
    preview.items.find(
      (item) =>
        item.databaseId === databaseId &&
        item.action === 'ready' &&
        typeof item.planHash === 'string',
    ),
  );
  if (
    !preview.committable ||
    approvedItems.length === 0 ||
    approvedItems.some((item) => !item?.planHash || !item.migrationCommittedAt)
  ) {
    return null;
  }
  const input: Record<string, unknown> = {
    databaseIds,
    expectedManifestRevision: preview.expectedManifestRevision,
    targetVersion: preview.targetVersion,
    planHashes: Object.fromEntries(approvedItems.map((item) => [item?.databaseId, item?.planHash])),
    migrationCommittedAt: Object.fromEntries(
      approvedItems.map((item) => [item?.databaseId, item?.migrationCommittedAt]),
    ),
  };
  if (Object.keys(choices.ownerChoices).length > 0) input.ownerChoices = choices.ownerChoices;
  if (Object.keys(choices.titleChoices).length > 0) input.titleChoices = choices.titleChoices;
  return input;
}

/**
 * Recovery surface used by the v1 edit interceptor. It owns only task API
 * state; canonical Markdown remains exclusively on the server task boundary.
 * Polling is deliberately one-shot and revision-bound so a stale optimistic
 * task cannot be presented as completed after an app restart.
 */
export function DatabaseMigrationRecoveryPanel({
  databaseId,
  databaseIds,
  databaseLabels,
  expectedManifestRevision,
}: {
  databaseId?: string;
  databaseIds?: readonly string[];
  databaseLabels?: Readonly<Record<string, string>>;
  expectedManifestRevision: string;
}): React.JSX.Element {
  const availableDatabaseIds = [
    ...new Set(databaseIds?.length ? databaseIds : databaseId ? [databaseId] : []),
  ];
  const availableDatabaseKey = availableDatabaseIds.join(',');
  const [selectedDatabaseIds, setSelectedDatabaseIds] = useState<string[]>(() =>
    availableDatabaseIds.slice(0, 1),
  );
  const [preview, setPreview] = useState<DatabaseManifestMigrationPreview | null>(null);
  const [task, setTask] = useState<DatabaseTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownerChoices, setOwnerChoices] = useState<DatabaseMigrationChoiceState['ownerChoices']>(
    {},
  );
  const [titleChoices, setTitleChoices] = useState<DatabaseMigrationChoiceState['titleChoices']>(
    {},
  );

  useEffect(() => {
    setSelectedDatabaseIds((current) => {
      const allowed = new Set(availableDatabaseKey.split(',').filter(Boolean));
      const retained = current.filter((id) => allowed.has(id));
      return retained.length > 0
        ? retained
        : availableDatabaseKey.split(',').filter(Boolean).slice(0, 1);
    });
  }, [availableDatabaseKey]);

  const selectedDatabaseKey = selectedDatabaseIds.slice().sort().join(',');

  useEffect(() => {
    const persistedTaskId = readPersistedMigrationTaskId(selectedDatabaseKey);
    setTask(null);
    if (!persistedTaskId) return;
    const controller = new AbortController();
    void inspectDatabaseMigration(persistedTaskId, { signal: controller.signal }).then(
      (next) => setTask(next),
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        // A task may have been removed after retention cleanup. Do not leave a
        // permanently stale task ID blocking the migration CTA.
        persistMigrationTaskId(selectedDatabaseKey, null);
        setError(cause instanceof Error ? cause.message : 'Unable to reconnect migration task');
      },
    );
    return () => controller.abort();
  }, [selectedDatabaseKey]);

  useEffect(() => {
    persistMigrationTaskId(selectedDatabaseKey, task?.id ?? null);
  }, [selectedDatabaseKey, task?.id]);

  const loadPreview = useEffectEvent(
    async (
      signal?: AbortSignal,
      choices: DatabaseMigrationChoiceState = { ownerChoices: {}, titleChoices: {} },
    ) => {
      setError(null);
      try {
        const next = await previewDatabaseMigration(
          {
            databaseIds: selectedDatabaseIds,
            expectedManifestRevision,
            targetVersion: 2,
            ...(Object.keys(choices.ownerChoices).length > 0
              ? { ownerChoices: choices.ownerChoices }
              : {}),
            ...(Object.keys(choices.titleChoices).length > 0
              ? { titleChoices: choices.titleChoices }
              : {}),
          },
          { signal },
        );
        setPreview(next);
      } catch (cause) {
        if (signal?.aborted) return;
        setPreview(null);
        setError(cause instanceof Error ? cause.message : 'Unable to preview migration');
      }
    },
  );

  useEffect(() => {
    if (!selectedDatabaseKey || !expectedManifestRevision) return;
    const controller = new AbortController();
    void loadPreview(controller.signal, { ownerChoices: {}, titleChoices: {} });
    return () => controller.abort();
  }, [expectedManifestRevision, selectedDatabaseKey]);

  useEffect(() => {
    if (!task || (task.state !== 'queued' && task.state !== 'running')) return;
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => {
      void inspectDatabaseMigration(task.id, { signal: controller.signal }).then(
        (next) => setTask(next),
        (cause: unknown) => {
          if (!controller.signal.aborted) {
            setError(cause instanceof Error ? cause.message : 'Unable to inspect migration task');
          }
        },
      );
    }, 1_000);
    return () => {
      controller.abort();
      globalThis.clearTimeout(timer);
    };
  }, [task]);

  const approve = async () => {
    if (!preview?.committable || task) return;
    const input = databaseMigrationStartInput(selectedDatabaseIds, preview, {
      ownerChoices,
      titleChoices,
    });
    if (!input) {
      setError('Migration preview did not return an approved plan hash. Refresh the preview.');
      return;
    }
    setError(null);
    try {
      const next = await startDatabaseMigration(input);
      setTask(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start migration');
    }
  };

  const updateTitleChoice = (
    databaseId: string,
    recordId: string,
    choice: DatabaseMarkdownV2MigrationTitleChoice,
  ) => {
    const next = {
      ...titleChoices,
      [databaseId]: { ...(titleChoices[databaseId] ?? {}), [recordId]: choice },
    };
    setTitleChoices(next);
    void loadPreview(undefined, { ownerChoices, titleChoices: next });
  };

  const updateOwnerChoice = (
    databaseId: string,
    sourceId: string,
    path: string,
    blockId: string,
  ) => {
    const next = {
      ...ownerChoices,
      [databaseId]: { ...(ownerChoices[databaseId] ?? {}), [sourceId]: { path, blockId } },
    };
    setOwnerChoices(next);
    void loadPreview(undefined, { ownerChoices: next, titleChoices });
  };

  const cancel = async () => {
    if (!task?.cancellable) return;
    setError(null);
    try {
      setTask(await cancelDatabaseMigration(task.id, task.revision));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to cancel migration');
    }
  };

  const resume = async () => {
    if (!task || !migrationTaskNeedsRecovery(task)) return;
    setError(null);
    try {
      setTask(await resumeDatabaseMigration(task.id, task.revision));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resume migration');
    }
  };

  const rollback = async () => {
    if (!task || !migrationTaskCanRollback(task)) return;
    setError(null);
    try {
      await rollbackDatabaseMigration(task.id, task.revision);
      setTask(null);
      persistMigrationTaskId(selectedDatabaseKey, null);
      await loadPreview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to roll back migration');
    }
  };

  const retry = async () => {
    if (!task || !migrationTaskCanRetry(task)) return;
    setError(null);
    try {
      setTask(await retryDatabaseMigration(task.id, task.revision));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to retry migration');
    }
  };

  return (
    <div className="space-y-2" data-testid="database-migration-recovery-panel">
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
      {availableDatabaseIds.length > 1 ? (
        <fieldset className="space-y-2 rounded-lg border p-3 text-xs">
          <legend className="px-1 font-medium">Databases to migrate</legend>
          <p id="database-migration-selection-help" className="text-muted-foreground">
            Select one or more v1 databases. The preview and approval hash will cover exactly this
            selection.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {availableDatabaseIds.map((candidateId) => {
              const checked = selectedDatabaseIds.includes(candidateId);
              return (
                <label
                  key={candidateId}
                  htmlFor={`database-migration-select-${candidateId}`}
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    id={`database-migration-select-${candidateId}`}
                    checked={checked}
                    disabled={checked && selectedDatabaseIds.length === 1}
                    aria-label={`Select database ${databaseLabels?.[candidateId] ?? candidateId}`}
                    aria-describedby="database-migration-selection-help"
                    onCheckedChange={(nextChecked) => {
                      setSelectedDatabaseIds((current) => {
                        if (nextChecked === true) {
                          return current.includes(candidateId)
                            ? current
                            : [...current, candidateId];
                        }
                        if (current.length === 1) return current;
                        return current.filter((id) => id !== candidateId);
                      });
                    }}
                  />
                  <span className="truncate" title={candidateId}>
                    {databaseLabels?.[candidateId] ?? candidateId}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <DatabaseMigrationDialog
        preview={preview}
        task={task}
        onApprove={() => void approve()}
        onCancel={() => void cancel()}
        onResume={() => void resume()}
        onRollback={() => void rollback()}
        onRetry={() => void retry()}
        ownerChoicesByDatabase={ownerChoices}
        titleChoicesByDatabase={titleChoices}
        onTitleChoiceForDatabase={updateTitleChoice}
        onOwnerChoiceForDatabase={updateOwnerChoice}
      />
    </div>
  );
}

export function DatabaseMigrationDialog({
  preview,
  task,
  onApprove,
  onCancel,
  onResume,
  onRollback,
  onRetry,
  ownerChoices = {},
  titleChoices = {},
  ownerChoicesByDatabase = {},
  titleChoicesByDatabase = {},
  onTitleChoice,
  onOwnerChoice,
  onTitleChoiceForDatabase,
  onOwnerChoiceForDatabase,
}: {
  preview: DatabaseManifestMigrationPreview | null;
  task: DatabaseTask | null;
  onApprove: () => void;
  onCancel: () => void;
  onResume: () => void;
  onRollback: () => void;
  onRetry: () => void;
  ownerChoices?: Readonly<Record<string, { path: string; blockId: string }>>;
  titleChoices?: Readonly<Record<string, DatabaseMarkdownV2MigrationTitleChoice>>;
  ownerChoicesByDatabase?: DatabaseMigrationChoiceState['ownerChoices'];
  titleChoicesByDatabase?: DatabaseMigrationChoiceState['titleChoices'];
  onTitleChoice?: (recordId: string, choice: DatabaseMarkdownV2MigrationTitleChoice) => void;
  onOwnerChoice?: (sourceId: string, path: string, blockId: string) => void;
  onTitleChoiceForDatabase?: (
    databaseId: string,
    recordId: string,
    choice: DatabaseMarkdownV2MigrationTitleChoice,
  ) => void;
  onOwnerChoiceForDatabase?: (
    databaseId: string,
    sourceId: string,
    path: string,
    blockId: string,
  ) => void;
}): React.JSX.Element {
  const [showAllItems, setShowAllItems] = useState(false);
  const [lossAcknowledged, setLossAcknowledged] = useState(false);
  const [customTitles, setCustomTitles] = useState<Readonly<Record<string, string>>>({});
  const [ownerPathDrafts, setOwnerPathDrafts] = useState<Readonly<Record<string, string>>>({});
  const items = preview?.items ?? [];
  const visibleItems = showAllItems ? items : items.slice(0, 50);
  const progress = task ? migrationTaskProgress(task) : 0;
  const recoveryRequired = task ? migrationTaskNeedsRecovery(task) : false;
  const rollbackAvailable = task ? migrationTaskCanRollback(task) : false;
  const retryAvailable = task ? migrationTaskCanRetry(task) : false;
  const taskIsActive = task?.state === 'running' || task?.state === 'queued';
  const requiresLossAcknowledgement = items.some((item) => !item.lossless);
  const titleBlockers = items.flatMap((item) =>
    (item.blockers ?? [])
      .filter((blocker) => blocker.code === 'title_conflict' && blocker.recordId)
      .map((blocker) => ({ databaseId: item.databaseId, ...blocker })),
  );
  const ownerBlockers = items.flatMap((item) =>
    (item.blockers ?? [])
      .filter((blocker) => blocker.code === 'owner_path_collision' && blocker.sourceId)
      .map((blocker) => ({ databaseId: item.databaseId, ...blocker })),
  );
  const previewRevision = preview?.expectedManifestRevision;
  useEffect(() => {
    if (previewRevision) setLossAcknowledged(false);
  }, [previewRevision]);
  return (
    <section
      aria-labelledby="database-migration-heading"
      data-testid="database-migration-dialog"
      className="space-y-4 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id="database-migration-heading" className="font-medium">
            <Trans>Database migration</Trans>
          </h2>
          <p className="text-xs text-muted-foreground">
            <Trans>
              Review the exact manifest, owner, and linked-document changes before approval.
            </Trans>
          </p>
        </div>
        {task ? (
          <span className="rounded-full border px-2 py-1 text-xs font-mono">{task.state}</span>
        ) : null}
      </div>

      {preview ? (
        <div className="space-y-2" aria-live="polite">
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">
                <Trans>Ready</Trans>
              </dt>
              <dd>{preview.summary.ready}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                <Trans>Blocked</Trans>
              </dt>
              <dd>{preview.summary.blocked}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                <Trans>Unchanged</Trans>
              </dt>
              <dd>{preview.summary.notNeeded}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                <Trans>Plan revision</Trans>
              </dt>
              <dd className="truncate font-mono" title={preview.expectedManifestRevision}>
                {preview.expectedManifestRevision}
              </dd>
            </div>
          </dl>
          {preview.items.some((item) => item.action === 'blocked') ? (
            <div role="alert" className="rounded border border-destructive/50 p-2 text-xs">
              <p className="font-medium">
                <ShieldAlert className="mr-1 inline size-3.5" aria-hidden="true" />
                <Trans>Migration is blocked</Trans>
              </p>
              <ul className="mt-1 list-disc pl-4">
                {preview.items
                  .filter((item) => item.action === 'blocked')
                  .slice(0, 50)
                  .map((item) => (
                    <li key={item.databaseId}>
                      {item.databaseKey} · {item.code ?? 'blocked'} ·{' '}
                      {item.message ?? 'Review the database blockers.'}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {requiresLossAcknowledgement ? (
            <label
              htmlFor="database-migration-loss-ack"
              className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs"
            >
              <Checkbox
                id="database-migration-loss-ack"
                checked={lossAcknowledged}
                onCheckedChange={(checked) => setLossAcknowledged(checked === true)}
                aria-describedby="database-migration-loss-warning"
              />
              <span id="database-migration-loss-warning">
                <Trans>
                  I understand that this migration contains a non-lossless conversion and have
                  reviewed each affected item.
                </Trans>
              </span>
            </label>
          ) : null}
          {titleBlockers.length > 0 ? (
            <fieldset className="space-y-2 rounded border p-2 text-xs">
              <legend className="px-1 font-medium">Title choices</legend>
              {titleBlockers.slice(0, 50).map((blocker) => {
                const recordId = blocker.recordId as string;
                const choiceKey = `${blocker.databaseId}:${recordId}`;
                const selected =
                  customTitles[choiceKey] !== undefined
                    ? 'custom_title'
                    : (titleChoicesByDatabase[blocker.databaseId]?.[recordId]?.kind ??
                      titleChoices[recordId]?.kind ??
                      'keep_document_title');
                return (
                  <div key={`${blocker.databaseId}:${recordId}`} className="space-y-1">
                    <label htmlFor={`title-choice-${recordId}`} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate" title={blocker.message}>
                        {recordId}
                      </span>
                      <Select
                        value={selected}
                        onValueChange={(value) => {
                          if (value === 'keep_document_title' || value === 'use_record_title') {
                            setCustomTitles((current) => {
                              if (current[choiceKey] === undefined) return current;
                              const next = { ...current };
                              delete next[choiceKey];
                              return next;
                            });
                            const choice = {
                              kind: value,
                            } as DatabaseMarkdownV2MigrationTitleChoice;
                            onTitleChoiceForDatabase?.(blocker.databaseId, recordId, choice);
                            onTitleChoice?.(recordId, choice);
                          } else if (value === 'custom_title') {
                            setCustomTitles((current) => ({
                              ...current,
                              [choiceKey]: current[choiceKey] ?? '',
                            }));
                            const title = customTitles[choiceKey]?.trim();
                            if (title) {
                              const choice = { kind: 'custom_title', title } as const;
                              onTitleChoiceForDatabase?.(blocker.databaseId, recordId, choice);
                              onTitleChoice?.(recordId, choice);
                            }
                          }
                        }}
                      >
                        <SelectTrigger
                          id={`title-choice-${recordId}`}
                          aria-label={`Title choice ${recordId}`}
                          size="sm"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="keep_document_title">Keep document title</SelectItem>
                          <SelectItem value="use_record_title">Use database title</SelectItem>
                          <SelectItem value="custom_title">Custom title</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    {selected === 'custom_title' ? (
                      <Input
                        className="w-full rounded border bg-background px-2 py-1"
                        aria-label={`Custom title ${recordId}`}
                        value={customTitles[choiceKey] ?? ''}
                        onChange={(event) => {
                          const title = event.target.value;
                          setCustomTitles((current) => ({ ...current, [choiceKey]: title }));
                          if (title.trim()) {
                            const choice = {
                              kind: 'custom_title',
                              title: title.trim(),
                            } as const;
                            onTitleChoiceForDatabase?.(blocker.databaseId, recordId, choice);
                            onTitleChoice?.(recordId, choice);
                          }
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          ) : null}
          {ownerBlockers.length > 0 ? (
            <fieldset className="space-y-2 rounded border p-2 text-xs">
              <legend className="px-1 font-medium">Owner path choices</legend>
              {ownerBlockers.slice(0, 50).map((blocker) => {
                const sourceId = blocker.sourceId as string;
                const choiceKey = `${blocker.databaseId}:${sourceId}`;
                const path = ownerPathDrafts[choiceKey] ?? blocker.path ?? '';
                const blockId =
                  ownerChoicesByDatabase[blocker.databaseId]?.[sourceId]?.blockId ??
                  ownerChoices[sourceId]?.blockId ??
                  `dbb_${sourceId.replace(/^ds_/, '')}_primary`;
                return (
                  <label
                    key={`${blocker.databaseId}:${sourceId}`}
                    htmlFor={`owner-path-${sourceId}`}
                    className="flex items-center gap-2"
                  >
                    <span className="font-mono">{sourceId}</span>
                    <Input
                      id={`owner-path-${sourceId}`}
                      className="min-w-0 flex-1 rounded border bg-background px-2 py-1"
                      aria-label={`Owner path ${sourceId}`}
                      value={path}
                      onChange={(event) => {
                        const nextPath = event.target.value;
                        setOwnerPathDrafts((current) => ({ ...current, [choiceKey]: nextPath }));
                        if (nextPath.trim()) {
                          onOwnerChoiceForDatabase?.(
                            blocker.databaseId,
                            sourceId,
                            nextPath.trim(),
                            blockId,
                          );
                          onOwnerChoice?.(sourceId, nextPath.trim(), blockId);
                        }
                      }}
                    />
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <ul
            aria-label="Migration diff"
            className="max-h-48 overflow-y-auto rounded border text-xs"
          >
            {visibleItems.map((item) => (
              <li key={item.databaseId} className="border-b px-2 py-1 last:border-b-0">
                <details open={visibleItems.length === 1}>
                  <summary className="cursor-pointer list-inside">
                    <span className="font-mono">{item.action}</span> · {item.databaseKey} ·{' '}
                    <span className="font-mono">{item.manifestPath}</span>
                    {item.ownerPaths?.length ? ` · ${item.ownerPaths.length} owner` : ''}
                    {item.linkedDocumentPaths?.length
                      ? ` · ${item.linkedDocumentPaths.length} linked`
                      : ''}
                  </summary>
                  <dl className="mt-2 grid gap-1 border-l pl-4 text-muted-foreground">
                    <div>
                      <dt className="inline font-medium">Database ID: </dt>
                      <dd className="inline font-mono">{item.databaseId}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Property/record changes: </dt>
                      <dd className="inline">
                        {item.blockers?.filter((blocker) => blocker.propertyId || blocker.recordId)
                          .length ?? 0}{' '}
                        blocker references
                      </dd>
                    </div>
                    {item.ownerPaths?.length ? (
                      <div>
                        <dt className="font-medium">Owner paths</dt>
                        <dd>{item.ownerPaths.slice(0, 50).join(', ')}</dd>
                      </div>
                    ) : null}
                    {item.linkedDocumentPaths?.length ? (
                      <div>
                        <dt className="font-medium">Linked document paths</dt>
                        <dd>{item.linkedDocumentPaths.slice(0, 50).join(', ')}</dd>
                      </div>
                    ) : null}
                    {item.blockers?.length ? (
                      <div>
                        <dt className="font-medium">Blockers and warnings</dt>
                        <dd>
                          <ul className="list-disc pl-4">
                            {item.blockers.slice(0, 50).map((blocker) => (
                              <li
                                key={`${item.databaseId}:${blocker.code}:${blocker.recordId ?? ''}:${blocker.propertyId ?? ''}:${blocker.path ?? ''}:${blocker.message}`}
                              >
                                <span className="font-mono">{blocker.code}</span> ·{' '}
                                {blocker.message}
                                {blocker.recordId ? ` · record ${blocker.recordId}` : ''}
                                {blocker.propertyId ? ` · property ${blocker.propertyId}` : ''}
                                {blocker.path ? ` · ${blocker.path}` : ''}
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </details>
              </li>
            ))}
          </ul>
          {items.length > 50 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAllItems((value) => !value)}
            >
              {showAllItems ? <Trans>Show fewer</Trans> : <Trans>Show all changes</Trans>}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={onApprove}
            disabled={
              !preview.committable ||
              Boolean(task) ||
              (requiresLossAcknowledgement && !lossAcknowledged)
            }
          >
            <Play aria-hidden="true" />
            <Trans>Approve migration</Trans>
          </Button>
          <p className="text-muted-foreground text-xs" role="status">
            Backup hashes are verified before activation. After a successful commit, rollback is
            available from the durable task until its retention window expires.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Trans>Load a migration preview to continue.</Trans>
        </p>
      )}

      {task ? (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center justify-between text-xs">
            <span>
              {task.state} · {task.progress.message ?? ''}
            </span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <progress aria-label="Migration progress" max={1} value={progress} className="w-full" />
          {task.problem ? (
            <p role="alert" className="text-xs text-destructive">
              {task.problem.detail}
            </p>
          ) : null}
          <div className="flex gap-2">
            {recoveryRequired ? (
              <Button type="button" variant="outline" onClick={onResume}>
                <RotateCcw aria-hidden="true" />
                <Trans>Inspect and resume</Trans>
              </Button>
            ) : null}
            {retryAvailable ? (
              <Button type="button" variant="outline" onClick={onRetry}>
                <RotateCcw aria-hidden="true" />
                <Trans>Retry migration</Trans>
              </Button>
            ) : null}
            {taskIsActive ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                <Pause aria-hidden="true" />
                <Trans>Cancel</Trans>
              </Button>
            ) : null}
            {rollbackAvailable ? (
              <Button type="button" variant="outline" onClick={onRollback}>
                <RotateCcw aria-hidden="true" />
                <Trans>Roll back migration</Trans>
              </Button>
            ) : null}
            {task.state === 'running' ? (
              <Loader2 className="size-4 animate-spin" aria-label="Migration running" />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
