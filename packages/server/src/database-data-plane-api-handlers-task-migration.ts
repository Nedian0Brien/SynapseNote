import {
  DatabaseRepairRequestSchema,
  DatabaseUndoRequestSchema,
} from './database-data-plane-api-contracts-access.ts';
import {
  DatabaseDiagnosticsResponseSchema,
  DatabaseRepairResponseSchema,
  DatabaseUndoResponseSchema,
} from './database-data-plane-api-contracts-operation-responses.ts';
import {
  DATABASE_INTERNAL_ERROR_EXTENSIONS,
  DatabaseEmptyRequestSchema,
} from './database-data-plane-api-contracts-read-requests.ts';
import {
  DatabaseTaskRequestSchema,
  DatabaseTaskResponseSchema,
} from './database-data-plane-api-contracts-task-migration.ts';
import type {
  DatabaseDataPlaneApiHandlerContext,
  DatabaseDataPlaneApiHandlers,
} from './database-data-plane-api-handler-context.ts';
import {
  noStoreHeaders,
  respondDataPlaneError,
  respondTaskStoreError,
  respondUnavailable,
} from './database-data-plane-api-response.ts';
import { DATABASE_REQUEST_ERROR_EXTENSIONS } from './database-problem.ts';
import { DatabaseTaskServiceError } from './database-task-service.ts';
import { getDatabaseTelemetry } from './database-telemetry.ts';
import { withValidation } from './http/request-validation.ts';
import { successResponse } from './http/success-response.ts';

export function createDatabaseTaskMigrationHandlers({
  dataPlane,
  taskStore,
  taskService,
}: DatabaseDataPlaneApiHandlerContext): Pick<
  DatabaseDataPlaneApiHandlers,
  'undo' | 'repair' | 'task' | 'diagnostics'
> {
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
                plan: await dataPlane.previewRepair(
                  body.ttlSeconds,
                  body.documentIds
                    ? { documentIds: body.documentIds as Record<string, `doc_${string}`> }
                    : {},
                ),
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
  return { undo, repair, task, diagnostics };
}
