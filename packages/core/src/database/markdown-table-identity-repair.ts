import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  decodeDatabaseMarkdownCell,
  encodeDatabaseMarkdownCell,
  parseDatabaseMarkdownOwner,
  replaceDatabaseMarkdownTableCell,
  type ParsedDatabaseMarkdownOwner,
  type DatabaseMarkdownDocumentLink,
} from './markdown-table.ts';
import { ensureDatabaseDocumentIdentity, parseDatabaseDocumentIdentity } from './document-identity.ts';
import { resolveDatabaseDocumentTitle } from './markdown-table-document.ts';
import type { DatabaseDocumentId } from './stable-ids.ts';

export interface DatabaseMarkdownIdentityRepairDocument {
  path: string;
  markdown: string;
}

export type DatabaseMarkdownIdentityRepairIssueCode =
  | 'malformed_owner'
  | 'duplicate_owner'
  | 'missing_document_id'
  | 'invalid_document_id'
  | 'duplicate_document_id'
  | 'duplicate_row_identity'
  | 'broken_document_link'
  | 'stale_alias';

export interface DatabaseMarkdownIdentityRepairIssue {
  code: DatabaseMarkdownIdentityRepairIssueCode;
  path: string;
  message: string;
  relatedPath?: string;
  rowIndex?: number;
}

export type DatabaseMarkdownIdentityRepairAction =
  | {
      kind: 'assign_document_id';
      path: string;
      documentId: DatabaseDocumentId;
      beforeSha256: string;
      afterSha256: string;
      afterMarkdown: string;
    }
  | {
      kind: 'rewrite_title_alias';
      ownerPath: string;
      rowIndex: number;
      beforeSha256: string;
      afterSha256: string;
      afterMarkdown: string;
    };

export interface DatabaseMarkdownIdentityRepairPlan {
  version: 1;
  databaseId: string;
  sourceId: string;
  hash: string;
  committable: boolean;
  issues: readonly DatabaseMarkdownIdentityRepairIssue[];
  actions: readonly DatabaseMarkdownIdentityRepairAction[];
}

function digest(value: string): string {
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(value)))}`;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
    .join(',')}}`;
}

function pathWithoutExtension(path: string): string {
  return path.replace(/\.(?:md|mdx)$/iu, '');
}

function linkedDocumentPath(target: string, documents: readonly DatabaseMarkdownIdentityRepairDocument[]): string | null {
  const normalized = pathWithoutExtension(target);
  const exact = documents.find((document) => pathWithoutExtension(document.path) === normalized);
  return exact?.path ?? null;
}

function ownerMatches(owner: ParsedDatabaseMarkdownOwner, databaseId: string, sourceId: string): boolean {
  return owner.marker.databaseId === databaseId && owner.marker.sourceId === sourceId;
}

/**
 * Produce a content-free, approval-ready identity repair plan. No bytes are
 * written here: missing IDs can be assigned only when the caller supplies a
 * deterministic proposed ID, while duplicate ownership/row identity stays a
 * hard blocker requiring an explicit user decision.
 */
export function planDatabaseMarkdownIdentityRepair(input: {
  databaseId: string;
  sourceId: string;
  owners: readonly DatabaseMarkdownIdentityRepairDocument[];
  documents: readonly DatabaseMarkdownIdentityRepairDocument[];
  proposedDocumentIds?: Readonly<Record<string, DatabaseDocumentId>>;
}): DatabaseMarkdownIdentityRepairPlan {
  const issues: DatabaseMarkdownIdentityRepairIssue[] = [];
  const actions: DatabaseMarkdownIdentityRepairAction[] = [];
  const parsedOwners: Array<{ document: DatabaseMarkdownIdentityRepairDocument; owner: ParsedDatabaseMarkdownOwner }> = [];
  for (const document of input.owners) {
    const parsed = parseDatabaseMarkdownOwner(document.markdown);
    if (!parsed.ok) {
      issues.push({ code: 'malformed_owner', path: document.path, message: parsed.message });
      continue;
    }
    if (ownerMatches(parsed.owner, input.databaseId, input.sourceId)) parsedOwners.push({ document, owner: parsed.owner });
  }
  if (parsedOwners.length > 1) {
    for (const owner of parsedOwners) {
      issues.push({ code: 'duplicate_owner', path: owner.document.path, message: `Multiple owner tables claim source "${input.sourceId}"` });
    }
  }

  const identities = new Map<string, string[]>();
  const identityByPath = new Map<string, DatabaseDocumentId>();
  for (const document of input.documents) {
    const parsed = parseDatabaseDocumentIdentity(document.markdown);
    if (!parsed.ok) {
      const proposed = input.proposedDocumentIds?.[document.path];
      if (proposed && (parsed.code === 'missing_document_id' || parsed.code === 'missing_frontmatter')) {
        const ensured = ensureDatabaseDocumentIdentity({ markdown: document.markdown, documentId: proposed });
        if (ensured.ok) {
          actions.push({ kind: 'assign_document_id', path: document.path, documentId: proposed, beforeSha256: digest(document.markdown), afterSha256: digest(ensured.markdown), afterMarkdown: ensured.markdown });
          identityByPath.set(document.path, proposed);
          const paths = identities.get(proposed) ?? [];
          paths.push(document.path);
          identities.set(proposed, paths);
          continue;
        }
      }
      issues.push({
        code: parsed.code === 'invalid_document_id' ? 'invalid_document_id' : 'missing_document_id',
        path: document.path,
        message: parsed.message,
      });
      continue;
    }
    identityByPath.set(document.path, parsed.documentId);
    const paths = identities.get(parsed.documentId) ?? [];
    paths.push(document.path);
    identities.set(parsed.documentId, paths);
  }
  for (const [documentId, paths] of identities) {
    if (paths.length < 2) continue;
    for (const path of paths) issues.push({ code: 'duplicate_document_id', path, message: `Document ID "${documentId}" is shared by multiple documents` });
  }

  const owner = parsedOwners.length === 1 ? parsedOwners[0] : null;
  if (owner) {
    const seenTargets = new Map<string, number>();
    for (const row of owner.owner.rows) {
      const title = decodeDatabaseMarkdownCell('title', row.cells[0]?.value ?? '');
      const link = title.ok && title.value && !Array.isArray(title.value) && typeof title.value === 'object' && 'kind' in title.value && title.value.kind === 'wikilink'
        ? (title.value as DatabaseMarkdownDocumentLink)
        : null;
      if (!link) {
        issues.push({ code: 'broken_document_link', path: owner.document.path, rowIndex: row.rowIndex, message: 'Title cell does not contain a valid document wikilink' });
        continue;
      }
      const documentPath = linkedDocumentPath(link.target, input.documents);
      if (!documentPath) {
        issues.push({ code: 'broken_document_link', path: owner.document.path, rowIndex: row.rowIndex, message: `Document link "${link.target}" cannot be resolved` });
        continue;
      }
      const previous = seenTargets.get(documentPath);
      if (previous !== undefined) issues.push({ code: 'duplicate_row_identity', path: owner.document.path, rowIndex: row.rowIndex, relatedPath: documentPath, message: `Rows ${previous} and ${row.rowIndex} point to the same document` });
      seenTargets.set(documentPath, row.rowIndex);
      const document = input.documents.find((candidate) => candidate.path === documentPath);
      const documentTitle = document ? resolveDatabaseDocumentTitle(document.markdown, document.path).value : null;
      if (document && documentTitle && link.alias !== documentTitle) {
        const replacement = encodeDatabaseMarkdownCell('title', { kind: 'wikilink', target: pathWithoutExtension(document.path), alias: documentTitle });
        if (replacement.ok) {
          const afterMarkdown = replaceDatabaseMarkdownTableCell(owner.document.markdown, owner.owner, row.rowIndex, 0, replacement.text);
          actions.push({ kind: 'rewrite_title_alias', ownerPath: owner.document.path, rowIndex: row.rowIndex, beforeSha256: digest(owner.document.markdown), afterSha256: digest(afterMarkdown), afterMarkdown });
          issues.push({ code: 'stale_alias', path: owner.document.path, rowIndex: row.rowIndex, relatedPath: document.path, message: `Title alias does not match the linked document title "${documentTitle}"` });
        }
      }
    }
  }
  const planWithoutHash = { version: 1 as const, databaseId: input.databaseId, sourceId: input.sourceId, committable: issues.every((issue) => issue.code === 'stale_alias') && parsedOwners.length === 1, issues, actions };
  return { ...planWithoutHash, hash: digest(stable(planWithoutHash)) };
}
