/**
 * Records, per document, that the XmlFragment was just set to the parse of a
 * specific `Y.Text('source')` string.
 *
 * Observer B writes the mark after it derives the fragment from Y.Text, and
 * clears it whenever something else changes the fragment. Persistence reads
 * it: when the text it is about to store is exactly the marked text, the
 * fragment already equals parse(text) by construction, so the per-store
 * `serialize(fragment)` sanity check — a full-document serialize, and on
 * non-round-trip text a full parse too — mostly re-derives what Observer B
 * just derived. On a long document that check stalled the event loop every
 * few seconds while the user typed; persistence now runs it for such a
 * document only when it is quiescent, at most once a minute.
 */
import type * as Y from 'yjs';

export interface FragmentDerivation {
  readonly text: string;
}

const derivations = new WeakMap<Y.Doc, FragmentDerivation>();

export function markFragmentDerivedFromText(doc: Y.Doc, text: string): void {
  derivations.set(doc, { text });
}

export function clearFragmentDerivation(doc: Y.Doc): void {
  derivations.delete(doc);
}

export function fragmentDerivation(doc: Y.Doc): FragmentDerivation | undefined {
  return derivations.get(doc);
}
