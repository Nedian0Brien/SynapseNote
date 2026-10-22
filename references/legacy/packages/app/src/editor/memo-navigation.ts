import { requestDocPanelTab } from '@/components/doc-panel-events';

export interface MemoNavigationRequest {
  readonly docName: string;
  readonly memoId: string;
}

type MemoNavigationListener = (request: MemoNavigationRequest) => void;
const listeners = new Set<MemoNavigationListener>();

type MemoRevealListener = (request: MemoNavigationRequest) => void;
const revealListeners = new Set<MemoRevealListener>();
const pendingRevealRequests = new Map<string, MemoNavigationRequest>();

export function requestMemoNavigation(request: MemoNavigationRequest): void {
  for (const listener of listeners) listener(request);
}

export function subscribeMemoNavigation(listener: MemoNavigationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ask the Annotations panel to reveal a document marker's corresponding card. */
export function requestMemoReveal(request: MemoNavigationRequest): void {
  pendingRevealRequests.set(request.docName, request);
  for (const listener of revealListeners) listener(request);
  requestDocPanelTab('memo');
}

export function consumePendingMemoReveal(docName: string): MemoNavigationRequest | null {
  const request = pendingRevealRequests.get(docName) ?? null;
  pendingRevealRequests.delete(docName);
  return request;
}

export function subscribeMemoReveal(listener: MemoRevealListener): () => void {
  revealListeners.add(listener);
  return () => revealListeners.delete(listener);
}
