/** Owns the validated desired-state draft contract used by database planning. */
import {
  DatabaseAutomationScheduleSchema,
  DatabaseAutomationSchema,
  DatabaseRecordMutationOperationSchema,
  DatabaseRecordMutationSchema,
  DatabaseRecordPageLayoutOverrideSchema,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';

export const DatabaseDraftPropertySchema = z
  .object({
    id: z.string().optional(),
    key: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
  })
  .loose();

export const DatabaseDraftSourceSchema = z
  .object({
    id: z.string().optional(),
    key: z.string().min(1),
    name: z.string().min(1),
    recordMeaning: z.string().min(1),
    folder: z.string(),
    storage: z
      .union([
        z.literal('record_files'),
        z.literal('markdown_table'),
        z
          .object({
            kind: z.literal('markdown_table'),
            ownerPath: z.string().min(1).max(2_000),
            blockId: z.string().min(1).max(128).optional(),
          })
          .strict(),
        z
          .object({
            kind: z.literal('markdown_table'),
            formatVersion: z.literal(2),
            owner: z
              .object({
                path: z.string().min(1).max(2_000),
                blockId: z.string().min(1).max(128),
              })
              .strict(),
            titlePropertyId: z.string().min(1),
            storedPropertyIds: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      ])
      .optional(),
    properties: z.array(DatabaseDraftPropertySchema).min(1),
  })
  .loose();

export const DatabaseDraftViewSchema = z
  .object({
    id: z.string().optional(),
    key: z.string().min(1),
    name: z.string().min(1),
    sourceKey: z.string().min(1),
    layout: z.record(z.string(), z.unknown()),
  })
  .loose();

export const DatabaseDraftSourceMappingSchema = z
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

export const DatabaseRecordDeletionSchema = z
  .object({
    id: z.string().regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceKey: z.string().min(1),
  })
  .strict();
export const DatabaseRecordCopySchema = z
  .object({
    id: z.string().regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceKey: z.string().min(1),
    newId: z
      .string()
      .regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
      .optional(),
    title: z.string().trim().min(1),
  })
  .strict();

export const DatabaseRecordArchiveSchema = z
  .object({
    id: z.string().regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceKey: z.string().min(1),
    action: z.enum(['archive', 'restore']),
  })
  .strict();

export const DatabaseRecordMoveSchema = z
  .object({
    id: z.string().regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceKey: z.string().min(1),
    targetSourceKey: z.string().min(1),
  })
  .strict();

export const DatabaseAutomationEventValueDraftSchema = z
  .object({
    fromEvent: z.enum(['record_id', 'record_body', 'property']),
    propertyKey: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => (value.fromEvent === 'property') === (value.propertyKey !== undefined), {
    message: 'Event property values require exactly one propertyKey',
  });

export const DatabaseAutomationDraftSchema = z
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
            documentId: z
              .string()
              .regex(/^doc_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
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
