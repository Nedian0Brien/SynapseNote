import { describe, expect, test } from 'bun:test';
import {
  assessGeneratedDatabaseSummary,
  GeneratedDatabaseSummarySchema,
} from './generated-summary.ts';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function artifact() {
  return GeneratedDatabaseSummarySchema.parse({
    version: 1,
    id: 'sum_one',
    databaseId: 'db_notes',
    sourceId: 'ds_notes',
    recordId: 'rec_one',
    summary: 'A compact generated summary.',
    sourceHash: HASH_A,
    schemaRevision: HASH_B,
    createdAt: '2026-07-19T10:00:00.000Z',
    modelProvenance: {
      provider: 'example-provider',
      model: 'summary-model',
      modelRevision: '2026-07-01',
      promptRevision: 'record-summary-v1',
      generationId: 'generation-123',
    },
    state: { stale: false, checkedAt: '2026-07-19T10:00:00.000Z' },
  });
}

describe('generated database summary contract', () => {
  test('requires source, time, model provenance, and an internally consistent stale state', () => {
    const valid = artifact();
    expect(valid.modelProvenance.promptRevision).toBe('record-summary-v1');
    for (const missing of ['sourceHash', 'createdAt', 'modelProvenance', 'state'] as const) {
      const candidate = structuredClone(valid) as Record<string, unknown>;
      delete candidate[missing];
      expect(GeneratedDatabaseSummarySchema.safeParse(candidate).success).toBe(false);
    }
    expect(
      GeneratedDatabaseSummarySchema.safeParse({
        ...valid,
        state: { stale: true, checkedAt: '2026-07-19T10:00:00.000Z' },
      }).success,
    ).toBe(false);
  });

  test('marks exact source, schema, and missing-source observations deterministically', () => {
    const valid = artifact();
    expect(
      assessGeneratedDatabaseSummary(valid, {
        sourceHash: HASH_A,
        schemaRevision: HASH_B,
        checkedAt: '2026-07-19T10:01:00.000Z',
      }).state,
    ).toEqual({ stale: false, checkedAt: '2026-07-19T10:01:00.000Z' });
    expect(
      assessGeneratedDatabaseSummary(valid, {
        sourceHash: HASH_B,
        schemaRevision: HASH_B,
        checkedAt: '2026-07-19T10:01:00.000Z',
      }).state,
    ).toMatchObject({ stale: true, reason: 'source_changed' });
    expect(
      assessGeneratedDatabaseSummary(valid, {
        sourceHash: null,
        schemaRevision: HASH_B,
        checkedAt: '2026-07-19T10:01:00.000Z',
      }).state,
    ).toMatchObject({ stale: true, reason: 'source_missing' });
  });
});
