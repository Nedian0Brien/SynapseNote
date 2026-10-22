import { describe, expect, test } from 'bun:test';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import {
  createDefaultDatabaseBoardView,
  createDefaultDatabaseCalendarView,
  createDefaultDatabaseChartView,
  createDefaultDatabaseDashboardView,
  createDefaultDatabaseFeedView,
  createDefaultDatabaseFormView,
  createDefaultDatabaseGalleryView,
  createDefaultDatabaseListView,
  createDefaultDatabaseMapView,
  createDefaultDatabaseTableView,
  createDefaultDatabaseTimelineView,
  createUniqueDatabaseViewKey,
  defaultDatabaseDashboardWidgetViews,
  defaultDatabaseFeedChronologyProperty,
  defaultDatabaseMapPlaceProperty,
  duplicateDatabaseView,
} from './database-view-lifecycle.ts';

const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
  ],
};

const view: DatabaseView = {
  id: 'view_open',
  key: 'open-tasks',
  name: 'Open tasks',
  favorite: true,
  sourceId: source.id,
  layout: { type: 'table', configuration: { wrap: true } },
  sort: [{ propertyId: 'prop_status', direction: 'asc' }],
  groups: [],
  projection: { propertyIds: ['prop_title'], body: 'preview' },
};

describe('database view lifecycle identities', () => {
  test('creates deterministic unique stable keys for names and collisions', () => {
    expect(createUniqueDatabaseViewKey('123 우선순위', new Set())).toBe('view-123');
    expect(createUniqueDatabaseViewKey('Open tasks', new Set(['open-tasks']))).toBe('open-tasks-2');
  });

  test('creates and duplicates typed table views with fresh stable identities', () => {
    const created = createDefaultDatabaseTableView({
      source,
      existingViews: [view],
      name: 'Open tasks',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(created).toMatchObject({
      id: 'view_11111111222243338444555555555555',
      key: 'open-tasks-2',
      projection: { propertyIds: ['prop_title', 'prop_status'], body: 'hidden' },
    });
    const duplicate = duplicateDatabaseView({
      view,
      existingViews: [view, created],
      uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(duplicate).toMatchObject({
      id: 'view_aaaaaaaabbbb4ccc8dddeeeeeeeeeeee',
      key: 'open-tasks-copy',
      name: 'Open tasks copy',
      layout: { type: 'table', configuration: { wrap: true } },
      projection: { propertyIds: ['prop_title'], body: 'preview' },
    });
    expect(duplicate.favorite).toBeUndefined();
  });

  test('creates a private bounded Map from the first Place property', () => {
    const mapSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_place', key: 'place', name: 'Place', type: 'place' },
      ],
    };
    expect(defaultDatabaseMapPlaceProperty(mapSource)?.id).toBe('prop_place');
    const map = createDefaultDatabaseMapView({
      source: mapSource,
      existingViews: [],
      name: 'Locations',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(map).toMatchObject({
      layout: {
        type: 'map',
        configuration: {
          placePropertyId: 'prop_place',
          basemap: 'local',
          clustering: true,
          loadLimit: 100,
        },
      },
    });
  });

  test('creates a bounded Dashboard from ordinary source views', () => {
    expect(defaultDatabaseDashboardWidgetViews(source, [view])).toEqual([view]);
    const dashboard = createDefaultDatabaseDashboardView({
      source,
      existingViews: [view],
      name: 'Overview',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(dashboard).toMatchObject({
      layout: {
        type: 'dashboard',
        configuration: {
          rows: [
            {
              height: 'medium',
              widgets: [{ viewId: view.id, width: 4 }],
            },
          ],
          globalFilters: [],
          interactions: [],
        },
      },
    });
  });

  test('creates a chronological bounded Feed with stable source identity', () => {
    const feedSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_edited', key: 'edited', name: 'Edited', type: 'last_edited_time' },
        { id: 'prop_editor', key: 'editor', name: 'Editor', type: 'last_edited_by' },
      ],
    };
    expect(defaultDatabaseFeedChronologyProperty(feedSource)?.id).toBe('prop_edited');
    const feed = createDefaultDatabaseFeedView({
      source: feedSource,
      existingViews: [],
      name: 'Updates',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(feed).toMatchObject({
      layout: {
        type: 'feed',
        configuration: {
          chronologyPropertyId: 'prop_edited',
          authorPropertyId: 'prop_editor',
          readTracking: 'session',
          loadLimit: 50,
        },
      },
      sort: [{ propertyId: 'prop_edited', direction: 'desc' }],
      projection: { body: 'preview' },
    });
  });

  test('creates a bounded Board view using the canonical group property', () => {
    const boardSource: DatabaseSource = {
      ...source,
      properties: [
        source.properties[0] as DatabaseSource['properties'][number],
        {
          id: 'prop_workflow',
          key: 'workflow',
          name: 'Workflow',
          type: 'select',
          options: [
            { id: 'opt_todo', key: 'todo', name: 'Todo' },
            { id: 'opt_done', key: 'done', name: 'Done' },
          ],
        },
      ],
    };
    const board = createDefaultDatabaseBoardView({
      source: boardSource,
      existingViews: [],
      name: 'Workflow',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(board).toMatchObject({
      layout: {
        type: 'board',
        configuration: { groupLimit: 100, cardLimitPerGroup: 100 },
      },
      groups: [{ propertyId: 'prop_workflow', hideEmpty: false }],
    });
  });

  test('creates a bounded Timeline using the first canonical Date property', () => {
    const timelineSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' },
      ],
    };
    const timeline = createDefaultDatabaseTimelineView({
      source: timelineSource,
      existingViews: [],
      name: 'Schedule',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(timeline).toMatchObject({
      layout: {
        type: 'timeline',
        configuration: {
          dateMapping: { type: 'range', propertyId: 'prop_schedule' },
          scale: 'week',
          loadLimit: 100,
        },
      },
    });
  });

  test('creates a timezone-aware Calendar using the first canonical Date property', () => {
    const calendarSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' },
      ],
    };
    const calendar = createDefaultDatabaseCalendarView({
      source: calendarSource,
      existingViews: [],
      name: 'Calendar',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(calendar).toMatchObject({
      layout: {
        type: 'calendar',
        configuration: {
          datePropertyId: 'prop_schedule',
          display: 'month',
          weekStartsOn: 'monday',
          showWeekends: true,
          cardLimitPerDay: 10,
          timeZone: expect.any(String),
        },
      },
    });
  });

  test('creates a compact typed List view', () => {
    const list = createDefaultDatabaseListView({
      source,
      existingViews: [],
      name: 'Notes',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(list).toMatchObject({
      layout: {
        type: 'list',
        configuration: {
          hierarchy: { type: 'flat' },
          density: 'compact',
          showSections: true,
          loadLimit: 100,
        },
      },
    });
  });

  test('creates a Gallery using the first canonical Files property', () => {
    const gallerySource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_media', key: 'media', name: 'Media', type: 'files' },
      ],
    };
    const gallery = createDefaultDatabaseGalleryView({
      source: gallerySource,
      existingViews: [],
      name: 'Assets',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(gallery).toMatchObject({
      layout: {
        type: 'gallery',
        configuration: {
          cardPreview: { type: 'files', propertyId: 'prop_media' },
          cardSize: 'medium',
          fallbackStyle: 'color',
          loadLimit: 100,
        },
      },
    });
  });

  test('creates a Chart using the preferred categorical dimension and record count', () => {
    const chartSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        {
          id: 'prop_workflow',
          key: 'workflow',
          name: 'Workflow',
          type: 'status',
          groups: [{ id: 'grp_todo', key: 'todo', name: 'Todo', color: 'gray' }],
          options: [
            {
              id: 'opt_todo',
              key: 'todo',
              name: 'Todo',
              color: 'gray',
              groupId: 'grp_todo',
            },
          ],
        },
      ],
    };
    const chart = createDefaultDatabaseChartView({
      source: chartSource,
      existingViews: [],
      name: 'Overview',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(chart).toMatchObject({
      layout: {
        type: 'chart',
        configuration: {
          chartType: 'vertical_bar',
          dimension: { propertyId: 'prop_workflow', arrayMode: 'each' },
          measure: { type: 'count' },
          groupLimit: 200,
          loadLimit: 500,
        },
      },
    });
  });

  test('creates an internal Form with writable property mapping and bounded uploads', () => {
    const formSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_files', key: 'files', name: 'Files', type: 'files' },
        {
          id: 'prop_formula',
          key: 'formula',
          name: 'Formula',
          type: 'formula',
          source: '"derived"',
          ast: {
            language: 'synapse-formula-1',
            version: 1,
            resultType: 'text',
            expression: { type: 'literal', value: 'derived' },
          },
        },
      ],
    };
    const form = createDefaultDatabaseFormView({
      source: formSource,
      existingViews: [],
      name: 'Intake',
      uuid: '11111111-2222-4333-8444-555555555555',
    });
    expect(form).toMatchObject({
      layout: {
        type: 'form',
        configuration: {
          access: 'internal',
          title: 'Intake',
          fileUploads: { enabled: true, maxFilesPerQuestion: 5 },
          questions: [
            expect.objectContaining({ propertyId: 'prop_title', required: true }),
            expect.objectContaining({ propertyId: 'prop_status' }),
            expect.objectContaining({ propertyId: 'prop_files' }),
          ],
        },
      },
    });
    expect(
      form.layout.type === 'form'
        ? form.layout.configuration.questions.some(
            (question) => question.propertyId === 'prop_formula',
          )
        : true,
    ).toBe(false);
  });
});
