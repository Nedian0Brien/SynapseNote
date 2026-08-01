import { resolveDatabaseAutonomyMode } from '@nedian0brien/synapsenote-core';
import {
  DatabaseAutonomyRequestSchema,
  DatabasePermissionsRequestSchema,
  DatabasePublicSharesRequestSchema,
} from './database-data-plane-api-contracts-access.ts';
import {
  DatabaseAutonomyResponseSchema,
  DatabasePermissionsResponseSchema,
  DatabasePublicSharesResponseSchema,
} from './database-data-plane-api-contracts-operation-responses.ts';
import { DATABASE_INTERNAL_ERROR_EXTENSIONS } from './database-data-plane-api-contracts-read-requests.ts';
import type {
  DatabaseDataPlaneApiHandlerContext,
  DatabaseDataPlaneApiHandlers,
} from './database-data-plane-api-handler-context.ts';
import {
  cancelledConnection,
  noStoreHeaders,
  publicShareView,
  requestCancellationCheckpoint,
  respondAutonomyStoreError,
  respondDataPlaneError,
  respondPermissionStoreError,
  respondUnavailable,
} from './database-data-plane-api-response.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import {
  DATABASE_REQUEST_ERROR_EXTENSIONS,
  databaseProblemExtensions,
} from './database-problem.ts';
import { errorResponse } from './http/error-response.ts';
import { withValidation } from './http/request-validation.ts';
import { successResponse } from './http/success-response.ts';

export function createDatabasePermissionShareAutonomyHandlers({
  dataPlane,
  autonomyStore,
  permissionStore,
}: DatabaseDataPlaneApiHandlerContext): Pick<
  DatabaseDataPlaneApiHandlers,
  'autonomy' | 'permissions' | 'publicShares'
> {
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
  return { autonomy, permissions, publicShares };
}
