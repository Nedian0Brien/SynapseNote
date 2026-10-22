import { z } from 'zod';
import {
  DatabaseIdSchema,
  DatabasePropertyIdSchema,
  DatabaseRecordIdSchema,
  DatabaseViewIdSchema,
  DataSourceIdSchema,
} from './stable-ids.ts';

const PrincipalIdSchema = z.string().trim().min(1).max(256);
const ShareIdSchema = z.string().regex(/^dbshare_[a-f0-9-]{36}$/);
const TokenHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const DATABASE_PUBLIC_SHARE_TARGET_KINDS = [
  'database',
  'view',
  'form',
  'chart',
  'record',
] as const;
export type DatabasePublicShareTargetKind = (typeof DATABASE_PUBLIC_SHARE_TARGET_KINDS)[number];

export const DatabasePublicShareTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('database'),
      databaseId: DatabaseIdSchema,
      sourceId: DataSourceIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.enum(['view', 'form', 'chart']),
      databaseId: DatabaseIdSchema,
      viewId: DatabaseViewIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('record'),
      databaseId: DatabaseIdSchema,
      recordId: DatabaseRecordIdSchema,
    })
    .strict(),
]);
export type DatabasePublicShareTarget = z.infer<typeof DatabasePublicShareTargetSchema>;

export const DatabasePublicSharePolicySchema = z
  .object({
    version: z.literal(1),
    id: ShareIdSchema,
    target: DatabasePublicShareTargetSchema,
    access: z.enum(['public', 'link']),
    propertyIds: z.array(DatabasePropertyIdSchema).max(10_000),
    allowBody: z.boolean(),
    allowFormSubmission: z.boolean(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    tokenHash: TokenHashSchema.nullable(),
    createdBy: PrincipalIdSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((policy, context) => {
    if (new Set(policy.propertyIds).size !== policy.propertyIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['propertyIds'],
        message: 'Public share property IDs must be unique',
      });
    }
    if ((policy.access === 'link') !== (policy.tokenHash !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['tokenHash'],
        message: 'Link shares require a token hash and public shares cannot retain one',
      });
    }
    if (policy.allowFormSubmission && policy.target.kind !== 'form') {
      context.addIssue({
        code: 'custom',
        path: ['allowFormSubmission'],
        message: 'Only a Form share may accept submissions',
      });
    }
    if (policy.revokedAt && Date.parse(policy.revokedAt) < Date.parse(policy.createdAt)) {
      context.addIssue({
        code: 'custom',
        path: ['revokedAt'],
        message: 'A share cannot be revoked before creation',
      });
    }
  });
export type DatabasePublicSharePolicy = z.infer<typeof DatabasePublicSharePolicySchema>;

export function databasePublicShareIsActive(
  policy: DatabasePublicSharePolicy,
  now = new Date(),
): boolean {
  return (
    policy.revokedAt === null &&
    (policy.expiresAt === null || Date.parse(policy.expiresAt) > now.getTime())
  );
}

export function databasePublicShareTargetMatches(
  policy: DatabasePublicSharePolicy,
  input: {
    databaseId: string;
    sourceId?: string;
    viewId?: string;
    recordId?: string;
  },
): boolean {
  if (policy.target.databaseId !== input.databaseId) return false;
  switch (policy.target.kind) {
    case 'database':
      return input.sourceId === undefined || input.sourceId === policy.target.sourceId;
    case 'view':
    case 'form':
    case 'chart':
      return input.viewId === undefined || input.viewId === policy.target.viewId;
    case 'record':
      return input.recordId === undefined || input.recordId === policy.target.recordId;
  }
}
