import { describe, expect, test } from 'bun:test';
import {
  createDatabaseDocumentId,
  createDatabaseDocumentIdFromLegacyRecordId,
  createDatabaseMarkdownRecordId,
  ensureDatabaseDocumentIdentity,
  parseDatabaseDocumentIdentity,
  reassignDatabaseDocumentIdentity,
} from './document-identity.ts';

describe('database document identity', () => {
  test('reads a generic document ID independently of database record metadata', () => {
    const result = parseDatabaseDocumentIdentity(
      '---\n_sn:\n  document_id: doc_order_001\n  database_id: db_legacy\n---\n# Order\n',
    );
    expect(result).toEqual({ ok: true, documentId: 'doc_order_001' });
  });

  test('reports missing and malformed identity without guessing from a path', () => {
    expect(parseDatabaseDocumentIdentity('# No frontmatter')).toMatchObject({
      ok: false,
      code: 'missing_frontmatter',
    });
    expect(parseDatabaseDocumentIdentity('---\n_sn: [broken\n---\n# Broken\n')).toMatchObject({
      ok: false,
      code: 'malformed_frontmatter',
    });
    expect(parseDatabaseDocumentIdentity('---\ntitle: Missing\n---\n')).toMatchObject({
      ok: false,
      code: 'missing_document_id',
    });
  });

  test('derives portable source/document record IDs and preserves UUID normalization', () => {
    const first = createDatabaseMarkdownRecordId('ds_orders', 'doc_order_001');
    const second = createDatabaseMarkdownRecordId('ds_orders', 'doc_order_001');
    const otherSource = createDatabaseMarkdownRecordId('ds_projects', 'doc_order_001');
    expect(first).toBe(second);
    expect(otherSource).not.toBe(first);
    expect(first).toMatch(/^rec_[a-z2-7]+$/);
    expect(createDatabaseDocumentId(() => '01234567-89ab-cdef-0123-456789abcdef')).toBe(
      'doc_0123456789abcdef0123456789abcdef',
    );
  });

  test('adds generic document identity without rewriting unrelated frontmatter or body', () => {
    const source = '---\n# keep this comment\ntitle: A\n---\nBody  \n';
    const result = ensureDatabaseDocumentIdentity({ markdown: source, documentId: 'doc_alpha' });
    expect(result).toMatchObject({ ok: true, changed: true, documentId: 'doc_alpha' });
    if (!result.ok) return;
    expect(result.markdown).toBe(
      '---\n# keep this comment\ntitle: A\n_sn:\n  document_id: doc_alpha\n---\nBody  \n',
    );
    expect(parseDatabaseDocumentIdentity(result.markdown)).toEqual({
      ok: true,
      documentId: 'doc_alpha',
    });
    expect(
      ensureDatabaseDocumentIdentity({ markdown: result.markdown, documentId: 'doc_other' }),
    ).toMatchObject({ ok: true, changed: false, documentId: 'doc_alpha' });
  });

  test('derives migration document IDs from legacy record IDs', () => {
    expect(createDatabaseDocumentIdFromLegacyRecordId('rec_legacy_order')).toBe('doc_legacy_order');
  });

  test('reassigns only the existing identity during copy/paste', () => {
    const source = [
      '---',
      '# keep comment',
      '_sn:',
      '  document_id: "doc_original" # identity',
      '  custom: keep',
      '---',
      '# Body',
      '',
      'same bytes',
      '',
    ].join('\n');
    const result = reassignDatabaseDocumentIdentity({ markdown: source, documentId: 'doc_copy' });
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      previousDocumentId: 'doc_original',
      documentId: 'doc_copy',
    });
    if (!result.ok) return;
    expect(result.markdown).toContain('document_id: "doc_copy" # identity');
    expect(result.markdown).toContain('  custom: keep');
    expect(result.markdown.slice(result.markdown.indexOf('---', 4))).toBe(
      source.slice(source.indexOf('---', 4)),
    );
    expect(parseDatabaseDocumentIdentity(result.markdown)).toEqual({
      ok: true,
      documentId: 'doc_copy',
    });
    expect(
      reassignDatabaseDocumentIdentity({ markdown: result.markdown, documentId: 'doc_copy' }),
    ).toMatchObject({ ok: true, changed: false });
  });

  test('refuses identity reassignment for missing or malformed source metadata', () => {
    expect(
      reassignDatabaseDocumentIdentity({ markdown: '# no id', documentId: 'doc_copy' }),
    ).toMatchObject({ ok: false, code: 'missing_document_id' });
    expect(
      reassignDatabaseDocumentIdentity({
        markdown: '---\n_sn: [broken\n---\n',
        documentId: 'doc_copy',
      }),
    ).toMatchObject({ ok: false, code: 'malformed_frontmatter' });
    expect(
      reassignDatabaseDocumentIdentity({
        markdown: '---\n_sn:\n  document_id: nope\n---\n',
        documentId: 'doc_copy',
      }),
    ).toMatchObject({ ok: false, code: 'invalid_existing_document_id' });
  });
});
