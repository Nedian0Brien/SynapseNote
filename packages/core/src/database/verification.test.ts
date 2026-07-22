import { describe, expect, test } from 'bun:test';
import { queryDatabaseRecords } from './query.ts';
import type { DatabaseRecord } from './record.ts';
import { DatabasePropertySchema } from './schema.ts';
import {
  DatabaseVerificationLifecycleInputSchema,
  DatabaseVerificationValueSchema,
  projectDatabaseVerification,
} from './verification.ts';

const hash = (character: string) => `sha256:${character.repeat(64)}`;

describe('governed database Verification', () => {
  test('validates opt-in property policy and refuses caller-supplied attribution', () => {
    const property = DatabasePropertySchema.parse({
      id: 'prop_verification',
      key: 'verification',
      name: 'Verification',
      type: 'verification',
      allowExpiry: true,
      requireEvidenceRevision: true,
    });
    expect(property.type).toBe('verification');
    expect(property.required).toBe(false);
    expect(
      DatabaseVerificationLifecycleInputSchema.safeParse({
        databaseId: 'db_wiki',
        sourceId: 'ds_pages',
        recordId: 'rec_page',
        propertyId: property.id,
        expectedRevision: hash('a'),
        action: 'verify',
        evidenceRevision: hash('a'),
        verifiedBy: { kind: 'agent', principal_id: 'agent:forged' },
      }).success,
    ).toBe(false);
  });

  test('derives expired and stale independently at an explicit read instant', () => {
    const value = DatabaseVerificationValueSchema.parse({
      state: 'verified',
      verifiedAt: '2026-07-20T00:00:00.000Z',
      verifiedBy: { kind: 'human', principal_id: 'user:reviewer' },
      expiresAt: '2026-07-21T00:00:00.000Z',
      evidenceRevision: hash('a'),
      note: 'Reviewed against the cited source.',
    });
    expect(
      projectDatabaseVerification(value, hash('c'), hash('a'), new Date('2026-07-20T12:00:00Z')),
    ).toMatchObject({ status: 'verified', isExpired: false, isStale: false });
    expect(
      projectDatabaseVerification(value, hash('c'), hash('b'), new Date('2026-07-22T00:00:00Z')),
    ).toMatchObject({
      status: 'expired',
      isExpired: true,
      isStale: true,
      currentRevision: hash('c'),
      currentEvidenceRevision: hash('b'),
    });
  });

  test('filters by stored state and projects complete evidence only when selected', () => {
    const property = DatabasePropertySchema.parse({
      id: 'prop_verification',
      key: 'verification',
      name: 'Verification',
      type: 'verification',
    });
    const source = {
      id: 'ds_pages',
      key: 'pages',
      name: 'Pages',
      recordMeaning: 'One governed page',
      folder: 'pages',
      properties: [
        DatabasePropertySchema.parse({
          id: 'prop_title',
          key: 'title',
          name: 'Title',
          type: 'title',
        }),
        property,
      ],
    } as const;
    const record: DatabaseRecord = {
      id: 'rec_page',
      databaseId: 'db_wiki',
      sourceId: source.id,
      path: 'pages/page.md',
      revision: hash('b'),
      evidenceRevision: hash('b'),
      values: {
        prop_title: 'Policy',
        prop_verification: {
          state: 'verified',
          verifiedAt: '2026-07-20T00:00:00.000Z',
          verifiedBy: { kind: 'agent', principal_id: 'agent:reviewer' },
          evidenceRevision: hash('a'),
        },
      },
      body: '',
    };
    const result = queryDatabaseRecords({
      source: source as never,
      records: [record],
      snapshotRevision: hash('c'),
      verificationTime: new Date('2026-07-20T01:00:00Z'),
      query: {
        where: { propertyId: property.id, operator: 'eq', value: 'verified' },
        select: ['prop_title', property.id],
      },
    });
    expect(result.records[0]?.verificationProjections?.[property.id]).toMatchObject({
      status: 'stale',
      isStale: true,
      evidenceRevision: hash('a'),
      currentRevision: hash('b'),
      currentEvidenceRevision: hash('b'),
      verifiedBy: { kind: 'agent', principal_id: 'agent:reviewer' },
    });

    const redacted = queryDatabaseRecords({
      source: source as never,
      records: [record],
      snapshotRevision: hash('c'),
      verificationTime: new Date('2026-07-20T01:00:00Z'),
      query: { select: ['prop_title'] },
    });
    expect(redacted.records[0]?.verificationProjections).toBeUndefined();
    expect(redacted.records[0]?.values.prop_verification).toBeUndefined();
  });
});
