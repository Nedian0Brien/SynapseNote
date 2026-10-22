/**
 * `data` MCP tool — token-efficient database discovery and exact reads.
 *
 * The three-step protocol intentionally keeps discovery compact: catalog
 * returns candidate cards, describe expands one stable database/source, and
 * query returns only selected typed values from the current index snapshot.
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
  httpGet,
  httpPost,
  outputSchemaWithText,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

const DATABASE_KINDS = [
  'catalog',
  'describe',
  'find',
  'retrieve',
  'query',
  'pack',
  'template_runs',
  'automation_runs',
  'automation_notifications',
] as const;
type DatabaseKind = (typeof DATABASE_KINDS)[number];

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Discover and read SynapseNote databases through stable machine IDs.',
  '',
  'Use `kind="catalog"` FIRST when the target database is not already known. It returns compact ranked candidates and never silently picks an ambiguous match. Then call `kind="describe"` for exactly one candidate to learn source/property/option/view IDs and semantics. Use `kind="find"` to compile a forgiving request into a visible typed query; ambiguous properties or invalid values are returned for resolution and are never executed. Use `kind="retrieve"` only when explicit lexical, semantic, or hybrid ranking is wanted; semantic state, model, privacy, freshness, degradation, and per-hit RRF contributions remain visible. Call `kind="query"` with stable IDs for exact structured results, or `kind="pack"` to receive a token-budgeted context artifact.',
  'Use `kind="template_runs"` with a stable database ID to inspect bounded durable repeating-template success, retry, and failure history without reading record content.',
  'Use `kind="automation_runs"` with a stable database ID to inspect content-free automation lifecycle, retry, and delivery receipts.',
  'Use `kind="automation_notifications"` to receive a bounded unread inbox without loading database records.',
  '',
  'This progression is designed for token efficiency: catalog is a small routing card, describe is schema-on-demand, and query supports saved viewId revisions, filters, sorting, projection, two-level grouping, typed per-column calculations, limits, and cursors. Aggregations run over the complete permission-scoped match set before record paging and carry separate group completeness/truncation. Query responses report matched/returned counts, explicit no-match/permission/partial-index/truncation state, cursor, revisions, index freshness, permission exclusions, and a content-free explain trace so absence is never inferred from a partial or access-filtered result.',
].join('\n');

interface DatabaseDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface DatabaseArgs {
  kind: DatabaseKind;
  search?: string;
  ifCatalogRevision?: string;
  databaseId?: string;
  databaseKey?: string;
  templateId?: string;
  automationId?: string;
  recipientId?: string;
  unreadOnly?: boolean;
  ifSchemaRevision?: string;
  sourceId?: string;
  viewId?: string;
  agentViewId?: string;
  query?: z.infer<typeof McpDatabaseQuerySchema>;
  text?: string;
  retrievalMode?: 'lexical' | 'semantic' | 'hybrid';
  includeBody?: boolean;
  lexicalWeight?: number;
  semanticWeight?: number;
  requireSemantic?: boolean;
  limit?: number;
  goal?: string;
  propertyIds?: string[];
  maxTokens?: number;
  reserveTokens?: number;
  tokenizer?: 'utf8_bytes_div3' | 'utf8_bytes_div2';
  encoding?: 'object_rows' | 'columnar_dictionary';
  disclosure?:
    | { level: 'records' }
    | { level: 'evidence'; searchText: string }
    | { level: 'full_body' };
  relationExpansion?: {
    maxDepth: number;
    maxRecords: number;
    maxRecordsPerRelation: number;
    projections?: Array<{ sourceId: string; propertyIds: string[] }>;
  };
  cursor?: string;
  deltaSince?: {
    queryId: string;
    recordRevisions: Record<string, string | null>;
    isComplete: boolean;
  };
  cwd?: string;
}

const OutputSchema = outputSchemaWithText({
  kind: z.enum(DATABASE_KINDS),
  cwd: z.string(),
  catalog: z.record(z.string(), z.unknown()).optional(),
  description: z.record(z.string(), z.unknown()).optional(),
  find: z.record(z.string(), z.unknown()).optional(),
  retrieval: z.record(z.string(), z.unknown()).optional(),
  queryResult: z.record(z.string(), z.unknown()).optional(),
  pack: z.record(z.string(), z.unknown()).optional(),
  templateRuns: z.record(z.string(), z.unknown()).optional(),
  automationRuns: z.record(z.string(), z.unknown()).optional(),
  automationNotifications: z.record(z.string(), z.unknown()).optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

const filterValueSchema = () =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]);

const filterLeafSchema = () =>
  z
    .object({
      propertyId: z.string().min(1),
      operator: z.enum([
        'eq',
        'neq',
        'contains',
        'does_not_contain',
        'starts_with',
        'ends_with',
        'in',
        'gt',
        'gte',
        'lt',
        'lte',
        'is_empty',
        'is_not_empty',
      ]),
      value: filterValueSchema().optional(),
    })
    .strict();

const McpDatabaseQuerySchema = z
  .object({
    where: z
      .union([
        filterLeafSchema(),
        z.object({ and: z.array(filterLeafSchema()).min(1) }).strict(),
        z.object({ or: z.array(filterLeafSchema()).min(1) }).strict(),
        z.object({ not: filterLeafSchema() }).strict(),
      ])
      .optional(),
    sort: z
      .array(
        z
          .object({
            propertyId: z.string().min(1),
            direction: z.enum(['asc', 'desc']).optional(),
          })
          .strict(),
      )
      .optional(),
    select: z.array(z.string().min(1)).optional(),
    aggregate: z
      .object({
        groupBy: z
          .array(
            z
              .object({
                propertyId: z.string().min(1),
                direction: z.enum(['asc', 'desc']).optional(),
                arrayMode: z.enum(['set', 'each']).optional(),
                includeEmpty: z.boolean().optional(),
              })
              .strict(),
          )
          .max(2)
          .optional(),
        calculations: z
          .array(
            z
              .object({
                id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
                function: z.enum([
                  'count_all',
                  'count_values',
                  'count_unique',
                  'percent_empty',
                  'percent_not_empty',
                  'sum',
                  'average',
                  'median',
                  'min',
                  'max',
                  'range',
                  'earliest',
                  'latest',
                  'date_range',
                  'checked',
                  'unchecked',
                  'percent_checked',
                  'percent_unchecked',
                ]),
                propertyId: z.string().min(1).optional(),
              })
              .strict(),
          )
          .max(100)
          .optional(),
        groupLimit: z.number().int().min(1).max(500).optional(),
        membershipLimit: z.number().int().min(1).max(1_000).optional(),
      })
      .strict()
      .optional(),
    page: z
      .object({
        limit: z.number().int().min(1).max(500).optional(),
        cursor: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function payload(result: Record<string, unknown>): Record<string, unknown> {
  const { ok: _ok, httpStatus: _httpStatus, ...rest } = result;
  return rest;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function invalidToolRequest(
  kind: DatabaseKind,
  cwd: string,
  message: string,
): ReturnType<typeof textPlusStructured> {
  return databaseToolInputError('invalid_request', message, { kind, cwd });
}

export function register(server: ServerInstance, deps: DatabaseDeps): void {
  server.registerTool(
    'data',
    {
      description: DESCRIPTION,
      inputSchema: {
        kind: z.enum(DATABASE_KINDS).describe('Operation: catalog → describe → query.'),
        search: z
          .string()
          .optional()
          .describe('kind=catalog: optional database name, key, purpose, or vocabulary search.'),
        ifCatalogRevision: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional()
          .describe(
            'kind=catalog: catalogRevision from an identical cached catalog request. It binds both query and manifest; a match returns notModified metadata only.',
          ),
        databaseId: z
          .string()
          .optional()
          .describe('Stable database ID. Required for query; preferred for describe.'),
        databaseKey: z
          .string()
          .optional()
          .describe('Stable database key accepted by describe when databaseId is not known.'),
        templateId: z
          .string()
          .startsWith('tpl_')
          .optional()
          .describe('kind=template_runs: optional stable template ID to narrow durable history.'),
        automationId: z
          .string()
          .startsWith('auto_')
          .optional()
          .describe(
            'kind=automation_runs: optional stable automation ID to narrow durable history.',
          ),
        recipientId: z
          .string()
          .startsWith('person_')
          .optional()
          .describe('kind=automation_notifications: optional stable recipient person ID.'),
        unreadOnly: z
          .boolean()
          .optional()
          .describe('kind=automation_notifications: return unread notifications only.'),
        ifSchemaRevision: z
          .string()
          .optional()
          .describe(
            'kind=describe: schemaRevision from a cached description. A match returns only notModified metadata.',
          ),
        sourceId: z
          .string()
          .optional()
          .describe('Stable source ID. Optional for describe; required for query.'),
        viewId: z
          .string()
          .startsWith('view_')
          .optional()
          .describe(
            'kind=query: saved view ID. Applies its saved filter, default sort, and projection and returns a revision receipt.',
          ),
        agentViewId: z
          .string()
          .startsWith('view_')
          .optional()
          .describe(
            'kind=query|pack: saved Agent View ID. Applies its filter, projection, row/relation limits, semantic contract, token budget, and write policy receipt.',
          ),
        text: z
          .string()
          .optional()
          .describe(
            'kind=find: forgiving natural-language request; kind=retrieve: exact retrieval text.',
          ),
        retrievalMode: z
          .enum(['lexical', 'semantic', 'hybrid'])
          .optional()
          .describe('kind=retrieve: explicit retrieval strategy.'),
        includeBody: z
          .boolean()
          .optional()
          .describe('kind=retrieve: include Markdown body in lexical retrieval.'),
        lexicalWeight: z
          .number()
          .finite()
          .min(0)
          .max(100)
          .optional()
          .describe('kind=retrieve: lexical RRF weight, default 1.'),
        semanticWeight: z
          .number()
          .finite()
          .min(0)
          .max(100)
          .optional()
          .describe('kind=retrieve: semantic RRF weight, default 1.'),
        requireSemantic: z
          .boolean()
          .optional()
          .describe(
            'kind=retrieve: fail instead of visibly degrading when semantic is unavailable.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe(
            'kind=find: default result limit when the text does not specify top/first/limit.',
          ),
        query: McpDatabaseQuerySchema.optional().describe(
          'kind=query|pack: typed where/sort/select/page/aggregate request. Pack ignores page and aggregate and uses its own overflow cursor.',
        ),
        deltaSince: z
          .object({
            queryId: z.string().startsWith('qry_'),
            recordRevisions: z.record(z.string(), z.string().nullable()),
            isComplete: z.boolean(),
          })
          .strict()
          .optional()
          .describe(
            'kind=query: receipt from a prior identical query. Returns added/changed/unchanged and safe removal information for the returned page.',
          ),
        goal: z.string().optional().describe('kind=pack: the task the context should support.'),
        propertyIds: z
          .array(z.string().min(1))
          .optional()
          .describe('kind=retrieve: lexical property scope; kind=pack: properties to include.'),
        maxTokens: z
          .number()
          .int()
          .min(128)
          .max(100_000)
          .optional()
          .describe('kind=pack: hard token estimate cap.'),
        reserveTokens: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('kind=pack: tokens reserved for the agent response or other context.'),
        tokenizer: z
          .enum(['utf8_bytes_div3', 'utf8_bytes_div2'])
          .optional()
          .describe('kind=pack: explicit estimator; div2 is the more conservative byte fallback.'),
        encoding: z
          .enum(['object_rows', 'columnar_dictionary'])
          .optional()
          .describe('kind=pack: readable object rows or compact columnar dictionaries.'),
        disclosure: z
          .discriminatedUnion('level', [
            z.object({ level: z.literal('records') }).strict(),
            z
              .object({
                level: z.literal('evidence'),
                searchText: z.string().trim().min(1).max(2_000),
              })
              .strict(),
            z.object({ level: z.literal('full_body') }).strict(),
          ])
          .optional()
          .describe(
            'kind=pack: progressive disclosure. records is compact; evidence adds exact excerpts for searchText; full_body explicitly expands canonical Markdown bodies.',
          ),
        relationExpansion: z
          .object({
            maxDepth: z.number().int().min(1).max(3),
            maxRecords: z.number().int().min(1).max(500),
            maxRecordsPerRelation: z.number().int().min(1).max(50),
            projections: z
              .array(
                z
                  .object({
                    sourceId: z.string().min(1),
                    propertyIds: z.array(z.string().min(1)).min(1).max(200),
                  })
                  .strict(),
              )
              .max(100)
              .optional(),
          })
          .strict()
          .optional()
          .describe(
            'kind=pack: explicit bounded relation traversal. Caps depth, total related records, and per-property fan-out; target sources default to title-only unless projected.',
          ),
        cursor: z.string().optional().describe('kind=pack: overflow cursor from a previous pack.'),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args: DatabaseArgs, extra) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const accessHeaders = databaseAccessHeaders(deps.identityRef?.current);

      let result: Record<string, unknown>;
      switch (args.kind) {
        case 'catalog': {
          const params = new URLSearchParams();
          if (args.search) params.set('q', args.search);
          if (args.ifCatalogRevision) {
            params.set('ifCatalogRevision', args.ifCatalogRevision);
          }
          const query = params.size > 0 ? `?${params.toString()}` : '';
          result = await httpGet(url, `/api/databases/catalog${query}`, accessHeaders);
          break;
        }
        case 'describe': {
          if (!args.databaseId && !args.databaseKey) {
            return invalidToolRequest(
              args.kind,
              cwd,
              'kind=describe requires `databaseId` or `databaseKey`. Run kind=catalog first if neither is known.',
            );
          }
          result = await httpPost(
            url,
            '/api/databases/describe',
            {
              ...(args.databaseId ? { databaseId: args.databaseId } : {}),
              ...(args.databaseKey ? { databaseKey: args.databaseKey } : {}),
              ...(args.sourceId ? { sourceId: args.sourceId } : {}),
              ...(args.ifSchemaRevision ? { ifSchemaRevision: args.ifSchemaRevision } : {}),
            },
            accessHeaders,
            extra?.signal,
          );
          break;
        }
        case 'find': {
          if (!args.databaseId || !args.sourceId || !args.text) {
            return invalidToolRequest(
              args.kind,
              cwd,
              'kind=find requires `databaseId`, `sourceId`, and `text`. Run catalog/describe first for stable IDs.',
            );
          }
          result = await httpPost(
            url,
            '/api/databases/find',
            {
              databaseId: args.databaseId,
              sourceId: args.sourceId,
              text: args.text,
              ...(args.limit ? { limit: args.limit } : {}),
            },
            accessHeaders,
            extra?.signal,
          );
          break;
        }
        case 'retrieve': {
          if (
            !args.databaseId ||
            !args.sourceId ||
            !args.text ||
            !args.retrievalMode ||
            (args.limit !== undefined && args.limit > 100)
          ) {
            return invalidToolRequest(
              args.kind,
              cwd,
              'kind=retrieve requires databaseId, sourceId, text, retrievalMode, and a limit no greater than 100.',
            );
          }
          result = await httpPost(
            url,
            '/api/databases/retrieve',
            {
              databaseId: args.databaseId,
              sourceId: args.sourceId,
              text: args.text,
              mode: args.retrievalMode,
              ...(args.propertyIds ? { propertyIds: args.propertyIds } : {}),
              ...(args.includeBody === undefined ? {} : { includeBody: args.includeBody }),
              ...(args.lexicalWeight === undefined ? {} : { lexicalWeight: args.lexicalWeight }),
              ...(args.semanticWeight === undefined ? {} : { semanticWeight: args.semanticWeight }),
              ...(args.requireSemantic === undefined
                ? {}
                : { requireSemantic: args.requireSemantic }),
              ...(args.limit === undefined ? {} : { limit: args.limit }),
            },
            accessHeaders,
          );
          break;
        }
        case 'query': {
          if (!args.databaseId || !args.sourceId) {
            return invalidToolRequest(
              args.kind,
              cwd,
              'kind=query requires `databaseId` and `sourceId`. Run kind=describe first to obtain exact stable IDs.',
            );
          }
          result = await httpPost(
            url,
            '/api/databases/query',
            {
              databaseId: args.databaseId,
              sourceId: args.sourceId,
              ...(args.viewId ? { viewId: args.viewId } : {}),
              ...(args.agentViewId ? { agentViewId: args.agentViewId } : {}),
              ...(args.query ? { query: args.query } : {}),
              ...(args.deltaSince ? { deltaSince: args.deltaSince } : {}),
            },
            accessHeaders,
            extra?.signal,
          );
          break;
        }
        case 'pack': {
          if (
            !args.databaseId ||
            !args.sourceId ||
            !args.goal ||
            (!args.agentViewId && !args.maxTokens)
          ) {
            return invalidToolRequest(
              args.kind,
              cwd,
              'kind=pack requires `databaseId`, `sourceId`, `goal`, and either `agentViewId` or `maxTokens`.',
            );
          }
          const { page: _page, aggregate: _aggregate, ...packQuery } = args.query ?? {};
          result = await httpPost(
            url,
            '/api/databases/pack',
            {
              databaseId: args.databaseId,
              sourceId: args.sourceId,
              ...(args.agentViewId ? { agentViewId: args.agentViewId } : {}),
              goal: args.goal,
              ...(args.maxTokens === undefined ? {} : { maxTokens: args.maxTokens }),
              ...(args.reserveTokens === undefined ? {} : { reserveTokens: args.reserveTokens }),
              ...(args.agentViewId
                ? args.tokenizer === undefined
                  ? {}
                  : { tokenizer: args.tokenizer }
                : { tokenizer: args.tokenizer ?? 'utf8_bytes_div3' }),
              ...(args.agentViewId
                ? args.encoding === undefined
                  ? {}
                  : { encoding: args.encoding }
                : { encoding: args.encoding ?? 'object_rows' }),
              ...(args.propertyIds ? { propertyIds: args.propertyIds } : {}),
              ...(args.disclosure ? { disclosure: args.disclosure } : {}),
              ...(args.relationExpansion ? { relationExpansion: args.relationExpansion } : {}),
              ...(Object.keys(packQuery).length > 0 ? { query: packQuery } : {}),
              ...(args.cursor ? { cursor: args.cursor } : {}),
            },
            accessHeaders,
            extra?.signal,
          );
          break;
        }
        case 'template_runs': {
          if (!args.databaseId) {
            return invalidToolRequest(
              args.kind,
              cwd,
              'kind=template_runs requires `databaseId`. Run kind=catalog first if it is not known.',
            );
          }
          result = await httpPost(
            url,
            '/api/databases/template-runs',
            {
              databaseId: args.databaseId,
              ...(args.templateId ? { templateId: args.templateId } : {}),
              ...(args.limit ? { limit: args.limit } : {}),
            },
            accessHeaders,
          );
          break;
        }
        case 'automation_runs': {
          if (!args.databaseId) {
            return invalidToolRequest(
              args.kind,
              cwd,
              'kind=automation_runs requires `databaseId`. Run kind=catalog first if it is not known.',
            );
          }
          result = await httpPost(
            url,
            '/api/databases/automations',
            {
              action: 'list',
              databaseId: args.databaseId,
              ...(args.automationId ? { automationId: args.automationId } : {}),
              ...(args.limit ? { limit: args.limit } : {}),
            },
            accessHeaders,
          );
          break;
        }
        case 'automation_notifications': {
          result = await httpPost(
            url,
            '/api/databases/automations',
            {
              action: 'notifications',
              ...(args.recipientId ? { recipientId: args.recipientId } : {}),
              unreadOnly: args.unreadOnly ?? true,
              ...(args.limit ? { limit: args.limit } : {}),
            },
            accessHeaders,
          );
          break;
        }
      }

      if (!result.ok) {
        return databaseToolHttpError(result, { kind: args.kind, cwd });
      }

      const data = payload(result);
      if (args.kind === 'catalog') {
        if (data.notModified === true) {
          return textPlusStructured(
            `Database catalog is not modified at ${String(data.manifestRevision)}; reuse the cached candidates.`,
            { kind: args.kind, cwd, catalog: data },
          );
        }
        const candidates = Array.isArray(data.candidates) ? data.candidates.length : 0;
        return textPlusStructured(
          `Database catalog returned ${candidates} candidate${candidates === 1 ? '' : 's'}. Use a candidate databaseId with kind=describe before querying.`,
          { kind: args.kind, cwd, catalog: data },
        );
      }
      if (args.kind === 'template_runs') {
        const runs = Array.isArray(data.runs) ? data.runs.length : 0;
        return textPlusStructured(
          `Returned ${runs} durable repeating-template run${runs === 1 ? '' : 's'}.`,
          { kind: args.kind, cwd, templateRuns: data },
        );
      }
      if (args.kind === 'automation_runs') {
        const runs = Array.isArray(data.runs) ? data.runs.length : 0;
        return textPlusStructured(
          `Returned ${runs} durable automation run${runs === 1 ? '' : 's'}.`,
          { kind: args.kind, cwd, automationRuns: data },
        );
      }
      if (args.kind === 'automation_notifications') {
        const notifications = Array.isArray(data.notifications) ? data.notifications.length : 0;
        return textPlusStructured(
          `Returned ${notifications} automation notification${notifications === 1 ? '' : 's'}.`,
          { kind: args.kind, cwd, automationNotifications: data },
        );
      }
      if (args.kind === 'describe') {
        if (data.notModified === true) {
          return textPlusStructured(
            `Database schema is not modified at ${String(data.schemaRevision)}; reuse the cached description.`,
            { kind: args.kind, cwd, description: data },
          );
        }
        const database = data.database as { id?: unknown; name?: unknown } | undefined;
        const label =
          typeof database?.name === 'string'
            ? database.name
            : typeof database?.id === 'string'
              ? database.id
              : 'database';
        return textPlusStructured(
          `Described ${label}. Use the returned stable source/property/option IDs in kind=query.`,
          { kind: args.kind, cwd, description: data },
        );
      }

      if (args.kind === 'find') {
        const plan = data.plan as
          | { interpretation?: { requiresResolution?: unknown; warnings?: unknown[] } }
          | undefined;
        const requiresResolution = plan?.interpretation?.requiresResolution === true;
        const retrieval = data.retrieval as { returned?: unknown; matched?: unknown } | null;
        const resultData = data.result as { returned?: unknown; matched?: unknown } | null;
        const text = requiresResolution
          ? `Find request needs resolution and was not executed. Inspect the returned warnings and candidates.`
          : retrieval
            ? `Find compiled and retrieved ${count(retrieval.returned) ?? 0} of ${count(retrieval.matched) ?? 0} lexical matches with source evidence. Inspect plan.query and evidence offsets before reusing them.`
            : `Find compiled and executed: ${count(resultData?.returned) ?? 0} of ${count(resultData?.matched) ?? 0} matched records returned. Inspect plan.query before reusing it.`;
        return textPlusStructured(text, { kind: args.kind, cwd, find: data });
      }

      if (args.kind === 'retrieve') {
        const ranking = data.ranking as { returned?: unknown; matched?: unknown } | undefined;
        const degraded =
          typeof data.degradedReason === 'string'
            ? ` Semantic retrieval degraded explicitly: ${data.degradedReason}.`
            : '';
        return textPlusStructured(
          `Database retrieval applied ${String(data.appliedMode)} ranking and returned ${count(ranking?.returned) ?? 0} of ${count(ranking?.matched) ?? 0} fused candidates.${degraded}`,
          { kind: args.kind, cwd, retrieval: data },
        );
      }

      if (args.kind === 'pack') {
        const returned = count(data.returned) ?? 0;
        const complete = data.isComplete === true ? 'complete' : 'partial';
        return textPlusStructured(
          `Context pack contains ${returned} record${returned === 1 ? '' : 's'} (${complete}) within the requested budget.${typeof data.nextCursor === 'string' ? ' Continue with the returned cursor.' : ''}`,
          { kind: args.kind, cwd, pack: data },
        );
      }

      const returned = count(data.returned) ?? 0;
      const matched = count(data.matched) ?? returned;
      const complete = data.isComplete === true ? 'complete' : 'partial';
      const cursor = typeof data.nextCursor === 'string' ? ' A nextCursor is available.' : '';
      return textPlusStructured(
        `Database query returned ${returned} of ${matched} matched records (${complete}).${cursor}`,
        { kind: args.kind, cwd, queryResult: data },
      );
    },
  );
}
