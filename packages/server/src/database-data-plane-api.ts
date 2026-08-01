import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseAccessPrincipal } from '@nedian0brien/synapsenote-core';
import type { z } from 'zod';
import type { DatabaseAgentPromptRetentionStore } from './database-agent-prompt-retention.ts';
import type { DatabaseAgentRunStore } from './database-agent-run-store.ts';
import type { DatabaseAutomationService } from './database-automation.ts';
import type { DatabaseAutomationNotificationStore } from './database-automation-notification-store.ts';
import type { DatabaseAutonomyStore } from './database-autonomy-store.ts';
import type {
  DatabaseDataPlaneApiHandlerContext,
  DatabaseDataPlaneApiHandlers,
} from './database-data-plane-api-handler-context.ts';
import { createDatabaseAgentAutomationHandlers } from './database-data-plane-api-handlers-agent-automation.ts';
import { createDatabaseCatalogQueryHandlers } from './database-data-plane-api-handlers-catalog-query.ts';
import { createDatabaseMutationCommitHandlers } from './database-data-plane-api-handlers-mutation-commit.ts';
import { createDatabasePermissionShareAutonomyHandlers } from './database-data-plane-api-handlers-permission-share-autonomy.ts';
import { createDatabaseTaskMigrationHandlers } from './database-data-plane-api-handlers-task-migration.ts';
import type { DatabaseDataPlaneHandlerPort } from './database-data-plane-contracts.ts';
import { DatabaseAgentEntryPointLimiter } from './database-entry-point-limits.ts';
import type { DatabasePermissionStore } from './database-permission-store.ts';
import type { DatabasePlaceSearchService } from './database-place-search.ts';
import type { DatabaseTaskService } from './database-task-service.ts';
import type { DatabaseTaskStore } from './database-task-store.ts';
import type { DatabaseTemplateScheduler } from './database-template-scheduler.ts';
import { errorResponse } from './http/error-response.ts';

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
export {
  DatabaseContextInspectionResponseSchema,
  DatabaseContextPackResponseSchema,
} from './database-data-plane-api-contracts-context-inspection.ts';

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
export {
  DatabaseFindResponseSchema,
  DatabaseFormSubmitResponseSchema,
  DatabaseQueryResponseSchema,
  DatabaseRetrieveResponseSchema,
} from './database-data-plane-api-contracts-query-retrieval.ts';
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
export {
  DATABASE_API_SCHEMA_VERSION,
  DATABASE_API_SCHEMA_VERSION_HEADER,
} from './database-data-plane-api-response.ts';

import type {
  DatabaseTaskRequestSchema,
  DatabaseTaskResponseSchema,
} from './database-data-plane-api-contracts-task-migration.ts';

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
export {
  DatabaseManifestMigrationPreviewSchema,
  DatabaseMigrationCleanupPlanSchema,
  DatabaseOnboardingPreviewSchema,
  DatabaseTaskRequestSchema,
  DatabaseTaskResponseSchema,
} from './database-data-plane-api-contracts-task-migration.ts';

export { DATABASE_API_SCHEMAS } from './database-data-plane-api-schemas.ts';

export type { DatabaseTask } from './database-task-contract.ts';
export { DatabaseTaskSchema } from './database-task-contract.ts';
export type DatabaseTaskRequest = z.infer<typeof DatabaseTaskRequestSchema>;
export type DatabaseTaskResponse = z.infer<typeof DatabaseTaskResponseSchema>;
export type { DatabaseDataPlaneApiHandlers } from './database-data-plane-api-handler-context.ts';

export function createDatabaseDataPlaneApiHandlers(
  dataPlane?: DatabaseDataPlaneHandlerPort,
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
  const handlerContext: DatabaseDataPlaneApiHandlerContext = {
    dataPlane,
    taskStore,
    taskService,
    autonomyStore,
    agentRunStore,
    placeSearchService,
    templateScheduler,
    automationService,
    automationNotificationStore,
    permissionStore,
    promptRetentionStore,
    agentEntryPointLimiter,
  };
  const handlers: DatabaseDataPlaneApiHandlers = {
    ...createDatabaseCatalogQueryHandlers(handlerContext),
    ...createDatabaseMutationCommitHandlers(handlerContext),
    ...createDatabasePermissionShareAutonomyHandlers(handlerContext),
    ...createDatabaseAgentAutomationHandlers(handlerContext),
    ...createDatabaseTaskMigrationHandlers(handlerContext),
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
