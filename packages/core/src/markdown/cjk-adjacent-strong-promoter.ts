import type { Parent, PhrasingContent, Root, Strong, Text } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { deriveFragmentPosition } from './promoter-position.ts';

/**
 * CommonMark does not close a strong delimiter when its contents end in
 * punctuation and a letter immediately follows the closing delimiter. That
 * makes natural CJK suffixes render as literal markdown, for example:
 *
 *   **관련도(relevance)**와
 *
 * The compatibility path stays deliberately narrow: the inner text must end
 * in Unicode punctuation and the suffix must begin with a CJK character.
 * Ordinary CommonMark ambiguity outside that shape is left untouched.
 */
const CJK_ADJACENT_STRONG_RE =
  /(\*\*|__)([^\r\n]*?\p{P})\1(?=[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu;

const UNICODE_LETTER_OR_NUMBER_RE = /[\p{L}\p{N}]/u;

function hasExactSourceSlice(
  source: string,
  node: Text,
  valueStart: number,
  valueEnd: number,
  expected: string,
): boolean {
  const position = deriveFragmentPosition(source, node, valueStart, valueEnd);
  const start = position?.start.offset;
  const end = position?.end.offset;
  return (
    typeof start === 'number' && typeof end === 'number' && source.slice(start, end) === expected
  );
}

function canPromoteMatch(value: string, match: RegExpExecArray): boolean {
  const delimiter = match[1];
  const inner = match[2];
  if (!delimiter || !inner || /^\s/u.test(inner) || inner.includes(delimiter)) return false;

  // Preserve CommonMark's intraword underscore rule. A `__` opener after a
  // letter or number remains literal even when the suffix is CJK text.
  if (delimiter === '__' && match.index > 0) {
    const previous = value.charAt(match.index - 1);
    if (UNICODE_LETTER_OR_NUMBER_RE.test(previous)) return false;
  }

  return true;
}

export function cjkAdjacentStrongPromoterPlugin() {
  return (tree: Root, file: VFile) => {
    const source = typeof file.value === 'string' ? file.value : '';
    if (!source) return;

    visit(tree, 'text', (node: Text, index, parent) => {
      if (parent === undefined || index === undefined || index === null) return;
      if (!node.value.includes('**') && !node.value.includes('__')) return;

      CJK_ADJACENT_STRONG_RE.lastIndex = 0;
      const matches: RegExpExecArray[] = [];
      let match: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
      while ((match = CJK_ADJACENT_STRONG_RE.exec(node.value)) !== null) {
        if (!canPromoteMatch(node.value, match)) continue;
        const end = match.index + match[0].length;
        if (!hasExactSourceSlice(source, node, match.index, end, match[0])) continue;
        matches.push(match);
      }
      if (matches.length === 0) return;

      const replacements: PhrasingContent[] = [];
      let cursor = 0;
      for (const candidate of matches) {
        const start = candidate.index;
        const end = start + candidate[0].length;
        const delimiter = candidate[1] as '**' | '__';
        const inner = candidate[2];

        if (start > cursor) {
          const lead: Text = { type: 'text', value: node.value.slice(cursor, start) };
          const position = deriveFragmentPosition(source, node, cursor, start);
          if (position) lead.position = position;
          replacements.push(lead);
        }

        const innerText: Text = { type: 'text', value: inner };
        const innerPosition = deriveFragmentPosition(
          source,
          node,
          start + delimiter.length,
          end - delimiter.length,
        );
        if (innerPosition) innerText.position = innerPosition;

        const strong: Strong = {
          type: 'strong',
          children: [innerText],
          data: { sourceDelimiter: delimiter },
        };
        const strongPosition = deriveFragmentPosition(source, node, start, end);
        if (strongPosition) strong.position = strongPosition;
        replacements.push(strong);
        cursor = end;
      }

      if (cursor < node.value.length) {
        const tail: Text = { type: 'text', value: node.value.slice(cursor) };
        const position = deriveFragmentPosition(source, node, cursor, node.value.length);
        if (position) tail.position = position;
        replacements.push(tail);
      }

      (parent as Parent).children.splice(index, 1, ...replacements);
      return [SKIP, index + replacements.length];
    });
  };
}
