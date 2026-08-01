import { z } from 'zod';
import {
  DatabaseAutomationEventSchema,
  DatabaseAutomationRunSchema,
} from './database-automation.ts';
import { DatabaseAutomationNotificationSchema } from './database-automation-notification-store.ts';
import { DatabaseTemplateRunSchema } from './database-template-scheduler.ts';

export const DatabaseTemplateRunsRequestSchema = z
  .object({
    databaseId: z.string().startsWith('db_').optional(),
    templateId: z.string().startsWith('tpl_').optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();
export const DatabaseTemplateRunsResponseSchema = z
  .object({ runs: z.array(DatabaseTemplateRunSchema).max(500) })
  .strict();

const DatabaseAutomationTestEventSchema = z
  .object({
    deduplicationKey: z.string().min(1).max(256),
    databaseId: z.string().startsWith('db_'),
    kind: z.enum([
      'record_added',
      'property_changed',
      'schedule',
      'form_submitted',
      'button_invoked',
    ]),
    occurredAt: z.string().datetime().optional(),
    sourceId: z.string().startsWith('ds_').nullable().optional(),
    recordId: z.string().startsWith('rec_').nullable().optional(),
    recordRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    propertyId: z.string().startsWith('prop_').nullable().optional(),
    viewId: z.string().startsWith('view_').nullable().optional(),
    buttonId: z.string().startsWith('dbbtn_').nullable().optional(),
    scheduledFor: z.string().datetime().nullable().optional(),
  })
  .strict();

export const DatabaseAutomationRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      databaseId: z.string().startsWith('db_').optional(),
      automationId: z.string().startsWith('auto_').optional(),
      limit: z.number().int().min(1).max(500).default(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('dry_run'),
      databaseId: z.string().startsWith('db_'),
      automationId: z.string().startsWith('auto_'),
      event: DatabaseAutomationTestEventSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('test_event'),
      databaseId: z.string().startsWith('db_'),
      automationId: z.string().startsWith('auto_'),
      event: DatabaseAutomationTestEventSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('notifications'),
      recipientId: z.string().startsWith('person_').optional(),
      unreadOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(500).default(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('mark_notification_read'),
      notificationId: z.string().startsWith('autonote_'),
    })
    .strict(),
]);

const DatabaseAutomationPlanSummarySchema = z
  .object({
    automationId: z.string().startsWith('auto_'),
    automationVersion: z.number().int().positive(),
    internalPlan: z
      .object({
        id: z.string().startsWith('plan_'),
        hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        committable: z.boolean(),
        migrationRequired: z.boolean(),
        risk: z.object({
          level: z.enum(['low', 'medium', 'high']),
          reasons: z.array(z.string()),
        }),
        records: z
          .object({
            creates: z.number().int().nonnegative(),
            updates: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    notifications: z.array(
      z
        .object({
          actionId: z.string(),
          recipientIds: z.array(z.string()),
          title: z.string(),
        })
        .strict(),
    ),
    external: z.array(
      z
        .object({
          actionId: z.string(),
          kind: z.enum(['external_webhook', 'external_email']),
          connectionId: z.string().startsWith('conn_'),
          egressBytes: z.number().int().nonnegative(),
          policyId: z.string(),
          policyRevision: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const DatabaseAutomationResponseSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      runs: z.array(DatabaseAutomationRunSchema).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal('dry_run'),
      plan: DatabaseAutomationPlanSummarySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('test_event'),
      event: DatabaseAutomationEventSchema,
      runs: z.array(DatabaseAutomationRunSchema).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal('notifications'),
      notifications: z.array(DatabaseAutomationNotificationSchema).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal('mark_notification_read'),
      notificationId: z.string().startsWith('autonote_'),
    })
    .strict(),
]);

export type DatabaseAutomationRequest = z.infer<typeof DatabaseAutomationRequestSchema>;
export type DatabaseAutomationResponse = z.infer<typeof DatabaseAutomationResponseSchema>;
export type DatabaseTemplateRunsRequest = z.infer<typeof DatabaseTemplateRunsRequestSchema>;
export type DatabaseTemplateRunsResponse = z.infer<typeof DatabaseTemplateRunsResponseSchema>;
