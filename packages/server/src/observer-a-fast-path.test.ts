import { describe, expect, test } from 'bun:test';
import { EditorState } from '@tiptap/pm/state';
import {
  initProseMirrorDoc,
  updateYFragment,
  yXmlFragmentToProseMirrorRootNode,
} from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { fragmentDerivation } from './fragment-derivation.ts';
import { mdManager, schema } from './md-manager.ts';
import { type ObserverAFallbackReason, setupServerObservers } from './server-observers.ts';

const DOC = `# Title

A first paragraph with **bold**, *emphasis*, and \`code\`.

- a list item
- another item with [a link](https://example.com)

> a quote

Second paragraph.

<Callout type="note">
Inside a component.
</Callout>

Last paragraph.
`;

const remote = {}; // a client connection's origin

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
  const paths: ('incremental' | 'full')[] = [];
  const reasons: (ObserverAFallbackReason | undefined)[] = [];
  const cleanup = setupServerObservers({
    doc,
    xmlFragment,
    ytext,
    mdManager,
    schema,
    docName: 'fast-path',
    onObserverAPath: (path, reason) => {
      paths.push(path);
      reasons.push(reason);
    },
  });
  return { doc, xmlFragment, ytext, paths, reasons, cleanup };
}

/** The web editor's path: a ProseMirror transaction applied with updateYFragment. */
function webEdit(
  doc: Y.Doc,
  fragment: Y.XmlFragment,
  edit: (state: EditorState) => EditorState['tr'],
): void {
  const { doc: pmDoc, meta } = initProseMirrorDoc(fragment, schema);
  const tr = edit(EditorState.create({ doc: pmDoc }));
  doc.transact(() => updateYFragment(doc, fragment, tr.doc, meta), remote);
}

function textblockPositions(fragment: Y.XmlFragment, type: string): number[] {
  const { doc } = initProseMirrorDoc(fragment, schema);
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === type && node.content.size > 0) positions.push(pos + 1);
    return node.type.name !== 'jsxComponent';
  });
  return positions;
}

/** JSON without mdast positions and the doc-level whitespace record: a
 *  fragment keeps the positions it was parsed with, and Y.XmlFragment does
 *  not carry doc attrs at all. */
function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key !== 'position' && key !== 'sourceDocBoundary') out[key] = comparable(item);
  }
  return out;
}
const fragmentJson = (fragment: Y.XmlFragment) =>
  JSON.stringify(comparable(yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON()));
const parsedJson = (text: string) =>
  JSON.stringify(comparable(schema.nodeFromJSON(mdManager.parseWithFallback(text)).toJSON()));

/** The span where two texts differ, as [start, beforeEnd, afterEnd]. */
function changedSpan(before: string, after: string): [number, number, number] {
  let p = 0;
  while (p < before.length && before[p] === after[p]) p++;
  let q = 0;
  while (
    q < before.length - p &&
    q < after.length - p &&
    before[before.length - 1 - q] === after[after.length - 1 - q]
  )
    q++;
  return [p, before.length - q, after.length - q];
}

describe('Observer A incremental path', () => {
  test('typing into paragraphs settles incrementally and Y.Text parses back to the fragment', () => {
    const { doc, xmlFragment, ytext, paths, cleanup } = setup(DOC);
    for (let i = 0; i < 12; i++) {
      const spots = textblockPositions(xmlFragment, 'paragraph');
      const at = spots[i % spots.length];
      const before = ytext.toString();
      webEdit(doc, xmlFragment, (state) => state.tr.insertText(i % 2 ? ' word' : '한', at + 1));
      const after = ytext.toString();
      expect(paths.at(-1)).toBe('incremental');
      expect(parsedJson(after)).toBe(fragmentJson(xmlFragment));
      // Bytes outside the edited paragraph are untouched: one span changed, inside one block.
      const [start, beforeEnd, afterEnd] = changedSpan(before, after);
      expect(before.slice(start, beforeEnd)).not.toContain('\n\n');
      expect(after.slice(start, afterEnd)).not.toContain('\n\n');
    }
    cleanup();
  });

  test('a fragment derived from Y.Text stays marked as derived after fast-path edits', () => {
    const { doc, xmlFragment, ytext, paths, cleanup } = setup(DOC);
    doc.transact(() => ytext.insert(0, 'Intro.\n\n'), remote); // Observer B derives
    expect(fragmentDerivation(doc)?.text).toBe(ytext.toString());
    const at = textblockPositions(xmlFragment, 'paragraph').at(-1) ?? 0;
    webEdit(doc, xmlFragment, (state) => state.tr.insertText('!', at + 1));
    expect(paths.at(-1)).toBe('incremental');
    expect(fragmentDerivation(doc)?.text).toBe(ytext.toString());
    expect(parsedJson(ytext.toString())).toBe(fragmentJson(xmlFragment));
    cleanup();
  });

  test('an edit inside a component takes the full path', () => {
    const { doc, xmlFragment, paths, reasons, cleanup } = setup(DOC);
    const { doc: pmDoc } = initProseMirrorDoc(xmlFragment, schema);
    let componentIndex = -1;
    pmDoc.forEach((node, _offset, index) => {
      if (node.type.name === 'jsxComponent') componentIndex = index;
    });
    expect(componentIndex).toBeGreaterThan(-1);
    const component = xmlFragment.get(componentIndex) as Y.XmlElement;
    doc.transact(() => component.setAttribute('sourceDirty', true as unknown as string), remote);
    expect(paths.at(-1)).toBe('full');
    expect(reasons.at(-1)).toBe('full-path-node');
    cleanup();
  });

  test('splitting a paragraph takes the full path, and the next edit is incremental again', () => {
    const { doc, xmlFragment, ytext, paths, reasons, cleanup } = setup(DOC);
    const at = textblockPositions(xmlFragment, 'paragraph')[0];
    webEdit(doc, xmlFragment, (state) => state.tr.split(at + 3));
    expect(paths.at(-1)).toBe('full');
    expect(reasons.at(-1)).toBe('structure');
    expect(parsedJson(ytext.toString())).toBe(fragmentJson(xmlFragment));

    const last = textblockPositions(xmlFragment, 'paragraph').at(-1) ?? 0;
    webEdit(doc, xmlFragment, (state) => state.tr.insertText('!', last + 1));
    expect(paths.at(-1)).toBe('incremental');
    expect(parsedJson(ytext.toString())).toBe(fragmentJson(xmlFragment));
    cleanup();
  });

  test('a Y.Text write in the same drain as a client edit takes the full path', () => {
    const { doc, xmlFragment, ytext, paths, reasons, cleanup } = setup(DOC);
    const { doc: pmDoc, meta } = initProseMirrorDoc(xmlFragment, schema);
    const at = textblockPositions(xmlFragment, 'paragraph').at(-1) ?? 0;
    const tr = EditorState.create({ doc: pmDoc }).tr.insertText('!', at + 1);
    doc.transact(() => {
      ytext.insert(0, 'Agent line.\n\n');
      updateYFragment(doc, xmlFragment, tr.doc, meta);
    }, remote);
    expect(paths.at(-1)).toBe('full');
    expect(reasons.at(-1)).toBe('text-moved');
    expect(ytext.toString()).toContain('Agent line.');
    expect(ytext.toString()).toContain('L!ast paragraph.');
    cleanup();
  });

  test('a neighbour that is not the parse of its source sends the edit to the full path', () => {
    const { doc, xmlFragment, ytext, paths, reasons, cleanup } = setup(
      'First.\n\nMiddle.\n\nLast.\n',
    );
    // A paired writer leaves the middle block different from its source bytes.
    const paired = { source: 'local', context: { origin: 'fast-path-test', paired: true } };
    const middle = xmlFragment.get(1) as Y.XmlElement;
    doc.transact(() => {
      (middle.get(0) as Y.XmlText).insert(0, 'Changed ');
    }, paired);
    const before = ytext.toString();
    const at = textblockPositions(xmlFragment, 'paragraph')[0];
    webEdit(doc, xmlFragment, (state) => state.tr.insertText('!', at + 'First'.length));
    expect(paths.at(-1)).toBe('full');
    expect(reasons.at(-1)).toBe('neighbour');
    expect(ytext.toString()).not.toBe(before);
    expect(ytext.toString()).toContain('First!');
    cleanup();
  });
});
