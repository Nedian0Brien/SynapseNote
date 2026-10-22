/** `data_automation` MCP tool — dry-run and test-event automation inspection. */

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

const EventSchema = z
  .object({
    deduplicationKey: z.string().min(1).max(256),
    databaseId: z.string().startsWith('db_'),
    kind: z.enum([
      'record_added',
      'property_changed',
      'schedule',
      'form_submitted',
      'button_invoked',
    ]),
    occurredAt: z.string().datetime().optional(),
    sourceId: z.string().startsWith('ds_').nullable().optional(),
    recordId: z.string().startsWith('rec_').nullable().optional(),
    recordRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    propertyId: z.string().startsWith('prop_').nullable().optional(),
    viewId: z.string().startsWith('view_').nullable().optional(),
    buttonId: z.string().startsWith('dbbtn_').nullable().optional(),
    scheduledFor: z.string().datetime().nullable().optional(),
  })
  .strict();

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  action: 'dry_run' | 'test_event' | 'mark_notification_read';
  databaseId?: string;
  automationId?: string;
  event?: z.infer<typeof EventSchema>;
  notificationId?: string;
  cwd?: string;
}

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  result: z.record(z.string(), z.unknown()).optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_automation',
    {
      description:
        'Dry-run a versioned database automation, inject one explicit test event, or mark an automation inbox notification as read. Dry runs return bounded plan counts and reviewed egress metadata without record payloads. test_event is mutating: it persists a deduplicated event and executes matching enabled automation runs through the common permission, plan, commit, audit, retry, and outbox engine.',
      inputSchema: {
        action: z.enum(['dry_run', 'test_event', 'mark_notification_read']),
        databaseId: z.string().startsWith('db_').optional(),
        automationId: z.string().startsWith('auto_').optional(),
        event: EventSchema.optional(),
        notificationId: z.string().startsWith('autonote_').optional(),
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
      if (args.action === 'mark_notification_read') {
        if (!args.notificationId) {
          return textResult('Error: notificationId is required for mark_notification_read.', true);
        }
        const response = await httpPost(
          url,
          '/api/databases/automations',
          { action: args.action, notificationId: args.notificationId },
          databaseAccessHeaders(deps.identityRef?.current),
        );
        if (!response.ok) return databaseToolHttpError(response, { cwd });
        return textPlusStructured(`Marked notification ${args.notificationId} as read.`, {
          cwd,
          result: response,
        });
      }
      if (!args.databaseId || !args.automationId || !args.event) {
        return textResult(
          'Error: databaseId, automationId, and event are required for automation dry_run and test_event.',
          true,
        );
      }
      const response = await httpPost(
        url,
        '/api/databases/automations',
        {
          action: args.action,
          databaseId: args.databaseId,
          automationId: args.automationId,
          event: args.event,
        },
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) return databaseToolHttpError(response, { cwd });
      const runs = Array.isArray(response.runs) ? response.runs.length : 0;
      return textPlusStructured(
        args.action === 'dry_run'
          ? `Automation ${args.automationId} dry run produced a reviewed, non-executed plan summary.`
          : `Automation test event was accepted and produced ${runs} completed or retrying run${runs === 1 ? '' : 's'}.`,
        { cwd, result: response },
      );
    },
  );
}
