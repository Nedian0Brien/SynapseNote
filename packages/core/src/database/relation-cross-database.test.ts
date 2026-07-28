import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from './schema.ts';

const TASKS_DB = 'db_11111111111111111111111111111111';
const TASKS_SOURCE = 'ds_11111111111111111111111111111111';
const TASKS_TITLE = 'prop_11111111111111111111111111111111';
const PEOPLE_DB = 'db_22222222222222222222222222222222';
const PEOPLE_SOURCE = 'ds_22222222222222222222222222222222';
const RELATION = 'prop_33333333333333333333333333333333';

function tasksDefinition(relation: Record<string, unknown>) {
  return {
    version: 1,
    id: TASKS_DB,
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Track tasks',
      canonicality: 'canonical',
      vocabulary: ['task'],
      freshness: { expectation: 'realtime' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: TASKS_SOURCE,
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        folder: '.',
        properties: [
          { id: TASKS_TITLE, key: 'title', name: 'Title', type: 'title' },
          { id: RELATION, key: 'owner', name: 'Owner', type: 'relation', ...relation },
        ],
      },
    ],
    views: [
      {
        id: 'view_11111111111111111111111111111111',
        key: 'table',
        name: 'Table',
        sourceId: TASKS_SOURCE,
        layout: { type: 'table', configuration: {} },
        projection: { propertyIds: [TASKS_TITLE, RELATION], body: 'hidden' },
      },
    ],
  };
}

/**
 * A relation used to be pinned to its own database. The manifest schema cannot
 * confirm a target it does not contain — that check belongs to the planner,
 * which sees the whole workspace — so what it enforces instead is that each
 * relation is honest about which case it is in.
 */
describe('cross-database relations', () => {
  test('accepts a target in another database', () => {
    const parsed = DatabaseDefinitionSchema.safeParse(
      tasksDefinition({ targetSourceId: PEOPLE_SOURCE, targetDatabaseId: PEOPLE_DB }),
    );
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  test('still refuses an undeclared target inside this database', () => {
    // No `targetDatabaseId` means "a source of this database", and this one has
    // no such source — the pre-existing check that must keep working.
    const parsed = DatabaseDefinitionSchema.safeParse(
      tasksDefinition({ targetSourceId: PEOPLE_SOURCE }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toMatch(/is not defined/);
  });

  test('treats a self-naming targetDatabaseId as same-database', () => {
    const parsed = DatabaseDefinitionSchema.safeParse(
      tasksDefinition({ targetSourceId: PEOPLE_SOURCE, targetDatabaseId: TASKS_DB }),
    );
    expect(parsed.success).toBe(false);
  });

  test('accepts a self-relation, which is how sub-items are shaped', () => {
    const parsed = DatabaseDefinitionSchema.safeParse(
      tasksDefinition({ targetSourceId: TASKS_SOURCE }),
    );
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  test('refuses a two-way cross-database relation, which needs two manifests', () => {
    const parsed = DatabaseDefinitionSchema.safeParse(
      tasksDefinition({
        targetSourceId: PEOPLE_SOURCE,
        targetDatabaseId: PEOPLE_DB,
        pairedPropertyId: 'prop_44444444444444444444444444444444',
      }),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => /cannot be two-way/.test(issue.message))).toBe(true);
  });
});
