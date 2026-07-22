import type { DatabaseContextPack } from './database-context-pack.ts';

export const DATABASE_CONTEXT_INSPECTION_LIMIT = 20;

export interface DatabaseContextInspectionSummary {
  packId: string;
  capturedAt: string;
  goal: string;
  database: { id: string; name: string };
  sourceId: string;
  agentView: { id: string; revision: string } | null;
  disclosure: DatabaseContextPack['disclosure']['level'];
  returned: number;
  tokenCount: {
    tokenizer: DatabaseContextPack['budget']['tokenizer'];
    estimated: number;
    available: number;
    max: number;
    reserve: number;
  };
  redactions: {
    evaluated: boolean;
    rootRecords: number;
    rootProperties: number;
    relationRecords: number;
    relationProperties: number;
    sensitivityProperties: number;
    sensitivityBodies: number;
    sensitivityRelationEdges: number;
  };
  freshness: {
    manifestRevision: string;
    schemaRevision: string;
    indexRevision: string;
    indexState: DatabaseContextPack['snapshot']['indexState'];
    indexFreshness: DatabaseContextPack['snapshot']['indexFreshness'];
    expectation: DatabaseContextPack['database']['freshness'];
  };
  omissions: {
    records: number;
    propertyIds: readonly string[];
    evidence: number;
    fullBodies: number;
    permissionBodies: number;
    sensitivityProperties: number;
    sensitivityBodies: number;
    relation: {
      depthLimit: number;
      recordLimit: number;
      fanOutLimit: number;
      missingRecords: number;
      permissionRecords: number;
      permissionProperties: number;
      sensitivityProperties: number;
      sensitivityEdges: number;
      cycles: number;
      deduplicatedRecords: number;
    };
  };
  truncation: {
    truncated: boolean;
    cause: DatabaseContextPack['omitted']['reason'];
    continuationAvailable: boolean;
  };
}

export interface DatabaseContextInspection extends DatabaseContextInspectionSummary {
  exactPack: DatabaseContextPack;
}

export interface DatabaseContextInspectionScope {
  databaseId?: string;
  sourceId?: string;
  viewId?: string;
  recordId?: string;
  recordIds?: readonly string[];
}

function packContainsRecord(pack: DatabaseContextPack, recordId: string): boolean {
  if ('columns' in pack.records) {
    const recordColumn = pack.records.columns.indexOf('id');
    return recordColumn >= 0 && pack.records.rows.some((row) => row[recordColumn] === recordId);
  }
  return pack.records.some((record) => record.id === recordId);
}

function matchesScope(
  inspection: DatabaseContextInspection,
  scope: DatabaseContextInspectionScope,
): boolean {
  if (scope.databaseId && inspection.database.id !== scope.databaseId) return false;
  if (scope.sourceId && inspection.sourceId !== scope.sourceId) return false;
  if (scope.viewId && inspection.agentView?.id !== scope.viewId) return false;
  if (scope.recordId && !packContainsRecord(inspection.exactPack, scope.recordId)) return false;
  if (
    scope.recordIds &&
    !scope.recordIds.every((recordId) => packContainsRecord(inspection.exactPack, recordId))
  ) {
    return false;
  }
  return true;
}

function summaryFor(
  pack: DatabaseContextPack,
  capturedAt: string,
): DatabaseContextInspectionSummary {
  const permission = pack.snapshot.permissionExclusions;
  const relationOmitted = pack.relationExpansion?.omitted;
  return {
    packId: pack.id,
    capturedAt,
    goal: pack.goal,
    database: { id: pack.database.id, name: pack.database.name },
    sourceId: pack.schema.sourceId,
    agentView: pack.agentView ? { id: pack.agentView.id, revision: pack.agentView.revision } : null,
    disclosure: pack.disclosure.level,
    returned: pack.returned,
    tokenCount: {
      tokenizer: pack.budget.tokenizer,
      estimated: pack.budget.estimatedTokens,
      available: pack.budget.availableTokens,
      max: pack.budget.maxTokens,
      reserve: pack.budget.reserveTokens,
    },
    redactions: {
      evaluated: permission?.evaluated ?? pack.snapshot.sensitivityRedactions?.evaluated ?? false,
      rootRecords: permission?.records ?? 0,
      rootProperties: permission?.properties ?? 0,
      relationRecords: relationOmitted?.permissionRecords ?? 0,
      relationProperties: relationOmitted?.permissionProperties ?? 0,
      sensitivityProperties: pack.omitted.sensitivityProperties ?? 0,
      sensitivityBodies: pack.omitted.sensitivityBodies ?? 0,
      sensitivityRelationEdges: relationOmitted?.sensitivityEdges ?? 0,
    },
    freshness: {
      manifestRevision: pack.schema.manifestRevision,
      schemaRevision: pack.schema.schemaRevision,
      indexRevision: pack.snapshot.indexRevision,
      indexState: pack.snapshot.indexState,
      indexFreshness: pack.snapshot.indexFreshness,
      expectation: structuredClone(pack.database.freshness),
    },
    omissions: {
      records: pack.omitted.records,
      propertyIds: [...pack.omitted.propertyIds],
      evidence: pack.omitted.evidence,
      fullBodies: pack.omitted.fullBodies,
      permissionBodies: pack.omitted.permissionBodies ?? 0,
      sensitivityProperties: pack.omitted.sensitivityProperties ?? 0,
      sensitivityBodies: pack.omitted.sensitivityBodies ?? 0,
      relation: {
        depthLimit: relationOmitted?.depthLimit ?? 0,
        recordLimit: relationOmitted?.recordLimit ?? 0,
        fanOutLimit: relationOmitted?.fanOutLimit ?? 0,
        missingRecords: relationOmitted?.missingRecords.length ?? 0,
        permissionRecords: relationOmitted?.permissionRecords ?? 0,
        permissionProperties: relationOmitted?.permissionProperties ?? 0,
        sensitivityProperties: relationOmitted?.sensitivityProperties ?? 0,
        sensitivityEdges: relationOmitted?.sensitivityEdges ?? 0,
        cycles: relationOmitted?.cycles ?? 0,
        deduplicatedRecords: relationOmitted?.deduplicatedRecords ?? 0,
      },
    },
    truncation: {
      truncated: !pack.isComplete,
      cause: pack.omitted.reason,
      continuationAvailable: pack.nextCursor !== null,
    },
  };
}

/**
 * Process-local, bounded inspection history. Context Packs may contain private
 * source excerpts, so this history is deliberately never persisted to disk.
 */
export class DatabaseContextInspector {
  readonly #limit: number;
  readonly #entries = new Map<string, DatabaseContextInspection>();

  constructor(limit = DATABASE_CONTEXT_INSPECTION_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Database context inspection limit must be an integer from 1 to 100');
    }
    this.#limit = limit;
  }

  capture(
    pack: DatabaseContextPack,
    capturedAt = new Date().toISOString(),
  ): DatabaseContextInspection {
    const exactPack = structuredClone(pack);
    const inspection: DatabaseContextInspection = {
      ...summaryFor(exactPack, capturedAt),
      exactPack,
    };
    this.#entries.delete(pack.id);
    this.#entries.set(pack.id, inspection);
    while (this.#entries.size > this.#limit) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
    return structuredClone(inspection);
  }

  list(scope?: DatabaseContextInspectionScope): readonly DatabaseContextInspectionSummary[] {
    return [...this.#entries.values()]
      .reverse()
      .filter((inspection) => !scope || matchesScope(inspection, scope))
      .map(({ exactPack: _exactPack, ...summary }) => structuredClone(summary));
  }

  get(packId: string, scope?: DatabaseContextInspectionScope): DatabaseContextInspection | null {
    const inspection = this.#entries.get(packId);
    return inspection && (!scope || matchesScope(inspection, scope))
      ? structuredClone(inspection)
      : null;
  }
}
