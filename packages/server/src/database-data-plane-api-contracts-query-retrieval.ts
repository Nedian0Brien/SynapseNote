import {
  DatabaseGroupMembershipsSchema,
  DatabaseQuerySchema,
  DatabaseVerificationProjectionSchema,
  ProjectedDatabasePersonSchema,
  ProjectedDatabaseRecordSchema,
  ProjectedDatabaseRelationRecordSchema,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import { DatabaseValueSchema } from './database-data-plane-api-contracts-read-responses.ts';

const DatabaseCalculationResultSchema = z
  .object({
    id: z.string().min(1),
    function: DatabaseQuerySchema.shape.aggregate.unwrap().shape.calculations.unwrap().element.shape
      .function,
    propertyId: z.string().nullable(),
    value: z.union([z.number(), z.string()]).nullable(),
    unit: z.enum(['count', 'number', 'percentage', 'date', 'milliseconds']),
  })
  .strict();
const DatabaseAggregationResultSchema = z
  .object({
    matched: z.number().int().nonnegative(),
    groupBy: DatabaseQuerySchema.shape.aggregate.unwrap().shape.groupBy,
    calculations: z.array(DatabaseCalculationResultSchema),
    totalGroups: z.number().int().nonnegative(),
    returnedGroups: z.number().int().nonnegative(),
    groupsComplete: z.boolean(),
    truncatedBy: z.literal('group_limit').nullable(),
    groups: z.array(
      z
        .object({
          level: z.union([z.literal(1), z.literal(2)]),
          key: z.array(
            z
              .object({
                propertyId: z.string().min(1),
                value: DatabaseValueSchema.nullable(),
              })
              .strict(),
          ),
          matched: z.number().int().nonnegative(),
          calculations: z.array(DatabaseCalculationResultSchema),
        })
        .strict(),
    ),
  })
  .strict();
const DatabaseEvidenceSchema = z
  .object({
    id: z.string().startsWith('ev_'),
    recordId: z.string().min(1),
    path: z.string().min(1),
    field: z.enum(['property', 'body']),
    propertyId: z.string().min(1).optional(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    offsetEncoding: z.literal('utf16_code_units'),
    snippet: z.string(),
    snippetStart: z.number().int().nonnegative(),
    snippetEnd: z.number().int().nonnegative(),
    matchedTerms: z.array(z.string()),
  })
  .strict();
const DatabaseLexicalTraceSchema = z
  .object({
    strategy: z.literal('lexical_and'),
    scope: z
      .object({
        databaseId: z.string().min(1),
        sourceId: z.string().min(1),
        propertyIds: z.array(z.string()),
        includeBody: z.boolean(),
        includeArchived: z.boolean(),
      })
      .strict(),
    termStats: z.array(
      z
        .object({
          term: z.string(),
          indexedRecords: z.number().int().nonnegative(),
          scopedRecords: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    ranking: z
      .object({
        titleWeight: z.literal(40),
        propertyWeight: z.literal(20),
        bodyWeight: z.literal(10),
        verificationWeight: z.literal(1).optional(),
        tieBreakers: z.tuple([z.literal('path'), z.literal('record_id')]),
      })
      .strict(),
    noMatchReason: z
      .enum(['no_terms', 'term_absent_in_scope', 'no_record_matches_all_terms'])
      .nullable(),
  })
  .strict();
const AppliedDatabaseSavedQuerySchema = z
  .object({
    id: z.string().startsWith('view_'),
    key: z.string().min(1),
    name: z.string().min(1),
    sourceId: z.string().startsWith('ds_'),
    layout: z.enum([
      'table',
      'board',
      'timeline',
      'calendar',
      'list',
      'gallery',
      'chart',
      'map',
      'feed',
      'form',
      'dashboard',
      'agent',
    ]),
    revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
const AppliedDatabaseAgentViewSchema = z
  .object({
    id: z.string().startsWith('view_'),
    key: z.string().min(1),
    name: z.string().min(1),
    revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    semanticContract: z
      .object({
        purpose: z.string().min(1),
        instructions: z.string().min(1).optional(),
        evidence: z.enum(['required', 'preferred', 'none']),
        freshness: z.enum(['require_current', 'allow_stale_with_warning']),
      })
      .strict(),
    scope: z
      .object({
        maxRecords: z.number().int().min(1).max(500),
        relationDepth: z.number().int().min(0).max(3),
        relationMaxRecords: z.number().int().min(1).max(500),
        relationFanOut: z.number().int().min(1).max(50),
      })
      .strict(),
    readPolicy: z
      .object({
        maxSensitivity: z.enum(['public', 'internal', 'confidential', 'restricted']),
      })
      .strict(),
    writePolicy: z
      .object({
        mode: z.enum(['read_only', 'review', 'bounded']),
        allowedActions: z.array(
          z.enum(['create_record', 'update_record', 'delete_record', 'alter_schema']),
        ),
        allowedPropertyIds: z.array(z.string().min(1)),
        maxRecordsPerCommit: z.number().int().min(0).max(500),
      })
      .strict(),
  })
  .strict();
export const DatabaseQueryResponseSchema = z
  .object({
    databaseId: z.string().min(1),
    queryId: z.string().startsWith('qry_'),
    sourceId: z.string().min(1),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().min(1),
    indexState: z.enum(['idle', 'rebuilding', 'error']),
    snapshotRevision: z.string().min(1),
    storageRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    derivedRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    matched: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    isComplete: z.boolean(),
    nextCursor: z.string().nullable(),
    truncatedBy: z.literal('page_limit').nullable(),
    indexFreshness: z.literal('snapshot'),
    aggregation: DatabaseAggregationResultSchema.nullable(),
    groupMemberships: DatabaseGroupMembershipsSchema.optional(),
    people: z.array(ProjectedDatabasePersonSchema).optional(),
    fileStates: z.record(z.string(), z.enum(['available', 'missing'])).optional(),
    relationRecords: z.array(ProjectedDatabaseRelationRecordSchema).optional(),
    permissionExclusions: z
      .object({
        evaluated: z.literal(true),
        policyId: z.string().min(1),
        policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        records: z.number().int().nonnegative(),
        properties: z.number().int().nonnegative(),
        body: z.boolean().optional(),
      })
      .strict(),
    savedQuery: AppliedDatabaseSavedQuerySchema.nullable(),
    agentView: AppliedDatabaseAgentViewSchema.nullable(),
    resultState: z
      .object({
        empty: z.boolean(),
        emptyReason: z
          .enum([
            'no_match',
            'permission_filtered',
            'partial_index',
            'permission_filtered_and_partial_index',
          ])
          .nullable(),
        permissionFiltered: z.boolean(),
        partialIndex: z.boolean(),
        truncated: z.boolean(),
      })
      .strict(),
    trace: z
      .object({
        source: z
          .object({
            databaseId: z.string().min(1),
            sourceId: z.string().min(1),
          })
          .strict(),
        savedQuery: AppliedDatabaseSavedQuerySchema.nullable(),
        agentView: AppliedDatabaseAgentViewSchema.nullable(),
        filter: z
          .object({
            expression: DatabaseQuerySchema.shape.where.unwrap().nullable(),
            propertyIds: z.array(z.string().min(1)),
          })
          .strict(),
        ranking: z
          .object({
            strategy: z.literal('typed_sort_then_record_id'),
            sort: DatabaseQuerySchema.shape.sort,
            semantics: z
              .object({
                version: z.literal(1),
                locale: z.literal('und'),
                normalization: z.literal('NFKD'),
                collation: z.literal('unicode_code_point'),
                case: z.literal('insensitive_primary_uppercase_first_tertiary'),
                diacritic: z.literal('insensitive_primary_sensitive_secondary'),
                naturalNumbers: z.literal('ascii_decimal_runs'),
                emptyValues: z.literal('last_regardless_of_direction'),
                arrays: z.literal('sorted_elements_then_lexicographic'),
                tieBreaker: z.literal('record_id'),
              })
              .strict(),
            tieBreakers: z.tuple([z.literal('record_id')]),
          })
          .strict(),
        projection: z
          .object({
            requestedPropertyIds: z.array(z.string().min(1)),
            returnedPropertyIds: z.array(z.string().min(1)),
            excludedPropertyIds: z.array(z.string().min(1)),
          })
          .strict(),
        aggregation: z
          .object({
            requested: DatabaseQuerySchema.shape.aggregate.unwrap().nullable(),
            appliedAfterPermissionScope: z.literal(true),
            matched: z.number().int().nonnegative(),
            totalGroups: z.number().int().nonnegative(),
            returnedGroups: z.number().int().nonnegative(),
            truncatedBy: z.literal('group_limit').nullable(),
          })
          .strict(),
        permission: z
          .object({
            evaluated: z.literal(true),
            policyId: z.string().min(1),
            policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            records: z.number().int().nonnegative(),
            properties: z.number().int().nonnegative(),
            body: z.boolean().optional(),
          })
          .strict(),
        index: z
          .object({
            revision: z.string().min(1),
            state: z.enum(['idle', 'rebuilding', 'error']),
            freshness: z.literal('snapshot'),
            issueCount: z.number().int().nonnegative(),
          })
          .strict(),
        derivedIndex: z
          .object({
            propertyIds: z.array(z.string().min(1)),
            cache: z.enum(['hit', 'miss', 'not_applicable']),
            permissionRevision: z
              .string()
              .regex(/^sha256:[a-f0-9]{64}$/)
              .nullable(),
            revision: z
              .string()
              .regex(/^sha256:[a-f0-9]{64}$/)
              .nullable(),
          })
          .strict(),
        truncation: z
          .object({
            cause: z.literal('page_limit').nullable(),
            limit: z.number().int().min(1).max(500),
            cursorProvided: z.boolean(),
            nextCursor: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    recordRevisions: z.record(z.string(), z.string().nullable()),
    delta: z
      .object({
        sinceQueryId: z.string().startsWith('qry_'),
        scope: z.literal('returned_page'),
        addedOrChangedRecordIds: z.array(z.string()),
        unchangedRecordIds: z.array(z.string()),
        removedRecordIds: z.array(z.string()),
        absentFromPageRecordIds: z.array(z.string()),
        isComplete: z.boolean(),
      })
      .strict()
      .nullable(),
    records: z.array(ProjectedDatabaseRecordSchema),
  })
  .strict();
export const DatabaseFormSubmitResponseSchema = z
  .object({
    status: z.literal('created'),
    recordId: z.string().startsWith('rec_'),
    submittedAt: z.string().datetime({ offset: true }),
    idempotentReplay: z.boolean(),
    confirmation: z
      .object({
        title: z.string().min(1).max(200),
        message: z.string().max(2_000),
        allowAnotherResponse: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const DatabaseFindResponseSchema = z
  .object({
    databaseId: z.string().min(1),
    sourceId: z.string().min(1),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().min(1),
    plan: z.record(z.string(), z.unknown()),
    retrieval: z
      .object({
        query: z.string(),
        terms: z.array(z.string()),
        offsetEncoding: z.literal('utf16_code_units'),
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        isComplete: z.boolean(),
        hits: z.array(
          z
            .object({
              recordId: z.string().min(1),
              path: z.string().min(1),
              revision: z.string().nullable(),
              score: z.number().nonnegative(),
              scoreBreakdown: z
                .object({
                  title: z.number().nonnegative(),
                  property: z.number().nonnegative(),
                  body: z.number().nonnegative(),
                  verification: z.number().nonnegative().optional(),
                })
                .strict(),
              verification: z
                .array(
                  DatabaseVerificationProjectionSchema.extend({
                    propertyId: z.string().startsWith('prop_'),
                  }),
                )
                .optional(),
              matchedBy: z.array(z.enum(['title', 'property', 'body'])),
              evidence: z.array(DatabaseEvidenceSchema),
            })
            .strict(),
        ),
        trace: DatabaseLexicalTraceSchema,
        permissionExclusions: z
          .object({
            evaluated: z.literal(true),
            policyId: z.string().min(1),
            policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            records: z.number().int().nonnegative(),
            properties: z.number().int().nonnegative(),
          })
          .strict(),
        resultState: z
          .object({
            empty: z.boolean(),
            emptyReason: z.enum(['no_match', 'permission_filtered']).nullable(),
            permissionFiltered: z.boolean(),
            truncated: z.boolean(),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    result: DatabaseQueryResponseSchema.nullable(),
  })
  .strict();

const DatabaseSemanticIndexStatusSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    schemaRevision: z.string().min(1),
    indexRevision: z.string().min(1),
    state: z.enum(['disabled', 'building', 'ready', 'stale', 'error']),
    providerId: z.string().nullable(),
    model: z.string().nullable(),
    dimensions: z.number().int().positive().nullable(),
    privacy: z.enum(['local_only', 'remote_allowed', 'blocked']),
    propertyIds: z.array(z.string().startsWith('prop_')),
    includeBody: z.boolean(),
    indexedRecords: z.number().int().nonnegative(),
    staleRecords: z.number().int().nonnegative(),
    createdAt: z.string().datetime({ offset: true }).nullable(),
    reason: z
      .enum([
        'not_configured',
        'privacy_blocked',
        'provider_mismatch',
        'snapshot_changed',
        'build_failed',
      ])
      .nullable(),
  })
  .strict();

export const DatabaseRetrieveResponseSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().min(1),
    query: z.string(),
    requestedMode: z.enum(['lexical', 'semantic', 'hybrid']),
    appliedMode: z.enum(['lexical', 'semantic', 'hybrid']),
    degradedReason: z.enum(['semantic_not_ready', 'semantic_projection_denied']).nullable(),
    candidateLimit: z.number().int().min(1).max(500),
    lexical: DatabaseFindResponseSchema.shape.retrieval,
    semantic: z
      .object({
        query: z.string(),
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        isComplete: z.boolean(),
        hits: z.array(
          z
            .object({
              recordId: z.string().startsWith('rec_'),
              path: z.string().min(1),
              revision: z.string().nullable(),
              score: z.number().finite().min(-1).max(1),
              inputHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            })
            .strict(),
        ),
        trace: z
          .object({
            strategy: z.literal('semantic_cosine'),
            providerId: z.string().min(1),
            model: z.string().min(1),
            dimensions: z.number().int().positive(),
            privacy: z.enum(['local_only', 'remote_allowed', 'blocked']),
            propertyIds: z.array(z.string().startsWith('prop_')),
            includeBody: z.boolean(),
            schemaRevision: z.string().min(1),
            indexRevision: z.string().min(1),
            tieBreakers: z.tuple([z.literal('path'), z.literal('record_id')]),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    ranking: z
      .object({
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        isComplete: z.boolean(),
        hits: z.array(
          z
            .object({
              recordId: z.string().startsWith('rec_'),
              path: z.string().min(1),
              revision: z.string().nullable(),
              score: z.number().finite().nonnegative(),
              ranking: z
                .object({
                  lexicalRank: z.number().int().positive().nullable(),
                  semanticRank: z.number().int().positive().nullable(),
                  lexicalContribution: z.number().finite().nonnegative(),
                  semanticContribution: z.number().finite().nonnegative(),
                })
                .strict(),
            })
            .strict(),
        ),
        trace: z
          .object({
            strategy: z.literal('reciprocal_rank_fusion'),
            constant: z.literal(60),
            lexicalWeight: z.number().finite().nonnegative(),
            semanticWeight: z.number().finite().nonnegative(),
            tieBreakers: z.tuple([z.literal('path'), z.literal('record_id')]),
          })
          .strict(),
      })
      .strict(),
    semanticIndex: DatabaseSemanticIndexStatusSchema,
    permissionExclusions: z
      .object({
        evaluated: z.literal(true),
        policyId: z.string().min(1),
        policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        records: z.number().int().nonnegative(),
        properties: z.number().int().nonnegative(),
        body: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

const DatabaseContextRetrievalSchema = z
  .object({
    query: z
      .object({
        filter: z.unknown().nullable(),
        sort: z.array(z.record(z.string(), z.unknown())),
        includeArchived: z.boolean(),
      })
      .strict(),
    filters: z.object({ propertyIds: z.array(z.string().min(1)) }).strict(),
    ranking: z
      .object({
        strategy: z.literal('typed_sort_then_record_id'),
        sort: z.array(z.record(z.string(), z.unknown())),
        tieBreakers: z.tuple([z.literal('record_id')]),
      })
      .strict(),
    projection: z
      .object({
        requestedPropertyIds: z.array(z.string().min(1)),
        returnedPropertyIds: z.array(z.string().min(1)),
        omittedPropertyIds: z.array(z.string().min(1)),
      })
      .strict(),
    result: z
      .object({
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        omittedRecords: z.number().int().nonnegative(),
        complete: z.boolean(),
        continuationAvailable: z.boolean(),
      })
      .strict(),
    permission: z
      .object({
        evaluated: z.literal(true),
        policyId: z.string().min(1),
        policyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        records: z.number().int().nonnegative(),
        properties: z.number().int().nonnegative(),
        body: z.boolean().optional(),
      })
      .strict()
      .nullable(),
    evidence: z
      .object({
        mode: z.enum(['records', 'evidence', 'full_body']),
        searchText: z.string().nullable(),
        matched: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export { AppliedDatabaseAgentViewSchema, DatabaseContextRetrievalSchema, DatabaseEvidenceSchema };
