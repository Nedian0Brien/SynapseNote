// what the app needs to keep a copy of the workspace session: the records that changed since the last report,
// found by reference since morrow's state is never mutated, with a revision so the app applies them in order
import type { DocNode, PageId, PageMeta, WorkspaceState } from '../vendor/morrow/src/core/model';

export interface StateDelta {
  revision: number;
  // true when this delta holds the whole workspace, the app then drops what it had
  full: boolean;
  pages: PageMeta[];
  docs: Record<PageId, DocNode>;
  removed: PageId[];
  // pages that stay but whose document is gone, such as an encrypted page locked again
  removedDocs: PageId[];
  unreadable: PageId[];
  // the saves per day and the flashcard progress, only when they changed
  activity?: Record<string, number>;
  reviewLog?: unknown;
}

export interface DeltaSource {
  state: WorkspaceState;
  unreadable: Iterable<PageId>;
  activity: Record<string, number>;
  reviewLog: unknown;
}

export function createDeltas() {
  let revision = 0;
  let pages: WorkspaceState['pages'] = {};
  let docs: WorkspaceState['docs'] = {};
  let activity = '';
  let reviewLog = '';
  let started = false;

  return {
    // starts over, the next delta is the whole workspace
    reset(): void {
      started = false;
    },
    next(source: DeltaSource): StateDelta | null {
      const full = !started;
      const delta: StateDelta = {
        revision: revision + 1,
        full,
        pages: [],
        docs: {},
        removed: [],
        removedDocs: [],
        unreadable: [...source.unreadable],
      };
      const { state } = source;
      for (const [id, page] of Object.entries(state.pages)) if (full || pages[id] !== page) delta.pages.push(page);
      for (const [id, doc] of Object.entries(state.docs)) if (full || docs[id] !== doc) delta.docs[id] = doc;
      if (!full) {
        for (const id of Object.keys(pages)) if (!state.pages[id]) delta.removed.push(id);
        for (const id of Object.keys(docs)) if (!state.docs[id] && state.pages[id]) delta.removedDocs.push(id);
      }
      const activityText = JSON.stringify(source.activity);
      const logText = JSON.stringify(source.reviewLog);
      if (full || activityText !== activity) delta.activity = source.activity;
      if (full || logText !== reviewLog) delta.reviewLog = source.reviewLog;
      const changed =
        full ||
        delta.pages.length > 0 ||
        Object.keys(delta.docs).length > 0 ||
        delta.removed.length > 0 ||
        delta.removedDocs.length > 0 ||
        delta.activity !== undefined ||
        delta.reviewLog !== undefined;
      if (!changed) return null;
      started = true;
      revision = delta.revision;
      pages = state.pages;
      docs = state.docs;
      activity = activityText;
      reviewLog = logText;
      return delta;
    },
  };
}
