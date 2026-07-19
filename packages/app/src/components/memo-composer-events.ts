import type { SelectionSnapshot } from '@/editor/selection-context';
import type { DocumentMemoQuote } from '@/lib/document-memo-store';
import { requestDocPanelTab } from './doc-panel-events';

const MEMO_COMPOSER_EVENT = 'synapsenote:memo-composer';
const MAX_DOCUMENT_MEMO_QUOTE_LENGTH = 2_000;
const pendingRequests = new Map<string, MemoComposerRequest>();

export interface MemoComposerRequest {
  readonly docName: string;
  readonly quote: DocumentMemoQuote;
}

export function memoQuoteFromSelection(selection: SelectionSnapshot): DocumentMemoQuote {
  return {
    markdown: selection.markdown.trim().slice(0, MAX_DOCUMENT_MEMO_QUOTE_LENGTH),
    sourceLineStart: selection.sourceLineStart,
    sourceLineEnd: selection.sourceLineEnd,
  };
}

export function consumePendingMemoComposerRequest(docName: string): MemoComposerRequest | null {
  const request = pendingRequests.get(docName) ?? null;
  pendingRequests.delete(docName);
  return request;
}

/**
 * Opens the document Memo tab with a passage already attached to the composer.
 * The pending map bridges the click-to-mount gap when another panel is active;
 * the event handles the already-mounted Memo tab without a remount.
 */
export function requestMemoComposer(
  request: MemoComposerRequest,
  target: Pick<Window, 'dispatchEvent'> | EventTarget = typeof window === 'undefined'
    ? new EventTarget()
    : window,
): void {
  pendingRequests.set(request.docName, request);
  target.dispatchEvent(
    new CustomEvent<MemoComposerRequest>(MEMO_COMPOSER_EVENT, { detail: request }),
  );
  requestDocPanelTab('memo', target);
}

export function subscribeToMemoComposerRequests(
  onRequest: (request: MemoComposerRequest) => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | EventTarget = typeof window ===
  'undefined'
    ? new EventTarget()
    : window,
): () => void {
  const listener = (event: Event) => {
    const request =
      event instanceof CustomEvent ? (event as CustomEvent<MemoComposerRequest>).detail : undefined;
    if (request?.docName && request.quote.markdown.trim()) onRequest(request);
  };
  target.addEventListener(MEMO_COMPOSER_EVENT, listener as EventListener);
  return () => target.removeEventListener(MEMO_COMPOSER_EVENT, listener as EventListener);
}
