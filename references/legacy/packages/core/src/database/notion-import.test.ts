import { describe, expect, test } from 'bun:test';
import { type NotionNormalizedExport, planNotionDatabaseImport } from './notion-import.ts';

const notionExport: NotionNormalizedExport = {
  version: 1,
  assets: [
    { path: 'assets/available.png', available: true },
    { path: 'assets/missing.pdf', available: false },
  ],
  databases: [
    {
      id: 'notion-db-projects',
      name: 'Projects',
      description: 'Project system',
      dataSources: [
        {
          id: 'notion-source-projects',
          name: 'Projects',
          properties: [
            { id: 'notion-prop-title', name: 'Name', type: 'title' },
            {
              id: 'notion-prop-status',
              name: 'Status',
              type: 'status',
              options: [
                { id: 'notion-opt-active', name: 'Active', color: 'green' },
                { id: 'notion-opt-done', name: 'Done', color: 'blue' },
              ],
            },
            {
              id: 'notion-prop-relation',
              name: 'Owner task',
              type: 'relation',
              targetDataSourceId: 'notion-source-tasks',
            },
            {
              id: 'notion-prop-formula',
              name: 'Label',
              type: 'formula',
              formula: { source: 'prop("Name") + "!"', resultType: 'string' },
            },
            {
              id: 'notion-prop-rollup',
              name: 'Task count',
              type: 'rollup',
              rollup: {
                relationPropertyId: 'notion-prop-relation',
                targetPropertyId: 'notion-task-title',
                function: 'count_all',
              },
            },
            { id: 'notion-prop-unsupported', name: 'Created button', type: 'button' },
          ],
          records: [
            {
              id: 'notion-record-project',
              dataSourceId: 'notion-source-projects',
              propertyValues: {
                'notion-prop-title': 'Launch',
                'notion-prop-status': 'notion-opt-active',
                'notion-prop-relation': ['notion-record-task'],
              },
              body: '# Launch\n\nExact Notion page body.\n',
              assetPaths: ['assets/available.png', 'assets/missing.pdf'],
            },
          ],
        },
        {
          id: 'notion-source-tasks',
          name: 'Tasks',
          properties: [{ id: 'notion-task-title', name: 'Task', type: 'title' }],
          records: [
            {
              id: 'notion-record-task',
              dataSourceId: 'notion-source-tasks',
              propertyValues: { 'notion-task-title': 'Ship' },
              body: 'Task body\n',
            },
          ],
        },
      ],
      views: [
        {
          id: 'notion-view-board',
          dataSourceId: 'notion-source-projects',
          name: 'Roadmap',
          type: 'board',
          propertyIds: ['notion-prop-title', 'notion-prop-status'],
          sort: [{ propertyId: 'notion-prop-title', direction: 'ascending' }],
          filter: { property: 'Status', equals: 'Active' },
        },
        {
          id: 'notion-view-unknown',
          dataSourceId: 'notion-source-projects',
          name: 'Chart',
          type: 'chart',
        },
      ],
      templates: [
        {
          id: 'notion-template-default',
          dataSourceId: 'notion-source-projects',
          name: 'Default project',
          body: '## Checklist\n',
          propertyValues: { 'notion-prop-status': 'notion-opt-active' },
        },
      ],
    },
  ],
};

describe('Notion database import planning', () => {
  test('preserves every exportable object, body, relation, view, and template with stable IDs', () => {
    const first = planNotionDatabaseImport(notionExport);
    const second = planNotionDatabaseImport(structuredClone(notionExport));

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      requiresConfirmation: true,
      complete: true,
      summary: {
        databases: 1,
        dataSources: 2,
        properties: 7,
        views: 2,
        templates: 1,
        records: 2,
        missingAssets: 1,
      },
    });
    const projectSource = first.databases[0]?.dataSources[0];
    expect(projectSource?.properties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ notionId: 'notion-prop-relation', type: 'relation' }),
        expect.objectContaining({
          notionId: 'notion-prop-formula',
          type: 'formula',
          formula: expect.objectContaining({ source: 'prop("Name") + "!"' }),
          importState: 'requires_review',
        }),
        expect.objectContaining({ notionId: 'notion-prop-rollup', type: 'rollup' }),
      ]),
    );
    expect(projectSource?.records[0]).toMatchObject({
      body: '# Launch\n\nExact Notion page body.\n',
      assetPaths: ['assets/available.png', 'assets/missing.pdf'],
    });
    const projectValues = projectSource?.records[0]?.values ?? {};
    expect(projectValues[first.idMap['notion-prop-status'] as string]).toBe(
      first.idMap['notion-opt-active'],
    );
    expect(projectValues[first.idMap['notion-prop-relation'] as string]).toEqual([
      first.idMap['notion-record-task'],
    ]);
    expect(first.databases[0]?.views[0]).toMatchObject({
      layout: 'board',
      importState: 'requires_review',
      sourceFilter: { property: 'Status', equals: 'Active' },
    });
    expect(first.databases[0]?.templates[0]).toMatchObject({ body: '## Checklist\n' });
  });

  test('emits an object-addressed report for every unsupported, lossy, or missing item', () => {
    const plan = planNotionDatabaseImport(notionExport);
    expect(plan.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'formula_requires_translation',
        'rollup_requires_review',
        'unsupported_property',
        'view_filter_requires_review',
        'unsupported_view',
        'missing_asset',
      ]),
    );
    expect(plan.issues.every((issue) => issue.path && issue.notionId && issue.handling)).toBe(true);
    expect(plan.issues.find((issue) => issue.code === 'unsupported_property')).toMatchObject({
      objectKind: 'property',
      handling: 'preserved',
      notionId: 'notion-prop-unsupported',
    });
    expect(plan.issues.find((issue) => issue.code === 'missing_asset')).toMatchObject({
      objectKind: 'asset',
      notionId: 'assets/missing.pdf',
    });
  });

  test('blocks an unresolved relation target instead of flattening it', () => {
    const broken = structuredClone(notionExport);
    const relation = broken.databases[0]?.dataSources[0]?.properties.find(
      (property) => property.type === 'relation',
    );
    if (!relation) throw new Error('relation fixture missing');
    relation.targetDataSourceId = 'notion-source-absent';
    expect(planNotionDatabaseImport(broken).issues).toContainEqual(
      expect.objectContaining({
        code: 'relation_target_missing',
        severity: 'blocking',
        handling: 'preserved',
      }),
    );
  });
});
