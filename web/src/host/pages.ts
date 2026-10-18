// the workspace the native app sent, kept here so editor callbacks can answer at once
import { applyCommand } from '../../vendor/morrow/src/core/commands';
import type { DocNode, PageId, PageMeta, WorkspaceState } from '../../vendor/morrow/src/core/model';
import { newId } from '../../vendor/morrow/src/app/platform/files';
import { post } from '../bridge';

let state: WorkspaceState = { pages: {}, docs: {} };
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

export function getState(): WorkspaceState {
  return state;
}

export function setState(next: WorkspaceState): void {
  state = next;
  notify();
}

// the edited page's latest content, so embeds of it elsewhere stay current
export function setDoc(id: PageId, doc: DocNode): void {
  if (!state.pages[id]) return;
  state = { ...state, docs: { ...state.docs, [id]: doc } };
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// a new page made from the editor, such as a [[link]] to a page that does not exist yet
export function createPage(options: { parentId: PageId | null; title: string }): PageId | null {
  const id = newId();
  const result = applyCommand(state, {
    type: 'page.create',
    id,
    parentId: options.parentId,
    title: options.title,
    now: Date.now(),
  });
  if (!result.ok) return null;
  state = result.value.state;
  const page: PageMeta | undefined = state.pages[id];
  const doc: DocNode | undefined = state.docs[id];
  if (!page || !doc) return null;
  post({ type: 'pageCreated', page, doc });
  notify();
  return id;
}
