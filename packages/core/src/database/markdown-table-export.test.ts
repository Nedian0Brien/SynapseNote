import { describe, expect, test } from 'bun:test';
import { createDatabaseMarkdownTableExport } from './markdown-table-export.ts';

describe('Markdown table export contract', () => {
  test('canonical export contains exact owner/document bytes', () => {
    const exported = createDatabaseMarkdownTableExport({
      mode: 'canonical_markdown',
      manifestRevision: 'sha256:manifest',
      ownerPath: 'orders.md',
      ownerMarkdown: '<!-- synapsenote:database -->\n',
      linkedDocuments: [{ path: 'orders/a.md', markdown: '# A\n' }],
    });
    expect(exported.canonical.map((entry) => entry.path)).toEqual(['orders.md', 'orders/a.md']);
    expect(exported.snapshot).toEqual([]);
    expect(exported.canonical[0]?.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('computed export carries a revision-bound snapshot without canonical owner bytes', () => {
    const exported = createDatabaseMarkdownTableExport({
      mode: 'computed_snapshot',
      manifestRevision: 'sha256:manifest',
      ownerPath: 'orders.md',
      ownerMarkdown: '',
      evaluatedAt: '2026-07-27T00:00:00.000Z',
      derivedRevision: 'sha256:derived',
      records: [
        {
          recordId: 'rec_a',
          path: 'orders/a.md',
          values: { prop_count: 2 },
          computed: { prop_total: 4 },
        },
      ],
    });
    expect(exported.canonical).toEqual([]);
    expect(exported.derivedRevision).toBe('sha256:derived');
    expect(exported.snapshot[0]?.computed).toEqual({ prop_total: 4 });
  });
});
