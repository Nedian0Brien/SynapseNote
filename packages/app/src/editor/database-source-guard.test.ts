import { describe, expect, test } from 'bun:test';
import {
  databaseFrontmatterProtectionEnd,
  sourceChangeTouchesDatabaseFrontmatter,
} from './database-source-guard.ts';

const record =
  '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_first\ntitle: First\n---\nBody\n';

describe('database source-mode guard', () => {
  test('protects only valid database-owned frontmatter', () => {
    const end = databaseFrontmatterProtectionEnd(record);
    expect(end).toBe(record.indexOf('Body'));
    expect(databaseFrontmatterProtectionEnd('---\ntitle: Ordinary\n---\nBody')).toBeNull();
    expect(databaseFrontmatterProtectionEnd('Body only')).toBeNull();
  });

  test('blocks user ranges touching frontmatter while leaving body edits available', () => {
    const bodyStart = record.indexOf('Body');
    expect(sourceChangeTouchesDatabaseFrontmatter(record, [{ from: 0, to: 0 }])).toBe(true);
    expect(
      sourceChangeTouchesDatabaseFrontmatter(record, [{ from: bodyStart - 2, to: bodyStart + 2 }]),
    ).toBe(true);
    expect(
      sourceChangeTouchesDatabaseFrontmatter(record, [{ from: bodyStart, to: bodyStart + 4 }]),
    ).toBe(false);
  });
});
