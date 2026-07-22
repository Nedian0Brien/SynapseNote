import { createHash, randomUUID } from 'node:crypto';
import type {
  DatabaseButtonAction,
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import type {
  DatabaseDesiredStateDraftInput,
  DatabasePlanArtifact,
  DatabasePlanEngine,
} from './database-plan.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';

export const DatabaseButtonPlanInputSchema = z.union([
  z
    .object({
      databaseId: z.string().startsWith('db_'),
      sourceId: z.string().startsWith('ds_'),
      recordId: z.string().startsWith('rec_'),
      propertyId: z.string().startsWith('prop_'),
      expectedRecordRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      databaseId: z.string().startsWith('db_'),
      buttonId: z.string().startsWith('dbbtn_'),
    })
    .strict(),
]);

export type DatabaseButtonPlanInput = z.infer<typeof DatabaseButtonPlanInputSchema>;

export interface DatabaseButtonPermissionRequest {
  databaseId: string;
  sourceId: string;
  recordId?: string;
  action: DatabaseButtonAction['kind'];
  propertyIds: readonly string[];
  touchesBody: boolean;
  connectionId?: string;
}

export interface DatabaseButtonPermissionDecision {
  allowed: boolean;
  policyId: string;
  policyRevision: string;
  reason?: string;
}

export type ResolveDatabaseButtonPermission = (
  request: DatabaseButtonPermissionRequest,
) => DatabaseButtonPermissionDecision;

export interface DatabaseButtonExternalStep {
  actionId: string;
  kind: 'external_webhook';
  connectionId: string;
  eventName: string;
  payload: {
    databaseId: string;
    sourceId: string;
    recordId: string;
    recordRevision: string;
    properties: Readonly<Record<string, unknown>>;
    body?: string;
  };
  egressBytes: number;
}

export interface DatabaseButtonPlan {
  id: string;
  hash: string;
  createdAt: string;
  databaseId: string;
  sourceId: string;
  recordId: string | null;
  propertyId: string | null;
  buttonId: string | null;
  label: string;
  confirmation: { title: string; description?: string } | null;
  expectedRecordRevision: string | null;
  databaseSnapshotRevision: string;
  permissionGuards: readonly {
    actionId: string;
    policyId: string;
    policyRevision: string;
  }[];
  internalPlan: DatabasePlanArtifact | null;
  externalSteps: readonly DatabaseButtonExternalStep[];
  risk: {
    level: 'low' | 'medium' | 'high';
    reasons: readonly string[];
  };
  requiresApproval: boolean;
}

export type DatabaseButtonPlanErrorCode =
  | 'invalid_request'
  | 'database_not_found'
  | 'record_not_found'
  | 'record_scope_mismatch'
  | 'record_revision_changed'
  | 'button_not_found'
  | 'permission_denied'
  | 'invalid_button_action';

export class DatabaseButtonPlanError extends Error {
  readonly code: DatabaseButtonPlanErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseButtonPlanErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseButtonPlanError';
    this.code = code;
    this.details = details;
  }
}

export interface CreateDatabaseButtonPlannerOptions {
  databaseStore: DatabaseStore;
  databaseRecordIndex: DatabaseRecordIndex;
  databasePlanEngine: DatabasePlanEngine;
  resolvePermission: ResolveDatabaseButtonPermission;
  now?: () => Date;
  generateUuid?: () => string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}

function compactUuid(generateUuid: () => string): string {
  return generateUuid().replaceAll('-', '');
}

function propertyById(
  source: DatabaseDefinition['sources'][number],
  propertyId: string,
): DatabaseProperty {
  const property = source.properties.find((candidate) => candidate.id === propertyId);
  if (!property) {
    throw new DatabaseButtonPlanError(
      'invalid_button_action',
      `Button action references unknown property "${propertyId}"`,
      { propertyId, sourceId: source.id },
    );
  }
  return property;
}

export function databaseDesiredStateBase(
  definition: DatabaseDefinition,
): Omit<DatabaseDesiredStateDraftInput, 'sampleRecords' | 'recordMutations' | 'recordArchives'> {
  const sourceKeyById = new Map(definition.sources.map((source) => [source.id, source.key]));
  const viewKeyById = new Map(definition.views.map((view) => [view.id, view.key]));
  return {
    database: {
      id: definition.id,
      key: definition.key,
      name: definition.name,
      ...(definition.description ? { description: definition.description } : {}),
      ...(definition.icon ? { icon: definition.icon } : {}),
      ...(definition.cover ? { cover: definition.cover } : {}),
      aliases: [...definition.aliases],
      people: structuredClone(definition.people),
      contract: structuredClone(definition.contract),
    },
    sources: structuredClone(definition.sources),
    sourceMappings: definition.sourceMappings?.map((mapping) => {
      const source = definition.sources.find((candidate) => candidate.id === mapping.sourceId);
      const target = definition.sources.find(
        (candidate) => candidate.id === mapping.targetSourceId,
      );
      if (!source || !target) throw new Error('Button plan found an invalid source mapping');
      return {
        sourceKey: source.key,
        targetSourceKey: target.key,
        propertyMappings: mapping.propertyMappings.map((propertyMapping) => {
          const sourceProperty = propertyById(source, propertyMapping.sourcePropertyId);
          const targetProperty = propertyById(target, propertyMapping.targetPropertyId);
          return {
            sourcePropertyKey: sourceProperty.key,
            targetPropertyKey: targetProperty.key,
            optionMappings: propertyMapping.optionMappings.map((optionMapping) => {
              const sourceOption =
                'options' in sourceProperty
                  ? sourceProperty.options.find(
                      (option) => option.id === optionMapping.sourceOptionId,
                    )
                  : undefined;
              const targetOption =
                'options' in targetProperty
                  ? targetProperty.options.find(
                      (option) => option.id === optionMapping.targetOptionId,
                    )
                  : undefined;
              if (!sourceOption || !targetOption) {
                throw new Error('Button plan found an invalid option mapping');
              }
              return { sourceOptionKey: sourceOption.key, targetOptionKey: targetOption.key };
            }),
          };
        }),
      };
    }),
    views: definition.views.map((view) => {
      const { sourceId, ...rest } = structuredClone(view);
      return { ...rest, sourceKey: sourceKeyById.get(sourceId) ?? sourceId };
    }),
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 100 },
    templates: definition.templates.map((template) => {
      const source = definition.sources.find((candidate) => candidate.id === template.sourceId);
      if (!source) throw new Error('Button plan found an invalid template source');
      return {
        id: template.id,
        key: template.key,
        name: template.name,
        ...(template.description ? { description: template.description } : {}),
        sourceKey: source.key,
        body: template.body,
        propertyValues: Object.fromEntries(
          Object.entries(template.propertyValues).map(([propertyId, value]) => [
            propertyById(source, propertyId).key,
            structuredClone(value),
          ]),
        ),
        order: template.order,
        archivedAt: template.archivedAt,
        defaultFor: {
          source: template.defaultFor.source,
          viewKeys: template.defaultFor.viewIds.map((viewId) => {
            const viewKey = viewKeyById.get(viewId);
            if (!viewKey) throw new Error('Button plan found an invalid template view');
            return viewKey;
          }),
          entryPoints: [...template.defaultFor.entryPoints],
        },
        ...(template.repeat
          ? {
              repeat: {
                schedule: structuredClone(template.repeat.schedule),
                timeZone: template.repeat.timeZone,
                ownerKey:
                  definition.people.find((person) => person.id === template.repeat?.ownerId)?.key ??
                  template.repeat.ownerId,
                paused: template.repeat.paused,
                retry: structuredClone(template.repeat.retry),
              },
            }
          : {}),
      };
    }),
    buttons: definition.buttons.map((button) => ({
      id: button.id,
      key: button.key,
      name: button.name,
      ...(button.description ? { description: button.description } : {}),
      placement:
        button.placement.kind === 'database'
          ? { kind: 'database' as const }
          : {
              kind: 'source' as const,
              sourceKey: sourceKeyById.get(button.placement.sourceId) ?? button.placement.sourceId,
            },
      ...(button.confirmation ? { confirmation: structuredClone(button.confirmation) } : {}),
      actions: button.actions.map((action) => {
        if (action.kind !== 'create_record') {
          throw new Error('Database-level Button contains an unsupported action');
        }
        const source = definition.sources.find((candidate) => candidate.id === action.sourceId);
        if (!source) throw new Error('Database-level Button references an unknown source');
        return {
          id: action.id,
          kind: action.kind,
          sourceKey: source.key,
          values: Object.fromEntries(
            Object.entries(action.values).map(([propertyId, value]) => [
              propertyById(source, propertyId).key,
              structuredClone(value),
            ]),
          ),
          body: action.body,
        };
      }),
    })),
    automations: structuredClone(definition.automations),
    recordCopies: [],
    recordMoves: [],
    recordDeletions: [],
  };
}

function updateOperation(
  source: DatabaseDefinition['sources'][number],
  operation: Extract<DatabaseButtonAction, { kind: 'update_record' }>['operations'][number],
): Record<string, unknown> {
  if (operation.op === 'append' && operation.propertyId === undefined) {
    return { op: operation.op, value: operation.value };
  }
  const property = propertyById(source, String(operation.propertyId));
  if (operation.op === 'set') {
    return { op: operation.op, propertyKey: property.key, value: operation.value };
  }
  if (operation.op === 'unset') return { op: operation.op, propertyKey: property.key };
  if (operation.op === 'increment') {
    return { op: operation.op, propertyKey: property.key, by: operation.by };
  }
  if (operation.op === 'append') {
    return { op: operation.op, propertyKey: property.key, value: operation.value };
  }
  if (operation.op === 'link' || operation.op === 'unlink') {
    return {
      op: operation.op,
      propertyKey: property.key,
      recordId: operation.recordId,
    };
  }
  if (operation.op === 'add' || operation.op === 'remove') {
    return { op: operation.op, propertyKey: property.key, value: operation.value };
  }
  throw new DatabaseButtonPlanError(
    'invalid_button_action',
    `Unsupported Button mutation operation "${String((operation as { op: unknown }).op)}"`,
  );
}

function propertyIdsForAction(action: DatabaseButtonAction): string[] {
  if (action.kind === 'update_record') {
    return action.operations.flatMap((operation) =>
      operation.op === 'append' && operation.propertyId === undefined
        ? []
        : [String(operation.propertyId)],
    );
  }
  if (action.kind === 'create_record') return Object.keys(action.values);
  if (action.kind === 'external_webhook') return [...action.propertyIds];
  return [];
}

function actionTouchesBody(action: DatabaseButtonAction): boolean {
  return (
    (action.kind === 'update_record' &&
      action.operations.some(
        (operation) => operation.op === 'append' && operation.propertyId === undefined,
      )) ||
    (action.kind === 'create_record' && action.body !== '') ||
    (action.kind === 'external_webhook' && action.includeBody)
  );
}

function externalStep(
  action: Extract<DatabaseButtonAction, { kind: 'external_webhook' }>,
  record: DatabaseRecord,
): DatabaseButtonExternalStep {
  const properties = Object.fromEntries(
    action.propertyIds
      .filter((propertyId) => record.values[propertyId] !== undefined)
      .map((propertyId) => [propertyId, structuredClone(record.values[propertyId])]),
  );
  const payload = {
    databaseId: record.databaseId,
    sourceId: record.sourceId,
    recordId: record.id,
    recordRevision: String(record.revision),
    properties,
    ...(action.includeBody ? { body: record.body } : {}),
  };
  return {
    actionId: action.id,
    kind: action.kind,
    connectionId: action.connectionId,
    eventName: action.eventName,
    payload,
    egressBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
  };
}

export class DatabaseButtonPlanner {
  readonly #databaseStore: DatabaseStore;
  readonly #databaseRecordIndex: DatabaseRecordIndex;
  readonly #databasePlanEngine: DatabasePlanEngine;
  readonly #resolvePermission: ResolveDatabaseButtonPermission;
  readonly #now: () => Date;
  readonly #generateUuid: () => string;

  constructor(options: CreateDatabaseButtonPlannerOptions) {
    this.#databaseStore = options.databaseStore;
    this.#databaseRecordIndex = options.databaseRecordIndex;
    this.#databasePlanEngine = options.databasePlanEngine;
    this.#resolvePermission = options.resolvePermission;
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
  }

  createPlan(rawInput: unknown): DatabaseButtonPlan {
    const parsed = DatabaseButtonPlanInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DatabaseButtonPlanError('invalid_request', 'Button invocation request is invalid', {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    const input = parsed.data;
    const snapshot = this.#databaseStore.snapshot();
    const definition = snapshot.databases.find((candidate) => candidate.id === input.databaseId);
    if (!definition) {
      throw new DatabaseButtonPlanError(
        'database_not_found',
        `Database "${input.databaseId}" was not found`,
      );
    }
    if ('buttonId' in input) {
      const button = definition.buttons.find((candidate) => candidate.id === input.buttonId);
      if (!button) {
        throw new DatabaseButtonPlanError(
          'button_not_found',
          `Database button "${input.buttonId}" was not found`,
        );
      }
      const guards: DatabaseButtonPlan['permissionGuards'][number][] = [];
      for (const action of button.actions) {
        if (action.kind !== 'create_record') {
          throw new DatabaseButtonPlanError(
            'invalid_button_action',
            `Database button action "${action.id}" is not scoped to record creation`,
          );
        }
        const decision = this.#resolvePermission({
          databaseId: definition.id,
          sourceId: action.sourceId,
          action: action.kind,
          propertyIds: Object.keys(action.values),
          touchesBody: action.body !== '',
        });
        if (!decision.allowed) {
          throw new DatabaseButtonPlanError(
            'permission_denied',
            `Database button action "${action.id}" is not allowed by the current permission scope`,
            { actionId: action.id, reason: decision.reason ?? 'denied' },
          );
        }
        guards.push({
          actionId: action.id,
          policyId: decision.policyId,
          policyRevision: decision.policyRevision,
        });
      }
      const desiredState: DatabaseDesiredStateDraftInput = {
        ...databaseDesiredStateBase(definition),
        sampleRecords: button.actions.map((action) => {
          if (action.kind !== 'create_record') {
            throw new DatabaseButtonPlanError(
              'invalid_button_action',
              `Database button action "${action.id}" is unsupported`,
            );
          }
          const source = definition.sources.find((candidate) => candidate.id === action.sourceId);
          if (!source) {
            throw new DatabaseButtonPlanError(
              'invalid_button_action',
              `Database button target source "${action.sourceId}" was not found`,
            );
          }
          return {
            sourceKey: source.key,
            values: Object.fromEntries(
              Object.entries(action.values).map(([propertyId, value]) => [
                propertyById(source, propertyId).key,
                value,
              ]),
            ),
            body: action.body,
          };
        }),
        recordMutations: [],
        recordArchives: [],
      };
      let internalPlan: DatabasePlanArtifact;
      try {
        const draft = this.#databasePlanEngine.createDraft(desiredState);
        internalPlan = this.#databasePlanEngine.createPlan(draft.id);
      } catch (error) {
        throw new DatabaseButtonPlanError(
          'invalid_button_action',
          'Database button actions could not produce a valid exact plan',
          { reason: error instanceof Error ? error.message : String(error) },
          error,
        );
      }
      const createdAt = this.#now().toISOString();
      const id = `buttonplan_${compactUuid(this.#generateUuid)}`;
      const planWithoutHash = {
        id,
        createdAt,
        databaseId: definition.id,
        sourceId:
          button.placement.kind === 'source'
            ? button.placement.sourceId
            : (button.actions[0]?.sourceId ?? definition.sources[0].id),
        recordId: null,
        propertyId: null,
        buttonId: button.id,
        label: button.name,
        confirmation: button.confirmation ?? null,
        expectedRecordRevision: null,
        databaseSnapshotRevision: snapshot.revision,
        permissionGuards: guards,
        internalPlan,
        externalSteps: [],
        risk: {
          level: 'low' as const,
          reasons: button.confirmation ? ['button_confirmation'] : [],
        },
        requiresApproval: true,
      };
      return { ...planWithoutHash, hash: hash(planWithoutHash) };
    }
    const source = definition.sources.find((candidate) => candidate.id === input.sourceId);
    const record = this.#databaseRecordIndex.getById(input.recordId);
    if (!source || !record) {
      throw new DatabaseButtonPlanError(
        'record_not_found',
        `Record "${input.recordId}" was not found`,
      );
    }
    if (record.databaseId !== definition.id || record.sourceId !== source.id) {
      throw new DatabaseButtonPlanError(
        'record_scope_mismatch',
        'Button invocation record is outside the requested database source',
      );
    }
    if (record.revision !== input.expectedRecordRevision) {
      throw new DatabaseButtonPlanError(
        'record_revision_changed',
        'Button invocation record changed after it was displayed',
        {
          expectedRevision: input.expectedRecordRevision,
          observedRevision: record.revision,
        },
      );
    }
    const property = source.properties.find(
      (candidate): candidate is Extract<DatabaseProperty, { type: 'button' }> =>
        candidate.id === input.propertyId && candidate.type === 'button',
    );
    if (!property) {
      throw new DatabaseButtonPlanError(
        'button_not_found',
        `Button property "${input.propertyId}" was not found in the requested source`,
      );
    }

    const guards: DatabaseButtonPlan['permissionGuards'][number][] = [];
    for (const action of property.actions) {
      const decision = this.#resolvePermission({
        databaseId: definition.id,
        sourceId: action.kind === 'create_record' ? action.sourceId : source.id,
        recordId: record.id,
        action: action.kind,
        propertyIds: propertyIdsForAction(action),
        touchesBody: actionTouchesBody(action),
        ...(action.kind === 'external_webhook' ? { connectionId: action.connectionId } : {}),
      });
      if (!decision.allowed) {
        throw new DatabaseButtonPlanError(
          'permission_denied',
          `Button action "${action.id}" is not allowed by the current permission scope`,
          { actionId: action.id, reason: decision.reason ?? 'denied' },
        );
      }
      guards.push({
        actionId: action.id,
        policyId: decision.policyId,
        policyRevision: decision.policyRevision,
      });
    }

    const updateActions = property.actions.filter(
      (action): action is Extract<DatabaseButtonAction, { kind: 'update_record' }> =>
        action.kind === 'update_record',
    );
    const createActions = property.actions.filter(
      (action): action is Extract<DatabaseButtonAction, { kind: 'create_record' }> =>
        action.kind === 'create_record',
    );
    const archiveActions = property.actions.filter(
      (action): action is Extract<DatabaseButtonAction, { kind: 'archive_record' }> =>
        action.kind === 'archive_record',
    );
    if (archiveActions.length > 1) {
      throw new DatabaseButtonPlanError(
        'invalid_button_action',
        'One Button invocation cannot archive and restore the same record more than once',
      );
    }
    const hasInternalActions =
      updateActions.length > 0 || createActions.length > 0 || archiveActions.length > 0;
    let internalPlan: DatabasePlanArtifact | null = null;
    if (hasInternalActions) {
      const desiredState: DatabaseDesiredStateDraftInput = {
        ...databaseDesiredStateBase(definition),
        sampleRecords: createActions.map((action) => {
          const target = definition.sources.find((candidate) => candidate.id === action.sourceId);
          if (!target) {
            throw new DatabaseButtonPlanError(
              'invalid_button_action',
              `Button create target source "${action.sourceId}" was not found`,
            );
          }
          return {
            sourceKey: target.key,
            values: Object.fromEntries(
              Object.entries(action.values).map(([propertyId, value]) => [
                propertyById(target, propertyId).key,
                value,
              ]),
            ),
            body: action.body,
          };
        }),
        recordMutations:
          updateActions.length === 0
            ? []
            : [
                {
                  id: record.id,
                  expectedRevision: input.expectedRecordRevision,
                  sourceKey: source.key,
                  operations: updateActions.flatMap((action) =>
                    action.operations.map((operation) => updateOperation(source, operation)),
                  ) as never,
                },
              ],
        recordArchives: archiveActions.map((action) => ({
          id: record.id,
          expectedRevision: input.expectedRecordRevision,
          sourceKey: source.key,
          action: action.action,
        })),
      };
      try {
        const draft = this.#databasePlanEngine.createDraft(desiredState);
        internalPlan = this.#databasePlanEngine.createPlan(draft.id);
      } catch (error) {
        throw new DatabaseButtonPlanError(
          'invalid_button_action',
          'Button database actions could not produce a valid exact plan',
          { reason: error instanceof Error ? error.message : String(error) },
          error,
        );
      }
    }

    const externalSteps = property.actions
      .filter(
        (action): action is Extract<DatabaseButtonAction, { kind: 'external_webhook' }> =>
          action.kind === 'external_webhook',
      )
      .map((action) => externalStep(action, record));
    const createdAt = this.#now().toISOString();
    const id = `buttonplan_${compactUuid(this.#generateUuid)}`;
    const planWithoutHash = {
      id,
      createdAt,
      databaseId: definition.id,
      sourceId: source.id,
      recordId: record.id,
      propertyId: property.id,
      buttonId: null,
      label: property.label,
      confirmation: property.confirmation ?? null,
      expectedRecordRevision: input.expectedRecordRevision,
      databaseSnapshotRevision: snapshot.revision,
      permissionGuards: guards,
      internalPlan,
      externalSteps,
      risk: {
        level: externalSteps.length > 0 ? ('high' as const) : ('low' as const),
        reasons: [
          ...(externalSteps.length > 0 ? ['external_side_effect'] : []),
          ...(property.confirmation ? ['button_confirmation'] : []),
        ],
      },
      requiresApproval: externalSteps.length > 0 || property.confirmation !== undefined,
    };
    return { ...planWithoutHash, hash: hash(planWithoutHash) };
  }
}

export function createDatabaseButtonPlanner(
  options: CreateDatabaseButtonPlannerOptions,
): DatabaseButtonPlanner {
  return new DatabaseButtonPlanner(options);
}
