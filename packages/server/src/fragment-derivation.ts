/**
 * Records, per document, that the XmlFragment matches a specific
 * `Y.Text('source')` string by construction.
 *
 * `exact`: the fragment is parse(text) — Observer B derived it, or Observer
 * A's fast path spliced blocks that parse back to exactly the client's nodes.
 * Not exact: the fragment differs from parse(text) only in source-spelling
 * marks (`escapeMark`, `sourceLiteral`) the parse would add, so serializing
 * it gives the same bytes — Observer A's fast path wrote exactly those bytes.
 *
 * The observers write the mark and clear it whenever something else changes
 * the fragment. Persistence reads it: when the text it is about to store is
 * the marked text, the fragment already matches it, so the per-store
 * `serialize(fragment)` sanity check — a full-document serialize, and on
 * non-round-trip text a full parse too — mostly re-derives what Observer B
 * just derived. On a long document that check stalled the event loop every
 * few seconds while the user typed; persistence now runs it for such a
 * document only when it is quiescent, at most once a minute.
 */
import type * as Y from 'yjs';

export interface FragmentDerivation {
  readonly text: string;
  readonly exact: boolean;
}

const derivations = new WeakMap<Y.Doc, FragmentDerivation>();

export function markFragmentDerivedFromText(doc: Y.Doc, text: string, exact = true): void {
  derivations.set(doc, { text, exact });
}

export function clearFragmentDerivation(doc: Y.Doc): void {
  derivations.delete(doc);
}

export function fragmentDerivation(doc: Y.Doc): FragmentDerivation | undefined {
  return derivations.get(doc);
}
