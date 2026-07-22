import { Trans } from '@lingui/react/macro';
import type {
  DatabaseDefinition,
  DatabaseFilter,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DatabaseBoard } from '@/components/DatabaseBoard';
import { DatabaseCalendar } from '@/components/DatabaseCalendar';
import { DatabaseChart } from '@/components/DatabaseChart';
import { DatabaseFeed } from '@/components/DatabaseFeed';
import { DatabaseGallery } from '@/components/DatabaseGallery';
import { DatabaseList } from '@/components/DatabaseList';
import { DatabaseMap } from '@/components/DatabaseMap';
import { DatabaseTimeline } from '@/components/DatabaseTimeline';
import { Button } from '@/components/ui/button';
import { queryDatabase } from '@/lib/database-query-client';
import { subscribeToDatabaseChanged } from '@/lib/documents-events';

type WidgetState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: DatabaseQueryResult };

function combineDashboardFilters(filters: readonly DatabaseFilter[]): DatabaseFilter | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return { and: [...filters] };
}

function recordTitle(source: DatabaseSource, record: ProjectedDatabaseRecord): string {
  const title = source.properties.find((property) => property.type === 'title');
  return title ? String(record.values[title.id] ?? 'Untitled') : 'Untitled';
}

function DashboardTableWidget({
  source,
  view,
  result,
  onOpen,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  result: DatabaseQueryResult;
  onOpen: (record: ProjectedDatabaseRecord) => void;
}) {
  const properties = view.projection.propertyIds
    .map((propertyId) => source.properties.find((property) => property.id === propertyId))
    .filter((property) => property !== undefined)
    .slice(0, 4);
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {properties.map((property) => (
              <th key={property.id} className="border-b px-2 py-1 text-left font-medium">
                {property.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.records.map((record) => (
            <tr key={record.id} className="hover:bg-muted/50">
              {properties.map((property, index) => (
                <td key={property.id} className="max-w-48 truncate border-b px-2 py-1.5">
                  {index === 0 ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto w-full justify-start truncate p-0 text-left"
                      onClick={() => onOpen(record)}
                    >
                      {String(record.values[property.id] ?? '—')}
                    </Button>
                  ) : typeof record.values[property.id] === 'object' ? (
                    JSON.stringify(record.values[property.id] ?? null)
                  ) : (
                    String(record.values[property.id] ?? '—')
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.records.length === 0 ? (
        <p className="p-6 text-center text-muted-foreground text-sm">No matching records</p>
      ) : null}
      {!result.isComplete ? (
        <p className="p-2 text-muted-foreground text-xs">
          Showing {result.returned.toLocaleString()} of {result.matched.toLocaleString()} matching
          records
        </p>
      ) : null}
    </div>
  );
}

function DashboardWidget({
  databaseId,
  database,
  view,
  title,
  filters,
  linkedFilters,
  refreshToken,
  selectedRecord,
  onSelect,
  onOpen,
}: {
  databaseId: string;
  database: DatabaseDefinition;
  view: DatabaseView;
  title?: string;
  filters: readonly DatabaseFilter[];
  linkedFilters: readonly DatabaseFilter[];
  refreshToken: number;
  selectedRecord?: ProjectedDatabaseRecord;
  onSelect: (record: ProjectedDatabaseRecord) => void;
  onOpen?: (record: ProjectedDatabaseRecord) => void;
}) {
  'use no memo';
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<WidgetState>({ status: 'loading' });
  const source = database.sources.find((candidate) => candidate.id === view.sourceId);
  const effectiveFilters = [...filters, ...linkedFilters];
  const requestKey = JSON.stringify({ filters: effectiveFilters, refreshToken });
  const sourceId = view.sourceId;

  useEffect(() => {
    void refresh;
    const parsedFilters = (JSON.parse(requestKey) as { filters: DatabaseFilter[] }).filters;
    const controller = new AbortController();
    setState({ status: 'loading' });
    void queryDatabase(
      {
        databaseId,
        sourceId,
        viewId: view.id,
        query: {
          sort: [],
          includeArchived: false,
          ...(parsedFilters.length > 0 ? { where: combineDashboardFilters(parsedFilters) } : {}),
          page: { limit: 100 },
        },
      },
      { signal: controller.signal },
    )
      .then((result) => setState({ status: 'ready', result }))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message: cause instanceof Error ? cause.message : 'Unable to load Dashboard widget',
          });
        }
      });
    return () => controller.abort();
  }, [databaseId, sourceId, view.id, requestKey, refresh]);

  const open = (record: ProjectedDatabaseRecord) => onSelect(record);
  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card"
      data-dashboard-widget-view={view.id}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h4 className="truncate font-medium text-sm">{title ?? view.name}</h4>
          <p className="truncate text-muted-foreground text-[11px]">
            {source?.name} · {view.layout.type}
          </p>
        </div>
        <div className="flex gap-1">
          {selectedRecord && onOpen ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Open selected ${source ? recordTitle(source, selectedRecord) : selectedRecord.id}`}
              onClick={() => onOpen(selectedRecord)}
            >
              <ExternalLink />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Refresh ${title ?? view.name}`}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {state.status === 'loading' ? (
          <div className="flex h-full min-h-24 items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading widget
          </div>
        ) : state.status === 'error' ? (
          <div className="flex gap-2 p-3 text-destructive text-sm" role="alert">
            <AlertCircle className="size-4 shrink-0" /> {state.message}
          </div>
        ) : !source ? null : view.layout.type === 'board' ? (
          <DatabaseBoard
            source={source}
            view={view}
            result={state.result}
            mutationLocked
            onOpen={open}
          />
        ) : view.layout.type === 'timeline' ? (
          <DatabaseTimeline
            source={source}
            view={view}
            result={state.result}
            mutationLocked
            onOpen={open}
          />
        ) : view.layout.type === 'calendar' ? (
          <DatabaseCalendar
            source={source}
            view={view}
            result={state.result}
            mutationLocked
            onOpen={open}
          />
        ) : view.layout.type === 'list' ? (
          <DatabaseList source={source} view={view} result={state.result} onOpen={open} />
        ) : view.layout.type === 'gallery' ? (
          <DatabaseGallery source={source} view={view} result={state.result} onOpen={open} />
        ) : view.layout.type === 'chart' ? (
          <DatabaseChart source={source} view={view} result={state.result} onOpen={open} />
        ) : view.layout.type === 'map' ? (
          <DatabaseMap source={source} view={view} result={state.result} onOpen={open} />
        ) : view.layout.type === 'feed' ? (
          <DatabaseFeed source={source} view={view} result={state.result} onOpen={open} />
        ) : (
          <DashboardTableWidget source={source} view={view} result={state.result} onOpen={open} />
        )}
      </div>
    </section>
  );
}

const WIDTH_CLASSES: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
} as const;
const HEIGHT_CLASSES = {
  small: 'md:min-h-56',
  medium: 'md:min-h-80',
  large: 'md:min-h-[28rem]',
} as const;

export function DatabaseDashboard({
  databaseId,
  database,
  view,
  onOpen,
}: {
  databaseId: string;
  database: DatabaseDefinition;
  view: DatabaseView;
  onOpen?: (record: ProjectedDatabaseRecord) => void;
}) {
  'use no memo';
  const [enabledFilters, setEnabledFilters] = useState<Set<string>>(
    () =>
      new Set(
        view.layout.type === 'dashboard'
          ? view.layout.configuration.globalFilters
              .filter((filter) => filter.enabledByDefault)
              .map((filter) => filter.id)
          : [],
      ),
  );
  const [selections, setSelections] = useState<Record<string, ProjectedDatabaseRecord>>({});
  const [refreshToken, setRefreshToken] = useState(0);
  useEffect(
    () =>
      subscribeToDatabaseChanged((payload) => {
        if (
          payload.scope === 'workspace' ||
          payload.databaseIds.includes(databaseId) ||
          payload.sourceIds.some((sourceId) =>
            database.sources.some((source) => source.id === sourceId),
          )
        ) {
          setRefreshToken((current) => current + 1);
        }
      }),
    [databaseId, database.sources],
  );
  if (view.layout.type !== 'dashboard') return null;
  const configuration = view.layout.configuration;

  return (
    <section className="space-y-3" aria-label={`${view.name} Dashboard`} data-database-dashboard>
      {configuration.globalFilters.length > 0 ? (
        <fieldset
          className="flex flex-wrap items-center gap-2 rounded border bg-muted/30 p-2"
          aria-label="Dashboard global filters"
        >
          <legend className="sr-only">Dashboard global filters</legend>
          <span className="text-muted-foreground text-xs" aria-hidden="true">
            <Trans>Global filters</Trans>
          </span>
          {configuration.globalFilters.map((filter) => {
            const enabled = enabledFilters.has(filter.id);
            return (
              <Button
                key={filter.id}
                type="button"
                size="sm"
                variant={enabled ? 'secondary' : 'outline'}
                aria-pressed={enabled}
                onClick={() =>
                  setEnabledFilters((current) => {
                    const next = new Set(current);
                    if (next.has(filter.id)) next.delete(filter.id);
                    else next.add(filter.id);
                    return next;
                  })
                }
              >
                {filter.name}
              </Button>
            );
          })}
        </fieldset>
      ) : null}
      {configuration.rows.map((row) => (
        <div
          key={row.id}
          className={`grid grid-cols-1 gap-3 md:grid-cols-4 ${HEIGHT_CLASSES[row.height]}`}
          data-dashboard-row={row.id}
        >
          {row.widgets.map((widget) => {
            const widgetView = database.views.find((candidate) => candidate.id === widget.viewId);
            if (!widgetView)
              return (
                <div
                  key={widget.id}
                  className="rounded border border-destructive/30 p-3 text-destructive text-sm"
                >
                  Missing widget view {widget.viewId}
                </div>
              );
            const filters = configuration.globalFilters.flatMap((filter) => {
              if (!enabledFilters.has(filter.id)) return [];
              const clause = filter.clauses.find(
                (candidate) => candidate.sourceId === widgetView.sourceId,
              );
              return clause ? [clause.where] : [];
            });
            const linkedFilters: DatabaseFilter[] = configuration.interactions.flatMap(
              (interaction) => {
                const selection = selections[interaction.sourceWidgetId];
                return interaction.targetWidgetId === widget.id && selection
                  ? [
                      {
                        propertyId: interaction.targetRelationPropertyId,
                        operator: 'contains' as const,
                        value: selection.id,
                      },
                    ]
                  : [];
              },
            );
            const selected = selections[widget.id];
            return (
              <div
                key={widget.id}
                className={WIDTH_CLASSES[widget.width]}
                data-dashboard-widget={widget.id}
              >
                <DashboardWidget
                  databaseId={databaseId}
                  database={database}
                  view={widgetView}
                  title={widget.title}
                  filters={filters}
                  linkedFilters={linkedFilters}
                  refreshToken={refreshToken}
                  selectedRecord={selected}
                  onSelect={(record) =>
                    setSelections((current) => ({ ...current, [widget.id]: record }))
                  }
                  onOpen={onOpen}
                />
              </div>
            );
          })}
        </div>
      ))}
      {configuration.interactions.some((interaction) => selections[interaction.sourceWidgetId]) ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setSelections({})}>
          <Trans>Clear linked selections</Trans>
        </Button>
      ) : null}
    </section>
  );
}
