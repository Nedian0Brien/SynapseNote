import type { z } from 'zod';
import {
  DatabaseAgentRunsRequestSchema,
  DatabaseAutonomyRequestSchema,
  DatabasePermissionsRequestSchema,
  DatabasePublicSharesRequestSchema,
  DatabaseRepairRequestSchema,
  DatabaseUndoRequestSchema,
} from './database-data-plane-api-contracts-access.ts';
import {
  DatabaseAutomationRequestSchema,
  DatabaseAutomationResponseSchema,
  DatabaseTemplateRunsRequestSchema,
  DatabaseTemplateRunsResponseSchema,
} from './database-data-plane-api-contracts-automation.ts';
import {
  DatabaseContextInspectionResponseSchema,
  DatabaseContextPackResponseSchema,
} from './database-data-plane-api-contracts-context-inspection.ts';
import {
  DatabaseButtonRequestSchema,
  DatabaseCommitRequestSchema,
  DatabaseMarkdownTableMutationRequestSchema,
  DatabaseMarkdownTableMutationResponseSchema,
  DatabasePlaceSearchRequestSchema,
  DatabasePlaceSearchResponseSchema,
  DatabasePlanRequestSchema,
  DatabasePropertyConversionRequestSchema,
  DatabasePropertyConversionResponseSchema,
} from './database-data-plane-api-contracts-mutation.ts';
import {
  DatabaseAgentRunsResponseSchema,
  DatabaseAutonomyResponseSchema,
  DatabaseButtonResponseSchema,
  DatabaseCommitResponseSchema,
  DatabasePermissionsResponseSchema,
  DatabasePlanResponseSchema,
  DatabasePublicSharesResponseSchema,
  DatabaseRepairResponseSchema,
  DatabaseUndoResponseSchema,
} from './database-data-plane-api-contracts-operation-responses.ts';
import {
  DatabaseFindResponseSchema,
  DatabaseFormSubmitResponseSchema,
  DatabaseQueryResponseSchema,
  DatabaseRetrieveResponseSchema,
} from './database-data-plane-api-contracts-query-retrieval.ts';
import {
  DatabaseCatalogRequestSchema,
  DatabaseComputedPropertyPreviewRequestSchema,
  DatabaseContextInspectionRequestSchema,
  DatabaseContextPackRequestSchema,
  DatabaseDescribeRequestSchema,
  DatabaseFindRequestSchema,
  DatabaseFormSubmitRequestSchema,
  DatabaseQueryRequestSchema,
  DatabaseRecordRequestSchema,
  DatabaseRetrieveRequestSchema,
} from './database-data-plane-api-contracts-read-requests.ts';
import {
  DatabaseCatalogResponseSchema,
  DatabaseComputedPropertyPreviewResponseSchema,
  DatabaseDescribeResponseSchema,
  DatabaseRecordResponseSchema,
} from './database-data-plane-api-contracts-read-responses.ts';
import {
  DatabaseTaskRequestSchema,
  DatabaseTaskResponseSchema,
} from './database-data-plane-api-contracts-task-migration.ts';
import { DATABASE_API_SCHEMA_VERSION } from './database-data-plane-api-response.ts';

/** Runtime registry used by transports, contract tests, and future SDK generation. */
export const DATABASE_API_SCHEMAS: Readonly<{
  version: typeof DATABASE_API_SCHEMA_VERSION;
  operations: Readonly<Record<string, Readonly<{ request: z.ZodType; response: z.ZodType }>>>;
}> = Object.freeze({
  version: DATABASE_API_SCHEMA_VERSION,
  operations: Object.freeze({
    catalog: Object.freeze({
      request: DatabaseCatalogRequestSchema,
      response: DatabaseCatalogResponseSchema,
    }),
    describe: Object.freeze({
      request: DatabaseDescribeRequestSchema,
      response: DatabaseDescribeResponseSchema,
    }),
    record: Object.freeze({
      request: DatabaseRecordRequestSchema,
      response: DatabaseRecordResponseSchema,
    }),
    computedPropertyPreview: Object.freeze({
      request: DatabaseComputedPropertyPreviewRequestSchema,
      response: DatabaseComputedPropertyPreviewResponseSchema,
    }),
    propertyConversion: Object.freeze({
      request: DatabasePropertyConversionRequestSchema,
      response: DatabasePropertyConversionResponseSchema,
    }),
    find: Object.freeze({
      request: DatabaseFindRequestSchema,
      response: DatabaseFindResponseSchema,
    }),
    retrieve: Object.freeze({
      request: DatabaseRetrieveRequestSchema,
      response: DatabaseRetrieveResponseSchema,
    }),
    query: Object.freeze({
      request: DatabaseQueryRequestSchema,
      response: DatabaseQueryResponseSchema,
    }),
    formSubmit: Object.freeze({
      request: DatabaseFormSubmitRequestSchema,
      response: DatabaseFormSubmitResponseSchema,
    }),
    contextPack: Object.freeze({
      request: DatabaseContextPackRequestSchema,
      response: DatabaseContextPackResponseSchema,
    }),
    contextInspection: Object.freeze({
      request: DatabaseContextInspectionRequestSchema,
      response: DatabaseContextInspectionResponseSchema,
    }),
    plan: Object.freeze({
      request: DatabasePlanRequestSchema,
      response: DatabasePlanResponseSchema,
    }),
    button: Object.freeze({
      request: DatabaseButtonRequestSchema,
      response: DatabaseButtonResponseSchema,
    }),
    placeSearch: Object.freeze({
      request: DatabasePlaceSearchRequestSchema,
      response: DatabasePlaceSearchResponseSchema,
    }),
    commit: Object.freeze({
      request: DatabaseCommitRequestSchema,
      response: DatabaseCommitResponseSchema,
    }),
    markdownTableMutation: Object.freeze({
      request: DatabaseMarkdownTableMutationRequestSchema,
      response: DatabaseMarkdownTableMutationResponseSchema,
    }),
    agentRuns: Object.freeze({
      request: DatabaseAgentRunsRequestSchema,
      response: DatabaseAgentRunsResponseSchema,
    }),
    templateRuns: Object.freeze({
      request: DatabaseTemplateRunsRequestSchema,
      response: DatabaseTemplateRunsResponseSchema,
    }),
    automations: Object.freeze({
      request: DatabaseAutomationRequestSchema,
      response: DatabaseAutomationResponseSchema,
    }),
    autonomy: Object.freeze({
      request: DatabaseAutonomyRequestSchema,
      response: DatabaseAutonomyResponseSchema,
    }),
    permissions: Object.freeze({
      request: DatabasePermissionsRequestSchema,
      response: DatabasePermissionsResponseSchema,
    }),
    publicShares: Object.freeze({
      request: DatabasePublicSharesRequestSchema,
      response: DatabasePublicSharesResponseSchema,
    }),
    undo: Object.freeze({
      request: DatabaseUndoRequestSchema,
      response: DatabaseUndoResponseSchema,
    }),
    repair: Object.freeze({
      request: DatabaseRepairRequestSchema,
      response: DatabaseRepairResponseSchema,
    }),
    task: Object.freeze({
      request: DatabaseTaskRequestSchema,
      response: DatabaseTaskResponseSchema,
    }),
  }),
});
