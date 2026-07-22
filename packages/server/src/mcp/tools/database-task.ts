/** `data_task` MCP tool — launch and control durable database jobs. */

import { z } from 'zod';
import { databaseAccessHeaders } from '../../database-access-policy.ts';
import {
  DatabaseCommitRequestSchema,
  DatabaseManifestMigrationPreviewSchema,
  DatabaseOnboardingPreviewSchema,
  DatabaseTaskSchema,
} from '../../database-data-plane-api.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import {
  DatabaseToolProblemOutputSchema,
  databaseToolHttpError,
  databaseToolInputError,
} from './database-problem.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Preview source onboarding and manifest migration, or launch, list, inspect, cancel, retry, and resume durable database import, migration, and bulk jobs.',
  '',
  'Use action=preview_import before import to inspect every included, excluded, modified, or rejected path without changing files. Use action=preview_migration with a current manifest revision and target version before migration; it reports every selected manifest, canonical migration IDs, loss classification, and blocker. Then use action=start with operation=bulk and an exact approved data_commit request, operation=import with that database/source and current manifest revision, or operation=migration with the same current manifest revision and target version. Start, retry, and resume may mutate canonical database files and require user approval. Use action=list to discover stable task IDs and current revisions, action=get for exact progress, and cancel/retry/resume with the latest expectedRevision.',
  '',
  'Task metadata is durable, bounded, and content-free. Private immutable input and checkpoints never appear in responses. Retry starts from immutable input; resume continues from the latest checkpoint. A server restart marks interrupted work as an explicit retryable failure.',
].join('\n');

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  action:
    | 'list'
    | 'get'
    | 'cancel'
    | 'preview_import'
    | 'preview_migration'
    | 'start'
    | 'retry'
    | 'resume';
  operation?: 'bulk' | 'import' | 'migration';
  state?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  limit?: number;
  cursor?: string;
  taskId?: string;
  expectedRevision?: string;
  commit?: z.input<typeof DatabaseCommitRequestSchema>;
  databaseId?: string;
  sourceId?: string;
  expectedManifestRevision?: string;
  databaseIds?: string[];
  targetVersion?: number;
  cwd?: string;
}

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  action: z.enum([
    'list',
    'get',
    'cancel',
    'preview_import',
    'preview_migration',
    'start',
    'retry',
    'resume',
  ]),
  tasks: z.array(DatabaseTaskSchema).optional(),
  task: DatabaseTaskSchema.optional(),
  preview: z
    .union([DatabaseOnboardingPreviewSchema, DatabaseManifestMigrationPreviewSchema])
    .optional(),
  nextCursor: z.string().nullable().optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

function payload(result: Record<string, unknown>): Record<string, unknown> {
  const { ok: _ok, httpStatus: _httpStatus, ...rest } = result;
  return rest;
}

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_task',
    {
      description: DESCRIPTION,
      inputSchema: {
        action: z.enum([
          'list',
          'get',
          'cancel',
          'preview_import',
          'preview_migration',
          'start',
          'retry',
          'resume',
        ]),
        operation: z.enum(['bulk', 'import', 'migration']).optional(),
        state: z
          .enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
          .optional()
          .describe('action=list: optional lifecycle-state filter.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('action=list: page size; defaults to 50.'),
        cursor: z.string().min(1).optional().describe('action=list: opaque continuation cursor.'),
        taskId: z.string().startsWith('task_').optional().describe('Required for get and cancel.'),
        expectedRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional()
          .describe('Required for cancel, retry, and resume; copy from the latest response.'),
        commit: DatabaseCommitRequestSchema.optional().describe(
          'action=start, operation=bulk: exact approved data_commit request.',
        ),
        databaseId: z.string().min(1).optional(),
        sourceId: z.string().min(1).optional(),
        expectedManifestRevision: z
          .union([z.string().regex(/^sha256:[a-f0-9]{64}$/), z.literal('sha256:empty')])
          .optional(),
        databaseIds: z.array(z.string().min(1)).max(10_000).optional(),
        targetVersion: z.number().int().positive().optional(),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async (args: Args) => {
      if (
        args.action === 'preview_import' &&
        (!args.databaseId || !args.sourceId || !args.expectedManifestRevision)
      ) {
        return databaseToolInputError(
          'invalid_request',
          'preview_import requires databaseId, sourceId, and expectedManifestRevision.',
          { action: args.action, cwd: args.cwd ?? '' },
        );
      }
      if (
        args.action === 'preview_migration' &&
        (!args.expectedManifestRevision || !args.targetVersion)
      ) {
        return databaseToolInputError(
          'invalid_request',
          'preview_migration requires expectedManifestRevision and targetVersion.',
          { action: args.action, cwd: args.cwd ?? '' },
        );
      }
      if (
        (args.action === 'get' ||
          args.action === 'cancel' ||
          args.action === 'retry' ||
          args.action === 'resume') &&
        !args.taskId
      ) {
        return databaseToolInputError('invalid_request', `${args.action} requires taskId.`, {
          action: args.action,
          cwd: args.cwd ?? '',
        });
      }
      if (
        (args.action === 'cancel' || args.action === 'retry' || args.action === 'resume') &&
        !args.expectedRevision
      ) {
        return databaseToolInputError(
          'invalid_request',
          `${args.action} requires expectedRevision from the latest list/get response.`,
          { action: args.action, cwd: args.cwd ?? '' },
        );
      }
      if (args.action === 'start' && !args.operation) {
        return databaseToolInputError('invalid_request', 'start requires operation.', {
          action: args.action,
          cwd: args.cwd ?? '',
        });
      }
      if (args.action === 'start' && args.operation === 'bulk' && !args.commit) {
        return databaseToolInputError('invalid_request', 'bulk start requires commit.', {
          action: args.action,
          cwd: args.cwd ?? '',
        });
      }
      if (
        args.action === 'start' &&
        args.operation === 'import' &&
        (!args.databaseId || !args.sourceId || !args.expectedManifestRevision)
      ) {
        return databaseToolInputError(
          'invalid_request',
          'import start requires databaseId, sourceId, and expectedManifestRevision.',
          { action: args.action, cwd: args.cwd ?? '' },
        );
      }
      if (
        args.action === 'start' &&
        args.operation === 'migration' &&
        (!args.expectedManifestRevision || !args.targetVersion)
      ) {
        return databaseToolInputError(
          'invalid_request',
          'migration start requires expectedManifestRevision and targetVersion.',
          { action: args.action, cwd: args.cwd ?? '' },
        );
      }
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const response = await httpPost(
        url,
        '/api/databases/task',
        args.action === 'list'
          ? {
              action: args.action,
              ...(args.state ? { state: args.state } : {}),
              ...(args.limit ? { limit: args.limit } : {}),
              ...(args.cursor ? { cursor: args.cursor } : {}),
            }
          : args.action === 'get'
            ? { action: args.action, taskId: args.taskId }
            : args.action === 'preview_import'
              ? {
                  action: args.action,
                  databaseId: args.databaseId,
                  sourceId: args.sourceId,
                  expectedManifestRevision: args.expectedManifestRevision,
                }
              : args.action === 'preview_migration'
                ? {
                    action: args.action,
                    expectedManifestRevision: args.expectedManifestRevision,
                    targetVersion: args.targetVersion,
                    ...(args.databaseIds ? { databaseIds: args.databaseIds } : {}),
                  }
                : args.action === 'cancel' || args.action === 'retry' || args.action === 'resume'
                  ? {
                      action: args.action,
                      taskId: args.taskId,
                      expectedRevision: args.expectedRevision,
                    }
                  : {
                      action: args.action,
                      task:
                        args.operation === 'bulk'
                          ? { operation: args.operation, commit: args.commit }
                          : args.operation === 'import'
                            ? {
                                operation: args.operation,
                                databaseId: args.databaseId,
                                sourceId: args.sourceId,
                                expectedManifestRevision: args.expectedManifestRevision,
                              }
                            : {
                                operation: 'migration',
                                expectedManifestRevision: args.expectedManifestRevision,
                                targetVersion: args.targetVersion,
                                ...(args.databaseIds ? { databaseIds: args.databaseIds } : {}),
                              },
                    },
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) return databaseToolHttpError(response, { action: args.action, cwd });
      const data = payload(response);
      if (args.action === 'list') {
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        return textPlusStructured(
          `${tasks.length} durable database task${tasks.length === 1 ? '' : 's'} returned${data.nextCursor ? '; more are available' : ''}.`,
          {
            cwd,
            action: args.action,
            tasks,
            nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
          },
        );
      }
      if (args.action === 'preview_import') {
        const preview = data.preview as
          | { items?: unknown[]; summary?: { reject?: unknown }; complete?: unknown }
          | undefined;
        return textPlusStructured(
          `Source onboarding preview returned ${preview?.items?.length ?? 0} paths${preview?.complete === false ? ' and reached its entry limit' : ''}; ${String(preview?.summary?.reject ?? 0)} rejected.`,
          { cwd, action: args.action, preview: data.preview },
        );
      }
      if (args.action === 'preview_migration') {
        const preview = data.preview as
          | { items?: unknown[]; summary?: { blocked?: unknown }; committable?: unknown }
          | undefined;
        return textPlusStructured(
          `Manifest migration preview returned ${preview?.items?.length ?? 0} targets; ${String(preview?.summary?.blocked ?? 0)} blocked and ${preview?.committable === true ? 'ready to start' : 'not committable'}.`,
          { cwd, action: args.action, preview: data.preview },
        );
      }
      const task = data.task as { id?: unknown; state?: unknown } | undefined;
      return textPlusStructured(
        args.action === 'cancel'
          ? `Database task ${String(task?.id)} is cancelled.`
          : args.action === 'start' || args.action === 'retry' || args.action === 'resume'
            ? `Database task ${String(task?.id)} is queued.`
            : `Database task ${String(task?.id)} is ${String(task?.state)}.`,
        { cwd, action: args.action, task: data.task },
      );
    },
  );
}
