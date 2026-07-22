import { describe, expect, mock, test } from 'bun:test';
import { previewDatabasePropertyConversionPlan } from './database-property-conversion-client';

const hash = `sha256:${'a'.repeat(64)}`;
const revision = `sha256:${'b'.repeat(64)}`;

function plan() {
  return {
    id: 'plan_conversion',
    hash,
    snapshotRevision: revision,
    committable: true,
    requiresCommit: true,
    conflicts: [],
    approvals: [],
    diff: { mode: 'exact', manifests: [], records: [], templates: [], policy: null },
  };
}

function body(extra: Record<string, unknown> = {}) {
  return {
    databaseId: 'db_projects',
    sourceId: 'ds_projects',
    propertyId: 'prop_code',
    manifestRevision: hash,
    indexRevision: revision,
    preview: {
      rule: {
        from: 'text',
        to: 'number',
        kind: 'conditional',
        reason: 'Every value must parse',
      },
      committable: true,
      requiresLossyApproval: false,
      summary: { total: 1, empty: 0, converted: 1, lossy: 0, blocked: 0 },
      changes: [
        {
          recordId: 'rec_one',
          expectedRevision: hash,
          outcome: 'converted',
          before: '9',
          after: 9,
        },
      ],
      rollbackValues: { rec_one: '9' },
    },
    draft: { id: 'draft_conversion', revision: hash },
    plan: plan(),
    ...extra,
  };
}

describe('database property conversion client', () => {
  test('sends explicit loss approval and parses a strict exact preview', async () => {
    const requests: Record<string, unknown>[] = [];
    const fetchImplementation = mock(async (_input: unknown, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json(body());
    });
    const result = await previewDatabasePropertyConversionPlan(
      {
        databaseId: 'db_projects',
        sourceId: 'ds_projects',
        propertyId: 'prop_code',
        targetProperty: {
          id: 'prop_code',
          key: 'code',
          name: 'Code',
          type: 'number',
        },
        allowLossy: true,
      },
      { fetch: fetchImplementation as unknown as typeof fetch },
    );
    expect(result).toMatchObject({
      preview: { committable: true, changes: [{ before: '9', after: 9 }] },
      plan: { id: 'plan_conversion' },
    });
    expect(requests[0]).toMatchObject({ allowLossy: true, targetProperty: { type: 'number' } });
  });

  test('refuses response extensions instead of accepting a drifted contract', async () => {
    const fetchImplementation = mock(async () => Response.json(body({ surprise: true })));
    await expect(
      previewDatabasePropertyConversionPlan(
        {
          databaseId: 'db_projects',
          sourceId: 'ds_projects',
          propertyId: 'prop_code',
          targetProperty: {
            id: 'prop_code',
            key: 'code',
            name: 'Code',
            type: 'number',
          },
        },
        { fetch: fetchImplementation as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
});
