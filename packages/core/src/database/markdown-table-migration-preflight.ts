import type { DatabaseDefinition, DatabaseSource } from './schema.ts';

export type DatabaseMigrationOwnerCandidateKind = 'inline' | 'full_page' | 'new_document';

export interface DatabaseMigrationOwnerCandidate {
  kind: DatabaseMigrationOwnerCandidateKind;
  path: string;
  blockId: string;
  occupied: boolean;
  ownerBinding?: { databaseId: string; sourceId: string };
}

export interface DatabaseMigrationOwnerSelection {
  sourceId: string;
  candidates: readonly DatabaseMigrationOwnerCandidate[];
  selectedPath?: string;
  selectedBlockId?: string;
}

export interface DatabaseMigrationOwnerSelectionResult {
  selected: DatabaseMigrationOwnerCandidate | null;
  blockers: readonly {
    code:
      | 'owner_choice_required'
      | 'owner_path_occupied'
      | 'owner_path_unsafe'
      | 'owner_candidate_missing';
    message: string;
    path?: string;
  }[];
}

function safeRelativeMarkdownPath(path: string): boolean {
  return Boolean(
    path.endsWith('.md') &&
      !path.includes('\0') &&
      !path.includes('\\') &&
      !path.startsWith('/') &&
      !/^[A-Za-z]:/.test(path) &&
      path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
  );
}

/** Resolve an explicit owner choice; no path is auto-selected when ambiguous. */
export function resolveDatabaseMigrationOwnerSelection(
  input: DatabaseMigrationOwnerSelection,
): DatabaseMigrationOwnerSelectionResult {
  const blockers: Array<DatabaseMigrationOwnerSelectionResult['blockers'][number]> = [];
  const candidates = [...input.candidates].sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.blockId.localeCompare(right.blockId),
  );
  for (const candidate of candidates) {
    if (!safeRelativeMarkdownPath(candidate.path))
      blockers.push({
        code: 'owner_path_unsafe',
        path: candidate.path,
        message: `Owner path "${candidate.path}" is not a safe relative Markdown path`,
      });
  }
  if (input.selectedPath === undefined || input.selectedBlockId === undefined) {
    blockers.push({
      code: 'owner_choice_required',
      message: `Source "${input.sourceId}" requires an explicit owner candidate choice`,
    });
    return { selected: null, blockers };
  }
  const selected = candidates.find(
    (candidate) =>
      candidate.path === input.selectedPath && candidate.blockId === input.selectedBlockId,
  );
  if (!selected) {
    blockers.push({
      code: 'owner_candidate_missing',
      path: input.selectedPath,
      message: 'The selected owner candidate is not in the frozen preview',
    });
    return { selected: null, blockers };
  }
  if (
    selected.occupied &&
    selected.ownerBinding &&
    (selected.ownerBinding.databaseId !== '' || selected.ownerBinding.sourceId !== input.sourceId)
  ) {
    blockers.push({
      code: 'owner_path_occupied',
      path: selected.path,
      message: `Owner path "${selected.path}" is occupied by another owner binding`,
    });
  }
  if (selected.occupied && !selected.ownerBinding) {
    blockers.push({
      code: 'owner_path_occupied',
      path: selected.path,
      message: `Owner path "${selected.path}" already contains unrelated content`,
    });
  }
  return blockers.length > 0 ? { selected: null, blockers } : { selected, blockers: [] };
}

export interface DatabaseMigrationDependencyEdge {
  databaseId: string;
  sourceId: string;
  targetDatabaseId: string;
  targetSourceId: string;
  propertyId: string;
  kind: 'relation' | 'rollup';
}

export interface DatabaseMigrationDependencyClosureResult {
  selectedDatabaseIds: readonly string[];
  closureDatabaseIds: readonly string[];
  edges: readonly DatabaseMigrationDependencyEdge[];
  blockers: readonly {
    code: 'dependency_not_found' | 'mixed_writer_dependency' | 'dependency_cycle';
    databaseId?: string;
    targetDatabaseId?: string;
    message: string;
  }[];
}

/** Compute the write closure needed to avoid a cross-database mixed-writer state. */
export function planDatabaseMigrationDependencyClosure(input: {
  databases: readonly DatabaseDefinition[];
  selectedDatabaseIds: readonly string[];
  targetVersion: number;
}): DatabaseMigrationDependencyClosureResult {
  const byId = new Map(input.databases.map((database) => [database.id, database]));
  const selected = new Set(input.selectedDatabaseIds);
  const closure = new Set(input.selectedDatabaseIds);
  const edges: DatabaseMigrationDependencyEdge[] = [];
  const blockers: Array<DatabaseMigrationDependencyClosureResult['blockers'][number]> = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const walk = (database: DatabaseDefinition): void => {
    if (visiting.has(database.id)) {
      blockers.push({
        code: 'dependency_cycle',
        databaseId: database.id,
        message: `Migration dependency cycle includes database "${database.id}"`,
      });
      return;
    }
    if (visited.has(database.id)) return;
    visiting.add(database.id);
    for (const source of database.sources) {
      for (const property of source.properties) {
        if (property.type !== 'relation' && property.type !== 'rollup') continue;
        const relationProperty =
          property.type === 'rollup'
            ? source.properties.find((candidate) => candidate.id === property.relationPropertyId)
            : null;
        const targetSourceId =
          property.type === 'relation'
            ? property.targetSourceId
            : relationProperty?.type === 'relation'
              ? relationProperty.targetSourceId
              : property.relationPropertyId;
        const target = input.databases.find((candidate) =>
          candidate.sources.some((candidateSource) => candidateSource.id === targetSourceId),
        );
        if (!target) {
          blockers.push({
            code: 'dependency_not_found',
            databaseId: database.id,
            targetDatabaseId: targetSourceId,
            message: `Dependency target "${targetSourceId}" is not present in the frozen manifest`,
          });
          continue;
        }
        edges.push({
          databaseId: database.id,
          sourceId: source.id,
          targetDatabaseId: target.id,
          targetSourceId,
          propertyId: property.id,
          kind: property.type === 'relation' ? 'relation' : 'rollup',
        });
        if (!closure.has(target.id)) {
          if (target.version !== input.targetVersion)
            blockers.push({
              code: 'mixed_writer_dependency',
              databaseId: database.id,
              targetDatabaseId: target.id,
              message: `Database "${database.id}" depends on target "${target.id}" which would remain on a different writer version`,
            });
          closure.add(target.id);
        }
        // A relation to another source in the same manifest is already inside
        // one writer boundary; it is not a migration dependency cycle. Only
        // recurse across database boundaries where a mixed-version closure can
        // actually be created.
        if (target.id !== database.id) walk(target);
      }
    }
    visiting.delete(database.id);
    visited.add(database.id);
  };
  for (const databaseId of [...selected].sort()) {
    const database = byId.get(databaseId);
    if (database) walk(database);
    else
      blockers.push({
        code: 'dependency_not_found',
        databaseId,
        message: `Selected database "${databaseId}" is not present in the frozen manifest`,
      });
  }
  return {
    selectedDatabaseIds: [...selected].sort(),
    closureDatabaseIds: [...closure].sort(),
    edges: edges.sort(
      (left, right) =>
        left.databaseId.localeCompare(right.databaseId) ||
        left.sourceId.localeCompare(right.sourceId) ||
        left.propertyId.localeCompare(right.propertyId),
    ),
    blockers,
  };
}

export interface DatabaseMigrationDerivedBaseline {
  evaluatedAt: string;
  timeZone: string;
  locale: string;
  permissionRevision: string;
}

export function freezeDatabaseMigrationDerivedBaseline(
  input: DatabaseMigrationDerivedBaseline,
): DatabaseMigrationDerivedBaseline {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.evaluatedAt))
    throw new Error('Migration Formula/Rollup baseline requires a UTC evaluation timestamp');
  if (!input.timeZone || !input.locale || !/^sha256:[a-f0-9]{64}$/.test(input.permissionRevision))
    throw new Error('Migration Formula/Rollup baseline is incomplete');
  return Object.freeze({ ...input });
}

export function migrationSources(definition: DatabaseDefinition): readonly DatabaseSource[] {
  return definition.sources;
}
