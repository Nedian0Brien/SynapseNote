import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { DatabaseViewSchema } from '@nedian0brien/synapsenote-core';

function baseViewKey(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  if (!normalized) return 'view';
  return /^[a-z]/.test(normalized) ? normalized : `view-${normalized}`;
}

export function createUniqueDatabaseViewKey(
  name: string,
  existingKeys: ReadonlySet<string>,
): string {
  const base = baseViewKey(name).slice(0, 120).replaceAll(/-+$/g, '') || 'view';
  if (!existingKeys.has(base)) return base;
  for (let suffix = 2; suffix <= 9_999; suffix += 1) {
    const candidate = `${base.slice(0, 123 - String(suffix).length)}-${suffix}`;
    if (!existingKeys.has(candidate)) return candidate;
  }
  throw new Error('Unable to allocate a unique saved view key');
}

function createDatabaseViewId(uuid: string): string {
  const compact = uuid.replaceAll('-', '');
  return `view_${compact}`;
}

export function createDefaultDatabaseTableView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: { type: 'table', configuration: {} },
    sort: [],
    groups: [],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

export function defaultDatabaseBoardGroupProperty(source: DatabaseSource) {
  return (
    source.properties.find((property) => property.type === 'status') ??
    source.properties.find((property) =>
      ['select', 'multi_select', 'person', 'relation', 'checkbox'].includes(property.type),
    )
  );
}

export function createDefaultDatabaseBoardView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  const groupProperty = defaultDatabaseBoardGroupProperty(input.source);
  if (!groupProperty) {
    throw new Error(
      'A Board view requires a Status, Select, Multi-select, Person, Relation, or Checkbox property',
    );
  }
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: { type: 'board', configuration: {} },
    sort: [],
    groups: [{ propertyId: groupProperty.id, direction: 'asc', hideEmpty: false }],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

export function defaultDatabaseTimelineDateProperty(source: DatabaseSource) {
  return source.properties.find((property) => property.type === 'date');
}

export function createDefaultDatabaseTimelineView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  const dateProperty = defaultDatabaseTimelineDateProperty(input.source);
  if (!dateProperty) throw new Error('A Timeline view requires a Date property');
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: {
      type: 'timeline',
      configuration: {
        dateMapping: { type: 'range', propertyId: dateProperty.id },
      },
    },
    sort: [],
    groups: [],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

export function createDefaultDatabaseCalendarView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  const dateProperty = defaultDatabaseTimelineDateProperty(input.source);
  if (!dateProperty) throw new Error('A Calendar view requires a Date property');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: {
      type: 'calendar',
      configuration: { datePropertyId: dateProperty.id, timeZone },
    },
    sort: [],
    groups: [],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

export function createDefaultDatabaseListView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: { type: 'list', configuration: {} },
    sort: [],
    groups: [],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

export function createDefaultDatabaseGalleryView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  const previewProperty = input.source.properties.find((property) => property.type === 'files');
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: {
      type: 'gallery',
      configuration: {
        cardPreview: previewProperty
          ? { type: 'files', propertyId: previewProperty.id }
          : { type: 'none' },
      },
    },
    sort: [],
    groups: [],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

export function defaultDatabaseChartDimensionProperty(source: DatabaseSource) {
  return (
    source.properties.find((property) =>
      ['status', 'select', 'multi_select', 'checkbox', 'person', 'date'].includes(property.type),
    ) ??
    source.properties.find(
      (property) => !['button', 'files', 'place', 'rollup'].includes(property.type),
    )
  );
}

export function createDefaultDatabaseChartView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  const dimension = defaultDatabaseChartDimensionProperty(input.source);
  if (!dimension) throw new Error('A Chart view requires a supported dimension property');
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: {
      type: 'chart',
      configuration: {
        chartType: 'vertical_bar',
        dimension: { propertyId: dimension.id, arrayMode: 'each' },
        measure: { type: 'count' },
      },
    },
    sort: [],
    groups: [],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

function defaultDatabaseFormProperties(source: DatabaseSource) {
  return source.properties.filter(
    (property) =>
      ![
        'formula',
        'rollup',
        'created_time',
        'last_edited_time',
        'created_by',
        'last_edited_by',
        'button',
        'unique_id',
      ].includes(property.type),
  );
}

export function createDefaultDatabaseFormView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  const properties = defaultDatabaseFormProperties(input.source);
  if (!properties.some((property) => property.type === 'title')) {
    throw new Error('A Form view requires a writable Title property');
  }
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: {
      type: 'form',
      configuration: {
        access: 'internal',
        title: input.name,
        questions: properties.map((property, index) => ({
          id: `frmq_${String(index + 1).padStart(3, '0')}_${property.key.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}`,
          propertyId: property.id,
          label: property.name,
          required: property.type === 'title' || property.required,
        })),
        fileUploads: {
          enabled: properties.some((property) => property.type === 'files'),
          maxFilesPerQuestion: 5,
        },
      },
    },
    sort: [],
    groups: [],
    projection: {
      propertyIds: properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

export function defaultDatabaseMapPlaceProperty(source: DatabaseSource) {
  return source.properties.find((property) => property.type === 'place');
}

export function createDefaultDatabaseMapView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  const placeProperty = defaultDatabaseMapPlaceProperty(input.source);
  if (!placeProperty) throw new Error('A Map view requires a Place property');
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: {
      type: 'map',
      configuration: {
        placePropertyId: placeProperty.id,
        basemap: 'local',
        clustering: true,
        clusterRadius: 48,
        showLabels: true,
        showMissingLocations: true,
        initialZoom: 2,
        loadLimit: 100,
      },
    },
    sort: [],
    groups: [],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

export function defaultDatabaseDashboardWidgetViews(
  source: DatabaseSource,
  views: readonly DatabaseView[],
) {
  return views.filter(
    (view) =>
      view.sourceId === source.id && !['dashboard', 'form', 'agent'].includes(view.layout.type),
  );
}

export function defaultDatabaseFeedChronologyProperty(source: DatabaseSource) {
  return (
    source.properties.find((property) => property.type === 'last_edited_time') ??
    source.properties.find((property) => property.type === 'created_time') ??
    source.properties.find((property) => property.type === 'date')
  );
}

function defaultDatabaseFeedAuthorProperty(source: DatabaseSource) {
  return source.properties.find((property) =>
    ['last_edited_by', 'created_by', 'person'].includes(property.type),
  );
}

export function createDefaultDatabaseFeedView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  const chronology = defaultDatabaseFeedChronologyProperty(input.source);
  if (!chronology) {
    throw new Error('A Feed view requires a Date, Created time, or Last edited time property');
  }
  const author = defaultDatabaseFeedAuthorProperty(input.source);
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: {
      type: 'feed',
      configuration: {
        chronologyPropertyId: chronology.id,
        ...(author ? { authorPropertyId: author.id } : {}),
        density: 'comfortable',
        showProperties: true,
        readTracking: 'session',
        loadLimit: 50,
      },
    },
    sort: [{ propertyId: chronology.id, direction: 'desc' }],
    groups: [],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'preview',
    },
  });
}

export function createDefaultDatabaseDashboardView(input: {
  source: DatabaseSource;
  existingViews: readonly DatabaseView[];
  name: string;
  uuid: string;
}): DatabaseView {
  const candidates = defaultDatabaseDashboardWidgetViews(input.source, input.existingViews).slice(
    0,
    2,
  );
  if (candidates.length === 0) {
    throw new Error('A Dashboard requires at least one ordinary saved view');
  }
  return DatabaseViewSchema.parse({
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(
      input.name,
      new Set(input.existingViews.map((view) => view.key)),
    ),
    name: input.name,
    sourceId: input.source.id,
    layout: {
      type: 'dashboard',
      configuration: {
        rows: [
          {
            id: 'dshr_overview',
            height: 'medium',
            widgets: candidates.map((view, index) => ({
              id: `dshw_overview_${String(index + 1).padStart(2, '0')}`,
              viewId: view.id,
              width: candidates.length === 1 ? 4 : 2,
            })),
          },
        ],
        globalFilters: [],
        interactions: [],
      },
    },
    sort: [],
    groups: [],
    projection: {
      propertyIds: input.source.properties.map((property) => property.id),
      body: 'hidden',
    },
  });
}

export function duplicateDatabaseView(input: {
  view: DatabaseView;
  existingViews: readonly DatabaseView[];
  uuid: string;
}): DatabaseView {
  const { favorite: _favorite, ...copy } = structuredClone(input.view);
  const name = `${input.view.name} copy`;
  return DatabaseViewSchema.parse({
    ...copy,
    id: createDatabaseViewId(input.uuid),
    key: createUniqueDatabaseViewKey(name, new Set(input.existingViews.map((view) => view.key))),
    name,
  });
}
