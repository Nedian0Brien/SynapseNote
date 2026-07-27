import { createHash } from 'node:crypto';
import type { DatabaseValue } from './record.ts';

export type DatabaseMarkdownTableExportMode = 'canonical_markdown' | 'computed_snapshot';

export interface DatabaseMarkdownCanonicalExportEntry {
  path: string;
  content: string;
  sha256: string;
}

export interface DatabaseMarkdownComputedSnapshotRecord {
  recordId: string;
  path: string;
  values: Readonly<Record<string, DatabaseValue>>;
  computed?: Readonly<Record<string, unknown>>;
}

export interface DatabaseMarkdownTableExport {
  mode: DatabaseMarkdownTableExportMode;
  manifestRevision: string;
  /** Present only for computed snapshots; never used as a canonical input revision. */
  derivedRevision: string | null;
  evaluatedAt: string | null;
  canonical: readonly DatabaseMarkdownCanonicalExportEntry[];
  snapshot: readonly DatabaseMarkdownComputedSnapshotRecord[];
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/**
 * Keep canonical Markdown export and the UI-facing computed snapshot
 * intentionally disjoint.  A computed snapshot contains no owner marker and
 * therefore cannot be accidentally re-imported as a second database owner.
 */
export function createDatabaseMarkdownTableExport(input: {
  mode: DatabaseMarkdownTableExportMode;
  manifestRevision: string;
  ownerPath: string;
  ownerMarkdown: string;
  linkedDocuments?: readonly { path: string; markdown: string }[];
  evaluatedAt?: string;
  derivedRevision?: string | null;
  records?: readonly DatabaseMarkdownComputedSnapshotRecord[];
}): DatabaseMarkdownTableExport {
  if (input.mode === 'canonical_markdown') {
    const canonical = [
      { path: input.ownerPath, content: input.ownerMarkdown, sha256: sha256(input.ownerMarkdown) },
      ...(input.linkedDocuments ?? []).map((document) => ({
        path: document.path,
        content: document.markdown,
        sha256: sha256(document.markdown),
      })),
    ].sort((left, right) => left.path.localeCompare(right.path));
    return {
      mode: input.mode,
      manifestRevision: input.manifestRevision,
      derivedRevision: null,
      evaluatedAt: null,
      canonical,
      snapshot: [],
    };
  }
  if (!input.evaluatedAt || !input.derivedRevision) {
    throw new Error('Computed database export requires evaluatedAt and derivedRevision');
  }
  return {
    mode: input.mode,
    manifestRevision: input.manifestRevision,
    derivedRevision: input.derivedRevision,
    evaluatedAt: input.evaluatedAt,
    canonical: [],
    snapshot: [...(input.records ?? [])].sort((left, right) => left.recordId.localeCompare(right.recordId)),
  };
}
