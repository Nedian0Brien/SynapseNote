import { z } from 'zod';

const VerificationActorSchema = z
  .object({
    kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
    principal_id: z.string().trim().min(1).max(500),
  })
  .strict();

const RevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const DatabaseVerificationValueSchema = z
  .discriminatedUnion('state', [
    z.object({ state: z.literal('unverified'), note: z.string().max(2_000).optional() }).strict(),
    z
      .object({
        state: z.literal('verified'),
        verifiedAt: z.string().datetime({ offset: true }),
        verifiedBy: VerificationActorSchema,
        expiresAt: z.string().datetime({ offset: true }).optional(),
        evidenceRevision: RevisionSchema.optional(),
        note: z.string().max(2_000).optional(),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.state === 'verified' &&
      value.expiresAt !== undefined &&
      Date.parse(value.expiresAt) <= Date.parse(value.verifiedAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Verification expiry must be later than verification time',
      });
    }
  });

export type DatabaseVerificationValue = z.infer<typeof DatabaseVerificationValueSchema>;

export const DatabaseVerificationProjectionSchema = z
  .object({
    storedState: z.enum(['unverified', 'verified']),
    status: z.enum(['unverified', 'verified', 'expired', 'stale']),
    isExpired: z.boolean(),
    isStale: z.boolean(),
    verifiedAt: z.string().datetime({ offset: true }).optional(),
    verifiedBy: VerificationActorSchema.optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    evidenceRevision: RevisionSchema.optional(),
    currentRevision: RevisionSchema.nullable(),
    currentEvidenceRevision: RevisionSchema.nullable(),
    note: z.string().max(2_000).optional(),
  })
  .strict();

export type DatabaseVerificationProjection = z.infer<typeof DatabaseVerificationProjectionSchema>;

/** Derive time/revision status from immutable stored evidence at one explicit clock instant. */
export function projectDatabaseVerification(
  value: DatabaseVerificationValue,
  currentRevision: string | null,
  currentEvidenceRevision: string | null,
  now: Date,
): DatabaseVerificationProjection {
  if (value.state === 'unverified') {
    return {
      storedState: 'unverified',
      status: 'unverified',
      isExpired: false,
      isStale: false,
      currentRevision,
      currentEvidenceRevision,
      ...(value.note === undefined ? {} : { note: value.note }),
    };
  }
  const expired = value.expiresAt !== undefined && Date.parse(value.expiresAt) <= now.getTime();
  const stale =
    value.evidenceRevision !== undefined && value.evidenceRevision !== currentEvidenceRevision;
  return {
    storedState: 'verified',
    status: expired ? 'expired' : stale ? 'stale' : 'verified',
    isExpired: expired,
    isStale: stale,
    verifiedAt: value.verifiedAt,
    verifiedBy: structuredClone(value.verifiedBy),
    currentRevision,
    currentEvidenceRevision,
    ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
    ...(value.evidenceRevision === undefined ? {} : { evidenceRevision: value.evidenceRevision }),
    ...(value.note === undefined ? {} : { note: value.note }),
  };
}

const lifecycleTargetShape = {
  databaseId: z.string().startsWith('db_'),
  sourceId: z.string().startsWith('ds_'),
  recordId: z.string().startsWith('rec_'),
  propertyId: z.string().startsWith('prop_'),
  expectedRevision: RevisionSchema,
};

export const DatabaseVerificationLifecycleInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...lifecycleTargetShape,
      action: z.literal('verify'),
      expiresAt: z.string().datetime({ offset: true }).optional(),
      evidenceRevision: RevisionSchema.optional(),
      note: z.string().max(2_000).optional(),
    })
    .strict(),
  z
    .object({
      ...lifecycleTargetShape,
      action: z.literal('renew'),
      expiresAt: z.string().datetime({ offset: true }),
      evidenceRevision: RevisionSchema.optional(),
      note: z.string().max(2_000).optional(),
    })
    .strict(),
  z
    .object({
      ...lifecycleTargetShape,
      action: z.literal('unverify'),
      note: z.string().max(2_000).optional(),
    })
    .strict(),
]);

export type DatabaseVerificationLifecycleInput = z.infer<
  typeof DatabaseVerificationLifecycleInputSchema
>;
