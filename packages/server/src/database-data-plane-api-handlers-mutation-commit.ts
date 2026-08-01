import type { DatabaseMarkdownTableMutationRequest } from './database-data-plane.ts';
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
  DatabaseButtonResponseSchema,
  DatabaseCommitResponseSchema,
  DatabasePlanResponseSchema,
} from './database-data-plane-api-contracts-operation-responses.ts';
import { DATABASE_INTERNAL_ERROR_EXTENSIONS } from './database-data-plane-api-contracts-read-requests.ts';
import type {
  DatabaseDataPlaneApiHandlerContext,
  DatabaseDataPlaneApiHandlers,
} from './database-data-plane-api-handler-context.ts';
import {
  noStoreHeaders,
  respondDataPlaneError,
  respondUnavailable,
} from './database-data-plane-api-response.ts';
import { DatabasePlaceSearchError } from './database-place-search.ts';
import { DATABASE_REQUEST_ERROR_EXTENSIONS } from './database-problem.ts';
import { errorResponse } from './http/error-response.ts';
import { withValidation } from './http/request-validation.ts';
import { successResponse } from './http/success-response.ts';

export function createDatabaseMutationCommitHandlers({
  dataPlane,
  placeSearchService,
}: DatabaseDataPlaneApiHandlerContext): Pick<
  DatabaseDataPlaneApiHandlers,
  'propertyConversion' | 'plan' | 'button' | 'placeSearch' | 'commit' | 'markdownTableMutation'
> {
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
  return {
    propertyConversion,
    plan,
    button,
    placeSearch,
    commit,
    markdownTableMutation,
  };
}
