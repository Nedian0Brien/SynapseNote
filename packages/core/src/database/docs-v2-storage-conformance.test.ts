import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDatabaseMarkdownOwner } from './markdown-table.ts';

const repositoryRoot = resolve(import.meta.dir, '../../../..');

describe('public v2 storage documentation', () => {
  test('documents a parser-valid owner marker/table and the loss/recovery rules', () => {
    const storage = readFileSync(
      resolve(repositoryRoot, 'docs/content/reference/database-v2-storage.mdx'),
      'utf8',
    );
    const match = storage.match(/```md\n([\s\S]*?)\n```/u);
    expect(match?.[1]).toBeDefined();
    const parsed = parseDatabaseMarkdownOwner(match?.[1] ?? '');
    expect(parsed).toMatchObject({ ok: true });
    expect(storage).toContain('Formula and Rollup');
    expect(storage).toContain('derivedRevision');
    expect(storage).toContain('recovery-required');
    expect(storage).toContain('100,000');

    const migration = readFileSync(
      resolve(repositoryRoot, 'docs/content/migrate/databases.mdx'),
      'utf8',
    );
    expect(migration).toContain('known-loss');
    expect(migration).toContain('v1 → v2');
  });
});
