/**
 * `current_document` MCP tool — report the document selected in the user's
 * live SynapseNote editor window. The renderer publishes this state through
 * `__system__` awareness; the local HTTP endpoint ranks multiple windows.
 */

import { z } from 'zod';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

const DESCRIPTION = [
  '[Requires: a running SynapseNote editor] Read the document the user is currently viewing in SynapseNote.',
  '',
  'Use this when the user refers to “this document”, “the note I am viewing”, or otherwise points at their current SynapseNote window without naming a path. With multiple windows, the focused visible window wins; the response also includes every connected viewer for transparency.',
  '',
  '**Parameters:**',
  '- `cwd` (optional) — Project root (see `cwd` description below).',
].join('\n');

const viewerSchema = () =>
  z.object({
    clientId: z.number().int().min(0),
    document: z.string().nullable(),
    focused: z.boolean(),
    visible: z.boolean(),
    updatedAt: z.number().int().min(0),
  });

const OutputSchema = outputSchemaWithText({
  current: viewerSchema()
    .nullable()
    .describe(
      'Best matching live SynapseNote window, preferring focused + visible. Null when no editor window is connected.',
    ),
  viewers: z
    .array(viewerSchema())
    .describe('All connected SynapseNote windows, in the same priority order used for `current`.'),
  cwd: z.string().describe('Absolute project directory whose live editor state was queried.'),
});

interface CurrentDocumentDeps {
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  serverUrl: ServerUrlOrResolver;
}

interface Viewer {
  clientId: number;
  document: string | null;
  focused: boolean;
  visible: boolean;
  updatedAt: number;
}

function isViewer(value: unknown): value is Viewer {
  return viewerSchema().safeParse(value).success;
}

export function register(server: ServerInstance, deps: CurrentDocumentDeps): void {
  server.registerTool(
    'current_document',
    {
      description: DESCRIPTION,
      inputSchema: {
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args: { cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const result = await httpGet(url, '/api/current-document');
      if (!result.ok) return textResult(`Error: ${String(result.error)}`, true);

      const viewers = Array.isArray(result.viewers) ? result.viewers.filter(isViewer) : [];
      const current = isViewer(result.current) ? result.current : null;
      const structured = { current, viewers, cwd };

      if (!current) {
        return textPlusStructured(
          'No live SynapseNote editor window is connected to this project.',
          structured,
        );
      }
      if (current.document === null) {
        return textPlusStructured(
          'The active SynapseNote window is not currently displaying a document.',
          structured,
        );
      }
      return textPlusStructured(`Current SynapseNote document: ${current.document}`, structured);
    },
  );
}
