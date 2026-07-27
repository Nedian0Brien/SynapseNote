/** `data_markdown_table` MCP tool — mutate a v2 owner Markdown table. */

import { z } from 'zod';
import { databaseAccessHeaders } from '../../database-access-policy.ts';
import { DatabaseMarkdownTableMutationRequestSchema } from '../../database-data-plane-api.ts';
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
  '[Requires: Hocuspocus server; requires user approval] Mutate one v2 Markdown owner table through the storage-aware transaction boundary.',
  '',
  'Use the exact owner, row, and cell revisions returned by the database read model. The operation never writes a v1 record file or a Formula/Rollup result. Keep the receipt for byte-exact undo and retry only after re-reading a stale target.',
].join('\n');

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

type Args = {
  operation: 'update_cell' | 'update_cells' | 'replace_row' | 'delete_row' | 'create_row' | 'copy_row' | 'update_title' | 'move_document' | 'update_lifecycle' | 'undo';
  input: unknown;
  cwd?: string;
};

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  operation: z.enum(['update_cell', 'update_cells', 'replace_row', 'delete_row', 'create_row', 'copy_row', 'update_title', 'move_document', 'update_lifecycle', 'undo']),
  changed: z.boolean().optional(),
  receipt: z.record(z.string(), z.unknown()).optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

function payload(result: Record<string, unknown>): Record<string, unknown> {
  const { ok: _ok, httpStatus: _httpStatus, ...rest } = result;
  return rest;
}

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_markdown_table',
    {
      description: DESCRIPTION,
      inputSchema: {
        operation: z.enum([
          'update_cell',
          'update_cells',
          'replace_row',
          'delete_row',
          'create_row',
          'copy_row',
          'update_title',
          'move_document',
          'update_lifecycle',
          'undo',
        ]),
        input: z.unknown().describe('Exact operation input, including expected revisions.'),
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
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const request = { operation: args.operation, input: args.input };
      const parsed = DatabaseMarkdownTableMutationRequestSchema.safeParse(request);
      if (!parsed.success) {
        return textResult(`Invalid Markdown table mutation: ${parsed.error.message}`, true);
      }
      const response = await httpPost(
        url,
        '/api/databases/markdown-table/mutate',
        request,
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) return databaseToolHttpError(response, { cwd });
      const data = payload(response);
      return textPlusStructured(
        data.changed === false
          ? 'Markdown owner-table mutation was already at the requested value.'
          : 'Markdown owner-table mutation completed; preserve the receipt for undo.',
        { cwd, ...data },
      );
    },
  );
}
