import { Trans } from '@lingui/react/macro';
import {
  DatabaseDefinitionSchema,
  type DatabasePerson,
  type DatabaseSource,
  type DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { Database, Loader2, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DatabaseForm } from '@/components/DatabaseForm';
import { DatabaseFormSubmitResponseSchema } from '@/lib/database-form-client';
import {
  accessDatabasePublicShare,
  type DatabasePublicShare,
} from '@/lib/database-public-shares-client';

interface PublicRecord {
  id: string;
  values: Record<string, unknown>;
}

interface PublicForm {
  databaseId: string;
  source: DatabaseSource;
  view: DatabaseView;
  people: readonly DatabasePerson[];
}

interface PublicAggregationGroup {
  key: Array<{ propertyId: string; value: unknown }>;
  calculations: Array<{ id: string; value: unknown }>;
}

function readAggregation(result: unknown): PublicAggregationGroup[] {
  if (!result || typeof result !== 'object') return [];
  const aggregation = (result as { aggregation?: unknown }).aggregation;
  if (!aggregation || typeof aggregation !== 'object') return [];
  const groups = (aggregation as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return [];
  return groups.filter(
    (group): group is PublicAggregationGroup =>
      !!group &&
      typeof group === 'object' &&
      Array.isArray((group as PublicAggregationGroup).key) &&
      Array.isArray((group as PublicAggregationGroup).calculations),
  );
}

function readForm(result: unknown): PublicForm | null {
  if (!result || typeof result !== 'object') return null;
  const parsed = DatabaseDefinitionSchema.safeParse((result as { database?: unknown }).database);
  if (!parsed.success) return null;
  const view = parsed.data.views.find(({ layout }) => layout.type === 'form');
  const source = parsed.data.sources.find(({ id }) => id === view?.sourceId);
  return view && source
    ? { databaseId: parsed.data.id, source, view, people: parsed.data.people }
    : null;
}

function readRecords(result: unknown): PublicRecord[] {
  if (!result || typeof result !== 'object') return [];
  const candidate = result as Record<string, unknown>;
  if (Array.isArray(candidate.records)) {
    return candidate.records.filter(
      (record): record is PublicRecord =>
        !!record &&
        typeof record === 'object' &&
        typeof (record as PublicRecord).id === 'string' &&
        !!(record as PublicRecord).values &&
        typeof (record as PublicRecord).values === 'object',
    );
  }
  const record = candidate.record;
  return record &&
    typeof record === 'object' &&
    typeof (record as PublicRecord).id === 'string' &&
    (record as PublicRecord).values
    ? [record as PublicRecord]
    : [];
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export function PublicDatabaseSharePage({ shareId, token }: { shareId: string; token?: string }) {
  const [share, setShare] = useState<DatabasePublicShare | null>(null);
  const [records, setRecords] = useState<PublicRecord[]>([]);
  const [aggregationGroups, setAggregationGroups] = useState<PublicAggregationGroup[]>([]);
  const [form, setForm] = useState<PublicForm | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    void accessDatabasePublicShare(
      { action: 'resolve', shareId, ...(token ? { token } : {}) },
      { signal: controller.signal },
    )
      .then(async ({ share: resolved }) => {
        setShare(resolved);
        const action =
          resolved.target.kind === 'record'
            ? 'record'
            : resolved.target.kind === 'form'
              ? 'describe'
              : 'query';
        const accessed = await accessDatabasePublicShare(
          {
            action,
            shareId,
            ...(token ? { token } : {}),
            ...(action === 'query' ? { query: { select: resolved.propertyIds } } : {}),
          },
          { signal: controller.signal },
        );
        setRecords(readRecords(accessed.result));
        setAggregationGroups(readAggregation(accessed.result));
        setForm(readForm(accessed.result));
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [shareId, token]);

  if (status === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="animate-spin" aria-label="Loading shared database" />
      </main>
    );
  }
  if (status === 'error' || !share) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <section className="max-w-md rounded-xl border bg-background p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h1 className="font-semibold text-xl">
            <Trans>This database link is unavailable</Trans>
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            <Trans>It may be invalid, expired, or revoked.</Trans>
          </p>
        </section>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-muted/30 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-xl border bg-background p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Database className="size-6" />
            <div>
              <h1 className="font-semibold text-xl">
                <Trans>Shared database</Trans>
              </h1>
              <p className="text-muted-foreground text-sm">
                {share.target.kind} · {share.propertyIds.length} <Trans>properties</Trans>
              </p>
            </div>
          </div>
        </header>
        {share.target.kind === 'form' && form ? (
          <section className="rounded-xl border bg-background p-6 shadow-sm">
            <DatabaseForm
              databaseId={form.databaseId}
              source={form.source}
              view={form.view}
              people={form.people}
              submit={async (input) => {
                const accessed = await accessDatabasePublicShare({
                  action: 'submit_form',
                  shareId,
                  ...(token ? { token } : {}),
                  submissionId: input.submissionId,
                  startedAt: input.startedAt,
                  answers: input.answers,
                  ...(input.honeypot === undefined ? {} : { honeypot: input.honeypot }),
                });
                return DatabaseFormSubmitResponseSchema.parse(accessed.result);
              }}
            />
          </section>
        ) : share.target.kind === 'form' ? (
          <section className="rounded-xl border bg-background p-6 text-sm shadow-sm">
            <Trans>This form is unavailable.</Trans>
          </section>
        ) : share.target.kind === 'chart' && aggregationGroups.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {aggregationGroups.map((group) => (
              <article
                key={group.key
                  .map(({ propertyId, value }) => `${propertyId}:${displayValue(value)}`)
                  .join('|')}
                className="rounded-xl border bg-background p-5 shadow-sm"
              >
                {group.key.map(({ propertyId, value }) => (
                  <p key={propertyId} className="text-sm">
                    <span className="text-muted-foreground">{propertyId}: </span>
                    {displayValue(value)}
                  </p>
                ))}
                {group.calculations.map(({ id, value }) => (
                  <p key={id} className="mt-2 font-semibold text-2xl">
                    {displayValue(value)}
                  </p>
                ))}
              </article>
            ))}
          </section>
        ) : records.length === 0 ? (
          <section className="rounded-xl border bg-background p-6 text-muted-foreground text-sm shadow-sm">
            <Trans>No shared records</Trans>
          </section>
        ) : (
          <section className="overflow-x-auto rounded-xl border bg-background shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {share.propertyIds.map((propertyId) => (
                    <th key={propertyId} className="px-4 py-3 text-left font-medium">
                      {propertyId}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b last:border-0">
                    {share.propertyIds.map((propertyId) => (
                      <td key={propertyId} className="max-w-md px-4 py-3 align-top">
                        {displayValue(record.values[propertyId])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <footer className="text-center text-muted-foreground text-xs">
          <Trans>Shared from SynapseNote</Trans>
        </footer>
      </div>
    </main>
  );
}
