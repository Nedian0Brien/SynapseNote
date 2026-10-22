import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });

/** Visible text of a parsed paragraph (what a reader sees, no markup). */
function visibleText(json: JSONContent): string {
  const collect = (node: JSONContent): string =>
    node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(collect).join('');
  return collect(json);
}

/**
 * Insert `inserted` right after the first character carrying `escapeMark`,
 * giving it that character's marks — what happens when a client types or a
 * Yjs peer inserts next to an escaped character.
 */
function insertInheritingEscape(json: JSONContent, inserted: string): JSONContent {
  const copy: JSONContent = structuredClone(json);
  let done = false;
  const visit = (node: JSONContent) => {
    if (done) return;
    if (node.type === 'text' && node.marks?.some((m) => m.type === 'escapeMark')) {
      node.text = `${node.text?.[0] ?? ''}${inserted}${node.text?.slice(1) ?? ''}`;
      done = true;
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(copy);
  if (!done) throw new Error('no escaped character to insert after');
  return copy;
}

describe('escapeMark that spread past its character', () => {
  test('only ASCII punctuation is written with a backslash', () => {
    const json = insertInheritingEscape(md.parse('c\\`x'), '⟦f:1⟧');
    // `⟦`, `f`, `1`, `⟧` are not escapable; `:` is ASCII punctuation.
    expect(md.serialize(json)).toBe('c\\`⟦f\\:1⟧x\n');
  });

  test('re-parsing the result shows no literal backslashes', () => {
    const json = insertInheritingEscape(md.parse('c\\`x'), '⟦f:1⟧');
    expect(visibleText(md.parse(md.serialize(json)))).toBe('c`⟦f:1⟧x');
  });

  test('repeated inserts next to escaped characters grow by at most two bytes per character', () => {
    let markdown = 'x \\*\\*세상\\*\\* y';
    let visible = visibleText(md.parse(markdown));
    for (let round = 0; round < 12; round++) {
      const inserted = round % 2 === 0 ? '세' : '*';
      const next = md.serialize(insertInheritingEscape(md.parse(markdown), inserted));
      expect(next.length - markdown.length).toBeLessThanOrEqual(2 * inserted.length);
      const nextVisible = visibleText(md.parse(next));
      expect(nextVisible.length - visible.length).toBe(inserted.length);
      expect(nextVisible).not.toContain('\\');
      markdown = next;
      visible = nextVisible;
    }
  });
});
