import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseSavedViewSettingsDialog } from './DatabaseSavedViewSettingsDialog';

const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
  ],
};

const view: DatabaseView = {
  id: 'view_scored',
  key: 'scored',
  name: 'Scored',
  sourceId: source.id,
  layout: {
    type: 'table',
    configuration: {
      wrap: false,
      rowHeight: 'standard',
      propertyWidths: { prop_title: 280 },
    },
  },
  sort: [{ propertyId: 'prop_score', direction: 'desc' }],
  groups: [],
  projection: { propertyIds: ['prop_title', 'prop_score'], body: 'preview' },
};

afterEach(cleanup);

describe('DatabaseSavedViewSettingsDialog', () => {
  test('persists Feed chronology, author, density, properties, read state, and page limit', async () => {
    const feedSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_created', key: 'created', name: 'Created', type: 'created_time' },
        { id: 'prop_edited', key: 'edited', name: 'Edited', type: 'last_edited_time' },
        { id: 'prop_editor', key: 'editor', name: 'Editor', type: 'last_edited_by' },
      ],
    };
    const feedView: DatabaseView = {
      ...view,
      id: 'view_feed',
      key: 'feed',
      layout: {
        type: 'feed',
        configuration: {
          chronologyPropertyId: 'prop_created',
          density: 'comfortable',
          showProperties: true,
          readTracking: 'session',
          loadLimit: 50,
        },
      },
      projection: {
        propertyIds: feedSource.properties.map((property) => property.id),
        body: 'preview',
      },
    };
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={feedSource}
        view={feedView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Open records in' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Full page' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Feed chronology property' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Edited' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Feed author identity' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Editor' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Track read items in this app session' }));
    fireEvent.change(screen.getByLabelText('Page limit'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      openBehavior: 'full_page',
      layout: {
        type: 'feed',
        configuration: {
          chronologyPropertyId: 'prop_edited',
          authorPropertyId: 'prop_editor',
          readTracking: 'none',
          loadLimit: 25,
        },
      },
    });
  });

  test('persists Dashboard row layout, widgets, and global filter controls', async () => {
    const dashboardView: DatabaseView = {
      ...view,
      id: 'view_dashboard',
      key: 'dashboard',
      layout: {
        type: 'dashboard',
        configuration: {
          rows: [
            {
              id: 'dshr_overview',
              height: 'medium',
              widgets: [{ id: 'dshw_scored', viewId: view.id, width: 4 }],
            },
          ],
          globalFilters: [],
          interactions: [],
        },
      },
    };
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={source}
        view={dashboardView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Height for row 1' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Large' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name for dashboard filter filter-1' }), {
      target: { value: 'Has a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      layout: {
        type: 'dashboard',
        configuration: {
          rows: [
            {
              height: 'large',
              widgets: [{ viewId: view.id, width: 4 }],
            },
          ],
          globalFilters: [expect.objectContaining({ name: 'Has a title', enabledByDefault: true })],
        },
      },
    });
  });

  test('persists Map mapping, explicit provider choice, clustering, and marker limits', async () => {
    const mapSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        {
          id: 'prop_place',
          key: 'place',
          name: 'Place',
          type: 'place',
          externalMap: 'explicit',
        },
      ],
    };
    const mapView: DatabaseView = {
      ...view,
      id: 'view_map',
      key: 'map',
      layout: {
        type: 'map',
        configuration: {
          placePropertyId: 'prop_place',
          basemap: 'local',
          clustering: true,
          clusterRadius: 48,
          showLabels: true,
          showMissingLocations: true,
          initialZoom: 2,
          loadLimit: 100,
        },
      },
    };
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={mapSource}
        view={mapView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Map basemap' }));
    fireEvent.click(await screen.findByRole('option', { name: 'OpenStreetMap tiles' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Map initial zoom' }), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Map marker limit' }), {
      target: { value: '80' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show marker labels' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      layout: {
        type: 'map',
        configuration: {
          placePropertyId: 'prop_place',
          basemap: 'openstreetmap',
          clustering: true,
          showLabels: false,
          initialZoom: 6,
          loadLimit: 80,
        },
      },
    });
  });

  test('persists Form access, question mapping, confirmation, and abuse policy', async () => {
    const onSave = mock(() => {});
    const formView: DatabaseView = {
      ...view,
      id: 'view_form',
      key: 'form',
      layout: {
        type: 'form',
        configuration: {
          access: 'internal',
          title: 'Task intake',
          questions: [
            {
              id: 'frmq_001_title',
              propertyId: 'prop_title',
              label: 'Task name',
              required: true,
            },
          ],
          defaults: {},
          confirmation: {
            title: 'Response submitted',
            message: 'Saved.',
            allowAnotherResponse: true,
          },
          closedMessage: 'Closed.',
          fileUploads: { enabled: false, maxFilesPerQuestion: 5 },
          spamProtection: {
            honeypot: true,
            minimumCompletionSeconds: 2,
            rateLimit: { maxSubmissions: 10, windowSeconds: 60 },
          },
          duplicateSubmission: { type: 'allow' },
          retention: { type: 'workspace' },
        },
      },
    };
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={source}
        view={formView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Form access' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Public link' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Form title' }), {
      target: { value: 'Public task intake' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Responses per window' }), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      layout: {
        type: 'form',
        configuration: {
          access: 'public',
          title: 'Public task intake',
          questions: [expect.objectContaining({ propertyId: 'prop_title', required: true })],
          spamProtection: {
            rateLimit: { maxSubmissions: 4, windowSeconds: 60 },
          },
        },
      },
    });
  });

  test('persists Chart type, dimension, numeric aggregation, labels, and limits', async () => {
    const chartView: DatabaseView = {
      ...view,
      id: 'view_chart',
      key: 'chart',
      layout: {
        type: 'chart',
        configuration: {
          chartType: 'vertical_bar',
          dimension: { propertyId: 'prop_title', arrayMode: 'each' },
          measure: { type: 'count' },
          showLegend: true,
          showLabels: false,
          showAxisNames: true,
          groupLimit: 200,
          loadLimit: 500,
        },
      },
    };
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={source}
        view={chartView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Chart type' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Line' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Chart dimension' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Score' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Chart measure property' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Score' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Chart aggregation' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Sum' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Chart value labels' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Chart group limit' }), {
      target: { value: '80' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Chart drill-through row limit' }), {
      target: { value: '240' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      layout: {
        type: 'chart',
        configuration: {
          chartType: 'line',
          dimension: { propertyId: 'prop_score', arrayMode: 'each' },
          measure: { type: 'property', propertyId: 'prop_score', function: 'sum' },
          showLabels: true,
          groupLimit: 80,
          loadLimit: 240,
        },
      },
    });
  });

  test('persists Gallery preview, fit, size, title, fallback, and load limit', async () => {
    const gallerySource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_media', key: 'media', name: 'Media', type: 'files' },
      ],
    };
    const galleryView: DatabaseView = {
      ...view,
      id: 'view_gallery',
      key: 'gallery',
      layout: {
        type: 'gallery',
        configuration: {
          cardSize: 'medium',
          cardPreview: { type: 'none' },
          fitImage: false,
          showTitle: true,
          fallbackStyle: 'color',
          loadLimit: 100,
        },
      },
    };
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={gallerySource}
        view={galleryView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Gallery card size' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Large cards' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Gallery card preview' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Media' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fit Gallery image' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Gallery title' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Gallery fallback art' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Document fallback' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Gallery load limit' }), {
      target: { value: '60' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      layout: {
        type: 'gallery',
        configuration: {
          cardSize: 'large',
          cardPreview: { type: 'files', propertyId: 'prop_media' },
          fitImage: true,
          showTitle: false,
          fallbackStyle: 'document',
          loadLimit: 60,
        },
      },
    });
  });

  test('persists List hierarchy, density, sections, dividers, and load limit', async () => {
    const listSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        {
          id: 'prop_parent',
          key: 'parent',
          name: 'Parent',
          type: 'relation',
          targetSourceId: source.id,
          cardinality: 'one',
        },
      ],
    };
    const listView: DatabaseView = {
      ...view,
      id: 'view_list',
      key: 'list',
      layout: {
        type: 'list',
        configuration: {
          hierarchy: { type: 'flat' },
          density: 'compact',
          showSections: true,
          collapsibleSections: true,
          showDividers: true,
          loadLimit: 100,
        },
      },
    };
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={listSource}
        view={listView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'List parent Relation property' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Parent hierarchy' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'List density' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Comfortable' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Group sections' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Row dividers' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'List load limit' }), {
      target: { value: '75' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      layout: {
        type: 'list',
        configuration: {
          hierarchy: { type: 'parent_relation', propertyId: 'prop_parent' },
          density: 'comfortable',
          showSections: false,
          collapsibleSections: true,
          showDividers: false,
          loadLimit: 75,
        },
      },
    });
  });

  test('persists Calendar date, range, week, timezone, weekend, and card-limit settings', async () => {
    const calendarSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' },
      ],
    };
    const calendarView: DatabaseView = {
      ...view,
      id: 'view_calendar',
      key: 'calendar',
      layout: {
        type: 'calendar',
        configuration: {
          datePropertyId: 'prop_schedule',
          display: 'month',
          weekStartsOn: 'monday',
          timeZone: 'UTC',
          showWeekends: true,
          cardLimitPerDay: 10,
        },
      },
    };
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={calendarSource}
        view={calendarView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Calendar display range' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Week' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Calendar week starts on' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Sunday' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Calendar time zone' }), {
      target: { value: 'Asia/Seoul' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Calendar shows weekends' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Calendar cards per day limit' }), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      layout: {
        type: 'calendar',
        configuration: {
          datePropertyId: 'prop_schedule',
          display: 'week',
          weekStartsOn: 'sunday',
          timeZone: 'Asia/Seoul',
          showWeekends: false,
          cardLimitPerDay: 25,
        },
      },
    });
  });

  test('persists Timeline mapping, scale, dependencies, visibility, and limits', async () => {
    const timelineSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_start', key: 'start', name: 'Start', type: 'date' },
        { id: 'prop_end', key: 'end', name: 'End', type: 'date' },
        {
          id: 'prop_dependencies',
          key: 'dependencies',
          name: 'Dependencies',
          type: 'relation',
          targetSourceId: source.id,
          cardinality: 'many',
        },
      ],
    };
    const timelineView: DatabaseView = {
      ...view,
      id: 'view_timeline',
      key: 'timeline',
      layout: {
        type: 'timeline',
        configuration: {
          dateMapping: { type: 'range', propertyId: 'prop_start' },
          scale: 'week',
          showTable: true,
          showToday: true,
          showDependencies: true,
          noDateLane: true,
          loadLimit: 100,
        },
      },
      projection: { propertyIds: ['prop_title', 'prop_status'], body: 'hidden' },
    };
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={timelineSource}
        view={timelineView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Timeline date mapping type' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Separate start and end' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Timeline end Date property' }));
    fireEvent.click(await screen.findByRole('option', { name: 'End' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Timeline scale' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Months' }));
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Timeline dependency Relation property' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Dependencies' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Timeline shows table' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Timeline shows today' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Timeline load limit' }), {
      target: { value: '75' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      layout: {
        type: 'timeline',
        configuration: {
          dateMapping: {
            type: 'separate',
            startPropertyId: 'prop_start',
            endPropertyId: 'prop_end',
          },
          scale: 'month',
          showTable: false,
          showToday: false,
          dependencyPropertyId: 'prop_dependencies',
          loadLimit: 75,
        },
      },
    });
  });

  test('persists Board card cover, sizing, column color, swimlane, and explicit limits', async () => {
    const boardSource: DatabaseSource = {
      ...source,
      properties: [
        ...source.properties,
        { id: 'prop_cover', key: 'cover', name: 'Cover', type: 'files' },
      ],
    };
    const boardView: DatabaseView = {
      ...view,
      id: 'view_board',
      key: 'board',
      layout: {
        type: 'board',
        configuration: {
          cardSize: 'medium',
          cardPreview: { type: 'none' },
          fitImage: false,
          colorColumns: true,
          groupLimit: 100,
          cardLimitPerGroup: 100,
        },
      },
      groups: [{ propertyId: 'prop_status', direction: 'asc', hideEmpty: false }],
      projection: {
        propertyIds: ['prop_title', 'prop_score', 'prop_status', 'prop_cover'],
        body: 'hidden',
      },
    };
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={boardSource}
        view={boardView}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Board card size' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Large cards' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Board card preview' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cover cover' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fit Board card cover' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Color Board columns' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Board group limit' }), {
      target: { value: '25' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Board cards per group limit' }), {
      target: { value: '40' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      groups: [{ propertyId: 'prop_status' }, { propertyId: 'prop_title', hideEmpty: false }],
      layout: {
        type: 'board',
        configuration: {
          cardSize: 'large',
          cardPreview: { type: 'files', propertyId: 'prop_cover' },
          fitImage: true,
          colorColumns: false,
          groupLimit: 25,
          cardLimitPerGroup: 40,
        },
      },
    });
  });

  test('authors ordered row or property color rules through the shared typed filter editor', async () => {
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={source}
        view={view}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add color rule' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Conditional color 1 color' }));
    fireEvent.click(await screen.findByRole('option', { name: 'red' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Conditional color 1 target' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Status property' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit conditional color 1 condition' }));
    expect(await screen.findByRole('heading', { name: 'Advanced saved filters' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review filter change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));

    expect(onSave.mock.calls[0]?.[0].conditionalColors).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^ccr_/),
        color: 'red',
        where: { propertyId: 'prop_title', operator: 'is_not_empty' },
        applyTo: { type: 'property', propertyId: 'prop_status' },
      }),
    ]);
  });

  test('reviews one typed revision containing query, projection, and table settings', async () => {
    const onSave = mock(() => {});
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={source}
        view={view}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Group hides empty values' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Status in saved view' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wrap saved view cells' }));

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved view body projection' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Body full' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Saved view row height' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Compact' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Saved width for Status' }), {
      target: { value: '220' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review view settings' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      sort: [{ propertyId: 'prop_score', direction: 'desc' }],
      groups: [{ propertyId: 'prop_title', direction: 'asc', hideEmpty: true }],
      projection: {
        propertyIds: ['prop_title', 'prop_score', 'prop_status'],
        body: 'full',
      },
      layout: {
        type: 'table',
        configuration: {
          wrap: true,
          rowHeight: 'compact',
          propertyWidths: { prop_title: 280, prop_status: 220 },
        },
      },
    });
  });

  test('adds a header-targeted property as the next sort rule', () => {
    render(
      <DatabaseSavedViewSettingsDialog
        open
        onOpenChange={() => {}}
        source={source}
        view={view}
        initialSortPropertyId="prop_status"
        onSave={() => {}}
      />,
    );

    const sortProperties = screen.getAllByRole('combobox', { name: /Sort \d+ property/ });
    expect(sortProperties).toHaveLength(2);
    expect(sortProperties[1]?.textContent).toContain('Status');
  });
});
