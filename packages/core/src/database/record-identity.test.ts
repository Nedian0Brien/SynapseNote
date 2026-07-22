import { describe, expect, test } from 'bun:test';
import { createDatabaseRecordId, ensureDatabaseRecordIdentity } from './record-identity.ts';

const FIXED_UUID = '018f7f3d-90ab-7ccd-8123-456789abcdef';

describe('database record identity', () => {
  test('generates a UUID-backed, schema-valid stable ID', () => {
    expect(createDatabaseRecordId(() => FIXED_UUID)).toBe('rec_018f7f3d90ab7ccd8123456789abcdef');
    expect(() => createDatabaseRecordId(() => 'not-a-uuid')).toThrow('RFC 4122');
  });

  test('adds frontmatter while preserving a frontmatter-less body byte for byte', () => {
    const body = '# Heading\r\n\r\nBody  \r\n';
    const result = ensureDatabaseRecordIdentity({
      markdown: body,
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
      generateUuid: () => FIXED_UUID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.markdown.endsWith(body)).toBe(true);
    expect(result.markdown).toStartWith('---\r\n_sn:\r\n');
  });

  test('inserts only _sn and preserves existing CRLF frontmatter bytes', () => {
    const original =
      '---  \r\n# keep this comment\r\ntitle: "Quoted title"\r\ntags: [one, two]\r\n\r\n---\t\r\nBody\r\n';
    const result = ensureDatabaseRecordIdentity({
      markdown: original,
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
      recordId: 'rec_fixed',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toBe(
      '---  \r\n# keep this comment\r\ntitle: "Quoted title"\r\ntags: [one, two]\r\n\r\n_sn:\r\n  database_id: db_notes\r\n  source_id: ds_notes\r\n  record_id: rec_fixed\r\n---\t\r\nBody\r\n',
    );
  });

  test('is idempotent for matching metadata and refuses mismatches', () => {
    const markdown = `---
_sn:
  database_id: db_notes
  source_id: ds_notes
  record_id: rec_existing
title: Existing
---
Body
`;
    const same = ensureDatabaseRecordIdentity({
      markdown,
      databaseId: 'db_notes',
      sourceId: 'ds_notes',
    });
    expect(same).toEqual({
      ok: true,
      changed: false,
      recordId: 'rec_existing',
      markdown,
    });

    expect(
      ensureDatabaseRecordIdentity({
        markdown,
        databaseId: 'db_other',
        sourceId: 'ds_notes',
      }),
    ).toMatchObject({ ok: false, code: 'database_mismatch' });
    expect(
      ensureDatabaseRecordIdentity({
        markdown,
        databaseId: 'db_notes',
        sourceId: 'ds_other',
      }),
    ).toMatchObject({ ok: false, code: 'source_mismatch' });
  });

  test('refuses malformed or partial existing metadata without rewriting it', () => {
    const malformed = `---
title: [
---
Body
`;
    expect(
      ensureDatabaseRecordIdentity({
        markdown: malformed,
        databaseId: 'db_notes',
        sourceId: 'ds_notes',
      }),
    ).toMatchObject({ ok: false, code: 'malformed_frontmatter' });

    const partial = `---
_sn:
  database_id: db_notes
title: Partial
---
Body
`;
    expect(
      ensureDatabaseRecordIdentity({
        markdown: partial,
        databaseId: 'db_notes',
        sourceId: 'ds_notes',
      }),
    ).toMatchObject({ ok: false, code: 'invalid_existing_metadata' });
  });

  test('refuses an insertion that would exceed the frontmatter region limit', () => {
    const markdown = `---\nlarge: ${'x'.repeat(65_500)}\n---\nBody\n`;
    expect(
      ensureDatabaseRecordIdentity({
        markdown,
        databaseId: 'db_notes',
        sourceId: 'ds_notes',
        recordId: 'rec_fixed',
      }),
    ).toMatchObject({ ok: false, code: 'frontmatter_too_large' });
  });
});
