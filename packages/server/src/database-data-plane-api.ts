import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type DatabaseAccessPrincipal,
  DatabaseQueryError,
  resolveDatabaseAutonomyMode,
} from '@nedian0brien/synapsenote-core';
import type { z } from 'zod';
import {
  DatabaseAgentPromptRetentionError,
  type DatabaseAgentPromptRetentionStore,
} from './database-agent-prompt-retention.ts';
import type { DatabaseAgentRunStore } from './database-agent-run-store.ts';
import type { DatabaseAutomationService } from './database-automation.ts';
import type { DatabaseAutomationNotificationStore } from './database-automation-notification-store.ts';
import type { DatabaseAutonomyStore } from './database-autonomy-store.ts';
import { DatabaseCommitError } from './database-commit.ts';
import {
  type DatabaseDataPlane,
  DatabaseDataPlaneError,
  type DatabaseMarkdownTableMutationRequest,
} from './database-data-plane.ts';
import {
  cancelledConnection,
  noStoreHeaders,
  parseRevisionTag,
  publicShareView,
  requestCancellationCheckpoint,
  respondAgentPromptRetentionError,
  respondAgentRunStoreError,
  respondAutonomyStoreError,
  respondDataPlaneError,
  respondPermissionStoreError,
  respondTaskStoreError,
  respondUnavailable,
  revisionHeaders,
} from './database-data-plane-api-response.ts';
import { DatabaseAgentEntryPointLimiter } from './database-entry-point-limits.ts';
import type { DatabasePermissionStore } from './database-permission-store.ts';
import {
  DatabasePlaceSearchError,
  type DatabasePlaceSearchService,
} from './database-place-search.ts';
import { type DatabasePlanArtifact, DatabasePlanError } from './database-plan.ts';
import {
  DATABASE_REQUEST_ERROR_EXTENSIONS,
  databaseProblemExtensions,
} from './database-problem.ts';
import { type DatabaseTaskService, DatabaseTaskServiceError } from './database-task-service.ts';
import type { DatabaseTaskStore } from './database-task-store.ts';
import { getDatabaseTelemetry } from './database-telemetry.ts';
import type { DatabaseTemplateScheduler } from './database-template-scheduler.ts';
import { errorResponse } from './http/error-response.ts';
import { withValidation } from './http/request-validation.ts';
import { successResponse } from './http/success-response.ts';

export {
  DATABASE_API_SCHEMA_VERSION,
  DATABASE_API_SCHEMA_VERSION_HEADER,
} from './database-data-plane-api-response.ts';

import {
  DatabaseAutomationRequestSchema,
  DatabaseAutomationResponseSchema,
  DatabaseTemplateRunsRequestSchema,
  DatabaseTemplateRunsResponseSchema,
} from './database-data-plane-api-contracts-automation.ts';

export type {
  DatabaseAutomationRequest,
  DatabaseAutomationResponse,
  DatabaseTemplateRunsRequest,
  DatabaseTemplateRunsResponse,
} from './database-data-plane-api-contracts-automation.ts';
export {
  DatabaseAutomationRequestSchema,
  DatabaseAutomationResponseSchema,
  DatabaseTemplateRunsRequestSchema,
  DatabaseTemplateRunsResponseSchema,
} from './database-data-plane-api-contracts-automation.ts';

import {
  DATABASE_INTERNAL_ERROR_EXTENSIONS,
  DatabaseCatalogRequestSchema,
  DatabaseComputedPropertyPreviewRequestSchema,
  DatabaseContextInspectionRequestSchema,
  DatabaseContextPackRequestSchema,
  DatabaseDescribeRequestSchema,
  DatabaseEmptyRequestSchema,
  DatabaseFindRequestSchema,
  DatabaseFormSubmitRequestSchema,
  DatabaseMarkdownTableExportRequestSchema,
  DatabaseQueryRequestSchema,
  DatabaseRecordRequestSchema,
  DatabaseRetrieveRequestSchema,
} from './database-data-plane-api-contracts-read-requests.ts';

export type {
  DatabaseCatalogRequest,
  DatabaseComputedPropertyPreviewRequest,
  DatabaseContextInspectionRequest,
  DatabaseContextPackRequest,
  DatabaseDescribeRequest,
  DatabaseFindRequest,
  DatabaseFormSubmitRequest,
  DatabaseMarkdownTableExportRequest,
  DatabaseQueryRequest,
  DatabaseRecordRequest,
  DatabaseRetrieveRequest,
} from './database-data-plane-api-contracts-read-requests.ts';

export {
  DatabaseCatalogRequestSchema,
  DatabaseComputedPropertyPreviewRequestSchema,
  DatabaseContextInspectionRequestSchema,
  DatabaseContextPackRequestSchema,
  DatabaseDescribeRequestSchema,
  DatabaseFindRequestSchema,
  DatabaseFormSubmitRequestSchema,
  DatabaseMarkdownTableExportRequestSchema,
  DatabaseQueryRequestSchema,
  DatabaseRecordRequestSchema,
  DatabaseRetrieveRequestSchema,
} from './database-data-plane-api-contracts-read-requests.ts';

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

export type {
  DatabaseButtonRequest,
  DatabaseCommitRequest,
  DatabaseMarkdownTableMutationRequest,
  DatabaseMarkdownTableMutationResponse,
  DatabasePlaceSearchRequest,
  DatabasePlaceSearchResponse,
  DatabasePlanRequest,
  DatabasePropertyConversionRequest,
  DatabasePropertyConversionResponse,
} from './database-data-plane-api-contracts-mutation.ts';
export {
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
  DatabaseAgentRunsRequestSchema,
  DatabaseAutonomyRequestSchema,
  DatabasePermissionsRequestSchema,
  DatabasePublicSharesRequestSchema,
  DatabaseRepairRequestSchema,
  DatabaseUndoRequestSchema,
} from './database-data-plane-api-contracts-access.ts';

export type {
  DatabaseAgentRunsRequest,
  DatabaseAutonomyRequest,
  DatabasePermissionsRequest,
  DatabasePublicSharesRequest,
  DatabaseRepairRequest,
  DatabaseUndoRequest,
} from './database-data-plane-api-contracts-access.ts';
export {
  DatabaseAgentRunsRequestSchema,
  DatabaseAutonomyRequestSchema,
  DatabasePermissionsRequestSchema,
  DatabasePublicSharesRequestSchema,
  DatabaseRepairRequestSchema,
  DatabaseUndoRequestSchema,
} from './database-data-plane-api-contracts-access.ts';

import {
  DatabaseCatalogResponseSchema,
  DatabaseComputedPropertyPreviewResponseSchema,
  DatabaseDescribeResponseSchema,
  DatabaseMarkdownTableExportResponseSchema,
  DatabaseRecordResponseSchema,
} from './database-data-plane-api-contracts-read-responses.ts';

export type {
  DatabaseCatalogResponse,
  DatabaseComputedPropertyPreviewResponse,
  DatabaseDescribeResponse,
  DatabaseMarkdownTableExportResponse,
  DatabaseRecordResponse,
} from './database-data-plane-api-contracts-read-responses.ts';
export {
  DatabaseCatalogResponseSchema,
  DatabaseComputedPropertyPreviewResponseSchema,
  DatabaseDescribeResponseSchema,
  DatabaseMarkdownTableExportResponseSchema,
  DatabaseRecordResponseSchema,
} from './database-data-plane-api-contracts-read-responses.ts';

import {
  DatabaseFindResponseSchema,
  DatabaseFormSubmitResponseSchema,
  DatabaseQueryResponseSchema,
  DatabaseRetrieveResponseSchema,
} from './database-data-plane-api-contracts-query-retrieval.ts';

export {
  DatabaseFindResponseSchema,
  DatabaseFormSubmitResponseSchema,
  DatabaseQueryResponseSchema,
  DatabaseRetrieveResponseSchema,
} from './database-data-plane-api-contracts-query-retrieval.ts';

import {
  DatabaseContextInspectionResponseSchema,
  DatabaseContextPackResponseSchema,
} from './database-data-plane-api-contracts-context-inspection.ts';

export {
  DatabaseContextInspectionResponseSchema,
  DatabaseContextPackResponseSchema,
} from './database-data-plane-api-contracts-context-inspection.ts';

import {
  DatabaseTaskRequestSchema,
  DatabaseTaskResponseSchema,
} from './database-data-plane-api-contracts-task-migration.ts';

export {
  DatabaseManifestMigrationPreviewSchema,
  DatabaseMigrationCleanupPlanSchema,
  DatabaseOnboardingPreviewSchema,
  DatabaseTaskRequestSchema,
  DatabaseTaskResponseSchema,
} from './database-data-plane-api-contracts-task-migration.ts';

import {
  DatabaseAgentRunsResponseSchema,
  DatabaseAutonomyResponseSchema,
  DatabaseButtonResponseSchema,
  DatabaseCommitResponseSchema,
  DatabaseDiagnosticsResponseSchema,
  DatabasePermissionsResponseSchema,
  DatabasePlanResponseSchema,
  DatabasePublicSharesResponseSchema,
  DatabaseRepairResponseSchema,
  DatabaseUndoResponseSchema,
} from './database-data-plane-api-contracts-operation-responses.ts';

export type { DatabaseDiagnosticsResult } from './database-data-plane-api-contracts-operation-responses.ts';
export {
  DatabaseAgentRunsResponseSchema,
  DatabaseAutonomyResponseSchema,
  DatabaseButtonResponseSchema,
  DatabaseCommitResponseSchema,
  DatabaseDiagnosticsResponseSchema,
  DatabasePermissionsResponseSchema,
  DatabasePlanResponseSchema,
  DatabasePublicSharesResponseSchema,
  DatabaseRepairResponseSchema,
  DatabaseUndoResponseSchema,
} from './database-data-plane-api-contracts-operation-responses.ts';

export { DATABASE_API_SCHEMAS } from './database-data-plane-api-schemas.ts';

export type { DatabaseTask } from './database-task-contract.ts';
export { DatabaseTaskSchema } from './database-task-contract.ts';
export type DatabaseTaskRequest = z.infer<typeof DatabaseTaskRequestSchema>;
export type DatabaseTaskResponse = z.infer<typeof DatabaseTaskResponseSchema>;

export interface DatabaseDataPlaneApiHandlers {
  catalog: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  describe: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  record: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  markdownTableExport: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  computedPropertyPreview: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  propertyConversion: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  find: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  retrieve: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  query: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  formSubmit: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  pack: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  inspect: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  plan: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  button: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  placeSearch: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  commit: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  markdownTableMutation: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  runs: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  templateRuns: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  automations: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  autonomy: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  permissions: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  publicShares: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  undo: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  repair: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  task: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  diagnostics: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
}

export function createDatabaseDataPlaneApiHandlers(
  dataPlane?: DatabaseDataPlane,
  taskStore?: DatabaseTaskStore,
  taskService?: DatabaseTaskService,
  autonomyStore?: DatabaseAutonomyStore,
  agentRunStore?: DatabaseAgentRunStore,
  placeSearchService?: DatabasePlaceSearchService,
  templateScheduler?: DatabaseTemplateScheduler,
  automationService?: DatabaseAutomationService,
  automationNotificationStore?: DatabaseAutomationNotificationStore,
  resolveAccessPrincipal?: (request: IncomingMessage) => DatabaseAccessPrincipal,
  permissionStore?: DatabasePermissionStore,
  promptRetentionStore?: DatabaseAgentPromptRetentionStore,
): DatabaseDataPlaneApiHandlers {
  const agentEntryPointLimiter = new DatabaseAgentEntryPointLimiter();
  const catalog = withValidation(
    DatabaseEmptyRequestSchema,
    async (request, response) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-catalog');
        return;
      }
      try {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        const parsedQuery = DatabaseCatalogRequestSchema.safeParse(
          Object.fromEntries(url.searchParams.entries()),
        );
        if (!parsedQuery.success) {
          throw new DatabaseQueryError('invalid_query', 'Catalog query parameters are invalid', {
            issues: parsedQuery.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        const query = parsedQuery.data.q;
        const result = dataPlane.catalogIfChanged(
          query,
          parsedQuery.data.ifCatalogRevision ?? parseRevisionTag(request.headers['if-none-match']),
        );
        successResponse(response, 200, DatabaseCatalogResponseSchema, result, {
          handler: 'database-catalog',
          extraHeaders: revisionHeaders(result.catalogRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-catalog', error);
      }
    },
    {
      handler: 'database-catalog',
      method: 'GET',
      skipBodyParse: true,
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const describe = withValidation(
    DatabaseDescribeRequestSchema,
    async (request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-describe');
        return;
      }
      try {
        const result = dataPlane.describeIfChanged({
          ...body,
          ifSchemaRevision:
            body.ifSchemaRevision ?? parseRevisionTag(request.headers['if-none-match']),
        });
        successResponse(response, 200, DatabaseDescribeResponseSchema, result, {
          handler: 'database-describe',
          extraHeaders: revisionHeaders(result.schemaRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-describe', error);
      }
    },
    {
      handler: 'database-describe',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const query = withValidation(
    DatabaseQueryRequestSchema,
    async (request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-query');
        return;
      }
      try {
        const result = dataPlane.query({
          ...body,
          throwIfCancelled: requestCancellationCheckpoint(request, response),
        });
        successResponse(response, 200, DatabaseQueryResponseSchema, result, {
          handler: 'database-query',
          extraHeaders: revisionHeaders(result.snapshotRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (cancelledConnection(error, request, response)) return;
        respondDataPlaneError(response, 'database-query', error);
      }
    },
    {
      handler: 'database-query',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const formSubmit = withValidation(
    DatabaseFormSubmitRequestSchema,
    async (request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-form-submit');
        return;
      }
      try {
        const result = await dataPlane.submitForm({
          ...body,
          remoteAddress: request.socket.remoteAddress ?? '',
        });
        successResponse(response, 201, DatabaseFormSubmitResponseSchema, result, {
          handler: 'database-form-submit',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-form-submit', error);
      }
    },
    {
      handler: 'database-form-submit',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const record = withValidation(
    DatabaseRecordRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-record');
        return;
      }
      try {
        const result = dataPlane.record(body);
        successResponse(response, 200, DatabaseRecordResponseSchema, result, {
          handler: 'database-record',
          extraHeaders: revisionHeaders(result.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-record', error);
      }
    },
    {
      handler: 'database-record',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const markdownTableExport = withValidation(
    DatabaseMarkdownTableExportRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-markdown-table-export');
        return;
      }
      try {
        const result = dataPlane.exportMarkdownTable(body);
        successResponse(response, 200, DatabaseMarkdownTableExportResponseSchema, result, {
          handler: 'database-markdown-table-export',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-markdown-table-export', error);
      }
    },
    {
      handler: 'database-markdown-table-export',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const computedPropertyPreview = withValidation(
    DatabaseComputedPropertyPreviewRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-computed-property-preview');
        return;
      }
      try {
        if (body.property.type !== 'formula' && body.property.type !== 'rollup') {
          throw new Error('Computed property request validation did not narrow the property type');
        }
        const result = dataPlane.previewComputedProperty({
          ...body,
          property: body.property,
        });
        successResponse(response, 200, DatabaseComputedPropertyPreviewResponseSchema, result, {
          handler: 'database-computed-property-preview',
          extraHeaders: revisionHeaders(result.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-computed-property-preview', error);
      }
    },
    {
      handler: 'database-computed-property-preview',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const find = withValidation(
    DatabaseFindRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-find');
        return;
      }
      try {
        const result = dataPlane.find(body);
        successResponse(response, 200, DatabaseFindResponseSchema, result, {
          handler: 'database-find',
          extraHeaders: revisionHeaders(result.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-find', error);
      }
    },
    {
      handler: 'database-find',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const retrieve = withValidation(
    DatabaseRetrieveRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-retrieve');
        return;
      }
      try {
        const result = await dataPlane.retrieve(body);
        successResponse(response, 200, DatabaseRetrieveResponseSchema, result, {
          handler: 'database-retrieve',
          extraHeaders: revisionHeaders(result.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-retrieve', error);
      }
    },
    {
      handler: 'database-retrieve',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const pack = withValidation(
    DatabaseContextPackRequestSchema,
    async (request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-pack');
        return;
      }
      try {
        const result = dataPlane.pack({
          ...body,
          throwIfCancelled: requestCancellationCheckpoint(request, response),
        });
        successResponse(response, 200, DatabaseContextPackResponseSchema, result, {
          handler: 'database-pack',
          extraHeaders: revisionHeaders(result.snapshot.indexRevision),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (cancelledConnection(error, request, response)) return;
        respondDataPlaneError(response, 'database-pack', error);
      }
    },
    {
      handler: 'database-pack',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const inspect = withValidation(
    DatabaseEmptyRequestSchema,
    async (request, response) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-context-inspector');
        return;
      }
      try {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        const parsedQuery = DatabaseContextInspectionRequestSchema.safeParse(
          Object.fromEntries(url.searchParams.entries()),
        );
        if (!parsedQuery.success) {
          throw new DatabaseQueryError('invalid_query', 'Inspector query parameters are invalid', {
            issues: parsedQuery.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        const {
          packId,
          databaseId,
          sourceId,
          viewId,
          recordId,
          recordIds: recordIdsParam,
          propertyIds: propertyIdsParam,
        } = parsedQuery.data;
        const recordIds = recordIdsParam
          ?.split(',')
          .map((recordId) => recordId.trim())
          .filter(Boolean);
        const propertyIds = propertyIdsParam
          ?.split(',')
          .map((propertyId) => propertyId.trim())
          .filter(Boolean);
        const scope =
          databaseId || sourceId || viewId || recordId || recordIds?.length || propertyIds?.length
            ? {
                ...(databaseId ? { databaseId } : {}),
                ...(sourceId ? { sourceId } : {}),
                ...(viewId ? { viewId } : {}),
                ...(recordId ? { recordId } : {}),
                ...(recordIds?.length ? { recordIds } : {}),
                ...(propertyIds?.length ? { propertyIds } : {}),
              }
            : undefined;
        const result = packId
          ? {
              kind: 'detail' as const,
              inspection: dataPlane.getContextInspection(packId, scope),
            }
          : {
              kind: 'list' as const,
              inspections: dataPlane.listContextInspections(scope),
            };
        successResponse(response, 200, DatabaseContextInspectionResponseSchema, result, {
          handler: 'database-context-inspector',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-context-inspector', error);
      }
    },
    {
      handler: 'database-context-inspector',
      method: 'GET',
      skipBodyParse: true,
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const propertyConversion = withValidation(
    DatabasePropertyConversionRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-property-conversion');
        return;
      }
      try {
        const result = dataPlane.previewPropertyConversion(body);
        successResponse(response, 200, DatabasePropertyConversionResponseSchema, result, {
          handler: 'database-property-conversion',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-property-conversion', error);
      }
    },
    {
      handler: 'database-property-conversion',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const plan = withValidation(
    DatabasePlanRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-plan');
        return;
      }
      try {
        const result = (() => {
          switch (body.action) {
            case 'create_draft':
              return {
                action: body.action,
                draft: dataPlane.createDraft(body.desiredState, body.ttlSeconds),
              };
            case 'create_database_deletion_draft':
              return {
                action: body.action,
                draft: dataPlane.createDatabaseDeletionDraft(
                  body.databaseId,
                  body.expectedSnapshotRevision,
                  body.ttlSeconds,
                ),
              };
            case 'create_verification_draft': {
              const result = dataPlane.createVerificationDraft(
                body.lifecycle,
                { kind: body.actor.kind, principal_id: body.actor.principalId },
                body.ttlSeconds,
              );
              return { action: body.action, ...result };
            }
            case 'get_draft':
              return {
                action: body.action,
                draft: dataPlane.getDraft(body.draftId),
              };
            case 'discard_draft':
              return {
                action: body.action,
                ...dataPlane.discardDraft(body.draftId),
              };
            case 'create_plan':
              return {
                action: body.action,
                plan: dataPlane.createPlan(body.draftId, body.ttlSeconds),
              };
            case 'get_plan':
              return {
                action: body.action,
                plan: dataPlane.getPlan(body.planId),
              };
          }
        })();
        successResponse(response, 200, DatabasePlanResponseSchema, result, {
          handler: 'database-plan',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-plan', error);
      }
    },
    {
      handler: 'database-plan',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const button = withValidation(
    DatabaseButtonRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-button');
        return;
      }
      try {
        if ('action' in body && body.action === 'execute') {
          const { action: _action, ...input } = body;
          const result = await dataPlane.executeButton(input);
          successResponse(
            response,
            200,
            DatabaseButtonResponseSchema,
            { action: 'execute', ...result },
            {
              handler: 'database-button',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        if ('action' in body && body.action === 'list_runs') {
          successResponse(
            response,
            200,
            DatabaseButtonResponseSchema,
            {
              action: 'list_runs',
              runs: await dataPlane.listButtonRuns(body.limit),
            },
            {
              handler: 'database-button',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        successResponse(
          response,
          200,
          DatabaseButtonResponseSchema,
          { plan: dataPlane.createButtonPlan(body) },
          {
            handler: 'database-button',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        respondDataPlaneError(response, 'database-button', error);
      }
    },
    {
      handler: 'database-button',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const placeSearch = withValidation(
    DatabasePlaceSearchRequestSchema,
    async (_request, response, body) => {
      try {
        dataPlane?.authorizeOperation({ action: 'external_egress' });
      } catch (error) {
        respondDataPlaneError(response, 'database-place-search', error);
        return;
      }
      if (!placeSearchService) {
        successResponse(
          response,
          200,
          DatabasePlaceSearchResponseSchema,
          {
            status: 'unavailable',
            providerId: null,
            candidates: [],
            attribution: null,
            offlineFallback: true,
          },
          {
            handler: 'database-place-search',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      try {
        const result = await placeSearchService.search(body);
        successResponse(response, 200, DatabasePlaceSearchResponseSchema, result, {
          handler: 'database-place-search',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (error instanceof DatabasePlaceSearchError) {
          errorResponse(
            response,
            error.code === 'provider_failed' ? 503 : 400,
            'urn:ok:error:invalid-request',
            error.message,
            { handler: 'database-place-search' },
          );
          return;
        }
        errorResponse(response, 500, 'urn:ok:error:internal-server-error', 'Place search failed.', {
          handler: 'database-place-search',
        });
      }
    },
    {
      handler: 'database-place-search',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const commit = withValidation(
    DatabaseCommitRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-commit');
        return;
      }
      try {
        successResponse(response, 200, DatabaseCommitResponseSchema, await dataPlane.commit(body), {
          handler: 'database-commit',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-commit', error);
      }
    },
    {
      handler: 'database-commit',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  /**
   * Drop the receipt bytes no HTTP caller reads.
   *
   * A v2 receipt carries the owner table's full before AND after content plus
   * any created document, so every one-row insert shipped the whole table twice
   * to a browser that never opens either field — and the cost grows with the
   * table. `beforeOwnerContent` stays: the client round-trips the receipt into
   * the `undo` operation, and `#beforeOwnerBytes` needs it there. The two dropped
   * fields are read only by `database-commit.ts`, which composes v2 receipts
   * in-process and never sees this response.
   */
  function slimMarkdownTableReceipt(result: { receipt?: unknown }): { receipt?: unknown } {
    const receipt = result.receipt;
    if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) return {};
    const {
      afterOwnerContent: _afterOwnerContent,
      createdDocumentContent: _createdDocumentContent,
      ...rest
    } = receipt as Record<string, unknown>;
    return { receipt: rest };
  }

  const markdownTableMutation = withValidation(
    DatabaseMarkdownTableMutationRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-markdown-table-mutation');
        return;
      }
      try {
        const result = await dataPlane.mutateMarkdownTable(
          body as unknown as DatabaseMarkdownTableMutationRequest,
        );
        successResponse(
          response,
          200,
          DatabaseMarkdownTableMutationResponseSchema,
          {
            operation: body.operation,
            ...(result as Record<string, unknown>),
            ...slimMarkdownTableReceipt(result as { receipt?: unknown }),
          },
          {
            handler: 'database-markdown-table-mutation',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        respondDataPlaneError(response, 'database-markdown-table-mutation', error);
      }
    },
    {
      handler: 'database-markdown-table-mutation',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const autonomy = withValidation(
    DatabaseAutonomyRequestSchema,
    async (_request, response, body) => {
      if (!autonomyStore) {
        respondUnavailable(response, 'database-autonomy');
        return;
      }
      try {
        dataPlane?.authorizeOperation({
          action: body.action === 'get' ? 'read_audit' : 'manage_permissions',
          ...('databaseId' in body && body.databaseId ? { databaseId: body.databaseId } : {}),
        });
        if (body.action === 'get') {
          const state = await autonomyStore.snapshot();
          const databaseMode = state.databases[body.databaseId]?.mode;
          const session = body.sessionId ? state.sessions[body.sessionId] : undefined;
          successResponse(
            response,
            200,
            DatabaseAutonomyResponseSchema,
            {
              action: body.action,
              databaseId: body.databaseId,
              sessionId: body.sessionId ?? null,
              databaseMode: databaseMode ?? null,
              sessionMode: session?.mode ?? null,
              effectiveMode: resolveDatabaseAutonomyMode(databaseMode, session?.mode),
              delegation: session?.delegation ?? null,
              usage: session?.usage ?? {
                records: 0,
                actions: 0,
                egressBytes: 0,
              },
              revision: state.revision,
              usageRevision: state.usageRevision,
            },
            {
              handler: 'database-autonomy',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const result = await (async () => {
          if (body.action === 'set_database' || body.action === 'clear_database') {
            const state =
              body.action === 'set_database'
                ? await autonomyStore.setDatabaseMode(body)
                : await autonomyStore.clearDatabaseMode(body);
            return {
              action: body.action,
              databaseId: body.databaseId,
              mode: state.databases[body.databaseId]?.mode ?? null,
              revision: state.revision,
              usageRevision: state.usageRevision,
            };
          }
          if (body.action === 'set_session') {
            const { state, sessionToken } = await autonomyStore.setSessionPolicy(body);
            return {
              action: body.action,
              sessionId: body.sessionId,
              mode: state.sessions[body.sessionId]?.mode ?? null,
              delegation: state.sessions[body.sessionId]?.delegation ?? null,
              sessionToken,
              usage: state.sessions[body.sessionId]?.usage ?? {
                records: 0,
                actions: 0,
                egressBytes: 0,
              },
              revision: state.revision,
              usageRevision: state.usageRevision,
            };
          }
          const state = await autonomyStore.clearSessionPolicy(body);
          return {
            action: body.action,
            sessionId: body.sessionId,
            mode: null,
            delegation: null,
            usage: { records: 0, actions: 0, egressBytes: 0 },
            revision: state.revision,
            usageRevision: state.usageRevision,
          };
        })();
        successResponse(response, 200, DatabaseAutonomyResponseSchema, result, {
          handler: 'database-autonomy',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (error instanceof DatabaseDataPlaneError) {
          respondDataPlaneError(response, 'database-autonomy', error);
          return;
        }
        respondAutonomyStoreError(response, error);
      }
    },
    {
      handler: 'database-autonomy',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const permissions = withValidation(
    DatabasePermissionsRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane || !permissionStore) {
        respondUnavailable(response, 'database-permissions');
        return;
      }
      try {
        if (body.action === 'list') {
          dataPlane.authorizeOperation({
            action: 'manage_permissions',
            ...(body.databaseId ? { databaseId: body.databaseId } : {}),
          });
          const state = await permissionStore.snapshot();
          const grants = Object.values(state.grants)
            .filter(
              (grant) =>
                !body.databaseId ||
                grant.databaseId === null ||
                grant.databaseId === body.databaseId,
            )
            .sort(
              (left, right) =>
                left.principalId.localeCompare(right.principalId) ||
                left.id.localeCompare(right.id),
            );
          successResponse(
            response,
            200,
            DatabasePermissionsResponseSchema,
            { action: body.action, grants, revision: state.revision },
            {
              handler: 'database-permissions',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const actorId = dataPlane.currentRecordActor().principal_id;
        if (body.action === 'upsert') {
          dataPlane.authorizeOperation({
            action: 'manage_permissions',
            ...(body.databaseId ? { databaseId: body.databaseId } : {}),
          });
          if (body.grantId) {
            const previous = (await permissionStore.snapshot()).grants[body.grantId];
            if (previous) {
              dataPlane.authorizeOperation({
                action: 'manage_permissions',
                ...(previous.databaseId ? { databaseId: previous.databaseId } : {}),
              });
            }
          }
          const result = await permissionStore.upsert({
            ...(body.grantId ? { id: body.grantId } : {}),
            databaseId: body.databaseId,
            principalId: body.principalId,
            role: body.role,
            actions: body.actions,
            actorId,
            expectedRevision: body.expectedRevision,
          });
          successResponse(
            response,
            200,
            DatabasePermissionsResponseSchema,
            {
              action: body.action,
              grant: result.grant,
              revision: result.state.revision,
            },
            {
              handler: 'database-permissions',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const current = await permissionStore.snapshot();
        const grant = current.grants[body.grantId];
        dataPlane.authorizeOperation({
          action: 'manage_permissions',
          ...(grant?.databaseId ? { databaseId: grant.databaseId } : {}),
        });
        const state = await permissionStore.remove({
          id: body.grantId,
          actorId,
          expectedRevision: body.expectedRevision,
        });
        successResponse(
          response,
          200,
          DatabasePermissionsResponseSchema,
          {
            action: body.action,
            grantId: body.grantId,
            revision: state.revision,
          },
          {
            handler: 'database-permissions',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        if (error instanceof DatabaseDataPlaneError) {
          respondDataPlaneError(response, 'database-permissions', error);
          return;
        }
        respondPermissionStoreError(response, error);
      }
    },
    {
      handler: 'database-permissions',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const publicShares = withValidation(
    DatabasePublicSharesRequestSchema,
    async (request, response, body) => {
      if (!dataPlane || !permissionStore) {
        respondUnavailable(response, 'database-public-shares');
        return;
      }
      try {
        if (body.action === 'list') {
          dataPlane.authorizeOperation({ action: 'publish', databaseId: body.databaseId });
          const state = await permissionStore.snapshot();
          const shares = Object.values(state.publicShares)
            .filter((policy) => policy.target.databaseId === body.databaseId)
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(publicShareView);
          successResponse(
            response,
            200,
            DatabasePublicSharesResponseSchema,
            { action: body.action, shares, revision: state.revision },
            {
              handler: 'database-public-shares',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const actorId = dataPlane.currentRecordActor().principal_id;
        if (body.action === 'upsert') {
          if (body.shareId) {
            const previous = (await permissionStore.snapshot()).publicShares[body.shareId];
            if (previous) {
              dataPlane.authorizeOperation({
                action: 'publish',
                databaseId: previous.target.databaseId,
              });
            }
          }
          dataPlane.validatePublicShareTarget({
            target: body.target,
            propertyIds: body.propertyIds,
            allowFormSubmission: body.allowFormSubmission,
          });
          const saved = await permissionStore.upsertPublicShare({
            ...(body.shareId ? { id: body.shareId } : {}),
            target: body.target,
            access: body.access,
            propertyIds: body.propertyIds,
            allowBody: body.allowBody,
            allowFormSubmission: body.allowFormSubmission,
            expiresAt: body.expiresAt,
            rotateToken: body.rotateToken,
            actorId,
            expectedRevision: body.expectedRevision,
          });
          successResponse(
            response,
            200,
            DatabasePublicSharesResponseSchema,
            {
              action: body.action,
              share: publicShareView(saved.policy),
              token: saved.token,
              revision: saved.state.revision,
            },
            {
              handler: 'database-public-shares',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        if (body.action === 'revoke') {
          const current = await permissionStore.snapshot();
          const policy = current.publicShares[body.shareId];
          if (policy) {
            dataPlane.authorizeOperation({
              action: 'publish',
              databaseId: policy.target.databaseId,
            });
          } else {
            dataPlane.authorizeOperation({ action: 'publish' });
          }
          const state = await permissionStore.revokePublicShare({
            id: body.shareId,
            actorId,
            expectedRevision: body.expectedRevision,
          });
          successResponse(
            response,
            200,
            DatabasePublicSharesResponseSchema,
            { action: body.action, shareId: body.shareId, revision: state.revision },
            {
              handler: 'database-public-shares',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }

        const policy = await permissionStore.resolvePublicShare(body.shareId, body.token);
        if (!policy) {
          errorResponse(
            response,
            404,
            'urn:ok:error:not-found',
            'Public database share was not found.',
            {
              handler: 'database-public-shares',
              extensions: databaseProblemExtensions('database_not_found'),
            },
          );
          return;
        }
        const share = publicShareView(policy);
        if (body.action === 'resolve') {
          successResponse(
            response,
            200,
            DatabasePublicSharesResponseSchema,
            { action: body.action, share },
            {
              handler: 'database-public-shares',
              extraHeaders: noStoreHeaders(),
              errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
            },
          );
          return;
        }
        const described = dataPlane.withPublicShare(policy, () =>
          dataPlane.describe({ databaseId: policy.target.databaseId }),
        );
        const source = described.database.sources[0];
        if (!source) {
          throw new DatabaseDataPlaneError(
            'permission_denied',
            'Public share source is unavailable',
          );
        }
        const result = await (async () => {
          if (body.action === 'describe') return described;
          if (body.action === 'record') {
            if (policy.target.kind !== 'record') {
              throw new DatabaseDataPlaneError(
                'permission_denied',
                'This public share is not a record share',
              );
            }
            const recordId = policy.target.recordId;
            return dataPlane.withPublicShare(policy, () =>
              dataPlane.record({
                databaseId: policy.target.databaseId,
                sourceId: source.id,
                recordId,
              }),
            );
          }
          if (body.action === 'submit_form') {
            if (policy.target.kind !== 'form' || !policy.allowFormSubmission) {
              throw new DatabaseDataPlaneError(
                'form_access_denied',
                'This public share does not accept form submissions',
              );
            }
            const viewId = policy.target.viewId;
            return dataPlane.withPublicShare(policy, () =>
              dataPlane.submitForm({
                databaseId: policy.target.databaseId,
                sourceId: source.id,
                viewId,
                submissionId: body.submissionId,
                startedAt: body.startedAt,
                answers: body.answers,
                ...(body.honeypot === undefined ? {} : { honeypot: body.honeypot }),
                remoteAddress: request.socket.remoteAddress ?? '',
              }),
            );
          }
          if (policy.target.kind === 'record' || policy.target.kind === 'form') {
            throw new DatabaseDataPlaneError(
              'permission_denied',
              'This public share does not expose a query endpoint',
            );
          }
          const viewId = policy.target.kind === 'database' ? undefined : policy.target.viewId;
          return dataPlane.withPublicShare(policy, () =>
            dataPlane.query({
              databaseId: policy.target.databaseId,
              sourceId: source.id,
              ...(viewId ? { viewId } : {}),
              query: body.query,
              throwIfCancelled: requestCancellationCheckpoint(request, response),
            }),
          );
        })();
        successResponse(
          response,
          200,
          DatabasePublicSharesResponseSchema,
          { action: body.action, share, result },
          {
            handler: 'database-public-shares',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        if (cancelledConnection(error, request, response)) return;
        if (error instanceof DatabaseDataPlaneError) {
          respondDataPlaneError(response, 'database-public-shares', error);
          return;
        }
        respondPermissionStoreError(response, error);
      }
    },
    {
      handler: 'database-public-shares',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const runs = withValidation(
    DatabaseAgentRunsRequestSchema,
    async (_request, response, body) => {
      if (!agentRunStore) {
        respondUnavailable(response, 'database-agent-runs');
        return;
      }
      try {
        dataPlane?.authorizeOperation({ action: 'read_audit' });
        let result: z.input<typeof DatabaseAgentRunsResponseSchema>;
        if (body.action === 'list') {
          result = { action: body.action, ...(await agentRunStore.list()) };
        } else if (body.action === 'get') {
          result = { action: body.action, run: await agentRunStore.get(body.runId) };
        } else if (body.action === 'retry' || body.action === 'resume') {
          if (!dataPlane) {
            respondUnavailable(response, 'database-data-plane');
            return;
          }
          const sourceRun = await agentRunStore.prepareRecovery(body.runId, body.expectedRevision);
          let plan: DatabasePlanArtifact;
          try {
            plan = dataPlane.getPlan(sourceRun.plan.id);
          } catch (error) {
            if (!(error instanceof DatabasePlanError) || error.code !== 'plan_not_found') {
              throw error;
            }
            plan = dataPlane.restorePlanBundle(
              await agentRunStore.getPlanBundle(sourceRun.plan.id),
            );
          }
          if (plan.hash !== sourceRun.plan.hash) {
            throw new DatabaseCommitError(
              'plan_hash_mismatch',
              'The Agent Run plan hash no longer matches its immutable plan',
              { expectedPlanHash: sourceRun.plan.hash, observedPlanHash: plan.hash },
            );
          }
          const recoveryActor = {
            principalId: sourceRun.actor.principalId,
            kind: sourceRun.actor.kind,
            ...(sourceRun.actor.sessionId ? { sessionId: sourceRun.actor.sessionId } : {}),
          };
          const recoveryRun = await agentRunStore.propose(plan, recoveryActor, {
            action: body.action,
            sourceRunId: sourceRun.id,
            idempotencyKey: body.idempotencyKey,
          });
          const receipt = await dataPlane.commit({
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: sourceRun.plan.snapshotRevision,
            idempotencyKey: body.idempotencyKey,
            ...(body.approvalToken ? { approvalToken: body.approvalToken } : {}),
            ...(body.autonomySessionToken
              ? { autonomySessionToken: body.autonomySessionToken }
              : {}),
            actor: recoveryActor,
          });
          result = {
            action: body.action,
            sourceRunId: sourceRun.id,
            run: await agentRunStore.get(recoveryRun.id),
            receipt,
          };
        } else {
          if (!promptRetentionStore) {
            respondUnavailable(response, 'database-agent-prompt-retention');
            return;
          }
          if (body.action === 'retain_prompt') {
            await agentRunStore.get(body.runId);
            result = {
              action: body.action,
              retention: promptRetentionStore.retain(body),
            };
          } else if (body.action === 'get_prompt') {
            result = {
              action: body.action,
              retention: promptRetentionStore.get(body.runId),
            };
          } else {
            result = {
              action: body.action,
              runId: body.runId,
              deleted: promptRetentionStore.delete(body.runId),
            };
          }
        }
        successResponse(response, 200, DatabaseAgentRunsResponseSchema, result, {
          handler: 'database-agent-runs',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        if (error instanceof DatabaseDataPlaneError) {
          respondDataPlaneError(response, 'database-agent-runs', error);
          return;
        }
        if (error instanceof DatabasePlanError) {
          respondDataPlaneError(response, 'database-agent-runs', error);
          return;
        }
        if (error instanceof DatabaseAgentPromptRetentionError) {
          respondAgentPromptRetentionError(response, error);
          return;
        }
        respondAgentRunStoreError(response, error);
      }
    },
    {
      handler: 'database-agent-runs',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const templateRuns = withValidation(
    DatabaseTemplateRunsRequestSchema,
    async (_request, response, body) => {
      if (!templateScheduler) {
        respondUnavailable(response, 'database-template-runs');
        return;
      }
      try {
        dataPlane?.authorizeOperation({
          action: 'read_audit',
          ...(body.databaseId ? { databaseId: body.databaseId } : {}),
        });
        const runs = await templateScheduler.list(body.limit, {
          ...(body.databaseId ? { databaseId: body.databaseId } : {}),
          ...(body.templateId ? { templateId: body.templateId } : {}),
        });
        successResponse(
          response,
          200,
          DatabaseTemplateRunsResponseSchema,
          { runs },
          {
            handler: 'database-template-runs',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        respondDataPlaneError(response, 'database-template-runs', error);
      }
    },
    {
      handler: 'database-template-runs',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const automations = withValidation(
    DatabaseAutomationRequestSchema,
    async (_request, response, body) => {
      if (!automationService) {
        respondUnavailable(response, 'database-automations');
        return;
      }
      try {
        dataPlane?.authorizeOperation({
          action:
            body.action === 'dry_run' || body.action === 'test_event'
              ? 'run_automation'
              : 'read_audit',
          ...('databaseId' in body && body.databaseId ? { databaseId: body.databaseId } : {}),
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-automations', error);
        return;
      }
      if (body.action === 'notifications') {
        if (!automationNotificationStore) {
          respondUnavailable(response, 'database-automation-notifications');
          return;
        }
        const notifications = await automationNotificationStore.list({
          ...(body.recipientId ? { recipientId: body.recipientId } : {}),
          unreadOnly: body.unreadOnly,
          limit: body.limit,
        });
        successResponse(
          response,
          200,
          DatabaseAutomationResponseSchema,
          { action: body.action, notifications },
          {
            handler: 'database-automations',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      if (body.action === 'mark_notification_read') {
        if (!automationNotificationStore) {
          respondUnavailable(response, 'database-automation-notifications');
          return;
        }
        await automationNotificationStore.markRead(body.notificationId);
        successResponse(
          response,
          200,
          DatabaseAutomationResponseSchema,
          { action: body.action, notificationId: body.notificationId },
          {
            handler: 'database-automations',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      if (body.action === 'list') {
        const runs = await automationService.listRuns({
          ...(body.databaseId ? { databaseId: body.databaseId } : {}),
          ...(body.automationId ? { automationId: body.automationId } : {}),
          limit: body.limit,
        });
        successResponse(
          response,
          200,
          DatabaseAutomationResponseSchema,
          { action: 'list', runs },
          {
            handler: 'database-automations',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      if (body.event.databaseId !== body.databaseId) {
        throw new DatabasePlanError(
          'invalid_desired_state',
          'Automation test event database does not match the request scope',
        );
      }
      if (body.action === 'dry_run') {
        const planned = await automationService.dryRun({
          databaseId: body.databaseId,
          automationId: body.automationId,
          event: body.event,
        });
        const records = planned.internalPlan?.diff.records ?? [];
        successResponse(
          response,
          200,
          DatabaseAutomationResponseSchema,
          {
            action: 'dry_run',
            plan: {
              automationId: planned.automationId,
              automationVersion: planned.automationVersion,
              internalPlan: planned.internalPlan
                ? {
                    id: planned.internalPlan.id,
                    hash: planned.internalPlan.hash,
                    committable: planned.internalPlan.committable && !planned.migrationRequired,
                    migrationRequired:
                      planned.migrationRequired ||
                      planned.internalPlan.conflicts.some(
                        (conflict) => conflict.code === 'source_record_migration_required',
                      ),
                    risk: planned.internalPlan.risk,
                    records: {
                      creates: records.filter((record) => record.action === 'create').length,
                      updates: records.filter((record) => record.action !== 'create').length,
                    },
                  }
                : null,
              notifications: planned.notifications.map(({ actionId, recipientIds, title }) => ({
                actionId,
                recipientIds,
                title,
              })),
              external: planned.external.map(
                ({ actionId, kind, connectionId, egressBytes, policyId, policyRevision }) => ({
                  actionId,
                  kind,
                  connectionId,
                  egressBytes,
                  policyId,
                  policyRevision,
                }),
              ),
            },
          },
          {
            handler: 'database-automations',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
        return;
      }
      const event = await automationService.enqueue({
        ...body.event,
        targetAutomationId: body.automationId,
      });
      const changed = await automationService.tick();
      successResponse(
        response,
        200,
        DatabaseAutomationResponseSchema,
        {
          action: 'test_event',
          event,
          runs: changed.filter((run) => run.eventId === event.id),
        },
        {
          handler: 'database-automations',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        },
      );
    },
    {
      handler: 'database-automations',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const undo = withValidation(
    DatabaseUndoRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-undo');
        return;
      }
      try {
        successResponse(response, 200, DatabaseUndoResponseSchema, await dataPlane.undo(body), {
          handler: 'database-undo',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-undo', error);
      }
    },
    {
      handler: 'database-undo',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const repair = withValidation(
    DatabaseRepairRequestSchema,
    async (_request, response, body) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-repair');
        return;
      }
      try {
        const result =
          body.action === 'preview'
            ? {
                action: body.action,
                plan: await dataPlane.previewRepair(body.ttlSeconds, {
                  ...(body.documentIds
                    ? { documentIds: body.documentIds as Record<string, `doc_${string}`> }
                    : {}),
                }),
              }
            : body.action === 'apply'
              ? {
                  action: body.action,
                  result: await dataPlane.applyRepair(body),
                }
              : {
                  action: body.action,
                  result: await dataPlane.undoRepair(body),
                };
        successResponse(response, 200, DatabaseRepairResponseSchema, result, {
          handler: 'database-repair',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondDataPlaneError(response, 'database-repair', error);
      }
    },
    {
      handler: 'database-repair',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const task = withValidation(
    DatabaseTaskRequestSchema,
    async (_request, response, body) => {
      if (!taskStore) {
        respondUnavailable(response, 'database-task');
        return;
      }
      try {
        if (
          body.action === 'list' ||
          body.action === 'get' ||
          body.action === 'cancel' ||
          body.action === 'inspect_migration' ||
          body.action === 'preview_cleanup_migration'
        ) {
          dataPlane?.authorizeOperation({ action: 'read_audit' });
        } else if (body.action === 'preview_import') {
          dataPlane?.authorizeOperation({
            action: 'describe',
            databaseId: body.databaseId,
            sourceId: body.sourceId,
          });
        } else if (body.action === 'preview_migration') {
          for (const databaseId of body.databaseIds ?? []) {
            dataPlane?.authorizeOperation({
              action: 'alter_schema',
              databaseId,
            });
          }
          if (!body.databaseIds || body.databaseIds.length === 0) {
            dataPlane?.authorizeOperation({ action: 'alter_schema' });
          }
        } else if (body.action === 'start') {
          if (body.task.operation === 'bulk') {
            dataPlane?.authorizePlanMutation(body.task.commit.planId);
          } else if (body.task.operation === 'import') {
            dataPlane?.authorizeOperation({
              action: 'alter_schema',
              databaseId: body.task.databaseId,
              sourceId: body.task.sourceId,
            });
          } else {
            for (const databaseId of body.task.databaseIds ?? []) {
              dataPlane?.authorizeOperation({
                action: 'alter_schema',
                databaseId,
              });
            }
            if (!body.task.databaseIds || body.task.databaseIds.length === 0) {
              dataPlane?.authorizeOperation({ action: 'alter_schema' });
            }
          }
        } else {
          dataPlane?.authorizeOperation({ action: 'alter_schema' });
        }
        const result = (() => {
          switch (body.action) {
            case 'list':
              return taskStore.list({
                state: body.state,
                limit: body.limit,
                cursor: body.cursor,
              });
            case 'get':
              return taskStore.get(body.taskId);
            case 'cancel':
              return taskService
                ? taskService.cancel(body.taskId, body.expectedRevision)
                : taskStore.cancel(body.taskId, body.expectedRevision);
            case 'preview_import':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database source onboarding preview is unavailable for this server.',
                );
              }
              return taskService.previewImport({
                operation: 'import',
                databaseId: body.databaseId,
                sourceId: body.sourceId,
                expectedManifestRevision: body.expectedManifestRevision,
              });
            case 'preview_migration':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database manifest migration preview is unavailable for this server.',
                );
              }
              return taskService.previewMigration({
                operation: 'migration',
                ...(body.databaseIds ? { databaseIds: body.databaseIds } : {}),
                expectedManifestRevision: body.expectedManifestRevision,
                targetVersion: body.targetVersion,
                ...(body.migrationCommittedAt
                  ? { migrationCommittedAt: body.migrationCommittedAt }
                  : {}),
                ...(body.ownerChoices ? { ownerChoices: body.ownerChoices } : {}),
                ...(body.titleChoices ? { titleChoices: body.titleChoices } : {}),
                ...(body.derivedBaselines ? { derivedBaselines: body.derivedBaselines } : {}),
              });
            case 'start':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database task execution is unavailable for this server.',
                );
              }
              return taskService.start(body.task);
            case 'retry':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database task execution is unavailable for this server.',
                );
              }
              return taskService.retry(body.taskId, body.expectedRevision);
            case 'resume':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database task execution is unavailable for this server.',
                );
              }
              return taskService.resume(body.taskId, body.expectedRevision);
            case 'rollback':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_rollback_unavailable',
                  'Database task rollback is unavailable for this server.',
                );
              }
              return taskService.rollback(body.taskId, body.expectedRevision);
            case 'inspect_migration':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_snapshot_changed',
                  'Database migration recovery inspection is unavailable for this server.',
                );
              }
              return taskService.inspectMigration(body.taskId);
            case 'preview_cleanup_migration':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_rollback_unavailable',
                  'Database migration cleanup preview is unavailable for this server.',
                );
              }
              return taskService.previewMigrationCleanup(body.taskId);
            case 'cleanup_migration':
              if (!taskService) {
                throw new DatabaseTaskServiceError(
                  'task_rollback_unavailable',
                  'Database migration cleanup is unavailable for this server.',
                );
              }
              return taskService.cleanupMigration(
                body.taskId,
                body.expectedRevision,
                body.planHash,
                body.approvalToken,
              );
          }
        })();
        const resolved = await result;
        const payload =
          body.action === 'list'
            ? { action: body.action, ...resolved }
            : body.action === 'preview_import' || body.action === 'preview_migration'
              ? { action: body.action, preview: resolved }
              : body.action === 'rollback'
                ? { action: body.action, rollback: resolved }
                : body.action === 'inspect_migration'
                  ? { action: body.action, inspection: resolved }
                  : body.action === 'preview_cleanup_migration'
                    ? { action: body.action, cleanupPlan: resolved }
                    : body.action === 'cleanup_migration'
                      ? { action: body.action, cleanup: resolved }
                      : { action: body.action, task: resolved };
        successResponse(response, 200, DatabaseTaskResponseSchema, payload, {
          handler: 'database-task',
          extraHeaders: noStoreHeaders(),
          errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
        });
      } catch (error) {
        respondTaskStoreError(response, error);
      }
    },
    {
      handler: 'database-task',
      method: 'POST',
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const diagnostics = withValidation(
    DatabaseEmptyRequestSchema,
    async (_request, response) => {
      if (!dataPlane) {
        respondUnavailable(response, 'database-diagnostics');
        return;
      }
      try {
        const index = dataPlane.getRecordIndexStatus();
        const issues = dataPlane.getRecordIndexIssuesSummary();
        const schemas = dataPlane.getSchemaRevisions();
        const tasks = taskStore
          ? (await taskStore.list({ limit: 20 })).tasks.map((task) => ({
              id: task.id,
              operation: task.operation,
              state: task.state,
              createdAt: task.createdAt,
              finishedAt: task.finishedAt,
            }))
          : [];
        successResponse(
          response,
          200,
          DatabaseDiagnosticsResponseSchema,
          { index, issues, schemas, tasks, telemetry: getDatabaseTelemetry() },
          {
            handler: 'database-diagnostics',
            extraHeaders: noStoreHeaders(),
            errorExtensions: DATABASE_INTERNAL_ERROR_EXTENSIONS,
          },
        );
      } catch (error) {
        respondDataPlaneError(response, 'database-diagnostics', error);
      }
    },
    {
      handler: 'database-diagnostics',
      method: 'GET',
      skipBodyParse: true,
      errorExtensions: DATABASE_REQUEST_ERROR_EXTENSIONS,
    },
  );

  const handlers: DatabaseDataPlaneApiHandlers = {
    catalog,
    describe,
    record,
    markdownTableExport,
    computedPropertyPreview,
    propertyConversion,
    find,
    retrieve,
    query,
    formSubmit,
    pack,
    inspect,
    plan,
    button,
    placeSearch,
    commit,
    markdownTableMutation,
    runs,
    templateRuns,
    automations,
    autonomy,
    permissions,
    publicShares,
    undo,
    repair,
    task,
    diagnostics,
  };
  if (!dataPlane || !resolveAccessPrincipal) return handlers;
  const contextualize =
    (
      handlerName: keyof DatabaseDataPlaneApiHandlers,
      handler: DatabaseDataPlaneApiHandlers[keyof DatabaseDataPlaneApiHandlers],
    ) =>
    async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
      const principal = resolveAccessPrincipal(request);
      const limitKey =
        principal.kind === 'agent'
          ? `${principal.id}\0${principal.invokingUserId}\0${principal.sessionId}`
          : null;
      if (limitKey !== null) {
        const decision = agentEntryPointLimiter.acquire(limitKey);
        if (!decision.ok) {
          errorResponse(
            response,
            429,
            'urn:ok:error:too-many-requests',
            decision.reason === 'concurrency_limit'
              ? 'Too many concurrent database requests for this agent session.'
              : 'Database request rate limit exceeded for this agent session.',
            {
              handler: `database-${handlerName}`,
              extraHeaders: { 'Retry-After': String(decision.retryAfterSeconds) },
            },
          );
          return;
        }
      }
      try {
        await dataPlane.withAccessPrincipal(principal, () => handler(request, response));
      } finally {
        if (limitKey !== null) agentEntryPointLimiter.release(limitKey);
      }
    };
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      contextualize(name as keyof DatabaseDataPlaneApiHandlers, handler),
    ]),
  ) as unknown as DatabaseDataPlaneApiHandlers;
}
