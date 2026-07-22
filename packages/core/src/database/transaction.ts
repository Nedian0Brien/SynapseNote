import { z } from 'zod';

export const DATABASE_TRANSACTION_RECEIPT_VERSION = 1 as const;

const mutationId = z.string().regex(/^mut_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const planId = z.string().regex(/^plan_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const undoId = z.string().regex(/^undo_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const snapshotRevision = z.union([sha256, z.literal('sha256:empty')]);
const gitObjectId = z.string().regex(/^(?:sha1:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/);
const projectPath = z
  .string()
  .min(1)
  .max(2_000)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Expected a normalized project-relative path',
  );

export const DatabaseTransactionFileStateSchema = z
  .object({
    sha256,
    gitBlob: gitObjectId,
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export type DatabaseTransactionFileState = z.infer<typeof DatabaseTransactionFileStateSchema>;

const createDelta = z
  .object({
    operation: z.literal('create'),
    path: projectPath,
    before: z.null(),
    after: DatabaseTransactionFileStateSchema,
  })
  .strict();
const updateDelta = z
  .object({
    operation: z.literal('update'),
    path: projectPath,
    before: DatabaseTransactionFileStateSchema,
    after: DatabaseTransactionFileStateSchema,
  })
  .strict();
const deleteDelta = z
  .object({
    operation: z.literal('delete'),
    path: projectPath,
    before: DatabaseTransactionFileStateSchema,
    after: z.null(),
  })
  .strict();
const renameDelta = z
  .object({
    operation: z.literal('rename'),
    oldPath: projectPath,
    path: projectPath,
    before: DatabaseTransactionFileStateSchema,
    after: DatabaseTransactionFileStateSchema,
  })
  .strict()
  .refine((value) => value.oldPath !== value.path, {
    message: 'A rename must change the project-relative path',
    path: ['path'],
  });

export const DatabaseTransactionFileDeltaSchema = z.discriminatedUnion('operation', [
  createDelta,
  updateDelta,
  deleteDelta,
  renameDelta,
]);
export type DatabaseTransactionFileDelta = z.infer<typeof DatabaseTransactionFileDeltaSchema>;

const verificationCheck = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_]{0,127}$/),
    status: z.enum(['passed', 'failed']),
    message: z.string().min(1).max(2_000),
  })
  .strict();

export const DatabaseTransactionReceiptSchema = z
  .object({
    version: z.literal(DATABASE_TRANSACTION_RECEIPT_VERSION),
    mutationId,
    planId,
    planHash: sha256,
    intentSummary: z.string().trim().min(1).max(2_000),
    tool: z
      .object({
        name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._+/-]{0,127}$/),
        version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/),
      })
      .strict(),
    dataSources: z
      .object({
        databaseIds: z.array(z.string().startsWith('db_')).min(1).max(1_000),
        sourceIds: z.array(z.string().startsWith('ds_')).min(1).max(10_000),
      })
      .strict(),
    idempotencyKeyHash: sha256,
    actor: z
      .object({
        principalId: z.string().min(1).max(256),
        kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
        sessionId: z.string().min(1).max(256).optional(),
      })
      .strict(),
    committedAt: z.iso.datetime({ offset: true }),
    base: z
      .object({
        gitHead: gitObjectId,
        snapshotRevision,
      })
      .strict(),
    result: z
      .object({
        gitHead: gitObjectId,
        snapshotRevision,
      })
      .strict(),
    files: z.array(DatabaseTransactionFileDeltaSchema).min(1).max(100_000),
    verification: z
      .object({
        status: z.enum(['passed', 'failed']),
        checks: z.array(verificationCheck).max(10_000),
      })
      .strict(),
    undo: z
      .object({
        tokenId: undoId,
        strategy: z.literal('git_three_way_reverse'),
        expectedSnapshotRevision: snapshotRevision,
        expiresAt: z.iso.datetime({ offset: true }).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((receipt, context) => {
    for (const [key, ids] of Object.entries(receipt.dataSources)) {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: 'custom',
          path: ['dataSources', key],
          message: 'Audit data source IDs must be unique',
        });
      }
    }
    const touched = new Set<string>();
    receipt.files.forEach((file, index) => {
      const paths = file.operation === 'rename' ? [file.oldPath, file.path] : [file.path];
      for (const path of paths) {
        if (touched.has(path)) {
          context.addIssue({
            code: 'custom',
            path: ['files', index, 'path'],
            message: `Path "${path}" appears more than once in one transaction receipt`,
          });
        }
        touched.add(path);
      }
    });
    if (receipt.undo.expectedSnapshotRevision !== receipt.result.snapshotRevision) {
      context.addIssue({
        code: 'custom',
        path: ['undo', 'expectedSnapshotRevision'],
        message: 'Undo must be bound to the committed result snapshot',
      });
    }
    if (
      receipt.verification.status === 'passed' &&
      receipt.verification.checks.some((check) => check.status === 'failed')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['verification', 'status'],
        message: 'Passed verification cannot contain a failed check',
      });
    }
  });
export type DatabaseTransactionReceipt = z.infer<typeof DatabaseTransactionReceiptSchema>;

export const DatabaseUndoReceiptSchema = z
  .object({
    version: z.literal(DATABASE_TRANSACTION_RECEIPT_VERSION),
    undoId,
    mutationId,
    checkedAt: z.iso.datetime({ offset: true }),
    status: z.enum(['applied', 'refused']),
    expectedSnapshotRevision: snapshotRevision,
    observedSnapshotRevision: snapshotRevision,
    resultSnapshotRevision: snapshotRevision.optional(),
    resultGitHead: gitObjectId.optional(),
    conflicts: z
      .array(
        z
          .object({
            path: projectPath,
            reason: z.enum([
              'path_changed',
              'path_missing',
              'path_recreated',
              'rename_target_occupied',
              'snapshot_changed',
            ]),
            expectedSha256: sha256.nullable(),
            observedSha256: sha256.nullable(),
          })
          .strict(),
      )
      .max(100_000),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.status === 'applied') {
      if (
        receipt.conflicts.length > 0 ||
        !receipt.resultSnapshotRevision ||
        !receipt.resultGitHead
      ) {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'Applied undo requires result revisions and no conflicts',
        });
      }
    } else if (receipt.conflicts.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['conflicts'],
        message: 'Refused undo requires at least one explicit conflict',
      });
    }
  });
export type DatabaseUndoReceipt = z.infer<typeof DatabaseUndoReceiptSchema>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function serializeDatabaseTransactionReceipt(input: unknown): string {
  return `${stableJson(DatabaseTransactionReceiptSchema.parse(input))}\n`;
}

export function parseDatabaseTransactionReceipt(input: string): DatabaseTransactionReceipt {
  return DatabaseTransactionReceiptSchema.parse(JSON.parse(input));
}
