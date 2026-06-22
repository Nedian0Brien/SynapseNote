import * as Y from 'yjs';

import { MentionType, YDoc, YjsEditorKey, YSharedRoot } from '@/application/types';

import { SynapseGraphEdge } from './outlineToGraph';

type CurrentDocumentLinksOptions = {
  doc?: YDoc;
  sourceViewId?: string;
  knownViewIds?: Iterable<string>;
};

type DeltaOp = {
  attributes?: {
    mention?: {
      type?: string;
      page_id?: string;
      block_id?: string;
    };
  };
};

export function currentDocumentLinks({
  doc,
  sourceViewId,
  knownViewIds,
}: CurrentDocumentLinksOptions): SynapseGraphEdge[] {
  if (!doc || !sourceViewId) return [];

  const known = knownViewIds ? new Set(knownViewIds) : null;
  const targets = new Set<string>();

  collectMentionTargets(doc, targets);
  collectBlockDataTargets(doc, targets);

  return Array.from(targets)
    .filter((targetViewId) => targetViewId !== sourceViewId)
    .filter((targetViewId) => !known || known.has(targetViewId))
    .map((targetViewId) => ({
      source: sourceViewId,
      target: targetViewId,
      edge_type: 'wikilink',
    }));
}

function collectMentionTargets(doc: YDoc, targets: Set<string>) {
  const textMap = getTextMap(doc);

  if (!textMap) return;

  for (const text of textMap.values()) {
    if (!(text instanceof Y.Text)) continue;

    for (const op of text.toDelta() as DeltaOp[]) {
      const mention = op.attributes?.mention;

      if (
        mention?.page_id &&
        (mention.type === MentionType.PageRef || mention.type === MentionType.childPage)
      ) {
        targets.add(mention.page_id);
      }
    }
  }
}

function collectBlockDataTargets(doc: YDoc, targets: Set<string>) {
  const blocks = getBlocks(doc);

  if (!blocks) return;

  for (const block of blocks.values()) {
    if (!(block instanceof Y.Map)) continue;

    const rawData = block.get(YjsEditorKey.block_data);
    if (typeof rawData !== 'string' || rawData.length === 0) continue;

    let data: unknown;
    try {
      data = JSON.parse(rawData);
    } catch {
      continue;
    }

    collectViewIdsFromData(data, targets);
  }
}

function collectViewIdsFromData(data: unknown, targets: Set<string>) {
  if (!data || typeof data !== 'object') return;

  const maybeData = data as { view_id?: unknown; view_ids?: unknown };

  if (typeof maybeData.view_id === 'string') {
    targets.add(maybeData.view_id);
  }

  if (Array.isArray(maybeData.view_ids)) {
    maybeData.view_ids.forEach((viewId) => {
      if (typeof viewId === 'string') {
        targets.add(viewId);
      }
    });
  }
}

function getDocument(doc: YDoc) {
  const sharedRoot = doc.getMap(YjsEditorKey.data_section) as YSharedRoot | undefined;

  return sharedRoot?.get(YjsEditorKey.document) as Y.Map<unknown> | undefined;
}

function getBlocks(doc: YDoc) {
  return getDocument(doc)?.get(YjsEditorKey.blocks) as Y.Map<unknown> | undefined;
}

function getTextMap(doc: YDoc) {
  const meta = getDocument(doc)?.get(YjsEditorKey.meta) as Y.Map<unknown> | undefined;

  return meta?.get(YjsEditorKey.text_map) as Y.Map<Y.Text> | undefined;
}
