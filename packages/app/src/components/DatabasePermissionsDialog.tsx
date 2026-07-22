import { Trans } from '@lingui/react/macro';
import {
  DATABASE_PERMISSION_ACTIONS,
  type DatabaseDefinition,
  type DatabasePermissionAction,
  type DatabasePermissionRole,
  databasePermissionRoleActions,
} from '@nedian0brien/synapsenote-core';
import { Loader2, Pencil, RefreshCw, Shield, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DatabasePublicSharesSection } from '@/components/DatabasePublicSharesSection';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type DatabasePermissionGrant,
  fetchDatabasePermissions,
  removeDatabasePermission,
  saveDatabasePermission,
} from '@/lib/database-permissions-client';

const READ_ACTIONS = new Set<DatabasePermissionAction>(databasePermissionRoleActions('view_only'));

export function DatabasePermissionsDialog({
  open,
  onOpenChange,
  databaseId,
  databaseName,
  database,
  selectedViewId,
  selectedRecordId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseId: string;
  databaseName: string;
  database?: DatabaseDefinition;
  selectedViewId?: string;
  selectedRecordId?: string;
}) {
  'use no memo';
  const [grants, setGrants] = useState<DatabasePermissionGrant[]>([]);
  const [revision, setRevision] = useState('sha256:empty');
  const [principalId, setPrincipalId] = useState('');
  const [actions, setActions] = useState<Set<DatabasePermissionAction>>(new Set(READ_ACTIONS));
  const [role, setRole] = useState<DatabasePermissionRole>('view_only');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [workspaceScope, setWorkspaceScope] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void refresh;
    if (!open) return;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    void fetchDatabasePermissions(databaseId, { signal: controller.signal })
      .then((snapshot) => {
        setGrants(snapshot.grants);
        setRevision(snapshot.revision);
        setStatus('idle');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load database permissions');
        setStatus('idle');
      });
    return () => controller.abort();
  }, [databaseId, open, refresh]);

  const resetDraft = () => {
    setEditingId(null);
    setWorkspaceScope(false);
    setPrincipalId('');
    setRole('view_only');
    setActions(new Set(READ_ACTIONS));
  };

  const save = async () => {
    if (!principalId.trim() || actions.size === 0 || status !== 'idle') return;
    setStatus('saving');
    setError(null);
    try {
      const result = await saveDatabasePermission({
        ...(editingId ? { grantId: editingId } : {}),
        databaseId: workspaceScope ? null : databaseId,
        principalId: principalId.trim(),
        role,
        actions: [...actions],
        expectedRevision: revision,
      });
      setGrants((current) =>
        [...current.filter((grant) => grant.id !== result.grant.id), result.grant].sort(
          (left, right) =>
            left.principalId.localeCompare(right.principalId) || left.id.localeCompare(right.id),
        ),
      );
      setRevision(result.revision);
      resetDraft();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save database permission');
    } finally {
      setStatus('idle');
    }
  };

  const remove = async (grant: DatabasePermissionGrant) => {
    if (status !== 'idle') return;
    const scope = grant.databaseId === null ? 'the entire workspace' : `database ${databaseName}`;
    if (
      !window.confirm(
        `Revoke ${grant.principalId}'s ${grant.role} permission for ${scope}? This takes effect immediately. Recovery: create the same grant again.`,
      )
    )
      return;
    setStatus('saving');
    setError(null);
    try {
      const result = await removeDatabasePermission({
        grantId: grant.id,
        expectedRevision: revision,
      });
      setGrants((current) => current.filter((candidate) => candidate.id !== grant.id));
      setRevision(result.revision);
      if (editingId === grant.id) resetDraft();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to revoke database permission');
    } finally {
      setStatus('idle');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            <Trans>Database permissions</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Grant exact actions for {databaseName}. The project owner always retains access.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5 overflow-y-auto">
          {database ? (
            <DatabasePublicSharesSection
              database={database}
              selectedViewId={selectedViewId}
              selectedRecordId={selectedRecordId}
            />
          ) : null}
          <section className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">
                  {editingId ? <Trans>Edit grant</Trans> : <Trans>Share database</Trans>}
                </h3>
                <p className="text-muted-foreground text-xs">
                  <Trans>
                    Use a stable user principal ID. Agent access remains limited by its own
                    capability and session.
                  </Trans>
                </p>
              </div>
              <Shield className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <Input
              value={principalId}
              onChange={(event) => setPrincipalId(event.currentTarget.value)}
              placeholder="user:collaborator"
              aria-label="Principal ID"
              disabled={status !== 'idle'}
            />
            <Select
              value={role}
              onValueChange={(value) => {
                const nextRole = value as DatabasePermissionRole;
                setRole(nextRole);
                if (nextRole !== 'custom') {
                  setActions(new Set(databasePermissionRoleActions(nextRole)));
                }
              }}
              disabled={status !== 'idle'}
            >
              <SelectTrigger aria-label="Permission role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view_only">
                  <Trans>View only</Trans>
                </SelectItem>
                <SelectItem value="content_editor">
                  <Trans>Content editor</Trans>
                </SelectItem>
                <SelectItem value="custom">
                  <Trans>Custom actions</Trans>
                </SelectItem>
              </SelectContent>
            </Select>
            <label
              htmlFor="database-permission-workspace-scope"
              className="flex items-start gap-2 rounded-md border p-3 text-sm"
            >
              <Checkbox
                id="database-permission-workspace-scope"
                checked={workspaceScope}
                onCheckedChange={(checked) => setWorkspaceScope(checked === true)}
                disabled={status !== 'idle'}
              />
              <span>
                <span className="block font-medium">
                  <Trans>Apply across the workspace</Trans>
                </span>
                <span className="block text-muted-foreground text-xs">
                  <Trans>
                    Required for creating databases and grants the selected actions on every
                    database.
                  </Trans>
                </span>
              </span>
            </label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {DATABASE_PERMISSION_ACTIONS.map((action) => (
                <label
                  key={action}
                  htmlFor={`database-permission-${action}`}
                  className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                >
                  <Checkbox
                    id={`database-permission-${action}`}
                    checked={actions.has(action)}
                    onCheckedChange={(checked) =>
                      setActions((current) => {
                        const next = new Set(current);
                        if (checked === true) next.add(action);
                        else next.delete(action);
                        return next;
                      })
                    }
                    disabled={status !== 'idle' || role !== 'custom'}
                  />
                  <span className="font-mono">{action}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              {editingId ? (
                <Button variant="ghost" onClick={resetDraft} disabled={status !== 'idle'}>
                  <Trans>Cancel</Trans>
                </Button>
              ) : null}
              <Button
                onClick={() => void save()}
                disabled={!principalId.trim() || actions.size === 0 || status !== 'idle'}
              >
                {status === 'saving' ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : null}
                {editingId ? <Trans>Save grant</Trans> : <Trans>Share</Trans>}
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                <Trans>Current grants</Trans>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRefresh((value) => value + 1)}
                disabled={status !== 'idle'}
              >
                <RefreshCw aria-hidden="true" /> <Trans>Refresh</Trans>
              </Button>
            </div>
            {status === 'loading' ? (
              <p className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="animate-spin" /> <Trans>Loading permissions</Trans>
              </p>
            ) : grants.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
                <Trans>No explicit grants. Only the project owner has access.</Trans>
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {grants.map((grant) => (
                  <div key={grant.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">{grant.principalId}</p>
                      <p className="text-muted-foreground text-xs">
                        {grant.role === 'view_only' ? (
                          <Trans>View only</Trans>
                        ) : grant.role === 'content_editor' ? (
                          <Trans>Content editor</Trans>
                        ) : (
                          <Trans>Custom actions</Trans>
                        )}
                      </p>
                      {grant.databaseId === null ? (
                        <p className="text-amber-700 text-xs">
                          <Trans>Workspace grant</Trans>
                        </p>
                      ) : null}
                      <p className="mt-1 break-words font-mono text-muted-foreground text-xs">
                        {grant.actions.join(', ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${grant.principalId}`}
                        disabled={status !== 'idle'}
                        onClick={() => {
                          setEditingId(grant.id);
                          setWorkspaceScope(grant.databaseId === null);
                          setPrincipalId(grant.principalId);
                          setRole(grant.role);
                          setActions(new Set(grant.actions));
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Revoke ${grant.principalId}`}
                        disabled={status !== 'idle'}
                        onClick={() => void remove(grant)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <p className="break-all text-muted-foreground text-xs">Policy revision: {revision}</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
