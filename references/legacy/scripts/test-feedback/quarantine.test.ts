import { describe, expect, test } from 'bun:test';

import { readQuarantineManifest, validateQuarantineEntries } from './quarantine.ts';

describe('quarantine manifest', () => {
  test('the repository manifest is valid and currently empty', () => {
    expect(readQuarantineManifest()).toEqual([]);
  });

  test('requires owner, issue, expiry, and replacement coverage', () => {
    expect(() =>
      validateQuarantineEntries([
        {
          id: 'missing-owner',
          file: 'scripts/test-feedback/quarantine.test.ts',
          issue: 'https://github.com/example/issue/1',
          owner: '',
          expiresOn: '2099-01-01',
          replacementCoverage: ['scripts/test-feedback/policy.test.ts'],
        },
      ]),
    ).toThrow();
    expect(() =>
      validateQuarantineEntries([
        {
          id: 'expired',
          file: 'scripts/test-feedback/quarantine.test.ts',
          issue: 'https://github.com/example/issue/1',
          owner: 'runtime',
          expiresOn: '2000-01-01',
          replacementCoverage: ['scripts/test-feedback/policy.test.ts'],
        },
      ]),
    ).toThrow();
  });
});
