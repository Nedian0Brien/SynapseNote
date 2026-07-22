/** `data_run` MCP tool — inspect or recover one durable database Agent Run. */

import { z } from 'zod';
import { databaseAccessHeaders } from '../../database-access-policy.ts';
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

const ACTIONS = ['list', 'get', 'retry', 'resume'] as const;
type Action = (typeof ACTIONS)[number];

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Inspect and recover database Agent Runs without loading the current editor view.',
  '',
  'Use action=list for compact history or action=get for one exact scope/diff/receipt. For a failed agent run, action=retry or action=resume creates an independent attempt from the same immutable plan; pass the source revision, a unique idempotencyKey, and either approvalToken=approve:<planHash> or an autonomySessionToken. The original failed run remains in audit history.',
  '',
  'Recovery is revision-bound and idempotent. If the server restarted before its in-memory plan cache was restored, the typed response asks the caller to recreate the plan instead of guessing or applying a different plan.',
].join('\n');

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  action: Action;
  runId?: string;
  expectedRevision?: string;
  idempotencyKey?: string;
  approvalToken?: string;
  autonomySessionToken?: string;
  cwd?: string;
}

const RevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  action: z.enum(ACTIONS),
  revision: z.union([RevisionSchema, z.literal('sha256:empty')]).optional(),
  runs: z.array(z.record(z.string(), z.unknown())).optional(),
  sourceRunId: z.string().startsWith('run_').optional(),
  run: z.record(z.string(), z.unknown()).optional(),
  receipt: z.record(z.string(), z.unknown()).optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

function payload(result: Record<string, unknown>): Record<string, unknown> {
  const { ok: _ok, httpStatus: _httpStatus, ...rest } = result;
  return rest;
}

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_run',
    {
      description: DESCRIPTION,
      inputSchema: {
        action: z.enum(ACTIONS),
        runId: z.string().startsWith('run_').optional().describe('Required for get/retry/resume.'),
        expectedRevision: RevisionSchema.optional().describe(
          'Required for retry/resume; exact revision from the latest Agent Run inspection.',
        ),
        idempotencyKey: z
          .string()
          .min(8)
          .max(256)
          .optional()
          .describe('Required for retry/resume; reuse only for an identical handoff.'),
        approvalToken: z
          .string()
          .startsWith('approve:sha256:')
          .optional()
          .describe('Explicit approval bound to the immutable plan hash.'),
        autonomySessionToken: z
          .string()
          .startsWith('dbsession_')
          .max(256)
          .optional()
          .describe('Alternative to approvalToken for an already-authorized autonomy session.'),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args: Args) => {
      if (
        (args.action === 'get' || args.action === 'retry' || args.action === 'resume') &&
        !args.runId
      ) {
        return databaseToolInputError('invalid_request', `action=${args.action} requires runId.`, {
          action: args.action,
          cwd: args.cwd ?? '',
        });
      }
      if (args.action === 'retry' || args.action === 'resume') {
        if (!args.expectedRevision || !args.idempotencyKey) {
          return databaseToolInputError(
            'invalid_request',
            `action=${args.action} requires expectedRevision and idempotencyKey.`,
            { action: args.action, cwd: args.cwd ?? '' },
          );
        }
        if (!args.approvalToken && !args.autonomySessionToken) {
          return databaseToolInputError(
            'approval_required',
            `action=${args.action} requires approvalToken or autonomySessionToken.`,
            { action: args.action, cwd: args.cwd ?? '' },
          );
        }
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
        '/api/databases/runs',
        {
          action: args.action,
          ...(args.runId ? { runId: args.runId } : {}),
          ...(args.expectedRevision ? { expectedRevision: args.expectedRevision } : {}),
          ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
          ...(args.approvalToken ? { approvalToken: args.approvalToken } : {}),
          ...(args.autonomySessionToken ? { autonomySessionToken: args.autonomySessionToken } : {}),
        },
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) return databaseToolHttpError(response, { action: args.action, cwd });
      const data = payload(response);
      if (args.action === 'list') {
        const runs = Array.isArray(data.runs) ? data.runs.length : 0;
        return textPlusStructured(
          `Returned ${runs} compact Agent Run${runs === 1 ? '' : 's'}. Use action=get for one exact run or retry/resume for a failed agent attempt.`,
          { cwd, ...data },
        );
      }
      if (args.action === 'get') {
        return textPlusStructured(
          `Returned Agent Run ${String(data.run && typeof data.run === 'object' && 'id' in data.run ? data.run.id : args.runId)} with exact scope, diff, verification, and undo state.`,
          { cwd, ...data },
        );
      }
      return textPlusStructured(
        `Agent Run ${args.action} created an independent attempt ${String(data.run && typeof data.run === 'object' && 'id' in data.run ? data.run.id : '')}; preserve its receipt and use the failed source run for audit history.`,
        { cwd, ...data },
      );
    },
  );
}
