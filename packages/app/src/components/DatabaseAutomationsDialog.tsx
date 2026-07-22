import { Trans } from '@lingui/react/macro';
import type { DatabaseAutomation, DatabaseDefinition } from '@nedian0brien/synapsenote-core';
import type {
  DatabaseAutomationNotification,
  DatabaseAutomationRun,
} from '@nedian0brien/synapsenote-server';
import { Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
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

interface Draft {
  id: string;
  key: string;
  name: string;
  description: string;
  ownerId: string;
  version: string;
  enabled: boolean;
  trigger: string;
  actions: string;
  maxAttempts: string;
  backoffSeconds: string;
  multiplier: string;
}

function stableKey(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(normalized) ? normalized.slice(0, 128) : `automation-${normalized || 'new'}`;
}

function draftFor(automation: DatabaseAutomation): Draft {
  return {
    id: automation.id,
    key: automation.key,
    name: automation.name,
    description: automation.description ?? '',
    ownerId: automation.ownerId,
    version: String(automation.version),
    enabled: automation.enabled,
    trigger: JSON.stringify(automation.trigger, null, 2),
    actions: JSON.stringify(automation.actions, null, 2),
    maxAttempts: String(automation.retry.maxAttempts),
    backoffSeconds: String(automation.retry.initialBackoffSeconds),
    multiplier: String(automation.retry.multiplier),
  };
}

function automationFromDraft(draft: Draft): DatabaseAutomation {
  const name = draft.name.trim();
  if (!name) throw new Error('Automation name is required');
  if (!draft.ownerId) throw new Error('Automation owner is required');
  const trigger: unknown = JSON.parse(draft.trigger);
  const actions: unknown = JSON.parse(draft.actions);
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('Actions must be a non-empty JSON array');
  }
  return {
    id: draft.id,
    key: draft.key.trim() || stableKey(name),
    name,
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ownerId: draft.ownerId,
    version: Number(draft.version),
    enabled: draft.enabled,
    trigger: trigger as DatabaseAutomation['trigger'],
    actions: actions as DatabaseAutomation['actions'],
    retry: {
      maxAttempts: Number(draft.maxAttempts),
      initialBackoffSeconds: Number(draft.backoffSeconds),
      multiplier: Number(draft.multiplier),
    },
    limits: { maxActionsPerRun: 20, maxGeneratedEvents: 20 },
  };
}

export function DatabaseAutomationsDialog({
  open,
  onOpenChange,
  database,
  busy,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: DatabaseDefinition;
  busy: boolean;
  onChange: (automations: readonly DatabaseAutomation[]) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<DatabaseAutomationRun[]>([]);
  const [notifications, setNotifications] = useState<DatabaseAutomationNotification[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setHistoryError(null);
    void fetch('/api/databases/automations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ action: 'list', databaseId: database.id, limit: 100 }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok) throw new Error(`Automation history failed with HTTP ${response.status}`);
        if (
          !result ||
          typeof result !== 'object' ||
          !Array.isArray((result as { runs?: unknown }).runs)
        ) {
          throw new Error('Automation history returned an invalid response');
        }
        setRuns((result as { runs: DatabaseAutomationRun[] }).runs);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setHistoryError(
            cause instanceof Error ? cause.message : 'Unable to load automation history',
          );
        }
      });
    void fetch('/api/databases/automations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ action: 'notifications', unreadOnly: true, limit: 20 }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (
          response.ok &&
          result &&
          typeof result === 'object' &&
          Array.isArray((result as { notifications?: unknown }).notifications)
        ) {
          setNotifications(
            (result as { notifications: DatabaseAutomationNotification[] }).notifications,
          );
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [database.id, open]);

  const save = () => {
    if (!draft) return;
    try {
      const automation = automationFromDraft(draft);
      onChange([
        ...database.automations.filter((candidate) => candidate.id !== automation.id),
        automation,
      ]);
      setDraft(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Automation is invalid');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            <Trans>Automations</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Build versioned, owned workflows. Internal writes use exact database plans; external
              delivery stays isolated behind connection and egress policy.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid min-h-0 gap-4 overflow-y-auto lg:grid-cols-[1fr_1.2fr]">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                <Trans>Definitions</Trans>
              </h3>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || database.people.every((person) => !person.active)}
                onClick={() => {
                  const owner = database.people.find((person) => person.active);
                  setDraft({
                    id: `auto_${crypto.randomUUID().replaceAll('-', '')}`,
                    key: '',
                    name: '',
                    description: '',
                    ownerId: owner?.id ?? '',
                    version: '1',
                    enabled: false,
                    trigger: JSON.stringify(
                      { kind: 'record_added', sourceId: database.sources[0]?.id },
                      null,
                      2,
                    ),
                    actions: JSON.stringify([], null, 2),
                    maxAttempts: '3',
                    backoffSeconds: '60',
                    multiplier: '2',
                  });
                }}
              >
                <Plus className="mr-1 size-4" />
                <Trans>New</Trans>
              </Button>
            </div>
            {database.automations.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <Trans>No automations yet.</Trans>
              </p>
            ) : null}
            {database.automations.map((automation) => (
              <div key={automation.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {automation.enabled ? (
                        <Power className="size-3.5 text-emerald-500" />
                      ) : (
                        <PowerOff className="size-3.5 text-muted-foreground" />
                      )}
                      {automation.name}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      v{automation.version} · {automation.trigger.kind} ·{' '}
                      {automation.actions.length} actions
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setDraft(draftFor(automation))}
                      aria-label="Edit automation"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        onChange(
                          database.automations.filter(
                            (candidate) => candidate.id !== automation.id,
                          ),
                        )
                      }
                      aria-label="Delete automation"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-medium">
                <Trans>Unread notifications</Trans>
              </h3>
              {notifications.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  <Trans>No unread automation notifications.</Trans>
                </p>
              ) : null}
              {notifications.map((notification) => (
                <div key={notification.id} className="rounded border px-2 py-1.5 text-xs">
                  <div className="font-medium">{notification.title}</div>
                  {notification.body ? (
                    <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {notification.body}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-medium">
                <Trans>Recent runs</Trans>
              </h3>
              {historyError ? <p className="text-xs text-destructive">{historyError}</p> : null}
              {runs.slice(0, 20).map((run) => (
                <div key={run.id} className="rounded border px-2 py-1.5 text-xs">
                  <div className="flex justify-between">
                    <span>{run.automationId}</span>
                    <span>{run.state}</span>
                  </div>
                  <div className="text-muted-foreground">
                    attempt {run.attempt} · {run.errorCode ?? 'verified'}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-md border p-4">
            {draft ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      aria-label="Automation name"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Stable key</Label>
                    <Input
                      aria-label="Automation stable key"
                      value={draft.key}
                      placeholder={stableKey(draft.name)}
                      onChange={(event) => setDraft({ ...draft, key: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Owner</Label>
                    <Select
                      value={draft.ownerId}
                      onValueChange={(ownerId) => setDraft({ ...draft, ownerId })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {database.people
                          .filter((person) => person.active)
                          .map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Version</Label>
                    <Input
                      type="number"
                      min={1}
                      value={draft.version}
                      onChange={(event) => setDraft({ ...draft, version: event.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={draft.enabled}
                    onCheckedChange={(enabled) => setDraft({ ...draft, enabled: enabled === true })}
                  />
                  <Label>Enabled</Label>
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Trigger (stable-ID JSON)</Label>
                  <Textarea
                    aria-label="Automation trigger JSON"
                    className="min-h-28 font-mono text-xs"
                    value={draft.trigger}
                    onChange={(event) => setDraft({ ...draft, trigger: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Ordered actions (stable-ID JSON)</Label>
                  <Textarea
                    aria-label="Automation actions JSON"
                    className="min-h-48 font-mono text-xs"
                    value={draft.actions}
                    onChange={(event) => setDraft({ ...draft, actions: event.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Attempts</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={draft.maxAttempts}
                      onChange={(event) => setDraft({ ...draft, maxAttempts: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Backoff sec.</Label>
                    <Input
                      type="number"
                      min={1}
                      value={draft.backoffSeconds}
                      onChange={(event) =>
                        setDraft({ ...draft, backoffSeconds: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Multiplier</Label>
                    <Input
                      type="number"
                      min={1}
                      step="0.5"
                      value={draft.multiplier}
                      onChange={(event) => setDraft({ ...draft, multiplier: event.target.value })}
                    />
                  </div>
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDraft(null)}>
                    <Trans>Cancel</Trans>
                  </Button>
                  <Button disabled={busy} onClick={save}>
                    <Trans>Review change</Trans>
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                <Trans>Select an automation or create a new one.</Trans>
              </div>
            )}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
