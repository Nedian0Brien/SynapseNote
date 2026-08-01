import {
  DATABASE_AUTONOMY_MODES,
  DATABASE_MUTATION_ACTIONS,
  DATABASE_PERMISSION_ACTIONS,
  DATABASE_PERMISSION_ROLES,
  DatabaseFormValueSchema,
  DatabasePublicShareTargetSchema,
  DatabaseQuerySchema,
  databasePermissionRoleActions,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';

export const DatabaseAgentRunsRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('get'), runId: z.string().startsWith('run_') }).strict(),
  z
    .object({
      action: z.enum(['retry', 'resume']),
      runId: z.string().startsWith('run_'),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      idempotencyKey: z.string().min(8).max(256),
      approvalToken: z.string().startsWith('approve:sha256:').optional(),
      autonomySessionToken: z.string().startsWith('dbsession_').max(256).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('retain_prompt'),
      runId: z.string().startsWith('run_'),
      prompt: z
        .string()
        .min(1)
        .max(256 * 1024),
      consent: z.literal(true),
      ttlSeconds: z
        .number()
        .int()
        .min(60)
        .max(7 * 24 * 60 * 60),
    })
    .strict(),
  z.object({ action: z.literal('get_prompt'), runId: z.string().startsWith('run_') }).strict(),
  z.object({ action: z.literal('delete_prompt'), runId: z.string().startsWith('run_') }).strict(),
]);
export const DatabaseAutonomyScopeSchema = z
  .object({
    databaseIds: z.array(z.string().startsWith('db_')).min(1).max(10_000),
    actions: z.array(z.enum(DATABASE_MUTATION_ACTIONS)).min(1),
    propertyIds: z.array(z.string().startsWith('prop_')).max(10_000),
    allowBody: z.boolean(),
    maxRecordsPerAction: z.number().int().positive().max(100_000),
    maxRecordsTotal: z.number().int().positive().max(10_000_000),
    maxActionsTotal: z.number().int().positive().max(1_000_000),
    maxEgressBytesTotal: z.number().int().nonnegative().max(1_000_000_000),
    notBefore: z.string().datetime().optional(),
    expiresAt: z.string().datetime(),
  })
  .strict()
  .superRefine((scope, context) => {
    for (const [path, values] of [
      ['databaseIds', scope.databaseIds],
      ['actions', scope.actions],
      ['propertyIds', scope.propertyIds],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: `${path} must be unique`,
        });
      }
    }
    if (scope.notBefore && Date.parse(scope.notBefore) >= Date.parse(scope.expiresAt)) {
      context.addIssue({
        code: 'custom',
        path: ['notBefore'],
        message: 'notBefore must precede expiresAt',
      });
    }
  });
export const DatabaseAutonomyRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('get'),
      databaseId: z.string().startsWith('db_'),
      sessionId: z.string().min(1).max(256).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('set_database'),
      databaseId: z.string().startsWith('db_'),
      mode: z.enum(DATABASE_AUTONOMY_MODES),
      expectedRevision: z.union([
        z.string().regex(/^sha256:[a-f0-9]{64}$/),
        z.literal('sha256:empty'),
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal('clear_database'),
      databaseId: z.string().startsWith('db_'),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('set_session'),
      sessionId: z.string().min(1).max(256),
      mode: z.enum(DATABASE_AUTONOMY_MODES),
      delegation: DatabaseAutonomyScopeSchema.optional(),
      expectedRevision: z.union([
        z.string().regex(/^sha256:[a-f0-9]{64}$/),
        z.literal('sha256:empty'),
      ]),
    })
    .strict()
    .superRefine((value, context) => {
      if ((value.mode === 'autonomous') !== (value.delegation !== undefined)) {
        context.addIssue({
          code: 'custom',
          path: ['delegation'],
          message: 'Only Autonomous sessions require and may carry delegation scope',
        });
      }
    }),
  z
    .object({
      action: z.literal('clear_session'),
      sessionId: z.string().min(1).max(256),
      expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
]);
export const DatabasePermissionRevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);
export const DatabasePermissionGrantSchema = z
  .object({
    id: z.string().regex(/^dbgrant_[a-f0-9-]{36}$/),
    databaseId: z.string().startsWith('db_').nullable(),
    principalId: z.string().trim().min(1).max(256),
    role: z.enum(DATABASE_PERMISSION_ROLES),
    actions: z.array(z.enum(DATABASE_PERMISSION_ACTIONS)).min(1),
    createdBy: z.string().trim().min(1).max(256),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const DatabasePermissionUpsertRequestSchema = z
  .object({
    action: z.literal('upsert'),
    grantId: z
      .string()
      .regex(/^dbgrant_[a-f0-9-]{36}$/)
      .optional(),
    databaseId: z.string().startsWith('db_').nullable(),
    principalId: z.string().trim().min(1).max(256),
    role: z.enum(DATABASE_PERMISSION_ROLES).default('custom'),
    actions: z.array(z.enum(DATABASE_PERMISSION_ACTIONS)).min(1),
    expectedRevision: DatabasePermissionRevisionSchema,
  })
  .strict()
  .superRefine((grant, context) => {
    if (grant.role === 'custom') return;
    const expected = [...databasePermissionRoleActions(grant.role)].sort();
    const actual = [...grant.actions].sort();
    if (
      expected.length !== actual.length ||
      expected.some((action, index) => action !== actual[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actions'],
        message: `Actions must exactly match the ${grant.role} role`,
      });
    }
  });
export const DatabasePermissionsRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      databaseId: z.string().startsWith('db_').optional(),
    })
    .strict(),
  DatabasePermissionUpsertRequestSchema,
  z
    .object({
      action: z.literal('remove'),
      grantId: z.string().regex(/^dbgrant_[a-f0-9-]{36}$/),
      expectedRevision: DatabasePermissionRevisionSchema,
    })
    .strict(),
]);
export const DatabasePublicShareIdSchema = z.string().regex(/^dbshare_[a-f0-9-]{36}$/);
export const DatabasePublicShareViewSchema = z
  .object({
    version: z.literal(1),
    id: DatabasePublicShareIdSchema,
    target: DatabasePublicShareTargetSchema,
    access: z.enum(['public', 'link']),
    propertyIds: z.array(z.string().startsWith('prop_')).max(10_000),
    allowBody: z.boolean(),
    allowFormSubmission: z.boolean(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const DatabasePublicShareCredentialSchema = z
  .object({
    shareId: DatabasePublicShareIdSchema,
    token: z.string().startsWith('dbsharetoken_').max(256).optional(),
  })
  .strict();
export const DatabasePublicSharesRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), databaseId: z.string().startsWith('db_') }).strict(),
  z
    .object({
      action: z.literal('upsert'),
      shareId: DatabasePublicShareIdSchema.optional(),
      target: DatabasePublicShareTargetSchema,
      access: z.enum(['public', 'link']),
      propertyIds: z.array(z.string().startsWith('prop_')).min(1).max(10_000),
      allowBody: z.boolean().default(false),
      allowFormSubmission: z.boolean().default(false),
      expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
      rotateToken: z.boolean().default(false),
      expectedRevision: DatabasePermissionRevisionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('revoke'),
      shareId: DatabasePublicShareIdSchema,
      expectedRevision: DatabasePermissionRevisionSchema,
    })
    .strict(),
  DatabasePublicShareCredentialSchema.extend({ action: z.literal('resolve') }).strict(),
  DatabasePublicShareCredentialSchema.extend({
    action: z.literal('describe'),
  }).strict(),
  DatabasePublicShareCredentialSchema.extend({
    action: z.literal('query'),
    query: DatabaseQuerySchema.optional(),
  }).strict(),
  DatabasePublicShareCredentialSchema.extend({ action: z.literal('record') }).strict(),
  DatabasePublicShareCredentialSchema.extend({
    action: z.literal('submit_form'),
    submissionId: z.string().min(8).max(256),
    startedAt: z.string().datetime({ offset: true }),
    answers: z.record(z.string().startsWith('prop_'), DatabaseFormValueSchema),
    honeypot: z.string().max(1_000).optional(),
  }).strict(),
]);
export const DatabaseUndoRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('preview'),
      undoToken: z.string().startsWith('undo_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('apply'),
      undoToken: z.string().startsWith('undo_'),
      idempotencyKey: z.string().min(8).max(256),
      actor: z
        .object({
          principalId: z.string().min(1).max(256),
          kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
          sessionId: z.string().min(1).max(256).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('redo_preview'),
      undoToken: z.string().startsWith('undo_'),
    })
    .strict(),
  z
    .object({
      action: z.literal('redo_apply'),
      undoToken: z.string().startsWith('undo_'),
      idempotencyKey: z.string().min(8).max(256),
      actor: z
        .object({
          principalId: z.string().min(1).max(256),
          kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
          sessionId: z.string().min(1).max(256).optional(),
        })
        .strict(),
    })
    .strict(),
]);
export const DatabaseRepairRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('preview'),
      ttlSeconds: z.number().int().min(30).max(3_600).optional(),
      documentIds: z
        .record(z.string().min(1).max(2_000), z.string().startsWith('doc_').max(256))
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('apply'),
      planId: z.string().startsWith('repair_plan_'),
      planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      approvalToken: z.string().startsWith('approve:sha256:'),
      idempotencyKey: z.string().min(8).max(256),
      principalId: z.string().trim().min(1).max(256),
    })
    .strict(),
  z
    .object({
      action: z.literal('undo'),
      repairId: z.string().startsWith('repair_'),
      planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      undoToken: z.string().startsWith('repair_undo_'),
      idempotencyKey: z.string().min(8).max(256),
      principalId: z.string().trim().min(1).max(256),
    })
    .strict(),
]);

export type DatabaseAgentRunsRequest = z.infer<typeof DatabaseAgentRunsRequestSchema>;
export type DatabaseAutonomyRequest = z.infer<typeof DatabaseAutonomyRequestSchema>;
export type DatabasePermissionsRequest = z.infer<typeof DatabasePermissionsRequestSchema>;
export type DatabasePublicSharesRequest = z.infer<typeof DatabasePublicSharesRequestSchema>;
export type DatabaseRepairRequest = z.infer<typeof DatabaseRepairRequestSchema>;
export type DatabaseUndoRequest = z.infer<typeof DatabaseUndoRequestSchema>;
