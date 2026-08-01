import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { DatabaseRecord, DatabaseValue } from './record.ts';

export interface DatabaseMigrationLogicalSnapshotRecord {
  canonicalRecordId: string;
  sourceId: string;
  values: Readonly<Record<string, DatabaseValue>>;
  invalidValues?: Readonly<Record<string, unknown>> | null;
  computedResults?: Readonly<Record<string, unknown>> | null;
}

export interface DatabaseMigrationEquivalenceMismatch {
  recordId: string;
  field: 'sourceId' | 'values' | 'invalidValues' | 'computedResults' | 'missing';
  expected: unknown;
  actual: unknown;
}

export interface DatabaseMigrationEquivalenceReport {
  passed: boolean;
  expectedCount: number;
  actualCount: number;
  expectedRevision: string;
  actualRevision: string;
  mismatches: readonly DatabaseMigrationEquivalenceMismatch[];
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
    .join(',')}}`;
}

function digest(value: string): string {
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(value)))}`;
}

function snapshot(
  record: DatabaseMigrationLogicalSnapshotRecord | DatabaseRecord,
): DatabaseMigrationLogicalSnapshotRecord {
  const canonicalRecordId = 'canonicalRecordId' in record ? record.canonicalRecordId : record.id;
  return {
    canonicalRecordId,
    sourceId: record.sourceId,
    values: structuredClone(record.values),
    invalidValues: record.invalidValues ? structuredClone(record.invalidValues) : null,
    computedResults: record.computedResults ? structuredClone(record.computedResults) : null,
  };
}

/**
 * Compare the logical state produced by a frozen v1 reader and the cold v2
 * reader. Storage paths and byte revisions are intentionally excluded; stable
 * IDs, typed/raw values, and Formula/Rollup error/value results are not.
 */
export function compareDatabaseMigrationLogicalSnapshots(input: {
  expected: readonly DatabaseMigrationLogicalSnapshotRecord[];
  actual: readonly (DatabaseMigrationLogicalSnapshotRecord | DatabaseRecord)[];
}): DatabaseMigrationEquivalenceReport {
  const expected = [...input.expected]
    .map(snapshot)
    .sort((left, right) => left.canonicalRecordId.localeCompare(right.canonicalRecordId));
  const actual = [...input.actual]
    .map(snapshot)
    .sort((left, right) => left.canonicalRecordId.localeCompare(right.canonicalRecordId));
  const expectedById = new Map(expected.map((record) => [record.canonicalRecordId, record]));
  const actualById = new Map(actual.map((record) => [record.canonicalRecordId, record]));
  const mismatches: DatabaseMigrationEquivalenceMismatch[] = [];
  for (const record of expected) {
    const observed = actualById.get(record.canonicalRecordId);
    if (!observed) {
      mismatches.push({
        recordId: record.canonicalRecordId,
        field: 'missing',
        expected: record,
        actual: null,
      });
      continue;
    }
    for (const field of ['sourceId', 'values', 'invalidValues', 'computedResults'] as const) {
      const expectedValue = record[field] ?? null;
      const actualValue = observed[field] ?? null;
      if (stable(expectedValue) !== stable(actualValue)) {
        mismatches.push({
          recordId: record.canonicalRecordId,
          field,
          expected: expectedValue,
          actual: actualValue,
        });
      }
    }
  }
  for (const record of actual) {
    if (!expectedById.has(record.canonicalRecordId)) {
      mismatches.push({
        recordId: record.canonicalRecordId,
        field: 'missing',
        expected: null,
        actual: record,
      });
    }
  }
  const expectedRevision = digest(stable(expected));
  const actualRevision = digest(stable(actual));
  return {
    passed: mismatches.length === 0,
    expectedCount: expected.length,
    actualCount: actual.length,
    expectedRevision,
    actualRevision,
    mismatches,
  };
}
