import type { GraphData, GraphLink, GraphNode } from './graph-view-utils';
import { resolveGraphLinkEndpointId } from './graph-view-utils';

function normalizeComparablePath(value: string): string {
  return value
    .trim()
    .replace(/\\$/, '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\.(?:md|mdx)$/i, '')
    .normalize('NFC');
}

function decodeAuthoredTarget(value: string, syntax?: GraphLink['authoredSyntax']): string {
  const withoutAnchor = value.split(syntax === 'markdown' ? /[?#]/ : '#', 1)[0] ?? '';
  try {
    return decodeURIComponent(withoutAnchor).normalize('NFC');
  } catch {
    return withoutAnchor.normalize('NFC');
  }
}

function resolveMarkdownComparable(target: string, source: string): string | null {
  const authored = decodeAuthoredTarget(target, 'markdown').replace(/\\/g, '/');
  const base = authored.startsWith('/') ? [] : source.normalize('NFC').split('/').slice(0, -1);
  const segments = [...base, ...authored.replace(/^\/+/, '').split('/')];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return normalizeComparablePath(resolved.join('/'));
}

function sharedParentDepth(a: string, b: string): number {
  const left = a.split('/');
  const right = b.split('/');
  let depth = 0;
  while (depth < left.length - 1 && depth < right.length - 1 && left[depth] === right[depth]) {
    depth += 1;
  }
  return depth;
}

/**
 * Obsidian resolves wiki targets against the vault before it constructs graph
 * nodes. SynapseNote's server preserves the authored target string, so a bare
 * `[[Page]]` otherwise becomes a second unresolved node beside the real page.
 * This adapter canonicalizes endpoints against the live page list before
 * filters and folder injection run.
 */
export function canonicalizeObsidianGraphData(
  data: GraphData,
  pages: ReadonlySet<string>,
  options: {
    existingAssetPaths?: ReadonlySet<string>;
    documentExtensionByPage?: ReadonlyMap<string, string | undefined>;
  } = {},
): GraphData {
  const canonicalByComparable = new Map<string, string>();
  const suffixCandidates = new Map<string, string[]>();
  const basenameCandidates = new Map<string, string[]>();
  const assetPaths = [...(options.existingAssetPaths ?? new Set<string>())];
  const assetByComparable = new Set(assetPaths.map(normalizeComparablePath));

  for (const page of pages) {
    const comparable = normalizeComparablePath(page);
    if (!canonicalByComparable.has(comparable)) canonicalByComparable.set(comparable, page);

    const segments = comparable.split('/').filter(Boolean);
    const basename = segments.at(-1);
    if (basename) {
      const candidates = basenameCandidates.get(basename) ?? [];
      candidates.push(page);
      basenameCandidates.set(basename, candidates);
    }
    for (let index = 1; index < segments.length - 1; index += 1) {
      const suffix = segments.slice(index).join('/');
      const candidates = suffixCandidates.get(suffix) ?? [];
      candidates.push(page);
      suffixCandidates.set(suffix, candidates);
    }
  }

  const chooseClosest = (candidates: readonly string[], source: string): string | null => {
    if (candidates.length === 0) return null;
    return (
      [...candidates].sort((a, b) => {
        const depthDifference =
          sharedParentDepth(b.normalize('NFC'), source) -
          sharedParentDepth(a.normalize('NFC'), source);
        if (depthDifference !== 0) return depthDifference;
        const lengthDifference = a.length - b.length;
        return lengthDifference !== 0 ? lengthDifference : a.localeCompare(b);
      })[0] ?? null
    );
  };

  const isExistingAsset = (
    target: string,
    source: string,
    syntax: GraphLink['authoredSyntax'],
  ): boolean => {
    const comparable = normalizeComparablePath(decodeAuthoredTarget(target, syntax));
    if (syntax === 'markdown') {
      const resolved = resolveMarkdownComparable(target, source);
      return resolved !== null && assetByComparable.has(resolved);
    }
    if (assetByComparable.has(comparable)) return true;
    const basename = comparable.split('/').at(-1);
    return assetPaths.some((assetPath) => {
      const asset = normalizeComparablePath(assetPath);
      return (
        asset === comparable ||
        asset.endsWith(`/${comparable}`) ||
        (basename !== undefined && !comparable.includes('/') && asset.endsWith(`/${basename}`))
      );
    });
  };

  const resolve = (target: string, source: string, syntax: GraphLink['authoredSyntax']): string => {
    const authoredTarget = decodeAuthoredTarget(target, syntax);
    if (syntax === 'markdown') {
      const markdownComparable = resolveMarkdownComparable(authoredTarget, source);
      const resolvedPage =
        markdownComparable === null ? undefined : canonicalByComparable.get(markdownComparable);
      return resolvedPage ?? authoredTarget;
    }
    const comparable = normalizeComparablePath(authoredTarget);
    const exact = canonicalByComparable.get(comparable);
    if (exact) return exact;

    // Leading `/` and `..` are meaningful parts of unresolved Obsidian node
    // ids; never suffix-resolve them into an unrelated vault page.
    if (!authoredTarget.trim().startsWith('/') && !comparable.startsWith('..')) {
      if (comparable.includes('/')) {
        // Obsidian's path-qualified wiki lookup takes the shortest vault
        // suffix match (then lexical order), rather than preferring the
        // source's parent. This is observable when both `ORAG/raw/Page` and
        // `papers/raw/Page` exist: `[[raw/Page]]` resolves to the former.
        const suffix = [...(suffixCandidates.get(comparable) ?? [])].sort((a, b) => {
          const lengthDifference = a.length - b.length;
          return lengthDifference !== 0 ? lengthDifference : a.localeCompare(b);
        })[0];
        if (suffix) return suffix;
      } else {
        const basename = chooseClosest(basenameCandidates.get(comparable) ?? [], source);
        if (basename) return basename;
      }
    }
    return authoredTarget;
  };

  const originalNodeById = new Map(data.nodes.map((node) => [node.id, node] as const));
  const nodesById = new Map<string, GraphNode>();
  const canonicalNodeId = (id: string): string =>
    canonicalByComparable.get(normalizeComparablePath(id)) ?? id.normalize('NFC');

  // Existing pages stay present even when they are orphans.
  for (const node of data.nodes) {
    if (node.kind !== 'doc') continue;
    const canonicalId = canonicalByComparable.get(normalizeComparablePath(node.id));
    if (!canonicalId) continue;
    nodesById.set(canonicalId, {
      ...node,
      id: canonicalId,
      docName: canonicalId,
      label: node.label === node.id ? canonicalId : node.label,
    });
  }

  const links: GraphLink[] = [];
  const linkKeys = new Set<string>();
  for (const link of data.links) {
    const rawSource = resolveGraphLinkEndpointId(link.source);
    const rawTarget = resolveGraphLinkEndpointId(link.target);
    if (rawSource === null || rawTarget === null) continue;

    const source = canonicalNodeId(rawSource);
    if (isExistingAsset(rawTarget, source, link.authoredSyntax)) continue;
    const target = resolve(rawTarget, source, link.authoredSyntax);
    const key = `${source}\n${target}`;
    if (linkKeys.has(key)) continue;
    linkKeys.add(key);
    links.push({ ...link, source, target });

    for (const [id, rawId] of [
      [source, rawSource],
      [target, rawTarget],
    ] as const) {
      if (nodesById.has(id)) continue;
      const original = originalNodeById.get(rawId);
      if (original?.kind === 'external') {
        nodesById.set(id, { ...original, id });
      } else if (original?.kind === 'doc') {
        nodesById.set(id, { ...original, id, docName: id, label: id });
      }
    }
  }

  // Obsidian seeds the worker in vault file order and inserts unresolved
  // targets immediately after the source file that first mentions them.
  // Force layouts are order-sensitive, so topology parity alone is not enough:
  // reproducing this sequence is what makes the deterministic simulation land
  // in the same orientation instead of a rotated/rearranged equivalent.
  const linksBySource = new Map<string, GraphLink[]>();
  for (const link of links) {
    const source = resolveGraphLinkEndpointId(link.source);
    if (source === null) continue;
    const bucket = linksBySource.get(source) ?? [];
    bucket.push(link);
    linksBySource.set(source, bucket);
  }
  const canonicalPageIds = [...new Set(canonicalByComparable.values())].sort((a, b) => {
    const left = `${a}${options.documentExtensionByPage?.get(a) ?? '.md'}`;
    const right = `${b}${options.documentExtensionByPage?.get(b) ?? '.md'}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const orderedLinks: GraphLink[] = [];
  const orderedLinkKeys = new Set<string>();
  const appendLink = (link: GraphLink): void => {
    const source = resolveGraphLinkEndpointId(link.source);
    const target = resolveGraphLinkEndpointId(link.target);
    if (source === null || target === null) return;
    const key = `${source}\n${target}`;
    if (orderedLinkKeys.has(key)) return;
    orderedLinkKeys.add(key);
    orderedLinks.push(link);
  };
  for (const pageId of canonicalPageIds) {
    const sourceLinks = linksBySource.get(pageId) ?? [];
    for (const link of sourceLinks) {
      const target = resolveGraphLinkEndpointId(link.target);
      if (target !== null && canonicalByComparable.has(normalizeComparablePath(target))) {
        appendLink(link);
      }
    }
    for (const link of sourceLinks) {
      const target = resolveGraphLinkEndpointId(link.target);
      if (
        target !== null &&
        !canonicalByComparable.has(normalizeComparablePath(target)) &&
        !link.authoredEmbed
      ) {
        appendLink(link);
      }
    }
    for (const link of sourceLinks) {
      if (link.authoredEmbed) appendLink(link);
    }
  }
  for (const link of links) appendLink(link);

  const orderedNodes: GraphNode[] = [];
  const orderedIds = new Set<string>();
  const append = (id: string): void => {
    if (orderedIds.has(id)) return;
    const node = nodesById.get(id);
    if (!node) return;
    const positioned = node as GraphNode & {
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
    };
    positioned.x ??= 0;
    positioned.y ??= 0;
    positioned.vx ??= 0;
    positioned.vy ??= 0;
    orderedIds.add(id);
    orderedNodes.push(node);
  };

  for (const pageId of canonicalPageIds) {
    append(pageId);
    for (const link of orderedLinks.filter((candidate) => candidate.source === pageId)) {
      const target = resolveGraphLinkEndpointId(link.target);
      if (target !== null && !canonicalByComparable.has(normalizeComparablePath(target))) {
        append(target);
      }
    }
  }
  for (const link of orderedLinks) {
    const source = resolveGraphLinkEndpointId(link.source);
    const target = resolveGraphLinkEndpointId(link.target);
    if (source !== null) append(source);
    if (target !== null) append(target);
  }
  for (const id of nodesById.keys()) append(id);

  return { nodes: orderedNodes, links: orderedLinks };
}
