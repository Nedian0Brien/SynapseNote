/** `data_place_search` MCP tool — explicit-consent external Place lookup. */

import { DatabasePlaceValueSchema } from '@nedian0brien/synapsenote-core';
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

const DESCRIPTION = [
  '[Requires: Hocuspocus server] Submit one address/place query to the operator-configured geocoder.',
  '',
  'This is an external egress operation: the exact query and optional locale/country filters leave the device. Set consent=true only after the user or governing policy explicitly authorizes that disclosure. SynapseNote never performs per-keystroke autocomplete and has no public provider enabled by default.',
  '',
  'Returned candidates already contain canonical label/address/lat/lon/precision/source/provider fields and can be passed unchanged to data_plan. When status=unavailable, use manual coordinates or an already stored Place; offline database reads remain available.',
].join('\n');

interface Dependencies {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
  identityRef?: { current: AgentIdentity };
}

interface Args {
  query: string;
  consent: boolean;
  locale?: string;
  countryCodes?: string[];
  limit?: number;
  cwd?: string;
}

const CandidateSchema = z
  .object({
    value: DatabasePlaceValueSchema,
    displayName: z.string().min(1),
  })
  .strict();

const PlaceSearchResponseSchema = z
  .object({
    status: z.enum(['ok', 'unavailable']),
    providerId: z.string().nullable(),
    candidates: z.array(CandidateSchema),
    attribution: z.string().nullable(),
    offlineFallback: z.literal(true),
  })
  .strict();

const OutputSchema = outputSchemaWithText({
  cwd: z.string(),
  status: z.enum(['ok', 'unavailable']).optional(),
  providerId: z.string().nullable().optional(),
  candidates: z.array(CandidateSchema).optional(),
  attribution: z.string().nullable().optional(),
  offlineFallback: z.literal(true).optional(),
  problem: DatabaseToolProblemOutputSchema.optional(),
});

export function register(server: ServerInstance, deps: Dependencies): void {
  server.registerTool(
    'data_place_search',
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z.string().trim().min(2).max(500).describe('Exact query sent to the provider.'),
        consent: z
          .boolean()
          .describe('Must be true only after explicit authorization for this external disclosure.'),
        locale: z.string().trim().min(2).max(35).optional(),
        countryCodes: z
          .array(z.string().regex(/^[A-Za-z]{2}$/))
          .max(10)
          .optional(),
        limit: z.number().int().min(1).max(10).optional(),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: OutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: Args) => {
      if (args.consent !== true) {
        return textResult(
          'Error: explicit consent is required before a Place query leaves the device.',
          true,
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
        '/api/databases/place/search',
        {
          query: args.query,
          consent: true,
          ...(args.locale ? { locale: args.locale } : {}),
          ...(args.countryCodes ? { countryCodes: args.countryCodes } : {}),
          ...(args.limit ? { limit: args.limit } : {}),
        },
        databaseAccessHeaders(deps.identityRef?.current),
      );
      if (!response.ok) return databaseToolHttpError(response, { cwd });
      const { ok: _ok, ...responseBody } = response;
      const parsed = PlaceSearchResponseSchema.safeParse(responseBody);
      if (!parsed.success) {
        return textResult('Error: Place provider returned an invalid response.', true);
      }
      const { status, candidates, providerId, attribution } = parsed.data;
      return textPlusStructured(
        status === 'ok'
          ? `Found ${candidates.length} canonical Place candidate${candidates.length === 1 ? '' : 's'}.`
          : 'No external Place provider is configured. Manual coordinates and stored Places remain available offline.',
        {
          cwd,
          status,
          providerId,
          candidates,
          attribution,
          offlineFallback: true,
        },
      );
    },
  );
}
