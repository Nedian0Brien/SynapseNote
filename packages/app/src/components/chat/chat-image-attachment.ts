/**
 * Window-scoped pub/sub carrying an image from a note into the Chat panel's
 * composer — the "Send to AI" action on an image block's hover menu.
 *
 * Mirrors the `chat-panel-events` / `terminal-input-events` idiom: the
 * image's block chrome lives deep inside the ProseMirror subtree while the chat
 * attachment state lives in `EditorPane` (which owns the right rail and the
 * chat host), so a context alone cannot thread the intent between them without
 * lifting ownership of the node view.
 *
 * The payload is the attachment MINUS `absolutePath`: the emitting node view
 * knows the image's src and the doc it sits in, but not the workspace root.
 * `EditorPane` — which resolves the workspace once for the whole pane — fills
 * that field in before handing the attachment to a chat session.
 */

import { normalizeDocRelativeAssetUrl, toDesktopAssetHref } from '@nedian0brien/synapsenote-core';
import type { CliChatImageAttachment } from './cli-chat-types';

const CHAT_IMAGE_ATTACHMENT_EVENT = 'synapsenote:chat-image-attachment';

/** What the node view emits — the workspace-root-dependent `absolutePath` is
 *  added downstream, so it is never part of the wire payload. */
export type ChatImageAttachmentRequest = Omit<CliChatImageAttachment, 'absolutePath'>;

/**
 * Percent-decode one path segment, leaving a malformed sequence (`%E0%A4`,
 * a literal `%` in a filename) as-is rather than throwing. Asset hrefs in
 * markdown carry percent-encoding — the server's asset middleware decodes it
 * on the way out — so the filesystem path an agent opens has to be decoded
 * too, or `my%20photo.png` names a file that does not exist.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Build the composer attachment for an image node, or `null` when the image
 * has no local file behind it.
 *
 * `src` is the node's authored value — doc-relative (`./shot.png`), server-
 * absolute (`/assets/shot.png`), or an external URL. The first two resolve to
 * a content-root-relative path through the same normalizer the renderer uses
 * (`normalizeDocRelativeAssetUrl`), so the attachment always points at the file
 * the reader is actually looking at. An external URL (`https://…`, `data:`)
 * returns `null`: there is no path for a local agent to open, and offering the
 * action anyway would hand it a reference it cannot resolve.
 */
export function buildChatImageAttachment(
  src: string,
  sourceDocName: string | null | undefined,
  alt?: string,
): ChatImageAttachmentRequest | null {
  const trimmed = src.trim();
  if (trimmed === '') return null;
  const normalized = normalizeDocRelativeAssetUrl(trimmed, sourceDocName ?? undefined);
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return null;
  // The path is the filesystem location; `?query` / `#hash` are URL concerns.
  const hashIndex = normalized.indexOf('#');
  const withoutHash = hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;
  const pathPart = withoutHash.split('?')[0] ?? '';
  const path = pathPart
    .slice(1)
    .split('/')
    .filter((segment) => segment !== '')
    .map(decodeSegment)
    .join('/');
  if (path === '') return null;
  return {
    path,
    // The thumbnail resolves through the same desktop-origin rewrite the note's
    // own `<img>` uses, so a preview can't break for an image that renders.
    previewSrc: toDesktopAssetHref(normalized),
    ...(alt === undefined || alt === '' ? {} : { alt }),
  };
}

export function requestChatImageAttachment(
  attachment: ChatImageAttachmentRequest,
  target: Pick<Window, 'dispatchEvent'> | EventTarget = typeof window === 'undefined'
    ? new EventTarget()
    : window,
): void {
  target.dispatchEvent(
    new CustomEvent<ChatImageAttachmentRequest>(CHAT_IMAGE_ATTACHMENT_EVENT, {
      detail: attachment,
    }),
  );
}

export function subscribeToChatImageAttachment(
  onRequest: (attachment: ChatImageAttachmentRequest) => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | EventTarget = typeof window ===
  'undefined'
    ? new EventTarget()
    : window,
): () => void {
  const listener = (event: Event) => {
    const detail =
      event instanceof CustomEvent
        ? (event as CustomEvent<ChatImageAttachmentRequest>).detail
        : undefined;
    if (detail && typeof detail.path === 'string' && typeof detail.previewSrc === 'string') {
      onRequest(detail);
    }
  };
  target.addEventListener(CHAT_IMAGE_ATTACHMENT_EVENT, listener as EventListener);
  return () => target.removeEventListener(CHAT_IMAGE_ATTACHMENT_EVENT, listener as EventListener);
}
