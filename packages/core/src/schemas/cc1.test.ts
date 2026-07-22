import { describe, expect, test } from 'bun:test';
import { CC1_CONTRACT_VERSION } from '../constants/cc1.ts';
import {
  CC1_CHANNEL_CONFIG_IGNORE_NESTED_ERROR,
  CC1_CHANNEL_DATABASE_CHANGED,
  CC1ConfigIgnoreNestedErrorPayloadSchema,
  CC1DatabaseChangedPayloadSchema,
} from './cc1.ts';

describe('CC1_CHANNEL_CONFIG_IGNORE_NESTED_ERROR', () => {
  test('exposes the wire-level channel name', () => {
    expect(CC1_CHANNEL_CONFIG_IGNORE_NESTED_ERROR).toBe('config-ignore-nested-error');
  });
});

describe('CC1ConfigIgnoreNestedErrorPayloadSchema', () => {
  test('parses a well-formed payload', () => {
    const payload = CC1ConfigIgnoreNestedErrorPayloadSchema.parse({
      v: CC1_CONTRACT_VERSION,
      ch: CC1_CHANNEL_CONFIG_IGNORE_NESTED_ERROR,
      seq: 7,
      path: 'subdir/.okignore',
      error: 'unmatched bracket on line 3',
    });
    expect(payload.path).toBe('subdir/.okignore');
    expect(payload.error).toBe('unmatched bracket on line 3');
    expect(payload.seq).toBe(7);
  });

  test('rejects empty path', () => {
    expect(
      CC1ConfigIgnoreNestedErrorPayloadSchema.safeParse({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_CONFIG_IGNORE_NESTED_ERROR,
        seq: 1,
        path: '',
        error: 'something',
      }).success,
    ).toBe(false);
  });

  test('rejects empty error', () => {
    expect(
      CC1ConfigIgnoreNestedErrorPayloadSchema.safeParse({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_CONFIG_IGNORE_NESTED_ERROR,
        seq: 1,
        path: 'a/.okignore',
        error: '',
      }).success,
    ).toBe(false);
  });

  test('rejects wrong channel literal', () => {
    expect(
      CC1ConfigIgnoreNestedErrorPayloadSchema.safeParse({
        v: CC1_CONTRACT_VERSION,
        ch: 'files',
        seq: 1,
        path: 'a/.okignore',
        error: 'x',
      }).success,
    ).toBe(false);
  });

  test('forward-compat: extra fields pass through (`.loose()`)', () => {
    const parsed = CC1ConfigIgnoreNestedErrorPayloadSchema.parse({
      v: CC1_CONTRACT_VERSION,
      ch: CC1_CHANNEL_CONFIG_IGNORE_NESTED_ERROR,
      seq: 2,
      path: 'a/.okignore',
      error: 'oops',
      futureField: { nested: true },
    });
    expect(parsed.path).toBe('a/.okignore');
  });
});

describe('CC1DatabaseChangedPayloadSchema', () => {
  test('accepts content-free affected IDs and index freshness state', () => {
    expect(
      CC1DatabaseChangedPayloadSchema.parse({
        v: 1,
        ch: CC1_CHANNEL_DATABASE_CHANGED,
        seq: 1,
        scope: 'records',
        reasons: ['record-update'],
        databaseIds: ['db_tasks'],
        sourceIds: ['ds_tasks'],
        recordIds: ['rec_task'],
        affectedIdsComplete: true,
        index: {
          state: 'idle',
          revision: 'sha256:index',
          manifestRevision: 'sha256:manifest',
          recordCount: 1,
          issueCount: 0,
          progress: null,
        },
      }),
    ).toMatchObject({ ch: 'database-changed', recordIds: ['rec_task'] });
  });

  test('rejects unbounded affected ID lists through the public shape', () => {
    expect(
      CC1DatabaseChangedPayloadSchema.safeParse({
        v: 1,
        ch: CC1_CHANNEL_DATABASE_CHANGED,
        seq: 1,
        scope: 'records',
        reasons: ['record-update'],
        databaseIds: [],
        sourceIds: [],
        recordIds: Array.from({ length: 501 }, (_, index) => `rec_${index}`),
        affectedIdsComplete: false,
        index: {
          state: 'idle',
          revision: 'sha256:index',
          manifestRevision: 'sha256:manifest',
          recordCount: 1,
          issueCount: 0,
          progress: null,
        },
      }).success,
    ).toBe(false);
  });
});
