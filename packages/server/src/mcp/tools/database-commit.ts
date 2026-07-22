/**
 * `data_commit` MCP tool — commit one immutable, snapshot-bound database plan.
 * The docked terminal keeps this tool behind explicit user approval.
 */

import { z } from 'zod';
import { databaseAccessHeaders } from '../../database-access-policy.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import { DatabaseToolProblemOutputSchema, databaseToolHttpError } from './database-problem.ts';
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
  '[Requires: Hocuspocus server; requires user approval] Commit an exact database plan atomically.',
  '',
  'Call data_plan(action=create_plan), review its exact diff, conflicts, approvals, and postconditions, then pass the unchanged planId, planHash, snapshotRevision, and approvalToken=`approve:${planHash}`. The commit aborts if the plan, snapshot, assertions, or any target changed.',
  '',
  'Always provide a unique idempotencyKey for the logical request and reuse that same key only when retrying the identical request. A successful response includes the mutation ID, actual file diff, verification results, resulting revisions, audit receipt, and an undo token.',
].join('\n');

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  planId: string;
  planHash: string;
  expectedSnapshotRevision: string;
  idempotencyKey: string;
  approvalToken: string;
  actor: {
    principalId: string;
    kind: 'human' | 'agent' | 'sync' | 'filesystem' | 'system';
    sessionId?: string;
  };
  assertions?: {
    databaseAbsent?: boolean;
    createdRecords?: number;
  };
  cwd?: string;
}

const RevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  mutationId: z.string().startsWith('mut_').optional(),
  planId: z.string().startsWith('plan_').optional(),
  planHash: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
  idempotentReplay: z.boolean().optional(),
  actualDiff: z.array(z.record(z.string(), z.unknown())).optional(),
  verification: z.record(z.string(), z.unknown()).optional(),
  revisions: z
    .object({
      gitHead: z.string().regex(/^(?:sha1:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/),
      snapshotRevision: RevisionSchema,
    })
    .strict()
    .optional(),
  auditReceipt: z.record(z.string(), z.unknown()).optional(),
  undoToken: z.string().startsWith('undo_').optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

function payload(result: Record<string, unknown>): Record<string, unknown> {
  const { ok: _ok, httpStatus: _httpStatus, ...rest } = result;
  return rest;
}

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_commit',
    {
      description: DESCRIPTION,
      inputSchema: {
        planId: z.string().startsWith('plan_').describe('Immutable plan ID returned by data_plan.'),
        planHash: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .describe('Exact immutable plan hash reviewed by the approver.'),
        expectedSnapshotRevision: RevisionSchema.describe(
          'Snapshot revision from the reviewed plan; commit aborts if current state differs.',
        ),
        idempotencyKey: z
          .string()
          .min(8)
          .max(256)
          .describe('Unique logical-request key; reuse only for an identical retry.'),
        approvalToken: z
          .string()
          .startsWith('approve:sha256:')
          .describe('Explicit approval bound to the reviewed hash: approve:<planHash>.'),
        actor: z
          .object({
            principalId: z.string().min(1).max(256),
            kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
            sessionId: z.string().min(1).max(256).optional(),
          })
          .strict(),
        assertions: z
          .object({
            databaseAbsent: z.boolean().optional(),
            createdRecords: z.number().int().nonnegative().optional(),
          })
          .strict()
          .optional()
          .describe('Caller postconditions verified before and after mutation.'),
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
        '/api/databases/commit',
        {
          planId: args.planId,
          planHash: args.planHash,
          expectedSnapshotRevision: args.expectedSnapshotRevision,
          idempotencyKey: args.idempotencyKey,
          approvalToken: args.approvalToken,
          actor: args.actor,
          ...(args.assertions === undefined ? {} : { assertions: args.assertions }),
        },
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) {
        return databaseToolHttpError(response, { cwd });
      }
      const data = payload(response);
      return textPlusStructured(
        data.idempotentReplay === true
          ? `Database commit ${String(data.mutationId)} replayed without another mutation.`
          : `Database commit ${String(data.mutationId)} completed and all postconditions passed. Preserve the audit receipt and undo token.`,
        { cwd, ...data },
      );
    },
  );
}
