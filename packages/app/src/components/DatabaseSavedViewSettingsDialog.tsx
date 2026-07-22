import { Trans } from '@lingui/react/macro';
import type {
  DatabaseBoardViewConfiguration,
  DatabaseCalendarViewConfiguration,
  DatabaseChartViewConfiguration,
  DatabaseConditionalColorRule,
  DatabaseDashboardViewConfiguration,
  DatabaseDefinition,
  DatabaseFeedViewConfiguration,
  DatabaseFormViewConfiguration,
  DatabaseGalleryViewConfiguration,
  DatabaseListViewConfiguration,
  DatabaseMapViewConfiguration,
  DatabaseSource,
  DatabaseTableViewConfiguration,
  DatabaseTimelineViewConfiguration,
  DatabaseView,
  DatabaseViewOpenBehavior,
} from '@nedian0brien/synapsenote-core';
import {
  DATABASE_CONDITIONAL_COLOR_NAMES,
  DatabaseViewSchema,
} from '@nedian0brien/synapsenote-core';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { DatabaseAdvancedFilterDialog } from '@/components/DatabaseAdvancedFilterDialog';
import { DatabaseDashboardSettings } from '@/components/DatabaseDashboardSettings';
import { DatabaseFeedSettings } from '@/components/DatabaseFeedSettings';
import { DatabaseFormSettings } from '@/components/DatabaseFormSettings';
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
import { databaseViewOpenBehavior } from '@/lib/database-navigation';

type ViewSort = DatabaseView['sort'][number];
type ViewGroup = DatabaseView['groups'][number];
type EditorSort = ViewSort & { editorId: string };
type EditorGroup = ViewGroup & { editorId: string };
type EditorConditionalColor = DatabaseConditionalColorRule & { editorId: string };

function conditionalColorSummary(rule: DatabaseConditionalColorRule, source: DatabaseSource) {
  const summarize = (filter: DatabaseConditionalColorRule['where']): string => {
    if ('and' in filter) return `AND(${filter.and.map(summarize).join(', ')})`;
    if ('or' in filter) return `OR(${filter.or.map(summarize).join(', ')})`;
    if ('not' in filter) return `NOT(${summarize(filter.not)})`;
    const property = source.properties.find((candidate) => candidate.id === filter.propertyId);
    return `${property?.name ?? filter.propertyId} ${filter.operator}${'value' in filter ? ` ${JSON.stringify(filter.value)}` : ''}`;
  };
  return summarize(rule.where);
}

function move<T>(values: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= values.length) return [...values];
  const next = [...values];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

export function DatabaseSavedViewSettingsDialog({
  open,
  onOpenChange,
  source,
  view,
  database,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DatabaseSource;
  view: DatabaseView;
  database?: DatabaseDefinition;
  onSave: (view: DatabaseView) => void;
}) {
  'use no memo';
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const nextEditorId = useRef(
    view.sort.length + view.groups.length + (view.conditionalColors?.length ?? 0),
  );
  const [sort, setSort] = useState<EditorSort[]>(() =>
    structuredClone(view.sort).map((item, index) => ({
      ...item,
      editorId: `${view.id}:sort:${index}`,
    })),
  );
  const [groups, setGroups] = useState<EditorGroup[]>(() =>
    structuredClone(view.groups).map((item, index) => ({
      ...item,
      editorId: `${view.id}:group:${index}`,
    })),
  );
  const [conditionalColors, setConditionalColors] = useState<EditorConditionalColor[]>(() =>
    structuredClone(view.conditionalColors ?? []).map((item, index) => ({
      ...item,
      editorId: `${view.id}:conditional-color:${index}`,
    })),
  );
  const [editingConditionalColor, setEditingConditionalColor] = useState<string | null>(null);
  const [propertyOrder, setPropertyOrder] = useState(() => {
    const order = [
      ...view.projection.propertyIds,
      ...source.properties
        .map((property) => property.id)
        .filter((propertyId) => !view.projection.propertyIds.includes(propertyId)),
    ];
    return titleProperty
      ? [titleProperty.id, ...order.filter((propertyId) => propertyId !== titleProperty.id)]
      : order;
  });
  const [visiblePropertyIds, setVisiblePropertyIds] = useState(() => [
    ...new Set([...(titleProperty ? [titleProperty.id] : []), ...view.projection.propertyIds]),
  ]);
  const [body, setBody] = useState(view.projection.body);
  const [openBehavior, setOpenBehavior] = useState<DatabaseViewOpenBehavior>(() =>
    databaseViewOpenBehavior(view),
  );
  const tableConfiguration: DatabaseTableViewConfiguration =
    view.layout.type === 'table' ? view.layout.configuration : {};
  const [wrap, setWrap] = useState(tableConfiguration.wrap ?? false);
  const [rowHeight, setRowHeight] = useState(tableConfiguration.rowHeight ?? 'standard');
  const [propertyWidths, setPropertyWidths] = useState<Record<string, number>>(() => ({
    ...(tableConfiguration.propertyWidths ?? {}),
  }));
  const boardConfiguration: DatabaseBoardViewConfiguration =
    view.layout.type === 'board'
      ? view.layout.configuration
      : {
          cardSize: 'medium',
          cardPreview: { type: 'none' },
          fitImage: false,
          colorColumns: true,
          groupLimit: 100,
          cardLimitPerGroup: 100,
        };
  const [boardCardSize, setBoardCardSize] = useState(boardConfiguration.cardSize);
  const [boardCardPreview, setBoardCardPreview] = useState(
    boardConfiguration.cardPreview.type === 'files'
      ? `files:${boardConfiguration.cardPreview.propertyId}`
      : 'none',
  );
  const [boardFitImage, setBoardFitImage] = useState(boardConfiguration.fitImage);
  const [boardColorColumns, setBoardColorColumns] = useState(boardConfiguration.colorColumns);
  const [boardGroupLimit, setBoardGroupLimit] = useState(boardConfiguration.groupLimit);
  const [boardCardLimit, setBoardCardLimit] = useState(boardConfiguration.cardLimitPerGroup);
  const firstDatePropertyId =
    source.properties.find((property) => property.type === 'date')?.id ?? '';
  const secondDatePropertyId =
    source.properties.find(
      (property) => property.type === 'date' && property.id !== firstDatePropertyId,
    )?.id ?? firstDatePropertyId;
  const timelineConfiguration: DatabaseTimelineViewConfiguration =
    view.layout.type === 'timeline'
      ? view.layout.configuration
      : {
          dateMapping: { type: 'range', propertyId: firstDatePropertyId },
          scale: 'week',
          showTable: true,
          showToday: true,
          showDependencies: true,
          noDateLane: true,
          loadLimit: 100,
        };
  const [timelineMappingType, setTimelineMappingType] = useState(
    timelineConfiguration.dateMapping.type,
  );
  const [timelineStartPropertyId, setTimelineStartPropertyId] = useState(
    timelineConfiguration.dateMapping.type === 'range'
      ? timelineConfiguration.dateMapping.propertyId
      : timelineConfiguration.dateMapping.startPropertyId,
  );
  const [timelineEndPropertyId, setTimelineEndPropertyId] = useState(
    timelineConfiguration.dateMapping.type === 'separate'
      ? timelineConfiguration.dateMapping.endPropertyId
      : secondDatePropertyId,
  );
  const [timelineScale, setTimelineScale] = useState(timelineConfiguration.scale);
  const [timelineShowTable, setTimelineShowTable] = useState(timelineConfiguration.showTable);
  const [timelineShowToday, setTimelineShowToday] = useState(timelineConfiguration.showToday);
  const [timelineShowDependencies, setTimelineShowDependencies] = useState(
    timelineConfiguration.showDependencies,
  );
  const [timelineDependencyPropertyId, setTimelineDependencyPropertyId] = useState(
    timelineConfiguration.dependencyPropertyId ?? 'none',
  );
  const [timelineNoDateLane, setTimelineNoDateLane] = useState(timelineConfiguration.noDateLane);
  const [timelineLoadLimit, setTimelineLoadLimit] = useState(timelineConfiguration.loadLimit);
  const calendarConfiguration: DatabaseCalendarViewConfiguration =
    view.layout.type === 'calendar'
      ? view.layout.configuration
      : {
          datePropertyId: firstDatePropertyId,
          display: 'month',
          weekStartsOn: 'monday',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          showWeekends: true,
          cardLimitPerDay: 10,
        };
  const [calendarDatePropertyId, setCalendarDatePropertyId] = useState(
    calendarConfiguration.datePropertyId,
  );
  const [calendarDisplay, setCalendarDisplay] = useState(calendarConfiguration.display);
  const [calendarWeekStartsOn, setCalendarWeekStartsOn] = useState(
    calendarConfiguration.weekStartsOn,
  );
  const [calendarTimeZone, setCalendarTimeZone] = useState(calendarConfiguration.timeZone);
  const [calendarShowWeekends, setCalendarShowWeekends] = useState(
    calendarConfiguration.showWeekends,
  );
  const [calendarCardLimit, setCalendarCardLimit] = useState(calendarConfiguration.cardLimitPerDay);
  const listConfiguration: DatabaseListViewConfiguration =
    view.layout.type === 'list'
      ? view.layout.configuration
      : {
          hierarchy: { type: 'flat' },
          density: 'compact',
          showSections: true,
          collapsibleSections: true,
          showDividers: true,
          loadLimit: 100,
        };
  const [listParentPropertyId, setListParentPropertyId] = useState(
    listConfiguration.hierarchy.type === 'parent_relation'
      ? listConfiguration.hierarchy.propertyId
      : 'none',
  );
  const [listDensity, setListDensity] = useState(listConfiguration.density);
  const [listShowSections, setListShowSections] = useState(listConfiguration.showSections);
  const [listCollapsibleSections, setListCollapsibleSections] = useState(
    listConfiguration.collapsibleSections,
  );
  const [listShowDividers, setListShowDividers] = useState(listConfiguration.showDividers);
  const [listLoadLimit, setListLoadLimit] = useState(listConfiguration.loadLimit);
  const galleryConfiguration: DatabaseGalleryViewConfiguration =
    view.layout.type === 'gallery'
      ? view.layout.configuration
      : {
          cardSize: 'medium',
          cardPreview: { type: 'none' },
          fitImage: false,
          showTitle: true,
          fallbackStyle: 'color',
          loadLimit: 100,
        };
  const [galleryCardSize, setGalleryCardSize] = useState(galleryConfiguration.cardSize);
  const [galleryCardPreview, setGalleryCardPreview] = useState(
    galleryConfiguration.cardPreview.type === 'files'
      ? `files:${galleryConfiguration.cardPreview.propertyId}`
      : 'none',
  );
  const [galleryFitImage, setGalleryFitImage] = useState(galleryConfiguration.fitImage);
  const [galleryShowTitle, setGalleryShowTitle] = useState(galleryConfiguration.showTitle);
  const [galleryFallbackStyle, setGalleryFallbackStyle] = useState(
    galleryConfiguration.fallbackStyle,
  );
  const [galleryLoadLimit, setGalleryLoadLimit] = useState(galleryConfiguration.loadLimit);
  const chartDimensionProperties = source.properties.filter(
    (property) => !['button', 'files', 'place', 'rollup'].includes(property.type),
  );
  const firstChartDimensionId = chartDimensionProperties[0]?.id ?? '';
  const chartConfiguration: DatabaseChartViewConfiguration =
    view.layout.type === 'chart'
      ? view.layout.configuration
      : {
          chartType: 'vertical_bar',
          dimension: { propertyId: firstChartDimensionId, arrayMode: 'each' },
          measure: { type: 'count' },
          showLegend: true,
          showLabels: false,
          showAxisNames: true,
          groupLimit: 200,
          loadLimit: 500,
        };
  const [chartType, setChartType] = useState(chartConfiguration.chartType);
  const [chartDimensionPropertyId, setChartDimensionPropertyId] = useState(
    chartConfiguration.dimension?.propertyId ?? firstChartDimensionId,
  );
  const [chartDimensionArrayMode, setChartDimensionArrayMode] = useState(
    chartConfiguration.dimension?.arrayMode ?? 'each',
  );
  const [chartSeriesPropertyId, setChartSeriesPropertyId] = useState(
    chartConfiguration.seriesPropertyId ?? 'none',
  );
  const [chartMeasurePropertyId, setChartMeasurePropertyId] = useState(
    chartConfiguration.measure.type === 'property' ? chartConfiguration.measure.propertyId : 'none',
  );
  const [chartMeasureFunction, setChartMeasureFunction] = useState(
    chartConfiguration.measure.type === 'property'
      ? chartConfiguration.measure.function
      : 'count_values',
  );
  const [chartShowLegend, setChartShowLegend] = useState(chartConfiguration.showLegend);
  const [chartShowLabels, setChartShowLabels] = useState(chartConfiguration.showLabels);
  const [chartShowAxisNames, setChartShowAxisNames] = useState(chartConfiguration.showAxisNames);
  const [chartGroupLimit, setChartGroupLimit] = useState(chartConfiguration.groupLimit);
  const [chartLoadLimit, setChartLoadLimit] = useState(chartConfiguration.loadLimit);
  const [formConfiguration, setFormConfiguration] = useState<DatabaseFormViewConfiguration>(() =>
    view.layout.type === 'form'
      ? structuredClone(view.layout.configuration)
      : {
          access: 'internal',
          title: view.name,
          questions: titleProperty
            ? [
                {
                  id: 'frmq_001_title',
                  propertyId: titleProperty.id,
                  label: titleProperty.name,
                  required: true,
                },
              ]
            : [],
          defaults: {},
          confirmation: {
            title: 'Response submitted',
            message: 'Your response has been saved.',
            allowAnotherResponse: true,
          },
          closedMessage: 'This form is no longer accepting responses.',
          fileUploads: { enabled: false, maxFilesPerQuestion: 5 },
          spamProtection: {
            honeypot: true,
            minimumCompletionSeconds: 2,
            rateLimit: { maxSubmissions: 10, windowSeconds: 60 },
          },
          duplicateSubmission: { type: 'allow' },
          retention: { type: 'workspace' },
        },
  );
  const firstPlacePropertyId =
    source.properties.find((property) => property.type === 'place')?.id ?? '';
  const mapConfiguration: DatabaseMapViewConfiguration =
    view.layout.type === 'map'
      ? view.layout.configuration
      : {
          placePropertyId: firstPlacePropertyId,
          basemap: 'local',
          clustering: true,
          clusterRadius: 48,
          showLabels: true,
          showMissingLocations: true,
          initialZoom: 2,
          loadLimit: 100,
        };
  const [mapPlacePropertyId, setMapPlacePropertyId] = useState(mapConfiguration.placePropertyId);
  const [mapBasemap, setMapBasemap] = useState(mapConfiguration.basemap);
  const [mapClustering, setMapClustering] = useState(mapConfiguration.clustering);
  const [mapClusterRadius, setMapClusterRadius] = useState(mapConfiguration.clusterRadius);
  const [mapShowLabels, setMapShowLabels] = useState(mapConfiguration.showLabels);
  const [mapShowMissingLocations, setMapShowMissingLocations] = useState(
    mapConfiguration.showMissingLocations,
  );
  const [mapInitialZoom, setMapInitialZoom] = useState(mapConfiguration.initialZoom);
  const [mapLoadLimit, setMapLoadLimit] = useState(mapConfiguration.loadLimit);
  const [feedConfiguration, setFeedConfiguration] = useState<DatabaseFeedViewConfiguration>(() => {
    if (view.layout.type === 'feed') return structuredClone(view.layout.configuration);
    const chronology = source.properties.find((property) =>
      ['last_edited_time', 'created_time', 'date'].includes(property.type),
    );
    return {
      chronologyPropertyId: chronology?.id ?? '',
      density: 'comfortable',
      showProperties: true,
      readTracking: 'session',
      loadLimit: 50,
    };
  });
  const [dashboardConfiguration, setDashboardConfiguration] =
    useState<DatabaseDashboardViewConfiguration>(() =>
      view.layout.type === 'dashboard'
        ? structuredClone(view.layout.configuration)
        : {
            rows: [],
            globalFilters: [],
            interactions: [],
          },
    );
  const selectedMapProperty = source.properties.find(
    (property) => property.id === mapPlacePropertyId,
  );
  const selectedMapAllowsExternalTiles =
    selectedMapProperty?.type === 'place' && selectedMapProperty.externalMap === 'explicit';
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    try {
      const projection = propertyOrder.filter((propertyId) =>
        visiblePropertyIds.includes(propertyId),
      );
      if (projection.length === 0) throw new Error('A saved view must show at least one property');
      const next = DatabaseViewSchema.parse({
        ...view,
        openBehavior,
        sort:
          view.layout.type === 'feed'
            ? [
                { propertyId: feedConfiguration.chronologyPropertyId, direction: 'desc' as const },
                ...sort
                  .map(({ editorId: _editorId, ...item }) => item)
                  .filter((item) => item.propertyId !== feedConfiguration.chronologyPropertyId),
              ]
            : sort.map(({ editorId: _editorId, ...item }) => item),
        groups: groups.map(({ editorId: _editorId, ...item }) => item),
        conditionalColors: conditionalColors.map(({ editorId: _editorId, ...item }) => item),
        projection: { propertyIds: projection, body },
        layout:
          view.layout.type === 'table'
            ? {
                type: 'table',
                configuration: {
                  wrap,
                  rowHeight,
                  propertyWidths: Object.fromEntries(
                    projection.flatMap((propertyId) => {
                      const width = propertyWidths[propertyId];
                      return width === undefined ? [] : [[propertyId, width]];
                    }),
                  ),
                },
              }
            : view.layout.type === 'board'
              ? {
                  type: 'board',
                  configuration: {
                    cardSize: boardCardSize,
                    cardPreview:
                      boardCardPreview === 'none'
                        ? { type: 'none' }
                        : {
                            type: 'files',
                            propertyId: boardCardPreview.slice('files:'.length),
                          },
                    fitImage: boardFitImage,
                    colorColumns: boardColorColumns,
                    groupLimit: boardGroupLimit,
                    cardLimitPerGroup: boardCardLimit,
                  },
                }
              : view.layout.type === 'timeline'
                ? {
                    type: 'timeline',
                    configuration: {
                      dateMapping:
                        timelineMappingType === 'range'
                          ? { type: 'range', propertyId: timelineStartPropertyId }
                          : {
                              type: 'separate',
                              startPropertyId: timelineStartPropertyId,
                              endPropertyId: timelineEndPropertyId,
                            },
                      scale: timelineScale,
                      showTable: timelineShowTable,
                      showToday: timelineShowToday,
                      showDependencies: timelineShowDependencies,
                      ...(timelineDependencyPropertyId === 'none'
                        ? {}
                        : { dependencyPropertyId: timelineDependencyPropertyId }),
                      noDateLane: timelineNoDateLane,
                      loadLimit: timelineLoadLimit,
                    },
                  }
                : view.layout.type === 'calendar'
                  ? {
                      type: 'calendar',
                      configuration: {
                        datePropertyId: calendarDatePropertyId,
                        display: calendarDisplay,
                        weekStartsOn: calendarWeekStartsOn,
                        timeZone: calendarTimeZone,
                        showWeekends: calendarShowWeekends,
                        cardLimitPerDay: calendarCardLimit,
                      },
                    }
                  : view.layout.type === 'list'
                    ? {
                        type: 'list',
                        configuration: {
                          hierarchy:
                            listParentPropertyId === 'none'
                              ? { type: 'flat' }
                              : { type: 'parent_relation', propertyId: listParentPropertyId },
                          density: listDensity,
                          showSections: listShowSections,
                          collapsibleSections: listCollapsibleSections,
                          showDividers: listShowDividers,
                          loadLimit: listLoadLimit,
                        },
                      }
                    : view.layout.type === 'gallery'
                      ? {
                          type: 'gallery',
                          configuration: {
                            cardSize: galleryCardSize,
                            cardPreview:
                              galleryCardPreview === 'none'
                                ? { type: 'none' }
                                : {
                                    type: 'files',
                                    propertyId: galleryCardPreview.slice('files:'.length),
                                  },
                            fitImage: galleryFitImage,
                            showTitle: galleryShowTitle,
                            fallbackStyle: galleryFallbackStyle,
                            loadLimit: galleryLoadLimit,
                          },
                        }
                      : view.layout.type === 'chart'
                        ? {
                            type: 'chart',
                            configuration: {
                              chartType,
                              ...(chartType === 'number'
                                ? {}
                                : {
                                    dimension: {
                                      propertyId: chartDimensionPropertyId,
                                      arrayMode: chartDimensionArrayMode,
                                    },
                                  }),
                              ...(chartType !== 'number' &&
                              chartType !== 'donut' &&
                              chartSeriesPropertyId !== 'none'
                                ? { seriesPropertyId: chartSeriesPropertyId }
                                : {}),
                              measure:
                                chartMeasurePropertyId === 'none'
                                  ? { type: 'count' }
                                  : {
                                      type: 'property',
                                      propertyId: chartMeasurePropertyId,
                                      function: chartMeasureFunction,
                                    },
                              showLegend: chartShowLegend,
                              showLabels: chartShowLabels,
                              showAxisNames: chartShowAxisNames,
                              groupLimit: chartGroupLimit,
                              loadLimit: chartLoadLimit,
                            },
                          }
                        : view.layout.type === 'form'
                          ? { type: 'form', configuration: formConfiguration }
                          : view.layout.type === 'map'
                            ? {
                                type: 'map',
                                configuration: {
                                  placePropertyId: mapPlacePropertyId,
                                  basemap: mapBasemap,
                                  clustering: mapClustering,
                                  clusterRadius: mapClusterRadius,
                                  showLabels: mapShowLabels,
                                  showMissingLocations: mapShowMissingLocations,
                                  initialZoom: mapInitialZoom,
                                  loadLimit: mapLoadLimit,
                                },
                              }
                            : view.layout.type === 'dashboard'
                              ? { type: 'dashboard', configuration: dashboardConfiguration }
                              : view.layout.type === 'feed'
                                ? { type: 'feed', configuration: feedConfiguration }
                                : view.layout,
      });
      onSave(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Saved view settings are invalid');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Saved view settings</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Persist query order, grouping, projection, and display settings in one reviewed view
              revision.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <section className="space-y-2" aria-label="Saved view page opening">
            <strong>
              <Trans>Open records in</Trans>
            </strong>
            <Select
              value={openBehavior}
              onValueChange={(value) => setOpenBehavior(value as DatabaseViewOpenBehavior)}
            >
              <SelectTrigger size="sm" aria-label="Open records in">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="side_peek">Side peek</SelectItem>
                <SelectItem value="center_peek">Center peek</SelectItem>
                <SelectItem value="full_page">Full page</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              This choice is stored on this stable saved view and applies to everyone using it.
            </p>
          </section>
          <section className="space-y-2" aria-label="Saved view sorts">
            <div className="flex items-center justify-between">
              <strong>
                <Trans>Sort</Trans>
              </strong>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSort((current) => [
                    ...current,
                    {
                      editorId: `${view.id}:sort:${nextEditorId.current++}`,
                      propertyId: source.properties[0]?.id ?? '',
                      direction: 'asc',
                    },
                  ])
                }
              >
                <Plus /> <Trans>Add sort</Trans>
              </Button>
            </div>
            {sort.map((item, index) => (
              <div key={item.editorId} className="flex gap-2">
                <Select
                  value={item.propertyId}
                  onValueChange={(propertyId) =>
                    setSort((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, propertyId } : candidate,
                      ),
                    )
                  }
                >
                  <SelectTrigger size="sm" aria-label={`Sort ${index + 1} property`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {source.properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={item.direction}
                  onValueChange={(direction) =>
                    setSort((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, direction: direction as 'asc' | 'desc' }
                          : candidate,
                      ),
                    )
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-28"
                    aria-label={`Sort ${index + 1} direction`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove sort ${index + 1}`}
                  onClick={() =>
                    setSort((current) =>
                      current.filter((_, candidateIndex) => candidateIndex !== index),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </section>

          <section className="space-y-2" aria-label="Saved view groups">
            <div className="flex items-center justify-between">
              <strong>
                <Trans>Group and subgroup</Trans>
              </strong>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={groups.length >= 2}
                onClick={() =>
                  setGroups((current) => [
                    ...current,
                    {
                      editorId: `${view.id}:group:${nextEditorId.current++}`,
                      propertyId: source.properties[0]?.id ?? '',
                      direction: 'asc',
                      hideEmpty: false,
                    },
                  ])
                }
              >
                <Plus /> <Trans>Add group</Trans>
              </Button>
            </div>
            {groups.map((item, index) => (
              <div key={item.editorId} className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-muted-foreground text-xs">
                  {index === 0 ? 'Group' : 'Subgroup'}
                </span>
                <Select
                  value={item.propertyId}
                  onValueChange={(propertyId) =>
                    setGroups((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, propertyId } : candidate,
                      ),
                    )
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`${index === 0 ? 'Group' : 'Subgroup'} property`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {source.properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={item.direction}
                  onValueChange={(direction) =>
                    setGroups((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, direction: direction as 'asc' | 'desc' }
                          : candidate,
                      ),
                    )
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-28"
                    aria-label={`${index === 0 ? 'Group' : 'Subgroup'} direction`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={item.hideEmpty}
                    aria-label={`${index === 0 ? 'Group' : 'Subgroup'} hides empty values`}
                    onCheckedChange={(checked) =>
                      setGroups((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? { ...candidate, hideEmpty: checked === true }
                            : candidate,
                        ),
                      )
                    }
                  />{' '}
                  <Trans>Hide empty</Trans>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${index === 0 ? 'group' : 'subgroup'}`}
                  onClick={() =>
                    setGroups((current) =>
                      current.filter((_, candidateIndex) => candidateIndex !== index),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </section>

          <section className="space-y-2" aria-label="Saved view property projection">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>
                <Trans>Properties and order</Trans>
              </strong>
              <Select value={body} onValueChange={(value) => setBody(value as typeof body)}>
                <SelectTrigger size="sm" className="w-40" aria-label="Saved view body projection">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hidden">Body hidden</SelectItem>
                  <SelectItem value="preview">Body preview</SelectItem>
                  <SelectItem value="full">Body full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {propertyOrder.map((propertyId, index) => {
              const property = source.properties.find((candidate) => candidate.id === propertyId);
              if (!property) return null;
              const title = property.id === titleProperty?.id;
              return (
                <div
                  key={property.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded border p-2"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={visiblePropertyIds.includes(property.id)}
                      disabled={title}
                      aria-label={`Show ${property.name} in saved view`}
                      onCheckedChange={(checked) =>
                        setVisiblePropertyIds((current) =>
                          checked === true
                            ? [...new Set([...current, property.id])]
                            : current.filter((id) => id !== property.id),
                        )
                      }
                    />
                    <span>{property.name}</span>
                  </div>
                  <div className="flex">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={index === 0 || title}
                      aria-label={`Move ${property.name} up in saved view`}
                      onClick={() => setPropertyOrder((current) => move(current, index, -1))}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={
                        index === propertyOrder.length - 1 ||
                        titleProperty?.id === propertyOrder[index + 1]
                      }
                      aria-label={`Move ${property.name} down in saved view`}
                      onClick={() => setPropertyOrder((current) => move(current, index, 1))}
                    >
                      <ChevronDown />
                    </Button>
                  </div>
                  {view.layout.type === 'table' ? (
                    <Input
                      type="number"
                      min={120}
                      max={480}
                      step={20}
                      value={propertyWidths[property.id] ?? (title ? 280 : 180)}
                      aria-label={`Saved width for ${property.name}`}
                      onChange={(event) =>
                        setPropertyWidths((current) => ({
                          ...current,
                          [property.id]: Number(event.currentTarget.value),
                        }))
                      }
                    />
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </section>

          <section className="space-y-2" aria-label="Saved view conditional colors">
            <div className="flex items-center justify-between">
              <div>
                <strong>
                  <Trans>Conditional colors</Trans>
                </strong>
                <p className="text-muted-foreground text-xs">
                  <Trans>Rules are evaluated in order; the first match for each target wins.</Trans>
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={conditionalColors.length >= 100 || source.properties.length === 0}
                onClick={() => {
                  const property = source.properties[0];
                  if (!property) return;
                  const serial = nextEditorId.current++;
                  setConditionalColors((current) => [
                    ...current,
                    {
                      editorId: `${view.id}:conditional-color:${serial}`,
                      id: `ccr_${view.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}_${serial}`,
                      key: `color-rule-${serial + 1}`,
                      name: `Color rule ${serial + 1}`,
                      color: 'yellow',
                      where: { propertyId: property.id, operator: 'is_not_empty' },
                      applyTo: { type: 'page' },
                    },
                  ]);
                }}
              >
                <Plus /> <Trans>Add color rule</Trans>
              </Button>
            </div>
            {conditionalColors.map((rule, index) => (
              <div key={rule.editorId} className="space-y-2 rounded border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-44 flex-1"
                    aria-label={`Conditional color ${index + 1} name`}
                    value={rule.name}
                    onChange={(event) =>
                      setConditionalColors((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? { ...candidate, name: event.currentTarget.value }
                            : candidate,
                        ),
                      )
                    }
                  />
                  <Select
                    value={rule.color}
                    onValueChange={(color) =>
                      setConditionalColors((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                color: color as DatabaseConditionalColorRule['color'],
                              }
                            : candidate,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-28"
                      aria-label={`Conditional color ${index + 1} color`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATABASE_CONDITIONAL_COLOR_NAMES.map((color) => (
                        <SelectItem key={color} value={color}>
                          {color}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={
                      rule.applyTo.type === 'page' ? 'page' : `property:${rule.applyTo.propertyId}`
                    }
                    onValueChange={(target) =>
                      setConditionalColors((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                applyTo:
                                  target === 'page'
                                    ? { type: 'page' }
                                    : {
                                        type: 'property',
                                        propertyId: target.slice('property:'.length),
                                      },
                              }
                            : candidate,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="min-w-40"
                      aria-label={`Conditional color ${index + 1} target`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="page">Entire page / row</SelectItem>
                      {source.properties.map((property) => (
                        <SelectItem key={property.id} value={`property:${property.id}`}>
                          {property.name} property
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={index === 0}
                      aria-label={`Move conditional color ${index + 1} up`}
                      onClick={() => setConditionalColors((current) => move(current, index, -1))}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={index === conditionalColors.length - 1}
                      aria-label={`Move conditional color ${index + 1} down`}
                      onClick={() => setConditionalColors((current) => move(current, index, 1))}
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove conditional color ${index + 1}`}
                      onClick={() =>
                        setConditionalColors((current) =>
                          current.filter((_, candidateIndex) => candidateIndex !== index),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <code className="truncate" title={conditionalColorSummary(rule, source)}>
                    {conditionalColorSummary(rule, source)}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Edit conditional color ${index + 1} condition`}
                    onClick={() => setEditingConditionalColor(rule.editorId)}
                  >
                    <Trans>Edit condition</Trans>
                  </Button>
                </div>
              </div>
            ))}
          </section>

          {view.layout.type === 'table' ? (
            <section
              className="flex flex-wrap items-center gap-3"
              aria-label="Saved Table display settings"
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={wrap}
                  aria-label="Wrap saved view cells"
                  onCheckedChange={(checked) => setWrap(checked === true)}
                />
                <Trans>Wrap cells</Trans>
              </div>
              <Select
                value={rowHeight}
                onValueChange={(value) => setRowHeight(value as typeof rowHeight)}
              >
                <SelectTrigger size="sm" className="w-36" aria-label="Saved view row height">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="tall">Tall</SelectItem>
                </SelectContent>
              </Select>
            </section>
          ) : null}
          {view.layout.type === 'board' ? (
            <section className="space-y-3" aria-label="Saved Board display settings">
              <strong>
                <Trans>Board cards and limits</Trans>
              </strong>
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={boardCardSize}
                  onValueChange={(value) => setBoardCardSize(value as typeof boardCardSize)}
                >
                  <SelectTrigger size="sm" className="w-36" aria-label="Board card size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small cards</SelectItem>
                    <SelectItem value="medium">Medium cards</SelectItem>
                    <SelectItem value="large">Large cards</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={boardCardPreview} onValueChange={setBoardCardPreview}>
                  <SelectTrigger size="sm" className="min-w-44" aria-label="Board card preview">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No card cover</SelectItem>
                    {source.properties
                      .filter((property) => property.type === 'files')
                      .map((property) => (
                        <SelectItem key={property.id} value={`files:${property.id}`}>
                          {property.name} cover
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={boardFitImage}
                    disabled={boardCardPreview === 'none'}
                    aria-label="Fit Board card cover"
                    onCheckedChange={(checked) => setBoardFitImage(checked === true)}
                  />
                  <Trans>Fit cover</Trans>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={boardColorColumns}
                    aria-label="Color Board columns"
                    onCheckedChange={(checked) => setBoardColorColumns(checked === true)}
                  />
                  <Trans>Color columns</Trans>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label htmlFor="board-group-limit" className="space-y-1 text-xs">
                  <span>Maximum groups</span>
                  <Input
                    id="board-group-limit"
                    type="number"
                    min={1}
                    max={500}
                    value={boardGroupLimit}
                    aria-label="Board group limit"
                    onChange={(event) => setBoardGroupLimit(Number(event.currentTarget.value))}
                  />
                </label>
                <label htmlFor="board-card-limit" className="space-y-1 text-xs">
                  <span>Cards shown per group</span>
                  <Input
                    id="board-card-limit"
                    type="number"
                    min={1}
                    max={500}
                    value={boardCardLimit}
                    aria-label="Board cards per group limit"
                    onChange={(event) => setBoardCardLimit(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
            </section>
          ) : null}
          {view.layout.type === 'timeline' ? (
            <section className="space-y-3" aria-label="Saved Timeline display settings">
              <strong>
                <Trans>Timeline dates and display</Trans>
              </strong>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select
                  value={timelineMappingType}
                  onValueChange={(value) =>
                    setTimelineMappingType(value as typeof timelineMappingType)
                  }
                >
                  <SelectTrigger size="sm" aria-label="Timeline date mapping type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="range">One Date or range</SelectItem>
                    <SelectItem
                      value="separate"
                      disabled={
                        source.properties.filter((property) => property.type === 'date').length < 2
                      }
                    >
                      Separate start and end
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select value={timelineStartPropertyId} onValueChange={setTimelineStartPropertyId}>
                  <SelectTrigger size="sm" aria-label="Timeline start Date property">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {source.properties
                      .filter((property) => property.type === 'date')
                      .map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {timelineMappingType === 'separate' ? (
                  <Select value={timelineEndPropertyId} onValueChange={setTimelineEndPropertyId}>
                    <SelectTrigger size="sm" aria-label="Timeline end Date property">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {source.properties
                        .filter(
                          (property) =>
                            property.type === 'date' && property.id !== timelineStartPropertyId,
                        )
                        .map((property) => (
                          <SelectItem key={property.id} value={property.id}>
                            {property.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Select
                  value={timelineScale}
                  onValueChange={(value) => setTimelineScale(value as typeof timelineScale)}
                >
                  <SelectTrigger size="sm" aria-label="Timeline scale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour">Hours</SelectItem>
                    <SelectItem value="day">Days</SelectItem>
                    <SelectItem value="week">Weeks</SelectItem>
                    <SelectItem value="month">Months</SelectItem>
                    <SelectItem value="quarter">Quarters</SelectItem>
                    <SelectItem value="year">Years</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={timelineDependencyPropertyId}
                  onValueChange={setTimelineDependencyPropertyId}
                >
                  <SelectTrigger size="sm" aria-label="Timeline dependency Relation property">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No dependencies</SelectItem>
                    {source.properties
                      .filter(
                        (property) =>
                          property.type === 'relation' && property.targetSourceId === source.id,
                      )
                      .map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <label htmlFor="timeline-load-limit" className="space-y-1 text-xs">
                  <span>Load limit</span>
                  <Input
                    id="timeline-load-limit"
                    type="number"
                    min={1}
                    max={500}
                    value={timelineLoadLimit}
                    aria-label="Timeline load limit"
                    onChange={(event) => setTimelineLoadLimit(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {[
                  ['Show table', timelineShowTable, setTimelineShowTable, 'Timeline shows table'],
                  ['Show today', timelineShowToday, setTimelineShowToday, 'Timeline shows today'],
                  [
                    'Show dependencies',
                    timelineShowDependencies,
                    setTimelineShowDependencies,
                    'Timeline shows dependencies',
                  ],
                  [
                    'No-date lane',
                    timelineNoDateLane,
                    setTimelineNoDateLane,
                    'Timeline shows no-date lane',
                  ],
                ].map(([label, checked, setter, ariaLabel]) => (
                  <div key={String(label)} className="flex items-center gap-2">
                    <Checkbox
                      checked={checked as boolean}
                      aria-label={ariaLabel as string}
                      onCheckedChange={(value) =>
                        (setter as (next: boolean) => void)(value === true)
                      }
                    />
                    {label as string}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {view.layout.type === 'calendar' ? (
            <section className="space-y-3" aria-label="Saved Calendar display settings">
              <strong>
                <Trans>Calendar dates and display</Trans>
              </strong>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select value={calendarDatePropertyId} onValueChange={setCalendarDatePropertyId}>
                  <SelectTrigger size="sm" aria-label="Calendar Date property">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {source.properties
                      .filter((property) => property.type === 'date')
                      .map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={calendarDisplay}
                  onValueChange={(value) => setCalendarDisplay(value as typeof calendarDisplay)}
                >
                  <SelectTrigger size="sm" aria-label="Calendar display range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={calendarWeekStartsOn}
                  onValueChange={(value) =>
                    setCalendarWeekStartsOn(value as typeof calendarWeekStartsOn)
                  }
                >
                  <SelectTrigger size="sm" aria-label="Calendar week starts on">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monday">Monday</SelectItem>
                    <SelectItem value="sunday">Sunday</SelectItem>
                  </SelectContent>
                </Select>
                <label htmlFor="calendar-time-zone" className="space-y-1 text-xs">
                  <span>Time zone</span>
                  <Input
                    id="calendar-time-zone"
                    value={calendarTimeZone}
                    aria-label="Calendar time zone"
                    onChange={(event) => setCalendarTimeZone(event.currentTarget.value)}
                  />
                </label>
                <label htmlFor="calendar-card-limit" className="space-y-1 text-xs">
                  <span>Cards shown per day</span>
                  <Input
                    id="calendar-card-limit"
                    type="number"
                    min={1}
                    max={100}
                    value={calendarCardLimit}
                    aria-label="Calendar cards per day limit"
                    onChange={(event) => setCalendarCardLimit(Number(event.currentTarget.value))}
                  />
                </label>
                <div className="flex items-center gap-2 self-end pb-2 text-sm">
                  <Checkbox
                    checked={calendarShowWeekends}
                    aria-label="Calendar shows weekends"
                    onCheckedChange={(checked) => setCalendarShowWeekends(checked === true)}
                  />
                  <Trans>Show weekends</Trans>
                </div>
              </div>
            </section>
          ) : null}
          {view.layout.type === 'list' ? (
            <section className="space-y-3" aria-label="Saved List display settings">
              <strong>
                <Trans>List hierarchy and display</Trans>
              </strong>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select value={listParentPropertyId} onValueChange={setListParentPropertyId}>
                  <SelectTrigger size="sm" aria-label="List parent Relation property">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Flat list</SelectItem>
                    {source.properties
                      .filter(
                        (property) =>
                          property.type === 'relation' && property.targetSourceId === source.id,
                      )
                      .map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name} hierarchy
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={listDensity}
                  onValueChange={(value) => setListDensity(value as typeof listDensity)}
                >
                  <SelectTrigger size="sm" aria-label="List density">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                  </SelectContent>
                </Select>
                <label htmlFor="list-load-limit" className="space-y-1 text-xs">
                  <span>Load limit</span>
                  <Input
                    id="list-load-limit"
                    type="number"
                    min={1}
                    max={500}
                    value={listLoadLimit}
                    aria-label="List load limit"
                    onChange={(event) => setListLoadLimit(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {[
                  ['Group sections', listShowSections, setListShowSections],
                  ['Collapsible sections', listCollapsibleSections, setListCollapsibleSections],
                  ['Row dividers', listShowDividers, setListShowDividers],
                ].map(([label, checked, setter]) => (
                  <div key={String(label)} className="flex items-center gap-2">
                    <Checkbox
                      checked={checked as boolean}
                      aria-label={label as string}
                      onCheckedChange={(value) =>
                        (setter as (next: boolean) => void)(value === true)
                      }
                    />
                    {label as string}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {view.layout.type === 'form' ? (
            <DatabaseFormSettings
              source={source}
              value={formConfiguration}
              onChange={setFormConfiguration}
            />
          ) : null}
          {view.layout.type === 'map' ? (
            <section className="space-y-3" aria-label="Saved Map display settings">
              <strong>
                <Trans>Map locations and privacy</Trans>
              </strong>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select value={mapPlacePropertyId} onValueChange={setMapPlacePropertyId}>
                  <SelectTrigger size="sm" aria-label="Map Place property">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {source.properties
                      .filter((property) => property.type === 'place')
                      .map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={mapBasemap}
                  onValueChange={(value) => setMapBasemap(value as typeof mapBasemap)}
                >
                  <SelectTrigger size="sm" aria-label="Map basemap">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Private local map</SelectItem>
                    <SelectItem value="openstreetmap" disabled={!selectedMapAllowsExternalTiles}>
                      OpenStreetMap tiles
                    </SelectItem>
                  </SelectContent>
                </Select>
                <label htmlFor="map-initial-zoom" className="space-y-1 text-xs">
                  <span>Initial zoom</span>
                  <Input
                    id="map-initial-zoom"
                    type="number"
                    min={0}
                    max={18}
                    value={mapInitialZoom}
                    aria-label="Map initial zoom"
                    onChange={(event) => setMapInitialZoom(Number(event.currentTarget.value))}
                  />
                </label>
                <label htmlFor="map-cluster-radius" className="space-y-1 text-xs">
                  <span>Cluster radius</span>
                  <Input
                    id="map-cluster-radius"
                    type="number"
                    min={24}
                    max={120}
                    value={mapClusterRadius}
                    disabled={!mapClustering}
                    aria-label="Map cluster radius"
                    onChange={(event) => setMapClusterRadius(Number(event.currentTarget.value))}
                  />
                </label>
                <label htmlFor="map-load-limit" className="space-y-1 text-xs">
                  <span>Marker limit</span>
                  <Input
                    id="map-load-limit"
                    type="number"
                    min={1}
                    max={100}
                    value={mapLoadLimit}
                    aria-label="Map marker limit"
                    onChange={(event) => setMapLoadLimit(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
              <p className="text-muted-foreground text-xs">
                The local map makes no network requests. External tiles are available only when the
                selected Place property explicitly permits external maps.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                {[
                  ['Cluster nearby markers', mapClustering, setMapClustering],
                  ['Show marker labels', mapShowLabels, setMapShowLabels],
                  ['Show missing locations', mapShowMissingLocations, setMapShowMissingLocations],
                ].map(([label, checked, setter]) => (
                  <div key={String(label)} className="flex items-center gap-2">
                    <Checkbox
                      checked={checked as boolean}
                      aria-label={label as string}
                      onCheckedChange={(value) =>
                        (setter as (next: boolean) => void)(value === true)
                      }
                    />
                    {label as string}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {view.layout.type === 'dashboard' ? (
            <DatabaseDashboardSettings
              database={database ?? { sources: [source], views: [view] }}
              dashboardViewId={view.id}
              value={dashboardConfiguration}
              onChange={setDashboardConfiguration}
            />
          ) : null}
          {view.layout.type === 'feed' ? (
            <DatabaseFeedSettings
              source={source}
              value={feedConfiguration}
              onChange={setFeedConfiguration}
            />
          ) : null}
          {view.layout.type === 'chart' ? (
            <section className="space-y-3" aria-label="Saved Chart display settings">
              <strong>
                <Trans>Chart dimensions and measure</Trans>
              </strong>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select
                  value={chartType}
                  onValueChange={(value) => setChartType(value as typeof chartType)}
                >
                  <SelectTrigger size="sm" aria-label="Chart type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vertical_bar">Vertical bar</SelectItem>
                    <SelectItem value="horizontal_bar">Horizontal bar</SelectItem>
                    <SelectItem value="line">Line</SelectItem>
                    <SelectItem value="donut">Donut</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={chartDimensionPropertyId}
                  disabled={chartType === 'number'}
                  onValueChange={setChartDimensionPropertyId}
                >
                  <SelectTrigger size="sm" aria-label="Chart dimension">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {chartDimensionProperties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={chartSeriesPropertyId}
                  disabled={chartType === 'number' || chartType === 'donut'}
                  onValueChange={setChartSeriesPropertyId}
                >
                  <SelectTrigger size="sm" aria-label="Chart series dimension">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No series</SelectItem>
                    {chartDimensionProperties
                      .filter((property) => property.id !== chartDimensionPropertyId)
                      .map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={chartMeasurePropertyId}
                  onValueChange={(propertyId) => {
                    setChartMeasurePropertyId(propertyId);
                    const property = source.properties.find((item) => item.id === propertyId);
                    if (
                      property &&
                      property.type !== 'number' &&
                      !['count_values', 'count_unique'].includes(chartMeasureFunction)
                    ) {
                      setChartMeasureFunction('count_values');
                    }
                  }}
                >
                  <SelectTrigger size="sm" aria-label="Chart measure property">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Record count</SelectItem>
                    {source.properties
                      .filter((property) => property.type !== 'button')
                      .map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={chartMeasureFunction}
                  disabled={chartMeasurePropertyId === 'none'}
                  onValueChange={(value) =>
                    setChartMeasureFunction(value as typeof chartMeasureFunction)
                  }
                >
                  <SelectTrigger size="sm" aria-label="Chart aggregation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count_values">Count values</SelectItem>
                    <SelectItem value="count_unique">Count unique</SelectItem>
                    {source.properties.find((property) => property.id === chartMeasurePropertyId)
                      ?.type === 'number'
                      ? ['sum', 'average', 'median', 'min', 'max', 'range'].map((value) => (
                          <SelectItem key={value} value={value}>
                            {value[0]?.toUpperCase()}
                            {value.slice(1)}
                          </SelectItem>
                        ))
                      : null}
                  </SelectContent>
                </Select>
                <Select
                  value={chartDimensionArrayMode}
                  disabled={chartType === 'number'}
                  onValueChange={(value) =>
                    setChartDimensionArrayMode(value as typeof chartDimensionArrayMode)
                  }
                >
                  <SelectTrigger size="sm" aria-label="Chart multi-value grouping">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="each">Each value</SelectItem>
                    <SelectItem value="set">Whole set</SelectItem>
                  </SelectContent>
                </Select>
                <label htmlFor="chart-group-limit" className="space-y-1 text-xs">
                  <span>Group limit</span>
                  <Input
                    id="chart-group-limit"
                    type="number"
                    min={1}
                    max={200}
                    value={chartGroupLimit}
                    aria-label="Chart group limit"
                    onChange={(event) => setChartGroupLimit(Number(event.currentTarget.value))}
                  />
                </label>
                <label htmlFor="chart-load-limit" className="space-y-1 text-xs">
                  <span>Drill-through row limit</span>
                  <Input
                    id="chart-load-limit"
                    type="number"
                    min={1}
                    max={500}
                    value={chartLoadLimit}
                    aria-label="Chart drill-through row limit"
                    onChange={(event) => setChartLoadLimit(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {[
                  ['Legend', chartShowLegend, setChartShowLegend],
                  ['Value labels', chartShowLabels, setChartShowLabels],
                  ['Axis names', chartShowAxisNames, setChartShowAxisNames],
                ].map(([label, checked, setter]) => (
                  <div key={String(label)} className="flex items-center gap-2">
                    <Checkbox
                      checked={checked as boolean}
                      aria-label={`Show Chart ${String(label).toLowerCase()}`}
                      onCheckedChange={(value) =>
                        (setter as (next: boolean) => void)(value === true)
                      }
                    />
                    {label as string}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {view.layout.type === 'gallery' ? (
            <section className="space-y-3" aria-label="Saved Gallery display settings">
              <strong>
                <Trans>Gallery cards and media</Trans>
              </strong>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select
                  value={galleryCardSize}
                  onValueChange={(value) => setGalleryCardSize(value as typeof galleryCardSize)}
                >
                  <SelectTrigger size="sm" aria-label="Gallery card size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small cards</SelectItem>
                    <SelectItem value="medium">Medium cards</SelectItem>
                    <SelectItem value="large">Large cards</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={galleryCardPreview} onValueChange={setGalleryCardPreview}>
                  <SelectTrigger size="sm" aria-label="Gallery card preview">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No media property</SelectItem>
                    {source.properties
                      .filter((property) => property.type === 'files')
                      .map((property) => (
                        <SelectItem key={property.id} value={`files:${property.id}`}>
                          {property.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={galleryFallbackStyle}
                  onValueChange={(value) =>
                    setGalleryFallbackStyle(value as typeof galleryFallbackStyle)
                  }
                >
                  <SelectTrigger size="sm" aria-label="Gallery fallback art">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="color">Color fallback</SelectItem>
                    <SelectItem value="document">Document fallback</SelectItem>
                  </SelectContent>
                </Select>
                <label htmlFor="gallery-load-limit" className="space-y-1 text-xs">
                  <span>Load limit</span>
                  <Input
                    id="gallery-load-limit"
                    type="number"
                    min={1}
                    max={500}
                    value={galleryLoadLimit}
                    aria-label="Gallery load limit"
                    onChange={(event) => setGalleryLoadLimit(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={galleryFitImage}
                    disabled={galleryCardPreview === 'none'}
                    aria-label="Fit Gallery image"
                    onCheckedChange={(checked) => setGalleryFitImage(checked === true)}
                  />
                  <Trans>Fit image</Trans>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={galleryShowTitle}
                    aria-label="Show Gallery title"
                    onCheckedChange={(checked) => setGalleryShowTitle(checked === true)}
                  />
                  <Trans>Show title</Trans>
                </div>
              </div>
            </section>
          ) : null}
          {editingConditionalColor ? (
            <DatabaseAdvancedFilterDialog
              open
              allowClear={false}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) setEditingConditionalColor(null);
              }}
              source={source}
              initialWhere={
                conditionalColors.find((rule) => rule.editorId === editingConditionalColor)?.where
              }
              onSave={(where) => {
                if (!where) return;
                setConditionalColors((current) =>
                  current.map((rule) =>
                    rule.editorId === editingConditionalColor ? { ...rule, where } : rule,
                  ),
                );
                setEditingConditionalColor(null);
              }}
            />
          ) : null}
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={save}>
              <Trans>Review view settings</Trans>
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
