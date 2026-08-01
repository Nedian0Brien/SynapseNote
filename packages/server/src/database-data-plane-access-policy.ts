import { createHash } from 'node:crypto';
import {
  type DatabaseAccessPrincipal,
  type DatabaseDefinition,
  type DatabasePermissionAction,
  DatabaseQuerySchema,
  type DatabaseRecord,
  type DatabaseSource,
  type DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import type { DatabaseDraftArtifact, DatabasePlanArtifact } from './database-plan-artifacts.ts';
import type { DatabaseSemanticIndexStatus } from './database-semantic-index.ts';
import { isV1Database, v1MigrationRequiredMessage } from './database-v1-compatibility.ts';

interface QueryAccessDecision {
  allowed?: boolean;
  policyId: string;
  policyRevision: string;
  allowedRecordIds: readonly string[] | null;
  allowedPropertyIds: readonly string[] | null;
  allowBody?: boolean;
}

export interface DatabaseDataPlaneAccessPolicyPort {
  snapshot(): { databases: readonly DatabaseDefinition[] };
  getRecordById(recordId: string): DatabaseRecord | null;
  resolveQueryAccess(input: {
    action: DatabasePermissionAction;
    database: DatabaseDefinition;
    source: DatabaseSource;
    query: ReturnType<typeof DatabaseQuerySchema.parse>;
    view: DatabaseView | null;
    principal: DatabaseAccessPrincipal;
  }): QueryAccessDecision;
  resolveGlobalAccess(input: {
    action: DatabasePermissionAction;
    principal: DatabaseAccessPrincipal;
  }): Pick<QueryAccessDecision, 'allowed' | 'policyId' | 'policyRevision'>;
  currentAccessPrincipal(): DatabaseAccessPrincipal;
  trustedFormMutation(): boolean;
  allowLegacyV1Mutation: boolean;
  stableJson(value: unknown): string;
}

export interface DatabaseOperationAuthorizationInput {
  action: DatabasePermissionAction;
  databaseId?: string;
  sourceId?: string;
  recordIds?: readonly string[];
  propertyIds?: readonly string[];
}

function cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition {
  return structuredClone(definition);
}

function isValidPolicyRevision(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

/** Permission decisions for public data-plane reads, plans, and mutations. */
export function createDatabaseDataPlaneAccessPolicy(port: DatabaseDataPlaneAccessPolicyPort) {
  const authorizeOperation = (input: DatabaseOperationAuthorizationInput): void => {
    const principal = port.currentAccessPrincipal();
    if (!input.databaseId) {
      const access = port.resolveGlobalAccess({ action: input.action, principal });
      if (access.policyId.trim() === '' || !isValidPolicyRevision(access.policyRevision)) {
        throw new Error('Database global access resolver returned an invalid policy identity');
      }
      if (access.allowed === false) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Operation exceeds the effective workspace access scope',
          {
            action: input.action,
            policyId: access.policyId,
            policyRevision: access.policyRevision,
          },
        );
      }
      return;
    }
    const database = port
      .snapshot()
      .databases.find((candidate) => candidate.id === input.databaseId);
    if (!database) {
      if (input.action === 'create_database' || input.action === 'manage_permissions') {
        authorizeOperation({ action: input.action });
        return;
      }
      throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
        databaseId: input.databaseId,
      });
    }
    const recordSourceIds = new Set(
      (input.recordIds ?? []).flatMap((recordId) => {
        const record = port.getRecordById(recordId);
        return record?.databaseId === database.id ? [record.sourceId] : [];
      }),
    );
    const sources = input.sourceId
      ? database.sources.filter((source) => source.id === input.sourceId)
      : recordSourceIds.size > 0
        ? database.sources.filter((source) => recordSourceIds.has(source.id))
        : database.sources;
    if (sources.length === 0) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', {
        databaseId: input.databaseId,
        sourceId: input.sourceId,
      });
    }
    for (const source of sources) {
      const access = port.resolveQueryAccess({
        action: input.action,
        database: cloneDefinition(database),
        source: structuredClone(source),
        query: DatabaseQuerySchema.parse({}),
        view: null,
        principal,
      });
      const deniedProperties = (input.propertyIds ?? []).filter(
        (propertyId) =>
          access.allowedPropertyIds !== null && !access.allowedPropertyIds.includes(propertyId),
      );
      const deniedRecords = (input.recordIds ?? []).filter(
        (recordId) =>
          access.allowedRecordIds !== null && !access.allowedRecordIds.includes(recordId),
      );
      if (access.allowed === false || deniedProperties.length > 0 || deniedRecords.length > 0) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Operation exceeds the effective database access scope',
          {
            action: input.action,
            databaseId: database.id,
            sourceId: source.id,
            policyId: access.policyId,
            policyRevision: access.policyRevision,
            deniedPropertyIds: deniedProperties,
            deniedRecordIds: deniedRecords,
          },
        );
      }
    }
  };

  const assertPlanningInputReadAccess = (input: unknown): void => {
    if (port.trustedFormMutation()) return;
    const principal = port.currentAccessPrincipal();
    const rawDatabase =
      input && typeof input === 'object' && 'database' in input
        ? (input as { database?: unknown }).database
        : null;
    const selector =
      rawDatabase && typeof rawDatabase === 'object'
        ? (rawDatabase as { id?: unknown; key?: unknown })
        : null;
    const database = port
      .snapshot()
      .databases.find(
        (candidate) =>
          (typeof selector?.id === 'string' && candidate.id === selector.id) ||
          (typeof selector?.key === 'string' && candidate.key === selector.key),
      );
    if (!database) {
      if (principal.kind === 'agent') {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Agent plans require an existing database with unrestricted planning visibility',
        );
      }
      return;
    }
    for (const source of database.sources) {
      const access = port.resolveQueryAccess({
        action: 'query',
        database: cloneDefinition(database),
        source: structuredClone(source),
        query: DatabaseQuerySchema.parse({}),
        view: null,
        principal,
      });
      if (
        access.allowed === false ||
        access.allowedRecordIds !== null ||
        access.allowedPropertyIds !== null ||
        access.allowBody === false
      ) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Database plans require unrestricted visibility of the existing schema and records',
          { policyId: access.policyId, policyRevision: access.policyRevision },
        );
      }
    }
  };

  const assertDraftReadAccess = (draft: DatabaseDraftArtifact): void => {
    if (port.trustedFormMutation()) return;
    const databaseId = draft.normalized.definition.id;
    const existing = port.snapshot().databases.some((database) => database.id === databaseId);
    if (!existing) return;
    const recordIds = [
      ...draft.normalized.sampleRecords.map(({ id }) => id),
      ...draft.normalized.recordMutations.map(({ recordId }) => recordId),
      ...draft.normalized.recordCopies.map(({ sourceRecordId }) => sourceRecordId),
      ...draft.normalized.recordArchives.map(({ recordId }) => recordId),
      ...draft.normalized.recordMoves.map(({ recordId }) => recordId),
      ...draft.normalized.recordDeletions.map(({ recordId }) => recordId),
    ];
    for (const source of draft.normalized.definition.sources) {
      authorizeOperation({
        action: 'query',
        databaseId,
        sourceId: source.id,
        recordIds: [...new Set(recordIds)],
        propertyIds: source.properties.map(({ id }) => id),
      });
    }
  };

  const v1MutationSources = (
    plan: DatabasePlanArtifact,
    databases: readonly DatabaseDefinition[],
  ): Array<{ databaseId: string; sourceId: string }> => {
    const mutatesCanonicalState = plan.normalizedOperations.some((operation) => {
      switch (operation.kind) {
        case 'ensure_database':
          return operation.action !== 'noop';
        case 'ensure_property':
        case 'ensure_relation':
        case 'ensure_view':
        case 'alter_schema':
          return operation.action !== 'noop';
        case 'upsert_records':
          return operation.created > 0 || operation.updated > 0;
        case 'mutate_record':
        case 'delete_records':
        case 'duplicate_records':
        case 'archive_records':
        case 'move_records':
        case 'delete_database':
          return true;
        default:
          return false;
      }
    });
    if (!mutatesCanonicalState) return [];
    const databaseIds =
      plan.affectedObjects.databaseIds.length > 0
        ? plan.affectedObjects.databaseIds
        : databases.map((database) => database.id);
    const sourceIds = new Set(plan.affectedObjects.sourceIds);
    return databases
      .filter((database) => databaseIds.includes(database.id) && isV1Database(database))
      .flatMap((database) =>
        database.sources
          .filter((source) => sourceIds.size === 0 || sourceIds.has(source.id))
          .map((source) => ({ databaseId: database.id, sourceId: source.id })),
      );
  };

  const assertPlanMutationAccess = (plan: DatabasePlanArtifact): void => {
    const snapshot = port.snapshot();
    if (!port.allowLegacyV1Mutation) {
      const blocked = v1MutationSources(plan, snapshot.databases);
      if (blocked.length > 0) {
        throw new DatabaseDataPlaneError(
          'storage_read_only',
          v1MigrationRequiredMessage('The selected source'),
          {
            databaseIds: [...new Set(blocked.map(({ databaseId }) => databaseId))],
            sourceIds: [...new Set(blocked.map(({ sourceId }) => sourceId))],
            migrationRequired: true,
          },
        );
      }
    }
    if (port.trustedFormMutation()) return;
    const principal = port.currentAccessPrincipal();
    const actions = new Set<DatabasePermissionAction>();
    for (const operation of plan.normalizedOperations) {
      switch (operation.kind) {
        case 'ensure_database':
          if (operation.action === 'create') actions.add('create_database');
          else if (operation.action === 'delete') actions.add('delete_database');
          else if (operation.action !== 'noop') actions.add('alter_schema');
          break;
        case 'delete_database':
          actions.add('delete_database');
          break;
        case 'ensure_property':
        case 'ensure_relation':
        case 'ensure_view':
        case 'alter_schema':
          if (operation.action !== 'noop') actions.add('alter_schema');
          break;
        case 'upsert_records':
          if (operation.created > 0) actions.add('create_record');
          if (operation.updated > 0) actions.add('update_record');
          break;
        case 'mutate_record':
        case 'duplicate_records':
        case 'archive_records':
        case 'move_records':
          actions.add('update_record');
          break;
        case 'delete_records':
          actions.add('delete_record');
          break;
      }
    }
    for (const action of actions) {
      for (const databaseId of plan.affectedObjects.databaseIds) {
        const database = snapshot.databases.find((candidate) => candidate.id === databaseId);
        if (!database) {
          authorizeOperation({ action });
          continue;
        }
        const sources =
          plan.affectedObjects.sourceIds.length > 0
            ? database.sources.filter((source) =>
                plan.affectedObjects.sourceIds.includes(source.id),
              )
            : database.sources;
        for (const source of sources) {
          const access = port.resolveQueryAccess({
            action,
            database: cloneDefinition(database),
            source: structuredClone(source),
            query: DatabaseQuerySchema.parse({}),
            view: null,
            principal,
          });
          const deniedProperties = plan.affectedObjects.propertyIds.filter(
            (propertyId) =>
              access.allowedPropertyIds !== null && !access.allowedPropertyIds.includes(propertyId),
          );
          const deniedRecords = plan.affectedObjects.recordIds.filter(
            (recordId) =>
              access.allowedRecordIds !== null && !access.allowedRecordIds.includes(recordId),
          );
          if (access.allowed === false || deniedProperties.length > 0 || deniedRecords.length > 0) {
            throw new DatabaseDataPlaneError(
              'permission_denied',
              'Database plan exceeds the effective mutation scope',
              {
                action,
                databaseId,
                sourceId: source.id,
                policyId: access.policyId,
                policyRevision: access.policyRevision,
                deniedPropertyIds: deniedProperties,
                deniedRecordIds: deniedRecords,
              },
            );
          }
        }
      }
    }
  };

  const visibleViews = (
    database: DatabaseDefinition,
    source: DatabaseSource,
    action: 'query' | 'aggregate' | 'pack_context',
  ): DatabaseView[] => {
    const query = DatabaseQuerySchema.parse({});
    return database.views
      .filter((view) => view.sourceId === source.id)
      .filter((view) => {
        const access = port.resolveQueryAccess({
          action,
          database: cloneDefinition(database),
          source: structuredClone(source),
          query: structuredClone(query),
          view: structuredClone(view),
          principal: port.currentAccessPrincipal(),
        });
        if (access.allowed === false) return false;
        if (access.allowedPropertyIds === null) return true;
        const allowed = new Set(access.allowedPropertyIds);
        return view.projection.propertyIds.every((propertyId) => allowed.has(propertyId));
      })
      .map((view) => structuredClone(view));
  };

  const projectSemanticIndexStatus = (
    status: DatabaseSemanticIndexStatus,
    source: DatabaseSource,
    records: readonly DatabaseRecord[],
    access: QueryAccessDecision,
  ): DatabaseSemanticIndexStatus => {
    const scoped =
      access.allowedRecordIds !== null ||
      access.allowedPropertyIds !== null ||
      access.allowBody === false;
    if (!scoped) return status;
    const allowedRecordIds =
      access.allowedRecordIds === null ? null : new Set(access.allowedRecordIds);
    const allowedPropertyIds =
      access.allowedPropertyIds === null ? null : new Set(access.allowedPropertyIds);
    const visibleRecords = records
      .filter((record) => allowedRecordIds === null || allowedRecordIds.has(record.id))
      .map((record) => ({
        id: record.id,
        path: record.path,
        values: Object.fromEntries(
          Object.entries(record.values)
            .filter(
              ([propertyId]) => allowedPropertyIds === null || allowedPropertyIds.has(propertyId),
            )
            .sort(([left], [right]) => left.localeCompare(right)),
        ),
        ...(status.includeBody && access.allowBody !== false ? { body: record.body } : {}),
      }));
    const visibleProperties = source.properties.filter(
      (property) => allowedPropertyIds === null || allowedPropertyIds.has(property.id),
    );
    const visibleIndexedRecords = Math.min(status.indexedRecords, visibleRecords.length);
    return {
      ...status,
      schemaRevision: `sha256:${createHash('sha256')
        .update(
          port.stableJson({
            properties: visibleProperties,
            policy: access.policyRevision,
          }),
        )
        .digest('hex')}`,
      indexRevision: `sha256:${createHash('sha256')
        .update(port.stableJson({ records: visibleRecords, policy: access.policyRevision }))
        .digest('hex')}`,
      propertyIds: status.propertyIds.filter(
        (propertyId) => allowedPropertyIds === null || allowedPropertyIds.has(propertyId),
      ),
      indexedRecords: visibleIndexedRecords,
      staleRecords: Math.min(status.staleRecords, visibleIndexedRecords),
      createdAt: null,
    };
  };

  return {
    authorizeOperation,
    assertPlanningInputReadAccess,
    assertDraftReadAccess,
    assertPlanMutationAccess,
    visibleViews,
    projectSemanticIndexStatus,
  };
}
