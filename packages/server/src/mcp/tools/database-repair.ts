/** `data_repair` MCP tool — preview and apply bounded canonical database repairs. */

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

const DESCRIPTION = [
  '[Requires: Hocuspocus server; apply requires user approval] Preview and repair stale database identities, invalid values, missing or duplicate Unique IDs, missing indexed records, and orphaned index entries.',
  '',
  'Always call action=preview first. The immutable plan reports every exact file rewrite, Unique ID allocation and watermark advance, before/after hash, lossy value change, derived-index rebuild, blocker, snapshot revision, expiry, and plan hash. Required values without a safe default remain blocked for explicit input.',
  '',
  'Call action=apply only after a user approves the unchanged plan hash. Apply is snapshot-bound, idempotent, refuses intervening file changes, rolls back failed rewrites, and returns an attributed receipt.',
].join('\n');

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  action: 'preview' | 'apply';
  ttlSeconds?: number;
  planId?: string;
  planHash?: string;
  approvalToken?: string;
  idempotencyKey?: string;
  principalId?: string;
  cwd?: string;
}

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  action: z.enum(['preview', 'apply']),
  plan: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

function payload(result: Record<string, unknown>): Record<string, unknown> {
  const { ok: _ok, httpStatus: _httpStatus, ...rest } = result;
  return rest;
}

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_repair',
    {
      description: DESCRIPTION,
      inputSchema: {
        action: z.enum(['preview', 'apply']),
        ttlSeconds: z
          .number()
          .int()
          .min(30)
          .max(3_600)
          .optional()
          .describe('Preview lifetime in seconds; defaults to 600.'),
        planId: z.string().startsWith('repair_plan_').optional().describe('Required for apply.'),
        planHash: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional()
          .describe('Required for apply; copy exactly from preview.'),
        approvalToken: z
          .string()
          .startsWith('approve:sha256:')
          .optional()
          .describe('Required for apply after user approval: approve:<planHash>.'),
        idempotencyKey: z
          .string()
          .min(8)
          .max(256)
          .optional()
          .describe('Required for apply; reuse only for an identical retry.'),
        principalId: z
          .string()
          .min(1)
          .max(256)
          .optional()
          .describe('Required for apply; human or agent principal receiving attribution.'),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async (args: Args) => {
      if (
        args.action === 'apply' &&
        (!args.planId ||
          !args.planHash ||
          !args.approvalToken ||
          !args.idempotencyKey ||
          !args.principalId)
      ) {
        return databaseToolInputError(
          'invalid_request',
          'action=apply requires planId, planHash, approvalToken, idempotencyKey, and principalId. Run preview first.',
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
        '/api/databases/repair',
        args.action === 'preview'
          ? { action: args.action, ...(args.ttlSeconds ? { ttlSeconds: args.ttlSeconds } : {}) }
          : {
              action: args.action,
              planId: args.planId,
              planHash: args.planHash,
              approvalToken: args.approvalToken,
              idempotencyKey: args.idempotencyKey,
              principalId: args.principalId,
            },
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) return databaseToolHttpError(response, { action: args.action, cwd });
      const data = payload(response);
      if (args.action === 'preview') {
        const plan = data.plan as
          | { id?: unknown; committable?: unknown; summary?: { blocked?: unknown } }
          | undefined;
        const blocked = Number(plan?.summary?.blocked ?? 0);
        return textPlusStructured(
          plan?.committable === true
            ? `Repair plan ${String(plan.id)} is committable. Review every rewrite and request user approval before apply.`
            : `Repair preview is blocked by ${blocked} issue${blocked === 1 ? '' : 's'} that require explicit input.`,
          { action: args.action, cwd, plan: data.plan as Record<string, unknown> },
        );
      }
      const result = data.result as
        | { idempotentReplay?: unknown; receipt?: { repairId?: unknown } }
        | undefined;
      return textPlusStructured(
        result?.idempotentReplay === true
          ? `Repair ${String(result.receipt?.repairId)} replayed without another mutation.`
          : `Repair ${String(result?.receipt?.repairId)} applied, rebuilt, and verified.`,
        { action: args.action, cwd, result: data.result as Record<string, unknown> },
      );
    },
  );
}
