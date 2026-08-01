import { DatabaseQueryError } from '@nedian0brien/synapsenote-core';
import {
  DatabaseContextInspectionResponseSchema,
  DatabaseContextPackResponseSchema,
} from './database-data-plane-api-contracts-context-inspection.ts';
import {
  DatabaseFindResponseSchema,
  DatabaseFormSubmitResponseSchema,
  DatabaseQueryResponseSchema,
  DatabaseRetrieveResponseSchema,
} from './database-data-plane-api-contracts-query-retrieval.ts';
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
import {
  DatabaseCatalogResponseSchema,
  DatabaseComputedPropertyPreviewResponseSchema,
  DatabaseDescribeResponseSchema,
  DatabaseMarkdownTableExportResponseSchema,
  DatabaseRecordResponseSchema,
} from './database-data-plane-api-contracts-read-responses.ts';
import type {
  DatabaseDataPlaneApiHandlerContext,
  DatabaseDataPlaneApiHandlers,
} from './database-data-plane-api-handler-context.ts';
import {
  cancelledConnection,
  noStoreHeaders,
  parseRevisionTag,
  requestCancellationCheckpoint,
  respondDataPlaneError,
  respondUnavailable,
  revisionHeaders,
} from './database-data-plane-api-response.ts';
import { DATABASE_REQUEST_ERROR_EXTENSIONS } from './database-problem.ts';
import { withValidation } from './http/request-validation.ts';
import { successResponse } from './http/success-response.ts';

export function createDatabaseCatalogQueryHandlers({
  dataPlane,
}: DatabaseDataPlaneApiHandlerContext): Pick<
  DatabaseDataPlaneApiHandlers,
  | 'catalog'
  | 'describe'
  | 'record'
  | 'markdownTableExport'
  | 'computedPropertyPreview'
  | 'find'
  | 'retrieve'
  | 'query'
  | 'formSubmit'
  | 'pack'
  | 'inspect'
> {
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

  return {
    catalog,
    describe,
    record,
    markdownTableExport,
    computedPropertyPreview,
    find,
    retrieve,
    query,
    formSubmit,
    pack,
    inspect,
  };
}
