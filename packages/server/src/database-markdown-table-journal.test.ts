import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabaseMarkdownTableJournal } from './database-markdown-table-journal.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('DatabaseMarkdownTableJournal', () => {
  test('persists checkpoints and lists only unfinished transactions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'synapsenote-v2-journal-'));
    roots.push(root);
    const journal = createDatabaseMarkdownTableJournal(root);
    await journal.prepare({
      mutationId: 'mut_alpha',
      files: [{ path: 'owner.md', beforeSha256: 'sha256:a'.padEnd(71, '0'), afterSha256: 'sha256:b'.padEnd(71, '0'), before: 'before', after: 'after' }],
    });
    expect((await journal.listInflight()).map((entry) => entry.mutationId)).toEqual(['mut_alpha']);
    await journal.checkpoint('mut_alpha', 'committed');
    expect(await journal.listInflight()).toEqual([]);
    expect(existsSync(join(root, '.ok', 'local', 'database-markdown-table-transactions', 'mut_alpha.json'))).toBe(true);
  });
});
