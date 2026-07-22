/**
 * `data_plan` MCP tool — ephemeral database desired-state drafts and immutable
 * snapshot-bound plans. It never writes canonical files.
 */

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

const ACTIONS = [
  'create_draft',
  'create_database_deletion_draft',
  'create_verification_draft',
  'get_draft',
  'discard_draft',
  'create_plan',
  'get_plan',
  'preview_property_conversion',
] as const;
type Action = (typeof ACTIONS)[number];

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Draft and inspect database changes without writing project files.',
  '',
  'Start with action=create_draft and provide desiredState containing the complete database contract, sources, property schema, views, optional unique key, templates, policy, and records. Explicit stable IDs are preferred for existing objects; when omitted, exact database/source/property/option/view stable keys are compiled to current IDs and recorded in targetResolutions. A two-way relation declares pairedPropertyKey on both relation properties, or the exact symmetric pairedPropertyId values; changing one side expands both records into the same revision-bound plan. A record without an ID resolves only through the declared unique key; ambiguity is refused. Explicit existing-record IDs require expectedRevision. Each sampleRecords values/body pair is the complete desired database-owned record state. For an existing record patch, use recordMutations with ordered set, unset, add, remove, increment, append, link, or unlink operations; target it by id plus expectedRevision or by one exact declared uniqueValue. Then call action=create_plan with draftId. To remove an entire database (including its last source), use action=create_database_deletion_draft with databaseId and the exact catalog snapshot revision; this freezes the manifest and every indexed record before returning a separately approval-gated deletion plan. The snapshot-bound plan compiles ensure_database, delete_database, ensure_property, ensure_view, ensure_relation, alter_schema, mutate_record, and upsert/delete_records into explicit actions plus immutable targets, permission/query write guards, an exact semantic diff, risk, conflicts, approvals, postconditions, expiry, and a plan hash. A changed schema, target revision, permission revision, or bound query snapshot requires a fresh plan.',
  '',
  'For a property-type migration, use action=preview_property_conversion with databaseId, sourceId, propertyId, and the complete targetProperty schema preserving the same stable ID, key, and name. The response classifies the matrix edge, reports every converted, lossy, or blocked record against its exact revision, and returns no plan when any row is invalid. Lossy conversions return no plan until the call is repeated with allowLossy=true. A successful preview compiles the schema change and all value rewrites into one ordinary immutable plan for data_commit; exact source values remain available to transaction undo.',
  '',
  'This tool only changes ephemeral server memory. It cannot commit, mutate Markdown, or create Git noise. A plan with committable=false must be resolved and recreated; never treat a draft as canonical state.',
].join('\n');

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  action: Action;
  desiredState?: Record<string, unknown>;
  lifecycle?: Record<string, unknown>;
  principalId?: string;
  draftId?: string;
  planId?: string;
  databaseId?: string;
  expectedSnapshotRevision?: string;
  sourceId?: string;
  propertyId?: string;
  targetProperty?: Record<string, unknown>;
  allowLossy?: boolean;
  ttlSeconds?: number;
  cwd?: string;
}

const OutputSchema = outputSchemaWithText({
  action: z.enum(ACTIONS),
  cwd: z.string(),
  draft: z.record(z.string(), z.unknown()).optional(),
  plan: z.record(z.string(), z.unknown()).optional(),
  preview: z.record(z.string(), z.unknown()).optional(),
  review: z.record(z.string(), z.unknown()).optional(),
  discarded: z.boolean().optional(),
  draftId: z.string().optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

function payload(result: Record<string, unknown>): Record<string, unknown> {
  const { ok: _ok, httpStatus: _httpStatus, ...rest } = result;
  return rest;
}

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_plan',
    {
      description: DESCRIPTION,
      inputSchema: {
        action: z.enum(ACTIONS),
        desiredState: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            'action=create_draft: complete desired database state. Prefer stable IDs; omitted exact stable keys are resolved visibly. Existing records need id+expectedRevision unless a declared unique key resolves exactly one current record.',
          ),
        lifecycle: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            'action=create_verification_draft: verify, renew, or unverify target with exact database/source/record/property IDs and expectedRevision. Attribution is injected from principalId; never include verifiedBy.',
          ),
        principalId: z
          .string()
          .min(1)
          .max(500)
          .optional()
          .describe('Authenticated agent principal for a Verification lifecycle review.'),
        draftId: z
          .string()
          .optional()
          .describe('Required for get_draft, discard_draft, or create_plan.'),
        planId: z.string().optional().describe('Required for get_plan.'),
        databaseId: z
          .string()
          .optional()
          .describe('Required for property conversion preview or complete database deletion.'),
        expectedSnapshotRevision: z
          .string()
          .optional()
          .describe(
            'action=create_database_deletion_draft: exact catalog snapshot revision returned by catalog/describe.',
          ),
        sourceId: z.string().optional().describe('Required for property conversion preview.'),
        propertyId: z
          .string()
          .optional()
          .describe('Stable property ID to convert without changing its identity.'),
        targetProperty: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Complete target property schema with the same ID, key, and name.'),
        allowLossy: z
          .boolean()
          .optional()
          .describe('Must be explicitly true before a lossy conversion plan is created.'),
        ttlSeconds: z
          .number()
          .int()
          .min(60)
          .max(86_400)
          .optional()
          .describe('Draft or plan lifetime. Plan lifetime is capped at 3600 seconds.'),
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

      let body: Record<string, unknown>;
      let endpoint = '/api/databases/plan';
      switch (args.action) {
        case 'create_draft':
          if (!args.desiredState) {
            return databaseToolInputError(
              'invalid_request',
              'action=create_draft requires `desiredState`.',
              { action: args.action, cwd },
            );
          }
          body = {
            action: args.action,
            desiredState: args.desiredState,
            ...(args.ttlSeconds === undefined ? {} : { ttlSeconds: args.ttlSeconds }),
          };
          break;
        case 'create_database_deletion_draft':
          if (!args.databaseId || !args.expectedSnapshotRevision) {
            return databaseToolInputError(
              'invalid_request',
              'action=create_database_deletion_draft requires databaseId and expectedSnapshotRevision.',
              { action: args.action, cwd },
            );
          }
          body = {
            action: args.action,
            databaseId: args.databaseId,
            expectedSnapshotRevision: args.expectedSnapshotRevision,
            ...(args.ttlSeconds === undefined ? {} : { ttlSeconds: args.ttlSeconds }),
          };
          break;
        case 'create_verification_draft':
          if (!args.lifecycle || !args.principalId) {
            return databaseToolInputError(
              'invalid_request',
              'action=create_verification_draft requires lifecycle and principalId; lifecycle must not contain verifiedBy.',
              { action: args.action, cwd },
            );
          }
          body = {
            action: args.action,
            lifecycle: args.lifecycle,
            actor: { principalId: args.principalId, kind: 'agent' },
            ...(args.ttlSeconds === undefined ? {} : { ttlSeconds: args.ttlSeconds }),
          };
          break;
        case 'get_draft':
        case 'discard_draft':
        case 'create_plan':
          if (!args.draftId) {
            return databaseToolInputError(
              'invalid_request',
              `action=${args.action} requires \`draftId\`.`,
              { action: args.action, cwd },
            );
          }
          body = {
            action: args.action,
            draftId: args.draftId,
            ...(args.action === 'create_plan' && args.ttlSeconds !== undefined
              ? { ttlSeconds: args.ttlSeconds }
              : {}),
          };
          break;
        case 'get_plan':
          if (!args.planId) {
            return databaseToolInputError('invalid_request', 'action=get_plan requires `planId`.', {
              action: args.action,
              cwd,
            });
          }
          body = { action: args.action, planId: args.planId };
          break;
        case 'preview_property_conversion':
          if (!args.databaseId || !args.sourceId || !args.propertyId || !args.targetProperty) {
            return databaseToolInputError(
              'invalid_request',
              'action=preview_property_conversion requires databaseId, sourceId, propertyId, and targetProperty.',
              { action: args.action, cwd },
            );
          }
          endpoint = '/api/databases/property-conversion';
          body = {
            databaseId: args.databaseId,
            sourceId: args.sourceId,
            propertyId: args.propertyId,
            targetProperty: args.targetProperty,
            allowLossy: args.allowLossy === true,
            ...(args.ttlSeconds === undefined ? {} : { ttlSeconds: args.ttlSeconds }),
          };
          break;
      }

      const response = await httpPost(
        url,
        endpoint,
        body,
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) {
        return databaseToolHttpError(response, { action: args.action, cwd });
      }
      const data = payload(response);
      if (args.action === 'preview_property_conversion') {
        const preview = data.preview as
          | {
              committable?: unknown;
              requiresLossyApproval?: unknown;
              summary?: { blocked?: unknown; lossy?: unknown; converted?: unknown };
            }
          | undefined;
        const blocked = Number(preview?.summary?.blocked ?? 0);
        const lossy = Number(preview?.summary?.lossy ?? 0);
        const converted = Number(preview?.summary?.converted ?? 0);
        const message =
          preview?.requiresLossyApproval === true
            ? `Property conversion has ${lossy} lossy row${lossy === 1 ? '' : 's'} and requires explicit allowLossy=true before a plan can be created.`
            : preview?.committable === true && data.plan
              ? `Property conversion is committable for ${converted + lossy} row${converted + lossy === 1 ? '' : 's'}. Review the exact schema and record diff before data_commit.`
              : `Property conversion is blocked for ${blocked} row${blocked === 1 ? '' : 's'}. Fix every reported value or choose another target type.`;
        return textPlusStructured(message, {
          action: args.action,
          cwd,
          preview: data.preview as Record<string, unknown>,
          ...(data.draft ? { draft: data.draft as Record<string, unknown> } : {}),
          ...(data.plan ? { plan: data.plan as Record<string, unknown> } : {}),
        });
      }
      if (args.action === 'discard_draft') {
        return textPlusStructured(
          data.discarded === true
            ? 'Ephemeral database draft discarded.'
            : 'Draft was already absent.',
          { action: args.action, cwd, ...data },
        );
      }
      if (args.action === 'create_plan' || args.action === 'get_plan') {
        const plan = data.plan as
          | {
              committable?: unknown;
              requiresCommit?: unknown;
              conflicts?: unknown[];
              id?: unknown;
            }
          | undefined;
        const conflictCount = Array.isArray(plan?.conflicts) ? plan.conflicts.length : 0;
        return textPlusStructured(
          plan?.requiresCommit === false && conflictCount === 0
            ? `Database desired state is already converged; plan ${String(plan.id)} requires no commit.`
            : plan?.committable === true
              ? `Immutable database plan ${String(plan.id)} is committable. Review exact diff, approvals, and postconditions before commit.`
              : `Database plan is not committable and reports ${conflictCount} conflict${conflictCount === 1 ? '' : 's'}. Resolve them and create a new plan.`,
          { action: args.action, cwd, plan: data.plan as Record<string, unknown> },
        );
      }
      return textPlusStructured(
        args.action === 'create_verification_draft'
          ? 'Authenticated Verification lifecycle draft created. Review actor, expiry, evidence revision, and target before action=create_plan.'
          : args.action === 'create_draft'
            ? 'Ephemeral database draft created without writing project files. Use its draftId with action=create_plan.'
            : 'Ephemeral database draft loaded.',
        {
          action: args.action,
          cwd,
          draft: data.draft as Record<string, unknown>,
          ...(data.review ? { review: data.review as Record<string, unknown> } : {}),
        },
      );
    },
  );
}
