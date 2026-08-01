import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabaseMarkdownTableJournal,
  DATABASE_MARKDOWN_TABLE_JOURNAL_RETENTION,
} from './database-markdown-table-journal.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('DatabaseMarkdownTableJournal', () => {
  test('persists checkpoints and lists only unfinished transactions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'synapsenote-v2-journal-'));
    roots.push(root);
    const journal = createDatabaseMarkdownTableJournal(root);
    await journal.prepare({
      mutationId: 'mut_alpha',
      files: [
        {
          path: 'owner.md',
          beforeSha256: 'sha256:a'.padEnd(71, '0'),
          afterSha256: 'sha256:b'.padEnd(71, '0'),
          before: 'before',
          after: 'after',
        },
      ],
    });
    expect((await journal.listInflight()).map((entry) => entry.mutationId)).toEqual(['mut_alpha']);
    await journal.checkpoint('mut_alpha', 'committed');
    expect(await journal.listInflight()).toEqual([]);
    expect(
      existsSync(
        join(root, '.ok', 'local', 'database-markdown-table-transactions', 'mut_alpha.json'),
      ),
    ).toBe(true);
  });
});

/**
 * Nothing removed finished entries, and each carries the before AND after
 * bytes of every file its transaction touched. One editing session left 176
 * files and 1.3MB behind; the directory only ever grew, `listInflight` read
 * all of it on boot, and this path's p99 (345ms against a 44ms median) landed
 * in the commit checkpoint that writes into that pile.
 */
describe('DatabaseMarkdownTableJournal retention', () => {
  async function commit(
    journal: ReturnType<typeof createDatabaseMarkdownTableJournal>,
    id: string,
  ) {
    await journal.prepare({
      mutationId: id,
      files: [
        {
          path: 'owner.md',
          beforeSha256: `sha256:${'a'.repeat(64)}`,
          afterSha256: `sha256:${'b'.repeat(64)}`,
          before: 'before',
          after: 'after',
        },
      ],
    });
    await journal.checkpoint(id, 'committed');
  }

  test('keeps a bounded window of finished entries', async () => {
    const root = mkdtempSync(join(tmpdir(), 'synapsenote-v2-journal-retention-'));
    roots.push(root);
    const journal = createDatabaseMarkdownTableJournal(root);
    const total = DATABASE_MARKDOWN_TABLE_JOURNAL_RETENTION * 2 + 5;
    for (let index = 0; index < total; index += 1) {
      await commit(journal, `mut_${String(index).padStart(6, '0')}`);
    }
    const directory = join(root, '.ok', 'local', 'database-markdown-table-transactions');
    const remaining = readdirSync(directory).filter((name) => name.endsWith('.json'));
    expect(remaining.length).toBeLessThanOrEqual(DATABASE_MARKDOWN_TABLE_JOURNAL_RETENTION * 2);
    expect(remaining.length).toBeGreaterThan(0);
  });

  test('never prunes an unfinished transaction', async () => {
    const root = mkdtempSync(join(tmpdir(), 'synapsenote-v2-journal-keep-inflight-'));
    roots.push(root);
    const journal = createDatabaseMarkdownTableJournal(root);
    await journal.prepare({
      mutationId: 'mut_inflight',
      files: [
        {
          path: 'owner.md',
          beforeSha256: `sha256:${'c'.repeat(64)}`,
          afterSha256: `sha256:${'d'.repeat(64)}`,
          before: 'before',
          after: 'after',
        },
      ],
    });
    for (let index = 0; index < DATABASE_MARKDOWN_TABLE_JOURNAL_RETENTION * 2 + 5; index += 1) {
      await commit(journal, `mut_${String(index).padStart(6, '0')}`);
    }
    expect((await journal.listInflight()).map((entry) => entry.mutationId)).toEqual([
      'mut_inflight',
    ]);
  });
});
