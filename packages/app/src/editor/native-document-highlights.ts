import type { DocumentMemoAnchor, DocumentMemoQuote } from '@/lib/document-memo-store';

export interface NativeDocumentHighlight {
  readonly id: string;
  readonly quote: DocumentMemoQuote;
  readonly from: number;
  readonly to: number;
}

type HighlightListener = (highlights: readonly NativeDocumentHighlight[]) => void;
const highlightsByDocument = new Map<string, readonly NativeDocumentHighlight[]>();
const listenersByDocument = new Map<string, Set<HighlightListener>>();

export function readNativeDocumentHighlights(docName: string): readonly NativeDocumentHighlight[] {
  return highlightsByDocument.get(docName) ?? [];
}

export function publishNativeDocumentHighlights(
  docName: string,
  highlights: readonly NativeDocumentHighlight[],
): void {
  highlightsByDocument.set(docName, highlights);
  for (const listener of listenersByDocument.get(docName) ?? []) listener(highlights);
}

export function subscribeNativeDocumentHighlights(
  docName: string,
  listener: HighlightListener,
): () => void {
  const listeners = listenersByDocument.get(docName) ?? new Set<HighlightListener>();
  listeners.add(listener);
  listenersByDocument.set(docName, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByDocument.delete(docName);
  };
}

export interface NativeHighlightMutationRequest {
  readonly docName: string;
  readonly action: 'add' | 'remove';
  readonly anchor: DocumentMemoAnchor;
}

type MutationListener = (request: NativeHighlightMutationRequest) => void;
const mutationListeners = new Set<MutationListener>();

export function requestNativeHighlightMutation(request: NativeHighlightMutationRequest): void {
  for (const listener of mutationListeners) listener(request);
}

export function subscribeNativeHighlightMutations(listener: MutationListener): () => void {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
}
