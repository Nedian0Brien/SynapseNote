/** `data_button` MCP tool — exact planning, composite execution, and run history. */

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
  '[Requires: Hocuspocus server] Plan, execute, or inspect durable runs for one database Button.',
  '',
  'For a database/source Button, pass databaseId plus buttonId. For a Button property, pass databaseId, sourceId, recordId, propertyId, and the expectedRecordRevision returned by data(action=query) or data(action=record). The result binds every configured step to stable scope and permission-policy revisions. Review internalPlan.diff plus each externalSteps connectionId, eventName, exact payload fields/body disclosure, and egressBytes.',
  '',
  'Omit action or use action=plan to review without side effects. action=execute is mutating and requires the exact buttonPlanId and buttonPlanHash returned by the reviewed plan plus a unique idempotencyKey. It commits internal actions first, then delivers ordered external steps through the isolated connection executor and returns one durable composite receipt. action=list_runs returns bounded content-free retry and delivery history.',
].join('\n');

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  action?: 'plan' | 'execute' | 'list_runs';
  databaseId?: string;
  buttonId?: string;
  sourceId?: string;
  recordId?: string;
  propertyId?: string;
  expectedRecordRevision?: string;
  buttonPlanId?: string;
  buttonPlanHash?: string;
  idempotencyKey?: string;
  principalId?: string;
  limit?: number;
  cwd?: string;
}

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  plan: z.record(z.string(), z.unknown()).optional(),
  run: z.record(z.string(), z.unknown()).optional(),
  runs: z.array(z.record(z.string(), z.unknown())).optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_button',
    {
      description: DESCRIPTION,
      inputSchema: {
        action: z.enum(['plan', 'execute', 'list_runs']).optional(),
        databaseId: z.string().startsWith('db_').optional().describe('Stable database ID.'),
        buttonId: z
          .string()
          .startsWith('dbbtn_')
          .optional()
          .describe('Stable database/source Button ID. Omit for a Button property.'),
        sourceId: z
          .string()
          .startsWith('ds_')
          .optional()
          .describe('Stable source ID containing the record.'),
        recordId: z.string().startsWith('rec_').optional().describe('Stable current record ID.'),
        propertyId: z
          .string()
          .startsWith('prop_')
          .optional()
          .describe('Stable Button property ID.'),
        expectedRecordRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional()
          .describe('Exact record revision observed before invoking the Button.'),
        buttonPlanId: z.string().startsWith('buttonplan_').optional(),
        buttonPlanHash: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
        idempotencyKey: z.string().min(8).max(256).optional(),
        principalId: z.string().min(1).max(256).optional(),
        limit: z.number().int().min(1).max(500).optional(),
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
      if (args.action === 'list_runs') {
        const response = await httpPost(
          url,
          '/api/databases/button',
          { action: 'list_runs', limit: args.limit ?? 100 },
          databaseAccessHeaders(deps.identityRef?.current),
        );
        if (!response.ok) return databaseToolHttpError(response, { cwd });
        const runs = Array.isArray(response.runs) ? response.runs : [];
        return textPlusStructured(
          `Returned ${runs.length} durable Button run${runs.length === 1 ? '' : 's'}.`,
          {
            cwd,
            runs: runs as Array<Record<string, unknown>>,
          },
        );
      }
      if (args.action === 'execute') {
        if (!args.buttonPlanId || !args.buttonPlanHash || !args.idempotencyKey) {
          return textResult(
            'Error: buttonPlanId, buttonPlanHash, and idempotencyKey are required for execute.',
            true,
          );
        }
        const response = await httpPost(
          url,
          '/api/databases/button',
          {
            action: 'execute',
            buttonPlanId: args.buttonPlanId,
            buttonPlanHash: args.buttonPlanHash,
            idempotencyKey: args.idempotencyKey,
            approvalToken: `approve:${args.buttonPlanHash}`,
            actor: { principalId: args.principalId ?? 'agent:mcp', kind: 'agent' },
          },
          databaseAccessHeaders(deps.identityRef?.current),
        );
        if (!response.ok) return databaseToolHttpError(response, { cwd });
        const run = response.run as Record<string, unknown>;
        return textPlusStructured(
          `Button run ${String(run.id)} is ${String(run.state)} with one composite internal/external receipt.`,
          { cwd, run },
        );
      }
      if (!args.databaseId) {
        return textResult('Error: databaseId is required for Button planning.', true);
      }
      const response = await httpPost(
        url,
        '/api/databases/button',
        args.buttonId
          ? { databaseId: args.databaseId, buttonId: args.buttonId }
          : {
              databaseId: args.databaseId,
              sourceId: args.sourceId,
              recordId: args.recordId,
              propertyId: args.propertyId,
              expectedRecordRevision: args.expectedRecordRevision,
            },
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) return databaseToolHttpError(response, { cwd });
      const plan = response.plan as
        | {
            id?: unknown;
            internalPlan?: { committable?: unknown } | null;
            externalSteps?: unknown[];
          }
        | undefined;
      const externalCount = Array.isArray(plan?.externalSteps) ? plan.externalSteps.length : 0;
      const message =
        externalCount > 0
          ? `Button plan ${String(plan?.id)} contains ${externalCount} reviewed external step${externalCount === 1 ? '' : 's'}. Execute only the composite plan after reviewing every disclosure.`
          : plan?.internalPlan?.committable === true
            ? `Button plan ${String(plan.id)} contains a committable internal-only exact plan. Review it before data_commit.`
            : `Button plan ${String(plan?.id)} has no committable internal change.`;
      return textPlusStructured(message, {
        cwd,
        plan: response.plan as Record<string, unknown>,
      });
    },
  );
}
