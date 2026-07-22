/** Transport-neutral public metadata contract for durable database tasks. */

import { z } from 'zod';

export const DatabaseTaskSchema = z
  .object({
    version: z.literal(1),
    id: z.string().startsWith('task_'),
    operation: z.enum(['import', 'migration', 'bulk']),
    state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    cancellable: z.boolean(),
    progress: z
      .object({
        completed: z.number().int().nonnegative(),
        total: z.number().int().nonnegative().nullable(),
        unit: z.enum(['records', 'files', 'steps']),
        message: z.string().max(500).nullable(),
      })
      .strict(),
    attempt: z.number().int().positive().optional(),
    checkpoint: z
      .object({
        id: z.string().startsWith('checkpoint_'),
        sequence: z.number().int().positive(),
        completed: z.number().int().nonnegative(),
        savedAt: z.string().datetime(),
      })
      .strict()
      .nullable()
      .optional(),
    result: z.record(z.string(), z.unknown()).nullable(),
    problem: z
      .object({
        type: z.string().min(1),
        title: z.string().min(1),
        status: z.number().int().min(400).max(599),
        detail: z.string().min(1),
        code: z.string().min(1),
        retryable: z.boolean(),
      })
      .passthrough()
      .nullable(),
  })
  .strict()
  .superRefine((task, ctx) => {
    const terminal =
      task.state === 'succeeded' || task.state === 'failed' || task.state === 'cancelled';
    if (terminal !== (task.finishedAt !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['finishedAt'],
        message: 'finishedAt must be present exactly for terminal task states',
      });
    }
    if (task.state === 'succeeded' && task.result === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['result'],
        message: 'succeeded tasks require a result',
      });
    }
    if (task.state === 'failed' && task.problem === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['problem'],
        message: 'failed tasks require a problem',
      });
    }
    if (task.state !== 'failed' && task.problem !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['problem'],
        message: 'only failed tasks may carry a problem',
      });
    }
    if (task.state !== 'succeeded' && task.result !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['result'],
        message: 'only succeeded tasks may carry a result',
      });
    }
    if (task.progress.total !== null && task.progress.completed > task.progress.total) {
      ctx.addIssue({
        code: 'custom',
        path: ['progress', 'completed'],
        message: 'completed progress cannot exceed total',
      });
    }
    if (task.checkpoint && task.checkpoint.completed > task.progress.completed) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkpoint', 'completed'],
        message: 'checkpoint progress cannot exceed task progress',
      });
    }
  });

export type DatabaseTask = z.infer<typeof DatabaseTaskSchema>;
