import type { DatabaseDocumentId } from './stable-ids.ts';
import type { DatabaseMarkdownDocumentLink } from './markdown-table.ts';

/** A document visible to the storage-neutral wikilink resolver. */
export interface DatabaseMarkdownDocumentCandidate {
  path: string;
  documentId: DatabaseDocumentId | string;
  /** Stable user-facing aliases, usually the document title and explicit aliases. */
  aliases?: readonly string[];
}

export type DatabaseMarkdownDocumentLinkResolutionCode =
  | 'resolved'
  | 'invalid_target'
  | 'heading_not_allowed'
  | 'embed_not_allowed'
  | 'missing'
  | 'ambiguous'
  | 'outside_root'
  | 'duplicate_document';

export interface DatabaseMarkdownDocumentLinkResolution {
  ok: boolean;
  code: DatabaseMarkdownDocumentLinkResolutionCode;
  target: string;
  candidate?: DatabaseMarkdownDocumentCandidate;
  candidates?: readonly DatabaseMarkdownDocumentCandidate[];
  message: string;
}

export interface ResolveDatabaseMarkdownDocumentLinkInput {
  link: DatabaseMarkdownDocumentLink;
  documents: readonly DatabaseMarkdownDocumentCandidate[];
  /** The owner/document path containing the link, used for relative targets. */
  fromPath?: string;
  /** Resolve aliases and basenames using Unicode case-folding unless disabled. */
  caseSensitive?: boolean;
  /** A link resolver never follows filesystem symlinks; this only controls path scope. */
  contentRoot?: string;
}

function normalizePath(value: string): string | null {
  const trimmed = value.trim().replaceAll('\\', '/');
  if (trimmed === '' || trimmed.includes('\0') || trimmed.startsWith('/')) return null;
  if (/^[A-Za-z]:(?:\/|$)/.test(trimmed)) return null;
  const withExtension = /\.(?:md|mdx)$/iu.test(trimmed) ? trimmed : `${trimmed}.md`;
  const segments = withExtension.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function relativeTarget(fromPath: string | undefined, target: string): string | null {
  if (!fromPath || !target.startsWith('.')) return normalizePath(target);
  const raw = target.trim().replaceAll('\\', '/');
  if (raw.includes('\0') || raw.startsWith('/') || /^[A-Za-z]:(?:\/|$)/.test(raw)) return null;
  const base = directoryOf(fromPath).split('/').filter(Boolean);
  const targetSegments = raw.split('/');
  if (targetSegments.at(-1) === '') return null;
  for (const segment of targetSegments) {
    if (segment === '..') {
      if (base.length === 0) return null;
      base.pop();
    } else if (segment !== '.' && segment !== '') {
      base.push(segment);
    }
  }
  return normalizePath(base.join('/'));
}

function withoutExtension(path: string): string {
  return path.replace(/\.(?:md|mdx)$/iu, '');
}

function fold(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value.normalize('NFKC') : value.normalize('NFKC').toLocaleLowerCase('en-US');
}

function candidateSort(left: DatabaseMarkdownDocumentCandidate, right: DatabaseMarkdownDocumentCandidate): number {
  return left.path.localeCompare(right.path) || String(left.documentId).localeCompare(String(right.documentId));
}

/**
 * Resolve a database Title/relation wikilink without touching the filesystem.
 *
 * Exact path is preferred, then path-without-extension, then a unique basename,
 * and finally a unique explicit/title alias.  Every non-unique result is an
 * explicit diagnostic; callers must not silently select the first match.
 */
export function resolveDatabaseMarkdownDocumentLink(
  input: ResolveDatabaseMarkdownDocumentLinkInput,
): DatabaseMarkdownDocumentLinkResolution {
  const rawTarget = input.link.target.trim();
  const target = rawTarget;
  if (rawTarget.startsWith('!')) {
    return { ok: false, code: 'embed_not_allowed', target, message: 'Embedded wikilinks are not valid database cells' };
  }
  if (rawTarget.includes('#') || rawTarget.includes('^')) {
    return { ok: false, code: 'heading_not_allowed', target, message: 'Heading and block references are not valid database cells' };
  }
  const normalized = relativeTarget(input.fromPath, rawTarget);
  if (!normalized) {
    return { ok: false, code: 'outside_root', target, message: 'Wikilink target is outside the content root or is not a safe Markdown path' };
  }
  const documents = [...input.documents].sort(candidateSort);
  const byDocumentId = new Map<string, DatabaseMarkdownDocumentCandidate>();
  for (const document of documents) {
    const key = String(document.documentId);
    if (byDocumentId.has(key)) {
      const candidates = documents.filter((candidate) => String(candidate.documentId) === key);
      return { ok: false, code: 'duplicate_document', target, candidates, message: `Document identity "${key}" is declared more than once` };
    }
    byDocumentId.set(key, document);
  }
  const normalizedFold = fold(normalized, input.caseSensitive ?? false);
  const exact = documents.filter((document) => {
    const path = normalizePath(document.path);
    return path !== null && (fold(path, input.caseSensitive ?? false) === normalizedFold || fold(withoutExtension(path), input.caseSensitive ?? false) === fold(withoutExtension(normalized), input.caseSensitive ?? false));
  });
  if (exact.length === 1) {
    return { ok: true, code: 'resolved', target, candidate: exact[0], message: `Resolved wikilink "${target}"` };
  }
  if (exact.length > 1) {
    return { ok: false, code: 'ambiguous', target, candidates: exact, message: `Wikilink "${target}" matches multiple documents` };
  }

  const basename = fold(withoutExtension(normalized).split('/').at(-1) ?? normalized, input.caseSensitive ?? false);
  const basenameMatches = documents.filter((document) => {
    const path = normalizePath(document.path);
    return path !== null && fold(withoutExtension(path).split('/').at(-1) ?? path, input.caseSensitive ?? false) === basename;
  });
  if (basenameMatches.length === 1) {
    return { ok: true, code: 'resolved', target, candidate: basenameMatches[0], message: `Resolved basename wikilink "${target}"` };
  }
  if (basenameMatches.length > 1) {
    return { ok: false, code: 'ambiguous', target, candidates: basenameMatches, message: `Basename wikilink "${target}" is ambiguous` };
  }

  const alias = fold(input.link.alias ?? rawTarget, input.caseSensitive ?? false);
  const aliasMatches = documents.filter((document) =>
    (document.aliases ?? []).some((candidate) => fold(candidate, input.caseSensitive ?? false) === alias),
  );
  if (aliasMatches.length === 1) {
    return { ok: true, code: 'resolved', target, candidate: aliasMatches[0], message: `Resolved alias wikilink "${target}"` };
  }
  if (aliasMatches.length > 1) {
    return { ok: false, code: 'ambiguous', target, candidates: aliasMatches, message: `Alias wikilink "${target}" is ambiguous` };
  }
  return { ok: false, code: 'missing', target, message: `Wikilink "${target}" does not resolve to a Markdown document` };
}
