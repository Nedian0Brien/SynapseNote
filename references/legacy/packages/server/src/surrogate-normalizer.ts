/**
 * Keep `Y.Text('source')` free of unpaired UTF-16 surrogates.
 *
 * A lone half can only exist in a doc that inserted it itself: Yjs encodes
 * updates as UTF-8, so every peer that receives the insertion decodes U+FFFD.
 * If the server's own copy keeps the half, it differs from every client, its
 * disk write (UTF-8) differs from its `reconciledBase`, and later comparisons
 * against disk never settle. So after any drain that touched the text, a lone
 * half is replaced with U+FFFD — the same character every peer already holds —
 * in a follow-up transaction that also reaches clients.
 *
 * The replacement uses its own origin: not paired (it touches only Y.Text, so
 * Observer B must re-derive the fragment) and with store hooks on (so it is
 * persisted like any other edit).
 */
import type { Extension, LocalTransactionOrigin } from '@hocuspocus/server';
import { loneSurrogateOffsets } from '@nedian0brien/synapsenote-core';
import type * as Y from 'yjs';

export const SURROGATE_REPAIR_ORIGIN = {
  source: 'local',
  skipStoreHooks: false,
  context: { origin: 'surrogate-repair' },
} as const satisfies LocalTransactionOrigin;

/** Attach the normalizer to one document. Returns a detach function. */
export function attachSurrogateNormalizer(
  doc: Y.Doc,
  onRepair?: (count: number) => void,
): () => void {
  const ytext = doc.getText('source');
  let touched = false;

  const onTextChange = (_event: Y.YTextEvent, transaction: Y.Transaction): void => {
    if (transaction.origin !== SURROGATE_REPAIR_ORIGIN) touched = true;
  };

  const onAfterAllTransactions = (): void => {
    if (!touched) return;
    touched = false;
    const offsets = loneSurrogateOffsets(ytext.toString());
    if (offsets.length === 0) return;
    doc.transact(() => {
      // Back to front so earlier offsets stay valid. Each half is one UTF-16
      // unit and U+FFFD is one unit, so the text length does not change.
      for (let i = offsets.length - 1; i >= 0; i--) {
        ytext.delete(offsets[i], 1);
        ytext.insert(offsets[i], '\uFFFD');
      }
    }, SURROGATE_REPAIR_ORIGIN);
    onRepair?.(offsets.length);
  };

  ytext.observe(onTextChange);
  doc.on('afterAllTransactions', onAfterAllTransactions);
  return () => {
    ytext.unobserve(onTextChange);
    doc.off('afterAllTransactions', onAfterAllTransactions);
  };
}

/**
 * Hocuspocus extension: normalize every loaded document, including system,
 * config and mermaid docs, which also carry `Y.Text('source')` but are skipped
 * by the markdown bridge.
 */
export function createSurrogateNormalizerExtension(
  opts: { onRepair?: (docName: string, count: number) => void } = {},
): Extension {
  const detach = new Map<string, () => void>();
  return {
    async afterLoadDocument({ documentName, document }) {
      if (detach.has(documentName)) return;
      detach.set(
        documentName,
        attachSurrogateNormalizer(document as unknown as Y.Doc, (count) =>
          opts.onRepair?.(documentName, count),
        ),
      );
    },
    async afterUnloadDocument({ documentName }) {
      detach.get(documentName)?.();
      detach.delete(documentName);
    },
  };
}
