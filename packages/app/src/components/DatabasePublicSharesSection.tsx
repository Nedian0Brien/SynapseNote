import { Trans } from '@lingui/react/macro';
import type { DatabaseDefinition, DatabasePublicShareTarget } from '@nedian0brien/synapsenote-core';
import { Copy, Link2, Loader2, RefreshCw, RotateCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import {
  type DatabasePublicShare,
  fetchDatabasePublicShares,
  revokeDatabasePublicShare,
  saveDatabasePublicShare,
} from '@/lib/database-public-shares-client';

export function DatabasePublicSharesSection({
  database,
  selectedViewId,
  selectedRecordId,
}: {
  database: DatabaseDefinition;
  selectedViewId?: string;
  selectedRecordId?: string;
}) {
  'use no memo';
  const selectedView = database.views.find(({ id }) => id === selectedViewId);
  const selectedSource = database.sources.find(
    ({ id }) => id === selectedView?.sourceId || (!selectedView && id === database.sources[0]?.id),
  );
  const [shares, setShares] = useState<DatabasePublicShare[]>([]);
  const [revision, setRevision] = useState('sha256:empty');
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [targetKind, setTargetKind] = useState<'database' | 'view' | 'record'>(
    selectedRecordId ? 'record' : selectedView ? 'view' : 'database',
  );
  const [access, setAccess] = useState<'public' | 'link'>('link');
  const [propertyIds, setPropertyIds] = useState<Set<string>>(
    () => new Set(selectedSource?.properties.map(({ id }) => id) ?? []),
  );
  const [allowBody, setAllowBody] = useState(false);
  const [allowFormSubmission, setAllowFormSubmission] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [issuedCredential, setIssuedCredential] = useState<string | null>(null);

  useEffect(() => {
    void refresh;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    void fetchDatabasePublicShares(database.id, { signal: controller.signal })
      .then((snapshot) => {
        setShares(snapshot.shares);
        setRevision(snapshot.revision);
        setStatus('idle');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load public shares');
        setStatus('idle');
      });
    return () => controller.abort();
  }, [database.id, refresh]);

  let target: DatabasePublicShareTarget | null = null;
  if (selectedSource) {
    if (targetKind === 'record' && selectedRecordId) {
      target = { kind: 'record', databaseId: database.id, recordId: selectedRecordId };
    } else if (targetKind === 'database' || !selectedView) {
      target = { kind: 'database', databaseId: database.id, sourceId: selectedSource.id };
    } else {
      const kind =
        selectedView.layout.type === 'form'
          ? 'form'
          : selectedView.layout.type === 'chart'
            ? 'chart'
            : 'view';
      target = { kind, databaseId: database.id, viewId: selectedView.id };
    }
  }

  const save = async (existing?: DatabasePublicShare, rotateToken = false) => {
    const nextTarget = existing?.target ?? target;
    if (!nextTarget || status !== 'idle') return;
    setStatus('saving');
    setError(null);
    try {
      const result = await saveDatabasePublicShare({
        ...(existing ? { shareId: existing.id } : {}),
        target: nextTarget,
        access: existing?.access ?? access,
        propertyIds: existing?.propertyIds ?? [...propertyIds],
        allowBody: existing?.allowBody ?? allowBody,
        allowFormSubmission: existing?.allowFormSubmission ?? allowFormSubmission,
        expiresAt: existing?.expiresAt ?? (expiresAt ? new Date(expiresAt).toISOString() : null),
        rotateToken,
        expectedRevision: revision,
      });
      setShares((current) => [...current.filter(({ id }) => id !== result.share.id), result.share]);
      setRevision(result.revision);
      setIssuedCredential(
        result.token
          ? `${globalThis.location.origin}/share/databases/${result.share.id}?token=${encodeURIComponent(result.token)}`
          : null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save public share');
    } finally {
      setStatus('idle');
    }
  };

  const revoke = async (share: DatabasePublicShare) => {
    if (status !== 'idle') return;
    setStatus('saving');
    try {
      const result = await revokeDatabasePublicShare({
        shareId: share.id,
        expectedRevision: revision,
      });
      setShares((current) => current.filter(({ id }) => id !== share.id));
      setRevision(result.revision);
      setIssuedCredential(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to revoke public share');
    } finally {
      setStatus('idle');
    }
  };

  if (!selectedSource) return null;
  const titleProperty = selectedSource.properties.find(({ type }) => type === 'title');
  const isSelectedForm = selectedView?.layout.type === 'form';

  return (
    <section className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">
            <Trans>Public links</Trans>
          </h3>
          <p className="text-muted-foreground text-xs">
            <Trans>Publish only the selected properties. Link credentials are shown once.</Trans>
          </p>
        </div>
        <Link2 className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={targetKind}
          onValueChange={(value) => setTargetKind(value as 'database' | 'view' | 'record')}
        >
          <SelectTrigger aria-label="Public share target">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="database">
              <Trans>Current database source</Trans>
            </SelectItem>
            {selectedView ? (
              <SelectItem value="view">
                <Trans>Current view</Trans>
              </SelectItem>
            ) : null}
            {selectedRecordId ? (
              <SelectItem value="record">
                <Trans>Open record page</Trans>
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        <Select value={access} onValueChange={(value) => setAccess(value as 'public' | 'link')}>
          <SelectTrigger aria-label="Public share access">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="link">
              <Trans>Secret link</Trans>
            </SelectItem>
            <SelectItem value="public">
              <Trans>Public without token</Trans>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {selectedSource.properties.map((property) => (
          <label
            key={property.id}
            htmlFor={`public-share-property-${property.id}`}
            className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
          >
            <Checkbox
              id={`public-share-property-${property.id}`}
              checked={propertyIds.has(property.id)}
              disabled={property.id === titleProperty?.id || status !== 'idle'}
              onCheckedChange={(checked) =>
                setPropertyIds((current) => {
                  const next = new Set(current);
                  if (checked === true) next.add(property.id);
                  else next.delete(property.id);
                  return next;
                })
              }
            />
            <span>{property.name}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label htmlFor="public-share-body" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="public-share-body"
            checked={allowBody}
            onCheckedChange={(value) => setAllowBody(value === true)}
          />
          <Trans>Include page body</Trans>
        </label>
        {targetKind === 'view' && isSelectedForm ? (
          <label htmlFor="public-share-form-submission" className="flex items-center gap-2 text-sm">
            <Checkbox
              id="public-share-form-submission"
              checked={allowFormSubmission}
              onCheckedChange={(value) => setAllowFormSubmission(value === true)}
            />
            <Trans>Accept form submissions</Trans>
          </label>
        ) : null}
      </div>
      <Input
        type="datetime-local"
        value={expiresAt}
        onChange={(event) => setExpiresAt(event.currentTarget.value)}
        aria-label="Public share expiration"
      />
      <div className="flex justify-end">
        <Button disabled={status !== 'idle' || propertyIds.size === 0} onClick={() => void save()}>
          {status === 'saving' ? <Loader2 className="animate-spin" /> : null}
          <Trans>Create public link</Trans>
        </Button>
      </div>
      {issuedCredential ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs">
          <p>
            <Trans>Copy this link now. Its secret cannot be shown again.</Trans>
          </p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={issuedCredential} aria-label="Issued public link" />
            <Button
              size="icon"
              aria-label="Copy public link"
              onClick={() => void navigator.clipboard.writeText(issuedCredential)}
            >
              <Copy />
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">
          <Trans>Active and revoked links</Trans>
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={status !== 'idle'}
        >
          <RefreshCw /> <Trans>Refresh</Trans>
        </Button>
      </div>
      {status === 'loading' ? (
        <p className="text-muted-foreground text-sm">
          <Trans>Loading public links</Trans>
        </p>
      ) : null}
      <div className="divide-y rounded-md border">
        {shares.map((share) => (
          <div key={share.id} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0 text-xs">
              <p className="truncate font-mono">{share.id}</p>
              <p className="text-muted-foreground">
                {share.target.kind} · {share.access} · {share.propertyIds.length} properties
              </p>
            </div>
            <div className="flex gap-1">
              {share.access === 'link' && !share.revokedAt ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rotate ${share.id}`}
                  onClick={() => void save(share, true)}
                >
                  <RotateCw />
                </Button>
              ) : null}
              {!share.revokedAt ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Revoke ${share.id}`}
                  onClick={() => void revoke(share)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
