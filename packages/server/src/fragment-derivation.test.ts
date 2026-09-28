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

  test('a client edit to the fragment clears the mark', () => {
    const { doc, xmlFragment, ytext, cleanup } = setup('# Title\n\nFirst paragraph.\n');
    doc.transact(() => ytext.insert(ytext.length, '\nMore.\n'), remote);
    expect(fragmentDerivation(doc)).toBeDefined();
    const paragraph = xmlFragment
      .toArray()
      .find((n) => n instanceof Y.XmlElement && n.nodeName === 'paragraph');
    const text = (paragraph as Y.XmlElement)
      .toArray()
      .find((c) => c instanceof Y.XmlText) as Y.XmlText;
    doc.transact(() => text.insert(0, 'Edited '), remote);
    // Observer A rewrote Y.Text from the fragment; the fragment was not derived from it.
    expect(fragmentDerivation(doc)).toBeUndefined();
    cleanup();
  });
});
