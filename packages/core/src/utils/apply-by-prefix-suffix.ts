import type * as Y from 'yjs';
import { alignOpsToCodePoints, applyTextOps } from './utf16.ts';

/**
 * Apply `newText` to `ytext` with minimal CRDT mutation: find matching prefix
 * and suffix, delete + insert only the differing middle region. Preserves
 * Y.Text Items in the prefix/suffix (and thus their transaction origins).
 *
 * Shared between client-side Observer A (Path B three-way merge result application)
 * and server-side agent-write path (applyAgentMarkdownWrite).
 * Same semantics, one implementation.
 *
 * @see PRECEDENTS.md precedent #9 (minimize CRDT mutation in sync bridges)
 * @see PRECEDENTS.md precedent #10 (XmlFragment-authoritative, Y.Text mirrors)
 */
export function applyByPrefixSuffix(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;

  let prefixLen = 0;
  const minLen = Math.min(currentText.length, newText.length);
  while (prefixLen < minLen && currentText[prefixLen] === newText[prefixLen]) prefixLen++;

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    currentText[currentText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // Prefix and suffix are compared per UTF-16 code unit; keep the change
  // from starting or ending between the halves of a surrogate pair.
  applyTextOps(
    ytext,
    alignOpsToCodePoints([
      { type: 'retain', text: currentText.slice(0, prefixLen) },
      { type: 'delete', text: currentText.slice(prefixLen, currentText.length - suffixLen) },
      { type: 'insert', text: newText.slice(prefixLen, newText.length - suffixLen) },
      { type: 'retain', text: currentText.slice(currentText.length - suffixLen) },
    ]),
  );
}
