import { describe, expect, test } from 'bun:test';
import { DatabaseRecordCommentsSchema, databasePropertyCommentProblem } from './comments';
import { DatabasePropertySchema } from './schema';

describe('database comments', () => {
  test('round-trips bounded mentions and resolved thread attribution', () => {
    const parsed = DatabaseRecordCommentsSchema.parse({
      version: 1,
      databaseId: 'db_tasks',
      recordId: 'rec_first',
      threads: [
        {
          id: 'cth_review',
          anchor: { type: 'page' },
          comments: [
            {
              id: 'cmt_first',
              author: { kind: 'human', principal_id: 'user:local' },
              body: 'Please verify this.',
              mentionedPersonIds: ['person_reviewer'],
              createdAt: '2026-07-21T10:00:00.000Z',
            },
          ],
          resolvedAt: '2026-07-21T11:00:00.000Z',
          resolvedBy: { kind: 'agent', principal_id: 'agent:codex' },
        },
      ],
    });
    expect(parsed.threads[0]).toMatchObject({ id: 'cth_review', resolvedBy: { kind: 'agent' } });
    expect(
      DatabaseRecordCommentsSchema.safeParse({
        ...parsed,
        threads: [{ ...parsed.threads[0], resolvedBy: undefined }],
      }).success,
    ).toBe(false);
  });

  test('enforces property type and assigned-value restrictions', () => {
    const properties = [
      DatabasePropertySchema.parse({
        id: 'prop_title',
        key: 'title',
        name: 'Title',
        type: 'title',
      }),
      DatabasePropertySchema.parse({
        id: 'prop_score',
        key: 'score',
        name: 'Score',
        type: 'number',
      }),
      DatabasePropertySchema.parse({
        id: 'prop_unique',
        key: 'unique',
        name: 'Unique ID',
        type: 'unique_id',
        prefix: 'TASK',
        nextNumber: 2,
      }),
    ];
    expect(
      databasePropertyCommentProblem({ properties, values: {}, propertyId: 'prop_title' }),
    ).toBe('unsupported_property_type');
    expect(
      databasePropertyCommentProblem({ properties, values: {}, propertyId: 'prop_score' }),
    ).toBe('property_value_missing');
    expect(
      databasePropertyCommentProblem({
        properties,
        values: { prop_score: 0 },
        propertyId: 'prop_score',
      }),
    ).toBeNull();
    expect(
      databasePropertyCommentProblem({ properties, values: {}, propertyId: 'prop_unique' }),
    ).toBe('unsupported_property_type');
  });
});
