import type { Parent, PhrasingContent, Root, Text } from 'mdast';
import type { InlineMath } from 'mdast-util-math';
import type { MdxTextExpression } from 'mdast-util-mdx';
import type { Point, Position } from 'unist';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

const SINGLE_DOLLAR_MATH_RE = /(?<!\\)\$(?=\S)([^$\n]*?[^\s$])\$(?!\d)/g;

function offsetToPoint(source: string, offset: number): Point {
  let line = 1;
  let column = 1;
  for (let cursor = 0; cursor < offset && cursor < source.length; cursor++) {
    if (source[cursor] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column, offset };
}

function sourcePosition(source: string, start: number, end: number): Position {
  return { start: offsetToPoint(source, start), end: offsetToPoint(source, end) };
}

function isDollarMathFragment(node: Parent['children'][number]): node is Text | MdxTextExpression {
  return node.type === 'text' || node.type === 'mdxTextExpression';
}

export function singleDollarMathPromoterPlugin() {
  return (tree: Root, file: VFile) => {
    const source = typeof file.value === 'string' ? file.value : '';
    if (!source) return;

    visit(tree, (node) => {
      if (!('children' in node) || !Array.isArray(node.children)) return;
      const parent = node as Parent;
      const parentStart = parent.position?.start.offset;
      const parentEnd = parent.position?.end.offset;
      if (typeof parentStart !== 'number' || typeof parentEnd !== 'number') return;

      const rawParent = source.slice(parentStart, parentEnd);
      if (!rawParent.includes('$')) return;

      SINGLE_DOLLAR_MATH_RE.lastIndex = 0;
      const matches: RegExpExecArray[] = [];
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
      while ((m = SINGLE_DOLLAR_MATH_RE.exec(rawParent)) !== null) {
        matches.push(m);
      }
      if (matches.length === 0) return;

      // Work right-to-left so earlier child indexes stay stable. Reading from
      // the source span, rather than a single text node, lets `$r_{leaf}$`
      // cross the MDX expression node produced for `{leaf}`.
      for (const match of matches.reverse()) {
        const start = parentStart + match.index;
        const end = start + match[0].length;
        const firstIndex = parent.children.findIndex((child) => {
          const childStart = child.position?.start.offset;
          const childEnd = child.position?.end.offset;
          return (
            typeof childStart === 'number' &&
            typeof childEnd === 'number' &&
            childStart <= start &&
            childEnd > start
          );
        });
        const lastIndex = parent.children.findIndex((child) => {
          const childStart = child.position?.start.offset;
          const childEnd = child.position?.end.offset;
          return (
            typeof childStart === 'number' &&
            typeof childEnd === 'number' &&
            childStart < end &&
            childEnd >= end
          );
        });
        if (firstIndex < 0 || lastIndex < firstIndex) continue;

        const covered = parent.children.slice(firstIndex, lastIndex + 1);
        if (!covered.every(isDollarMathFragment)) continue;
        const firstStart = covered[0]?.position?.start.offset;
        const lastEnd = covered.at(-1)?.position?.end.offset;
        if (typeof firstStart !== 'number' || typeof lastEnd !== 'number') continue;

        const replacements: PhrasingContent[] = [];
        if (firstStart < start) {
          replacements.push({
            type: 'text',
            value: source.slice(firstStart, start),
            position: sourcePosition(source, firstStart, start),
          });
        }

        const mathNode: InlineMath = {
          type: 'inlineMath',
          value: match[1],
          data: { sourceDelimiter: '$' },
          position: sourcePosition(source, start, end),
        };
        replacements.push(mathNode as unknown as PhrasingContent);

        if (end < lastEnd) {
          replacements.push({
            type: 'text',
            value: source.slice(end, lastEnd),
            position: sourcePosition(source, end, lastEnd),
          });
        }

        parent.children.splice(firstIndex, covered.length, ...replacements);
      }
    });
  };
}
