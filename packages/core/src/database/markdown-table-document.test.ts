import { describe, expect, test } from 'bun:test';
import {
  normalizeDatabaseDocumentTitle,
  replaceDatabaseDocumentTitle,
  resolveDatabaseDocumentTitle,
  titleLinkWithDocumentTitle,
} from './markdown-table-document.ts';

describe('v2 document title contract', () => {
  test('frontmatter title is authoritative and replacement preserves body bytes', () => {
    const markdown = '---\n_sn:\n  document_id: doc_a\ntitle: Old\nother: keep\n---\n# Body heading\nBody  \n';
    expect(resolveDatabaseDocumentTitle(markdown, 'a.md')).toEqual({ value: 'Old', origin: 'frontmatter' });
    const changed = replaceDatabaseDocumentTitle(markdown, 'New title');
    expect(changed).toMatchObject({ ok: true, title: 'New title' });
    if (!changed.ok) return;
    expect(changed.markdown).toBe('---\n_sn:\n  document_id: doc_a\ntitle: "New title"\nother: keep\n---\n# Body heading\nBody  \n');
  });

  test('uses the first non-fenced H1 when frontmatter has no title', () => {
    const markdown = '---\n_sn:\n  document_id: doc_a\n---\n```md\n# Example\n```\n# Actual\nBody\n';
    expect(resolveDatabaseDocumentTitle(markdown, 'a.md')).toEqual({ value: 'Actual', origin: 'heading' });
    const changed = replaceDatabaseDocumentTitle(markdown, 'Renamed');
    expect(changed).toMatchObject({ ok: true });
    if (!changed.ok) return;
    expect(changed.markdown).toContain('title: "Renamed"');
    expect(changed.markdown).toContain('```md\n# Example\n```\n# Actual\nBody\n');
  });

  test('title validation and alias generation are shared by table/document callers', () => {
    expect(normalizeDatabaseDocumentTitle('  A  ')).toEqual({ ok: true, value: 'A' });
    expect(normalizeDatabaseDocumentTitle('')).toMatchObject({ ok: false, code: 'empty' });
    expect(normalizeDatabaseDocumentTitle('a\nb')).toMatchObject({ ok: false, code: 'line_break' });
    expect(titleLinkWithDocumentTitle({ kind: 'wikilink', target: 'notes/a' }, 'A')).toEqual({
      ok: true,
      link: { kind: 'wikilink', target: 'notes/a', alias: 'A' },
    });
  });
});
