import { z } from 'zod';

export const DATABASE_AGENT_RUN_VERSION = 1 as const;

const RevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);

const StringIdArraySchema = z.array(z.string().min(1).max(256)).max(100_000);

export const DatabaseAgentRunSchema = z
  .object({
    version: z.literal(DATABASE_AGENT_RUN_VERSION),
    id: z.string().regex(/^run_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    state: z.enum(['awaiting_approval', 'executing', 'succeeded', 'failed']),
    revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    actor: z
      .object({
        principalId: z.string().min(1).max(256),
        kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
        sessionId: z.string().min(1).max(256).nullable(),
      })
      .strict(),
    intent: z
      .object({
        summary: z.string().min(1).max(2_000),
        rawPromptStored: z.literal(false),
      })
      .strict(),
    scope: z
      .object({
        databaseIds: StringIdArraySchema,
        sourceIds: StringIdArraySchema,
        propertyIds: StringIdArraySchema,
        viewIds: StringIdArraySchema,
        recordIds: StringIdArraySchema,
      })
      .strict(),
    plan: z
      .object({
        id: z.string().startsWith('plan_'),
        hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        snapshotRevision: RevisionSchema,
        expiresAt: z.string().datetime(),
        risk: z
          .object({ level: z.enum(['low', 'medium', 'high']), reasons: z.array(z.string()) })
          .strict(),
        approvals: z.array(
          z
            .object({ code: z.string().min(1), required: z.boolean(), reason: z.string().min(1) })
            .strict(),
        ),
      })
      .strict(),
    proposedDiff: z
      .object({
        complete: z.boolean(),
        omittedReason: z.enum(['size_limit']).nullable(),
        originalBytes: z.number().int().nonnegative(),
        value: z.unknown().nullable(),
      })
      .strict()
      .superRefine((diff, context) => {
        if (diff.complete !== (diff.omittedReason === null && diff.value !== null)) {
          context.addIssue({
            code: 'custom',
            message: 'A complete proposed diff requires a value and no omission reason',
          });
        }
      }),
    execution: z
      .object({
        startedAt: z.string().datetime().nullable(),
        finishedAt: z.string().datetime().nullable(),
        mutationId: z.string().startsWith('mut_').nullable(),
        actualDiff: z.array(z.unknown()).max(100_000),
      })
      .strict(),
    verification: z
      .object({
        status: z.enum(['pending', 'passed', 'failed']),
        checks: z.array(
          z
            .object({
              code: z.string().min(1),
              status: z.enum(['passed', 'failed']),
              message: z.string().min(1),
            })
            .strict(),
        ),
      })
      .strict(),
    failure: z
      .object({ code: z.string().min(1), message: z.string().min(1).max(2_000) })
      .strict()
      .nullable(),
    undo: z
      .object({ available: z.boolean(), token: z.string().startsWith('undo_').nullable() })
      .strict()
      .superRefine((undo, context) => {
        if (undo.available !== (undo.token !== null)) {
          context.addIssue({ code: 'custom', message: 'Undo availability must match its token' });
        }
      }),
    recovery: z
      .object({
        attempt: z.number().int().positive().max(100),
        action: z.enum(['initial', 'retry', 'resume']),
        sourceRunId: z.string().startsWith('run_').nullable(),
        idempotencyKeyHash: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((run, context) => {
    if (run.state === 'succeeded') {
      if (
        run.execution.startedAt === null ||
        run.execution.finishedAt === null ||
        run.execution.mutationId === null ||
        run.verification.status !== 'passed' ||
        run.failure !== null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['state'],
          message: 'Succeeded run is incomplete',
        });
      }
    }
    if (run.state === 'failed' && (run.failure === null || run.execution.finishedAt === null)) {
      context.addIssue({ code: 'custom', path: ['state'], message: 'Failed run needs a failure' });
    }
    if (run.state === 'executing' && run.execution.startedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['execution'],
        message: 'Executing run needs start time',
      });
    }
  });

export type DatabaseAgentRun = z.infer<typeof DatabaseAgentRunSchema>;
