/** `data_comments` MCP tool — revision-safe database record discussion. */

import type { DatabaseCommentAnchor } from '@nedian0brien/synapsenote-core';
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

const ACTIONS = ['read', 'add_thread', 'reply', 'set_resolved', 'edit_comment'] as const;
type Action = (typeof ACTIONS)[number];

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  action: Action;
  databaseId: string;
  recordId: string;
  expectedRevision?: string;
  anchor?: DatabaseCommentAnchor;
  threadId?: string;
  commentId?: string;
  body?: string;
  mentionedPersonIds?: string[];
  resolved?: boolean;
  cwd?: string;
}

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  action: z.enum(ACTIONS),
  revision: z.string().optional(),
  document: z.record(z.string(), z.unknown()).optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

function invalid(args: Args, cwd: string, message: string) {
  return databaseToolInputError('invalid_request', message, { action: args.action, cwd });
}

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Read and participate in page- or property-level database record comment threads.',
  '',
  'Start with action=read and keep the returned revision. Every mutation requires that exact expectedRevision, so concurrent human or agent discussion is never overwritten. Use stable IDs from data(kind=describe/query). Property comments are accepted only for assigned supported values; Title, Formula, Rollup, Button, and Unique ID properties intentionally reject anchors.',
  '',
  'Mention only active person IDs declared by the database. Resolved threads must be reopened before replying. The server attributes writes to this MCP connection; no actor parameter is accepted.',
].join('\n');

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_comments',
    {
      description: DESCRIPTION,
      inputSchema: {
        action: z.enum(ACTIONS),
        databaseId: z.string().startsWith('db_'),
        recordId: z.string().startsWith('rec_'),
        expectedRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
        anchor: z
          .discriminatedUnion('type', [
            z.object({ type: z.literal('page') }).strict(),
            z
              .object({ type: z.literal('property'), propertyId: z.string().startsWith('prop_') })
              .strict(),
          ])
          .optional(),
        threadId: z.string().startsWith('cth_').optional(),
        commentId: z.string().startsWith('cmt_').optional(),
        body: z.string().trim().min(1).max(10_000).optional(),
        mentionedPersonIds: z.array(z.string().startsWith('person_')).max(100).optional(),
        resolved: z.boolean().optional(),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
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
      if (args.action !== 'read' && !args.expectedRevision) {
        return invalid(
          args,
          cwd,
          'Mutations require expectedRevision from the latest action=read result.',
        );
      }
      if (args.action === 'add_thread' && (!args.anchor || !args.body)) {
        return invalid(args, cwd, 'action=add_thread requires anchor and body.');
      }
      if (args.action === 'reply' && (!args.threadId || !args.body)) {
        return invalid(args, cwd, 'action=reply requires threadId and body.');
      }
      if (args.action === 'set_resolved' && (!args.threadId || args.resolved === undefined)) {
        return invalid(args, cwd, 'action=set_resolved requires threadId and resolved.');
      }
      if (args.action === 'edit_comment' && (!args.threadId || !args.commentId || !args.body)) {
        return invalid(args, cwd, 'action=edit_comment requires threadId, commentId, and body.');
      }
      const identity = deps.identityRef?.current;
      const actor = {
        kind: 'agent' as const,
        principal_id: `agent:${identity?.connectionId ?? 'mcp'}`,
      };
      const response = await httpPost(
        url,
        '/api/databases/comments',
        {
          action: args.action,
          databaseId: args.databaseId,
          recordId: args.recordId,
          actor,
          ...(args.expectedRevision ? { expectedRevision: args.expectedRevision } : {}),
          ...(args.anchor ? { anchor: args.anchor } : {}),
          ...(args.threadId ? { threadId: args.threadId } : {}),
          ...(args.commentId ? { commentId: args.commentId } : {}),
          ...(args.body ? { body: args.body } : {}),
          ...(args.mentionedPersonIds ? { mentionedPersonIds: args.mentionedPersonIds } : {}),
          ...(args.resolved === undefined ? {} : { resolved: args.resolved }),
        },
        databaseAccessHeaders(identity),
      );
      if (!response.ok) return databaseToolHttpError(response, { action: args.action, cwd });
      const revision = typeof response.revision === 'string' ? response.revision : undefined;
      const document = response.document as Record<string, unknown> | undefined;
      const threads = Array.isArray(document?.threads) ? document.threads.length : 0;
      return textPlusStructured(
        args.action === 'read'
          ? `Loaded ${threads} comment thread${threads === 1 ? '' : 's'} at revision ${String(revision)}.`
          : `Database comments updated at revision ${String(revision)}.`,
        { cwd, action: args.action, revision, document },
      );
    },
  );
}
