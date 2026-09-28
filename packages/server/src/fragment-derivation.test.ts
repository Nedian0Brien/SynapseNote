import { describe, expect, test } from 'bun:test';
import { updateYFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { fragmentDerivation } from './fragment-derivation.ts';
import { mdManager, schema } from './md-manager.ts';
import { setupServerObservers } from './server-observers.ts';

function setup(markdown: string) {
  const doc = new Y.Doc();
  const xmlFragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  doc.transact(() => {
    ytext.insert(0, markdown);
    updateYFragment(doc, xmlFragment, schema.nodeFromJSON(mdManager.parse(markdown)), {
      mapping: new Map(),
      isOMark: new Map(),
    });
  });
  const cleanup = setupServerObservers({
    doc,
    xmlFragment,
    ytext,
    mdManager,
    schema,
    docName: 'derivation',
  });
  return { doc, xmlFragment, ytext, cleanup };
}

const remote = {}; // a client connection's origin

describe('fragment derivation mark', () => {
  test('a Y.Text edit leaves the fragment marked as the parse of the new text', () => {
    const { doc, ytext, cleanup } = setup('# Title\n\nFirst paragraph.\n');
    doc.transact(() => ytext.insert(ytext.length, '\nSecond paragraph.\n'), remote);
    expect(fragmentDerivation(doc)?.text).toBe(ytext.toString());
    cleanup();
  });

  test('a parse-invisible Y.Text edit keeps an exact mark on the new text', () => {
    const { doc, ytext, cleanup } = setup('# Title\n\nFirst paragraph.\n');
    doc.transact(() => ytext.insert(ytext.length, '\nMore.\n'), remote); // B derives
    const titleEnd = ytext.toString().indexOf('\n');
    doc.transact(() => ytext.insert(titleEnd, '   '), remote); // trailing spaces
    expect(fragmentDerivation(doc)).toEqual({ text: ytext.toString(), exact: true });
    cleanup();
  });

  test('a normalize-equal edit that parses differently drops the mark', () => {
    const { doc, ytext, cleanup } = setup('foo\n\nbar\n');
    doc.transact(() => ytext.insert(ytext.length, '\n2. item\n'), remote); // B derives
    expect(fragmentDerivation(doc)?.text).toBe(ytext.toString());
    // `foo\n\n...\n\n2. item` → `...\n2. item`: a list item that cannot
    // interrupt a paragraph becomes paragraph text, yet normalizes the same.
    const at = ytext.toString().lastIndexOf('\n2. item');
    doc.transact(() => ytext.delete(at, 1), remote);
    expect(fragmentDerivation(doc)?.text).not.toBe(ytext.toString());
    cleanup();
  });

  test('a client edit to the fragment clears the mark', () => {
    const { doc, xmlFragment, ytext, cleanup } = setup('# Title\n\nFirst paragraph.\n');
    doc.transact(() => ytext.insert(ytext.length, '\nMore.\n'), remote);
    expect(fragmentDerivation(doc)).toBeDefined();
    // A new top-level block goes through Observer A's full path, which
    // rewrites Y.Text from the fragment; the fragment was not derived from it.
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Inserted.')]);
    doc.transact(() => xmlFragment.insert(1, [paragraph]), remote);
    expect(ytext.toString()).toContain('Inserted.');
    expect(fragmentDerivation(doc)).toBeUndefined();
    cleanup();
  });
});
