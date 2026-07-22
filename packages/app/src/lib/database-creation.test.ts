import { describe, expect, test } from 'bun:test';
import { DatabaseDesiredStateDraftSchema } from '@nedian0brien/synapsenote-server';
import {
  createBlankDatabaseDesiredState,
  createDelimitedDatabaseDesiredState,
  createExistingFolderDatabaseDesiredState,
  createTemplateDatabaseDesiredState,
  DATABASE_CREATION_TEMPLATES,
  summarizeDatabaseCreation,
} from './database-creation.ts';

describe('database creation desired state', () => {
  test('creates a minimal blank database with one canonical title and Table view', () => {
    const desired = createBlankDatabaseDesiredState({ name: 'Project Tasks' });
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(desired).toMatchObject({
      database: { key: 'project_tasks', name: 'Project Tasks' },
      sources: [
        {
          key: 'project_tasks',
          folder: 'project_tasks',
          properties: [{ key: 'title', type: 'title', required: true }],
        },
      ],
      views: [{ key: 'table', sourceKey: 'project_tasks', layout: { type: 'table' } }],
      sampleRecords: [],
    });
  });

  test('creates reviewed starter-template schemas without using non-committable record templates', () => {
    const desired = createTemplateDatabaseDesiredState({ name: 'Launch', template: 'tasks' });
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(desired.templates).toEqual([]);
    expect(desired.sources[0]?.properties.map((property) => property.key)).toEqual([
      'title',
      'status',
      'priority',
      'due',
      'assignee',
    ]);
    expect(desired.sampleRecords).toHaveLength(2);
    expect(desired.sampleRecords?.[0]?.values).toMatchObject({
      title: 'Plan launch',
      priority: 'high',
    });
  });

  test('ships the seven checklist starter schemas through the same reviewed contract', () => {
    expect(DATABASE_CREATION_TEMPLATES.map((template) => template.key)).toEqual([
      'tasks',
      'projects',
      'crm',
      'feedback',
      'content_calendar',
      'issue_tracking',
      'research_evidence',
    ]);
    for (const template of DATABASE_CREATION_TEMPLATES) {
      const desired = createTemplateDatabaseDesiredState({
        name: template.name,
        template: template.key,
      });
      expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
      expect(desired.sources[0]?.properties[0]).toMatchObject({
        key: 'title',
        type: 'title',
        required: true,
      });
      expect(desired.templates).toEqual([]);
      expect(desired.sampleRecords?.length).toBeGreaterThan(0);
    }
  });

  test('binds an existing folder without touching its records before onboarding', () => {
    const desired = createExistingFolderDatabaseDesiredState({
      name: 'Research Notes',
      folder: 'research/notes',
      includeSubfolders: false,
    });
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(desired.sources[0]).toMatchObject({
      folder: 'research/notes',
      includeSubfolders: false,
    });
    expect(desired.sampleRecords).toEqual([]);
  });

  test('infers a bounded canonical schema and typed records from delimited input', () => {
    const desired = createDelimitedDatabaseDesiredState({
      name: 'Imported Work',
      delimiter: ',',
      contents:
        'Task,Estimate,Done,Due,Notes\r\nShip API,3.5,true,2026-08-01,"includes, comma"\r\nWrite docs,2,false,2026-08-02,Clear',
    });
    expect(DatabaseDesiredStateDraftSchema.safeParse(desired).success).toBe(true);
    expect(desired.sources[0]?.properties.map((property) => [property.key, property.type])).toEqual(
      [
        ['task', 'title'],
        ['estimate', 'number'],
        ['done', 'checkbox'],
        ['due', 'date'],
        ['notes', 'text'],
      ],
    );
    expect(desired.sampleRecords?.[0]?.values).toEqual({
      task: 'Ship API',
      estimate: 3.5,
      done: true,
      due: '2026-08-01',
      notes: 'includes, comma',
    });
  });

  test('rejects duplicate headers, missing titles, and over-limit imports before planning', () => {
    expect(() =>
      createDelimitedDatabaseDesiredState({
        name: 'Duplicate',
        delimiter: ',',
        contents: 'Title,Title\nOne,Two',
      }),
    ).toThrow(/unique/);
    expect(() =>
      createDelimitedDatabaseDesiredState({
        name: 'Missing',
        delimiter: ',',
        contents: 'Title,Value\n,One',
      }),
    ).toThrow(/required Title/);
    expect(() =>
      createDelimitedDatabaseDesiredState({
        name: 'Large',
        delimiter: ',',
        contents: ['Title', ...Array.from({ length: 101 }, (_, index) => `Row ${index}`)].join(
          '\n',
        ),
      }),
    ).toThrow(/limited to 100/);
  });

  test('does not infer impossible calendar dates as Date properties', () => {
    const desired = createDelimitedDatabaseDesiredState({
      name: 'Dates',
      delimiter: ',',
      contents: 'Title,Due\nImpossible,2026-02-30',
    });
    expect(desired.sources[0]?.properties[1]).toMatchObject({ type: 'text' });
  });

  test('summarizes the stable creation contract before commit', () => {
    expect(
      summarizeDatabaseCreation(
        createTemplateDatabaseDesiredState({ name: 'Launch Plan', template: 'tasks' }),
      ),
    ).toEqual({
      recordMeaning: 'One Launch Plan record',
      canonicalFolder: 'launch_plan',
      stableKey: 'launch_plan',
      initialView: 'Table',
      propertyNames: ['Task', 'Status', 'Priority', 'Due', 'Assignee'],
      initialRecordCount: 2,
    });
  });
});
