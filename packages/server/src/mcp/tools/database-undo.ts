/** `data_undo` MCP tool — preview or safely reverse one database mutation. */

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

export const DESCRIPTION = [
  '[Requires: Hocuspocus server; apply requires user approval] Preview or safely reverse a database mutation by its opaque undo token.',
  '',
  'Use action=preview first. It compares the current snapshot and every touched file hash with the committed receipt and returns canApply plus explicit conflicts without changing files. Use action=apply only when canApply=true; provide a unique idempotencyKey and attributed actor.',
  '',
  'Apply refuses without mutation when any target is missing, changed, recreated, or the database snapshot moved. A successful reversal is atomic, verified against the original base snapshot, and recorded in shadow Git.',
].join('\n');

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  action: 'preview' | 'apply';
  undoToken: string;
  idempotencyKey?: string;
  actor?: {
    principalId: string;
    kind: 'human' | 'agent' | 'sync' | 'filesystem' | 'system';
    sessionId?: string;
  };
  cwd?: string;
}

const RevisionSchema = z.union([
  z.string().regex(/^sha256:[a-f0-9]{64}$/),
  z.literal('sha256:empty'),
]);

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  action: z.enum(['preview', 'apply']),
  undoId: z.string().startsWith('undo_').optional(),
  mutationId: z.string().startsWith('mut_').optional(),
  canApply: z.boolean().optional(),
  idempotentReplay: z.boolean().optional(),
  expectedSnapshotRevision: RevisionSchema.optional(),
  observedSnapshotRevision: RevisionSchema.optional(),
  conflicts: z.array(z.record(z.string(), z.unknown())).optional(),
  receipt: z.record(z.string(), z.unknown()).nullable().optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

function payload(result: Record<string, unknown>): Record<string, unknown> {
  const { ok: _ok, httpStatus: _httpStatus, ...rest } = result;
  return rest;
}

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_undo',
    {
      description: DESCRIPTION,
      inputSchema: {
        action: z.enum(['preview', 'apply']),
        undoToken: z
          .string()
          .startsWith('undo_')
          .describe('Opaque token returned by the successful data_commit call.'),
        idempotencyKey: z
          .string()
          .min(8)
          .max(256)
          .optional()
          .describe('Required for apply; reuse only for an identical retry.'),
        actor: z
          .object({
            principalId: z.string().min(1).max(256),
            kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
            sessionId: z.string().min(1).max(256).optional(),
          })
          .strict()
          .optional()
          .describe('Required for apply; omitted for a read-only preview.'),
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
      if (args.action === 'apply' && (!args.idempotencyKey || !args.actor)) {
        return databaseToolInputError(
          'invalid_request',
          'action=apply requires both `idempotencyKey` and `actor`. Run action=preview first.',
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
        '/api/databases/undo',
        {
          action: args.action,
          undoToken: args.undoToken,
          ...(args.action === 'apply'
            ? { idempotencyKey: args.idempotencyKey, actor: args.actor }
            : {}),
        },
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) {
        return databaseToolHttpError(response, { action: args.action, cwd });
      }
      const data = payload(response);
      const conflicts = Array.isArray(data.conflicts) ? data.conflicts.length : 0;
      const message =
        args.action === 'preview'
          ? data.canApply === true
            ? `Undo ${String(data.undoId)} can be applied safely. Request user approval before action=apply.`
            : `Undo ${String(data.undoId)} cannot be applied; review ${conflicts} explicit conflict${conflicts === 1 ? '' : 's'}.`
          : data.canApply === true
            ? data.idempotentReplay === true
              ? `Undo ${String(data.undoId)} replayed without another mutation.`
              : `Undo ${String(data.undoId)} applied and verified.`
            : `Undo ${String(data.undoId)} was refused without mutation because ${conflicts} conflict${conflicts === 1 ? '' : 's'} were found.`;
      return textPlusStructured(message, { cwd, ...data });
    },
  );
}
