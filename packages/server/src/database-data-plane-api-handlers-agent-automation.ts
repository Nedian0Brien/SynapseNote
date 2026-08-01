import type { z } from 'zod';
import { DatabaseAgentPromptRetentionError } from './database-agent-prompt-retention.ts';
import { DatabaseCommitError } from './database-commit.ts';
import { DatabaseAgentRunsRequestSchema } from './database-data-plane-api-contracts-access.ts';
import {
  DatabaseAutomationRequestSchema,
  DatabaseAutomationResponseSchema,
  DatabaseTemplateRunsRequestSchema,
  DatabaseTemplateRunsResponseSchema,
} from './database-data-plane-api-contracts-automation.ts';
import { DatabaseAgentRunsResponseSchema } from './database-data-plane-api-contracts-operation-responses.ts';
import { DATABASE_INTERNAL_ERROR_EXTENSIONS } from './database-data-plane-api-contracts-read-requests.ts';
import type {
  DatabaseDataPlaneApiHandlerContext,
  DatabaseDataPlaneApiHandlers,
} from './database-data-plane-api-handler-context.ts';
import {
  noStoreHeaders,
  respondAgentPromptRetentionError,
  respondAgentRunStoreError,
  respondDataPlaneError,
  respondUnavailable,
} from './database-data-plane-api-response.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import { type DatabasePlanArtifact, DatabasePlanError } from './database-plan-artifacts.ts';
import { DATABASE_REQUEST_ERROR_EXTENSIONS } from './database-problem.ts';
import { withValidation } from './http/request-validation.ts';
import { successResponse } from './http/success-response.ts';

export function createDatabaseAgentAutomationHandlers({
  dataPlane,
  agentRunStore,
  templateScheduler,
  automationService,
  automationNotificationStore,
  promptRetentionStore,
}: DatabaseDataPlaneApiHandlerContext): Pick<
  DatabaseDataPlaneApiHandlers,
  'runs' | 'templateRuns' | 'automations'
> {
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

  return { runs, templateRuns, automations };
}
