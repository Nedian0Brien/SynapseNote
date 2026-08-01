/** Owns validation of the immutable concurrency guards attached to database plans. */
import { z } from 'zod';

export const DatabaseWriteGuardSnapshotSchema = z
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
