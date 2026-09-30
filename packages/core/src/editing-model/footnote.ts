import type { Nodes } from 'mdast';
import { nextFootnoteIdentifier } from '../extensions/footnote-identifiers.ts';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';

let parser: MarkdownManager | undefined;
function nodes(source: string): Nodes[] {
  parser ??= new MarkdownManager({ extensions: sharedExtensions });
  const root = parser.parseToMdast(source);
  const result: Nodes[] = [];
  const walk = (node: Nodes) => {
    result.push(node);
    if ('children' in node) for (const child of node.children) walk(child as Nodes);
  };
  walk(root);
  return result;
}
export function canInsertSourceFootnote(source: string, from: number, to: number): boolean {
  const selected = source.slice(from, to);
  if (from !== to && !selected.trim()) return false;
  const tree = nodes(source);
  if (
    /\r|\n/.test(selected) &&
    !tree.some(
      (node) =>
        (node.type === 'paragraph' || node.type === 'heading') &&
        (node.position?.start.offset ?? -1) <= from &&
        (node.position?.end.offset ?? -1) >= to,
    )
  )
    return false;
  return !tree.some(
    (node) =>
      (node.type === 'footnoteReference' &&
        (node.position?.start.offset ?? 0) < to &&
        (node.position?.end.offset ?? 0) > from) ||
      (node.type === 'footnoteDefinition' &&
        (node.position?.start.offset ?? -1) <= from &&
        (node.position?.end.offset ?? -1) > from),
  );
}
export function insertSourceFootnote(source: string, anchor: number, head: number) {
  const from = Math.min(anchor, head);
  const to = Math.max(anchor, head);
  if (!canInsertSourceFootnote(source, from, to)) return { source, anchor, head };
  const tree = nodes(source);
  const id = nextFootnoteIdentifier(
    tree
      .filter((node) => node.type === 'footnoteDefinition' || node.type === 'footnoteReference')
      .map((node) => (node as { identifier: string }).identifier),
  );
  const ref = `[^${id}]`;
  const body = source.slice(from, to).replace(/\n/g, '\n    ');
  const definitions = tree.filter((node) => node.type === 'footnoteDefinition');
  const position = definitions.length
    ? (definitions.at(-1)?.position?.end.offset ?? source.length)
    : source.length;
  const insertAt = position >= to ? position + ref.length - (to - from) : position;
  const withRef = source.slice(0, from) + ref + source.slice(to);
  const before = withRef.slice(0, insertAt);
  const after = withRef.slice(insertAt);
  const lead = definitions.length
    ? before.endsWith('\n')
      ? ''
      : '\n'
    : before.endsWith('\n\n')
      ? ''
      : before.endsWith('\n')
        ? '\n'
        : '\n\n';
  const tail = after
    ? after.startsWith('\n\n')
      ? ''
      : after.startsWith('\n')
        ? '\n'
        : '\n\n'
    : '\n';
  const definition = `${lead}[^${id}]: ${body}${tail}`;
  const next = before + definition + after;
  const cursor = from + ref.length + (insertAt <= from ? definition.length : 0);
  return { source: next, anchor: cursor, head: cursor };
}
