import { describe, expect, test } from 'bun:test';
import {
  DATABASE_STORAGE_CAPABILITY_MATRIX,
  databaseStorageCapabilityFor,
} from './storage-capability.ts';

describe('database storage capability matrix', () => {
  test('routes v1 and v2 to one unambiguous writer', () => {
    expect(databaseStorageCapabilityFor({ manifestVersion: 1 })).toMatchObject({
      read: 'full',
      write: 'v1_record_files',
    });
    expect(databaseStorageCapabilityFor({ manifestVersion: 2, tableFormatVersion: 2 })).toMatchObject({
      read: 'full',
      write: 'v2_markdown_table',
    });
  });

  test('fails closed for unknown versions and never downgrades writes', () => {
    expect(databaseStorageCapabilityFor({ manifestVersion: 3, tableFormatVersion: 3 })).toMatchObject({
      read: 'unsupported',
      write: 'unsupported',
      manifestVersion: 3,
      tableFormatVersion: 3,
    });
  });

  test('has exactly one full-write row for each supported manifest version', () => {
    for (const version of [1, 2]) {
      expect(
        DATABASE_STORAGE_CAPABILITY_MATRIX.filter(
          (row) => row.manifestVersion === version && row.read === 'full',
        ),
      ).toHaveLength(1);
    }
  });
});
