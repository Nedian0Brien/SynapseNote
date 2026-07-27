import { describe, expect, test } from 'bun:test';
import {
  resolveDatabaseMarkdownDocumentLink,
  type DatabaseMarkdownDocumentCandidate,
} from './markdown-table-links.ts';

const documents: DatabaseMarkdownDocumentCandidate[] = [
  { path: 'projects/alpha.md', documentId: 'doc_alpha', aliases: ['Alpha project'] },
  { path: 'archive/alpha.md', documentId: 'doc_archive_alpha', aliases: ['Archived Alpha'] },
  { path: 'projects/beta.md', documentId: 'doc_beta', aliases: ['Beta'] },
];

describe('database Markdown document link resolver', () => {
  test('resolves relative and extensionless paths before aliases', () => {
    expect(resolveDatabaseMarkdownDocumentLink({
      link: { kind: 'wikilink', target: './alpha' },
      fromPath: 'projects/owner.md',
      documents,
    })).toMatchObject({ ok: true, code: 'resolved', candidate: { documentId: 'doc_alpha' } });
    expect(resolveDatabaseMarkdownDocumentLink({
      link: { kind: 'wikilink', target: 'Alpha project' },
      documents,
    })).toMatchObject({ ok: true, candidate: { documentId: 'doc_alpha' } });
  });

  test('does not silently select ambiguous basename matches', () => {
    expect(resolveDatabaseMarkdownDocumentLink({
      link: { kind: 'wikilink', target: 'alpha' },
      documents,
    })).toMatchObject({ ok: false, code: 'ambiguous' });
  });

  test('rejects heading, embed, traversal, and duplicate identities explicitly', () => {
    expect(resolveDatabaseMarkdownDocumentLink({ link: { kind: 'wikilink', target: 'alpha#Heading' }, documents })).toMatchObject({ code: 'heading_not_allowed' });
    expect(resolveDatabaseMarkdownDocumentLink({ link: { kind: 'wikilink', target: '!alpha' }, documents })).toMatchObject({ code: 'embed_not_allowed' });
    expect(resolveDatabaseMarkdownDocumentLink({ link: { kind: 'wikilink', target: '../../alpha' }, fromPath: 'projects/owner.md', documents })).toMatchObject({ code: 'outside_root' });
    expect(resolveDatabaseMarkdownDocumentLink({
      link: { kind: 'wikilink', target: 'alpha' },
      documents: [...documents, { path: 'copy.md', documentId: 'doc_alpha' }],
    })).toMatchObject({ code: 'duplicate_document' });
  });
});
