import { z } from 'zod';

export const DatabaseRecordMutationOperationSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('set'),
      propertyKey: z.string().min(1),
      value: z.unknown().nonoptional(),
    })
    .strict(),
  z.object({ op: z.literal('unset'), propertyKey: z.string().min(1) }).strict(),
  z
    .object({
      op: z.enum(['add', 'remove']),
      propertyKey: z.string().min(1),
      value: z.unknown().nonoptional(),
    })
    .strict(),
  z
    .object({ op: z.literal('increment'), propertyKey: z.string().min(1), by: z.number().finite() })
    .strict(),
  z
    .object({
      op: z.literal('append'),
      propertyKey: z.string().min(1).optional(),
      value: z.string(),
    })
    .strict(),
  z
    .object({
      op: z.enum(['link', 'unlink']),
      propertyKey: z.string().min(1),
      recordId: z.string().regex(/^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    })
    .strict(),
]);

export const DatabaseRecordMutationSchema = z
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
    uniqueValue: z.unknown().optional(),
    preconditions: z
      .array(
        z
          .object({
            propertyKey: z.string().min(1),
            present: z.boolean(),
            value: z.unknown().optional(),
          })
          .strict()
          .superRefine((precondition, context) => {
            if (precondition.present && precondition.value === undefined) {
              context.addIssue({
                code: 'custom',
                path: ['value'],
                message: 'A present property precondition requires its exact prior value',
              });
            }
            if (!precondition.present && precondition.value !== undefined) {
              context.addIssue({
                code: 'custom',
                path: ['value'],
                message: 'An absent property precondition cannot carry a value',
              });
            }
          }),
      )
      .max(100)
      .default([]),
    operations: z.array(DatabaseRecordMutationOperationSchema).min(1).max(100),
  })
  .strict()
  .superRefine((mutation, context) => {
    if (
      new Set(mutation.preconditions.map((item) => item.propertyKey)).size !==
      mutation.preconditions.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['preconditions'],
        message: 'Record mutation property preconditions must be unique',
      });
    }
    if (mutation.id) {
      if (!mutation.expectedRevision) {
        context.addIssue({
          code: 'custom',
          path: ['expectedRevision'],
          message: 'An explicit record mutation ID requires expectedRevision',
        });
      }
      if (mutation.uniqueValue !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['uniqueValue'],
          message: 'Use either id or uniqueValue for one mutation target, not both',
        });
      }
    } else if (mutation.uniqueValue === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['uniqueValue'],
        message: 'A mutation without id requires uniqueValue for the declared unique key',
      });
    }
  });

export type DatabaseRecordMutationOperation = z.output<
  typeof DatabaseRecordMutationOperationSchema
>;
export type DatabaseRecordMutation = z.output<typeof DatabaseRecordMutationSchema>;
