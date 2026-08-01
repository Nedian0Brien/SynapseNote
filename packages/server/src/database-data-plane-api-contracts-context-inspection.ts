import { ProjectedDatabaseRelationRecordSchema } from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import {
  AppliedDatabaseAgentViewSchema,
  DatabaseContextRetrievalSchema,
  DatabaseEvidenceSchema,
} from './database-data-plane-api-contracts-query-retrieval.ts';
import { DatabaseValueSchema } from './database-data-plane-api-contracts-read-responses.ts';

export const DatabaseContextPackResponseSchema = z
  .object({
    id: z.string().startsWith('pack_'),
    goal: z.string().min(1),
    database: z.record(z.string(), z.unknown()),
    agentView: AppliedDatabaseAgentViewSchema.nullable(),
    retrieval: DatabaseContextRetrievalSchema.optional(),
    schema: z.record(z.string(), z.unknown()),
    snapshot: z.record(z.string(), z.unknown()),
    fileStates: z.record(z.string(), z.enum(['available', 'missing'])),
    relationRecords: z.array(ProjectedDatabaseRelationRecordSchema),
    encoding: z.enum(['object_rows', 'columnar_dictionary']),
    records: z.union([
      z.array(z.record(z.string(), z.unknown())),
      z.record(z.string(), z.unknown()),
    ]),
    disclosure: z.discriminatedUnion('level', [
      z.object({ level: z.literal('records') }).strict(),
      z
        .object({
          level: z.literal('evidence'),
          searchText: z.string(),
          matched: z.number().int().nonnegative(),
          isComplete: z.boolean(),
          evidence: z.array(DatabaseEvidenceSchema),
        })
        .strict(),
      z
        .object({
          level: z.literal('full_body'),
          fullBodies: z.array(
            z
              .object({
                recordId: z.string().min(1),
                path: z.string().min(1),
                revision: z.string().nullable(),
                body: z.string(),
              })
              .strict(),
          ),
        })
        .strict(),
    ]),
    relationExpansion: z
      .object({
        requested: z
          .object({
            maxDepth: z.number().int().min(1).max(3),
            maxRecords: z.number().int().min(1).max(500),
            maxRecordsPerRelation: z.number().int().min(1).max(50),
            projections: z.array(
              z
                .object({
                  sourceId: z.string().min(1),
                  propertyIds: z.array(z.string().min(1)),
                })
                .strict(),
            ),
          })
          .strict(),
        schemas: z.array(
          z
            .object({
              sourceId: z.string().min(1),
              sourceKey: z.string().min(1),
              recordMeaning: z.string().min(1),
              properties: z.array(z.record(z.string(), z.unknown())),
            })
            .strict(),
        ),
        records: z.array(
          z
            .object({
              sourceId: z.string().min(1),
              id: z.string().min(1),
              path: z.string().min(1),
              revision: z.string().optional(),
              values: z.record(z.string(), DatabaseValueSchema),
            })
            .strict(),
        ),
        edges: z.array(
          z
            .object({
              fromSourceId: z.string().min(1),
              fromRecordId: z.string().min(1),
              propertyId: z.string().min(1),
              toSourceId: z.string().min(1),
              toRecordId: z.string().min(1),
              depth: z.number().int().min(1).max(3),
            })
            .strict(),
        ),
        complete: z.boolean(),
        omitted: z
          .object({
            depthLimit: z.number().int().nonnegative(),
            recordLimit: z.number().int().nonnegative(),
            fanOutLimit: z.number().int().nonnegative(),
            missingRecords: z.array(
              z.object({ sourceId: z.string(), recordId: z.string().min(1) }).strict(),
            ),
            permissionRecords: z.number().int().nonnegative(),
            permissionProperties: z.number().int().nonnegative(),
            sensitivityProperties: z.number().int().nonnegative(),
            sensitivityEdges: z.number().int().nonnegative(),
            cycles: z.number().int().nonnegative(),
            deduplicatedRecords: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    returned: z.number().int().nonnegative(),
    isComplete: z.boolean(),
    nextCursor: z.string().nullable(),
    omitted: z.record(z.string(), z.unknown()),
    budget: z.record(z.string(), z.unknown()),
  })
  .strict();
const DatabaseContextInspectionSummarySchema = z
  .object({
    packId: z.string().startsWith('pack_'),
    capturedAt: z.string().datetime(),
    goal: z.string().min(1),
    database: z.object({ id: z.string().min(1), name: z.string().min(1) }).strict(),
    sourceId: z.string().min(1),
    agentView: z
      .object({
        id: z.string().startsWith('view_'),
        revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict()
      .nullable(),
    disclosure: z.enum(['records', 'evidence', 'full_body']),
    returned: z.number().int().nonnegative(),
    tokenCount: z
      .object({
        tokenizer: z.enum(['utf8_bytes_div3', 'utf8_bytes_div2']),
        estimated: z.number().int().nonnegative(),
        available: z.number().int().nonnegative(),
        max: z.number().int().positive(),
        reserve: z.number().int().nonnegative(),
      })
      .strict(),
    retrieval: DatabaseContextRetrievalSchema.optional(),
    redactions: z
      .object({
        evaluated: z.boolean(),
        rootRecords: z.number().int().nonnegative(),
        rootProperties: z.number().int().nonnegative(),
        relationRecords: z.number().int().nonnegative(),
        relationProperties: z.number().int().nonnegative(),
        sensitivityProperties: z.number().int().nonnegative(),
        sensitivityBodies: z.number().int().nonnegative(),
        sensitivityRelationEdges: z.number().int().nonnegative(),
      })
      .strict(),
    freshness: z
      .object({
        manifestRevision: z.string().min(1),
        schemaRevision: z.string().min(1),
        indexRevision: z.string().min(1),
        indexState: z.enum(['idle', 'rebuilding', 'error']).nullable(),
        indexFreshness: z.literal('snapshot'),
        expectation: z
          .object({
            expectation: z.enum(['realtime', 'hourly', 'daily', 'weekly', 'manual']),
            maxAgeSeconds: z.number().int().positive().optional(),
          })
          .strict(),
      })
      .strict(),
    omissions: z
      .object({
        records: z.number().int().nonnegative(),
        propertyIds: z.array(z.string().min(1)),
        evidence: z.number().int().nonnegative(),
        fullBodies: z.number().int().nonnegative(),
        permissionBodies: z.number().int().nonnegative(),
        sensitivityProperties: z.number().int().nonnegative(),
        sensitivityBodies: z.number().int().nonnegative(),
        relation: z
          .object({
            depthLimit: z.number().int().nonnegative(),
            recordLimit: z.number().int().nonnegative(),
            fanOutLimit: z.number().int().nonnegative(),
            missingRecords: z.number().int().nonnegative(),
            permissionRecords: z.number().int().nonnegative(),
            permissionProperties: z.number().int().nonnegative(),
            sensitivityProperties: z.number().int().nonnegative(),
            sensitivityEdges: z.number().int().nonnegative(),
            cycles: z.number().int().nonnegative(),
            deduplicatedRecords: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    truncation: z
      .object({
        truncated: z.boolean(),
        cause: z.enum(['token_budget', 'query_page']).nullable(),
        continuationAvailable: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const DatabaseContextInspectionResponseSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('list'),
      inspections: z.array(DatabaseContextInspectionSummarySchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal('detail'),
      inspection: DatabaseContextInspectionSummarySchema.extend({
        exactPack: DatabaseContextPackResponseSchema,
      }).strict(),
    })
    .strict(),
]);
