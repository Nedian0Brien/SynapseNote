import {
  type DatabaseAccessPrincipal,
  type DatabaseDefinition,
  DatabasePropertySchema,
  DatabaseQuerySchema,
  type DatabaseRecordActor,
  type DatabaseSource,
  previewDatabasePropertyConversion,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabasePropertyConversionPlanPreview,
  ResolveDatabaseQueryAccess,
} from './database-data-plane.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import type {
  DatabaseDraftArtifact,
  DatabasePlanArtifact,
  DatabasePlanEngine,
  DatabaseVerificationDraftResult,
} from './database-plan.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';

interface PlanMutationPort {
  assertReadable(): void;
  assertPlanningInputReadAccess(input: unknown): void;
  assertDraftReadAccess(draft: DatabaseDraftArtifact): void;
  assertPlanMutationAccess(plan: DatabasePlanArtifact): void;
  authorizeOperation(input: { action: 'delete_database'; databaseId: string }): void;
  snapshot(): { revision: string; databases: readonly DatabaseDefinition[] };
  planEngine: DatabasePlanEngine;
  recordIndex: Pick<DatabaseRecordIndex, 'list' | 'snapshot'>;
  resolveQueryAccess: ResolveDatabaseQueryAccess;
  currentAccessPrincipal(): DatabaseAccessPrincipal;
  bindMutationActorToAccessPrincipal: boolean;
  trustedRecordActor(): DatabaseRecordActor;
  cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition;
}

export function createDatabasePlanMutationCoordinator(port: PlanMutationPort) {
  const getDraft = (draftId: string): DatabaseDraftArtifact => {
    const draft = port.planEngine.getDraft(draftId);
    port.assertDraftReadAccess(draft);
    return draft;
  };

  const getPlan = (planId: string): DatabasePlanArtifact => {
    const plan = port.planEngine.getPlan(planId);
    port.assertPlanMutationAccess(plan);
    return plan;
  };

  return {
    createDraft(input: unknown, ttlSeconds?: number): DatabaseDraftArtifact {
      port.assertPlanningInputReadAccess(input);
      const draft = port.planEngine.createDraft(input, ttlSeconds);
      try {
        port.assertDraftReadAccess(draft);
        return draft;
      } catch (error) {
        port.planEngine.discardDraft(draft.id);
        throw error;
      }
    },

    createDatabaseDeletionDraft(
      databaseId: string,
      expectedSnapshotRevision: string,
      ttlSeconds?: number,
    ): DatabaseDraftArtifact {
      port.authorizeOperation({ action: 'delete_database', databaseId });
      const draft = port.planEngine.createDatabaseDeletionDraft(
        databaseId,
        expectedSnapshotRevision,
        ttlSeconds,
      );
      try {
        port.assertDraftReadAccess(draft);
        return draft;
      } catch (error) {
        port.planEngine.discardDraft(draft.id);
        throw error;
      }
    },

    createVerificationDraft(
      input: unknown,
      actor: DatabaseRecordActor,
      ttlSeconds?: number,
    ): DatabaseVerificationDraftResult {
      port.assertPlanningInputReadAccess(input);
      return port.planEngine.createVerificationDraft(
        input,
        port.bindMutationActorToAccessPrincipal ? port.trustedRecordActor() : actor,
        ttlSeconds,
      );
    },

    getDraft,

    discardDraft(draftId: string): { discarded: boolean; draftId: string } {
      port.assertDraftReadAccess(port.planEngine.getDraft(draftId));
      return port.planEngine.discardDraft(draftId);
    },

    createPlan(draftId: string, ttlSeconds?: number): DatabasePlanArtifact {
      port.assertReadable();
      port.assertDraftReadAccess(port.planEngine.getDraft(draftId));
      const plan = port.planEngine.createPlan(draftId, ttlSeconds);
      port.assertPlanMutationAccess(plan);
      return plan;
    },

    getPlan,

    restorePlanBundle(bundle: {
      plan: DatabasePlanArtifact;
      draft: DatabaseDraftArtifact;
    }): DatabasePlanArtifact {
      port.planEngine.restoreDraft(bundle.draft);
      port.planEngine.restorePlan(bundle.plan);
      return getPlan(bundle.plan.id);
    },

    previewPropertyConversion(input: {
      databaseId: string;
      sourceId: string;
      propertyId: string;
      targetProperty: unknown;
      allowLossy?: boolean;
      ttlSeconds?: number;
    }): DatabasePropertyConversionPlanPreview {
      port.assertReadable();
      const snapshot = port.snapshot();
      const database = snapshot.databases.find((candidate) => candidate.id === input.databaseId);
      if (!database) {
        throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
          databaseId: input.databaseId,
        });
      }
      const source = database.sources.find((candidate) => candidate.id === input.sourceId);
      if (!source) {
        throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', {
          databaseId: database.id,
          sourceId: input.sourceId,
        });
      }
      const sourceProperty = source.properties.find(
        (candidate) => candidate.id === input.propertyId,
      );
      if (!sourceProperty) {
        throw new DatabaseDataPlaneError('property_not_found', 'Property was not found', {
          databaseId: database.id,
          sourceId: source.id,
          propertyId: input.propertyId,
        });
      }
      const parsedTarget = DatabasePropertySchema.safeParse(input.targetProperty);
      if (!parsedTarget.success) {
        throw new DatabaseDataPlaneError(
          'invalid_property_conversion',
          'Target property schema is invalid',
          {
            issues: parsedTarget.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        );
      }
      const targetProperty = parsedTarget.data;
      if (
        targetProperty.id !== sourceProperty.id ||
        targetProperty.key !== sourceProperty.key ||
        targetProperty.name !== sourceProperty.name
      ) {
        throw new DatabaseDataPlaneError(
          'invalid_property_conversion',
          'Type conversion must preserve the property ID, key, and name',
          { propertyId: sourceProperty.id },
        );
      }
      const access = port.resolveQueryAccess({
        action: 'alter_schema',
        database: port.cloneDefinition(database),
        source: structuredClone(source),
        query: DatabaseQuerySchema.parse({}),
        view: null,
        principal: port.currentAccessPrincipal(),
      });
      if (access.allowedRecordIds !== null || access.allowedPropertyIds !== null) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Property conversion requires complete source and schema access',
          {
            databaseId: database.id,
            sourceId: source.id,
            propertyId: sourceProperty.id,
          },
        );
      }
      const records = port.recordIndex.list(database.id, source.id);
      if (records.some((record) => record.revision === null)) {
        throw new DatabaseDataPlaneError(
          'stale_index',
          'Property conversion requires exact revisions for every source record',
          { databaseId: database.id, sourceId: source.id },
        );
      }
      const preview = previewDatabasePropertyConversion({
        sourceProperty,
        targetProperty,
        records: records.map((record) => ({
          id: record.id,
          revision: record.revision as string,
          value: record.values[sourceProperty.id],
        })),
        allowLossy: input.allowLossy,
      });
      const base = {
        databaseId: database.id,
        sourceId: source.id,
        propertyId: sourceProperty.id,
        manifestRevision: snapshot.revision,
        indexRevision: port.recordIndex.snapshot().revision,
        preview,
      };
      if (!preview.committable) return { ...base, draft: null, plan: null };

      const desiredState = conversionDesiredState(
        database,
        source,
        sourceProperty.id,
        targetProperty,
        preview,
      );
      try {
        const draft = port.planEngine.createDraft(desiredState, input.ttlSeconds);
        const plan = port.planEngine.createPlan(draft.id, input.ttlSeconds);
        return { ...base, draft, plan };
      } catch (error) {
        throw new DatabaseDataPlaneError(
          'invalid_property_conversion',
          'Property conversion could not produce an exact database plan',
          { reason: error instanceof Error ? error.message : String(error) },
        );
      }
    },
  };
}

function conversionDesiredState(
  database: DatabaseDefinition,
  source: DatabaseSource,
  sourcePropertyId: string,
  targetProperty: DatabaseSource['properties'][number],
  preview: ReturnType<typeof previewDatabasePropertyConversion>,
) {
  const sourceKeyById = new Map(database.sources.map((entry) => [entry.id, entry.key] as const));
  return {
    database: {
      id: database.id,
      key: database.key,
      name: database.name,
      ...(database.description ? { description: database.description } : {}),
      ...(database.icon ? { icon: database.icon } : {}),
      ...(database.cover ? { cover: database.cover } : {}),
      ...(database.aliases ? { aliases: [...database.aliases] } : {}),
      people: structuredClone(database.people),
      contract: structuredClone(database.contract),
    },
    sources: database.sources.map((entry) => ({
      ...structuredClone(entry),
      properties: entry.properties.map((property) =>
        property.id === sourcePropertyId
          ? structuredClone(targetProperty)
          : structuredClone(property),
      ),
    })),
    views: database.views.map((view) => {
      const { sourceId, ...canonicalView } = structuredClone(view);
      return { ...canonicalView, sourceKey: sourceKeyById.get(sourceId) ?? sourceId };
    }),
    policy: {
      mode: 'review' as const,
      allowedOperations: ['alter_schema', 'mutate_record'],
      maxRecordsPerCommit: Math.max(1, preview.changes.length),
    },
    sampleRecords: [],
    recordMutations: preview.changes.flatMap((change) => {
      if (change.outcome === 'empty' || change.outcome === 'blocked') return [];
      return [
        {
          id: change.recordId,
          expectedRevision: change.expectedRevision,
          sourceKey: source.key,
          operations:
            change.after === undefined
              ? [{ op: 'unset' as const, propertyKey: targetProperty.key }]
              : [
                  {
                    op: 'set' as const,
                    propertyKey: targetProperty.key,
                    value: structuredClone(change.after),
                  },
                ],
        },
      ];
    }),
  };
}
