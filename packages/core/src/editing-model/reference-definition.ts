import type { Definition } from 'mdast';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';
import type { BlockLayout, Range } from './layout.ts';

export interface ReferenceDefinitionSource {
  identifier: string;
  label: string;
  url: string;
  title: string | null;
  urlRange: Range;
  angle: boolean;
  from: number;
  to: number;
}

let parser: MarkdownManager | undefined;
function md(): MarkdownManager {
  parser ??= new MarkdownManager({ extensions: sharedExtensions });
  return parser;
}

/** The parser decides whether a block is a definition; this finds its editable URL bytes. */
export function referenceDefinitionSource(
  source: string,
  from: number,
  to: number,
): ReferenceDefinitionSource | null {
  const raw = source.slice(from, to);
  const node = md().parseToMdast(raw).children[0];
  if (node?.type !== 'definition') return null;
  const definition = node as Definition;
  const opener = /^ {0,3}\[(?:\\.|[^\]\\\n])+\]:/.exec(raw);
  if (!opener) return null;
  let at = opener[0].length;
  while (at < raw.length && /[ \t\r\n]/.test(raw[at])) at++;
  const angle = raw[at] === '<';
  const start = angle ? at + 1 : at;
  let end = start;
  if (angle) {
    while (end < raw.length && (raw[end] !== '>' || raw[end - 1] === '\\')) end++;
    if (end >= raw.length) return null;
  } else {
    let depth = 0;
    while (end < raw.length) {
      const ch = raw[end];
      if (ch === '\\') {
        end += 2;
        continue;
      }
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (/\s/.test(ch) && depth === 0) break;
      end++;
    }
  }
  if (end <= start) return null;
  const url =
    angle && definition.url.startsWith('<') && definition.url.endsWith('>')
      ? definition.url.slice(1, -1)
      : definition.url;
  return {
    identifier: definition.identifier,
    label: definition.label ?? definition.identifier,
    url,
    title: definition.title ?? null,
    urlRange: [from + start, from + end],
    angle,
    from,
    to,
  };
}

/** First definition wins, matching CommonMark reference resolution. */
export function referenceDefinitionsFromBlocks(
  source: string,
  blocks: readonly BlockLayout[],
): ReadonlyMap<string, ReferenceDefinitionSource> {
  const definitions = new Map<string, ReferenceDefinitionSource>();
  for (const block of blocks) {
    if (block.type !== 'definition') continue;
    const item = referenceDefinitionSource(source, block.from, block.to);
    if (item && !definitions.has(item.identifier)) definitions.set(item.identifier, item);
  }
  return definitions;
}

/** Used by source-only edits where no IncrementalLayout instance is available. */
export function referenceDefinitionsFromSource(
  source: string,
): ReadonlyMap<string, ReferenceDefinitionSource> {
  const tree = md().parseToMdast(source);
  const blocks: BlockLayout[] = [];
  for (const node of tree.children) {
    if (node.type !== 'definition') continue;
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    if (from === undefined || to === undefined) continue;
    blocks.push({
      from,
      to,
      type: 'definition',
      layout: { hidden: [], widgets: [], marks: [], spans: [] },
    });
  }
  return referenceDefinitionsFromBlocks(source, blocks);
}

export function updateReferenceDefinition(
  source: string,
  from: number,
  to: number,
  text: string,
): string | null {
  const model = referenceDefinitionSource(source, from, to);
  if (!model) return null;
  const target = text
    .replace(/[\r\n]/g, ' ')
    .replace(/ /g, '%20')
    .replace(/>/g, '%3E');
  return source.slice(0, model.urlRange[0]) + target + source.slice(model.urlRange[1]);
}
