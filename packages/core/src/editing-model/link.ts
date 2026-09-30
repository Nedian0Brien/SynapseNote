import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';
import { computeLayout, type Range } from './layout.ts';
import { referenceDefinitionsFromSource } from './reference-definition.ts';

export interface SourceLink {
  from: number;
  to: number;
  label: string;
  labelSource: string;
  labelRange: Range;
  href: string;
  hrefRange: Range;
  kind: 'markdown' | 'reference' | 'autolink';
}

let parser: MarkdownManager | undefined;
function md(): MarkdownManager {
  parser ??= new MarkdownManager({ extensions: sharedExtensions });
  return parser;
}

function plainText(node: unknown): string {
  const item = node as { value?: string; children?: unknown[]; alt?: string };
  return item.value ?? item.alt ?? item.children?.map(plainText).join('') ?? '';
}

export function sourceLinkAt(source: string, anchor: number, head = anchor): SourceLink | null {
  const lo = Math.min(anchor, head);
  const hi = Math.max(anchor, head);
  const mark = computeLayout(source).marks.find(
    (item) =>
      (item.type === 'link' || item.type === 'linkReference') &&
      item.open[0] <= lo &&
      item.close[1] >= hi,
  );
  if (!mark) return null;
  const from = mark.open[0];
  const to = mark.close[1];
  const raw = source.slice(from, to);
  const node = md().parseToMdast(raw).children[0];
  const labelSource = source.slice(mark.open[1], mark.close[0]);
  const label = node?.type === 'paragraph' ? node.children.map(plainText).join('') : labelSource;
  const parsedLink =
    node?.type === 'paragraph' ? node.children.find((child) => child.type === 'link') : undefined;
  if (raw.startsWith('<')) {
    return {
      from,
      to,
      label,
      labelSource,
      labelRange: [from + 1, to - 1],
      href: labelSource,
      hrefRange: [from + 1, to - 1],
      kind: 'autolink',
    };
  }
  if (mark.type === 'linkReference') {
    const suffix = source.slice(mark.close[0], to);
    const identifier = (/^\]\[([^\]]*)\]/.exec(suffix)?.[1] || labelSource)
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    const definition = referenceDefinitionsFromSource(source).get(identifier);
    if (!definition) return null;
    return {
      from,
      to,
      label: labelSource,
      labelSource,
      labelRange: [mark.open[1], mark.close[0]],
      href: definition.url,
      hrefRange: definition.urlRange,
      kind: 'reference',
    };
  }
  let start = mark.close[0] + 2;
  while (/\s/.test(source[start] ?? '') && start < to) start++;
  const angle = source[start] === '<';
  if (angle) start++;
  let end = start;
  let depth = 0;
  while (end < to) {
    const char = source[end];
    if (char === '\\') {
      end += 2;
      continue;
    }
    if (angle && char === '>') break;
    if (!angle && char === '(') depth++;
    else if (!angle && char === ')') {
      if (!depth) break;
      depth--;
    } else if (!angle && /\s/.test(char) && !depth) break;
    end++;
  }
  return {
    from,
    to,
    label,
    labelSource,
    labelRange: [mark.open[1], mark.close[0]],
    href: parsedLink?.type === 'link' ? parsedLink.url : source.slice(start, end),
    hrefRange: [start, end],
    kind: 'markdown',
  };
}

export function updateSourceLink(
  source: string,
  anchor: number,
  head: number,
  href: string,
  label?: string,
) {
  const model = sourceLinkAt(source, anchor, head);
  const from = model?.from ?? Math.min(anchor, head);
  const to = model?.to ?? Math.max(anchor, head);
  const original = model?.labelSource ?? source.slice(from, to);
  const changedLabel = label !== undefined && label !== (model?.label ?? original);
  const text = changedLabel ? label.replace(/([\\[\]*_`~])/g, '\\$1') : original;
  const target = href
    .trim()
    .replace(/ /g, '%20')
    .replace(/([()])/g, '\\$1');
  if (!target) {
    return {
      source: source.slice(0, from) + text + source.slice(to),
      anchor: from + text.length,
      head: from + text.length,
    };
  }
  if (!model || model.kind === 'autolink' || (model.kind === 'reference' && changedLabel)) {
    const insert = `[${text || target}](${target})`;
    return {
      source: source.slice(0, from) + insert + source.slice(to),
      anchor: from + insert.length,
      head: from + insert.length,
    };
  }
  const targetChanged = href.trim() !== model.href;
  const changes = targetChanged ? [{ range: model.hrefRange, text: target }] : [];
  if (changedLabel) changes.push({ range: model.labelRange, text });
  let next = source;
  for (const change of changes.sort((a, b) => b.range[0] - a.range[0])) {
    next = next.slice(0, change.range[0]) + change.text + next.slice(change.range[1]);
  }
  const labelDelta = changedLabel ? text.length - model.labelSource.length : 0;
  const hrefDelta =
    targetChanged && model.hrefRange[0] < to
      ? target.length - (model.hrefRange[1] - model.hrefRange[0])
      : 0;
  return { source: next, anchor: to + labelDelta + hrefDelta, head: to + labelDelta + hrefDelta };
}
