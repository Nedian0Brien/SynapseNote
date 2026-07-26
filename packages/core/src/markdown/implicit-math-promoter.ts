import type { Heading, Paragraph, PhrasingContent, Root, RootContent, Text } from 'mdast';
import type { InlineMath } from 'mdast-util-math';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import type { Point, Position } from 'unist';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

/**
 * Display-math delimiters frequently emitted by LLMs and LaTeX-aware tools.
 *
 * `\\[ ... \\]` is the standard LaTeX spelling. Some Markdown-producing
 * tools consume the delimiter backslashes before the text reaches us, leaving
 * the visually equivalent three-line `[ ... ]` form. The latter is promoted
 * only when its body contains a strong math signal, so an ordinary bracketed
 * prose block stays prose.
 */
const BRACKET_DISPLAY_MATH_RE =
  /^([ \t]{0,3})(\\?\[)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*(\\?\])[ \t]*(?=\r?$)/gm;

interface ParenthesizedCandidate {
  start: number;
  end: number;
  raw: string;
  escaped: boolean;
}

interface ParenthesisFrame {
  start: number;
  escaped: boolean;
}

function isBackslashEscaped(value: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

/**
 * Find balanced single-line parenthesized regions, including LaTeX `\\(...\\)`
 * delimiters. Every nested pair is returned so selection can prefer a smaller
 * qualifying formula over an ordinary prose wrapper around it.
 */
function findParenthesizedCandidates(value: string): ParenthesizedCandidate[] {
  const frames: ParenthesisFrame[] = [];
  const candidates: ParenthesizedCandidate[] = [];

  for (let cursor = 0; cursor < value.length; cursor++) {
    const char = value[cursor];
    const next = value[cursor + 1];

    if (char === '\\' && next === '(' && !isBackslashEscaped(value, cursor)) {
      frames.push({ start: cursor, escaped: true });
      cursor++;
      continue;
    }
    if (char === '(' && !isBackslashEscaped(value, cursor)) {
      frames.push({ start: cursor, escaped: false });
      continue;
    }

    if (char === '\\' && next === ')' && !isBackslashEscaped(value, cursor)) {
      const frame = frames.at(-1);
      if (frame?.escaped) {
        frames.pop();
        const end = cursor + 2;
        candidates.push({
          start: frame.start,
          end,
          raw: value.slice(frame.start, end),
          escaped: true,
        });
        cursor++;
      }
      continue;
    }
    if (char === ')' && !isBackslashEscaped(value, cursor)) {
      const frame = frames.at(-1);
      if (frame && !frame.escaped) {
        frames.pop();
        const end = cursor + 1;
        candidates.push({
          start: frame.start,
          end,
          raw: value.slice(frame.start, end),
          escaped: false,
        });
      }
    }
  }

  return candidates;
}

function hasLatexCommand(value: string): boolean {
  return /\\[A-Za-z]+/.test(value);
}

function looksLikeBareDisplayMath(value: string): boolean {
  if (hasLatexCommand(value)) return true;
  return /[A-Za-z0-9}][_^]/.test(value) || /[=+*/^]/.test(value);
}

/**
 * LLM-authored bare bracket blocks often pass through a Markdown escaper
 * before reaching us. That turns LaTeX subscripts into `\_`, plus operators
 * into a standalone `\+`, and an ASCII equation separator into a Setext
 * underline. Normalize only this implicit compatibility form; explicit
 * `\[...\]` keeps literal LaTeX escapes unchanged.
 */
function normalizeBareDisplayMath(value: string): string {
  return value
    .replace(/\\_/g, '_')
    .split(/\r?\n/)
    .map((line) => {
      if (/^[ \t]*={3,}[ \t]*$/.test(line)) return '=';
      if (/^[ \t]*\\\+[ \t]*$/.test(line)) return '+';
      return line;
    })
    .join('\n');
}

function looksLikeImplicitInlineMath(value: string): boolean {
  if (hasLatexCommand(value)) return true;

  // Braces plus a sub/superscript are a strong signal in prose. Requiring
  // both avoids turning ordinary parenthesized snake_case identifiers into
  // math while covering generated notation such as `({q_i,d_i})`.
  return /[{}]/.test(value) && /[A-Za-z0-9}][_^](?:[A-Za-z0-9]|\{)/.test(value);
}

function selectImplicitInlineMathCandidates(value: string): ParenthesizedCandidate[] {
  const qualifying = findParenthesizedCandidates(value).filter(
    (candidate) => candidate.escaped || looksLikeImplicitInlineMath(candidate.raw),
  );

  // Prefer the smallest qualifying region. This keeps an inner formula such
  // as `({q_i,d_i})` from turning a surrounding prose parenthesis into math,
  // while still selecting the outer region in `(\\log_2(i+1))` because the
  // inner `(i+1)` has no independent math signal.
  qualifying.sort((a, b) => a.end - a.start - (b.end - b.start) || a.start - b.start);
  const selected: ParenthesizedCandidate[] = [];
  for (const candidate of qualifying) {
    const overlaps = selected.some(
      (existing) => candidate.start < existing.end && existing.start < candidate.end,
    );
    if (!overlaps) selected.push(candidate);
  }
  selected.sort((a, b) => a.start - b.start);
  return selected;
}

function buildBracketMathElement(formula: string, paragraphNodes: RootContent[]) {
  const attrs: MdxJsxAttribute[] = [{ type: 'mdxJsxAttribute', name: 'formula', value: formula }];
  const element: MdxJsxFlowElement = {
    type: 'mdxJsxFlowElement',
    name: 'DollarMath',
    attributes: attrs,
    children: [],
  };
  const first = paragraphNodes[0];
  const last = paragraphNodes.at(-1);
  if (first?.position && last?.position) {
    element.position = { start: first.position.start, end: last.position.end };
  }
  return element;
}

function promoteBracketDisplayMath(tree: Root, source: string): void {
  BRACKET_DISPLAY_MATH_RE.lastIndex = 0;
  const candidates: Array<{
    start: number;
    end: number;
    formula: string;
  }> = [];
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
  while ((match = BRACKET_DISPLAY_MATH_RE.exec(source)) !== null) {
    let formula = match[3].replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, '');
    const escaped = match[2].startsWith('\\') && match[4].startsWith('\\');
    if (!escaped && !looksLikeBareDisplayMath(formula)) continue;
    if (!escaped) formula = normalizeBareDisplayMath(formula);
    candidates.push({
      start: match.index + match[1].length,
      end: match.index + match[0].length,
      formula,
    });
  }

  for (const candidate of candidates) {
    const startIndex = tree.children.findIndex(
      (node) => node.position?.start.offset === candidate.start,
    );
    if (startIndex < 0) continue;

    let endIndex = startIndex;
    while (
      endIndex < tree.children.length &&
      (tree.children[endIndex]?.position?.end.offset ?? -1) < candidate.end
    ) {
      endIndex++;
    }
    if (endIndex >= tree.children.length) continue;
    if (tree.children[endIndex]?.position?.end.offset !== candidate.end) continue;

    const covered = tree.children.slice(startIndex, endIndex + 1);
    // A line made only of `===` is parsed by CommonMark as a Setext heading
    // underline before this compatibility pass runs. Accept that parser shape
    // along with ordinary paragraphs, but keep other block constructs out so
    // bracketed lists, code, HTML, and blockquotes retain Markdown semantics.
    if (
      !covered.every(
        (node): node is Paragraph | Heading => node.type === 'paragraph' || node.type === 'heading',
      )
    ) {
      continue;
    }

    const element = buildBracketMathElement(candidate.formula, covered);
    tree.children.splice(startIndex, covered.length, element as unknown as RootContent);
  }
}

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

function promoteImplicitInlineMath(tree: Root, source: string): void {
  visit(tree, 'paragraph', (paragraph: Paragraph) => {
    const paragraphStart = paragraph.position?.start.offset;
    const paragraphEnd = paragraph.position?.end.offset;
    if (typeof paragraphStart !== 'number' || typeof paragraphEnd !== 'number') return;

    const rawParagraph = source.slice(paragraphStart, paragraphEnd);
    if (!rawParagraph.includes('(')) return;
    if (
      !rawParagraph.includes('_') &&
      !rawParagraph.includes('^') &&
      !rawParagraph.includes('\\')
    ) {
      return;
    }

    const matches = selectImplicitInlineMathCandidates(rawParagraph).map((candidate) => ({
      ...candidate,
      start: paragraphStart + candidate.start,
      end: paragraphStart + candidate.end,
    }));

    // Work right-to-left so child indices for earlier candidates remain
    // stable after each splice.
    for (const candidate of matches.reverse()) {
      const firstIndex = paragraph.children.findIndex((child) => {
        const start = child.position?.start.offset;
        const end = child.position?.end.offset;
        return (
          typeof start === 'number' &&
          typeof end === 'number' &&
          start <= candidate.start &&
          end > candidate.start
        );
      });
      const lastIndex = paragraph.children.findIndex((child) => {
        const start = child.position?.start.offset;
        const end = child.position?.end.offset;
        return (
          typeof start === 'number' &&
          typeof end === 'number' &&
          start < candidate.end &&
          end >= candidate.end
        );
      });
      if (firstIndex < 0 || lastIndex < firstIndex) continue;

      const covered = paragraph.children.slice(firstIndex, lastIndex + 1);
      if (!covered.every((child) => child.type === 'text' || child.type === 'mdxTextExpression')) {
        continue;
      }

      const firstStart = covered[0]?.position?.start.offset;
      const lastEnd = covered.at(-1)?.position?.end.offset;
      if (typeof firstStart !== 'number' || typeof lastEnd !== 'number') continue;

      const replacements: PhrasingContent[] = [];
      if (firstStart < candidate.start) {
        const lead: Text = {
          type: 'text',
          value: source.slice(firstStart, candidate.start),
          position: sourcePosition(source, firstStart, candidate.start),
        };
        replacements.push(lead);
      }

      const mathNode: InlineMath = {
        type: 'inlineMath',
        value: candidate.escaped ? candidate.raw.slice(2, -2) : candidate.raw,
        data: { sourceDelimiter: candidate.escaped ? '\\(' : 'implicit-parens' },
        position: sourcePosition(source, candidate.start, candidate.end),
      };
      replacements.push(mathNode as unknown as PhrasingContent);

      if (candidate.end < lastEnd) {
        const tail: Text = {
          type: 'text',
          value: source.slice(candidate.end, lastEnd),
          position: sourcePosition(source, candidate.end, lastEnd),
        };
        replacements.push(tail);
      }

      paragraph.children.splice(firstIndex, covered.length, ...replacements);
    }
  });
}

export function implicitMathPromoterPlugin() {
  return (tree: Root, file: VFile) => {
    const source = typeof file.value === 'string' ? file.value : '';
    if (!source) return;
    promoteBracketDisplayMath(tree, source);
    promoteImplicitInlineMath(tree, source);
  };
}
