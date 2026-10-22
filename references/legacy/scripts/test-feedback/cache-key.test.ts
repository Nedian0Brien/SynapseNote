import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { turboCacheKey, turboInputMatches } from './cache-key.ts';
import { repositoryRoot } from './command.ts';

describe('Turbo feedback cache-key fixture', () => {
  test('invalidates related source and ignores an unrelated fixture', () => {
    const turbo = JSON.parse(readFileSync(join(repositoryRoot, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { inputs?: string[] }>;
    };
    const inputs = turbo.tasks['test:unit'].inputs ?? [];
    const base = new Map([
      ['src/feature.ts', 'source-v1'],
      ['tests/fixtures/unrelated.md', 'fixture-v1'],
    ]);

    expect(turboInputMatches('src/feature.ts', inputs)).toBe(true);
    expect(turboInputMatches('tests/fixtures/unrelated.md', inputs)).toBe(false);
    expect(
      turboCacheKey(new Map([...base, ['tests/fixtures/unrelated.md', 'fixture-v2']]), inputs),
    ).toBe(turboCacheKey(base, inputs));
    expect(turboCacheKey(new Map([...base, ['src/feature.ts', 'source-v2']]), inputs)).not.toBe(
      turboCacheKey(base, inputs),
    );
  });

  test('includes the shared feedback runner in package task inputs', () => {
    const turbo = JSON.parse(readFileSync(join(repositoryRoot, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { inputs?: string[] }>;
    };
    expect(
      turboInputMatches(
        '../../scripts/test-feedback/leak-preload.ts',
        turbo.tasks['test:unit'].inputs ?? [],
      ),
    ).toBe(true);
  });
});
