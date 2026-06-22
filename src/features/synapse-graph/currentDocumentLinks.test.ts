import * as Y from 'yjs';

import { MentionType, YDoc, YjsEditorKey, YSharedRoot } from '@/application/types';

import { currentDocumentLinks } from './currentDocumentLinks';

function createDocument({
  textDeltas = [],
  blockData = [],
}: {
  textDeltas?: Array<Array<{ insert: string; attributes?: Record<string, unknown> }>>;
  blockData?: object[];
}) {
  const doc = new Y.Doc() as YDoc;
  const sharedRoot = doc.getMap(YjsEditorKey.data_section) as YSharedRoot;
  const document = new Y.Map<unknown>();
  const meta = new Y.Map<unknown>();
  const textMap = new Y.Map<Y.Text>();
  const blocks = new Y.Map<unknown>();

  textDeltas.forEach((delta, index) => {
    const text = new Y.Text();

    text.applyDelta(delta);
    textMap.set(`text-${index}`, text);
  });

  blockData.forEach((data, index) => {
    const block = new Y.Map<unknown>();

    block.set(YjsEditorKey.block_data, JSON.stringify(data));
    blocks.set(`block-${index}`, block);
  });

  meta.set(YjsEditorKey.text_map, textMap);
  document.set(YjsEditorKey.meta, meta);
  document.set(YjsEditorKey.blocks, blocks);
  sharedRoot.set(YjsEditorKey.document, document);

  return doc;
}

describe('currentDocumentLinks', () => {
  it('extracts page mention links from the active Yjs document', () => {
    const doc = createDocument({
      textDeltas: [
        [
          {
            insert: 'Target page',
            attributes: {
              mention: {
                type: MentionType.PageRef,
                page_id: 'target-view',
              },
            },
          },
        ],
      ],
    });

    expect(currentDocumentLinks({
      doc,
      sourceViewId: 'source-view',
      knownViewIds: ['source-view', 'target-view'],
    })).toEqual([
      {
        source: 'source-view',
        target: 'target-view',
        edge_type: 'wikilink',
      },
    ]);
  });

  it('extracts view ids from block data and ignores unknown or self targets', () => {
    const doc = createDocument({
      blockData: [
        { view_id: 'self-view' },
        { view_ids: ['database-view', 'unknown-view'] },
      ],
    });

    expect(currentDocumentLinks({
      doc,
      sourceViewId: 'self-view',
      knownViewIds: ['self-view', 'database-view'],
    })).toEqual([
      {
        source: 'self-view',
        target: 'database-view',
        edge_type: 'wikilink',
      },
    ]);
  });
});
