import { describe, expect, test } from 'bun:test';
import { stringify } from 'yaml';
import {
  DATABASE_MANIFEST_MAX_ALIAS_COUNT,
  DATABASE_MANIFEST_MAX_BYTES,
  DATABASE_MANIFEST_MAX_DEPTH,
  parseDatabaseManifestYaml,
  serializeDatabaseManifestYaml,
  updateDatabaseManifestYaml,
} from './manifest.ts';
import {
  applyDatabaseLinkedViewSettings,
  DatabaseDefinitionSchema,
  DatabaseLinkedViewReferenceSchema,
  DatabaseLinkedViewSettingsSchema,
  DatabasePropertySchema,
  DatabaseRecordPageLayoutOverrideSchema,
  DatabaseViewSchema,
  databaseRecordPageLayoutOverrideIssues,
  isValidDatabaseEmail,
  isValidDatabasePhone,
  isValidDatabaseUrl,
} from './schema.ts';

function validDefinition() {
  return {
    version: 1 as const,
    id: 'db_feedback',
    key: 'feedback',
    name: 'Feedback',
    contract: {
      purpose: 'Track customer feedback',
      canonicality: 'canonical' as const,
      vocabulary: ['customer', 'feedback'],
      defaultTimePropertyId: undefined as string | undefined,
      freshness: { expectation: 'daily' as const, maxAgeSeconds: 86_400 },
      sensitivity: 'internal' as const,
    },
    sources: [
      {
        id: 'ds_feedback',
        key: 'feedback',
        name: 'Feedback',
        recordMeaning: 'One customer report',
        folder: 'feedback',
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            options: [
              { id: 'opt_new', key: 'new', name: 'New' },
              { id: 'opt_done', key: 'done', name: 'Done' },
            ],
          },
        ],
      },
    ],
  };
}

describe('database manifest schema', () => {
  test('round-trips optional database page icon and cover metadata', () => {
    const parsed = DatabaseDefinitionSchema.parse({
      ...validDefinition(),
      icon: '🗂️',
      cover: 'assets/database-cover.png',
    });
    expect(parsed).toMatchObject({
      icon: '🗂️',
      cover: 'assets/database-cover.png',
    });
    expect(
      DatabaseDefinitionSchema.safeParse({ ...validDefinition(), cover: 'x'.repeat(2_049) })
        .success,
    ).toBe(false);
  });

  test('validates owned, versioned automations and isolates reviewed egress references', () => {
    const definition = {
      ...validDefinition(),
      people: [
        {
          id: 'person_owner',
          key: 'owner',
          name: 'Automation owner',
          kind: 'agent' as const,
          subjectId: 'agent-automation-owner',
          active: true,
        },
      ],
      automations: [
        {
          id: 'auto_triage',
          key: 'triage',
          name: 'Triage new feedback',
          version: 3,
          enabled: true,
          ownerId: 'person_owner',
          trigger: {
            kind: 'property_changed' as const,
            sourceId: 'ds_feedback',
            propertyId: 'prop_status',
          },
          actions: [
            {
              id: 'create_followup',
              kind: 'create_record' as const,
              sourceId: 'ds_feedback',
              values: {
                prop_title: { fromEvent: 'property' as const, propertyId: 'prop_title' },
              },
            },
            {
              id: 'notify_owner',
              kind: 'notification' as const,
              recipientIds: ['person_owner'],
              title: 'Feedback changed',
            },
            {
              id: 'send_reviewed_event',
              kind: 'external_webhook' as const,
              connectionId: 'conn_triage',
              eventName: 'feedback_changed',
              propertyIds: ['prop_status'],
              includeBody: false,
            },
          ],
          retry: { maxAttempts: 4, initialBackoffSeconds: 30, multiplier: 2 },
          limits: { maxActionsPerRun: 4, maxGeneratedEvents: 2 },
        },
      ],
    };
    const parsed = DatabaseDefinitionSchema.parse(definition);
    expect(parsed.automations[0]).toMatchObject({
      id: 'auto_triage',
      version: 3,
      enabled: true,
      ownerId: 'person_owner',
      trigger: { kind: 'property_changed', propertyId: 'prop_status' },
    });
    expect(JSON.stringify(parsed.automations[0])).not.toContain('https://');

    const externalThenInternal = structuredClone(definition);
    const actions = externalThenInternal.automations[0]?.actions;
    const firstAction = actions?.shift();
    if (actions && firstAction) actions.push(firstAction);
    expect(DatabaseDefinitionSchema.safeParse(externalThenInternal).success).toBe(false);

    const inactiveOwner = structuredClone(definition);
    if (inactiveOwner.people[0]) inactiveOwner.people[0].active = false;
    expect(DatabaseDefinitionSchema.safeParse(inactiveOwner).success).toBe(false);

    const staleProperty = structuredClone(definition);
    const external = staleProperty.automations[0]?.actions[2];
    if (external?.kind === 'external_webhook') external.propertyIds = ['prop_missing'];
    expect(DatabaseDefinitionSchema.safeParse(staleProperty).success).toBe(false);
  });

  test('validates owned repeating-template schedules, pause state, and retry policy', () => {
    const definition = {
      ...validDefinition(),
      people: [
        {
          id: 'person_owner',
          key: 'owner',
          name: 'Template owner',
          kind: 'local' as const,
          subjectId: 'principal-template-owner',
          active: true,
        },
      ],
      templates: [
        {
          id: 'tpl_weekly_review',
          key: 'weekly-review',
          name: 'Weekly review',
          sourceId: 'ds_feedback',
          propertyValues: { prop_title: 'Weekly review' },
          body: '## Review\n',
          order: 0,
          repeat: {
            schedule: { kind: 'weekly' as const, weekdays: [1, 5], time: '09:30' },
            timeZone: 'Asia/Seoul',
            ownerId: 'person_owner',
            paused: false,
            retry: { maxAttempts: 4, initialBackoffSeconds: 30, multiplier: 2 },
          },
        },
      ],
    };
    const parsed = DatabaseDefinitionSchema.parse(definition);
    expect(parsed.templates[0]?.repeat).toMatchObject({
      schedule: { kind: 'weekly', weekdays: [1, 5], time: '09:30' },
      timeZone: 'Asia/Seoul',
      ownerId: 'person_owner',
      paused: false,
    });

    const missingOwner = structuredClone(definition);
    if (missingOwner.templates[0]?.repeat)
      missingOwner.templates[0].repeat.ownerId = 'person_missing';
    expect(DatabaseDefinitionSchema.safeParse(missingOwner).success).toBe(false);
    const archivedActive = structuredClone(definition);
    if (archivedActive.templates[0])
      archivedActive.templates[0].archivedAt = new Date().toISOString();
    expect(DatabaseDefinitionSchema.safeParse(archivedActive).success).toBe(false);
  });

  test('validates stable, non-overlapping database page layout placements', () => {
    const definition = validDefinition();
    const laidOut = {
      ...definition,
      sources: [
        {
          ...definition.sources[0],
          properties: [
            ...(definition.sources[0]?.properties ?? []),
            { id: 'prop_owner', key: 'owner', name: 'Owner', type: 'text' },
            { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
          ],
          pageLayout: {
            pinnedPropertyIds: ['prop_status'],
            panelPropertyIds: ['prop_owner'],
            hiddenPropertyIds: [],
            sections: [
              {
                id: 'layout_section_details',
                key: 'details',
                name: 'Details',
                groups: [
                  {
                    id: 'layout_group_context',
                    key: 'context',
                    name: 'Context',
                    propertyIds: ['prop_notes'],
                  },
                ],
              },
            ],
            fullWidthContent: true,
          },
        },
      ],
    };
    const parsed = DatabaseDefinitionSchema.parse(laidOut);
    expect(parsed.sources[0]?.pageLayout).toMatchObject({
      pinnedPropertyIds: ['prop_status'],
      panelPropertyIds: ['prop_owner'],
      fullWidthContent: true,
    });
    expect(parseDatabaseManifestYaml(serializeDatabaseManifestYaml(parsed))).toEqual({
      ok: true,
      definition: parsed,
    });

    const duplicate = structuredClone(laidOut);
    duplicate.sources[0]?.pageLayout?.hiddenPropertyIds.push('prop_status');
    expect(DatabaseDefinitionSchema.safeParse(duplicate).success).toBe(false);
    const titlePlacement = structuredClone(laidOut);
    titlePlacement.sources[0]?.pageLayout?.pinnedPropertyIds.push('prop_title');
    expect(DatabaseDefinitionSchema.safeParse(titlePlacement).success).toBe(false);
    const missing = structuredClone(laidOut);
    missing.sources[0]?.pageLayout?.panelPropertyIds.push('prop_missing');
    expect(DatabaseDefinitionSchema.safeParse(missing).success).toBe(false);

    const source = parsed.sources[0];
    if (!source) throw new Error('missing page-layout source');
    const override = DatabaseRecordPageLayoutOverrideSchema.parse({
      pinnedPropertyIds: ['prop_owner'],
      panelPropertyIds: ['prop_status'],
      hiddenPropertyIds: [],
      groupOverrides: [{ groupId: 'layout_group_context', collapsed: true }],
      fullWidthContent: false,
    });
    expect(databaseRecordPageLayoutOverrideIssues(source, override)).toEqual([]);
    expect(
      databaseRecordPageLayoutOverrideIssues(source, {
        ...override,
        hiddenPropertyIds: ['prop_owner'],
        groupOverrides: [{ groupId: 'layout_group_missing', collapsed: true }],
      }),
    ).toEqual([
      'Property "prop_owner" is overridden more than once',
      'Overridden group "layout_group_missing" is not in the source layout',
    ]);
  });

  test('validates bounded Dashboard widgets, global filters, and Relation interactions', () => {
    const definition = validDefinition();
    const dashboardDefinition = {
      ...definition,
      sources: [
        {
          ...definition.sources[0],
          properties: [
            ...(definition.sources[0]?.properties ?? []),
            {
              id: 'prop_related',
              key: 'related',
              name: 'Related',
              type: 'relation',
              targetSourceId: 'ds_feedback',
            },
          ],
        },
      ],
      views: [
        {
          id: 'view_feedback_table',
          key: 'table',
          name: 'Table',
          sourceId: 'ds_feedback',
          layout: { type: 'table', configuration: {} },
          groups: [],
          projection: { propertyIds: ['prop_title'] },
        },
        {
          id: 'view_feedback_list',
          key: 'list',
          name: 'List',
          sourceId: 'ds_feedback',
          layout: { type: 'list', configuration: {} },
          groups: [],
          projection: { propertyIds: ['prop_title'] },
        },
        {
          id: 'view_feedback_dashboard',
          key: 'dashboard',
          name: 'Dashboard',
          sourceId: 'ds_feedback',
          layout: {
            type: 'dashboard',
            configuration: {
              rows: [
                {
                  id: 'dshr_overview',
                  height: 'medium',
                  widgets: [
                    { id: 'dshw_table', viewId: 'view_feedback_table', width: 2 },
                    { id: 'dshw_list', viewId: 'view_feedback_list', width: 2 },
                  ],
                },
              ],
              globalFilters: [
                {
                  id: 'dshf_active',
                  key: 'active',
                  name: 'Active',
                  clauses: [
                    {
                      sourceId: 'ds_feedback',
                      where: { propertyId: 'prop_status', operator: 'is_not_empty' },
                    },
                  ],
                },
              ],
              interactions: [
                {
                  sourceWidgetId: 'dshw_table',
                  targetWidgetId: 'dshw_list',
                  targetRelationPropertyId: 'prop_related',
                },
              ],
            },
          },
          groups: [],
          projection: { propertyIds: ['prop_title'] },
        },
      ],
    };
    expect(DatabaseDefinitionSchema.safeParse(dashboardDefinition).success).toBe(true);
    const overflow = structuredClone(dashboardDefinition);
    const dashboard = overflow.views.at(-1);
    if (!dashboard || dashboard.layout.type !== 'dashboard') throw new Error('missing Dashboard');
    dashboard.layout.configuration.rows[0]?.widgets.push({
      id: 'dshw_overflow',
      viewId: 'view_feedback_table',
      width: 1,
    });
    expect(DatabaseDefinitionSchema.safeParse(overflow).success).toBe(false);
    const wrongRelation = structuredClone(dashboardDefinition);
    const wrongDashboard = wrongRelation.views.at(-1);
    if (!wrongDashboard || wrongDashboard.layout.type !== 'dashboard') {
      throw new Error('missing Dashboard');
    }
    const interaction = wrongDashboard.layout.configuration.interactions[0];
    if (!interaction) throw new Error('missing Dashboard interaction');
    interaction.targetRelationPropertyId = 'prop_title';
    expect(DatabaseDefinitionSchema.safeParse(wrongRelation).success).toBe(false);
    const duplicateInteraction = structuredClone(dashboardDefinition);
    const duplicateDashboard = duplicateInteraction.views.at(-1);
    if (!duplicateDashboard || duplicateDashboard.layout.type !== 'dashboard') {
      throw new Error('missing Dashboard');
    }
    const originalInteraction = duplicateDashboard.layout.configuration.interactions[0];
    if (!originalInteraction) throw new Error('missing Dashboard interaction');
    duplicateDashboard.layout.configuration.interactions.push({ ...originalInteraction });
    expect(DatabaseDefinitionSchema.safeParse(duplicateInteraction).success).toBe(false);
  });

  test('validates Feed chronology and author identity property types', () => {
    const definition = validDefinition();
    definition.sources[0]?.properties.push(
      { id: 'prop_edited', key: 'edited', name: 'Edited', type: 'last_edited_time' },
      { id: 'prop_editor', key: 'editor', name: 'Editor', type: 'last_edited_by' },
    );
    definition.views = [];
    definition.views.push({
      id: 'view_feedback_feed',
      key: 'feed',
      name: 'Feed',
      sourceId: 'ds_feedback',
      layout: {
        type: 'feed',
        configuration: {
          chronologyPropertyId: 'prop_edited',
          authorPropertyId: 'prop_editor',
          density: 'comfortable',
          showProperties: true,
          readTracking: 'session',
          loadLimit: 50,
        },
      },
      sort: [{ propertyId: 'prop_edited', direction: 'desc' }],
      groups: [],
      projection: { propertyIds: ['prop_title', 'prop_edited', 'prop_editor'], body: 'preview' },
    });
    expect(DatabaseDefinitionSchema.safeParse(definition).success).toBe(true);
    const invalid = structuredClone(definition);
    const feed = invalid.views.at(-1);
    if (!feed || feed.layout.type !== 'feed') throw new Error('missing Feed');
    feed.layout.configuration.chronologyPropertyId = 'prop_title';
    expect(DatabaseDefinitionSchema.safeParse(invalid).success).toBe(false);
  });

  test('validates Map Place mapping and explicit external-tile privacy consent', () => {
    const definition = validDefinition();
    const mapDefinition = {
      ...definition,
      sources: [
        {
          ...definition.sources[0],
          properties: [
            ...(definition.sources[0]?.properties ?? []),
            {
              id: 'prop_place',
              key: 'place',
              name: 'Place',
              type: 'place',
              externalMap: 'disabled',
            },
          ],
        },
      ],
      views: [
        {
          id: 'view_feedback_map',
          key: 'feedback-map',
          name: 'Feedback map',
          sourceId: 'ds_feedback',
          layout: {
            type: 'map',
            configuration: {
              placePropertyId: 'prop_place',
              basemap: 'local',
              loadLimit: 100,
            },
          },
          groups: [],
          projection: { propertyIds: ['prop_title'] },
        },
      ],
    };
    expect(DatabaseDefinitionSchema.safeParse(mapDefinition).success).toBe(true);
    const wrongType = structuredClone(mapDefinition);
    const wrongTypeView = wrongType.views[0];
    if (!wrongTypeView) throw new Error('missing Map fixture');
    wrongTypeView.layout.configuration.placePropertyId = 'prop_title';
    expect(DatabaseDefinitionSchema.safeParse(wrongType).success).toBe(false);
    const externalWithoutConsent = structuredClone(mapDefinition);
    const externalView = externalWithoutConsent.views[0];
    if (!externalView) throw new Error('missing Map fixture');
    externalView.layout.configuration.basemap = 'openstreetmap';
    expect(DatabaseDefinitionSchema.safeParse(externalWithoutConsent).success).toBe(false);
    const placeProperty = externalWithoutConsent.sources[0]?.properties.at(-1);
    if (!placeProperty || !('externalMap' in placeProperty)) {
      throw new Error('missing Place fixture');
    }
    placeProperty.externalMap = 'explicit';
    expect(DatabaseDefinitionSchema.safeParse(externalWithoutConsent).success).toBe(true);
  });

  test('validates bounded Board layout, grouping, and Files card previews', () => {
    const definition = validDefinition();
    definition.sources[0]?.properties.push({
      id: 'prop_cover',
      key: 'cover',
      name: 'Cover',
      type: 'files',
    });
    const boardDefinition = {
      ...definition,
      views: [
        {
          id: 'view_feedback_board',
          key: 'feedback-board',
          name: 'Feedback board',
          sourceId: 'ds_feedback',
          layout: {
            type: 'board',
            configuration: {
              cardSize: 'large',
              cardPreview: { type: 'files', propertyId: 'prop_cover' },
              fitImage: true,
              colorColumns: true,
              groupLimit: 20,
              cardLimitPerGroup: 50,
            },
          },
          groups: [{ propertyId: 'prop_status', direction: 'asc', hideEmpty: false }],
          projection: { propertyIds: ['prop_title', 'prop_status', 'prop_cover'] },
        },
      ],
    };
    expect(DatabaseDefinitionSchema.safeParse(boardDefinition).success).toBe(true);
    const withoutGroup = structuredClone(boardDefinition);
    withoutGroup.views[0].groups = [];
    expect(DatabaseDefinitionSchema.safeParse(withoutGroup).success).toBe(false);
    const invalidPreview = structuredClone(boardDefinition);
    invalidPreview.views[0].layout.configuration.cardPreview.propertyId = 'prop_title';
    expect(DatabaseDefinitionSchema.safeParse(invalidPreview).success).toBe(false);
  });

  test('validates typed Timeline date mappings, scales, and same-source dependencies', () => {
    const definition = validDefinition();
    const timelineDefinition = {
      ...definition,
      sources: [
        {
          ...definition.sources[0],
          properties: [
            ...(definition.sources[0]?.properties ?? []),
            { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' },
            { id: 'prop_due', key: 'due', name: 'Due', type: 'date' },
            {
              id: 'prop_dependencies',
              key: 'dependencies',
              name: 'Dependencies',
              type: 'relation',
              targetSourceId: 'ds_feedback',
              cardinality: 'many',
            },
          ],
        },
      ],
      views: [
        {
          id: 'view_feedback_timeline',
          key: 'feedback-timeline',
          name: 'Feedback timeline',
          sourceId: 'ds_feedback',
          layout: {
            type: 'timeline',
            configuration: {
              dateMapping: {
                type: 'separate',
                startPropertyId: 'prop_schedule',
                endPropertyId: 'prop_due',
              },
              scale: 'month',
              showTable: true,
              showToday: true,
              showDependencies: true,
              dependencyPropertyId: 'prop_dependencies',
              noDateLane: true,
              loadLimit: 50,
            },
          },
          groups: [{ propertyId: 'prop_status', direction: 'asc', hideEmpty: false }],
          projection: {
            propertyIds: ['prop_title', 'prop_status', 'prop_schedule', 'prop_due'],
          },
        },
      ],
    };
    expect(DatabaseDefinitionSchema.safeParse(timelineDefinition).success).toBe(true);
    const invalidMapping = structuredClone(timelineDefinition);
    invalidMapping.views[0].layout.configuration.dateMapping.startPropertyId = 'prop_title';
    expect(DatabaseDefinitionSchema.safeParse(invalidMapping).success).toBe(false);
    const repeatedMapping = structuredClone(timelineDefinition);
    repeatedMapping.views[0].layout.configuration.dateMapping.endPropertyId = 'prop_schedule';
    expect(DatabaseDefinitionSchema.safeParse(repeatedMapping).success).toBe(false);
    const invalidDependency = structuredClone(timelineDefinition);
    invalidDependency.views[0].layout.configuration.dependencyPropertyId = 'prop_status';
    expect(DatabaseDefinitionSchema.safeParse(invalidDependency).success).toBe(false);
  });

  test('validates typed Calendar Date mapping, display, timezone, and day limits', () => {
    const definition = validDefinition();
    const calendarDefinition = {
      ...definition,
      sources: [
        {
          ...definition.sources[0],
          properties: [
            ...(definition.sources[0]?.properties ?? []),
            { id: 'prop_schedule', key: 'schedule', name: 'Schedule', type: 'date' },
          ],
        },
      ],
      views: [
        {
          id: 'view_feedback_calendar',
          key: 'feedback-calendar',
          name: 'Feedback calendar',
          sourceId: 'ds_feedback',
          layout: {
            type: 'calendar',
            configuration: {
              datePropertyId: 'prop_schedule',
              display: 'week',
              weekStartsOn: 'monday',
              timeZone: 'Asia/Seoul',
              showWeekends: false,
              cardLimitPerDay: 8,
            },
          },
          projection: { propertyIds: ['prop_title', 'prop_status'] },
        },
      ],
    };
    expect(DatabaseDefinitionSchema.safeParse(calendarDefinition).success).toBe(true);
    const invalidProperty = structuredClone(calendarDefinition);
    invalidProperty.views[0].layout.configuration.datePropertyId = 'prop_title';
    expect(DatabaseDefinitionSchema.safeParse(invalidProperty).success).toBe(false);
    const invalidZone = structuredClone(calendarDefinition);
    invalidZone.views[0].layout.configuration.timeZone = 'Mars/Olympus';
    expect(DatabaseDefinitionSchema.safeParse(invalidZone).success).toBe(false);
    const invalidLimit = structuredClone(calendarDefinition);
    invalidLimit.views[0].layout.configuration.cardLimitPerDay = 101;
    expect(DatabaseDefinitionSchema.safeParse(invalidLimit).success).toBe(false);
  });

  test('validates typed List hierarchy, density, sections, and load limits', () => {
    const definition = validDefinition();
    const listDefinition = {
      ...definition,
      sources: [
        {
          ...definition.sources[0],
          properties: [
            ...(definition.sources[0]?.properties ?? []),
            {
              id: 'prop_parent',
              key: 'parent',
              name: 'Parent',
              type: 'relation',
              targetSourceId: 'ds_feedback',
              cardinality: 'one',
            },
          ],
        },
      ],
      views: [
        {
          id: 'view_feedback_list',
          key: 'feedback-list',
          name: 'Feedback list',
          sourceId: 'ds_feedback',
          layout: {
            type: 'list',
            configuration: {
              hierarchy: { type: 'parent_relation', propertyId: 'prop_parent' },
              density: 'compact',
              showSections: true,
              collapsibleSections: true,
              showDividers: true,
              loadLimit: 50,
            },
          },
          groups: [{ propertyId: 'prop_status', direction: 'asc', hideEmpty: false }],
          projection: { propertyIds: ['prop_title', 'prop_status'] },
        },
      ],
    };
    expect(DatabaseDefinitionSchema.safeParse(listDefinition).success).toBe(true);
    const invalidHierarchy = structuredClone(listDefinition);
    invalidHierarchy.views[0].layout.configuration.hierarchy.propertyId = 'prop_status';
    expect(DatabaseDefinitionSchema.safeParse(invalidHierarchy).success).toBe(false);
    const invalidLimit = structuredClone(listDefinition);
    invalidLimit.views[0].layout.configuration.loadLimit = 501;
    expect(DatabaseDefinitionSchema.safeParse(invalidLimit).success).toBe(false);
  });

  test('validates typed Gallery preview, media display, and load limits', () => {
    const definition = validDefinition();
    const galleryDefinition = {
      ...definition,
      sources: [
        {
          ...definition.sources[0],
          properties: [
            ...(definition.sources[0]?.properties ?? []),
            { id: 'prop_media', key: 'media', name: 'Media', type: 'files' },
          ],
        },
      ],
      views: [
        {
          id: 'view_feedback_gallery',
          key: 'feedback-gallery',
          name: 'Feedback gallery',
          sourceId: 'ds_feedback',
          layout: {
            type: 'gallery',
            configuration: {
              cardSize: 'large',
              cardPreview: { type: 'files', propertyId: 'prop_media' },
              fitImage: true,
              showTitle: false,
              fallbackStyle: 'document',
              loadLimit: 40,
            },
          },
          groups: [],
          projection: { propertyIds: ['prop_title', 'prop_status'] },
        },
      ],
    };
    expect(DatabaseDefinitionSchema.safeParse(galleryDefinition).success).toBe(true);
    const invalidPreview = structuredClone(galleryDefinition);
    invalidPreview.views[0].layout.configuration.cardPreview.propertyId = 'prop_status';
    expect(DatabaseDefinitionSchema.safeParse(invalidPreview).success).toBe(false);
    const invalidLimit = structuredClone(galleryDefinition);
    invalidLimit.views[0].layout.configuration.loadLimit = 501;
    expect(DatabaseDefinitionSchema.safeParse(invalidLimit).success).toBe(false);
  });

  test('validates typed Chart dimensions, measures, display controls, and limits', () => {
    const definition = validDefinition();
    const chartDefinition = {
      ...definition,
      sources: [
        {
          ...definition.sources[0],
          properties: [
            ...(definition.sources[0]?.properties ?? []),
            { id: 'prop_effort', key: 'effort', name: 'Effort', type: 'number' },
          ],
        },
      ],
      views: [
        {
          id: 'view_feedback_chart',
          key: 'feedback-chart',
          name: 'Feedback chart',
          sourceId: 'ds_feedback',
          layout: {
            type: 'chart',
            configuration: {
              chartType: 'vertical_bar',
              dimension: { propertyId: 'prop_status', arrayMode: 'each' },
              measure: { type: 'property', propertyId: 'prop_effort', function: 'sum' },
              showLegend: true,
              showLabels: true,
              showAxisNames: true,
              groupLimit: 50,
              loadLimit: 200,
            },
          },
          groups: [],
          projection: { propertyIds: ['prop_title'] },
        },
      ],
    };
    expect(DatabaseDefinitionSchema.safeParse(chartDefinition).success).toBe(true);
    const missingDimension = structuredClone(chartDefinition);
    delete missingDimension.views[0].layout.configuration.dimension;
    expect(DatabaseDefinitionSchema.safeParse(missingDimension).success).toBe(false);
    const invalidMeasure = structuredClone(chartDefinition);
    invalidMeasure.views[0].layout.configuration.measure.propertyId = 'prop_status';
    expect(DatabaseDefinitionSchema.safeParse(invalidMeasure).success).toBe(false);
    const invalidLimit = structuredClone(chartDefinition);
    invalidLimit.views[0].layout.configuration.groupLimit = 201;
    expect(DatabaseDefinitionSchema.safeParse(invalidLimit).success).toBe(false);
  });

  test('validates typed Form access, ordered conditions, uploads, and response policies', () => {
    const definition = validDefinition();
    definition.sources[0]?.properties.push(
      { id: 'prop_email', key: 'email', name: 'Email', type: 'email' },
      { id: 'prop_files', key: 'files', name: 'Files', type: 'files' },
    );
    const formDefinition = {
      ...definition,
      views: [
        {
          id: 'view_feedback_form',
          key: 'feedback-form',
          name: 'Feedback form',
          sourceId: 'ds_feedback',
          layout: {
            type: 'form',
            configuration: {
              access: 'public',
              title: 'Send feedback',
              questions: [
                {
                  id: 'frmq_001_title',
                  propertyId: 'prop_title',
                  label: 'Subject',
                  required: true,
                },
                {
                  id: 'frmq_002_email',
                  propertyId: 'prop_email',
                  label: 'Email',
                  required: true,
                },
                {
                  id: 'frmq_003_files',
                  propertyId: 'prop_files',
                  label: 'Attachments',
                  visibleWhen: {
                    mode: 'all',
                    conditions: [
                      {
                        questionId: 'frmq_002_email',
                        operator: 'is_not_empty',
                      },
                    ],
                  },
                },
              ],
              fileUploads: { enabled: true, maxFilesPerQuestion: 3 },
              duplicateSubmission: { type: 'reject_property', propertyId: 'prop_email' },
              retention: { type: 'delete_after', days: 30 },
              closesAt: '2027-01-01T00:00:00.000Z',
            },
          },
          projection: { propertyIds: ['prop_title', 'prop_email', 'prop_files'] },
        },
      ],
    };
    expect(DatabaseDefinitionSchema.safeParse(formDefinition).success).toBe(true);

    const forwardCondition = structuredClone(formDefinition);
    forwardCondition.views[0].layout.configuration.questions[0].visibleWhen = {
      mode: 'all',
      conditions: [{ questionId: 'frmq_002_email', operator: 'is_not_empty' }],
    };
    expect(DatabaseDefinitionSchema.safeParse(forwardCondition).success).toBe(false);

    const uploadsDisabled = structuredClone(formDefinition);
    uploadsDisabled.views[0].layout.configuration.fileUploads.enabled = false;
    expect(DatabaseDefinitionSchema.safeParse(uploadsDisabled).success).toBe(false);

    const wrongDuplicateProperty = structuredClone(formDefinition);
    wrongDuplicateProperty.views[0].layout.configuration.duplicateSubmission.propertyId =
      'prop_files';
    expect(DatabaseDefinitionSchema.safeParse(wrongDuplicateProperty).success).toBe(false);
  });

  test('validates ordered conditional color rules and source-local property references', () => {
    const conditionalColors = [
      {
        id: 'ccr_urgent_row',
        key: 'urgent-row',
        name: 'Urgent row',
        color: 'red' as const,
        where: { propertyId: 'prop_status', operator: 'eq' as const, value: 'opt_new' },
        applyTo: { type: 'page' as const },
      },
      {
        id: 'ccr_done_status',
        key: 'done-status',
        name: 'Done status',
        color: 'green' as const,
        where: { propertyId: 'prop_status', operator: 'eq' as const, value: 'opt_done' },
        applyTo: { type: 'property' as const, propertyId: 'prop_status' },
      },
    ];
    const parsed = DatabaseViewSchema.parse({
      id: 'view_feedback',
      key: 'feedback',
      name: 'Feedback',
      sourceId: 'ds_feedback',
      layout: { type: 'table', configuration: {} },
      conditionalColors,
      projection: { propertyIds: ['prop_title', 'prop_status'] },
    });
    expect(parsed.conditionalColors).toEqual(conditionalColors);

    expect(
      DatabaseViewSchema.safeParse({
        ...parsed,
        conditionalColors: [
          conditionalColors[0],
          { ...conditionalColors[1], id: 'ccr_urgent_row' },
        ],
      }).success,
    ).toBe(false);

    const definition = validDefinition();
    Object.assign(definition, { views: [parsed] });
    expect(DatabaseDefinitionSchema.safeParse(definition).success).toBe(true);
    const invalid = structuredClone(definition);
    invalid.views[0].conditionalColors[0].where.propertyId = 'prop_outside_source';
    expect(DatabaseDefinitionSchema.safeParse(invalid).success).toBe(false);
  });

  test('validates stable linked database-view references without record payloads', () => {
    expect(
      DatabaseLinkedViewReferenceSchema.parse({
        databaseId: 'db_feedback',
        sourceId: 'ds_feedback',
        viewId: 'view_feedback_table',
      }),
    ).toEqual({
      version: 1,
      databaseId: 'db_feedback',
      sourceId: 'ds_feedback',
      viewId: 'view_feedback_table',
      mode: 'inline',
    });
    expect(
      DatabaseLinkedViewReferenceSchema.safeParse({
        databaseId: 'db_feedback',
        sourceId: 'ds_feedback',
        viewId: 'view_feedback_table',
        records: [{ title: 'must not be embedded' }],
      }).success,
    ).toBe(false);

    const canonicalView = DatabaseViewSchema.parse({
      id: 'view_feedback_table',
      key: 'feedback-table',
      name: 'Feedback table',
      sourceId: 'ds_feedback',
      layout: { type: 'table', configuration: {} },
      where: { propertyId: 'prop_status', operator: 'eq', value: 'opt_new' },
      sort: [],
      groups: [],
      projection: { propertyIds: ['prop_title', 'prop_status'] },
    });
    const overrides = DatabaseLinkedViewSettingsSchema.parse({
      where: null,
      sort: [{ propertyId: 'prop_title', direction: 'desc' }],
      projection: { propertyIds: ['prop_title'] },
    });
    expect(
      DatabaseLinkedViewReferenceSchema.parse({
        databaseId: 'db_feedback',
        sourceId: 'ds_feedback',
        viewId: canonicalView.id,
        viewOverrides: overrides,
      }).viewOverrides,
    ).toEqual(overrides);
    expect(applyDatabaseLinkedViewSettings(canonicalView, overrides)).toMatchObject({
      sort: [{ propertyId: 'prop_title', direction: 'desc' }],
      projection: { propertyIds: ['prop_title'] },
    });
    expect(applyDatabaseLinkedViewSettings(canonicalView, overrides).where).toBeUndefined();
  });
  test('validates canonical Unique ID prefix and monotonic watermark state', () => {
    const property = DatabasePropertySchema.parse({
      id: 'prop_ticket',
      key: 'ticket',
      name: 'Ticket',
      type: 'unique_id',
      prefix: 'TASK',
      nextNumber: 41,
    });
    expect(property).toMatchObject({
      type: 'unique_id',
      required: false,
      prefix: 'TASK',
      nextNumber: 41,
    });
    expect(
      DatabasePropertySchema.safeParse({
        id: 'prop_ticket',
        key: 'ticket',
        name: 'Ticket',
        type: 'unique_id',
        prefix: 'bad prefix',
        nextNumber: 1,
      }).success,
    ).toBe(false);
    expect(
      DatabasePropertySchema.safeParse({
        id: 'prop_ticket',
        key: 'ticket',
        name: 'Ticket',
        type: 'unique_id',
        prefix: 'TASK',
        nextNumber: 0,
      }).success,
    ).toBe(false);
  });

  test('validates Button action IDs, stable references, ordering, and secret isolation', () => {
    const button = validDefinition();
    button.sources[0]?.properties.push({
      id: 'prop_finish',
      key: 'finish',
      name: 'Finish',
      type: 'button',
      label: 'Mark done',
      actions: [
        {
          id: 'mark_done',
          kind: 'update_record',
          operations: [{ op: 'set', propertyId: 'prop_status', value: 'opt_done' }],
        },
        {
          id: 'notify',
          kind: 'external_webhook',
          connectionId: 'conn_tracker',
          eventName: 'task_finished',
          propertyIds: ['prop_title'],
        },
      ],
    });
    const parsed = DatabaseDefinitionSchema.parse(button);
    const property = parsed.sources[0]?.properties.at(-1);
    expect(property).toMatchObject({
      type: 'button',
      required: false,
      actions: [
        expect.objectContaining({ kind: 'update_record' }),
        expect.objectContaining({ connectionId: 'conn_tracker' }),
      ],
    });
    expect(JSON.stringify(property)).not.toContain('https://');
    expect(JSON.stringify(property)).not.toContain('secret');

    const unknownTarget = structuredClone(button);
    const unknownButton = unknownTarget.sources[0]?.properties.at(-1);
    if (!unknownButton || unknownButton.type !== 'button')
      throw new Error('button fixture missing');
    const update = unknownButton.actions[0];
    if (!update || update.kind !== 'update_record')
      throw new Error('button update fixture missing');
    update.operations[0] = { op: 'set', propertyId: 'prop_missing', value: 'opt_done' };
    expect(DatabaseDefinitionSchema.safeParse(unknownTarget).success).toBe(false);

    const unsafeOrdering = structuredClone(button);
    const orderedButton = unsafeOrdering.sources[0]?.properties.at(-1);
    if (!orderedButton || orderedButton.type !== 'button')
      throw new Error('button fixture missing');
    orderedButton.actions.reverse();
    expect(DatabaseDefinitionSchema.safeParse(unsafeOrdering).success).toBe(false);

    const duplicatedPayload = structuredClone(button);
    const duplicateButton = duplicatedPayload.sources[0]?.properties.at(-1);
    if (!duplicateButton || duplicateButton.type !== 'button')
      throw new Error('button fixture missing');
    const webhook = duplicateButton.actions[1];
    if (!webhook || webhook.kind !== 'external_webhook') throw new Error('webhook fixture missing');
    webhook.propertyIds.push('prop_title');
    expect(DatabaseDefinitionSchema.safeParse(duplicatedPayload).success).toBe(false);

    const incompatibleOperation = structuredClone(button);
    const incompatibleButton = incompatibleOperation.sources[0]?.properties.at(-1);
    if (!incompatibleButton || incompatibleButton.type !== 'button') {
      throw new Error('button fixture missing');
    }
    const incompatibleUpdate = incompatibleButton.actions[0];
    if (!incompatibleUpdate || incompatibleUpdate.kind !== 'update_record') {
      throw new Error('button update fixture missing');
    }
    incompatibleUpdate.operations[0] = {
      op: 'increment',
      propertyId: 'prop_status',
      by: 1,
    };
    expect(DatabaseDefinitionSchema.safeParse(incompatibleOperation).success).toBe(false);

    const unsupportedComposition = structuredClone(button);
    const composedButton = unsupportedComposition.sources[0]?.properties.at(-1);
    if (!composedButton || composedButton.type !== 'button')
      throw new Error('button fixture missing');
    composedButton.actions.splice(1, 0, {
      id: 'archive_after_update',
      kind: 'archive_record',
      action: 'archive',
    });
    expect(DatabaseDefinitionSchema.safeParse(unsupportedComposition).success).toBe(false);
  });

  test('validates database-level multi-step create Buttons and their placement', () => {
    const definition = {
      ...validDefinition(),
      buttons: [
        {
          id: 'dbbtn_pair',
          key: 'create-pair',
          name: 'Create pair',
          placement: { kind: 'source', sourceId: 'ds_feedback' },
          actions: [
            {
              id: 'create_first',
              kind: 'create_record',
              sourceId: 'ds_feedback',
              values: { prop_title: 'First', prop_status: 'opt_new' },
              body: '',
            },
            {
              id: 'create_second',
              kind: 'create_record',
              sourceId: 'ds_feedback',
              values: { prop_title: 'Second', prop_status: 'opt_new' },
              body: '',
            },
          ],
        },
      ],
    };
    expect(DatabaseDefinitionSchema.parse(definition).buttons[0]?.id).toBe('dbbtn_pair');
    const missingPlacement = structuredClone(definition);
    if (missingPlacement.buttons[0]?.placement.kind === 'source') {
      missingPlacement.buttons[0].placement.sourceId = 'ds_missing';
    }
    expect(DatabaseDefinitionSchema.safeParse(missingPlacement).success).toBe(false);
    const nonCreate = structuredClone(definition) as unknown as {
      buttons: Array<{ actions: unknown[] }>;
    };
    nonCreate.buttons[0]?.actions.push({
      id: 'mutate_current',
      kind: 'update_record',
      operations: [{ op: 'set', propertyId: 'prop_status', value: 'opt_done' }],
    });
    expect(DatabaseDefinitionSchema.safeParse(nonCreate).success).toBe(false);
  });

  test('validates safe link property values consistently', () => {
    expect(isValidDatabaseUrl('https://example.com/path?q=1')).toBe(true);
    expect(isValidDatabaseUrl('http://localhost:3000')).toBe(true);
    expect(isValidDatabaseUrl('javascript:alert(1)')).toBe(false);
    expect(isValidDatabaseUrl('ftp://example.com/file')).toBe(false);
    expect(isValidDatabaseEmail('owner@example.com')).toBe(true);
    expect(isValidDatabaseEmail('owner @example.com')).toBe(false);
    expect(isValidDatabasePhone('+82 (2) 1234-5678')).toBe(true);
    expect(isValidDatabasePhone('call me')).toBe(false);
    expect(isValidDatabasePhone('12')).toBe(false);
  });

  test('validates constraint applicability, ranges, patterns, and defaults', () => {
    const constrained = validDefinition();
    constrained.sources[0]?.properties.push({
      id: 'prop_score',
      key: 'score',
      name: 'Score',
      type: 'number',
      semantics: {
        constraints: { unique: false, min: 0, max: 10 },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
        defaultValue: 5,
      },
    });
    expect(DatabaseDefinitionSchema.safeParse(constrained).success).toBe(true);

    const reversed = structuredClone(constrained);
    const score = reversed.sources[0]?.properties.find((property) => property.key === 'score');
    if (!score?.semantics) throw new Error('score fixture missing');
    score.semantics.constraints.min = 11;
    expect(DatabaseDefinitionSchema.safeParse(reversed).success).toBe(false);

    const invalidDefault = structuredClone(constrained);
    const invalidScore = invalidDefault.sources[0]?.properties.find(
      (property) => property.key === 'score',
    );
    if (!invalidScore?.semantics) throw new Error('score fixture missing');
    invalidScore.semantics.defaultValue = 20;
    expect(DatabaseDefinitionSchema.safeParse(invalidDefault).success).toBe(false);

    const invalidPattern = validDefinition();
    const title = invalidPattern.sources[0]?.properties[0];
    if (!title) throw new Error('title fixture missing');
    title.semantics = {
      constraints: { unique: false, pattern: '[' },
      inferencePolicy: 'explicit_only',
      sensitivity: 'inherit',
    };
    expect(DatabaseDefinitionSchema.safeParse(invalidPattern).success).toBe(false);
  });

  test('validates number format styles and options without changing canonical storage', () => {
    const formatted = validDefinition();
    formatted.sources[0]?.properties.push({
      id: 'prop_budget',
      key: 'budget',
      name: 'Budget',
      type: 'number',
      semantics: {
        constraints: { unique: false },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
        format: {
          style: 'currency',
          options: { currency: 'KRW', useGrouping: true, maximumFractionDigits: 0 },
        },
      },
    });
    expect(DatabaseDefinitionSchema.safeParse(formatted).success).toBe(true);

    const invalidCurrency = structuredClone(formatted);
    const budget = invalidCurrency.sources[0]?.properties.find(
      (property) => property.key === 'budget',
    );
    if (!budget?.semantics?.format) throw new Error('budget format missing');
    budget.semantics.format.options.currency = 'won';
    expect(DatabaseDefinitionSchema.safeParse(invalidCurrency).success).toBe(false);

    const invalidPrecision = structuredClone(formatted);
    const precision = invalidPrecision.sources[0]?.properties.find(
      (property) => property.key === 'budget',
    );
    if (!precision?.semantics?.format) throw new Error('budget format missing');
    precision.semantics.format.options.minimumFractionDigits = 4;
    precision.semantics.format.options.maximumFractionDigits = 2;
    expect(DatabaseDefinitionSchema.safeParse(invalidPrecision).success).toBe(false);
  });

  test('applies explicit v1 defaults and round-trips as YAML', () => {
    const parsed = DatabaseDefinitionSchema.parse(validDefinition());
    expect(parsed.aliases).toEqual([]);
    expect(parsed.sourceMappings).toBeUndefined();
    expect(parsed.views).toEqual([]);
    expect(parsed.contract).toMatchObject({
      purpose: 'Track customer feedback',
      canonicality: 'canonical',
      freshness: { expectation: 'daily', maxAgeSeconds: 86_400 },
      sensitivity: 'internal',
    });
    expect(parsed.sources[0]?.includeSubfolders).toBe(true);
    expect(parsed.sources[0]?.properties[0]).toMatchObject({ required: true, aliases: [] });
    expect(parsed.sources[0]?.properties[0]?.semantics).toEqual({
      constraints: { unique: false },
      inferencePolicy: 'explicit_only',
      sensitivity: 'inherit',
    });

    const yaml = serializeDatabaseManifestYaml(parsed);
    const reparsed = parseDatabaseManifestYaml(yaml);
    expect(reparsed).toEqual({ ok: true, definition: parsed });
  });

  test('validates directed multi-source property and option compatibility mappings', () => {
    const base = DatabaseDefinitionSchema.parse(validDefinition());
    const archive = structuredClone(base.sources[0]);
    if (!archive) throw new Error('source fixture is missing');
    archive.id = 'ds_archive';
    archive.key = 'archive';
    archive.name = 'Archive';
    archive.folder = 'archive';
    const archiveTitle = archive.properties.find((property) => property.type === 'title');
    const archiveStatus = archive.properties.find((property) => property.type === 'select');
    if (!archiveTitle || !archiveStatus) throw new Error('property fixture is missing');
    archiveTitle.id = 'prop_archive_name';
    archiveTitle.key = 'name';
    archiveStatus.id = 'prop_archive_state';
    archiveStatus.key = 'state';
    archiveStatus.options[0] = {
      id: 'opt_archive_open',
      key: 'open',
      name: 'Open',
    };
    archiveStatus.options[1] = {
      id: 'opt_archive_closed',
      key: 'closed',
      name: 'Closed',
    };
    const mapped = DatabaseDefinitionSchema.parse({
      ...base,
      sources: [...base.sources, archive],
      sourceMappings: [
        {
          sourceId: 'ds_feedback',
          targetSourceId: 'ds_archive',
          propertyMappings: [
            {
              sourcePropertyId: 'prop_title',
              targetPropertyId: 'prop_archive_name',
            },
            {
              sourcePropertyId: 'prop_status',
              targetPropertyId: 'prop_archive_state',
              optionMappings: [
                { sourceOptionId: 'opt_new', targetOptionId: 'opt_archive_open' },
                { sourceOptionId: 'opt_done', targetOptionId: 'opt_archive_closed' },
              ],
            },
          ],
        },
      ],
    });
    expect(mapped.sourceMappings?.[0]).toMatchObject({
      sourceId: 'ds_feedback',
      targetSourceId: 'ds_archive',
      propertyMappings: [
        { sourcePropertyId: 'prop_title', targetPropertyId: 'prop_archive_name' },
        { sourcePropertyId: 'prop_status', targetPropertyId: 'prop_archive_state' },
      ],
    });
    expect(parseDatabaseManifestYaml(serializeDatabaseManifestYaml(mapped))).toEqual({
      ok: true,
      definition: mapped,
    });

    const missingTitle = structuredClone(mapped);
    missingTitle.sourceMappings[0]?.propertyMappings.shift();
    expect(DatabaseDefinitionSchema.safeParse(missingTitle).success).toBe(false);

    const duplicateTarget = structuredClone(mapped);
    const duplicateMapping = duplicateTarget.sourceMappings[0]?.propertyMappings[1];
    if (!duplicateMapping) throw new Error('mapping fixture is missing');
    duplicateMapping.targetPropertyId = 'prop_archive_name';
    expect(DatabaseDefinitionSchema.safeParse(duplicateTarget).success).toBe(false);
  });

  test('updates values without discarding comments, mapping order, or stable sequence nodes', () => {
    const base = DatabaseDefinitionSchema.parse(validDefinition());
    const secondary = structuredClone(base.sources[0]);
    if (!secondary) throw new Error('source fixture is missing');
    secondary.id = 'ds_archive';
    secondary.key = 'archive';
    secondary.name = 'Archive';
    secondary.folder = 'archive';
    for (const property of secondary.properties) {
      property.id = `${property.id}_archive` as typeof property.id;
      if (property.type === 'select') {
        for (const option of property.options) {
          option.id = `${option.id}_archive` as typeof option.id;
        }
      }
    }
    const definition = DatabaseDefinitionSchema.parse({
      ...base,
      sources: [...base.sources, secondary],
    });
    const original = serializeDatabaseManifestYaml(definition)
      .replace('version: 1\n', '# canonical database comment\nversion: 1\n')
      .replace('name: Feedback\n', 'name: "Feedback" # database display name\n')
      .replace('  - id: ds_archive\n', '  # secondary source stays second\n  - id: ds_archive\n')
      .replace(
        '          - id: opt_new\n',
        '          # retain this option comment\n          - id: opt_new\n',
      );
    const parsed = parseDatabaseManifestYaml(original);
    if (!parsed.ok) throw new Error(parsed.error);
    const desired = structuredClone(parsed.definition);
    desired.name = 'Updated feedback';
    const status = desired.sources[0]?.properties.find((property) => property.id === 'prop_status');
    if (!status || status.type !== 'select') throw new Error('status fixture is missing');
    const newOption = status.options.find((option) => option.id === 'opt_new');
    if (!newOption) throw new Error('new option fixture is missing');
    newOption.name = 'Newly received';

    const updated = updateDatabaseManifestYaml(original, desired);

    expect(updated).toStartWith('# canonical database comment\nversion: 1\n');
    expect(updated).toContain('name: "Updated feedback" # database display name');
    expect(updated).toContain(
      '# retain this option comment\n          - id: opt_new\n            key: new\n            name: Newly received',
    );
    expect(updated.indexOf('version:')).toBeLessThan(updated.indexOf('\nid:'));
    expect(updated.indexOf('\nid:')).toBeLessThan(updated.indexOf('\nkey:'));
    expect(updated.indexOf('id: opt_new')).toBeLessThan(updated.indexOf('id: opt_done'));
    expect(updated.indexOf('id: ds_feedback')).toBeLessThan(updated.indexOf('id: ds_archive'));
    expect(updated).toContain('# secondary source stays second\n  - id: ds_archive');
    expect(parseDatabaseManifestYaml(updated)).toEqual({ ok: true, definition: desired });
  });

  test('requires exactly one title and unique property IDs', () => {
    const parsed = DatabaseDefinitionSchema.parse(validDefinition());
    expect(
      parsed.sources[0]?.properties.find((property) => property.type === 'title'),
    ).toMatchObject({ required: true });

    const noTitle = validDefinition();
    const noTitleSource = noTitle.sources[0];
    if (!noTitleSource) throw new Error('fixture source is missing');
    noTitleSource.properties = noTitleSource.properties.filter(
      (property) => property.type !== 'title',
    );
    expect(DatabaseDefinitionSchema.safeParse(noTitle).success).toBe(false);

    const twoTitles = validDefinition();
    twoTitles.sources[0]?.properties.push({
      id: 'prop_secondary_title',
      key: 'secondary_title',
      name: 'Secondary title',
      type: 'title',
    });
    expect(DatabaseDefinitionSchema.safeParse(twoTitles).success).toBe(false);

    const optionalTitle = validDefinition() as unknown as {
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
    };
    const title = optionalTitle.sources[0]?.properties.find(
      (property) => property.type === 'title',
    );
    if (!title) throw new Error('fixture title property is missing');
    title.required = false;
    expect(DatabaseDefinitionSchema.safeParse(optionalTitle).success).toBe(false);

    const duplicate = validDefinition();
    duplicate.sources.push({
      id: 'ds_second',
      key: 'second',
      name: 'Second',
      recordMeaning: 'One secondary report',
      folder: 'second',
      properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
    });
    const result = DatabaseDefinitionSchema.safeParse(duplicate);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('unique across'))).toBe(
        true,
      );
    }
  });

  test('rejects relation targets that are not declared in the database', () => {
    const definition = validDefinition();
    const firstSource = definition.sources[0];
    if (!firstSource) throw new Error('fixture source is missing');
    firstSource.properties.push({
      id: 'prop_project',
      key: 'project',
      name: 'Project',
      type: 'relation',
      targetSourceId: 'ds_missing',
      cardinality: 'one',
    });
    const result = DatabaseDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('not defined'))).toBe(true);
    }
  });

  test('accepts only symmetric stable relation-property pairs', () => {
    const definition = validDefinition();
    const feedback = definition.sources[0];
    if (!feedback) throw new Error('fixture source is missing');
    feedback.properties.push({
      id: 'prop_project',
      key: 'project',
      name: 'Project',
      type: 'relation',
      targetSourceId: 'ds_projects',
      cardinality: 'one',
      pairedPropertyId: 'prop_feedback',
    });
    definition.sources.push({
      id: 'ds_projects',
      key: 'projects',
      name: 'Projects',
      recordMeaning: 'One project',
      folder: 'projects',
      properties: [
        { id: 'prop_project_title', key: 'title', name: 'Title', type: 'title' },
        {
          id: 'prop_feedback',
          key: 'feedback',
          name: 'Feedback',
          type: 'relation',
          targetSourceId: 'ds_feedback',
          cardinality: 'many',
          pairedPropertyId: 'prop_project',
        },
      ],
    });

    const parsed = DatabaseDefinitionSchema.parse(definition);
    expect(parseDatabaseManifestYaml(serializeDatabaseManifestYaml(parsed))).toEqual({
      ok: true,
      definition: parsed,
    });

    const missingInverse = structuredClone(definition);
    const inverse = missingInverse.sources[1]?.properties[1];
    if (!inverse || inverse.type !== 'relation') throw new Error('inverse fixture is missing');
    delete inverse.pairedPropertyId;
    expect(DatabaseDefinitionSchema.safeParse(missingInverse).success).toBe(false);

    const wrongTarget = structuredClone(definition);
    const wrongInverse = wrongTarget.sources[1]?.properties[1];
    if (!wrongInverse || wrongInverse.type !== 'relation') {
      throw new Error('inverse fixture is missing');
    }
    wrongInverse.targetSourceId = 'ds_projects';
    expect(DatabaseDefinitionSchema.safeParse(wrongTarget).success).toBe(false);

    const missingProperty = structuredClone(definition);
    const relation = missingProperty.sources[0]?.properties[2];
    if (!relation || relation.type !== 'relation') throw new Error('relation fixture is missing');
    relation.pairedPropertyId = 'prop_missing';
    expect(DatabaseDefinitionSchema.safeParse(missingProperty).success).toBe(false);
  });

  test('round-trips read-only Formula/Rollup properties and validates their dependency contracts', () => {
    const computed = validDefinition() as unknown as {
      sources: Array<{
        id: string;
        key: string;
        name: string;
        recordMeaning: string;
        folder: string;
        properties: Array<Record<string, unknown>>;
      }>;
    };
    computed.sources.push({
      id: 'ds_projects',
      key: 'projects',
      name: 'Projects',
      recordMeaning: 'One project',
      folder: 'projects',
      properties: [
        { id: 'prop_project_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_budget', key: 'budget', name: 'Budget', type: 'number' },
      ],
    });
    computed.sources[0]?.properties.push(
      {
        id: 'prop_projects',
        key: 'projects',
        name: 'Projects',
        type: 'relation',
        targetSourceId: 'ds_projects',
        cardinality: 'many',
      },
      {
        id: 'prop_status_label',
        key: 'status_label',
        name: 'Status label',
        type: 'formula',
        source: 'prop("status")',
        ast: {
          language: 'synapse-formula-1',
          version: 1,
          resultType: 'text',
          expression: { type: 'property', propertyId: 'prop_status' },
        },
      },
      {
        id: 'prop_total_budget',
        key: 'total_budget',
        name: 'Total budget',
        type: 'rollup',
        relationPropertyId: 'prop_projects',
        targetPropertyId: 'prop_budget',
        function: 'sum',
        targetValueType: 'number',
      },
    );

    const parsed = DatabaseDefinitionSchema.parse(computed);
    expect(parsed.sources[0]?.properties.slice(-2)).toMatchObject([
      { type: 'formula', required: false },
      { type: 'rollup', required: false },
    ]);
    expect(parseDatabaseManifestYaml(serializeDatabaseManifestYaml(parsed))).toEqual({
      ok: true,
      definition: parsed,
    });
    const parsedFormula = parsed.sources[0]?.properties.find(
      (property) => property.type === 'formula',
    );
    if (!parsedFormula) throw new Error('formula fixture missing');
    parsedFormula.semantics.constraints.unique = true;
    const independentlyParsed = DatabaseDefinitionSchema.parse(computed);
    expect(
      independentlyParsed.sources[0]?.properties.find((property) => property.type === 'formula')
        ?.semantics.constraints.unique,
    ).toBe(false);

    const badTarget = structuredClone(computed);
    const rollup = badTarget.sources[0]?.properties.find((property) => property.type === 'rollup');
    if (!rollup) throw new Error('rollup fixture missing');
    rollup.targetPropertyId = 'prop_missing';
    expect(DatabaseDefinitionSchema.safeParse(badTarget).success).toBe(false);

    const writable = structuredClone(computed);
    const formula = writable.sources[0]?.properties.find((property) => property.type === 'formula');
    if (!formula) throw new Error('formula fixture missing');
    formula.required = true;
    expect(DatabaseDefinitionSchema.safeParse(writable).success).toBe(false);

    const cycle = structuredClone(computed);
    const cyclicFormula = cycle.sources[0]?.properties.find(
      (property) => property.type === 'formula',
    );
    if (!cyclicFormula?.ast || typeof cyclicFormula.ast !== 'object') {
      throw new Error('formula fixture missing');
    }
    (cyclicFormula.ast as { expression: unknown }).expression = {
      type: 'property',
      propertyId: 'prop_status_label',
    };
    expect(DatabaseDefinitionSchema.safeParse(cycle).success).toBe(false);
  });

  test('validates stable saved views against their source property IDs', () => {
    const definition = {
      ...validDefinition(),
      views: [
        {
          id: 'view_feedback_table',
          key: 'feedback-table',
          name: 'Feedback table',
          favorite: true,
          openBehavior: 'center_peek',
          sourceId: 'ds_feedback',
          layout: {
            type: 'table',
            configuration: {
              rowHeight: 'compact',
              wrap: true,
              propertyWidths: { prop_status: 240 },
            },
          },
          where: {
            and: [
              { propertyId: 'prop_status', operator: 'eq', value: 'opt_new' },
              { propertyId: 'prop_title', operator: 'is_not_empty' },
            ],
          },
          sort: [{ propertyId: 'prop_status', direction: 'asc' }],
          groups: [{ propertyId: 'prop_status', direction: 'asc', hideEmpty: true }],
          projection: {
            propertyIds: ['prop_title', 'prop_status'],
            body: 'preview',
          },
        },
      ],
    };
    const parsed = DatabaseDefinitionSchema.parse(definition);
    expect(parsed.views[0]).toMatchObject({
      id: 'view_feedback_table',
      sourceId: 'ds_feedback',
      favorite: true,
      openBehavior: 'center_peek',
      layout: {
        type: 'table',
        configuration: {
          rowHeight: 'compact',
          wrap: true,
          propertyWidths: { prop_status: 240 },
        },
      },
      projection: { propertyIds: ['prop_title', 'prop_status'], body: 'preview' },
    });
    expect(parseDatabaseManifestYaml(serializeDatabaseManifestYaml(parsed))).toEqual({
      ok: true,
      definition: parsed,
    });

    const withDefault = DatabaseDefinitionSchema.parse({
      ...definition,
      sources: definition.sources.map((source) => ({
        ...source,
        defaultViewId: 'view_feedback_table',
      })),
    });
    expect(withDefault.sources[0]?.defaultViewId).toBe('view_feedback_table');
    expect(parseDatabaseManifestYaml(serializeDatabaseManifestYaml(withDefault))).toEqual({
      ok: true,
      definition: withDefault,
    });

    const missingDefault = structuredClone(withDefault);
    if (missingDefault.sources[0]) missingDefault.sources[0].defaultViewId = 'view_missing';
    expect(DatabaseDefinitionSchema.safeParse(missingDefault).success).toBe(false);

    const invalidReference = structuredClone(definition);
    invalidReference.views[0]?.projection.propertyIds.push('prop_missing');
    expect(DatabaseDefinitionSchema.safeParse(invalidReference).success).toBe(false);

    const invalidWidth = structuredClone(definition);
    const invalidWidthView = invalidWidth.views[0];
    if (!invalidWidthView) throw new Error('fixture view is missing');
    invalidWidthView.layout.configuration.propertyWidths.prop_status = 900;
    expect(DatabaseDefinitionSchema.safeParse(invalidWidth).success).toBe(false);

    const duplicateView = structuredClone(definition);
    const firstView = duplicateView.views[0];
    if (!firstView) throw new Error('fixture view is missing');
    duplicateView.views.push({ ...firstView, name: 'Duplicate view' });
    const duplicateResult = DatabaseDefinitionSchema.safeParse(duplicateView);
    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) {
      expect(duplicateResult.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Duplicate view id'),
          expect.stringContaining('Duplicate view key'),
        ]),
      );
    }
  });

  test('round-trips a typed Agent View and rejects unsafe or incomplete policies', () => {
    const definition = {
      ...validDefinition(),
      views: [
        {
          id: 'view_feedback_agent',
          key: 'support-agent',
          name: 'Support agent',
          sourceId: 'ds_feedback',
          layout: { type: 'agent' },
          where: { propertyId: 'prop_status', operator: 'eq', value: 'opt_new' },
          sort: [{ propertyId: 'prop_title', direction: 'asc' }],
          projection: { propertyIds: ['prop_title', 'prop_status'], body: 'preview' },
          agent: {
            semanticContract: {
              purpose: 'Answer questions about unresolved customer feedback',
              instructions: 'Cite stable records and do not infer a status.',
              evidence: 'required',
              freshness: 'require_current',
            },
            tokenBudget: {
              maxTokens: 4_000,
              reserveTokens: 500,
              tokenizer: 'utf8_bytes_div3',
              encoding: 'columnar_dictionary',
            },
            scope: {
              maxRecords: 50,
              relationDepth: 1,
              relationMaxRecords: 20,
              relationFanOut: 5,
            },
            writePolicy: {
              mode: 'review',
              allowedActions: ['update_record'],
              allowedPropertyIds: ['prop_status'],
              maxRecordsPerCommit: 10,
            },
          },
        },
      ],
    };
    const parsed = DatabaseDefinitionSchema.parse(definition);
    expect(parsed.views[0]).toMatchObject({
      layout: { type: 'agent' },
      agent: {
        semanticContract: { evidence: 'required', freshness: 'require_current' },
        scope: { maxRecords: 50, relationDepth: 1 },
        readPolicy: { maxSensitivity: 'internal' },
        writePolicy: { mode: 'review', allowedActions: ['update_record'] },
      },
    });
    expect(parseDatabaseManifestYaml(serializeDatabaseManifestYaml(parsed))).toEqual({
      ok: true,
      definition: parsed,
    });

    const missingContract = structuredClone(definition);
    delete (missingContract.views[0] as { agent?: unknown }).agent;
    expect(DatabaseDefinitionSchema.safeParse(missingContract).success).toBe(false);

    const writableHiddenProperty = structuredClone(definition);
    writableHiddenProperty.views[0]?.agent.writePolicy.allowedPropertyIds.push('prop_missing');
    expect(DatabaseDefinitionSchema.safeParse(writableHiddenProperty).success).toBe(false);

    const readOnlyGrant = structuredClone(definition);
    const policy = readOnlyGrant.views[0]?.agent.writePolicy;
    if (!policy) throw new Error('Agent View policy fixture is missing');
    policy.mode = 'read_only';
    expect(DatabaseDefinitionSchema.safeParse(readOnlyGrant).success).toBe(false);

    const confidentialRead = structuredClone(definition);
    const confidentialAgent = confidentialRead.views[0]?.agent as
      | (NonNullable<(typeof confidentialRead.views)[number]['agent']> & {
          readPolicy?: { maxSensitivity: 'confidential' };
        })
      | undefined;
    if (!confidentialAgent) throw new Error('Agent View fixture is missing');
    confidentialAgent.readPolicy = { maxSensitivity: 'confidential' };
    expect(
      DatabaseDefinitionSchema.parse(confidentialRead).views[0]?.agent?.readPolicy.maxSensitivity,
    ).toBe('confidential');
  });

  test('validates the machine contract default time property', () => {
    const wrongType = validDefinition();
    wrongType.contract.defaultTimePropertyId = 'prop_status';
    const wrongTypeResult = DatabaseDefinitionSchema.safeParse(wrongType);
    expect(wrongTypeResult.success).toBe(false);
    if (!wrongTypeResult.success) {
      expect(wrongTypeResult.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['contract', 'defaultTimePropertyId'],
            message: expect.stringContaining('must have type "date"'),
          }),
        ]),
      );
    }

    const missing = validDefinition();
    missing.contract.defaultTimePropertyId = 'prop_missing';
    const missingResult = DatabaseDefinitionSchema.safeParse(missing);
    expect(missingResult.success).toBe(false);
    if (!missingResult.success) {
      expect(missingResult.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['contract', 'defaultTimePropertyId'],
            message: expect.stringContaining('is not defined'),
          }),
        ]),
      );
    }
  });

  test('round-trips property semantics and validates typed defaults', () => {
    const definition = validDefinition();
    const status = definition.sources[0]?.properties.find(
      (property) => property.id === 'prop_status',
    );
    if (!status) throw new Error('status property fixture is missing');
    Object.assign(status, {
      aliases: ['workflow state'],
      semantics: {
        constraints: { unique: false },
        inferencePolicy: 'agent_suggest',
        sensitivity: 'confidential',
        format: { style: 'badge', options: { compact: true } },
        defaultValue: 'new',
      },
    });
    const parsed = DatabaseDefinitionSchema.parse(definition);
    expect(
      parsed.sources[0]?.properties.find((property) => property.id === 'prop_status'),
    ).toMatchObject({
      aliases: ['workflow state'],
      semantics: {
        inferencePolicy: 'agent_suggest',
        sensitivity: 'confidential',
        format: { style: 'badge', options: { compact: true } },
        defaultValue: 'new',
      },
    });
    expect(parseDatabaseManifestYaml(serializeDatabaseManifestYaml(parsed))).toEqual({
      ok: true,
      definition: parsed,
    });

    const invalidDefault = structuredClone(definition);
    const invalidStatus = invalidDefault.sources[0]?.properties.find(
      (property) => property.id === 'prop_status',
    );
    if (!invalidStatus) throw new Error('status property fixture is missing');
    Object.assign(invalidStatus, {
      semantics: {
        constraints: { unique: false },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
        defaultValue: 'not-an-option',
      },
    });
    const invalidResult = DatabaseDefinitionSchema.safeParse(invalidDefault);
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['sources', 0, 'properties', 1, 'semantics', 'defaultValue'],
            message: expect.stringContaining('incompatible with select property'),
          }),
        ]),
      );
    }
  });

  test('accepts read-only metadata properties and rejects writable semantics', () => {
    for (const type of [
      'created_time',
      'last_edited_time',
      'created_by',
      'last_edited_by',
    ] as const) {
      expect(
        DatabasePropertySchema.parse({
          id: `prop_${type}`,
          key: type,
          name: type,
          type,
        }),
      ).toMatchObject({ type, required: false });
      expect(
        DatabasePropertySchema.safeParse({
          id: `prop_${type}`,
          key: type,
          name: type,
          type,
          semantics: {
            inferencePolicy: 'explicit_only',
            sensitivity: 'inherit',
            constraints: { unique: false },
            defaultValue: '2026-07-20T00:00:00.000Z',
          },
        }).success,
      ).toBe(false);
    }
  });

  test('returns a source-locatable error for malformed or invalid YAML', () => {
    const malformed = parseDatabaseManifestYaml('version: [');
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.diagnostics[0]).toMatchObject({
        code: 'yaml_parse_error',
        line: 1,
      });
    }
    const invalid = parseDatabaseManifestYaml('version: 1\nid: nope\n');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error).toContain('Invalid database manifest');
      expect(invalid.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'schema_validation_error',
            path: ['id'],
            line: 2,
            column: 5,
          }),
        ]),
      );
    }

    const unknownVersion = parseDatabaseManifestYaml(
      serializeDatabaseManifestYaml(validDefinition()).replace('version: 1', 'version: 2'),
    );
    expect(unknownVersion).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'unknown_manifest_version',
          path: ['version'],
          line: 1,
          column: 10,
        }),
      ],
    });

    const relationDefinition = validDefinition();
    relationDefinition.sources[0]?.properties.push({
      id: 'prop_project',
      key: 'project',
      name: 'Project',
      type: 'relation',
      targetSourceId: 'ds_missing',
      cardinality: 'one',
    });
    const relation = parseDatabaseManifestYaml(stringify(relationDefinition));
    expect(relation.ok).toBe(false);
    if (!relation.ok) {
      expect(relation.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'schema_validation_error',
            path: ['sources', 0, 'properties', 2, 'targetSourceId'],
          }),
        ]),
      );
      const targetLine = relation.diagnostics.find(
        (item) => item.path.at(-1) === 'targetSourceId',
      )?.line;
      expect(targetLine).not.toBeNull();
      expect(targetLine ?? 0).toBeGreaterThan(1);
    }
  });

  test('refuses oversized manifests before YAML parsing', () => {
    const parsed = parseDatabaseManifestYaml(' '.repeat(DATABASE_MANIFEST_MAX_BYTES + 1));
    expect(parsed).toEqual({
      ok: false,
      error: `Database manifest exceeds ${DATABASE_MANIFEST_MAX_BYTES} bytes`,
      diagnostics: [
        {
          code: 'manifest_too_large',
          message: `Database manifest exceeds ${DATABASE_MANIFEST_MAX_BYTES} bytes`,
          path: [],
          line: null,
          column: null,
        },
      ],
      unsupportedObjects: [],
    });
  });

  test('refuses YAML alias expansion above the pinned manifest ceiling', () => {
    const aliases = Array.from(
      { length: DATABASE_MANIFEST_MAX_ALIAS_COUNT + 1 },
      () => '*shared',
    ).join(', ');
    const parsed = parseDatabaseManifestYaml(`shared: &shared [value]\nexpanded: [${aliases}]\n`);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.diagnostics[0]?.code).toBe('yaml_conversion_error');
      expect(parsed.error).toContain('Excessive alias count');
    }
  });

  test('refuses deeply nested YAML before converting it to JavaScript', () => {
    const yaml = `${'nested: {'.repeat(DATABASE_MANIFEST_MAX_DEPTH + 1)}value${'}'.repeat(DATABASE_MANIFEST_MAX_DEPTH + 1)}`;
    const parsed = parseDatabaseManifestYaml(yaml);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.diagnostics[0]?.code).toBe('manifest_structure_limit');
      expect(parsed.error).toContain(`YAML depth ${DATABASE_MANIFEST_MAX_DEPTH}`);
    }
  });

  test('preserves unknown property and view objects as explicitly unsupported', () => {
    const base = validDefinition();
    const unknown = {
      ...base,
      sources: [
        {
          ...base.sources[0],
          properties: [
            {
              id: 'prop_future',
              key: 'future',
              name: 'Future',
              type: 'quantum_number_v3',
              precisionMode: 'entangled',
            },
          ],
        },
      ],
      views: [
        {
          id: 'view_future',
          key: 'future',
          name: 'Future view',
          type: 'spatial_board_v2',
          layout: { axes: 4 },
        },
      ],
    };

    const parsed = parseDatabaseManifestYaml(stringify(unknown));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.unsupportedObjects).toEqual([
        {
          kind: 'property',
          type: 'quantum_number_v3',
          path: ['sources', 0, 'properties', 0],
          raw: expect.objectContaining({
            type: 'quantum_number_v3',
            precisionMode: 'entangled',
          }),
        },
        {
          kind: 'view',
          type: 'spatial_board_v2',
          path: ['views', 0],
          raw: expect.objectContaining({ type: 'spatial_board_v2', layout: { axes: 4 } }),
        },
      ]);
      expect(parsed.unsupportedObjects.some((item) => item.raw.type === 'text')).toBe(false);
    }
  });
});
