import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canonicalizeDatabaseDateValue,
  canonicalizeDatabasePlaceValue,
  DATABASE_DEFAULT_STATUS_BLUEPRINT,
  DatabaseAutomationScheduleSchema,
  DatabaseAutomationSchema,
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  DatabaseFilesValueSchema,
  type DatabaseFileValue,
  type DatabaseFilter,
  type DatabasePerson,
  type DatabaseProperty,
  type DatabaseRecordActor,
  DatabaseRecordActorSchema,
  DatabaseRecordIdSchema,
  type DatabaseRecordMutation,
  DatabaseRecordMutationOperationSchema,
  DatabaseRecordMutationSchema,
  type DatabaseRecordPageLayoutOverride,
  DatabaseRecordPageLayoutOverrideSchema,
  DatabaseVerificationLifecycleInputSchema,
  type DatabaseVerificationValue,
  DatabaseVerificationValueSchema,
  databaseFileIdentity,
  databasePathNameWithCollisionSuffix,
  databaseRecordNameFromTitle,
  databaseRecordPageLayoutOverrideIssues,
  findDatabasePersonByReference,
  isSafeDatabaseAssetPath,
  isSafeDatabaseExternalFileUrl,
  serializeDatabaseManifestYaml,
  updateDatabaseManifestYaml,
  validateDatabasePropertyConstraints,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';

export type { DatabaseRecordMutation };
export { DatabaseRecordMutationSchema };

const DatabaseDraftPropertySchema = z
  .object({
    id: z.string().optional(),
    key: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
  })
  .loose();

const DatabaseDraftSourceSchema = z
  .object({
    id: z.string().optional(),
    key: z.string().min(1),
    name: z.string().min(1),
    recordMeaning: z.string().min(1),
    folder: z.string(),
    properties: z.array(DatabaseDraftPropertySchema).min(1),
  })
  .loose();

const DatabaseDraftViewSchema = z
  .object({
    id: z.string().optional(),
    key: z.string().min(1),
    name: z.string().min(1),
    sourceKey: z.string().min(1),
    layout: z.record(z.string(), z.unknown()),
  })
  .loose();

const DatabaseDraftSourceMappingSchema = z
  .object({
    sourceKey: z.string().min(1),
    targetSourceKey: z.string().min(1),
    propertyMappings: z
      .array(
        z
          .object({
            sourcePropertyKey: z.string().min(1),
            targetPropertyKey: z.string().min(1),
            optionMappings: z
              .array(
                z
                  .object({
                    sourceOptionKey: z.string().min(1),
                    targetOptionKey: z.string().min(1),
                  })
                  .strict(),
              )
              .default([]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const DatabaseRecordDeletionSchema = z
  .object({
    id: z.string().regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceKey: z.string().min(1),
  })
  .strict();
const DatabaseRecordCopySchema = z
  .object({
    id: z.string().regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceKey: z.string().min(1),
    newId: z
      .string()
      .regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
      .optional(),
    title: z.string().trim(),
  })
  .strict();

const DatabaseRecordArchiveSchema = z
  .object({
    id: z.string().regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceKey: z.string().min(1),
    action: z.enum(['archive', 'restore']),
  })
  .strict();

const DatabaseRecordMoveSchema = z
  .object({
    id: z.string().regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceKey: z.string().min(1),
    targetSourceKey: z.string().min(1),
  })
  .strict();

const DatabaseAutomationEventValueDraftSchema = z
  .object({
    fromEvent: z.enum(['record_id', 'record_body', 'property']),
    propertyKey: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => (value.fromEvent === 'property') === (value.propertyKey !== undefined), {
    message: 'Event property values require exactly one propertyKey',
  });

const DatabaseAutomationDraftSchema = z
  .object({
    id: z.string().startsWith('auto_').optional(),
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().max(2_000).optional(),
    version: z.number().int().min(1).default(1),
    enabled: z.boolean().default(false),
    ownerKey: z.string().min(1),
    trigger: z.union([
      z.object({ kind: z.literal('record_added'), sourceKey: z.string().min(1) }).strict(),
      z
        .object({
          kind: z.literal('property_changed'),
          sourceKey: z.string().min(1),
          propertyKey: z.string().min(1),
        })
        .strict(),
      z
        .object({
          kind: z.literal('schedule'),
          schedule: DatabaseAutomationScheduleSchema,
          timeZone: z.string().min(1),
        })
        .strict(),
      z.object({ kind: z.literal('form_submitted'), viewKey: z.string().min(1) }).strict(),
      z.object({ kind: z.literal('button_invoked'), buttonKey: z.string().min(1) }).strict(),
      z
        .object({
          kind: z.literal('button_invoked'),
          sourceKey: z.string().min(1),
          propertyKey: z.string().min(1),
        })
        .strict(),
    ]),
    actions: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('create_record'),
              sourceKey: z.string().min(1),
              values: z.record(z.string(), z.unknown()).default({}),
              body: z.union([z.string(), DatabaseAutomationEventValueDraftSchema]).optional(),
            })
            .strict(),
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('update_trigger_record'),
              operations: z.array(DatabaseRecordMutationOperationSchema).min(1).max(100),
            })
            .strict(),
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('change_relation'),
              propertyKey: z.string().min(1),
              operation: z.enum(['add', 'remove']),
              recordId: z.string().startsWith('rec_'),
            })
            .strict(),
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('assign_person'),
              propertyKey: z.string().min(1),
              operation: z.enum(['set', 'add', 'remove']),
              personKey: z.string().min(1),
            })
            .strict(),
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('notification'),
              recipientKeys: z.array(z.string().min(1)).min(1).max(100),
              title: z.string().min(1).max(200),
              body: z.string().max(10_000).default(''),
            })
            .strict(),
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('apply_template'),
              templateKey: z.string().min(1),
            })
            .strict(),
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('external_webhook'),
              connectionId: z.string().startsWith('conn_'),
              eventName: z.string().min(1),
              propertyKeys: z.array(z.string().min(1)).max(100).default([]),
              includeBody: z.boolean().default(false),
            })
            .strict(),
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('external_email'),
              connectionId: z.string().startsWith('conn_'),
              to: z.array(z.string().email()).min(1).max(100),
              subject: z.string().min(1).max(998),
              propertyKeys: z.array(z.string().min(1)).max(100).default([]),
              includeBody: z.boolean().default(false),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(20),
    retry: z
      .object({
        maxAttempts: z.number().int().min(1).max(10).default(3),
        initialBackoffSeconds: z.number().int().min(1).max(86_400).default(60),
        multiplier: z.number().min(1).max(10).default(2),
      })
      .strict()
      .optional(),
    limits: z
      .object({
        maxActionsPerRun: z.number().int().min(1).max(20).default(20),
        maxGeneratedEvents: z.number().int().min(0).max(100).default(20),
      })
      .strict()
      .optional(),
  })
  .strict();

export const DatabaseDesiredStateDraftSchema = z
  .object({
    database: z
      .object({
        id: z.string().optional(),
        key: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        icon: z.string().max(2_048).optional(),
        cover: z.string().max(2_048).optional(),
        aliases: z.array(z.string()).optional(),
        people: z
          .array(
            z
              .object({
                id: z.string().optional(),
                key: z.string().min(1),
                name: z.string().min(1),
                kind: z.enum(['local', 'collaborator', 'guest', 'agent']),
                subjectId: z.string().min(1).max(256).optional(),
                active: z.boolean().optional(),
              })
              .strict(),
          )
          .optional(),
        contract: z.record(z.string(), z.unknown()),
      })
      .strict(),
    sources: z.array(DatabaseDraftSourceSchema).min(1),
    sourceMappings: z.array(DatabaseDraftSourceMappingSchema).optional(),
    views: z.array(DatabaseDraftViewSchema).default([]),
    uniqueKey: z
      .object({ sourceKey: z.string().min(1), propertyKey: z.string().min(1) })
      .strict()
      .optional(),
    templates: z
      .array(
        z
          .object({
            id: z
              .string()
              .regex(/^tpl_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
              .optional(),
            key: z.string().min(1),
            name: z.string().min(1),
            description: z.string().max(2_000).optional(),
            sourceKey: z.string().min(1),
            markdown: z.string().max(1_000_000).optional(),
            body: z.string().max(1_000_000).optional(),
            propertyValues: z.record(z.string(), z.unknown()).default({}),
            order: z.number().int().min(0).max(100_000).optional(),
            archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
            defaultFor: z
              .object({
                source: z.boolean().default(false),
                viewKeys: z.array(z.string().min(1)).max(100).default([]),
                entryPoints: z.array(z.string().min(1)).max(100).default([]),
              })
              .strict()
              .optional(),
            repeat: z
              .object({
                schedule: z.discriminatedUnion('kind', [
                  z
                    .object({
                      kind: z.literal('daily'),
                      time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
                    })
                    .strict(),
                  z
                    .object({
                      kind: z.literal('weekly'),
                      weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
                      time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
                    })
                    .strict(),
                  z
                    .object({
                      kind: z.literal('monthly'),
                      day: z.number().int().min(1).max(28),
                      time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
                    })
                    .strict(),
                  z
                    .object({
                      kind: z.literal('interval'),
                      every: z.number().int().min(1).max(365),
                      unit: z.enum(['hours', 'days', 'weeks']),
                      anchor: z.string().datetime({ offset: true }),
                    })
                    .strict(),
                ]),
                timeZone: z.string().min(1),
                ownerKey: z.string().min(1),
                paused: z.boolean().default(true),
                retry: z
                  .object({
                    maxAttempts: z.number().int().min(1).max(10).default(3),
                    initialBackoffSeconds: z.number().int().min(1).max(86_400).default(60),
                    multiplier: z.number().min(1).max(10).default(2),
                  })
                  .strict()
                  .optional(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .refine((template) => template.body === undefined || template.markdown === undefined, {
            message: 'Use either body or legacy markdown, not both',
          }),
      )
      .default([]),
    buttons: z
      .array(
        z
          .object({
            id: z
              .string()
              .regex(/^dbbtn_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
              .optional(),
            key: z.string().min(1),
            name: z.string().min(1),
            description: z.string().max(2_000).optional(),
            placement: z.discriminatedUnion('kind', [
              z.object({ kind: z.literal('database') }).strict(),
              z.object({ kind: z.literal('source'), sourceKey: z.string().min(1) }).strict(),
            ]),
            confirmation: z
              .object({ title: z.string().min(1), description: z.string().max(2_000).optional() })
              .strict()
              .optional(),
            actions: z
              .array(
                z
                  .object({
                    id: z.string().min(1),
                    kind: z.literal('create_record'),
                    sourceKey: z.string().min(1),
                    values: z.record(z.string(), z.unknown()),
                    body: z.string().max(1_000_000).default(''),
                  })
                  .strict(),
              )
              .min(1)
              .max(20),
          })
          .strict(),
      )
      .default([]),
    automations: z
      .array(z.union([DatabaseAutomationSchema, DatabaseAutomationDraftSchema]))
      .optional(),
    policy: z
      .object({
        mode: z.enum(['review', 'balanced', 'autonomous']),
        allowedOperations: z.array(z.string()).default([]),
        maxRecordsPerCommit: z.number().int().positive().max(100_000).default(100),
      })
      .strict()
      .default({
        mode: 'review',
        allowedOperations: [],
        maxRecordsPerCommit: 100,
      }),
    sampleRecords: z
      .array(
        z
          .object({
            id: z
              .string()
              .regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
              .optional(),
            expectedRevision: z
              .string()
              .regex(/^sha256:[a-f0-9]{64}$/)
              .optional(),
            sourceKey: z.string().min(1),
            values: z.record(z.string(), z.unknown()),
            body: z.string().default(''),
            pageLayoutOverride: DatabaseRecordPageLayoutOverrideSchema.nullable().optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    recordMutations: z.array(DatabaseRecordMutationSchema).max(10_000).default([]),
    recordCopies: z.array(DatabaseRecordCopySchema).max(100).default([]),
    recordArchives: z.array(DatabaseRecordArchiveSchema).max(100).default([]),
    recordMoves: z.array(DatabaseRecordMoveSchema).max(100).default([]),
    recordDeletions: z.array(DatabaseRecordDeletionSchema).max(100).default([]),
  })
  .strict();

export type DatabaseDesiredStateDraftInput = z.input<typeof DatabaseDesiredStateDraftSchema>;
export type DatabaseDesiredStateDraft = z.output<typeof DatabaseDesiredStateDraftSchema>;

interface DatabaseTargetResolution {
  kind:
    | 'database'
    | 'person'
    | 'source'
    | 'property'
    | 'option'
    | 'view'
    | 'template'
    | 'action_button'
    | 'automation'
    | 'conditional_color_rule'
    | 'record';
  selector: string;
  targetId: string;
  via: 'explicit_id' | 'stable_key' | 'exact_name' | 'unique_property' | 'generated';
}

export interface DatabaseWriteGuardSnapshot {
  permissions: readonly {
    scopeId: string;
    policyId: string;
    policyRevision: string;
    capability?: 'write' | 'verification';
  }[];
  querySnapshots: readonly {
    queryId: string;
    snapshotRevision: string;
  }[];
}

export type ResolveDatabaseWriteGuards = (input: {
  definition: DatabaseDefinition;
  immutableTargetSet: readonly string[];
  operation: 'write' | 'verification';
}) => DatabaseWriteGuardSnapshot;

function deletionDesiredState(definition: DatabaseDefinition): DatabaseDesiredStateDraft {
  const sourcesById = new Map(definition.sources.map((source) => [source.id, source] as const));
  const sourceKey = (sourceId: string): string => {
    const source = sourcesById.get(sourceId);
    if (!source) throw new Error(`Deletion draft has unknown source "${sourceId}"`);
    return source.key;
  };
  const propertyKey = (propertyId: string): string => {
    for (const source of definition.sources) {
      const property = source.properties.find((candidate) => candidate.id === propertyId);
      if (property) return property.key;
    }
    throw new Error(`Deletion draft has unknown property "${propertyId}"`);
  };
  const viewKey = (viewId: string): string => {
    const view = definition.views.find((candidate) => candidate.id === viewId);
    if (!view) throw new Error(`Deletion draft has unknown view "${viewId}"`);
    return view.key;
  };
  const personKey = (personId: string): string => {
    const person = definition.people.find((candidate) => candidate.id === personId);
    if (!person) throw new Error(`Deletion draft has unknown person "${personId}"`);
    return person.key;
  };
  return DatabaseDesiredStateDraftSchema.parse({
    database: {
      id: definition.id,
      key: definition.key,
      name: definition.name,
      ...(definition.description ? { description: definition.description } : {}),
      ...(definition.icon ? { icon: definition.icon } : {}),
      ...(definition.cover ? { cover: definition.cover } : {}),
      aliases: definition.aliases,
      people: definition.people,
      contract: definition.contract,
    },
    sources: definition.sources,
    ...(definition.sourceMappings
      ? {
          sourceMappings: definition.sourceMappings.map((mapping) => ({
            sourceKey: sourceKey(mapping.sourceId),
            targetSourceKey: sourceKey(mapping.targetSourceId),
            propertyMappings: mapping.propertyMappings.map((property) => ({
              sourcePropertyKey: propertyKey(property.sourcePropertyId),
              targetPropertyKey: propertyKey(property.targetPropertyId),
              optionMappings: property.optionMappings.map((option) => ({
                sourceOptionKey: option.sourceOptionId,
                targetOptionKey: option.targetOptionId,
              })),
            })),
          })),
        }
      : {}),
    views: definition.views.map((view) => ({ ...view, sourceKey: sourceKey(view.sourceId) })),
    templates: definition.templates.map((template) => ({
      id: template.id,
      key: template.key,
      name: template.name,
      ...(template.description ? { description: template.description } : {}),
      sourceKey: sourceKey(template.sourceId),
      body: template.body,
      propertyValues: Object.fromEntries(
        Object.entries(template.propertyValues).map(([id, value]) => [propertyKey(id), value]),
      ),
      order: template.order,
      archivedAt: template.archivedAt,
      defaultFor: {
        source: template.defaultFor.source,
        viewKeys: template.defaultFor.viewIds.map(viewKey),
        entryPoints: template.defaultFor.entryPoints,
      },
      ...(template.repeat
        ? { repeat: { ...template.repeat, ownerKey: personKey(template.repeat.ownerId) } }
        : {}),
    })),
    buttons: definition.buttons.map((button) => ({
      id: button.id,
      key: button.key,
      name: button.name,
      ...(button.description ? { description: button.description } : {}),
      placement:
        button.placement.kind === 'database'
          ? { kind: 'database' as const }
          : { kind: 'source' as const, sourceKey: sourceKey(button.placement.sourceId) },
      ...(button.confirmation ? { confirmation: button.confirmation } : {}),
      actions: button.actions.map((action) => {
        if (action.kind !== 'create_record') {
          throw new Error(`Deletion draft cannot normalize button action "${action.kind}"`);
        }
        return {
          id: action.id,
          kind: action.kind,
          sourceKey: sourceKey(action.sourceId),
          values: Object.fromEntries(
            Object.entries(action.values).map(([id, value]) => [propertyKey(id), value]),
          ),
          body: action.body,
        };
      }),
    })),
    automations: definition.automations,
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 100_000 },
    sampleRecords: [],
    recordMutations: [],
    recordCopies: [],
    recordArchives: [],
    recordMoves: [],
    recordDeletions: [],
  });
}

type DatabaseNormalizedRecordMutationOperation =
  | { kind: 'set'; propertyId: string; value: unknown }
  | { kind: 'unset'; propertyId: string }
  | { kind: 'add' | 'remove'; propertyId: string; value: string }
  | { kind: 'increment'; propertyId: string; by: number }
  | { kind: 'append'; propertyId: string | null; value: string }
  | { kind: 'link' | 'unlink'; propertyId: string; recordId: string };

export interface DatabaseDraftArtifact {
  id: string;
  revision: string;
  createdAt: string;
  expiresAt: string;
  desiredState: DatabaseDesiredStateDraft;
  normalized: {
    definition: DatabaseDefinition;
    databaseDeletion?: true;
    uniquePropertyId: string | null;
    templates: DatabaseDesiredStateDraft['templates'];
    policy: DatabaseDesiredStateDraft['policy'];
    sampleRecords: readonly {
      id: string;
      sourceId: string;
      values: Readonly<Record<string, unknown>>;
      body: string;
      expectedRevision: string | null;
      archivedAt?: string | null;
      pageLayoutOverride?: DatabaseRecordPageLayoutOverride | null;
    }[];
    recordMutations: readonly {
      recordId: string;
      sourceId: string;
      operations: readonly DatabaseNormalizedRecordMutationOperation[];
    }[];
    recordCopies: readonly {
      sourceRecordId: string;
      expectedRevision: string;
      sourcePath: string;
      newRecordId: string;
    }[];
    recordArchives: readonly {
      recordId: string;
      action: 'archive' | 'restore';
      archivedAt: string | null;
    }[];
    recordMoves: readonly {
      recordId: string;
      expectedRevision: string;
      sourceId: string;
      targetSourceId: string;
      sourcePath: string;
      targetPath: string;
      values: Readonly<Record<string, unknown>>;
      body: string;
      archivedAt: string | null;
      pageLayoutOverride: null;
    }[];
    recordDeletions: readonly {
      recordId: string;
      sourceId: string;
      expectedRevision: string;
      path: string;
      values: Readonly<Record<string, unknown>>;
      body: string;
    }[];
    targetResolutions: readonly DatabaseTargetResolution[];
    verificationChange?: {
      sourceId: string;
      recordId: string;
      propertyId: string;
      action: 'verify' | 'renew' | 'unverify';
      actor: DatabaseRecordActor;
      value: DatabaseVerificationValue;
    };
  };
}

export interface DatabaseVerificationDraftResult {
  draft: DatabaseDraftArtifact;
  review: {
    action: 'verify' | 'renew' | 'unverify';
    databaseId: string;
    sourceId: string;
    recordId: string;
    propertyId: string;
    actor: DatabaseRecordActor;
    expectedRevision: string;
    verifiedAt: string | null;
    expiresAt: string | null;
    evidenceRevision: string | null;
    notePresent: boolean;
  };
}

type DatabaseConvergenceAction = 'create' | 'update' | 'noop';

export const DatabasePlanApprovalCodeSchema = z.enum([
  'create_database',
  'delete_database',
  'alter_schema',
  'autonomous_policy',
  'sample_record_write',
  'verification_change',
  'delete_record',
]);
export type DatabasePlanApprovalCode = z.infer<typeof DatabasePlanApprovalCodeSchema>;

export type DatabaseConflictDomain =
  | 'record_value'
  | 'schema'
  | 'option'
  | 'view'
  | 'formula'
  | 'relation'
  | 'automation';

export interface DatabasePlanConflict {
  code:
    | 'database_id_exists'
    | 'database_key_exists'
    | 'database_key_changed'
    | 'record_not_found'
    | 'record_scope_mismatch'
    | 'record_revision_required'
    | 'record_revision_changed'
    | 'record_path_occupied'
    | 'duplicate_record_target'
    | 'record_limit_exceeded'
    | 'relation_target_missing'
    | 'person_target_missing'
    | 'source_record_migration_required'
    | 'source_removal_blocked'
    | 'planning_io_unavailable'
    | 'sample_required_value_missing'
    | 'sample_value_invalid'
    | 'sample_unique_value_duplicate';
  message: string;
  targetId: string;
  propertyId?: string;
  sampleRecordId?: string;
}

export interface DatabasePlanArtifact {
  id: string;
  hash: string;
  draftId: string;
  draftRevision: string;
  snapshotRevision: string;
  createdAt: string;
  expiresAt: string;
  immutableTargetSet: readonly string[];
  writeGuards: DatabaseWriteGuardSnapshot;
  targetResolutions: readonly DatabaseTargetResolution[];
  verificationReview?: DatabaseVerificationDraftResult['review'];
  normalizedOperations: readonly (
    | {
        kind: 'ensure_database';
        databaseId: string;
        manifestPath: string;
        action: DatabaseConvergenceAction | 'delete';
      }
    | {
        kind: 'delete_database';
        databaseId: string;
        manifestPath: string;
        recordIds: readonly string[];
      }
    | {
        kind: 'ensure_property';
        sourceId: string;
        propertyId: string;
        action: DatabaseConvergenceAction;
      }
    | {
        kind: 'ensure_relation';
        sourceId: string;
        propertyId: string;
        targetSourceId: string;
        pairedPropertyId?: string;
        action: DatabaseConvergenceAction;
      }
    | {
        kind: 'ensure_view';
        sourceId: string;
        viewId: string;
        action: DatabaseConvergenceAction;
      }
    | {
        kind: 'alter_schema';
        databaseId: string;
        action: 'update' | 'noop';
        addedIds: readonly string[];
        updatedIds: readonly string[];
        removedIds: readonly string[];
      }
    | {
        kind: 'upsert_records';
        sourceId: string;
        recordIds: readonly string[];
        created: number;
        updated: number;
        unchanged: number;
      }
    | {
        kind: 'mutate_record';
        sourceId: string;
        recordId: string;
        operations: readonly DatabaseNormalizedRecordMutationOperation[];
      }
    | {
        kind: 'delete_records';
        sourceId: string;
        recordIds: readonly string[];
      }
    | {
        kind: 'duplicate_records';
        sourceId: string;
        copies: readonly { sourceRecordId: string; newRecordId: string }[];
      }
    | {
        kind: 'archive_records';
        sourceId: string;
        records: readonly {
          recordId: string;
          action: 'archive' | 'restore';
          archivedAt: string | null;
        }[];
      }
    | {
        kind: 'move_records';
        moves: readonly {
          recordId: string;
          sourceId: string;
          targetSourceId: string;
          sourcePath: string;
          targetPath: string;
        }[];
      }
  )[];
  affectedObjects: {
    databaseIds: readonly string[];
    sourceIds: readonly string[];
    propertyIds: readonly string[];
    viewIds: readonly string[];
    recordIds: readonly string[];
    automationIds?: readonly string[];
  };
  /** Exact user-facing areas that a fresh plan must reconcile after a concurrent change. */
  conflictDomains?: readonly DatabaseConflictDomain[];
  diff: {
    mode: 'exact';
    manifests: readonly {
      path: string;
      before: string | null;
      after: string | null;
      action: 'create' | 'update' | 'delete';
    }[];
    records: readonly {
      recordId: string;
      sourceId: string;
      path: string;
      action: 'create' | 'update' | 'delete' | 'move';
      beforeSourceId?: string;
      targetPath?: string;
      before: {
        revision: string;
        values: Readonly<Record<string, unknown>>;
        body: string;
        archivedAt?: string | null;
        pageLayoutOverride?: DatabaseRecordPageLayoutOverride | null;
      } | null;
      after: {
        values: Readonly<Record<string, unknown>>;
        body: string;
        archivedAt?: string | null;
        pageLayoutOverride?: DatabaseRecordPageLayoutOverride | null;
      } | null;
    }[];
    templates: DatabaseDesiredStateDraft['templates'];
    policy: DatabaseDesiredStateDraft['policy'];
  };
  risk: {
    level: 'low' | 'medium' | 'high';
    reasons: readonly string[];
  };
  conflicts: readonly DatabasePlanConflict[];
  approvals: readonly {
    code: DatabasePlanApprovalCode;
    required: boolean;
    reason: string;
  }[];
  postconditions: readonly {
    code:
      | 'manifest_valid'
      | 'database_absent'
      | 'records_absent'
      | 'stable_ids_unique'
      | 'stable_targets_resolved'
      | 'required_values'
      | 'unique_key'
      | 'relation_integrity'
      | 'verification_attribution';
    description: string;
  }[];
  committable: boolean;
  requiresCommit: boolean;
}

export type DatabasePlanErrorCode =
  | 'draft_not_found'
  | 'draft_expired'
  | 'plan_not_found'
  | 'plan_expired'
  | 'write_guard_unavailable'
  | 'snapshot_changed'
  | 'invalid_desired_state';

export class DatabasePlanError extends Error {
  readonly code: DatabasePlanErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabasePlanErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'DatabasePlanError';
    this.code = code;
    this.details = details;
  }
}

export interface CreateDatabasePlanEngineOptions {
  databaseStore: DatabaseStore;
  databaseRecordIndex?: DatabaseRecordIndex;
  projectDir?: string;
  contentDir?: string;
  readFile?: (absolutePath: string) => string;
  now?: () => Date;
  generateUuid?: () => string;
  resolveWriteGuards?: ResolveDatabaseWriteGuards;
}

const DatabaseWriteGuardSnapshotSchema = z
  .object({
    permissions: z
      .array(
        z
          .object({
            scopeId: z.string().min(1),
            policyId: z.string().min(1),
            policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            capability: z.enum(['write', 'verification']).optional(),
          })
          .strict(),
      )
      .min(1),
    querySnapshots: z.array(
      z
        .object({
          queryId: z.string().min(1),
          snapshotRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        })
        .strict(),
    ),
  })
  .strict();

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

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}

function compactUuid(generateUuid: () => string): string {
  return generateUuid().replaceAll('-', '');
}

function expiry(now: Date, ttlSeconds: number): string {
  return new Date(now.getTime() + ttlSeconds * 1_000).toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function errno(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function same(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

function databaseObjectMap(definition: DatabaseDefinition | null): Map<string, unknown> {
  const objects = new Map<string, unknown>();
  if (!definition) return objects;
  for (const person of definition.people) objects.set(person.id, person);
  for (const source of definition.sources) {
    objects.set(source.id, source);
    for (const property of source.properties) objects.set(property.id, property);
  }
  for (const view of definition.views) objects.set(view.id, view);
  for (const template of definition.templates) objects.set(template.id, template);
  for (const button of definition.buttons) objects.set(button.id, button);
  for (const automation of definition.automations) objects.set(automation.id, automation);
  return objects;
}

function propertyStorageShape(
  property: DatabaseDefinition['sources'][number]['properties'][number],
): unknown {
  return {
    id: property.id,
    key: property.key,
    type: property.type,
    required: property.required,
    constraints: property.semantics.constraints,
    defaultValue: property.semantics.defaultValue,
    ...(property.type === 'select' || property.type === 'status' || property.type === 'multi_select'
      ? {
          options: property.options
            .map((option) => ({ id: option.id, key: option.key }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        }
      : {}),
    ...(property.type === 'relation'
      ? {
          targetSourceId: property.targetSourceId,
          cardinality: property.cardinality,
          pairedPropertyId: property.pairedPropertyId,
        }
      : {}),
    ...(property.type === 'person' ? { multiple: property.multiple } : {}),
    ...(property.type === 'formula' ? { source: property.source, ast: property.ast } : {}),
    ...(property.type === 'rollup'
      ? {
          relationPropertyId: property.relationPropertyId,
          targetPropertyId: property.targetPropertyId,
          function: property.function,
          targetValueType: property.targetValueType,
          targetItemType: property.targetItemType,
        }
      : {}),
    ...(property.type === 'button'
      ? {
          label: property.label,
          confirmation: property.confirmation,
          actions: property.actions,
        }
      : {}),
    ...(property.type === 'unique_id' ? { storage: 'positive_integer' } : {}),
    ...(property.type === 'place' ? { storage: 'place_v1' } : {}),
  };
}

function optionStorageMatches(
  current: Extract<
    DatabaseDefinition['sources'][number]['properties'][number],
    { type: 'select' | 'status' | 'multi_select' }
  >,
  desired: Extract<
    DatabaseDefinition['sources'][number]['properties'][number],
    { type: 'select' | 'status' | 'multi_select' }
  >,
  optionId: string,
): boolean {
  const before = current.options.find((option) => option.id === optionId);
  const after = desired.options.find((option) => option.id === optionId);
  return Boolean(before && after && before.key === after.key);
}

function recordNeedsSourceRewrite(
  current: DatabaseDefinition['sources'][number],
  desired: DatabaseDefinition['sources'][number],
  values: Readonly<Record<string, unknown>>,
): boolean {
  if (
    current.folder !== desired.folder ||
    current.includeSubfolders !== desired.includeSubfolders
  ) {
    return true;
  }
  const desiredProperties = new Map(desired.properties.map((property) => [property.id, property]));
  for (const before of current.properties) {
    const value = values[before.id];
    const after = desiredProperties.get(before.id);
    if (!after) {
      if (value !== undefined) return true;
      continue;
    }
    if (same(propertyStorageShape(before), propertyStorageShape(after))) continue;
    if (value === undefined) {
      if (after.required) return true;
      continue;
    }
    if (
      before.type === 'select' &&
      after.type === 'select' &&
      typeof value === 'string' &&
      before.key === after.key &&
      same(before.semantics, after.semantics) &&
      optionStorageMatches(before, after, value)
    ) {
      continue;
    }
    if (
      before.type === 'status' &&
      after.type === 'status' &&
      typeof value === 'string' &&
      before.key === after.key &&
      same(before.semantics, after.semantics) &&
      optionStorageMatches(before, after, value)
    ) {
      continue;
    }
    if (
      before.type === 'multi_select' &&
      after.type === 'multi_select' &&
      Array.isArray(value) &&
      before.key === after.key &&
      same(before.semantics, after.semantics) &&
      value.every(
        (optionId) => typeof optionId === 'string' && optionStorageMatches(before, after, optionId),
      )
    ) {
      continue;
    }
    return true;
  }
  const currentIds = new Set(current.properties.map((property) => property.id));
  return desired.properties.some(
    (property) =>
      (property.required || property.type === 'unique_id') &&
      !currentIds.has(property.id) &&
      values[property.id] === undefined,
  );
}

function sourceNeedsRecordRewrite(
  current: DatabaseDefinition['sources'][number],
  desired: DatabaseDefinition['sources'][number],
): boolean {
  if (
    current.folder !== desired.folder ||
    current.includeSubfolders !== desired.includeSubfolders
  ) {
    return true;
  }
  const currentProperties = new Map(current.properties.map((property) => [property.id, property]));
  const desiredPropertyIds = new Set(desired.properties.map((property) => property.id));
  if (current.properties.some((property) => !desiredPropertyIds.has(property.id))) return true;
  return desired.properties.some((property) => {
    const before = currentProperties.get(property.id);
    if (!before) return property.required || property.type === 'unique_id';
    return !same(propertyStorageShape(before), propertyStorageShape(property));
  });
}

function recordNeedsPersonRewrite(
  current: DatabaseDefinition,
  desired: DatabaseDefinition,
  sourceId: string,
  values: Readonly<Record<string, unknown>>,
): boolean {
  const currentSource = current.sources.find((source) => source.id === sourceId);
  if (!currentSource) return false;
  const currentPeople = new Map(current.people.map((person) => [person.id, person.key] as const));
  const desiredPeople = new Map(desired.people.map((person) => [person.id, person.key] as const));
  for (const property of currentSource.properties) {
    if (property.type !== 'person') continue;
    const value = values[property.id];
    if (!Array.isArray(value)) continue;
    if (
      value.some(
        (personId) =>
          typeof personId === 'string' &&
          currentPeople.get(personId) !== desiredPeople.get(personId),
      )
    ) {
      return true;
    }
  }
  return false;
}

function filterWithPropertyIds(
  filter: unknown,
  propertyIds: ReadonlyMap<string, string>,
  propertiesById: ReadonlyMap<string, DatabaseDefinition['sources'][number]['properties'][number]>,
  people: readonly DatabasePerson[],
): DatabaseFilter {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    throw new Error('View filter must be an object');
  }
  const value = filter as Record<string, unknown>;
  if (Array.isArray(value.and)) {
    return {
      and: value.and.map((entry) =>
        filterWithPropertyIds(entry, propertyIds, propertiesById, people),
      ),
    };
  }
  if (Array.isArray(value.or)) {
    return {
      or: value.or.map((entry) =>
        filterWithPropertyIds(entry, propertyIds, propertiesById, people),
      ),
    };
  }
  if (value.not !== undefined) {
    return { not: filterWithPropertyIds(value.not, propertyIds, propertiesById, people) };
  }
  const explicitPropertyId = String(value.propertyId ?? '');
  const propertyKey = String(value.propertyKey ?? '');
  const propertyId = [...propertyIds.values()].includes(explicitPropertyId)
    ? explicitPropertyId
    : propertyIds.get(propertyKey);
  if (!propertyId) throw new Error(`Unknown view filter property key "${propertyKey}"`);
  const property = propertiesById.get(propertyId);
  if (!property) throw new Error(`Unknown view filter property ID "${propertyId}"`);
  const normalizeOptionReference = (entry: unknown): unknown => {
    if (property.type === 'person') {
      const person = findDatabasePersonByReference(people, entry);
      if (!person) throw new Error(`Unknown or ambiguous view filter person "${String(entry)}"`);
      return person.id;
    }
    if (
      property.type !== 'select' &&
      property.type !== 'status' &&
      property.type !== 'multi_select'
    ) {
      return entry;
    }
    const option = resolveOption(property, entry);
    if (!option) throw new Error(`Unknown view filter option "${String(entry)}"`);
    return option.id;
  };
  const filterValue = Array.isArray(value.value)
    ? value.value.map(normalizeOptionReference)
    : normalizeOptionReference(value.value);
  return {
    propertyId,
    operator: value.operator as 'eq',
    ...(value.operator === 'is_empty' || value.operator === 'is_not_empty'
      ? {}
      : { value: filterValue as string }),
  } as DatabaseFilter;
}

function resolveOption(
  property: Extract<
    DatabaseDefinition['sources'][number]['properties'][number],
    { type: 'select' | 'status' | 'multi_select' }
  >,
  value: unknown,
) {
  const stableMatch = property.options.find(
    (candidate) => candidate.id === value || candidate.key === value,
  );
  if (stableMatch) return stableMatch;
  const nameMatches = property.options.filter((candidate) => candidate.name === value);
  if (nameMatches.length > 1) {
    throw new Error(`ambiguous option name "${String(value)}"`);
  }
  return nameMatches[0];
}

function normalizeSampleValue(
  property: DatabaseDefinition['sources'][number]['properties'][number],
  value: unknown,
  people: readonly DatabasePerson[],
  options: { allowInactivePeople?: boolean } = {},
): unknown {
  const constrained = (candidate: unknown): unknown => {
    const issue = validateDatabasePropertyConstraints(property, candidate);
    if (issue) throw new Error(issue);
    return candidate;
  };
  switch (property.type) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      if (typeof value !== 'string') throw new Error('expected a string');
      return constrained(value);
    case 'date':
      try {
        return constrained(canonicalizeDatabaseDateValue(value));
      } catch {
        throw new Error('expected an ISO date/timestamp or canonical date range object');
      }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error('expected a number');
      return constrained(value);
    case 'checkbox':
      if (typeof value !== 'boolean') throw new Error('expected a boolean');
      return constrained(value);
    case 'select':
    case 'status': {
      const option = resolveOption(property, value);
      if (!option) throw new Error('expected a declared option key, name, or ID');
      if (option.archived === true) throw new Error(`option "${option.name}" is archived`);
      return constrained(option.id);
    }
    case 'multi_select': {
      if (!Array.isArray(value)) throw new Error('expected an array of option keys, names, or IDs');
      const normalized = value.map((entry) => {
        const option = resolveOption(property, entry);
        if (!option) throw new Error(`unknown option "${String(entry)}"`);
        if (option.archived === true) throw new Error(`option "${option.name}" is archived`);
        return option.id;
      });
      if (new Set(normalized).size !== normalized.length) throw new Error('duplicate option');
      return constrained(normalized);
    }
    case 'person': {
      if (!Array.isArray(value)) throw new Error('expected an array of person keys, names, or IDs');
      if (property.required && value.length === 0) throw new Error('expected at least one person');
      if (!property.multiple && value.length > 1) throw new Error('expected at most one person');
      const normalized = value.map((entry) => {
        const person = findDatabasePersonByReference(people, entry);
        if (!person) throw new Error(`unknown or ambiguous person "${String(entry)}"`);
        if (!person.active && options.allowInactivePeople !== true) {
          throw new Error(`person "${person.name}" is inactive`);
        }
        return person.id;
      });
      if (new Set(normalized).size !== normalized.length) throw new Error('duplicate person');
      return constrained(normalized);
    }
    case 'files': {
      const parsed = DatabaseFilesValueSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error('expected an ordered list of unique local asset or external URL objects');
      }
      if (property.required && parsed.data.length === 0) {
        throw new Error('expected at least one file');
      }
      return constrained(parsed.data);
    }
    case 'place':
      try {
        return constrained(canonicalizeDatabasePlaceValue(value));
      } catch {
        throw new Error(
          'expected a place object with label or address, lat, lon, precision, and source',
        );
      }
    case 'relation':
      if (property.cardinality === 'one') {
        if (!DatabaseRecordIdSchema.safeParse(value).success)
          throw new Error('expected a record ID');
        return constrained(value);
      }
      if (
        !Array.isArray(value) ||
        value.some((entry) => !DatabaseRecordIdSchema.safeParse(entry).success)
      ) {
        throw new Error('expected an array of record IDs');
      }
      if (property.required && value.length === 0) {
        throw new Error('expected at least one related record');
      }
      if (new Set(value).size !== value.length) throw new Error('duplicate related record');
      return constrained(value);
    case 'formula':
    case 'rollup':
    case 'created_time':
    case 'last_edited_time':
    case 'created_by':
    case 'last_edited_by':
    case 'verification':
    case 'button':
    case 'unique_id':
      throw new Error(`${property.type} properties are derived and read-only`);
  }
}

function applyRecordMutation(
  source: DatabaseDefinition['sources'][number],
  people: readonly DatabasePerson[],
  record: { values: Readonly<Record<string, unknown>>; body: string },
  mutation: DatabaseDesiredStateDraft['recordMutations'][number],
): {
  values: Readonly<Record<string, unknown>>;
  body: string;
  operations: readonly DatabaseNormalizedRecordMutationOperation[];
} {
  const values: Record<string, unknown> = structuredClone(record.values);
  let body = record.body;
  const normalized: DatabaseNormalizedRecordMutationOperation[] = [];
  const propertyFor = (key: string) => {
    const property = source.properties.find((candidate) => candidate.key === key);
    if (!property) throw new Error(`Record mutation has unknown property key "${key}"`);
    return property;
  };

  for (const operation of mutation.operations) {
    switch (operation.op) {
      case 'set': {
        const property = propertyFor(operation.propertyKey);
        const value = normalizeSampleValue(property, operation.value, people, {
          allowInactivePeople: property.type === 'person',
        });
        if (property.type === 'person' && Array.isArray(value)) {
          const current = values[property.id];
          const existing = new Set(Array.isArray(current) ? current.map(String) : []);
          const newlyAssignedInactive = value.find((personId) => {
            const person = people.find((candidate) => candidate.id === personId);
            return person?.active === false && !existing.has(personId);
          });
          if (newlyAssignedInactive) {
            const person = people.find((candidate) => candidate.id === newlyAssignedInactive);
            throw new Error(`person "${person?.name ?? newlyAssignedInactive}" is inactive`);
          }
        }
        values[property.id] = value;
        normalized.push({ kind: 'set', propertyId: property.id, value });
        break;
      }
      case 'unset': {
        const property = propertyFor(operation.propertyKey);
        if (property.required) {
          throw new Error(`Required property "${property.key}" cannot be unset`);
        }
        delete values[property.id];
        normalized.push({ kind: 'unset', propertyId: property.id });
        break;
      }
      case 'add':
      case 'remove': {
        const property = propertyFor(operation.propertyKey);
        if (
          property.type !== 'multi_select' &&
          property.type !== 'person' &&
          property.type !== 'files'
        ) {
          throw new Error(`${operation.op} requires a multi_select, person, or files property`);
        }
        if (property.type === 'files') {
          const current = values[property.id];
          const next = current === undefined ? [] : DatabaseFilesValueSchema.parse(current);
          let identity: string;
          let file: DatabaseFileValue | undefined;
          if (operation.op === 'add') {
            const normalized = DatabaseFilesValueSchema.parse([operation.value]);
            file = normalized[0];
            if (!file) throw new Error('add requires one valid file object');
            identity = databaseFileIdentity(file);
          } else if (typeof operation.value === 'string') {
            if (
              !isSafeDatabaseAssetPath(operation.value) &&
              !isSafeDatabaseExternalFileUrl(operation.value)
            ) {
              throw new Error('remove requires a safe local path or external URL');
            }
            identity = operation.value;
          } else {
            const normalized = DatabaseFilesValueSchema.parse([operation.value]);
            const target = normalized[0];
            if (!target) throw new Error('remove requires one valid file source');
            identity = databaseFileIdentity(target);
          }
          const existingIndex = next.findIndex(
            (candidate) => databaseFileIdentity(candidate) === identity,
          );
          if (operation.op === 'add' && existingIndex < 0 && file) next.push(file);
          if (operation.op === 'remove' && existingIndex >= 0) next.splice(existingIndex, 1);
          if (property.required && next.length === 0) {
            throw new Error(`Required property "${property.key}" cannot remove its last file`);
          }
          values[property.id] = next;
          normalized.push({ kind: operation.op, propertyId: property.id, value: identity });
          break;
        }
        const [optionId] = normalizeSampleValue(property, [operation.value], people, {
          allowInactivePeople: operation.op === 'remove',
        }) as string[];
        if (!optionId) throw new Error(`${operation.op} requires one declared option`);
        const current = values[property.id];
        if (current !== undefined && !Array.isArray(current)) {
          throw new Error(`Property "${property.key}" does not contain an option array`);
        }
        const next = Array.isArray(current) ? current.map(String) : [];
        if (operation.op === 'add') {
          if (!next.includes(optionId)) next.push(optionId);
        } else {
          const index = next.indexOf(optionId);
          if (index >= 0) next.splice(index, 1);
        }
        values[property.id] = next;
        normalized.push({ kind: operation.op, propertyId: property.id, value: optionId });
        break;
      }
      case 'increment': {
        const property = propertyFor(operation.propertyKey);
        if (property.type !== 'number') throw new Error('increment requires a number property');
        const current = values[property.id];
        if (typeof current !== 'number' || !Number.isFinite(current)) {
          throw new Error(`Property "${property.key}" has no finite number to increment`);
        }
        const next = current + operation.by;
        if (!Number.isFinite(next)) throw new Error('increment result is not finite');
        values[property.id] = next;
        normalized.push({ kind: 'increment', propertyId: property.id, by: operation.by });
        break;
      }
      case 'append': {
        if (!operation.propertyKey) {
          body += operation.value;
          normalized.push({ kind: 'append', propertyId: null, value: operation.value });
          break;
        }
        const property = propertyFor(operation.propertyKey);
        if (property.type !== 'text' && property.type !== 'title') {
          throw new Error(
            'append requires a text/title property or an omitted propertyKey for body',
          );
        }
        const current = values[property.id];
        if (current !== undefined && typeof current !== 'string') {
          throw new Error(`Property "${property.key}" does not contain text`);
        }
        values[property.id] = `${current ?? ''}${operation.value}`;
        normalized.push({
          kind: 'append',
          propertyId: property.id,
          value: operation.value,
        });
        break;
      }
      case 'link':
      case 'unlink': {
        const property = propertyFor(operation.propertyKey);
        if (property.type !== 'relation') {
          throw new Error(`${operation.op} requires a relation property`);
        }
        if (property.cardinality === 'one') {
          if (operation.op === 'link') {
            values[property.id] = operation.recordId;
          } else if (values[property.id] === operation.recordId) {
            if (property.required) {
              throw new Error(`Required relation "${property.key}" cannot be unlinked`);
            }
            delete values[property.id];
          }
        } else {
          const current = values[property.id];
          if (current !== undefined && !Array.isArray(current)) {
            throw new Error(`Relation "${property.key}" does not contain a record-ID array`);
          }
          const next = Array.isArray(current) ? current.map(String) : [];
          if (operation.op === 'link') {
            if (!next.includes(operation.recordId)) next.push(operation.recordId);
          } else {
            const index = next.indexOf(operation.recordId);
            if (index >= 0) next.splice(index, 1);
          }
          if (property.required && next.length === 0) {
            throw new Error(`Required relation "${property.key}" cannot be empty`);
          }
          values[property.id] = next;
        }
        normalized.push({
          kind: operation.op,
          propertyId: property.id,
          recordId: operation.recordId,
        });
        break;
      }
    }
  }
  for (const property of source.properties) {
    if (
      property.type === 'formula' ||
      property.type === 'rollup' ||
      property.type === 'created_time' ||
      property.type === 'last_edited_time' ||
      property.type === 'created_by' ||
      property.type === 'last_edited_by' ||
      property.type === 'verification' ||
      property.type === 'button' ||
      property.type === 'unique_id'
    ) {
      continue;
    }
    if (property.required && values[property.id] === undefined) {
      throw new Error(`Record mutation leaves required property "${property.key}" unset`);
    }
    if (values[property.id] !== undefined) {
      values[property.id] = normalizeSampleValue(property, values[property.id], people, {
        allowInactivePeople: true,
      });
    }
  }
  return { values, body, operations: normalized };
}

type DatabaseRelationProperty = Extract<
  DatabaseDefinition['sources'][number]['properties'][number],
  { type: 'relation' }
>;

interface MutableNormalizedSampleRecord {
  id: string;
  sourceId: string;
  values: Record<string, unknown>;
  body: string;
  expectedRevision: string | null;
  archivedAt?: string | null;
  pageLayoutOverride?: DatabaseRecordPageLayoutOverride | null;
}

function relationIds(property: DatabaseRelationProperty, value: unknown): string[] {
  if (value === undefined) return [];
  return property.cardinality === 'many' && Array.isArray(value)
    ? value.map(String)
    : [String(value)];
}

function reconcilePairedRelationSamples(
  definition: DatabaseDefinition,
  currentDefinition: DatabaseDefinition | null,
  initialSamples: readonly MutableNormalizedSampleRecord[],
  getIndexedRecord: (recordId: string) => {
    id: string;
    databaseId: string;
    sourceId: string;
    values: Readonly<Record<string, unknown>>;
    body: string;
    revision?: string | null;
    archivedAt?: string | null;
    pageLayoutOverride?: DatabaseRecordPageLayoutOverride;
  } | null,
): {
  samples: MutableNormalizedSampleRecord[];
  inverseMutations: Array<{
    recordId: string;
    sourceId: string;
    operations: DatabaseNormalizedRecordMutationOperation[];
  }>;
} {
  const samples = initialSamples.map((sample) => ({
    ...sample,
    values: structuredClone(sample.values),
  }));
  const explicitSampleIds = new Set(samples.map((sample) => sample.id));
  if (explicitSampleIds.size !== samples.length) return { samples, inverseMutations: [] };
  const initialValues = new Map(
    samples.map((sample) => [sample.id, structuredClone(sample.values)] as const),
  );
  const sampleById = new Map(samples.map((sample) => [sample.id, sample] as const));
  const sourceById = new Map(definition.sources.map((source) => [source.id, source] as const));
  const currentPropertyById = new Map(
    (currentDefinition?.sources ?? []).flatMap((source) =>
      source.properties.map((property) => [property.id, property] as const),
    ),
  );
  const propertyById = new Map(
    definition.sources.flatMap((source) =>
      source.properties.map((property) => [property.id, property] as const),
    ),
  );
  const inverseOperations = new Map<string, DatabaseNormalizedRecordMutationOperation[]>();

  const ensureSample = (recordId: string, sourceId: string): MutableNormalizedSampleRecord => {
    const planned = sampleById.get(recordId);
    if (planned) {
      if (planned.sourceId !== sourceId) {
        throw new Error(`Paired relation target "${recordId}" belongs to the wrong source`);
      }
      return planned;
    }
    const indexed = getIndexedRecord(recordId);
    if (
      !indexed ||
      indexed.databaseId !== definition.id ||
      indexed.sourceId !== sourceId ||
      !indexed.revision
    ) {
      throw new Error(
        `Paired relation target "${recordId}" must resolve to a revision-bound record in source "${sourceId}"`,
      );
    }
    const synthesized: MutableNormalizedSampleRecord = {
      id: indexed.id,
      sourceId: indexed.sourceId,
      values: structuredClone(indexed.values),
      body: indexed.body,
      expectedRevision: indexed.revision,
      archivedAt: indexed.archivedAt ?? null,
      ...(indexed.pageLayoutOverride
        ? { pageLayoutOverride: structuredClone(indexed.pageLayoutOverride) }
        : {}),
    };
    samples.push(synthesized);
    sampleById.set(recordId, synthesized);
    return synthesized;
  };

  type EdgeAction = {
    action: 'add' | 'remove';
    property: DatabaseRelationProperty;
    recordId: string;
    targetId: string;
  };
  const pending: EdgeAction[] = [];
  const actionByEdge = new Map<string, EdgeAction['action']>();
  const edgeKey = (
    property: DatabaseRelationProperty,
    recordId: string,
    targetId: string,
  ): string => {
    if (!property.pairedPropertyId) throw new Error('Paired relation metadata is missing');
    return property.id.localeCompare(property.pairedPropertyId) < 0
      ? `${property.id}:${recordId}|${property.pairedPropertyId}:${targetId}`
      : `${property.pairedPropertyId}:${targetId}|${property.id}:${recordId}`;
  };
  const enqueue = (edge: EdgeAction): void => {
    const key = edgeKey(edge.property, edge.recordId, edge.targetId);
    const current = actionByEdge.get(key);
    if (current && current !== edge.action) {
      throw new Error(`Paired relation edge "${key}" has contradictory requested changes`);
    }
    if (current) return;
    actionByEdge.set(key, edge.action);
    pending.push(edge);
  };

  for (const sample of samples) {
    const source = sourceById.get(sample.sourceId);
    const indexed = getIndexedRecord(sample.id);
    if (!source) continue;
    for (const property of source.properties) {
      if (property.type !== 'relation' || !property.pairedPropertyId) continue;
      const currentProperty = currentPropertyById.get(property.id);
      const before = new Set(
        indexed?.sourceId === sample.sourceId &&
          currentProperty?.type === 'relation' &&
          currentProperty.pairedPropertyId === property.pairedPropertyId
          ? relationIds(property, indexed.values[property.id])
          : [],
      );
      const after = new Set(relationIds(property, sample.values[property.id]));
      for (const targetId of before) {
        if (!after.has(targetId))
          enqueue({ action: 'remove', property, recordId: sample.id, targetId });
      }
      for (const targetId of after) {
        if (!before.has(targetId))
          enqueue({ action: 'add', property, recordId: sample.id, targetId });
      }
    }
  }

  const recordInverse = (
    sample: MutableNormalizedSampleRecord,
    operation: DatabaseNormalizedRecordMutationOperation,
  ): void => {
    const operations = inverseOperations.get(sample.id) ?? [];
    if (
      !operations.some(
        (candidate) =>
          candidate.kind === operation.kind &&
          'propertyId' in candidate &&
          'propertyId' in operation &&
          candidate.propertyId === operation.propertyId &&
          'recordId' in candidate &&
          'recordId' in operation &&
          candidate.recordId === operation.recordId,
      )
    ) {
      operations.push(operation);
      inverseOperations.set(sample.id, operations);
    }
  };
  const mutateMembership = (
    sample: MutableNormalizedSampleRecord,
    property: DatabaseRelationProperty,
    relatedRecordId: string,
    present: boolean,
  ): void => {
    const explicitlyPreserves = (): boolean => {
      const desired = initialValues.get(sample.id);
      return Boolean(
        explicitSampleIds.has(sample.id) &&
          desired &&
          relationIds(property, desired[property.id]).includes(relatedRecordId),
      );
    };
    if (property.cardinality === 'one') {
      const current = relationIds(property, sample.values[property.id])[0];
      if (present) {
        if (current && current !== relatedRecordId) {
          const explicitlyDesired = initialValues.get(sample.id);
          if (
            explicitSampleIds.has(sample.id) &&
            explicitlyDesired &&
            relationIds(property, explicitlyDesired[property.id])[0] === current
          ) {
            throw new Error(
              `Paired relation "${property.id}" on record "${sample.id}" explicitly preserves "${current}" and cannot also link "${relatedRecordId}"`,
            );
          }
          enqueue({
            action: 'remove',
            property,
            recordId: sample.id,
            targetId: current,
          });
        }
        sample.values[property.id] = relatedRecordId;
      } else if (current === relatedRecordId) {
        if (explicitlyPreserves()) {
          throw new Error(
            `Paired relation "${property.id}" on record "${sample.id}" explicitly preserves "${relatedRecordId}" and cannot unlink it`,
          );
        }
        delete sample.values[property.id];
      }
      return;
    }
    const next = relationIds(property, sample.values[property.id]);
    const index = next.indexOf(relatedRecordId);
    if (present && index < 0) next.push(relatedRecordId);
    if (!present && index >= 0) {
      if (explicitlyPreserves()) {
        throw new Error(
          `Paired relation "${property.id}" on record "${sample.id}" explicitly preserves "${relatedRecordId}" and cannot unlink it`,
        );
      }
      next.splice(index, 1);
    }
    sample.values[property.id] = next;
  };

  for (let index = 0; index < pending.length; index += 1) {
    const edge = pending[index];
    if (!edge?.property.pairedPropertyId) continue;
    const pairedProperty = propertyById.get(edge.property.pairedPropertyId);
    if (!pairedProperty || pairedProperty.type !== 'relation') {
      throw new Error(`Paired relation property "${edge.property.pairedPropertyId}" is missing`);
    }
    const sourceRecord = ensureSample(edge.recordId, pairedProperty.targetSourceId);
    const targetRecord = ensureSample(edge.targetId, edge.property.targetSourceId);
    const present = edge.action === 'add';
    mutateMembership(sourceRecord, edge.property, targetRecord.id, present);
    mutateMembership(targetRecord, pairedProperty, sourceRecord.id, present);
    recordInverse(targetRecord, {
      kind: present ? 'link' : 'unlink',
      propertyId: pairedProperty.id,
      recordId: sourceRecord.id,
    });
  }

  for (const sample of samples) {
    const source = sourceById.get(sample.sourceId);
    if (!source) continue;
    for (const property of source.properties) {
      if (property.type !== 'relation' || !property.pairedPropertyId) continue;
      const value = sample.values[property.id];
      if (value === undefined) {
        if (property.required) {
          throw new Error(
            `Paired relation update leaves required property "${property.key}" unset`,
          );
        }
        continue;
      }
      sample.values[property.id] = normalizeSampleValue(property, value, definition.people, {
        allowInactivePeople: true,
      });
    }
  }

  return {
    samples,
    inverseMutations: [...inverseOperations.entries()].map(([recordId, operations]) => {
      const sample = sampleById.get(recordId);
      if (!sample) throw new Error(`Paired relation sample "${recordId}" is missing`);
      return { recordId, sourceId: sample.sourceId, operations };
    }),
  };
}

export class DatabasePlanEngine {
  readonly #databaseStore: DatabaseStore;
  readonly #databaseRecordIndex?: DatabaseRecordIndex;
  readonly #projectDir?: string;
  readonly #contentDir?: string;
  readonly #readFile: (absolutePath: string) => string;
  readonly #now: () => Date;
  readonly #generateUuid: () => string;
  readonly #resolveWriteGuards: ResolveDatabaseWriteGuards;
  readonly #drafts = new Map<string, DatabaseDraftArtifact>();
  readonly #plans = new Map<string, DatabasePlanArtifact>();

  constructor(options: CreateDatabasePlanEngineOptions) {
    this.#databaseStore = options.databaseStore;
    this.#databaseRecordIndex = options.databaseRecordIndex;
    this.#projectDir = options.projectDir === undefined ? undefined : resolve(options.projectDir);
    this.#contentDir = options.contentDir === undefined ? undefined : resolve(options.contentDir);
    this.#readFile = options.readFile ?? ((path) => readFileSync(path, 'utf8'));
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
    this.#resolveWriteGuards =
      options.resolveWriteGuards ??
      (({ definition, immutableTargetSet, operation }) => ({
        permissions: [
          {
            scopeId:
              operation === 'verification'
                ? (immutableTargetSet.find((target) => target.startsWith('ds_')) ?? definition.id)
                : definition.id,
            policyId: operation === 'verification' ? 'project-owner-verification' : 'project-owner',
            policyRevision: hash(`synapsenote:database-${operation}-access:project-owner:v1`),
            ...(operation === 'verification' ? { capability: 'verification' as const } : {}),
          },
        ],
        querySnapshots: [],
      }));
  }

  captureWriteGuards(
    draftId: string,
    immutableTargetSet: readonly string[],
  ): DatabaseWriteGuardSnapshot {
    const draft = this.getDraft(draftId);
    const operation = draft.normalized.verificationChange ? 'verification' : 'write';
    try {
      const parsed = DatabaseWriteGuardSnapshotSchema.parse(
        this.#resolveWriteGuards({
          definition: clone(draft.normalized.definition),
          immutableTargetSet: [...immutableTargetSet],
          operation,
        }),
      );
      const permissions = [...parsed.permissions].sort(
        (left, right) =>
          left.scopeId.localeCompare(right.scopeId) || left.policyId.localeCompare(right.policyId),
      );
      const querySnapshots = [...parsed.querySnapshots].sort((left, right) =>
        left.queryId.localeCompare(right.queryId),
      );
      if (new Set(permissions.map((guard) => guard.scopeId)).size !== permissions.length) {
        throw new Error('Write permission guards contain a duplicate scopeId');
      }
      if (new Set(querySnapshots.map((guard) => guard.queryId)).size !== querySnapshots.length) {
        throw new Error('Write query guards contain a duplicate queryId');
      }
      if (
        operation === 'verification' &&
        !permissions.some(
          (guard) =>
            guard.capability === 'verification' &&
            guard.scopeId === draft.normalized.verificationChange?.sourceId,
        )
      ) {
        throw new Error(
          'Verification changes require an explicit source-scoped verification permission guard',
        );
      }
      return { permissions, querySnapshots };
    } catch (error) {
      throw new DatabasePlanError(
        'write_guard_unavailable',
        'Write concurrency guards could not be resolved safely',
        { reason: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  createDraft(input: unknown, ttlSeconds = 1_800): DatabaseDraftArtifact {
    const ttl = Math.min(86_400, Math.max(60, Math.trunc(ttlSeconds)));
    const parsed = DatabaseDesiredStateDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new DatabasePlanError('invalid_desired_state', 'Desired database state is invalid', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    let normalized: DatabaseDraftArtifact['normalized'];
    try {
      normalized = this.#normalize(parsed.data);
    } catch (error) {
      throw new DatabasePlanError('invalid_desired_state', 'Desired database state is invalid', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    const now = this.#now();
    const id = `draft_${compactUuid(this.#generateUuid)}`;
    const artifact: DatabaseDraftArtifact = {
      id,
      revision: hash({ desiredState: parsed.data, normalized }),
      createdAt: now.toISOString(),
      expiresAt: expiry(now, ttl),
      desiredState: parsed.data,
      normalized,
    };
    this.#drafts.set(id, clone(artifact));
    return clone(artifact);
  }

  createDatabaseDeletionDraft(
    databaseId: string,
    expectedSnapshotRevision: string,
    ttlSeconds = 1_800,
  ): DatabaseDraftArtifact {
    const snapshot = this.#databaseStore.snapshot();
    if (snapshot.revision !== expectedSnapshotRevision) {
      throw new DatabasePlanError(
        'snapshot_changed',
        'Database catalog changed before deletion planning',
        { expectedSnapshotRevision, observedSnapshotRevision: snapshot.revision },
      );
    }
    const definition = snapshot.databases.find((candidate) => candidate.id === databaseId);
    if (!definition) {
      throw new DatabasePlanError(
        'invalid_desired_state',
        `Database "${databaseId}" was not found`,
        {
          databaseId,
        },
      );
    }
    if (!this.#databaseRecordIndex) {
      throw new DatabasePlanError(
        'write_guard_unavailable',
        'Database deletion requires a complete canonical record index',
        { databaseId },
      );
    }
    const records = this.#databaseRecordIndex.list(databaseId);
    if (records.length > 100_000) {
      throw new DatabasePlanError(
        'invalid_desired_state',
        'Database deletion exceeds the bounded 100,000-record transaction limit',
        { databaseId, records: records.length, limit: 100_000 },
      );
    }
    const incomplete = records.find((record) => !record.revision);
    if (incomplete) {
      throw new DatabasePlanError(
        'write_guard_unavailable',
        'Database deletion requires exact revisions for every canonical record',
        { databaseId, recordId: incomplete.id },
      );
    }
    const desiredState = deletionDesiredState(definition);
    const targetResolutions: DatabaseTargetResolution[] = [
      { kind: 'database', selector: 'database.id', targetId: definition.id, via: 'explicit_id' },
      ...definition.sources.map((source) => ({
        kind: 'source' as const,
        selector: `sources.${source.key}`,
        targetId: source.id,
        via: 'explicit_id' as const,
      })),
      ...definition.sources.flatMap((source) =>
        source.properties.map((property) => ({
          kind: 'property' as const,
          selector: `sources.${source.key}.properties.${property.key}`,
          targetId: property.id,
          via: 'explicit_id' as const,
        })),
      ),
      ...definition.views.map((view) => ({
        kind: 'view' as const,
        selector: `views.${view.key}`,
        targetId: view.id,
        via: 'explicit_id' as const,
      })),
      ...definition.templates.map((template) => ({
        kind: 'template' as const,
        selector: `templates.${template.key}`,
        targetId: template.id,
        via: 'explicit_id' as const,
      })),
      ...definition.buttons.map((button) => ({
        kind: 'action_button' as const,
        selector: `buttons.${button.key}`,
        targetId: button.id,
        via: 'explicit_id' as const,
      })),
      ...definition.automations.map((automation) => ({
        kind: 'automation' as const,
        selector: `automations.${automation.key}`,
        targetId: automation.id,
        via: 'explicit_id' as const,
      })),
      ...records.map((record) => ({
        kind: 'record' as const,
        selector: `records.${record.id}`,
        targetId: record.id,
        via: 'explicit_id' as const,
      })),
    ];
    const normalized: DatabaseDraftArtifact['normalized'] = {
      definition: clone(definition),
      databaseDeletion: true,
      uniquePropertyId: null,
      templates: clone(desiredState.templates),
      policy: clone(desiredState.policy),
      sampleRecords: [],
      recordMutations: [],
      recordCopies: [],
      recordArchives: [],
      recordMoves: [],
      recordDeletions: records.map((record) => ({
        recordId: record.id,
        sourceId: record.sourceId,
        expectedRevision: record.revision as string,
        path: record.path,
        values: clone(record.values),
        body: record.body,
      })),
      targetResolutions,
    };
    const now = this.#now();
    const ttl = Math.min(86_400, Math.max(60, Math.trunc(ttlSeconds)));
    const id = `draft_${compactUuid(this.#generateUuid)}`;
    const artifact: DatabaseDraftArtifact = {
      id,
      revision: hash({ desiredState, normalized }),
      createdAt: now.toISOString(),
      expiresAt: expiry(now, ttl),
      desiredState,
      normalized,
    };
    this.#drafts.set(id, clone(artifact));
    return clone(artifact);
  }

  createVerificationDraft(
    lifecycleInput: unknown,
    authenticatedActor: unknown,
    ttlSeconds = 1_800,
  ): DatabaseVerificationDraftResult {
    const lifecycle = DatabaseVerificationLifecycleInputSchema.parse(lifecycleInput);
    const actor = DatabaseRecordActorSchema.parse(authenticatedActor);
    if (actor.kind === 'filesystem' || actor.kind === 'system') {
      throw new DatabasePlanError(
        'invalid_desired_state',
        'Verification requires an authenticated human, agent, or sync principal',
      );
    }
    const definition = this.#databaseStore.getById(lifecycle.databaseId);
    if (!definition) {
      throw new DatabasePlanError('invalid_desired_state', 'Verification database was not found');
    }
    const source = definition.sources.find((candidate) => candidate.id === lifecycle.sourceId);
    const property = source?.properties.find((candidate) => candidate.id === lifecycle.propertyId);
    const record = this.#databaseRecordIndex?.getById(lifecycle.recordId);
    if (!source || !property || property.type !== 'verification') {
      throw new DatabasePlanError(
        'invalid_desired_state',
        'Verification target is not an opt-in Verification property',
      );
    }
    if (!record || record.databaseId !== definition.id || record.sourceId !== source.id) {
      throw new DatabasePlanError(
        'invalid_desired_state',
        'Verification record was not found in the requested source',
      );
    }
    if (record.revision !== lifecycle.expectedRevision) {
      throw new DatabasePlanError(
        'invalid_desired_state',
        'Verification requires the exact current record revision',
        { expectedRevision: lifecycle.expectedRevision, observedRevision: record.revision },
      );
    }
    if ('expiresAt' in lifecycle && lifecycle.expiresAt && !property.allowExpiry) {
      throw new DatabasePlanError(
        'invalid_desired_state',
        'This Verification property does not allow expiry',
      );
    }
    if (
      lifecycle.action !== 'unverify' &&
      property.requireEvidenceRevision &&
      !lifecycle.evidenceRevision
    ) {
      throw new DatabasePlanError(
        'invalid_desired_state',
        'This Verification property requires an evidence revision',
      );
    }
    const current = DatabaseVerificationValueSchema.safeParse(record.values[property.id]);
    if (lifecycle.action === 'renew' && (!current.success || current.data.state !== 'verified')) {
      throw new DatabasePlanError(
        'invalid_desired_state',
        'Only an existing verified value can be renewed',
      );
    }
    const now = this.#now();
    const value = DatabaseVerificationValueSchema.parse(
      lifecycle.action === 'unverify'
        ? { state: 'unverified', ...(lifecycle.note ? { note: lifecycle.note } : {}) }
        : {
            state: 'verified',
            verifiedAt: now.toISOString(),
            verifiedBy: actor,
            ...(lifecycle.expiresAt ? { expiresAt: lifecycle.expiresAt } : {}),
            ...(lifecycle.evidenceRevision ? { evidenceRevision: lifecycle.evidenceRevision } : {}),
            ...(lifecycle.note ? { note: lifecycle.note } : {}),
          },
    );
    const policy = { mode: 'review' as const, allowedOperations: [], maxRecordsPerCommit: 1 };
    const desiredState = {
      database: {
        id: definition.id,
        key: definition.key,
        name: definition.name,
        ...(definition.icon ? { icon: definition.icon } : {}),
        ...(definition.cover ? { cover: definition.cover } : {}),
        contract: structuredClone(definition.contract),
      },
      sources: [],
      views: [],
      templates: [],
      buttons: [],
      policy,
      sampleRecords: [],
      recordMutations: [],
      recordCopies: [],
      recordArchives: [],
      recordMoves: [],
      recordDeletions: [],
    } as DatabaseDesiredStateDraft;
    const normalized: DatabaseDraftArtifact['normalized'] = {
      definition: clone(definition),
      uniquePropertyId:
        source.properties.find((candidate) => candidate.semantics.constraints.unique)?.id ?? null,
      templates: [],
      policy,
      sampleRecords: [
        {
          id: record.id,
          sourceId: source.id,
          values: { ...structuredClone(record.values), [property.id]: value },
          body: record.body,
          expectedRevision: lifecycle.expectedRevision,
          archivedAt: record.archivedAt ?? null,
          ...(record.pageLayoutOverride
            ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
            : {}),
        },
      ],
      recordMutations: [
        {
          recordId: record.id,
          sourceId: source.id,
          operations: [{ kind: 'set', propertyId: property.id, value }],
        },
      ],
      recordCopies: [],
      recordArchives: [],
      recordMoves: [],
      recordDeletions: [],
      targetResolutions: [
        {
          kind: 'property',
          selector: 'verification.propertyId',
          targetId: property.id,
          via: 'explicit_id',
        },
        {
          kind: 'record',
          selector: 'verification.recordId',
          targetId: record.id,
          via: 'explicit_id',
        },
      ],
      verificationChange: {
        sourceId: source.id,
        recordId: record.id,
        propertyId: property.id,
        action: lifecycle.action,
        actor,
        value,
      },
    };
    const ttl = Math.min(86_400, Math.max(60, Math.trunc(ttlSeconds)));
    const id = `draft_${compactUuid(this.#generateUuid)}`;
    const artifact: DatabaseDraftArtifact = {
      id,
      revision: hash({ desiredState, normalized }),
      createdAt: now.toISOString(),
      expiresAt: expiry(now, ttl),
      desiredState,
      normalized,
    };
    this.#drafts.set(id, clone(artifact));
    return {
      draft: clone(artifact),
      review: {
        action: lifecycle.action,
        databaseId: definition.id,
        sourceId: source.id,
        recordId: record.id,
        propertyId: property.id,
        actor: clone(actor),
        expectedRevision: lifecycle.expectedRevision,
        verifiedAt: value.state === 'verified' ? value.verifiedAt : null,
        expiresAt: value.state === 'verified' ? (value.expiresAt ?? null) : null,
        evidenceRevision: value.state === 'verified' ? (value.evidenceRevision ?? null) : null,
        notePresent: value.note !== undefined,
      },
    };
  }

  getDraft(id: string): DatabaseDraftArtifact {
    const draft = this.#drafts.get(id);
    if (!draft)
      throw new DatabasePlanError('draft_not_found', `Draft "${id}" was not found`, { id });
    if (Date.parse(draft.expiresAt) <= this.#now().getTime()) {
      this.#drafts.delete(id);
      throw new DatabasePlanError('draft_expired', `Draft "${id}" has expired`, {
        id,
        expiredAt: draft.expiresAt,
      });
    }
    return clone(draft);
  }

  /** Restore an exact durable draft after a server process restart. */
  restoreDraft(draft: DatabaseDraftArtifact): void {
    this.#drafts.set(draft.id, clone(draft));
  }

  discardDraft(id: string): { discarded: boolean; draftId: string } {
    return { discarded: this.#drafts.delete(id), draftId: id };
  }

  createPlan(draftId: string, ttlSeconds = 900): DatabasePlanArtifact {
    const draft = this.getDraft(draftId);
    const snapshot = this.#databaseStore.snapshot();
    const ttl = Math.min(3_600, Math.max(60, Math.trunc(ttlSeconds)));
    const now = this.#now();
    const expiresAt = new Date(
      Math.min(now.getTime() + ttl * 1_000, Date.parse(draft.expiresAt)),
    ).toISOString();
    const definition = draft.normalized.definition;
    if (draft.normalized.databaseDeletion) {
      return this.#createDatabaseDeletionPlan(draft, snapshot, now, expiresAt);
    }
    const conflicts: DatabasePlanConflict[] = [];
    const byId = snapshot.databases.find((candidate) => candidate.id === definition.id) ?? null;
    const byKey = snapshot.databases.find((candidate) => candidate.key === definition.key);
    if (byId && byId.key !== definition.key) {
      conflicts.push({
        code: 'database_key_changed',
        message: `Stable database key cannot change from "${byId.key}" to "${definition.key}"`,
        targetId: definition.id,
      });
    }
    if (byKey && byKey.id !== definition.id) {
      conflicts.push({
        code: 'database_key_exists',
        message: `Database key "${definition.key}" belongs to another stable database ID`,
        targetId: byKey.id,
      });
    }

    const manifestPath = `.ok/databases/${definition.key}.yml`;
    const manifestAction: DatabaseConvergenceAction = byId
      ? same(byId, definition)
        ? 'noop'
        : 'update'
      : 'create';
    const manifestDiff: DatabasePlanArtifact['diff']['manifests'][number][] = [];
    if (manifestAction === 'create') {
      manifestDiff.push({
        path: manifestPath,
        before: null,
        after: serializeDatabaseManifestYaml(definition),
        action: 'create',
      });
    } else if (manifestAction === 'update') {
      if (!this.#projectDir) {
        conflicts.push({
          code: 'planning_io_unavailable',
          message: 'Updating a manifest requires a project-scoped exact file reader',
          targetId: definition.id,
        });
      } else {
        try {
          const before = this.#readFile(resolve(this.#projectDir, manifestPath));
          manifestDiff.push({
            path: manifestPath,
            before,
            after: updateDatabaseManifestYaml(before, definition),
            action: 'update',
          });
        } catch {
          conflicts.push({
            code: 'planning_io_unavailable',
            message: `Canonical manifest "${manifestPath}" could not be read for an exact update`,
            targetId: definition.id,
          });
        }
      }
    }

    const currentObjects = databaseObjectMap(byId);
    const desiredObjects = databaseObjectMap(definition);
    const actionFor = (id: string, value: unknown): DatabaseConvergenceAction => {
      const current = currentObjects.get(id);
      return current === undefined ? 'create' : same(current, value) ? 'noop' : 'update';
    };
    const propertyAction = (
      sourceId: string,
      property: DatabaseDefinition['sources'][number]['properties'][number],
    ): DatabaseConvergenceAction => {
      const currentSource = byId?.sources.find((source) =>
        source.properties.some((candidate) => candidate.id === property.id),
      );
      if (!currentSource) return 'create';
      const current = currentSource.properties.find((candidate) => candidate.id === property.id);
      return currentSource.id !== sourceId || !same(current, property) ? 'update' : 'noop';
    };

    const seenRecordIds = new Set<string>();
    const totalRecordTargets =
      draft.normalized.sampleRecords.length +
      draft.normalized.recordDeletions.length +
      draft.normalized.recordMoves.length;
    if (totalRecordTargets > draft.normalized.policy.maxRecordsPerCommit) {
      conflicts.push({
        code: 'record_limit_exceeded',
        message: `Desired state includes ${totalRecordTargets} record target(s), exceeding the policy limit of ${draft.normalized.policy.maxRecordsPerCommit}`,
        targetId: definition.id,
      });
    }
    const deletionIds = new Set(
      draft.normalized.recordDeletions.map((deletion) => deletion.recordId),
    );
    const movedTargetSourceByRecordId = new Map(
      draft.normalized.recordMoves.map((move) => [move.recordId, move.targetSourceId] as const),
    );
    for (const sample of draft.normalized.sampleRecords) {
      if (seenRecordIds.has(sample.id)) {
        conflicts.push({
          code: 'duplicate_record_target',
          message: `Record "${sample.id}" appears more than once in one desired state`,
          targetId: sample.id,
          sampleRecordId: sample.id,
        });
      }
      seenRecordIds.add(sample.id);
    }
    for (const deletion of draft.normalized.recordDeletions) {
      if (seenRecordIds.has(deletion.recordId)) {
        conflicts.push({
          code: 'duplicate_record_target',
          message: `Record "${deletion.recordId}" is both written and deleted in one desired state`,
          targetId: deletion.recordId,
          sampleRecordId: deletion.recordId,
        });
      }
      seenRecordIds.add(deletion.recordId);
      const current = this.#databaseRecordIndex?.getById(deletion.recordId) ?? null;
      if (!current) {
        conflicts.push({
          code: 'record_not_found',
          message: `Record "${deletion.recordId}" no longer exists`,
          targetId: deletion.recordId,
          sampleRecordId: deletion.recordId,
        });
      } else if (current.revision !== deletion.expectedRevision) {
        conflicts.push({
          code: 'record_revision_changed',
          message: `Record "${deletion.recordId}" changed after deletion was prepared`,
          targetId: deletion.recordId,
          sampleRecordId: deletion.recordId,
        });
      }
    }
    for (const copy of draft.normalized.recordCopies) {
      const current = this.#databaseRecordIndex?.getById(copy.sourceRecordId) ?? null;
      if (!current || current.revision !== copy.expectedRevision) {
        conflicts.push({
          code: current ? 'record_revision_changed' : 'record_not_found',
          message: current
            ? `Record copy source "${copy.sourceRecordId}" changed after duplication was prepared`
            : `Record copy source "${copy.sourceRecordId}" no longer exists`,
          targetId: copy.sourceRecordId,
          sampleRecordId: copy.newRecordId,
        });
      }
    }
    for (const move of draft.normalized.recordMoves) {
      if (seenRecordIds.has(move.recordId)) {
        conflicts.push({
          code: 'duplicate_record_target',
          message: `Record "${move.recordId}" is moved and changed by another operation`,
          targetId: move.recordId,
          sampleRecordId: move.recordId,
        });
      }
      seenRecordIds.add(move.recordId);
      const current = this.#databaseRecordIndex?.getById(move.recordId) ?? null;
      if (!current || current.revision !== move.expectedRevision) {
        conflicts.push({
          code: current ? 'record_revision_changed' : 'record_not_found',
          message: `Record move source "${move.recordId}" is missing or changed`,
          targetId: move.recordId,
          sampleRecordId: move.recordId,
        });
      }
      if (this.#contentDir) {
        try {
          this.#readFile(resolve(this.#contentDir, move.targetPath));
          conflicts.push({
            code: 'record_path_occupied',
            message: `Record move target path "${move.targetPath}" is occupied`,
            targetId: move.recordId,
            sampleRecordId: move.recordId,
          });
        } catch (error) {
          if (errno(error) !== 'ENOENT') {
            conflicts.push({
              code: 'planning_io_unavailable',
              message: `Record move target path "${move.targetPath}" could not be inspected`,
              targetId: move.recordId,
              sampleRecordId: move.recordId,
            });
          }
        }
      }
    }
    const occupiedRecordPaths = new Set(
      (this.#databaseRecordIndex?.list(definition.id) ?? []).map((record) => record.path),
    );
    const allocatedRecordPaths = new Set<string>();
    const allocateRecordPath = (
      source: DatabaseDefinition['sources'][number],
      sample: (typeof draft.normalized.sampleRecords)[number],
      existingPath: string | null,
    ): string => {
      if (source.folderOwnership !== 'database') {
        return existingPath ?? `${source.folder === '.' ? '' : `${source.folder}/`}${sample.id}.md`;
      }
      const titleProperty = source.properties.find((property) => property.type === 'title');
      const baseName = databaseRecordNameFromTitle(
        titleProperty ? sample.values[titleProperty.id] : undefined,
      );
      const prefix = source.folder === '.' ? '' : `${source.folder}/`;
      for (let index = 1; index <= 10_000; index += 1) {
        const path = `${prefix}${databasePathNameWithCollisionSuffix(baseName, index)}.md`;
        if (allocatedRecordPaths.has(path)) continue;
        if (occupiedRecordPaths.has(path) && path !== existingPath) continue;
        if (this.#contentDir && path !== existingPath) {
          try {
            this.#readFile(resolve(this.#contentDir, path));
            continue;
          } catch (error) {
            if (errno(error) !== 'ENOENT') {
              conflicts.push({
                code: 'planning_io_unavailable',
                message: `Record target path "${path}" could not be inspected safely`,
                targetId: sample.id,
                sampleRecordId: sample.id,
              });
            }
          }
        }
        allocatedRecordPaths.add(path);
        return path;
      }
      throw new Error(`Unable to allocate a readable record path for "${baseName}"`);
    };
    const recordPlans = draft.normalized.sampleRecords.map((sample) => {
      const source = definition.sources.find((candidate) => candidate.id === sample.sourceId);
      if (!source) throw new Error('Normalized sample source is missing');
      const existing = this.#databaseRecordIndex?.getById(sample.id) ?? null;
      if (existing) {
        if (existing.databaseId !== definition.id || existing.sourceId !== sample.sourceId) {
          conflicts.push({
            code: 'record_scope_mismatch',
            message: `Record "${sample.id}" belongs to a different database or source`,
            targetId: sample.id,
            sampleRecordId: sample.id,
          });
        } else if (!sample.expectedRevision) {
          conflicts.push({
            code: 'record_revision_required',
            message: `Updating record "${sample.id}" requires its current revision`,
            targetId: sample.id,
            sampleRecordId: sample.id,
          });
        } else if (existing.revision !== sample.expectedRevision) {
          conflicts.push({
            code: 'record_revision_changed',
            message: `Record "${sample.id}" changed after the desired state was prepared`,
            targetId: sample.id,
            sampleRecordId: sample.id,
          });
        }
        const currentSource = byId?.sources.find((candidate) => candidate.id === existing.sourceId);
        const storageContractChanged = currentSource
          ? recordNeedsSourceRewrite(currentSource, source, existing.values) ||
            (byId
              ? recordNeedsPersonRewrite(byId, definition, currentSource.id, existing.values)
              : false)
          : false;
        const targetPath = allocateRecordPath(source, sample, existing.path);
        const contentChanged = !(
          !storageContractChanged &&
          same(existing.values, sample.values) &&
          existing.body === sample.body &&
          (sample.archivedAt === undefined ||
            (existing.archivedAt ?? null) === sample.archivedAt) &&
          (sample.pageLayoutOverride === undefined ||
            same(existing.pageLayoutOverride ?? null, sample.pageLayoutOverride))
        );
        const action =
          targetPath !== existing.path
            ? ('move' as const)
            : contentChanged
              ? ('update' as const)
              : ('noop' as const);
        return {
          sample,
          source,
          existing,
          path: existing.path,
          ...(targetPath !== existing.path ? { targetPath } : {}),
          action,
        };
      }
      if (sample.expectedRevision) {
        conflicts.push({
          code: 'record_not_found',
          message: `Record "${sample.id}" no longer exists at its expected revision`,
          targetId: sample.id,
          sampleRecordId: sample.id,
        });
      }
      const path = allocateRecordPath(source, sample, null);
      return { sample, source, existing: null, path, action: 'create' as const };
    });

    if (byId && manifestAction === 'update') {
      if (!this.#databaseRecordIndex) {
        conflicts.push({
          code: 'planning_io_unavailable',
          message: 'Schema convergence requires the project record index',
          targetId: definition.id,
        });
      } else {
        const upsertIds = new Set([
          ...draft.normalized.sampleRecords.map((sample) => sample.id),
          ...draft.normalized.recordMutations.map((mutation) => mutation.recordId),
        ]);
        for (const desiredSource of definition.sources) {
          for (const property of desiredSource.properties) {
            const currentSource = byId.sources.find((source) =>
              source.properties.some((candidate) => candidate.id === property.id),
            );
            if (!currentSource || currentSource.id === desiredSource.id) continue;
            const recordsWithValue = this.#databaseRecordIndex
              .list(byId.id, currentSource.id)
              .filter((record) => record.values[property.id] !== undefined);
            if (recordsWithValue.length > 0) {
              conflicts.push({
                code: 'source_record_migration_required',
                message: `Property "${property.id}" moves between sources while ${recordsWithValue.length} record(s) still store values; migrate that data first`,
                targetId: property.id,
                propertyId: property.id,
              });
            }
          }
        }
        for (const currentSource of byId.sources) {
          const records = this.#databaseRecordIndex.list(byId.id, currentSource.id);
          if (records.length === 0) continue;
          const desiredSource = definition.sources.find(
            (candidate) => candidate.id === currentSource.id,
          );
          if (!desiredSource) {
            conflicts.push({
              code: 'source_removal_blocked',
              message: `Source "${currentSource.id}" still owns ${records.length} record(s) and cannot be removed by schema convergence`,
              targetId: currentSource.id,
            });
            continue;
          }
          if (currentSource.includeSubfolders !== desiredSource.includeSubfolders) {
            conflicts.push({
              code: 'source_record_migration_required',
              message: `Source "${currentSource.id}" changes record path ownership; use a migration operation before altering its folder contract`,
              targetId: currentSource.id,
            });
            continue;
          }
          if (currentSource.folder !== desiredSource.folder) {
            const omitted = records.filter((record) => !upsertIds.has(record.id));
            if (desiredSource.folderOwnership !== 'database' || omitted.length > 0) {
              conflicts.push({
                code: 'source_record_migration_required',
                message: `Source "${currentSource.id}" changes record path ownership; include every database-owned record in the title-folder migration`,
                targetId: currentSource.id,
              });
              continue;
            }
          }
          const personStorageChanged = records.some((record) =>
            recordNeedsPersonRewrite(byId, definition, currentSource.id, record.values),
          );
          if (!sourceNeedsRecordRewrite(currentSource, desiredSource) && !personStorageChanged) {
            continue;
          }
          const omitted = records.filter(
            (record) =>
              (recordNeedsSourceRewrite(currentSource, desiredSource, record.values) ||
                recordNeedsPersonRewrite(byId, definition, currentSource.id, record.values)) &&
              !upsertIds.has(record.id),
          );
          if (omitted.length > 0) {
            conflicts.push({
              code: 'source_record_migration_required',
              message: `Source "${currentSource.id}" changes stored values for ${omitted.length} omitted record(s); include every affected record as a revision-bound upsert`,
              targetId: currentSource.id,
            });
          }
        }
      }
    }

    for (const sample of draft.normalized.sampleRecords) {
      const source = definition.sources.find((candidate) => candidate.id === sample.sourceId);
      if (!source) continue;
      for (const property of source.properties) {
        if (property.required && sample.values[property.id] === undefined) {
          conflicts.push({
            code: 'sample_required_value_missing',
            message: `Sample record is missing required property "${property.key}"`,
            targetId: sample.id,
            propertyId: property.id,
            sampleRecordId: sample.id,
          });
        }
        if (property.type === 'relation') {
          const value = sample.values[property.id];
          if (value === undefined) continue;
          const relationIds = Array.isArray(value) ? value.map(String) : [String(value)];
          for (const recordId of relationIds) {
            if (deletionIds.has(recordId)) {
              conflicts.push({
                code: 'relation_target_missing',
                message: `Relation property "${property.id}" targets record "${recordId}", which is deleted by the same desired state`,
                targetId: recordId,
                propertyId: property.id,
                sampleRecordId: sample.id,
              });
              continue;
            }
            const plannedTarget = draft.normalized.sampleRecords.find(
              (candidate) => candidate.id === recordId,
            );
            const indexedTarget = this.#databaseRecordIndex?.getById(recordId) ?? null;
            const targetSourceId =
              plannedTarget?.sourceId ??
              movedTargetSourceByRecordId.get(recordId) ??
              indexedTarget?.sourceId;
            const targetDatabaseId = plannedTarget ? definition.id : indexedTarget?.databaseId;
            if (targetSourceId !== property.targetSourceId || targetDatabaseId !== definition.id) {
              conflicts.push({
                code: 'relation_target_missing',
                message: `Relation property "${property.id}" target "${recordId}" does not resolve in source "${property.targetSourceId}"`,
                targetId: recordId,
                propertyId: property.id,
                sampleRecordId: sample.id,
              });
            }
          }
        } else if (property.type === 'person') {
          const value = sample.values[property.id];
          if (value === undefined) continue;
          const personIds = Array.isArray(value) ? value.map(String) : [];
          for (const personId of personIds) {
            if (!definition.people.some((person) => person.id === personId)) {
              conflicts.push({
                code: 'person_target_missing',
                message: `Person property "${property.id}" references undeclared person "${personId}"`,
                targetId: personId,
                propertyId: property.id,
                sampleRecordId: sample.id,
              });
            }
          }
        }
      }
    }
    if (deletionIds.size > 0 || movedTargetSourceByRecordId.size > 0) {
      const plannedValues = new Map(
        draft.normalized.sampleRecords.map((record) => [record.id, record.values] as const),
      );
      for (const source of definition.sources) {
        const relationProperties = source.properties.filter(
          (property) => property.type === 'relation',
        );
        if (relationProperties.length === 0) continue;
        for (const record of this.#databaseRecordIndex?.list(definition.id, source.id) ?? []) {
          if (deletionIds.has(record.id)) continue;
          const values = plannedValues.get(record.id) ?? record.values;
          for (const property of relationProperties) {
            const value = values[property.id];
            const relationIds =
              value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)];
            const invalidTarget = relationIds.find(
              (recordId) =>
                deletionIds.has(recordId) ||
                (movedTargetSourceByRecordId.has(recordId) &&
                  movedTargetSourceByRecordId.get(recordId) !== property.targetSourceId),
            );
            if (!invalidTarget) continue;
            conflicts.push({
              code: 'relation_target_missing',
              message: deletionIds.has(invalidTarget)
                ? `Record "${record.id}" still references deletion target "${invalidTarget}" through relation "${property.id}"`
                : `Record "${record.id}" still references moved target "${invalidTarget}" outside relation source "${property.targetSourceId}"`,
              targetId: invalidTarget,
              propertyId: property.id,
              sampleRecordId: record.id,
            });
          }
        }
      }
    }
    const upsertIds = new Set(draft.normalized.sampleRecords.map((sample) => sample.id));
    for (const source of definition.sources) {
      const uniqueProperties = source.properties.filter(
        (property) => property.semantics.constraints.unique,
      );
      if (uniqueProperties.length === 0) continue;
      const records = [
        ...(this.#databaseRecordIndex?.list(definition.id, source.id) ?? []).filter(
          (record) => !upsertIds.has(record.id) && !deletionIds.has(record.id),
        ),
        ...draft.normalized.sampleRecords.filter((sample) => sample.sourceId === source.id),
      ];
      for (const property of uniqueProperties) {
        const seen = new Map<string, string>();
        for (const sample of records) {
          const value = sample.values[property.id];
          if (value === undefined) continue;
          const key = stable(value);
          const firstRecordId = seen.get(key);
          if (firstRecordId) {
            conflicts.push({
              code: 'sample_unique_value_duplicate',
              message: `Records "${firstRecordId}" and "${sample.id}" repeat unique property "${property.key}"`,
              targetId: sample.id,
              propertyId: property.id,
              sampleRecordId: sample.id,
            });
          } else {
            seen.set(key, sample.id);
          }
        }
      }
    }
    const currentIds = new Set(currentObjects.keys());
    const desiredIds = new Set(desiredObjects.keys());
    const addedIds = [...desiredIds].filter((id) => !currentIds.has(id)).sort();
    const removedIds = [...currentIds].filter((id) => !desiredIds.has(id)).sort();
    const updatedIds = [...desiredIds]
      .filter((id) => currentIds.has(id) && !same(currentObjects.get(id), desiredObjects.get(id)))
      .sort();
    for (const source of definition.sources) {
      for (const property of source.properties) {
        if (propertyAction(source.id, property) === 'update' && !updatedIds.includes(property.id)) {
          updatedIds.push(property.id);
        }
      }
    }
    updatedIds.sort();
    const desiredProperties = definition.sources.flatMap((source) => source.properties);
    const currentProperties = byId?.sources.flatMap((source) => source.properties) ?? [];
    const changedPropertyIds = new Set(
      [...desiredProperties, ...currentProperties]
        .filter((property) => {
          const desired = desiredProperties.find((candidate) => candidate.id === property.id);
          const current = currentProperties.find((candidate) => candidate.id === property.id);
          if (!desired || !current || !same(desired, current)) return true;
          const desiredSource = definition.sources.find((source) =>
            source.properties.some((candidate) => candidate.id === property.id),
          );
          return desiredSource ? propertyAction(desiredSource.id, desired) !== 'noop' : true;
        })
        .map((property) => property.id),
    );
    const changedProperties = [...desiredProperties, ...currentProperties].filter(
      (property, index, properties) =>
        changedPropertyIds.has(property.id) &&
        properties.findIndex((candidate) => candidate.id === property.id) === index,
    );
    const conflictDomains = new Set<DatabaseConflictDomain>();
    const hasRecordChanges =
      recordPlans.some((record) => record.action !== 'noop') ||
      draft.normalized.recordMutations.length > 0 ||
      draft.normalized.recordCopies.length > 0 ||
      draft.normalized.recordArchives.length > 0 ||
      draft.normalized.recordMoves.length > 0 ||
      draft.normalized.recordDeletions.length > 0;
    if (hasRecordChanges) conflictDomains.add('record_value');
    if (
      definition.views.some((view) => actionFor(view.id, view) !== 'noop') ||
      (byId?.views.some(
        (view) => !definition.views.some((candidate) => candidate.id === view.id),
      ) ??
        false)
    ) {
      conflictDomains.add('view');
    }
    if (
      definition.automations.some(
        (automation) => actionFor(automation.id, automation) !== 'noop',
      ) ||
      (byId?.automations.some(
        (automation) => !definition.automations.some((candidate) => candidate.id === automation.id),
      ) ??
        false)
    ) {
      conflictDomains.add('automation');
    }
    if (
      manifestAction !== 'noop' ||
      addedIds.length > 0 ||
      removedIds.length > 0 ||
      changedProperties.length > 0
    ) {
      conflictDomains.add('schema');
    }
    for (const property of changedProperties) {
      if (
        property.type === 'select' ||
        property.type === 'status' ||
        property.type === 'multi_select'
      ) {
        conflictDomains.add('option');
      }
      if (property.type === 'formula' || property.type === 'rollup') {
        conflictDomains.add('formula');
      }
      if (property.type === 'relation' || property.type === 'rollup') {
        conflictDomains.add('relation');
      }
    }
    const operations: DatabasePlanArtifact['normalizedOperations'] = [
      {
        kind: 'ensure_database',
        databaseId: definition.id,
        manifestPath,
        action: manifestAction,
      },
      ...definition.sources.flatMap((source) =>
        source.properties.map((property) =>
          property.type === 'relation'
            ? {
                kind: 'ensure_relation' as const,
                sourceId: source.id,
                propertyId: property.id,
                targetSourceId: property.targetSourceId,
                ...(property.pairedPropertyId
                  ? { pairedPropertyId: property.pairedPropertyId }
                  : {}),
                action: propertyAction(source.id, property),
              }
            : {
                kind: 'ensure_property' as const,
                sourceId: source.id,
                propertyId: property.id,
                action: propertyAction(source.id, property),
              },
        ),
      ),
      ...definition.views.map((view) => ({
        kind: 'ensure_view' as const,
        sourceId: view.sourceId,
        viewId: view.id,
        action: actionFor(view.id, view),
      })),
      ...(byId
        ? [
            {
              kind: 'alter_schema' as const,
              databaseId: definition.id,
              action:
                addedIds.length > 0 || updatedIds.length > 0 || removedIds.length > 0
                  ? ('update' as const)
                  : ('noop' as const),
              addedIds,
              updatedIds,
              removedIds,
            },
          ]
        : []),
      ...draft.normalized.recordMutations.map((mutation) => ({
        kind: 'mutate_record' as const,
        sourceId: mutation.sourceId,
        recordId: mutation.recordId,
        operations: mutation.operations,
      })),
      ...definition.sources.flatMap((source) => {
        const copies = draft.normalized.recordCopies
          .filter((copy) => {
            const sample = draft.normalized.sampleRecords.find(
              (record) => record.id === copy.newRecordId,
            );
            return sample?.sourceId === source.id;
          })
          .map((copy) => ({
            sourceRecordId: copy.sourceRecordId,
            newRecordId: copy.newRecordId,
          }));
        return copies.length > 0
          ? [{ kind: 'duplicate_records' as const, sourceId: source.id, copies }]
          : [];
      }),
      ...(draft.normalized.recordMoves.length > 0
        ? [
            {
              kind: 'move_records' as const,
              moves: draft.normalized.recordMoves.map((move) => ({
                recordId: move.recordId,
                sourceId: move.sourceId,
                targetSourceId: move.targetSourceId,
                sourcePath: move.sourcePath,
                targetPath: move.targetPath,
              })),
            },
          ]
        : []),
      ...definition.sources.flatMap((source) => {
        const records = draft.normalized.recordArchives
          .filter((archive) => {
            const sample = draft.normalized.sampleRecords.find(
              (record) => record.id === archive.recordId,
            );
            return sample?.sourceId === source.id;
          })
          .map((archive) => ({
            recordId: archive.recordId,
            action: archive.action,
            archivedAt: archive.archivedAt,
          }));
        return records.length > 0
          ? [{ kind: 'archive_records' as const, sourceId: source.id, records }]
          : [];
      }),
      ...definition.sources.flatMap((source) => {
        const recordIds = draft.normalized.recordDeletions
          .filter((deletion) => deletion.sourceId === source.id)
          .map((deletion) => deletion.recordId);
        return recordIds.length > 0
          ? [{ kind: 'delete_records' as const, sourceId: source.id, recordIds }]
          : [];
      }),
      ...definition.sources.flatMap((source) => {
        const sourceRecords = recordPlans.filter((record) => record.sample.sourceId === source.id);
        const recordIds = sourceRecords.map((record) => record.sample.id);
        return recordIds.length > 0
          ? [
              {
                kind: 'upsert_records' as const,
                sourceId: source.id,
                recordIds,
                created: sourceRecords.filter((record) => record.action === 'create').length,
                updated: sourceRecords.filter(
                  (record) => record.action === 'update' || record.action === 'move',
                ).length,
                unchanged: sourceRecords.filter((record) => record.action === 'noop').length,
              },
            ]
          : [];
      }),
    ];
    const relationDependencyIds = draft.normalized.sampleRecords.flatMap((record) => {
      const source = definition.sources.find((candidate) => candidate.id === record.sourceId);
      if (!source) return [];
      return source.properties.flatMap((property) => {
        if (property.type !== 'relation') return [];
        const value = record.values[property.id];
        if (value === undefined) return [];
        return Array.isArray(value) ? value.map(String) : [String(value)];
      });
    });
    const targetSet = [
      ...new Set([
        definition.id,
        ...definition.sources.map((source) => source.id),
        ...definition.sources.flatMap((source) => source.properties.map((property) => property.id)),
        ...definition.sources.flatMap((source) =>
          source.properties.flatMap((property) =>
            property.type === 'select' ||
            property.type === 'status' ||
            property.type === 'multi_select'
              ? property.options.map((option) => option.id)
              : [],
          ),
        ),
        ...definition.views.map((view) => view.id),
        ...draft.normalized.sampleRecords.map((record) => record.id),
        ...draft.normalized.recordCopies.map((copy) => copy.sourceRecordId),
        ...draft.normalized.recordDeletions.map((record) => record.recordId),
        ...draft.normalized.recordMoves.map((record) => record.recordId),
        ...relationDependencyIds,
        ...draft.normalized.targetResolutions.map((resolution) => resolution.targetId),
      ]),
    ].sort();
    const writeGuards = this.captureWriteGuards(draftId, targetSet);
    const createdRecordCount = recordPlans.filter((record) => record.action === 'create').length;
    const updatedRecordCount = recordPlans.filter((record) => record.action === 'update').length;
    const movedRecordCount = draft.normalized.recordMoves.length;
    const changedRecordCount = createdRecordCount + updatedRecordCount + movedRecordCount;
    const deletedRecordCount = draft.normalized.recordDeletions.length;
    const body = {
      draftId,
      draftRevision: draft.revision,
      snapshotRevision: snapshot.revision,
      expiresAt,
      immutableTargetSet: targetSet,
      writeGuards,
      targetResolutions: draft.normalized.targetResolutions,
      ...(draft.normalized.verificationChange
        ? {
            verificationReview: {
              action: draft.normalized.verificationChange.action,
              databaseId: definition.id,
              sourceId: draft.normalized.verificationChange.sourceId,
              recordId: draft.normalized.verificationChange.recordId,
              propertyId: draft.normalized.verificationChange.propertyId,
              actor: clone(draft.normalized.verificationChange.actor),
              expectedRevision:
                draft.normalized.sampleRecords.find(
                  (record) => record.id === draft.normalized.verificationChange?.recordId,
                )?.expectedRevision ?? 'sha256:missing',
              verifiedAt:
                draft.normalized.verificationChange.value.state === 'verified'
                  ? draft.normalized.verificationChange.value.verifiedAt
                  : null,
              expiresAt:
                draft.normalized.verificationChange.value.state === 'verified'
                  ? (draft.normalized.verificationChange.value.expiresAt ?? null)
                  : null,
              evidenceRevision:
                draft.normalized.verificationChange.value.state === 'verified'
                  ? (draft.normalized.verificationChange.value.evidenceRevision ?? null)
                  : null,
              notePresent: draft.normalized.verificationChange.value.note !== undefined,
            },
          }
        : {}),
      normalizedOperations: operations,
      affectedObjects: {
        databaseIds: [definition.id],
        sourceIds: definition.sources.map((source) => source.id),
        propertyIds: definition.sources.flatMap((source) =>
          source.properties.map((property) => property.id),
        ),
        viewIds: definition.views.map((view) => view.id),
        recordIds: [
          ...draft.normalized.sampleRecords.map((record) => record.id),
          ...draft.normalized.recordDeletions.map((record) => record.recordId),
        ],
        automationIds: definition.automations.map((automation) => automation.id),
      },
      conflictDomains: (
        ['record_value', 'schema', 'option', 'view', 'formula', 'relation', 'automation'] as const
      ).filter((domain) => conflictDomains.has(domain)),
      diff: {
        mode: 'exact' as const,
        manifests: manifestDiff,
        records: [
          ...recordPlans
            .filter((record) => record.action !== 'noop')
            .map((record) => ({
              recordId: record.sample.id,
              sourceId: record.sample.sourceId,
              ...(record.action === 'move'
                ? {
                    beforeSourceId: record.existing?.sourceId ?? record.sample.sourceId,
                    targetPath: record.targetPath,
                  }
                : {}),
              path: record.path,
              action: record.action as 'create' | 'update' | 'move',
              before: record.existing
                ? {
                    revision: record.existing.revision ?? 'sha256:missing',
                    values: record.existing.values,
                    body: record.existing.body,
                    archivedAt: record.existing.archivedAt ?? null,
                    ...(record.existing.pageLayoutOverride
                      ? { pageLayoutOverride: record.existing.pageLayoutOverride }
                      : {}),
                  }
                : null,
              after: {
                values: record.sample.values,
                body: record.sample.body,
                ...(record.sample.archivedAt !== undefined
                  ? { archivedAt: record.sample.archivedAt }
                  : record.existing?.archivedAt
                    ? { archivedAt: record.existing.archivedAt }
                    : {}),
                ...(record.sample.pageLayoutOverride !== undefined
                  ? record.sample.pageLayoutOverride
                    ? { pageLayoutOverride: record.sample.pageLayoutOverride }
                    : {}
                  : record.existing?.pageLayoutOverride
                    ? { pageLayoutOverride: record.existing.pageLayoutOverride }
                    : {}),
              },
            })),
          ...draft.normalized.recordDeletions.map((record) => ({
            recordId: record.recordId,
            sourceId: record.sourceId,
            path: record.path,
            action: 'delete' as const,
            before: {
              revision: record.expectedRevision,
              values: record.values,
              body: record.body,
              archivedAt: this.#databaseRecordIndex?.getById(record.recordId)?.archivedAt ?? null,
              ...(this.#databaseRecordIndex?.getById(record.recordId)?.pageLayoutOverride
                ? {
                    pageLayoutOverride: this.#databaseRecordIndex.getById(record.recordId)
                      ?.pageLayoutOverride,
                  }
                : {}),
            },
            after: null,
          })),
          ...draft.normalized.recordMoves.map((record) => ({
            recordId: record.recordId,
            sourceId: record.targetSourceId,
            beforeSourceId: record.sourceId,
            path: record.sourcePath,
            targetPath: record.targetPath,
            action: 'move' as const,
            before: {
              revision: record.expectedRevision,
              values: this.#databaseRecordIndex?.getById(record.recordId)?.values ?? {},
              body: record.body,
              archivedAt: record.archivedAt,
              ...(this.#databaseRecordIndex?.getById(record.recordId)?.pageLayoutOverride
                ? {
                    pageLayoutOverride: this.#databaseRecordIndex.getById(record.recordId)
                      ?.pageLayoutOverride,
                  }
                : {}),
            },
            after: {
              values: record.values,
              body: record.body,
              archivedAt: record.archivedAt,
            },
          })),
        ],
        templates: draft.normalized.templates,
        policy: draft.normalized.policy,
      },
      risk: {
        level: (manifestAction === 'update' ||
        draft.normalized.policy.mode === 'autonomous' ||
        deletedRecordCount > 0 ||
        changedRecordCount > 20
          ? 'high'
          : changedRecordCount > 0 || draft.normalized.templates.length > 0
            ? 'medium'
            : 'low') as 'low' | 'medium' | 'high',
        reasons: [
          ...(manifestAction === 'create' ? ['Creates a canonical database manifest'] : []),
          ...(manifestAction === 'update' ? ['Alters an existing canonical database schema'] : []),
          ...(createdRecordCount > 0 ? [`Creates ${createdRecordCount} canonical record(s)`] : []),
          ...(updatedRecordCount > 0 ? [`Updates ${updatedRecordCount} canonical record(s)`] : []),
          ...(draft.normalized.verificationChange
            ? [
                `${draft.normalized.verificationChange.action} governed verification for record ${draft.normalized.verificationChange.recordId}`,
              ]
            : []),
          ...(movedRecordCount > 0 ? [`Moves ${movedRecordCount} canonical record(s)`] : []),
          ...(deletedRecordCount > 0 ? [`Deletes ${deletedRecordCount} canonical record(s)`] : []),
          ...(manifestAction === 'noop' && changedRecordCount === 0 && deletedRecordCount === 0
            ? ['Desired canonical state is already converged']
            : []),
          ...(draft.normalized.policy.mode === 'autonomous'
            ? ['Requests autonomous agent write policy']
            : []),
        ],
      },
      conflicts,
      approvals: [
        {
          code: 'create_database' as const,
          required: !byId,
          reason: 'Creating canonical database state requires commit approval',
        },
        {
          code: 'alter_schema' as const,
          required: Boolean(byId && manifestAction === 'update'),
          reason: 'Changing an existing canonical schema requires commit approval',
        },
        {
          code: 'sample_record_write' as const,
          required: changedRecordCount > 0,
          reason: 'Record upserts create or replace canonical Markdown files',
        },
        {
          code: 'verification_change' as const,
          required: draft.normalized.verificationChange !== undefined,
          reason:
            'Verification lifecycle changes require review of actor, expiry, evidence revision, and record revision',
        },
        {
          code: 'delete_record' as const,
          required: deletedRecordCount > 0,
          reason: 'Deleting canonical Markdown records is destructive and requires approval',
        },
        {
          code: 'autonomous_policy' as const,
          required: draft.normalized.policy.mode === 'autonomous',
          reason: 'Autonomous write delegation requires explicit approval',
        },
      ],
      postconditions: [
        {
          code: 'manifest_valid' as const,
          description: 'Committed manifest parses as the normalized definition',
        },
        {
          code: 'stable_ids_unique' as const,
          description: 'Every database object stable ID is unique',
        },
        {
          code: 'stable_targets_resolved' as const,
          description: 'Every human-addressed write target resolves into the immutable ID set',
        },
        {
          code: 'required_values' as const,
          description: 'Every planned record satisfies required properties',
        },
        {
          code: 'unique_key' as const,
          description: 'Declared unique-key values remain unique',
        },
        {
          code: 'relation_integrity' as const,
          description: 'Every relation value resolves to an indexed record',
        },
        ...(draft.normalized.verificationChange
          ? [
              {
                code: 'verification_attribution' as const,
                description:
                  'Stored verification exactly matches the authenticated actor and reviewed evidence lifecycle',
              },
            ]
          : []),
      ],
      committable:
        conflicts.length === 0 &&
        (manifestDiff.length > 0 ||
          recordPlans.some((record) => record.action !== 'noop') ||
          deletedRecordCount > 0 ||
          draft.normalized.recordMoves.length > 0),
      requiresCommit:
        manifestDiff.length > 0 ||
        recordPlans.some((record) => record.action !== 'noop') ||
        deletedRecordCount > 0 ||
        draft.normalized.recordMoves.length > 0,
    };
    const plan: DatabasePlanArtifact = {
      id: `plan_${compactUuid(this.#generateUuid)}`,
      hash: hash(body),
      createdAt: now.toISOString(),
      ...body,
    };
    this.#plans.set(plan.id, clone(plan));
    return clone(plan);
  }

  getPlan(id: string): DatabasePlanArtifact {
    const plan = this.#plans.get(id);
    if (!plan) throw new DatabasePlanError('plan_not_found', `Plan "${id}" was not found`, { id });
    if (Date.parse(plan.expiresAt) <= this.#now().getTime()) {
      this.#plans.delete(id);
      throw new DatabasePlanError('plan_expired', `Plan "${id}" has expired`, {
        id,
        expiredAt: plan.expiresAt,
      });
    }
    return clone(plan);
  }

  /** Restore an exact durable plan after a server process restart. */
  restorePlan(plan: DatabasePlanArtifact): void {
    this.#plans.set(plan.id, clone(plan));
  }

  #createDatabaseDeletionPlan(
    draft: DatabaseDraftArtifact,
    snapshot: ReturnType<DatabaseStore['snapshot']>,
    now: Date,
    expiresAt: string,
  ): DatabasePlanArtifact {
    const definition = draft.normalized.definition;
    const current = snapshot.databases.find((candidate) => candidate.id === definition.id);
    const manifestPath = `.ok/databases/${definition.key}.yml`;
    const conflicts: DatabasePlanConflict[] = [];
    let manifestBefore: string | null = null;
    if (!current || !same(current, definition)) {
      conflicts.push({
        code: 'database_key_changed',
        message: 'Database schema changed after the deletion target was frozen',
        targetId: definition.id,
      });
    } else if (!this.#projectDir) {
      conflicts.push({
        code: 'planning_io_unavailable',
        message: 'Database deletion requires a project-scoped exact manifest reader',
        targetId: definition.id,
      });
    } else {
      try {
        manifestBefore = this.#readFile(resolve(this.#projectDir, manifestPath));
      } catch {
        conflicts.push({
          code: 'planning_io_unavailable',
          message: `Canonical manifest "${manifestPath}" could not be read for exact deletion`,
          targetId: definition.id,
        });
      }
    }
    const indexed = this.#databaseRecordIndex?.list(definition.id) ?? [];
    const frozenById = new Map(
      draft.normalized.recordDeletions.map((record) => [record.recordId, record] as const),
    );
    if (
      indexed.length !== frozenById.size ||
      indexed.some(
        (record) =>
          record.revision !== frozenById.get(record.id)?.expectedRevision ||
          record.path !== frozenById.get(record.id)?.path,
      )
    ) {
      conflicts.push({
        code: 'source_record_migration_required',
        message: 'Database records changed after the deletion target set was frozen',
        targetId: definition.id,
      });
    }
    const targetSet = [
      ...new Set([
        ...databaseObjectMap(definition).keys(),
        ...draft.normalized.recordDeletions.map((record) => record.recordId),
        ...draft.normalized.targetResolutions.map((resolution) => resolution.targetId),
      ]),
    ].sort();
    const writeGuards = this.captureWriteGuards(draft.id, targetSet);
    const operations: DatabasePlanArtifact['normalizedOperations'] = [
      {
        kind: 'ensure_database',
        databaseId: definition.id,
        manifestPath,
        action: 'delete',
      },
      {
        kind: 'delete_database',
        databaseId: definition.id,
        manifestPath,
        recordIds: draft.normalized.recordDeletions.map((record) => record.recordId).sort(),
      },
      ...definition.sources.flatMap((source) => {
        const recordIds = draft.normalized.recordDeletions
          .filter((record) => record.sourceId === source.id)
          .map((record) => record.recordId)
          .sort();
        return recordIds.length > 0
          ? [{ kind: 'delete_records' as const, sourceId: source.id, recordIds }]
          : [];
      }),
    ];
    const body = {
      draftId: draft.id,
      draftRevision: draft.revision,
      snapshotRevision: snapshot.revision,
      expiresAt,
      immutableTargetSet: targetSet,
      writeGuards,
      targetResolutions: draft.normalized.targetResolutions,
      normalizedOperations: operations,
      affectedObjects: {
        databaseIds: [definition.id],
        sourceIds: definition.sources.map((source) => source.id),
        propertyIds: definition.sources.flatMap((source) =>
          source.properties.map((property) => property.id),
        ),
        viewIds: definition.views.map((view) => view.id),
        recordIds: draft.normalized.recordDeletions.map((record) => record.recordId),
        automationIds: definition.automations.map((automation) => automation.id),
      },
      conflictDomains: [
        'record_value',
        'schema',
        'option',
        'view',
        'formula',
        'relation',
        'automation',
      ] as const,
      diff: {
        mode: 'exact' as const,
        manifests:
          manifestBefore === null
            ? []
            : [
                {
                  path: manifestPath,
                  before: manifestBefore,
                  after: null,
                  action: 'delete' as const,
                },
              ],
        records: draft.normalized.recordDeletions.map((record) => ({
          recordId: record.recordId,
          sourceId: record.sourceId,
          path: record.path,
          action: 'delete' as const,
          before: {
            revision: record.expectedRevision,
            values: record.values,
            body: record.body,
            archivedAt: this.#databaseRecordIndex?.getById(record.recordId)?.archivedAt ?? null,
          },
          after: null,
        })),
        templates: clone(draft.normalized.templates),
        policy: clone(draft.normalized.policy),
      },
      risk: {
        level: 'high' as const,
        reasons: [
          'Deletes the canonical database manifest and every contained schema object',
          `Deletes ${draft.normalized.recordDeletions.length} canonical record(s)`,
        ],
      },
      conflicts,
      approvals: [
        {
          code: 'delete_database' as const,
          required: true,
          reason: 'Deleting a canonical database and all of its objects requires approval',
        },
        {
          code: 'delete_record' as const,
          required: draft.normalized.recordDeletions.length > 0,
          reason: 'Deleting canonical Markdown records is destructive and requires approval',
        },
      ],
      postconditions: [
        {
          code: 'database_absent' as const,
          description: 'The deleted database manifest is absent from the canonical store',
        },
        {
          code: 'records_absent' as const,
          description: 'Every record frozen into the database deletion plan is absent',
        },
        {
          code: 'stable_targets_resolved' as const,
          description: 'Every deletion target resolves into the immutable stable-ID set',
        },
      ],
      committable: conflicts.length === 0 && manifestBefore !== null,
      requiresCommit: true,
    };
    const plan: DatabasePlanArtifact = {
      id: `plan_${compactUuid(this.#generateUuid)}`,
      hash: hash(body),
      createdAt: now.toISOString(),
      ...body,
    };
    this.#plans.set(plan.id, clone(plan));
    return clone(plan);
  }

  #normalize(desiredState: DatabaseDesiredStateDraft): DatabaseDraftArtifact['normalized'] {
    const snapshot = this.#databaseStore.snapshot();
    const existingById = desiredState.database.id
      ? (snapshot.databases.find((database) => database.id === desiredState.database.id) ?? null)
      : null;
    const existingByKey =
      snapshot.databases.find((database) => database.key === desiredState.database.key) ?? null;
    const currentDefinition = existingById ?? (desiredState.database.id ? null : existingByKey);
    const targetResolutions: DatabaseTargetResolution[] = [];
    const databaseId =
      desiredState.database.id ?? existingByKey?.id ?? `db_${compactUuid(this.#generateUuid)}`;
    targetResolutions.push({
      kind: 'database',
      selector: desiredState.database.id ? 'database.id' : 'database.key',
      targetId: databaseId,
      via: desiredState.database.id ? 'explicit_id' : existingByKey ? 'stable_key' : 'generated',
    });
    const desiredPeople = desiredState.database.people ?? currentDefinition?.people ?? [];
    const normalizedPeople = desiredPeople.map((person) => {
      const currentPerson = currentDefinition?.people.find(
        (candidate) =>
          candidate.key === person.key ||
          (typeof person.id === 'string' && candidate.id === person.id),
      );
      const personId =
        person.id ?? currentPerson?.id ?? `person_${compactUuid(this.#generateUuid)}`;
      targetResolutions.push({
        kind: 'person',
        selector: `database.people.${person.key}`,
        targetId: personId,
        via: person.id ? 'explicit_id' : currentPerson ? 'stable_key' : 'generated',
      });
      return {
        id: personId,
        key: person.key,
        name: person.name,
        kind: person.kind,
        ...(person.subjectId === undefined ? {} : { subjectId: person.subjectId }),
        ...(person.active === undefined ? {} : { active: person.active }),
      };
    });
    const currentSourceByDesiredKey = new Map(
      desiredState.sources.map((source) => [
        source.key,
        currentDefinition?.sources.find((candidate) => candidate.key === source.key) ?? null,
      ]),
    );
    const sourceIdByKey = new Map<string, string>();
    for (const source of desiredState.sources) {
      const currentSource = currentSourceByDesiredKey.get(source.key);
      const sourceId = source.id ?? currentSource?.id ?? `ds_${compactUuid(this.#generateUuid)}`;
      sourceIdByKey.set(source.key, sourceId);
      targetResolutions.push({
        kind: 'source',
        selector: `sources.${source.key}`,
        targetId: sourceId,
        via: source.id ? 'explicit_id' : currentSource ? 'stable_key' : 'generated',
      });
    }
    const propertyIdsBySource = new Map<string, Map<string, string>>();
    for (const source of desiredState.sources) {
      const resolvedSourceId = sourceIdByKey.get(source.key);
      const currentSource = currentSourceByDesiredKey.get(source.key);
      const reusableSource = currentSource?.id === resolvedSourceId ? currentSource : null;
      const propertyIds = new Map<string, string>();
      for (const property of source.properties) {
        const currentProperty = reusableSource?.properties.find(
          (candidate) => candidate.key === property.key,
        );
        const propertyId =
          property.id ?? currentProperty?.id ?? `prop_${compactUuid(this.#generateUuid)}`;
        propertyIds.set(property.key, propertyId);
        targetResolutions.push({
          kind: 'property',
          selector: `sources.${source.key}.properties.${property.key}`,
          targetId: propertyId,
          via: property.id ? 'explicit_id' : currentProperty ? 'stable_key' : 'generated',
        });
      }
      propertyIdsBySource.set(source.key, propertyIds);
    }
    const reservedSourceFolders = new Set(
      this.#databaseStore
        .list()
        .flatMap((database) => database.sources.map((source) => source.folder)),
    );
    const allocateManagedFolder = (source: (typeof desiredState.sources)[number]): string => {
      const currentSource = currentSourceByDesiredKey.get(source.key);
      if (
        source.folderOwnership !== 'database' ||
        (currentSource && currentSource.folder === source.folder)
      ) {
        return source.folder;
      }
      const slash = source.folder.lastIndexOf('/');
      const parent = slash >= 0 ? source.folder.slice(0, slash) : '';
      const name = slash >= 0 ? source.folder.slice(slash + 1) : source.folder;
      for (let index = 1; index <= 10_000; index += 1) {
        const candidateName = databasePathNameWithCollisionSuffix(name, index);
        const candidate = parent ? `${parent}/${candidateName}` : candidateName;
        if (reservedSourceFolders.has(candidate)) continue;
        if (this.#contentDir) {
          try {
            this.#readFile(resolve(this.#contentDir, candidate));
            continue;
          } catch (error) {
            if (errno(error) !== 'ENOENT' && errno(error) !== 'EISDIR') throw error;
            if (errno(error) === 'EISDIR') continue;
          }
        }
        reservedSourceFolders.add(candidate);
        return candidate;
      }
      throw new Error(`Unable to allocate database folder "${source.folder}"`);
    };
    const normalizedSources = desiredState.sources.map((source) => ({
      id: sourceIdByKey.get(source.key),
      key: source.key,
      name: source.name,
      ...(typeof source.description === 'string' ? { description: source.description } : {}),
      recordMeaning: source.recordMeaning,
      folder: allocateManagedFolder(source),
      folderOwnership: source.folderOwnership ?? 'linked',
      includeSubfolders:
        typeof source.includeSubfolders === 'boolean' ? source.includeSubfolders : true,
      ...(typeof source.defaultViewId === 'string' ? { defaultViewId: source.defaultViewId } : {}),
      properties: source.properties.map((property) => {
        const propertyId = propertyIdsBySource.get(source.key)?.get(property.key);
        const currentSource = currentSourceByDesiredKey.get(source.key);
        const currentProperty =
          currentSource && currentSource.id === sourceIdByKey.get(source.key)
            ? currentSource.properties.find((candidate) => candidate.id === propertyId)
            : undefined;
        const base = {
          id: propertyId,
          key: property.key,
          name: property.name,
          ...(typeof property.description === 'string'
            ? { description: property.description }
            : {}),
          ...(Array.isArray(property.aliases) ? { aliases: property.aliases } : {}),
          ...(typeof property.required === 'boolean' ? { required: property.required } : {}),
          ...(property.semantics && typeof property.semantics === 'object'
            ? { semantics: property.semantics }
            : {}),
          type: property.type,
        };
        if (property.type === 'status') {
          const providedGroups = Array.isArray(property.groups)
            ? property.groups
            : DATABASE_DEFAULT_STATUS_BLUEPRINT.map((entry) => entry.group);
          const currentStatus = currentProperty?.type === 'status' ? currentProperty : undefined;
          const groups = providedGroups.map((group: unknown) => {
            if (!group || typeof group !== 'object' || Array.isArray(group)) {
              throw new Error(`Property "${property.key}" has an invalid status group`);
            }
            const value = group as Record<string, unknown>;
            const currentGroup = currentStatus?.groups.find(
              (candidate) => candidate.key === value.key,
            );
            return {
              id:
                typeof value.id === 'string'
                  ? value.id
                  : (currentGroup?.id ?? `stg_${compactUuid(this.#generateUuid)}`),
              key: value.key,
              name: value.name,
              category: value.category,
              ...(typeof value.color === 'string' ? { color: value.color } : {}),
            };
          });
          const groupIdByKey = new Map(groups.map((group) => [group.key, group.id] as const));
          const providedOptions = Array.isArray(property.options)
            ? property.options
            : DATABASE_DEFAULT_STATUS_BLUEPRINT.flatMap((entry) =>
                entry.options.map((option) => ({ ...option, groupKey: entry.group.key })),
              );
          return {
            ...base,
            groups,
            options: providedOptions.map((option: unknown) => {
              if (!option || typeof option !== 'object' || Array.isArray(option)) {
                throw new Error(`Property "${property.key}" has an invalid status option`);
              }
              const value = option as Record<string, unknown>;
              const currentOption = currentStatus?.options.find(
                (candidate) => candidate.key === value.key,
              );
              const optionId =
                typeof value.id === 'string'
                  ? value.id
                  : (currentOption?.id ?? `opt_${compactUuid(this.#generateUuid)}`);
              const groupId =
                typeof value.groupId === 'string'
                  ? value.groupId
                  : groupIdByKey.get(String(value.groupKey ?? ''));
              if (!groupId) {
                throw new Error(`Status option "${String(value.key)}" has an unknown group key`);
              }
              targetResolutions.push({
                kind: 'option',
                selector: `sources.${source.key}.properties.${property.key}.options.${String(value.key)}`,
                targetId: optionId,
                via:
                  typeof value.id === 'string'
                    ? 'explicit_id'
                    : currentOption
                      ? 'stable_key'
                      : 'generated',
              });
              return {
                id: optionId,
                key: value.key,
                name: value.name,
                groupId,
                ...(typeof value.color === 'string' ? { color: value.color } : {}),
                ...(typeof value.archived === 'boolean' ? { archived: value.archived } : {}),
              };
            }),
          };
        }
        if (property.type === 'select' || property.type === 'multi_select') {
          if (!Array.isArray(property.options))
            throw new Error(`Property "${property.key}" requires options`);
          return {
            ...base,
            options: property.options.map((option: unknown) => {
              if (!option || typeof option !== 'object' || Array.isArray(option)) {
                throw new Error(`Property "${property.key}" has an invalid option`);
              }
              const value = option as Record<string, unknown>;
              const currentOption =
                currentProperty?.type === 'select' || currentProperty?.type === 'multi_select'
                  ? currentProperty.options.find((candidate) => candidate.key === value.key)
                  : undefined;
              const optionId =
                typeof value.id === 'string'
                  ? value.id
                  : (currentOption?.id ?? `opt_${compactUuid(this.#generateUuid)}`);
              targetResolutions.push({
                kind: 'option',
                selector: `sources.${source.key}.properties.${property.key}.options.${String(value.key)}`,
                targetId: optionId,
                via:
                  typeof value.id === 'string'
                    ? 'explicit_id'
                    : currentOption
                      ? 'stable_key'
                      : 'generated',
              });
              return {
                id: optionId,
                key: value.key,
                name: value.name,
                ...(typeof value.color === 'string' ? { color: value.color } : {}),
                ...(typeof value.archived === 'boolean' ? { archived: value.archived } : {}),
              };
            }),
          };
        }
        if (property.type === 'relation') {
          const targetSourceKey = String(property.targetSourceKey ?? '');
          const targetSourceId =
            typeof property.targetSourceId === 'string'
              ? property.targetSourceId
              : sourceIdByKey.get(targetSourceKey);
          if (!targetSourceId) {
            throw new Error(
              `Relation "${property.key}" has unknown target source key "${targetSourceKey}"`,
            );
          }
          const resolvedTargetSourceKey =
            targetSourceKey ||
            [...sourceIdByKey.entries()].find(([, sourceId]) => sourceId === targetSourceId)?.[0];
          const pairedPropertyKey =
            typeof property.pairedPropertyKey === 'string' ? property.pairedPropertyKey : '';
          const pairedPropertyId =
            typeof property.pairedPropertyId === 'string'
              ? property.pairedPropertyId
              : pairedPropertyKey && resolvedTargetSourceKey
                ? propertyIdsBySource.get(resolvedTargetSourceKey)?.get(pairedPropertyKey)
                : undefined;
          if (pairedPropertyKey && !pairedPropertyId) {
            throw new Error(
              `Relation "${property.key}" has unknown paired property key "${pairedPropertyKey}" in target source`,
            );
          }
          if (pairedPropertyId) {
            targetResolutions.push({
              kind: 'property',
              selector: `sources.${source.key}.properties.${property.key}.pairedProperty`,
              targetId: pairedPropertyId,
              via: typeof property.pairedPropertyId === 'string' ? 'explicit_id' : 'stable_key',
            });
          }
          return {
            ...base,
            targetSourceId,
            ...(pairedPropertyId ? { pairedPropertyId } : {}),
            ...(property.cardinality === 'one' || property.cardinality === 'many'
              ? { cardinality: property.cardinality }
              : {}),
          };
        }
        if (property.type === 'unique_id') {
          const currentUniqueId =
            currentProperty?.type === 'unique_id' ? currentProperty : undefined;
          return {
            ...base,
            required: false,
            prefix:
              typeof property.prefix === 'string'
                ? property.prefix
                : (currentUniqueId?.prefix ?? property.key.toUpperCase()),
            nextNumber:
              typeof property.nextNumber === 'number'
                ? property.nextNumber
                : (currentUniqueId?.nextNumber ?? 1),
          };
        }
        if (property.type === 'place') {
          const currentPlace = currentProperty?.type === 'place' ? currentProperty : undefined;
          return {
            ...base,
            externalSearch:
              property.externalSearch === 'explicit' || property.externalSearch === 'disabled'
                ? property.externalSearch
                : (currentPlace?.externalSearch ?? 'disabled'),
            externalMap:
              property.externalMap === 'explicit' || property.externalMap === 'disabled'
                ? property.externalMap
                : (currentPlace?.externalMap ?? 'disabled'),
          };
        }
        if (property.type === 'button') {
          if (typeof property.label !== 'string' || !Array.isArray(property.actions)) {
            throw new Error(`Button "${property.key}" requires a label and actions`);
          }
          const actions = property.actions.map((rawAction: unknown, actionIndex: number) => {
            if (!rawAction || typeof rawAction !== 'object' || Array.isArray(rawAction)) {
              throw new Error(`Button "${property.key}" has an invalid action`);
            }
            const action = rawAction as Record<string, unknown>;
            const common = { id: action.id, kind: action.kind };
            const resolvePropertyId = (
              sourceKey: string,
              explicitId: unknown,
              stableKey: unknown,
              selector: string,
            ): string => {
              const byKey =
                typeof stableKey === 'string'
                  ? propertyIdsBySource.get(sourceKey)?.get(stableKey)
                  : undefined;
              const propertyId = typeof explicitId === 'string' ? explicitId : byKey;
              if (!propertyId) {
                throw new Error(
                  `Button "${property.key}" action "${String(action.id)}" references unknown property key "${String(stableKey ?? '')}"`,
                );
              }
              targetResolutions.push({
                kind: 'property',
                selector,
                targetId: propertyId,
                via: typeof explicitId === 'string' ? 'explicit_id' : 'stable_key',
              });
              return propertyId;
            };
            if (action.kind === 'update_record') {
              if (!Array.isArray(action.operations)) {
                throw new Error(`Button update action "${String(action.id)}" requires operations`);
              }
              return {
                ...common,
                operations: action.operations.map(
                  (rawOperation: unknown, operationIndex: number) => {
                    if (
                      !rawOperation ||
                      typeof rawOperation !== 'object' ||
                      Array.isArray(rawOperation)
                    ) {
                      throw new Error(`Button update action "${String(action.id)}" is invalid`);
                    }
                    const operation = rawOperation as Record<string, unknown>;
                    if (
                      operation.op === 'append' &&
                      operation.propertyId === undefined &&
                      operation.propertyKey === undefined
                    ) {
                      return operation;
                    }
                    const propertyId = resolvePropertyId(
                      source.key,
                      operation.propertyId,
                      operation.propertyKey,
                      `sources.${source.key}.properties.${property.key}.actions.${actionIndex}.operations.${operationIndex}.property`,
                    );
                    const { propertyKey: _propertyKey, ...canonical } = operation;
                    return { ...canonical, propertyId };
                  },
                ),
              };
            }
            if (action.kind === 'create_record') {
              const targetSourceKey =
                typeof action.sourceKey === 'string'
                  ? action.sourceKey
                  : [...sourceIdByKey.entries()].find(([, id]) => id === action.sourceId)?.[0];
              const targetSourceId =
                typeof action.sourceId === 'string'
                  ? action.sourceId
                  : targetSourceKey
                    ? sourceIdByKey.get(targetSourceKey)
                    : undefined;
              if (!targetSourceKey || !targetSourceId) {
                throw new Error(
                  `Button create action "${String(action.id)}" references an unknown source`,
                );
              }
              targetResolutions.push({
                kind: 'source',
                selector: `sources.${source.key}.properties.${property.key}.actions.${actionIndex}.source`,
                targetId: targetSourceId,
                via: typeof action.sourceId === 'string' ? 'explicit_id' : 'stable_key',
              });
              if (
                !action.values ||
                typeof action.values !== 'object' ||
                Array.isArray(action.values)
              ) {
                throw new Error(`Button create action "${String(action.id)}" requires values`);
              }
              const targetIds = propertyIdsBySource.get(targetSourceKey);
              const canonicalValues = Object.fromEntries(
                Object.entries(action.values).map(([reference, value]) => {
                  const propertyId = [...(targetIds?.values() ?? [])].includes(reference)
                    ? reference
                    : targetIds?.get(reference);
                  if (!propertyId) {
                    throw new Error(
                      `Button create action "${String(action.id)}" references unknown property "${reference}"`,
                    );
                  }
                  targetResolutions.push({
                    kind: 'property',
                    selector: `sources.${source.key}.properties.${property.key}.actions.${actionIndex}.values.${reference}`,
                    targetId: propertyId,
                    via: propertyId === reference ? 'explicit_id' : 'stable_key',
                  });
                  return [propertyId, value];
                }),
              );
              return {
                ...common,
                sourceId: targetSourceId,
                values: canonicalValues,
                ...(typeof action.body === 'string' ? { body: action.body } : {}),
              };
            }
            if (action.kind === 'external_webhook') {
              const propertyReferences = Array.isArray(action.propertyIds)
                ? action.propertyIds
                : Array.isArray(action.propertyKeys)
                  ? action.propertyKeys
                  : [];
              return {
                ...common,
                connectionId: action.connectionId,
                eventName: action.eventName,
                propertyIds: propertyReferences.map((reference, propertyIndex) =>
                  resolvePropertyId(
                    source.key,
                    Array.isArray(action.propertyIds) ? reference : undefined,
                    Array.isArray(action.propertyKeys) ? reference : undefined,
                    `sources.${source.key}.properties.${property.key}.actions.${actionIndex}.properties.${propertyIndex}`,
                  ),
                ),
                ...(typeof action.includeBody === 'boolean'
                  ? { includeBody: action.includeBody }
                  : {}),
              };
            }
            if (action.kind === 'archive_record') {
              return { ...common, action: action.action };
            }
            throw new Error(
              `Button "${property.key}" has unsupported action kind "${String(action.kind)}"`,
            );
          });
          return {
            ...base,
            label: property.label,
            ...(property.confirmation &&
            typeof property.confirmation === 'object' &&
            !Array.isArray(property.confirmation)
              ? { confirmation: property.confirmation }
              : {}),
            actions,
          };
        }
        if (property.type === 'formula') {
          if (typeof property.source !== 'string') {
            throw new Error(`Formula "${property.key}" requires source`);
          }
          if (!property.ast || typeof property.ast !== 'object' || Array.isArray(property.ast)) {
            throw new Error(`Formula "${property.key}" requires a canonical AST`);
          }
          return {
            ...base,
            source: property.source,
            ast: property.ast,
          };
        }
        if (property.type === 'rollup') {
          const relationPropertyKey =
            typeof property.relationPropertyKey === 'string'
              ? property.relationPropertyKey
              : undefined;
          const relationPropertyId =
            typeof property.relationPropertyId === 'string'
              ? property.relationPropertyId
              : relationPropertyKey
                ? propertyIdsBySource.get(source.key)?.get(relationPropertyKey)
                : undefined;
          if (!relationPropertyId) {
            throw new Error(
              `Rollup "${property.key}" has unknown relation property key "${relationPropertyKey ?? ''}"`,
            );
          }
          const relationDraft = source.properties.find(
            (candidate) =>
              candidate.type === 'relation' &&
              (candidate.id === relationPropertyId ||
                propertyIdsBySource.get(source.key)?.get(candidate.key) === relationPropertyId),
          );
          const currentRelationCandidate = currentSource?.properties.find(
            (candidate) => candidate.id === relationPropertyId,
          );
          const currentRelation =
            currentRelationCandidate?.type === 'relation' ? currentRelationCandidate : undefined;
          const targetSourceKey =
            relationDraft && typeof relationDraft.targetSourceKey === 'string'
              ? relationDraft.targetSourceKey
              : relationDraft && typeof relationDraft.targetSourceId === 'string'
                ? [...sourceIdByKey.entries()].find(
                    ([, sourceId]) => sourceId === relationDraft.targetSourceId,
                  )?.[0]
                : currentRelation
                  ? [...sourceIdByKey.entries()].find(
                      ([, sourceId]) => sourceId === currentRelation.targetSourceId,
                    )?.[0]
                  : undefined;
          const targetPropertyKey =
            typeof property.targetPropertyKey === 'string' ? property.targetPropertyKey : undefined;
          const targetPropertyId =
            typeof property.targetPropertyId === 'string'
              ? property.targetPropertyId
              : targetSourceKey && targetPropertyKey
                ? propertyIdsBySource.get(targetSourceKey)?.get(targetPropertyKey)
                : undefined;
          if (!targetPropertyId) {
            throw new Error(
              `Rollup "${property.key}" has unknown target property key "${targetPropertyKey ?? ''}"`,
            );
          }
          if (typeof property.function !== 'string') {
            throw new Error(`Rollup "${property.key}" requires a function`);
          }
          if (typeof property.targetValueType !== 'string') {
            throw new Error(`Rollup "${property.key}" requires targetValueType`);
          }
          targetResolutions.push(
            {
              kind: 'property',
              selector: `sources.${source.key}.properties.${property.key}.relationProperty`,
              targetId: relationPropertyId,
              via: typeof property.relationPropertyId === 'string' ? 'explicit_id' : 'stable_key',
            },
            {
              kind: 'property',
              selector: `sources.${source.key}.properties.${property.key}.targetProperty`,
              targetId: targetPropertyId,
              via: typeof property.targetPropertyId === 'string' ? 'explicit_id' : 'stable_key',
            },
          );
          return {
            ...base,
            relationPropertyId,
            targetPropertyId,
            function: property.function,
            targetValueType: property.targetValueType,
            ...(typeof property.targetItemType === 'string'
              ? { targetItemType: property.targetItemType }
              : {}),
          };
        }
        return base;
      }),
    })) as unknown as DatabaseDefinition['sources'];
    const normalizedSourceMappings =
      desiredState.sourceMappings === undefined
        ? (currentDefinition?.sourceMappings ?? [])
        : desiredState.sourceMappings.map((mapping) => {
            const sourceId = sourceIdByKey.get(mapping.sourceKey);
            const targetSourceId = sourceIdByKey.get(mapping.targetSourceKey);
            const source = normalizedSources.find((candidate) => candidate.id === sourceId);
            const target = normalizedSources.find((candidate) => candidate.id === targetSourceId);
            if (!source || !target) {
              throw new Error(
                `Source mapping references unknown source keys "${mapping.sourceKey}" and "${mapping.targetSourceKey}"`,
              );
            }
            return {
              sourceId,
              targetSourceId,
              propertyMappings: mapping.propertyMappings.map((propertyMapping) => {
                const sourceProperty = source.properties.find(
                  (property) => property.key === propertyMapping.sourcePropertyKey,
                );
                const targetProperty = target.properties.find(
                  (property) => property.key === propertyMapping.targetPropertyKey,
                );
                if (!sourceProperty || !targetProperty) {
                  throw new Error(
                    `Source mapping references unknown property keys "${propertyMapping.sourcePropertyKey}" and "${propertyMapping.targetPropertyKey}"`,
                  );
                }
                const sourceOptions =
                  'options' in sourceProperty ? sourceProperty.options : undefined;
                const targetOptions =
                  'options' in targetProperty ? targetProperty.options : undefined;
                return {
                  sourcePropertyId: sourceProperty.id,
                  targetPropertyId: targetProperty.id,
                  optionMappings: propertyMapping.optionMappings.map((optionMapping) => {
                    const sourceOption = sourceOptions?.find(
                      (option) => option.key === optionMapping.sourceOptionKey,
                    );
                    const targetOption = targetOptions?.find(
                      (option) => option.key === optionMapping.targetOptionKey,
                    );
                    if (!sourceOption || !targetOption) {
                      throw new Error(
                        `Source mapping references unknown option keys "${optionMapping.sourceOptionKey}" and "${optionMapping.targetOptionKey}"`,
                      );
                    }
                    return {
                      sourceOptionId: sourceOption.id,
                      targetOptionId: targetOption.id,
                    };
                  }),
                };
              }),
            };
          });
    const normalizedViews = desiredState.views.map((view) => {
      const sourceId = sourceIdByKey.get(view.sourceKey);
      const propertyIds = propertyIdsBySource.get(view.sourceKey);
      if (!sourceId || !propertyIds)
        throw new Error(`View "${view.key}" has an unknown source key`);
      const raw = view as Record<string, unknown>;
      const projection = (raw.projection ?? {}) as Record<string, unknown>;
      const projectionPropertyIds = Array.isArray(projection.propertyIds)
        ? projection.propertyIds.map(String)
        : null;
      const propertyKeys = Array.isArray(projection.propertyKeys)
        ? projection.propertyKeys.map(String)
        : projectionPropertyIds
          ? []
          : [...propertyIds.keys()];
      const knownPropertyIds = new Set(propertyIds.values());
      const propertiesById = new Map(
        normalizedSources
          .find((source) => source.id === sourceId)
          ?.properties.map((property) => [property.id, property] as const) ?? [],
      );
      const resolveViewPropertyId = (entry: Record<string, unknown>, context: string) => {
        const explicit = String(entry.propertyId ?? '');
        const resolved = knownPropertyIds.has(explicit)
          ? explicit
          : propertyIds.get(String(entry.propertyKey ?? ''));
        if (!resolved) throw new Error(`View "${view.key}" ${context} has an unknown property`);
        return resolved;
      };
      const currentView = currentDefinition?.views.find((candidate) => candidate.key === view.key);
      const viewId = view.id ?? currentView?.id ?? `view_${compactUuid(this.#generateUuid)}`;
      targetResolutions.push({
        kind: 'view',
        selector: `views.${view.key}`,
        targetId: viewId,
        via: view.id ? 'explicit_id' : currentView ? 'stable_key' : 'generated',
      });
      const conditionalColors = Array.isArray(raw.conditionalColors)
        ? raw.conditionalColors.map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              throw new Error(
                `View "${view.key}" conditional color ${index + 1} must be an object`,
              );
            }
            const item = entry as Record<string, unknown>;
            const key = String(item.key ?? '');
            if (!key) {
              throw new Error(`View "${view.key}" conditional color ${index + 1} needs a key`);
            }
            const currentRule = currentView?.conditionalColors.find(
              (candidate) => candidate.key === key,
            );
            const explicitId = typeof item.id === 'string' ? item.id : undefined;
            const id = explicitId ?? currentRule?.id ?? `ccr_${compactUuid(this.#generateUuid)}`;
            targetResolutions.push({
              kind: 'conditional_color_rule',
              selector: `views.${view.key}.conditionalColors.${key}`,
              targetId: id,
              via: explicitId ? 'explicit_id' : currentRule ? 'stable_key' : 'generated',
            });
            const applyTo = item.applyTo;
            if (!applyTo || typeof applyTo !== 'object' || Array.isArray(applyTo)) {
              throw new Error(
                `View "${view.key}" conditional color "${key}" needs an applyTo object`,
              );
            }
            const target = applyTo as Record<string, unknown>;
            return {
              id,
              key,
              name: item.name,
              color: item.color,
              where: filterWithPropertyIds(
                item.where,
                propertyIds,
                propertiesById,
                normalizedPeople as DatabasePerson[],
              ),
              applyTo:
                target.type === 'page'
                  ? { type: 'page' as const }
                  : target.type === 'property'
                    ? {
                        type: 'property' as const,
                        propertyId: resolveViewPropertyId(target, 'conditional color target'),
                      }
                    : (() => {
                        throw new Error(
                          `View "${view.key}" conditional color "${key}" has an invalid target`,
                        );
                      })(),
            };
          })
        : [];
      return {
        id: viewId,
        key: view.key,
        name: view.name,
        ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
        ...(typeof raw.favorite === 'boolean' ? { favorite: raw.favorite } : {}),
        sourceId,
        layout: view.layout,
        ...(raw.where
          ? {
              where: filterWithPropertyIds(
                raw.where,
                propertyIds,
                propertiesById,
                normalizedPeople as DatabasePerson[],
              ),
            }
          : {}),
        conditionalColors,
        sort: Array.isArray(raw.sort)
          ? raw.sort.map((entry) => {
              const item = entry as Record<string, unknown>;
              return {
                propertyId: resolveViewPropertyId(item, 'sort'),
                direction: item.direction,
              };
            })
          : [],
        groups: Array.isArray(raw.groups)
          ? raw.groups.map((entry) => {
              const item = entry as Record<string, unknown>;
              return {
                propertyId: resolveViewPropertyId(item, 'group'),
                direction: item.direction,
                ...(typeof item.hideEmpty === 'boolean' ? { hideEmpty: item.hideEmpty } : {}),
              };
            })
          : [],
        projection: {
          propertyIds: projectionPropertyIds
            ? projectionPropertyIds.map((propertyId) => {
                if (!knownPropertyIds.has(propertyId)) {
                  throw new Error(
                    `View "${view.key}" projection has unknown property ID "${propertyId}"`,
                  );
                }
                return propertyId;
              })
            : propertyKeys.map((key) => {
                const propertyId = propertyIds.get(key);
                if (!propertyId)
                  throw new Error(
                    `View "${view.key}" projection has unknown property key "${key}"`,
                  );
                return propertyId;
              }),
          ...(projection.body === 'hidden' ||
          projection.body === 'preview' ||
          projection.body === 'full'
            ? { body: projection.body }
            : {}),
        },
        ...(raw.agent && typeof raw.agent === 'object' && !Array.isArray(raw.agent)
          ? { agent: raw.agent }
          : {}),
      };
    });
    const normalizedTemplates = desiredState.templates.map((template, templateIndex) => {
      const sourceId = sourceIdByKey.get(template.sourceKey);
      const source = normalizedSources.find((candidate) => candidate.id === sourceId);
      if (!sourceId || !source) {
        throw new Error(
          `Template "${template.key}" has unknown source key "${template.sourceKey}"`,
        );
      }
      const currentTemplate = currentDefinition?.templates.find(
        (candidate) => candidate.key === template.key,
      );
      const id = template.id ?? currentTemplate?.id ?? `tpl_${compactUuid(this.#generateUuid)}`;
      targetResolutions.push({
        kind: 'template',
        selector: `templates.${template.key}`,
        targetId: id,
        via: template.id ? 'explicit_id' : currentTemplate ? 'stable_key' : 'generated',
      });
      const propertyValues: Record<string, unknown> = {};
      for (const [propertyKey, value] of Object.entries(template.propertyValues)) {
        const property = source.properties.find((candidate) => candidate.key === propertyKey);
        if (!property) {
          throw new Error(
            `Template "${template.key}" references unknown property key "${propertyKey}"`,
          );
        }
        propertyValues[property.id] = normalizeSampleValue(
          property,
          value,
          normalizedPeople as DatabasePerson[],
        );
      }
      const viewIds = (template.defaultFor?.viewKeys ?? []).map((viewKey) => {
        const view = normalizedViews.find(
          (candidate) => candidate.key === viewKey && candidate.sourceId === sourceId,
        );
        if (!view) {
          throw new Error(`Template "${template.key}" references unknown view key "${viewKey}"`);
        }
        return view.id;
      });
      const repeat = template.repeat
        ? (() => {
            const owner = normalizedPeople.find(
              (person) => person.key === template.repeat?.ownerKey,
            );
            if (!owner) {
              throw new Error(
                `Template "${template.key}" references unknown owner key "${template.repeat.ownerKey}"`,
              );
            }
            return {
              schedule: structuredClone(template.repeat.schedule),
              timeZone: template.repeat.timeZone,
              ownerId: owner.id,
              paused: template.repeat.paused,
              ...(template.repeat.retry ? { retry: structuredClone(template.repeat.retry) } : {}),
            };
          })()
        : undefined;
      return {
        id,
        key: template.key,
        name: template.name,
        ...(template.description ? { description: template.description } : {}),
        sourceId,
        propertyValues,
        body: template.body ?? template.markdown ?? '',
        order: template.order ?? currentTemplate?.order ?? templateIndex,
        archivedAt: template.archivedAt ?? currentTemplate?.archivedAt ?? null,
        defaultFor: {
          source: template.defaultFor?.source ?? false,
          viewIds,
          entryPoints: template.defaultFor?.entryPoints ?? [],
        },
        ...(repeat ? { repeat } : {}),
      };
    });
    const normalizedButtons = desiredState.buttons.map((button) => {
      const currentButton = currentDefinition?.buttons.find(
        (candidate) => candidate.key === button.key,
      );
      const id = button.id ?? currentButton?.id ?? `dbbtn_${compactUuid(this.#generateUuid)}`;
      targetResolutions.push({
        kind: 'action_button',
        selector: `buttons.${button.key}`,
        targetId: id,
        via: button.id ? 'explicit_id' : currentButton ? 'stable_key' : 'generated',
      });
      const placement =
        button.placement.kind === 'database'
          ? { kind: 'database' as const }
          : (() => {
              const sourceId = sourceIdByKey.get(button.placement.sourceKey);
              if (!sourceId) {
                throw new Error(
                  `Database button "${button.key}" has unknown placement source "${button.placement.sourceKey}"`,
                );
              }
              return { kind: 'source' as const, sourceId };
            })();
      return {
        id,
        key: button.key,
        name: button.name,
        ...(button.description ? { description: button.description } : {}),
        placement,
        ...(button.confirmation ? { confirmation: button.confirmation } : {}),
        actions: button.actions.map((action) => {
          const sourceId = sourceIdByKey.get(action.sourceKey);
          const source = normalizedSources.find((candidate) => candidate.id === sourceId);
          if (!sourceId || !source) {
            throw new Error(
              `Database button "${button.key}" action "${action.id}" has unknown source "${action.sourceKey}"`,
            );
          }
          const values: Record<string, unknown> = {};
          for (const [propertyKey, value] of Object.entries(action.values)) {
            const property = source.properties.find((candidate) => candidate.key === propertyKey);
            if (!property) {
              throw new Error(
                `Database button "${button.key}" action "${action.id}" has unknown property "${propertyKey}"`,
              );
            }
            values[property.id] = normalizeSampleValue(
              property,
              value,
              normalizedPeople as DatabasePerson[],
            );
          }
          return { id: action.id, kind: action.kind, sourceId, values, body: action.body };
        }),
      };
    });
    const normalizedAutomations = (
      desiredState.automations ??
      currentDefinition?.automations ??
      []
    ).map((automation) => {
      if ('ownerId' in automation) return structuredClone(automation);
      const currentAutomation = currentDefinition?.automations.find(
        (candidate) => candidate.key === automation.key,
      );
      const id =
        automation.id ?? currentAutomation?.id ?? `auto_${compactUuid(this.#generateUuid)}`;
      targetResolutions.push({
        kind: 'automation',
        selector: `automations.${automation.key}`,
        targetId: id,
        via: automation.id ? 'explicit_id' : currentAutomation ? 'stable_key' : 'generated',
      });
      const owner = normalizedPeople.find((person) => person.key === automation.ownerKey);
      if (!owner)
        throw new Error(
          `Automation "${automation.key}" has unknown owner "${automation.ownerKey}"`,
        );
      const sourceForKey = (sourceKey: string) => {
        const source = normalizedSources.find((candidate) => candidate.key === sourceKey);
        if (!source)
          throw new Error(`Automation "${automation.key}" has unknown source "${sourceKey}"`);
        return source;
      };
      const propertyForKey = (
        source: DatabaseDefinition['sources'][number],
        propertyKey: string,
      ) => {
        const property = source.properties.find((candidate) => candidate.key === propertyKey);
        if (!property) {
          throw new Error(
            `Automation "${automation.key}" has unknown property "${propertyKey}" in source "${source.key}"`,
          );
        }
        return property;
      };
      const trigger = (() => {
        const input = automation.trigger;
        if (input.kind === 'schedule') {
          return {
            kind: input.kind,
            schedule: structuredClone(input.schedule),
            timeZone: input.timeZone,
          };
        }
        if (input.kind === 'form_submitted') {
          const view = normalizedViews.find((candidate) => candidate.key === input.viewKey);
          if (!view)
            throw new Error(`Automation "${automation.key}" has unknown view "${input.viewKey}"`);
          return { kind: input.kind, viewId: view.id };
        }
        if (input.kind === 'button_invoked' && 'buttonKey' in input) {
          const button = normalizedButtons.find((candidate) => candidate.key === input.buttonKey);
          if (!button) {
            throw new Error(
              `Automation "${automation.key}" has unknown Button "${input.buttonKey}"`,
            );
          }
          return { kind: input.kind, buttonId: button.id };
        }
        const source = sourceForKey(input.sourceKey);
        if (input.kind === 'record_added') return { kind: input.kind, sourceId: source.id };
        const property = propertyForKey(source, input.propertyKey);
        return input.kind === 'property_changed'
          ? { kind: input.kind, sourceId: source.id, propertyId: property.id }
          : { kind: input.kind, propertyId: property.id };
      })();
      const triggerSource = (() => {
        if ('sourceId' in trigger) {
          return normalizedSources.find((source) => source.id === trigger.sourceId) ?? null;
        }
        if ('viewId' in trigger) {
          const view = normalizedViews.find((candidate) => candidate.id === trigger.viewId);
          return normalizedSources.find((source) => source.id === view?.sourceId) ?? null;
        }
        if ('propertyId' in trigger) {
          return (
            normalizedSources.find((source) =>
              source.properties.some((property) => property.id === trigger.propertyId),
            ) ?? null
          );
        }
        if ('buttonId' in trigger) {
          const button = normalizedButtons.find((candidate) => candidate.id === trigger.buttonId);
          const placement = button?.placement;
          return placement?.kind === 'source'
            ? (normalizedSources.find((source) => source.id === placement.sourceId) ?? null)
            : null;
        }
        return null;
      })();
      const eventValue = (value: unknown): unknown => {
        const parsed = DatabaseAutomationEventValueDraftSchema.safeParse(value);
        if (!parsed.success) return structuredClone(value);
        if (parsed.data.fromEvent !== 'property') return { fromEvent: parsed.data.fromEvent };
        if (!triggerSource || !parsed.data.propertyKey) {
          throw new Error(`Automation "${automation.key}" event property has no trigger source`);
        }
        return {
          fromEvent: 'property' as const,
          propertyId: propertyForKey(triggerSource, parsed.data.propertyKey).id,
        };
      };
      const actions = automation.actions.map((action) => {
        if (action.kind === 'create_record') {
          const source = sourceForKey(action.sourceKey);
          return {
            id: action.id,
            kind: action.kind,
            sourceId: source.id,
            values: Object.fromEntries(
              Object.entries(action.values).map(([propertyKey, value]) => [
                propertyForKey(source, propertyKey).id,
                eventValue(value),
              ]),
            ),
            ...(action.body === undefined ? {} : { body: eventValue(action.body) }),
          };
        }
        if (action.kind === 'update_trigger_record') {
          if (!triggerSource)
            throw new Error(`Automation "${automation.key}" update has no trigger source`);
          return {
            id: action.id,
            kind: action.kind,
            operations: action.operations.map((operation) => {
              if (operation.op === 'append' && operation.propertyKey === undefined) {
                return { op: operation.op, value: operation.value };
              }
              const property = propertyForKey(triggerSource, String(operation.propertyKey));
              const { propertyKey: _propertyKey, ...rest } = operation;
              return { ...rest, propertyId: property.id };
            }),
          };
        }
        if (action.kind === 'change_relation') {
          if (!triggerSource)
            throw new Error(`Automation "${automation.key}" relation has no trigger source`);
          return {
            id: action.id,
            kind: action.kind,
            propertyId: propertyForKey(triggerSource, action.propertyKey).id,
            operation: action.operation,
            recordId: action.recordId,
          };
        }
        if (action.kind === 'assign_person') {
          if (!triggerSource)
            throw new Error(`Automation "${automation.key}" assignment has no trigger source`);
          const person = normalizedPeople.find((candidate) => candidate.key === action.personKey);
          if (!person)
            throw new Error(
              `Automation "${automation.key}" has unknown person "${action.personKey}"`,
            );
          return {
            id: action.id,
            kind: action.kind,
            propertyId: propertyForKey(triggerSource, action.propertyKey).id,
            operation: action.operation,
            personId: person.id,
          };
        }
        if (action.kind === 'notification') {
          return {
            id: action.id,
            kind: action.kind,
            recipientIds: action.recipientKeys.map((personKey) => {
              const person = normalizedPeople.find((candidate) => candidate.key === personKey);
              if (!person)
                throw new Error(
                  `Automation "${automation.key}" has unknown recipient "${personKey}"`,
                );
              return person.id;
            }),
            title: action.title,
            body: action.body,
          };
        }
        if (action.kind === 'apply_template') {
          const template = normalizedTemplates.find(
            (candidate) => candidate.key === action.templateKey,
          );
          if (!template)
            throw new Error(
              `Automation "${automation.key}" has unknown template "${action.templateKey}"`,
            );
          return { id: action.id, kind: action.kind, templateId: template.id };
        }
        if (!triggerSource && (action.propertyKeys.length > 0 || action.includeBody)) {
          throw new Error(
            `Automation "${automation.key}" egress has no record-backed trigger source`,
          );
        }
        const propertyIds = action.propertyKeys.map((propertyKey) => {
          if (!triggerSource) {
            throw new Error(`Automation "${automation.key}" egress has no trigger source`);
          }
          return propertyForKey(triggerSource, propertyKey).id;
        });
        return action.kind === 'external_webhook'
          ? {
              id: action.id,
              kind: action.kind,
              connectionId: action.connectionId,
              eventName: action.eventName,
              propertyIds,
              includeBody: action.includeBody,
            }
          : {
              id: action.id,
              kind: action.kind,
              connectionId: action.connectionId,
              to: action.to,
              subject: action.subject,
              propertyIds,
              includeBody: action.includeBody,
            };
      });
      return {
        id,
        key: automation.key,
        name: automation.name,
        ...(automation.description ? { description: automation.description } : {}),
        version: automation.version,
        enabled: automation.enabled,
        ownerId: owner.id,
        trigger,
        actions,
        ...(automation.retry ? { retry: structuredClone(automation.retry) } : {}),
        ...(automation.limits ? { limits: structuredClone(automation.limits) } : {}),
      };
    });
    const rawDefinition = {
      version: 1,
      id: databaseId,
      key: desiredState.database.key,
      name: desiredState.database.name,
      ...(desiredState.database.description === undefined
        ? {}
        : { description: desiredState.database.description }),
      ...(desiredState.database.icon === undefined ? {} : { icon: desiredState.database.icon }),
      ...(desiredState.database.cover === undefined ? {} : { cover: desiredState.database.cover }),
      aliases: desiredState.database.aliases ?? [],
      people: normalizedPeople,
      contract: desiredState.database.contract,
      sources: normalizedSources,
      ...(normalizedSourceMappings.length > 0 ? { sourceMappings: normalizedSourceMappings } : {}),
      views: normalizedViews,
      templates: normalizedTemplates,
      buttons: normalizedButtons,
      automations: normalizedAutomations,
    };
    let definition = DatabaseDefinitionSchema.parse(rawDefinition);
    let uniquePropertyId: string | null = null;
    if (desiredState.uniqueKey) {
      uniquePropertyId =
        propertyIdsBySource
          .get(desiredState.uniqueKey.sourceKey)
          ?.get(desiredState.uniqueKey.propertyKey) ?? null;
      if (!uniquePropertyId)
        throw new Error('Unique key references an unknown source/property key');
      definition = DatabaseDefinitionSchema.parse({
        ...definition,
        sources: definition.sources.map((source) => ({
          ...source,
          properties: source.properties.map((property) =>
            property.id === uniquePropertyId
              ? {
                  ...property,
                  semantics: {
                    ...property.semantics,
                    constraints: {
                      ...property.semantics.constraints,
                      unique: true,
                    },
                  },
                }
              : property,
          ),
        })),
      });
    }
    const explicitSampleRecords = desiredState.sampleRecords.map((sample, sampleIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === sample.sourceKey);
      if (!source) throw new Error(`Sample record has unknown source key "${sample.sourceKey}"`);
      const values: Record<string, unknown> = {};
      for (const [propertyKey, value] of Object.entries(sample.values)) {
        const property = source.properties.find((candidate) => candidate.key === propertyKey);
        if (!property) throw new Error(`Sample record has unknown property key "${propertyKey}"`);
        try {
          const normalizedValue = normalizeSampleValue(property, value, definition.people);
          values[property.id] = normalizedValue;
          if (property.type === 'select' || property.type === 'status') {
            const option = property.options.find((candidate) => candidate.id === normalizedValue);
            if (option) {
              targetResolutions.push({
                kind: 'option',
                selector: `sampleRecords.${sampleIndex}.values.${propertyKey}`,
                targetId: option.id,
                via:
                  value === option.id
                    ? 'explicit_id'
                    : value === option.key
                      ? 'stable_key'
                      : 'exact_name',
              });
            }
          } else if (property.type === 'multi_select' && Array.isArray(normalizedValue)) {
            normalizedValue.forEach((optionId, optionIndex) => {
              const option = property.options.find((candidate) => candidate.id === optionId);
              const input = Array.isArray(value) ? value[optionIndex] : undefined;
              if (!option) return;
              targetResolutions.push({
                kind: 'option',
                selector: `sampleRecords.${sampleIndex}.values.${propertyKey}.${optionIndex}`,
                targetId: option.id,
                via:
                  input === option.id
                    ? 'explicit_id'
                    : input === option.key
                      ? 'stable_key'
                      : 'exact_name',
              });
            });
          } else if (property.type === 'person' && Array.isArray(normalizedValue)) {
            normalizedValue.forEach((personId, personIndex) => {
              const person = definition.people.find((candidate) => candidate.id === personId);
              const input = Array.isArray(value) ? value[personIndex] : undefined;
              if (!person) return;
              targetResolutions.push({
                kind: 'person',
                selector: `sampleRecords.${sampleIndex}.values.${propertyKey}.${personIndex}`,
                targetId: person.id,
                via:
                  input === person.id
                    ? 'explicit_id'
                    : input === person.key
                      ? 'stable_key'
                      : 'exact_name',
              });
            });
          } else if (property.type === 'relation') {
            const recordIds = Array.isArray(normalizedValue)
              ? normalizedValue.map(String)
              : [String(normalizedValue)];
            recordIds.forEach((recordId, relationIndex) => {
              targetResolutions.push({
                kind: 'record',
                selector: `sampleRecords.${sampleIndex}.values.${propertyKey}.${relationIndex}`,
                targetId: recordId,
                via: 'explicit_id',
              });
            });
          }
        } catch (error) {
          throw new Error(
            `Sample property "${propertyKey}" is invalid: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      for (const property of source.properties) {
        if (values[property.id] === undefined && property.semantics.defaultValue !== undefined) {
          values[property.id] = normalizeSampleValue(
            property,
            structuredClone(property.semantics.defaultValue),
            definition.people,
          );
        }
      }
      let recordId = sample.id;
      let expectedRevision = sample.expectedRevision ?? null;
      let resolutionVia: DatabaseTargetResolution['via'] = sample.id ? 'explicit_id' : 'generated';
      if (!recordId && uniquePropertyId && values[uniquePropertyId] !== undefined) {
        const matches = (this.#databaseRecordIndex?.list(databaseId, source.id) ?? []).filter(
          (record) => same(record.values[uniquePropertyId], values[uniquePropertyId]),
        );
        if (matches.length > 1) {
          throw new Error(
            `Sample record unique key resolves ambiguously to ${matches.length} records`,
          );
        }
        const match = matches[0];
        if (match) {
          if (!match.revision) throw new Error(`Record "${match.id}" has no stable revision`);
          recordId = match.id;
          expectedRevision ??= match.revision;
          resolutionVia = 'unique_property';
        }
      }
      recordId ??= `rec_${compactUuid(this.#generateUuid)}`;
      if (sample.pageLayoutOverride) {
        const layoutIssues = databaseRecordPageLayoutOverrideIssues(
          source,
          sample.pageLayoutOverride,
        );
        if (layoutIssues.length > 0) {
          throw new Error(
            `Sample record page layout override is invalid: ${layoutIssues.join('; ')}`,
          );
        }
      }
      targetResolutions.push({
        kind: 'record',
        selector: sample.id
          ? `sampleRecords.${sampleIndex}.id`
          : resolutionVia === 'unique_property'
            ? `sampleRecords.${sampleIndex}.uniqueKey`
            : `sampleRecords.${sampleIndex}`,
        targetId: recordId,
        via: resolutionVia,
      });
      return {
        id: recordId,
        sourceId: source.id,
        values,
        body: sample.body,
        expectedRevision,
        ...(sample.pageLayoutOverride !== undefined
          ? {
              pageLayoutOverride: sample.pageLayoutOverride
                ? structuredClone(sample.pageLayoutOverride)
                : null,
            }
          : {}),
      };
    });
    const explicitSampleIds = new Set(explicitSampleRecords.map((record) => record.id));
    const folderMigrationRecords = definition.sources.flatMap((source) => {
      const currentSource = currentDefinition?.sources.find(
        (candidate) => candidate.id === source.id,
      );
      if (
        source.folderOwnership !== 'database' ||
        !currentSource ||
        currentSource.folder === source.folder
      ) {
        return [];
      }
      return (this.#databaseRecordIndex?.list(databaseId, source.id) ?? [])
        .filter((record) => !explicitSampleIds.has(record.id))
        .map((record) => {
          if (!record.revision) {
            throw new Error(`Folder migration record "${record.id}" has no stable revision`);
          }
          return {
            id: record.id,
            sourceId: source.id,
            values: structuredClone(record.values) as Record<string, unknown>,
            body: record.body,
            expectedRevision: record.revision,
            archivedAt: record.archivedAt ?? null,
            ...(record.pageLayoutOverride
              ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
              : {}),
          };
        });
    });
    const implicitMigrationIds = new Set(folderMigrationRecords.map((record) => record.id));
    const uniqueIdBackfillRecords = definition.sources.flatMap((source) => {
      const currentSource = currentDefinition?.sources.find(
        (candidate) => candidate.id === source.id,
      );
      const addsUniqueId = source.properties.some(
        (property) =>
          property.type === 'unique_id' &&
          currentSource?.properties.find((candidate) => candidate.id === property.id)?.type !==
            'unique_id',
      );
      if (!addsUniqueId) return [];
      return (this.#databaseRecordIndex?.list(databaseId, source.id) ?? [])
        .filter(
          (record) => !explicitSampleIds.has(record.id) && !implicitMigrationIds.has(record.id),
        )
        .map((record) => {
          if (!record.revision) {
            throw new Error(`Unique ID backfill record "${record.id}" has no stable revision`);
          }
          return {
            id: record.id,
            sourceId: source.id,
            values: structuredClone(record.values) as Record<string, unknown>,
            body: record.body,
            expectedRevision: record.revision,
            archivedAt: record.archivedAt ?? null,
            ...(record.pageLayoutOverride
              ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
              : {}),
          };
        });
    });
    const recordCopies = desiredState.recordCopies.map((copy, copyIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === copy.sourceKey);
      if (!source) throw new Error(`Record copy has unknown source key "${copy.sourceKey}"`);
      const sourceRecord = this.#databaseRecordIndex?.getById(copy.id) ?? null;
      if (!sourceRecord) throw new Error(`Record copy source "${copy.id}" was not found`);
      if (sourceRecord.databaseId !== databaseId || sourceRecord.sourceId !== source.id) {
        throw new Error('Record copy source belongs to a different database or source');
      }
      if (!sourceRecord.revision)
        throw new Error(`Record copy source "${copy.id}" has no revision`);
      const titleProperty = source.properties.find((property) => property.type === 'title');
      if (!titleProperty)
        throw new Error(`Record copy source "${source.key}" has no title property`);
      const newRecordId = copy.newId ?? `rec_${compactUuid(this.#generateUuid)}`;
      if (newRecordId === sourceRecord.id)
        throw new Error('A record copy must use a new stable ID');
      targetResolutions.push({
        kind: 'record',
        selector: `recordCopies.${copyIndex}.id`,
        targetId: sourceRecord.id,
        via: 'explicit_id',
      });
      targetResolutions.push({
        kind: 'record',
        selector: copy.newId ? `recordCopies.${copyIndex}.newId` : `recordCopies.${copyIndex}`,
        targetId: newRecordId,
        via: copy.newId ? 'explicit_id' : 'generated',
      });
      return {
        sourceRecordId: sourceRecord.id,
        expectedRevision: copy.expectedRevision,
        sourcePath: sourceRecord.path,
        newRecordId,
        sample: {
          id: newRecordId,
          sourceId: source.id,
          values: { ...sourceRecord.values, [titleProperty.id]: copy.title },
          body: sourceRecord.body,
          expectedRevision: null,
          ...(sourceRecord.pageLayoutOverride
            ? { pageLayoutOverride: structuredClone(sourceRecord.pageLayoutOverride) }
            : {}),
        },
      };
    });
    const archiveTimestamp = this.#now().toISOString();
    const recordArchives = desiredState.recordArchives.map((archive, archiveIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === archive.sourceKey);
      if (!source) throw new Error(`Record archive has unknown source key "${archive.sourceKey}"`);
      const record = this.#databaseRecordIndex?.getById(archive.id) ?? null;
      if (!record) throw new Error(`Record archive target "${archive.id}" was not found`);
      if (record.databaseId !== databaseId || record.sourceId !== source.id) {
        throw new Error('Record archive target belongs to a different database or source');
      }
      if (!record.revision)
        throw new Error(`Record archive target "${archive.id}" has no revision`);
      const archivedAt =
        archive.action === 'archive' ? (record.archivedAt ?? archiveTimestamp) : null;
      targetResolutions.push({
        kind: 'record',
        selector: `recordArchives.${archiveIndex}.id`,
        targetId: record.id,
        via: 'explicit_id',
      });
      return {
        recordId: record.id,
        action: archive.action,
        archivedAt,
        sample: {
          id: record.id,
          sourceId: source.id,
          values: record.values,
          body: record.body,
          expectedRevision: archive.expectedRevision,
          archivedAt,
          ...(record.pageLayoutOverride
            ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
            : {}),
        },
      };
    });
    const reservedMoveTargetPaths = new Set(
      (this.#databaseRecordIndex?.list(databaseId) ?? []).map((record) => record.path),
    );
    const allocateMoveTargetPath = (
      target: DatabaseDefinition['sources'][number],
      values: Readonly<Record<string, unknown>>,
      recordId: string,
    ): string => {
      const prefix = target.folder === '.' ? '' : `${target.folder}/`;
      if (target.folderOwnership !== 'database') return `${prefix}${recordId}.md`;
      const titleProperty = target.properties.find((property) => property.type === 'title');
      const baseName = databaseRecordNameFromTitle(
        titleProperty ? values[titleProperty.id] : undefined,
      );
      for (let index = 1; index <= 10_000; index += 1) {
        const candidate = `${prefix}${databasePathNameWithCollisionSuffix(baseName, index)}.md`;
        if (reservedMoveTargetPaths.has(candidate)) continue;
        if (this.#contentDir) {
          try {
            this.#readFile(resolve(this.#contentDir, candidate));
            continue;
          } catch (error) {
            if (errno(error) !== 'ENOENT') throw error;
          }
        }
        reservedMoveTargetPaths.add(candidate);
        return candidate;
      }
      throw new Error(`Unable to allocate a readable move target for record "${recordId}"`);
    };
    const recordMoves = desiredState.recordMoves.map((move, moveIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === move.sourceKey);
      const target = definition.sources.find((candidate) => candidate.key === move.targetSourceKey);
      if (!source || !target) throw new Error('Record move references an unknown source key');
      if (source.id === target.id) throw new Error('Record move target must be a different source');
      const record = this.#databaseRecordIndex?.getById(move.id) ?? null;
      if (!record) throw new Error(`Record move target "${move.id}" was not found`);
      if (record.databaseId !== databaseId || record.sourceId !== source.id) {
        throw new Error('Record move target belongs to a different database or source');
      }
      if (!record.revision) throw new Error(`Record move target "${move.id}" has no revision`);
      const sourceMapping = (definition.sourceMappings ?? []).find(
        (mapping) => mapping.sourceId === source.id && mapping.targetSourceId === target.id,
      );
      if (!sourceMapping) {
        throw new Error(
          `Record move requires an explicit source mapping from "${source.key}" to "${target.key}"`,
        );
      }
      const values: Record<string, unknown> = {};
      for (const targetProperty of target.properties) {
        const propertyMapping = sourceMapping.propertyMappings.find(
          (mapping) => mapping.targetPropertyId === targetProperty.id,
        );
        const sourceProperty = source.properties.find(
          (property) => property.id === propertyMapping?.sourcePropertyId,
        );
        const sourceValue = sourceProperty ? record.values[sourceProperty.id] : undefined;
        if (sourceValue === undefined) {
          if (targetProperty.required) {
            throw new Error(
              `Record move cannot satisfy required target property "${targetProperty.key}"`,
            );
          }
          continue;
        }
        if (
          (sourceProperty?.type === 'select' || sourceProperty?.type === 'status') &&
          targetProperty.type === sourceProperty.type &&
          typeof sourceValue === 'string'
        ) {
          const explicitTargetOptionId = propertyMapping?.optionMappings.find(
            (mapping) => mapping.sourceOptionId === sourceValue,
          )?.targetOptionId;
          const optionKey = sourceProperty.options.find((option) => option.id === sourceValue)?.key;
          const targetOption = targetProperty.options.find(
            (option) =>
              option.id === explicitTargetOptionId ||
              (explicitTargetOptionId === undefined && option.key === optionKey),
          );
          if (!targetOption) {
            throw new Error(
              `Record move cannot map select option for target property "${targetProperty.key}"`,
            );
          }
          values[targetProperty.id] = targetOption.id;
        } else if (
          sourceProperty?.type === 'multi_select' &&
          targetProperty.type === 'multi_select' &&
          Array.isArray(sourceValue)
        ) {
          values[targetProperty.id] = sourceValue.map((sourceOptionId) => {
            const explicitTargetOptionId = propertyMapping?.optionMappings.find(
              (mapping) => mapping.sourceOptionId === sourceOptionId,
            )?.targetOptionId;
            const optionKey = sourceProperty.options.find(
              (option) => option.id === sourceOptionId,
            )?.key;
            const targetOption = targetProperty.options.find(
              (option) =>
                option.id === explicitTargetOptionId ||
                (explicitTargetOptionId === undefined && option.key === optionKey),
            );
            if (!targetOption) {
              throw new Error(
                `Record move cannot map multi-select option for target property "${targetProperty.key}"`,
              );
            }
            return targetOption.id;
          });
        } else {
          values[targetProperty.id] = sourceValue;
        }
      }
      const targetPath = allocateMoveTargetPath(target, values, record.id);
      targetResolutions.push({
        kind: 'record',
        selector: `recordMoves.${moveIndex}.id`,
        targetId: record.id,
        via: 'explicit_id',
      });
      return {
        recordId: record.id,
        expectedRevision: move.expectedRevision,
        sourceId: source.id,
        targetSourceId: target.id,
        sourcePath: record.path,
        targetPath,
        values,
        body: record.body,
        archivedAt: record.archivedAt ?? null,
        pageLayoutOverride: null,
      };
    });
    const sampleRecords = [
      ...explicitSampleRecords,
      ...folderMigrationRecords,
      ...uniqueIdBackfillRecords,
      ...recordCopies.map((copy) => copy.sample),
      ...recordArchives.map((archive) => archive.sample),
    ];
    const recordMutations = desiredState.recordMutations.map((mutation, mutationIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === mutation.sourceKey);
      if (!source) {
        throw new Error(`Record mutation has unknown source key "${mutation.sourceKey}"`);
      }
      let record = mutation.id ? this.#databaseRecordIndex?.getById(mutation.id) : null;
      const via: DatabaseTargetResolution['via'] = mutation.id ? 'explicit_id' : 'unique_property';
      if (!mutation.id) {
        if (!uniquePropertyId) {
          throw new Error('A uniqueValue mutation target requires a declared unique key');
        }
        const uniqueProperty = source.properties.find(
          (property) => property.id === uniquePropertyId,
        );
        if (!uniqueProperty) {
          throw new Error('The declared unique key does not belong to the mutation source');
        }
        const uniqueValue = normalizeSampleValue(
          uniqueProperty,
          mutation.uniqueValue,
          definition.people,
          { allowInactivePeople: true },
        );
        const matches = (this.#databaseRecordIndex?.list(databaseId, source.id) ?? []).filter(
          (candidate) => same(candidate.values[uniquePropertyId], uniqueValue),
        );
        if (matches.length !== 1) {
          throw new Error(
            `Record mutation unique key resolved to ${matches.length} records; expected exactly one`,
          );
        }
        record = matches[0] ?? null;
      }
      if (!record) throw new Error('Record mutation target was not found in the current index');
      if (record.databaseId !== databaseId || record.sourceId !== source.id) {
        throw new Error('Record mutation target belongs to a different database or source');
      }
      if (!record.revision)
        throw new Error(`Record mutation target "${record.id}" has no revision`);
      const applied = applyRecordMutation(source, definition.people, record, mutation);
      const requestedExpectedRevision = mutation.expectedRevision ?? record.revision;
      const preconditionsMatch =
        mutation.preconditions.length > 0 &&
        mutation.preconditions.every((precondition) => {
          const property = source.properties.find(
            (candidate) => candidate.key === precondition.propertyKey,
          );
          if (!property) return false;
          const present = Object.hasOwn(record.values, property.id);
          return (
            present === precondition.present &&
            (!present || same(record.values[property.id], precondition.value))
          );
        });
      const alreadyConverged = same(record.values, applied.values) && record.body === applied.body;
      const expectedRevision =
        requestedExpectedRevision === record.revision || preconditionsMatch || alreadyConverged
          ? record.revision
          : requestedExpectedRevision;
      targetResolutions.push({
        kind: 'record',
        selector: mutation.id
          ? `recordMutations.${mutationIndex}.id`
          : `recordMutations.${mutationIndex}.uniqueValue`,
        targetId: record.id,
        via,
      });
      for (const [operationIndex, operation] of applied.operations.entries()) {
        if (operation.kind === 'link' || operation.kind === 'unlink') {
          targetResolutions.push({
            kind: 'record',
            selector: `recordMutations.${mutationIndex}.operations.${operationIndex}.recordId`,
            targetId: operation.recordId,
            via: 'explicit_id',
          });
        } else if (
          (operation.kind === 'add' || operation.kind === 'remove') &&
          definition.people.some((person) => person.id === operation.value)
        ) {
          targetResolutions.push({
            kind: 'person',
            selector: `recordMutations.${mutationIndex}.operations.${operationIndex}.value`,
            targetId: operation.value,
            via: 'explicit_id',
          });
        }
      }
      return {
        recordId: record.id,
        sourceId: source.id,
        expectedRevision,
        values: applied.values,
        body: applied.body,
        operations: applied.operations,
        ...(record.pageLayoutOverride
          ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
          : {}),
      };
    });
    const recordDeletions = desiredState.recordDeletions.map((deletion, deletionIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === deletion.sourceKey);
      if (!source) {
        throw new Error(`Record deletion has unknown source key "${deletion.sourceKey}"`);
      }
      const record = this.#databaseRecordIndex?.getById(deletion.id) ?? null;
      if (!record) throw new Error(`Record deletion target "${deletion.id}" was not found`);
      if (record.databaseId !== databaseId || record.sourceId !== source.id) {
        throw new Error('Record deletion target belongs to a different database or source');
      }
      if (!record.revision)
        throw new Error(`Record deletion target "${record.id}" has no revision`);
      targetResolutions.push({
        kind: 'record',
        selector: `recordDeletions.${deletionIndex}.id`,
        targetId: record.id,
        via: 'explicit_id',
      });
      return {
        recordId: record.id,
        sourceId: source.id,
        expectedRevision: deletion.expectedRevision,
        path: record.path,
        values: record.values,
        body: record.body,
      };
    });
    for (const source of definition.sources) {
      const uniqueProperties = source.properties.filter(
        (property): property is Extract<DatabaseProperty, { type: 'unique_id' }> =>
          property.type === 'unique_id',
      );
      if (uniqueProperties.length === 0) continue;
      const indexedRecords = this.#databaseRecordIndex?.list(databaseId, source.id) ?? [];
      for (const property of uniqueProperties) {
        const observed = indexedRecords
          .map((record) => record.values[property.id])
          .filter(
            (value): value is number =>
              typeof value === 'number' && Number.isSafeInteger(value) && value >= 1,
          );
        const used = new Set(observed);
        let nextNumber = Math.max(property.nextNumber, 1, ...observed.map((value) => value + 1));
        const allocate = (): number => {
          while (used.has(nextNumber)) nextNumber += 1;
          if (!Number.isSafeInteger(nextNumber)) {
            throw new Error(`Unique ID property "${property.key}" exhausted safe integers`);
          }
          const allocated = nextNumber;
          used.add(allocated);
          nextNumber += 1;
          return allocated;
        };
        for (const sample of sampleRecords.filter((record) => record.sourceId === source.id)) {
          const existing = this.#databaseRecordIndex?.getById(sample.id);
          const currentValue =
            existing?.sourceId === source.id ? existing.values[property.id] : undefined;
          sample.values[property.id] =
            typeof currentValue === 'number' &&
            Number.isSafeInteger(currentValue) &&
            currentValue >= 1
              ? currentValue
              : allocate();
        }
        for (const move of recordMoves.filter((record) => record.targetSourceId === source.id)) {
          move.values[property.id] = allocate();
        }
        property.nextNumber = nextNumber;
      }
    }
    definition = DatabaseDefinitionSchema.parse(definition);
    const pairedRelations = reconcilePairedRelationSamples(
      definition,
      currentDefinition,
      [
        ...sampleRecords.map((sample) => ({
          ...sample,
          values: structuredClone(sample.values) as Record<string, unknown>,
        })),
        ...recordMutations.map((mutation) => ({
          id: mutation.recordId,
          sourceId: mutation.sourceId,
          values: structuredClone(mutation.values) as Record<string, unknown>,
          body: mutation.body,
          expectedRevision: mutation.expectedRevision,
          ...(mutation.pageLayoutOverride
            ? { pageLayoutOverride: structuredClone(mutation.pageLayoutOverride) }
            : {}),
        })),
      ],
      (recordId) => this.#databaseRecordIndex?.getById(recordId) ?? null,
    );
    return {
      definition,
      uniquePropertyId,
      templates: clone(desiredState.templates),
      policy: clone(desiredState.policy),
      sampleRecords: pairedRelations.samples,
      recordMutations: [
        ...recordMutations.map((mutation) => ({
          recordId: mutation.recordId,
          sourceId: mutation.sourceId,
          operations: mutation.operations,
        })),
        ...pairedRelations.inverseMutations,
      ],
      recordCopies: recordCopies.map(({ sample: _sample, ...copy }) => copy),
      recordArchives: recordArchives.map(({ sample: _sample, ...archive }) => archive),
      recordMoves,
      recordDeletions,
      targetResolutions,
    };
  }
}

export function createDatabasePlanEngine(
  options: CreateDatabasePlanEngineOptions,
): DatabasePlanEngine {
  return new DatabasePlanEngine(options);
}
