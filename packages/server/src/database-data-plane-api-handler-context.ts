import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseAgentPromptRetentionStore } from './database-agent-prompt-retention.ts';
import type { DatabaseAgentRunStore } from './database-agent-run-store.ts';
import type { DatabaseAutomationService } from './database-automation.ts';
import type { DatabaseAutomationNotificationStore } from './database-automation-notification-store.ts';
import type { DatabaseAutonomyStore } from './database-autonomy-store.ts';
import type { DatabaseDataPlaneHandlerPort } from './database-data-plane-contracts.ts';
import type { DatabaseAgentEntryPointLimiter } from './database-entry-point-limits.ts';
import type { DatabasePermissionStore } from './database-permission-store.ts';
import type { DatabasePlaceSearchService } from './database-place-search.ts';
import type { DatabaseTaskService } from './database-task-service.ts';
import type { DatabaseTaskStore } from './database-task-store.ts';
import type { DatabaseTemplateScheduler } from './database-template-scheduler.ts';

export type DatabaseDataPlaneApiHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

export interface DatabaseDataPlaneApiHandlers {
  catalog: DatabaseDataPlaneApiHandler;
  describe: DatabaseDataPlaneApiHandler;
  record: DatabaseDataPlaneApiHandler;
  markdownTableExport: DatabaseDataPlaneApiHandler;
  computedPropertyPreview: DatabaseDataPlaneApiHandler;
  propertyConversion: DatabaseDataPlaneApiHandler;
  find: DatabaseDataPlaneApiHandler;
  retrieve: DatabaseDataPlaneApiHandler;
  query: DatabaseDataPlaneApiHandler;
  formSubmit: DatabaseDataPlaneApiHandler;
  pack: DatabaseDataPlaneApiHandler;
  inspect: DatabaseDataPlaneApiHandler;
  plan: DatabaseDataPlaneApiHandler;
  button: DatabaseDataPlaneApiHandler;
  placeSearch: DatabaseDataPlaneApiHandler;
  commit: DatabaseDataPlaneApiHandler;
  markdownTableMutation: DatabaseDataPlaneApiHandler;
  runs: DatabaseDataPlaneApiHandler;
  templateRuns: DatabaseDataPlaneApiHandler;
  automations: DatabaseDataPlaneApiHandler;
  autonomy: DatabaseDataPlaneApiHandler;
  permissions: DatabaseDataPlaneApiHandler;
  publicShares: DatabaseDataPlaneApiHandler;
  undo: DatabaseDataPlaneApiHandler;
  repair: DatabaseDataPlaneApiHandler;
  task: DatabaseDataPlaneApiHandler;
  diagnostics: DatabaseDataPlaneApiHandler;
}

/** Immutable service dependencies shared by one HTTP handler assembly. */
export interface DatabaseDataPlaneApiHandlerContext {
  dataPlane?: DatabaseDataPlaneHandlerPort;
  taskStore?: DatabaseTaskStore;
  taskService?: DatabaseTaskService;
  autonomyStore?: DatabaseAutonomyStore;
  agentRunStore?: DatabaseAgentRunStore;
  placeSearchService?: DatabasePlaceSearchService;
  templateScheduler?: DatabaseTemplateScheduler;
  automationService?: DatabaseAutomationService;
  automationNotificationStore?: DatabaseAutomationNotificationStore;
  permissionStore?: DatabasePermissionStore;
  promptRetentionStore?: DatabaseAgentPromptRetentionStore;
  agentEntryPointLimiter: DatabaseAgentEntryPointLimiter;
}
