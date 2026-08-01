import { describe, expect, test } from 'bun:test';
import { planDatabaseMarkdownIdentityRepair } from './markdown-table-identity-repair.ts';

const owner = (alias: string, block = 'dbb_tasks') => `<!-- synapsenote:database
version=2
database=db_tasks
source=ds_tasks
block=${block}
columns=prop_title
-->

| Title |
| --- |
| [[tasks/alpha\\|${alias}]] |
`;

describe('Markdown identity repair planning', () => {
  test('plans a stable document-id assignment and title alias repair without writing', () => {
    const plan = planDatabaseMarkdownIdentityRepair({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      owners: [{ path: 'tasks.md', markdown: owner('Old title') }],
      documents: [{ path: 'tasks/alpha.md', markdown: '# Alpha\n\nBody\n' }],
      proposedDocumentIds: { 'tasks/alpha.md': 'doc_alpha123456789012345678901234' },
    });
    expect(plan.committable).toBe(true);
    expect(plan.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'assign_document_id', path: 'tasks/alpha.md' }),
        expect.objectContaining({
          kind: 'rewrite_title_alias',
          ownerPath: 'tasks.md',
          rowIndex: 0,
        }),
      ]),
    );
    expect(plan.issues.map((issue) => issue.code)).toEqual(['stale_alias']);
    expect(plan.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('blocks duplicate owners, duplicate document identities, and duplicate row links', () => {
    const markdown = `---\n_sn:\n  document_id: doc_alpha123456789012345678901234\n---\n# Alpha\n`;
    const plan = planDatabaseMarkdownIdentityRepair({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      owners: [
        { path: 'one.md', markdown: owner('Alpha', 'dbb_one') },
        { path: 'two.md', markdown: owner('Alpha', 'dbb_two') },
      ],
      documents: [
        { path: 'tasks/alpha.md', markdown },
        { path: 'tasks/copy.md', markdown },
      ],
    });
    expect(plan.committable).toBe(false);
    expect(plan.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['duplicate_owner', 'duplicate_document_id']),
    );
  });
});
