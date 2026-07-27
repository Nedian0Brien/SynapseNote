import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { DatabaseRecord } from './record.ts';
import type { DatabaseDefinition } from './schema.ts';

export interface DatabaseReverseRelationEdge {
  sourceId: string;
  recordId: string;
  propertyId: string;
  targetSourceId: string;
  targetRecordId: string;
  ordinal: number;
}

export interface DatabaseReverseRelationIndex {
  byTargetRecordId: ReadonlyMap<string, readonly DatabaseReverseRelationEdge[]>;
  revision: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function revision(value: unknown): string {
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(stable(value))))}`;
}

/** Build a deterministic incoming relation index without mutating records. */
export function buildDatabaseReverseRelationIndex(
  definition: DatabaseDefinition,
  records: readonly DatabaseRecord[],
): DatabaseReverseRelationIndex {
  const byTargetRecordId = new Map<string, DatabaseReverseRelationEdge[]>();
  for (const record of [...records].sort((left, right) => left.id.localeCompare(right.id))) {
    const source = definition.sources.find((candidate) => candidate.id === record.sourceId);
    if (!source) continue;
    for (const property of source.properties) {
      if (property.type !== 'relation') continue;
      const raw = record.values[property.id];
      const targets = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
      for (const [ordinal, target] of targets.entries()) {
        if (typeof target !== 'string') continue;
        const edge: DatabaseReverseRelationEdge = {
          sourceId: source.id,
          recordId: record.id,
          propertyId: property.id,
          targetSourceId: property.targetSourceId,
          targetRecordId: target,
          ordinal,
        };
        const list = byTargetRecordId.get(target) ?? [];
        list.push(edge);
        byTargetRecordId.set(target, list);
      }
    }
  }
  for (const [target, edges] of byTargetRecordId) {
    edges.sort((left, right) =>
      left.sourceId.localeCompare(right.sourceId) ||
      left.recordId.localeCompare(right.recordId) ||
      left.propertyId.localeCompare(right.propertyId) ||
      left.ordinal - right.ordinal,
    );
    byTargetRecordId.set(target, edges);
  }
  return {
    byTargetRecordId,
    revision: revision(
      [...byTargetRecordId.entries()].map(([targetRecordId, edges]) => ({ targetRecordId, edges })),
    ),
  };
}

export function databaseReverseRelationDependents(
  index: DatabaseReverseRelationIndex,
  targetRecordId: string,
): readonly DatabaseReverseRelationEdge[] {
  return index.byTargetRecordId.get(targetRecordId) ?? [];
}

export interface DatabaseDerivedRevisionInput {
  manifestRevision: string;
  tableRevisions: Readonly<Record<string, string>>;
  dependencyRevision: string;
  permissionRevision: string;
  evaluationRevision: string;
}

/** Revision shared by UI, HTTP, MCP, workers, and computed exports. */
export function createDatabaseDerivedRevision(input: DatabaseDerivedRevisionInput): string {
  return revision(input);
}
