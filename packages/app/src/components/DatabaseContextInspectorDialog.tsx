import { Plural, Trans } from '@lingui/react/macro';
import type {
  DatabaseContextInspection,
  DatabaseContextInspectionScope,
  DatabaseContextInspectionSummary,
  DatabaseContextPack,
} from '@nedian0brien/synapsenote-server';
import {
  AlertCircle,
  Braces,
  Check,
  ChevronRight,
  Clipboard,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { DatabaseMachineIdsDetails } from '@/components/DatabaseMachineIdsDetails';
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
import { cn } from '@/lib/utils';

type InspectorStatus = 'idle' | 'loading' | 'success' | 'error';

interface InspectionListResponse {
  kind: 'list';
  inspections: DatabaseContextInspectionSummary[];
}

interface InspectionDetailResponse {
  kind: 'detail';
  inspection: DatabaseContextInspection;
}

async function responseJson(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && 'detail' in value && typeof value.detail === 'string'
        ? value.detail
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return value;
}

export async function fetchContextInspectionList(
  signal?: AbortSignal,
  scope?: DatabaseContextInspectionScope,
): Promise<DatabaseContextInspectionSummary[]> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(scope ?? {})) {
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  const value = await responseJson(
    await fetch(`/api/databases/inspect${query ? `?${query}` : ''}`, { method: 'GET', signal }),
  );
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'list') {
    throw new Error('Invalid context inspection list response');
  }
  const response = value as Partial<InspectionListResponse>;
  if (!Array.isArray(response.inspections)) {
    throw new Error('Invalid context inspection list response');
  }
  return response.inspections;
}

export async function fetchContextInspection(
  packId: string,
  signal?: AbortSignal,
  scope?: DatabaseContextInspectionScope,
): Promise<DatabaseContextInspection> {
  const search = new URLSearchParams({ packId });
  for (const [key, value] of Object.entries(scope ?? {})) {
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else if (value) {
      search.set(key, value);
    }
  }
  const value = await responseJson(
    await fetch(`/api/databases/inspect?${search.toString()}`, {
      method: 'GET',
      signal,
    }),
  );
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'detail') {
    throw new Error('Invalid context inspection detail response');
  }
  const response = value as Partial<InspectionDetailResponse>;
  if (!response.inspection || response.inspection.packId !== packId) {
    throw new Error('Context inspection response does not match the requested pack');
  }
  return response.inspection;
}

function totalRedactions(inspection: DatabaseContextInspectionSummary): number {
  return (
    inspection.redactions.rootRecords +
    inspection.redactions.rootProperties +
    inspection.redactions.relationRecords +
    inspection.redactions.relationProperties
  );
}

function totalOmissions(inspection: DatabaseContextInspectionSummary): number {
  const relation = inspection.omissions.relation;
  return (
    inspection.omissions.records +
    inspection.omissions.propertyIds.length +
    inspection.omissions.evidence +
    inspection.omissions.fullBodies +
    relation.depthLimit +
    relation.recordLimit +
    relation.fanOutLimit +
    relation.missingRecords +
    relation.permissionRecords +
    relation.permissionProperties
  );
}

function citationLabels(inspection: DatabaseContextInspection): string[] {
  const disclosure = inspection.exactPack.disclosure;
  if (!disclosure) return [];
  if (disclosure.level === 'evidence') {
    return disclosure.evidence.map(
      (evidence) =>
        `${evidence.id} · ${evidence.path} · ${evidence.field}${
          evidence.propertyId ? `:${evidence.propertyId}` : ''
        } · ${evidence.start}-${evidence.end}`,
    );
  }
  if (disclosure.level === 'full_body') {
    return disclosure.fullBodies.map((body) => `${body.recordId} · ${body.path} · full body`);
  }
  return [];
}

function compactSchemaLabel(inspection: DatabaseContextInspection): string {
  const properties = inspection.exactPack.schema.properties;
  if (properties.length === 0) return 'No property metadata';
  const names = properties.slice(0, 4).map((property) => property.name);
  const remainder = properties.length - names.length;
  return `${names.join(', ')}${remainder > 0 ? ` +${remainder}` : ''}`;
}

function scopeRecordCount(scope: DatabaseContextInspectionScope | undefined): number | null {
  if (scope?.recordIds) return scope.recordIds.length;
  if (scope?.recordId) return 1;
  return null;
}

function scopePropertyCount(scope: DatabaseContextInspectionScope | undefined): number | null {
  return scope?.propertyIds ? scope.propertyIds.length : null;
}

type ContextPackProperty = DatabaseContextPack['schema']['properties'][number];

function projectPropertyMap<T>(
  value: Readonly<Record<string, Readonly<Record<string, T>>>> | undefined,
  propertyIds: ReadonlySet<string>,
): Readonly<Record<string, Readonly<Record<string, T>>>> | undefined {
  if (!value) return undefined;
  return Object.fromEntries(
    Object.entries(value).map(([recordId, properties]) => [
      recordId,
      Object.fromEntries(
        Object.entries(properties).filter(([propertyId]) => propertyIds.has(propertyId)),
      ),
    ]),
  );
}

/**
 * Creates a local, non-mutating projection of an exact Context Pack.
 * The server remains the source of truth for pack construction and redaction;
 * this helper powers only the inspector's token-efficient preview.
 */
export function projectContextPackForProperties(
  pack: DatabaseContextPack,
  propertyIds: readonly string[],
): DatabaseContextPack {
  const selected = new Set(propertyIds);
  const properties = pack.schema.properties.filter((property) => selected.has(property.id));
  let records: DatabaseContextPack['records'];
  if ('columns' in pack.records) {
    const columnar = pack.records;
    const keepIndexes = columnar.columns.flatMap((column, index) =>
      index < 3 || selected.has(column) ? [index] : [],
    );
    records = {
      ...columnar,
      columns: keepIndexes.map((index) => columnar.columns[index] ?? ''),
      dictionaries: Object.fromEntries(
        Object.entries(columnar.dictionaries).filter(([propertyId]) => selected.has(propertyId)),
      ),
      rows: columnar.rows.map((row) => keepIndexes.map((index) => row[index])),
      ...(columnar.textReferences
        ? { textReferences: projectPropertyMap(columnar.textReferences, selected) }
        : {}),
      ...(columnar.verification
        ? { verification: projectPropertyMap(columnar.verification, selected) }
        : {}),
    };
  } else {
    records = pack.records.map((record) => ({
      ...record,
      values: Object.fromEntries(
        Object.entries(record.values).filter(([propertyId]) => selected.has(propertyId)),
      ),
      ...(record.textReferences
        ? {
            textReferences: projectPropertyMap({ [record.id]: record.textReferences }, selected)?.[
              record.id
            ],
          }
        : {}),
      ...(record.verification
        ? {
            verification: projectPropertyMap({ [record.id]: record.verification }, selected)?.[
              record.id
            ],
          }
        : {}),
    }));
  }
  return {
    ...pack,
    schema: { ...pack.schema, properties },
    records,
  };
}

function Metric({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-medium">{value}</dd>
    </div>
  );
}

function ContextFieldControls({
  selected,
}: {
  selected: DatabaseContextInspection;
}): React.JSX.Element {
  const availableProperties: ContextPackProperty[] = (() => {
    const known = new Set(selected.exactPack.schema.properties.map((property) => property.id));
    const fallbackIds =
      'columns' in selected.exactPack.records
        ? selected.exactPack.records.columns.slice(3)
        : selected.exactPack.records.flatMap((record) => Object.keys(record.values));
    const fallback = fallbackIds
      .filter((propertyId) => !known.has(propertyId))
      .map((propertyId) => ({
        id: propertyId,
        key: propertyId,
        name: propertyId,
        type: 'text' as const,
        required: false,
        semantics: {
          constraints: { unique: false },
          inferencePolicy: 'explicit_only' as const,
          sensitivity: 'inherit' as const,
        },
      }));
    return [...selected.exactPack.schema.properties, ...fallback];
  })();
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>(() =>
    availableProperties.map((property) => property.id),
  );

  const projectedPack = projectContextPackForProperties(selected.exactPack, selectedPropertyIds);
  const projectedJson = JSON.stringify(projectedPack, null, 2);
  const previewBytes = new TextEncoder().encode(projectedJson);
  const estimatedPreviewTokens = Math.ceil(previewBytes.byteLength / 3);
  const selectedSet = new Set(selectedPropertyIds);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const selectAll = (): void =>
    setSelectedPropertyIds(availableProperties.map((property) => property.id));
  const clearAll = (): void => setSelectedPropertyIds([]);
  const toggleProperty = (propertyId: string, checked: boolean): void => {
    setSelectedPropertyIds((current) => {
      if (checked) return current.includes(propertyId) ? current : [...current, propertyId];
      return current.filter((id) => id !== propertyId);
    });
  };
  const copySelectedPreview = async (): Promise<void> => {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus('error');
      return;
    }
    try {
      await navigator.clipboard.writeText(projectedJson);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

  return (
    <section
      className="rounded-lg border p-3"
      aria-label="Context pack fields"
      data-testid="database-context-field-controls"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">
            <Trans>Fields in preview</Trans>
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans>
              Choose only the properties needed for a compact local preview. The captured pack is
              unchanged.
            </Trans>
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="link-muted" size="xs" onClick={selectAll}>
            <Trans>All</Trans>
          </Button>
          <Button type="button" variant="link-muted" size="xs" onClick={clearAll}>
            <Trans>None</Trans>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-label="Copy selected context"
            onClick={() => void copySelectedPreview()}
          >
            {copyStatus === 'copied' ? (
              <Check aria-hidden="true" />
            ) : (
              <Clipboard aria-hidden="true" />
            )}
            {copyStatus === 'copied' ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
          </Button>
        </div>
      </div>
      {availableProperties.length > 0 ? (
        <fieldset className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Context pack fields">
          {availableProperties.map((property) => (
            <div
              key={property.id}
              className="flex items-center gap-2 text-xs"
              data-property-id={property.id}
              data-database-machine-object="property"
            >
              <Checkbox
                checked={selectedSet.has(property.id)}
                onCheckedChange={(checked) => toggleProperty(property.id, checked === true)}
                aria-label={`Include ${property.name}`}
                data-testid={`database-context-field-${property.id}`}
              />
              <span className="min-w-0 truncate">{property.name}</span>
            </div>
          ))}
        </fieldset>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          <Trans>This pack did not include property metadata.</Trans>
        </p>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <Trans>
            {selectedPropertyIds.length} of {availableProperties.length} fields selected
          </Trans>
        </span>
        <span className="font-mono">≈ {estimatedPreviewTokens.toLocaleString()} tokens</span>
      </div>
      {copyStatus === 'error' ? (
        <p className="mt-2 text-destructive text-xs" role="alert">
          <Trans>Clipboard is unavailable. Select the preview and copy it manually.</Trans>
        </p>
      ) : null}
      <details className="mt-3 rounded-md border bg-muted/20">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
          <Trans>Selected field preview</Trans>
        </summary>
        <pre
          className="max-h-80 overflow-auto border-t p-3 text-[11px] leading-relaxed"
          data-testid="database-context-selected-preview"
        >
          {projectedJson}
        </pre>
      </details>
    </section>
  );
}

export function DatabaseContextInspectorBody({
  inspections,
  selected,
  scope,
  status,
  error,
  onSelect,
  onRetry,
}: {
  inspections: readonly DatabaseContextInspectionSummary[];
  selected: DatabaseContextInspection | null;
  scope?: DatabaseContextInspectionScope;
  status: InspectorStatus;
  error: string | null;
  onSelect: (packId: string) => void;
  onRetry: () => void;
}): React.JSX.Element {
  if (status === 'loading' && inspections.length === 0) {
    return (
      <div className="flex min-h-80 items-center justify-center" role="status" aria-busy="true">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        <Trans>Loading agent context</Trans>
      </div>
    );
  }
  if (status === 'error' && inspections.length === 0) {
    return (
      <div
        className="flex min-h-80 flex-col items-center justify-center gap-3 text-center"
        role="alert"
      >
        <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
        <p className="font-medium">
          <Trans>Could not load agent context</Trans>
        </p>
        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  if (inspections.length === 0) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-2 text-center">
        <Braces className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">
          <Trans>No Context Packs yet</Trans>
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          <Trans>Run an agent database Context Pack request, then reopen this inspector.</Trans>
        </p>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)] gap-4">
      <nav className="min-h-0 overflow-y-auto rounded-lg border" aria-label="Context Packs">
        {inspections.map((inspection) => {
          const active = selected?.packId === inspection.packId;
          return (
            <Button
              key={inspection.packId}
              type="button"
              variant="ghost"
              className={cn(
                'h-auto w-full items-start gap-2 rounded-none border-b px-3 py-3 text-left font-normal last:border-b-0 hover:bg-muted/50',
                active && 'bg-muted',
              )}
              onClick={() => onSelect(inspection.packId)}
              aria-current={active ? 'true' : undefined}
              data-pack-id={inspection.packId}
              data-database-machine-object="context-pack"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{inspection.goal}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(inspection.capturedAt).toLocaleString()} ·{' '}
                  {inspection.tokenCount.estimated.toLocaleString()} tokens ·{' '}
                  <Plural value={inspection.returned} one="# record" other="# records" />
                </div>
              </div>
              <ChevronRight
                className="mt-1 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Button>
          );
        })}
      </nav>

      <section className="min-h-0 overflow-y-auto pr-1" aria-live="polite">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {status === 'loading' ? (
              <Trans>Loading exact Context Pack</Trans>
            ) : (
              <Trans>Select a Context Pack</Trans>
            )}
          </div>
        ) : (
          <div className="space-y-5" data-testid="database-context-inspection-detail">
            <div>
              <h3 className="text-base font-medium">{selected.goal}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                <Trans>Captured Context Pack</Trans> ·{' '}
                {new Date(selected.capturedAt).toLocaleString()}
              </p>
              <DatabaseMachineIdsDetails
                className="mt-3"
                entries={[
                  { kind: 'pack', label: <Trans>Context pack</Trans>, value: selected.packId },
                  {
                    kind: 'database',
                    label: <Trans>Database</Trans>,
                    value: selected.database.id,
                  },
                  { kind: 'source', label: <Trans>Source</Trans>, value: selected.sourceId },
                  {
                    kind: 'view',
                    label: <Trans>Agent view</Trans>,
                    value: selected.agentView?.id,
                  },
                ]}
              />
            </div>

            <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Metric
                label={<Trans>Estimated tokens</Trans>}
                value={selected.tokenCount.estimated.toLocaleString()}
              />
              <Metric
                label={<Trans>Available tokens</Trans>}
                value={selected.tokenCount.available.toLocaleString()}
              />
              <Metric label={<Trans>Redactions</Trans>} value={totalRedactions(selected)} />
              <Metric label={<Trans>Omissions</Trans>} value={totalOmissions(selected)} />
            </dl>

            <section
              className="rounded-lg border p-3"
              aria-label="Context pack summary"
              data-testid="database-context-summary"
            >
              <h4 className="text-sm font-medium">
                <Trans>Compact retrieval summary</Trans>
              </h4>
              <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">
                    <Trans>Schema</Trans>
                  </dt>
                  <dd className="mt-0.5">
                    {selected.exactPack.schema.properties.length} fields ·{' '}
                    {compactSchemaLabel(selected)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    <Trans>View</Trans>
                  </dt>
                  <dd className="mt-0.5">
                    {selected.agentView ? (
                      <Trans>Agent view</Trans>
                    ) : (
                      <Trans>Database default</Trans>
                    )}{' '}
                    · {selected.disclosure}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    <Trans>Selection</Trans>
                  </dt>
                  <dd className="mt-0.5">
                    {scopeRecordCount(scope) ?? selected.returned} records ·{' '}
                    {scopePropertyCount(scope) ?? selected.exactPack.schema.properties.length}{' '}
                    fields
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    <Trans>Token budget</Trans>
                  </dt>
                  <dd className="mt-0.5">
                    {selected.tokenCount.estimated.toLocaleString()} /{' '}
                    {selected.tokenCount.available.toLocaleString()} available · max{' '}
                    {selected.tokenCount.max.toLocaleString()} · reserve{' '}
                    {selected.tokenCount.reserve.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    <Trans>Truncation</Trans>
                  </dt>
                  <dd className="mt-0.5">
                    {selected.truncation.truncated ? (
                      <>
                        <Trans>Truncated</Trans> · {selected.truncation.cause ?? 'unknown'} ·{' '}
                        {selected.truncation.continuationAvailable ? (
                          <Trans>continuation available</Trans>
                        ) : (
                          <Trans>no continuation</Trans>
                        )}
                      </>
                    ) : (
                      <Trans>Complete</Trans>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    <Trans>Citations</Trans>
                  </dt>
                  <dd className="mt-0.5">
                    {citationLabels(selected).length} · {selected.disclosure}{' '}
                    <Trans>disclosure</Trans>
                  </dd>
                </div>
              </dl>
            </section>

            {selected.retrieval ? (
              <section
                className="rounded-lg border p-3"
                aria-label="Retrieval explainability"
                data-testid="database-retrieval-explainability"
              >
                <h4 className="text-sm font-medium">
                  <Trans>Retrieval explainability</Trans>
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  <Trans>
                    See the exact query, ranking, projection, permissions, and budget outcome used
                    for this Context Pack.
                  </Trans>
                </p>
                <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">
                      <Trans>Query</Trans>
                    </dt>
                    <dd className="mt-0.5">
                      {selected.retrieval.evidence.mode === 'evidence' ? (
                        <>
                          <Trans>Text search</Trans> “{selected.retrieval.evidence.searchText}” ·{' '}
                          {selected.retrieval.evidence.matched} matches
                        </>
                      ) : (
                        <>
                          <Trans>Structured query</Trans> ·{' '}
                          {selected.retrieval.query.includeArchived ? (
                            <Trans>archived records included</Trans>
                          ) : (
                            <Trans>active records only</Trans>
                          )}
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      <Trans>Filters</Trans>
                    </dt>
                    <dd className="mt-0.5">
                      {selected.retrieval.filters.propertyIds.length > 0 ? (
                        <Trans>{selected.retrieval.filters.propertyIds.length} filter fields</Trans>
                      ) : (
                        <Trans>No filters</Trans>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      <Trans>Ranking</Trans>
                    </dt>
                    <dd className="mt-0.5">
                      <Trans>
                        Typed sort · {selected.retrieval.ranking.sort.length} sort keys · record ID
                        tie-breaker
                      </Trans>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      <Trans>Results</Trans>
                    </dt>
                    <dd className="mt-0.5">
                      {selected.retrieval.result.matched} matched ·{' '}
                      {selected.retrieval.result.returned} returned ·{' '}
                      {selected.retrieval.result.omittedRecords} omitted ·{' '}
                      {selected.retrieval.result.complete ? (
                        <Trans>complete</Trans>
                      ) : (
                        <Trans>continuation available</Trans>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      <Trans>Fields</Trans>
                    </dt>
                    <dd className="mt-0.5">
                      {selected.retrieval.projection.requestedPropertyIds.length} requested ·{' '}
                      {selected.retrieval.projection.returnedPropertyIds.length} returned ·{' '}
                      {selected.retrieval.projection.omittedPropertyIds.length} omitted
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      <Trans>Permissions</Trans>
                    </dt>
                    <dd className="mt-0.5">
                      {selected.retrieval.permission ? (
                        <>
                          {selected.retrieval.permission.records} records ·{' '}
                          {selected.retrieval.permission.properties} properties filtered
                        </>
                      ) : (
                        <Trans>No permission exclusions</Trans>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      <Trans>Token budget</Trans>
                    </dt>
                    <dd className="mt-0.5">
                      {selected.tokenCount.estimated.toLocaleString()} /{' '}
                      {selected.tokenCount.available.toLocaleString()} available
                    </dd>
                  </div>
                </dl>
                <details className="mt-3 rounded-md border bg-muted/20">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                    <Trans>Show retrieval details</Trans>
                  </summary>
                  <pre className="max-h-80 overflow-auto border-t p-3 text-[11px] leading-relaxed">
                    {JSON.stringify(selected.retrieval, null, 2)}
                  </pre>
                </details>
              </section>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-lg border p-3">
                <h4 className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  <Trans>Permission redactions</Trans>
                </h4>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <dt className="text-muted-foreground">
                    <Trans>Root records</Trans>
                  </dt>
                  <dd>{selected.redactions.rootRecords}</dd>
                  <dt className="text-muted-foreground">
                    <Trans>Root properties</Trans>
                  </dt>
                  <dd>{selected.redactions.rootProperties}</dd>
                  <dt className="text-muted-foreground">
                    <Trans>Related records</Trans>
                  </dt>
                  <dd>{selected.redactions.relationRecords}</dd>
                  <dt className="text-muted-foreground">
                    <Trans>Related properties</Trans>
                  </dt>
                  <dd>{selected.redactions.relationProperties}</dd>
                </dl>
              </section>
              <section className="rounded-lg border p-3">
                <h4 className="text-sm font-medium">
                  <Trans>Freshness and truncation</Trans>
                </h4>
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
                  <dt className="text-muted-foreground">
                    <Trans>Index</Trans>
                  </dt>
                  <dd className="truncate font-mono">{selected.freshness.indexRevision}</dd>
                  <dt className="text-muted-foreground">
                    <Trans>State</Trans>
                  </dt>
                  <dd>
                    {selected.freshness.indexState ?? <Trans>Unknown</Trans>} ·{' '}
                    {selected.freshness.indexFreshness}
                  </dd>
                  <dt className="text-muted-foreground">
                    <Trans>Truncated</Trans>
                  </dt>
                  <dd>
                    {selected.truncation.truncated ? selected.truncation.cause : <Trans>No</Trans>}
                  </dd>
                  <dt className="text-muted-foreground">
                    <Trans>Continuation</Trans>
                  </dt>
                  <dd>
                    {selected.truncation.continuationAvailable ? (
                      <Trans>Available</Trans>
                    ) : (
                      <Trans>None</Trans>
                    )}
                  </dd>
                </dl>
              </section>
            </div>

            <section className="rounded-lg border p-3">
              <h4 className="text-sm font-medium">
                <Trans>Omissions</Trans>
              </h4>
              <div className="mt-2 text-xs text-muted-foreground">
                <Trans>
                  {selected.omissions.records} records, {selected.omissions.evidence} evidence
                  excerpts, and {selected.omissions.fullBodies} full bodies omitted.
                </Trans>
              </div>
              <DatabaseMachineIdsDetails
                className="mt-3"
                testId="database-context-omitted-ids"
                entries={selected.omissions.propertyIds.map((propertyId) => ({
                  kind: 'omitted-property',
                  label: <Trans>Property</Trans>,
                  value: propertyId,
                }))}
              />
            </section>

            <section
              className="rounded-lg border p-3"
              aria-label="Citations"
              data-testid="database-context-citations"
            >
              <h4 className="text-sm font-medium">
                <Trans>Citations</Trans>
              </h4>
              {citationLabels(selected).length > 0 ? (
                <ul className="mt-2 space-y-1 font-mono text-xs">
                  {citationLabels(selected).map((citation) => (
                    <li key={citation} className="break-all">
                      {citation}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  <Trans>No extractive citations were included in this pack.</Trans>
                </p>
              )}
            </section>

            <ContextFieldControls key={selected.packId} selected={selected} />

            <details className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                <Trans>Exact Context Pack</Trans>
              </summary>
              <pre className="max-h-96 overflow-auto border-t bg-muted/30 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(selected.exactPack, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}

export function DatabaseContextInspectorDialog({
  open,
  onOpenChange,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope?: DatabaseContextInspectionScope;
}): React.JSX.Element {
  const [inspections, setInspections] = useState<DatabaseContextInspectionSummary[]>([]);
  const [selected, setSelected] = useState<DatabaseContextInspection | null>(null);
  const [status, setStatus] = useState<InspectorStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reloadEpoch, setReloadEpoch] = useState(0);

  useEffect(() => {
    if (!open) return;
    // Reading the retry epoch makes an explicit retry a new fetch lifecycle.
    void reloadEpoch;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    void fetchContextInspectionList(controller.signal, scope)
      .then(async (next) => {
        setInspections(next);
        if (next.length === 0) {
          setSelected(null);
          setStatus('success');
          return;
        }
        const detail = await fetchContextInspection(
          next[0]?.packId ?? '',
          controller.signal,
          scope,
        );
        setSelected(detail);
        setStatus('success');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      });
    return () => controller.abort();
  }, [open, reloadEpoch, scope]);

  const select = (packId: string): void => {
    setStatus('loading');
    setError(null);
    void fetchContextInspection(packId, undefined, scope)
      .then((inspection) => {
        setSelected(inspection);
        setStatus('success');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(48rem,calc(100dvh-2rem))] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>What the agent saw</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Inspect the exact in-memory Context Pack, token estimate, permission redactions,
              omissions, freshness, and truncation.
            </Trans>
            {scope ? (
              <DatabaseMachineIdsDetails
                className="mt-3"
                testId="database-context-inspector-scope"
                entries={[
                  { kind: 'database', label: <Trans>Database</Trans>, value: scope.databaseId },
                  { kind: 'source', label: <Trans>Source</Trans>, value: scope.sourceId },
                  { kind: 'view', label: <Trans>View</Trans>, value: scope.viewId },
                  { kind: 'record', label: <Trans>Record</Trans>, value: scope.recordId },
                  ...(scope.recordIds ?? []).map((recordId) => ({
                    kind: 'record-selection',
                    label: <Trans>Selected record</Trans>,
                    value: recordId,
                  })),
                  ...(scope.propertyIds ?? []).map((propertyId) => ({
                    kind: 'property-selection',
                    label: <Trans>Selected property</Trans>,
                    value: propertyId,
                  })),
                ]}
              />
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex min-h-0 overflow-hidden">
          <DatabaseContextInspectorBody
            inspections={inspections}
            selected={selected}
            scope={scope}
            status={status}
            error={error}
            onSelect={select}
            onRetry={() => setReloadEpoch((value) => value + 1)}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
