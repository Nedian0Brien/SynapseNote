import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { z } from 'zod';
import { type DatabaseFilter, DatabaseFilterSchema } from './query.ts';
import {
  DatabaseIdSchema,
  DatabasePropertyIdSchema,
  DatabaseRecordIdSchema,
  DatabaseViewIdSchema,
  DataSourceIdSchema,
} from './stable-ids.ts';

const PrincipalIdSchema = z.string().trim().min(1).max(256);
const RevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const DATABASE_PERMISSION_ACTIONS = [
  'catalog',
  'describe',
  'read_record',
  'search',
  'query',
  'aggregate',
  'expand_relation',
  'pack_context',
  'read_audit',
  'create_database',
  'delete_database',
  'alter_schema',
  'create_record',
  'update_record',
  'delete_record',
  'run_automation',
  'external_egress',
  'manage_permissions',
  'publish',
] as const;
export type DatabasePermissionAction = (typeof DATABASE_PERMISSION_ACTIONS)[number];

export const DATABASE_PERMISSION_ROLES = ['view_only', 'content_editor', 'custom'] as const;
export type DatabasePermissionRole = (typeof DATABASE_PERMISSION_ROLES)[number];

const DATABASE_VIEW_ONLY_ACTIONS: readonly DatabasePermissionAction[] = [
  'catalog',
  'describe',
  'read_record',
  'search',
  'query',
  'aggregate',
  'expand_relation',
  'pack_context',
];

/** Canonical role expansion. Callers persist both role and these exact actions. */
export function databasePermissionRoleActions(
  role: Exclude<DatabasePermissionRole, 'custom'>,
): readonly DatabasePermissionAction[] {
  return role === 'view_only'
    ? DATABASE_VIEW_ONLY_ACTIONS
    : [...DATABASE_VIEW_ONLY_ACTIONS, 'create_record', 'update_record', 'delete_record'];
}

export const DatabaseAccessPrincipalSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('user'), id: PrincipalIdSchema }).strict(),
    z
      .object({
        kind: z.literal('agent'),
        id: PrincipalIdSchema,
        invokingUserId: PrincipalIdSchema,
        sessionId: z.string().trim().min(1).max(256),
      })
      .strict(),
  ])
  .superRefine((principal, context) => {
    if (principal.kind === 'agent' && principal.id === principal.invokingUserId) {
      context.addIssue({
        code: 'custom',
        message: 'An agent principal must be distinct from its invoking user',
        path: ['id'],
      });
    }
  });
export type DatabaseAccessPrincipal = z.infer<typeof DatabaseAccessPrincipalSchema>;

export const DATABASE_ACCESS_LAYER_KINDS = [
  'user_permission',
  'agent_capability',
  'agent_view_policy',
  'session_delegation',
] as const;
export type DatabaseAccessLayerKind = (typeof DATABASE_ACCESS_LAYER_KINDS)[number];

const nullableAllowList = <T extends z.ZodType>(item: T) =>
  z.array(item).max(100_000).nullable().default(null);

export const DatabaseAccessScopeSchema = z
  .object({
    workspace: z.boolean(),
    databaseIds: nullableAllowList(DatabaseIdSchema),
    sourceIds: nullableAllowList(DataSourceIdSchema),
    viewIds: nullableAllowList(DatabaseViewIdSchema),
    recordIds: nullableAllowList(DatabaseRecordIdSchema),
    rowFilter: DatabaseFilterSchema.nullable().default(null),
    propertyIds: nullableAllowList(DatabasePropertyIdSchema),
    allowBody: z.boolean(),
    actions: z.array(z.enum(DATABASE_PERMISSION_ACTIONS)).max(DATABASE_PERMISSION_ACTIONS.length),
    notBefore: z.string().datetime({ offset: true }).nullable().default(null),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict()
  .superRefine((scope, context) => {
    for (const key of [
      'databaseIds',
      'sourceIds',
      'viewIds',
      'recordIds',
      'propertyIds',
      'actions',
    ] as const) {
      const values = scope[key];
      if (values !== null && new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', path: [key], message: `${key} must be unique` });
      }
    }
    if (
      scope.notBefore !== null &&
      scope.expiresAt !== null &&
      Date.parse(scope.notBefore) >= Date.parse(scope.expiresAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['notBefore'],
        message: 'notBefore must precede expiresAt',
      });
    }
  });
export type DatabaseAccessScope = z.infer<typeof DatabaseAccessScopeSchema>;

export const DatabaseAccessLayerSchema = z
  .object({
    kind: z.enum(DATABASE_ACCESS_LAYER_KINDS),
    id: z.string().trim().min(1).max(256),
    revision: RevisionSchema,
    principalId: PrincipalIdSchema,
    scope: DatabaseAccessScopeSchema,
  })
  .strict();
export type DatabaseAccessLayer = z.infer<typeof DatabaseAccessLayerSchema>;

export interface EffectiveDatabaseAccess extends DatabaseAccessScope {
  principal: DatabaseAccessPrincipal;
  policyId: string;
  policyRevision: string;
  complete: boolean;
  active: boolean;
  reasons: readonly string[];
  layerReceipts: readonly Pick<DatabaseAccessLayer, 'kind' | 'id' | 'revision' | 'principalId'>[];
}

export const DatabaseAccessRequestSchema = z
  .object({
    action: z.enum(DATABASE_PERMISSION_ACTIONS),
    databaseId: DatabaseIdSchema.optional(),
    sourceId: DataSourceIdSchema.optional(),
    viewId: DatabaseViewIdSchema.optional(),
    recordIds: z.array(DatabaseRecordIdSchema).max(100_000).optional(),
    propertyIds: z.array(DatabasePropertyIdSchema).max(100_000).optional(),
    includeBody: z.boolean().optional(),
  })
  .strict();
export type DatabaseAccessRequest = z.infer<typeof DatabaseAccessRequestSchema>;

export interface DatabaseAccessDecision {
  allowed: boolean;
  reasons: readonly string[];
  policyId: string;
  policyRevision: string;
  rowFilter: DatabaseFilter | null;
  allowedRecordIds: readonly string[] | null;
  allowedPropertyIds: readonly string[] | null;
  allowBody: boolean;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(stableJson(value))))}`;
}

function intersectAllowLists<T extends string>(
  lists: readonly (readonly T[] | null)[],
): T[] | null {
  const constrained = lists.filter((list): list is readonly T[] => list !== null);
  if (constrained.length === 0) return null;
  const [first = [], ...rest] = constrained;
  return [...new Set(first)]
    .filter((value) => rest.every((list) => list.includes(value)))
    .sort((left, right) => left.localeCompare(right));
}

function combinedRowFilter(layers: readonly DatabaseAccessLayer[]): DatabaseFilter | null {
  const filters = layers
    .map(({ scope }) => scope.rowFilter)
    .filter((filter): filter is DatabaseFilter => filter !== null);
  if (filters.length === 0) return null;
  if (filters.length === 1) return structuredClone(filters[0] as DatabaseFilter);
  return DatabaseFilterSchema.parse({ and: filters });
}

function requiredLayerKinds(
  principal: DatabaseAccessPrincipal,
): readonly DatabaseAccessLayerKind[] {
  return principal.kind === 'agent' ? DATABASE_ACCESS_LAYER_KINDS : (['user_permission'] as const);
}

function expectedLayerPrincipal(
  principal: DatabaseAccessPrincipal,
  kind: DatabaseAccessLayerKind,
): string {
  if (principal.kind === 'user') return principal.id;
  return kind === 'user_permission' ? principal.invokingUserId : principal.id;
}

/**
 * Fail-closed intersection of user permission, agent capability, Agent View
 * policy, and session delegation. A missing, duplicate, or mis-bound layer
 * produces an empty effective scope with content-free diagnostics.
 */
export function resolveEffectiveDatabaseAccess(input: {
  principal: DatabaseAccessPrincipal;
  layers: readonly DatabaseAccessLayer[];
  now?: Date;
}): EffectiveDatabaseAccess {
  const principal = DatabaseAccessPrincipalSchema.parse(input.principal);
  const parsedLayers = input.layers.map((layer) => DatabaseAccessLayerSchema.parse(layer));
  const required = requiredLayerKinds(principal);
  const reasons: string[] = [];
  const layers: DatabaseAccessLayer[] = [];
  for (const kind of required) {
    const candidates = parsedLayers.filter((layer) => layer.kind === kind);
    if (candidates.length === 0) reasons.push(`missing_${kind}`);
    if (candidates.length > 1) reasons.push(`duplicate_${kind}`);
    const layer = candidates[0];
    if (!layer) continue;
    if (layer.principalId !== expectedLayerPrincipal(principal, kind)) {
      reasons.push(`principal_mismatch_${kind}`);
      continue;
    }
    layers.push(layer);
  }
  const now = (input.now ?? new Date()).getTime();
  const notBeforeTimes = layers
    .map(({ scope }) => scope.notBefore)
    .filter((value): value is string => value !== null)
    .map(Date.parse);
  const expiryTimes = layers
    .map(({ scope }) => scope.expiresAt)
    .filter((value): value is string => value !== null)
    .map(Date.parse);
  const notBefore =
    notBeforeTimes.length > 0 ? new Date(Math.max(...notBeforeTimes)).toISOString() : null;
  const expiresAt =
    expiryTimes.length > 0 ? new Date(Math.min(...expiryTimes)).toISOString() : null;
  if (notBefore !== null && Date.parse(notBefore) > now) reasons.push('not_active');
  if (expiresAt !== null && Date.parse(expiresAt) <= now) reasons.push('expired');
  const complete = reasons.every((reason) => reason === 'not_active' || reason === 'expired');
  const active = complete && !reasons.includes('not_active') && !reasons.includes('expired');
  const effectiveLayers = complete ? layers : [];
  const canonicalLayers = [...parsedLayers].sort(
    (left, right) =>
      DATABASE_ACCESS_LAYER_KINDS.indexOf(left.kind) -
        DATABASE_ACCESS_LAYER_KINDS.indexOf(right.kind) ||
      left.id.localeCompare(right.id) ||
      left.revision.localeCompare(right.revision) ||
      left.principalId.localeCompare(right.principalId),
  );
  const layerReceipts = canonicalLayers.map(({ kind, id, revision, principalId }) => ({
    kind,
    id,
    revision,
    principalId,
  }));
  const policyDigest = digest({ principal, layerReceipts });
  const policyId = `dbpolicy_${policyDigest.slice('sha256:'.length, 'sha256:'.length + 24)}`;
  const policyRevision = digest({
    principal,
    layers: canonicalLayers,
    reasons,
    notBefore,
    expiresAt,
  });
  const denyAll = !complete;
  return {
    principal: structuredClone(principal),
    policyId,
    policyRevision,
    complete,
    active,
    reasons: [...new Set(reasons)].sort(),
    layerReceipts,
    workspace: denyAll ? false : effectiveLayers.every(({ scope }) => scope.workspace),
    databaseIds: denyAll
      ? []
      : intersectAllowLists(effectiveLayers.map(({ scope }) => scope.databaseIds)),
    sourceIds: denyAll
      ? []
      : intersectAllowLists(effectiveLayers.map(({ scope }) => scope.sourceIds)),
    viewIds: denyAll ? [] : intersectAllowLists(effectiveLayers.map(({ scope }) => scope.viewIds)),
    recordIds: denyAll
      ? []
      : intersectAllowLists(effectiveLayers.map(({ scope }) => scope.recordIds)),
    rowFilter: denyAll ? null : combinedRowFilter(effectiveLayers),
    propertyIds: denyAll
      ? []
      : intersectAllowLists(effectiveLayers.map(({ scope }) => scope.propertyIds)),
    allowBody: !denyAll && effectiveLayers.every(({ scope }) => scope.allowBody),
    actions: denyAll
      ? []
      : (intersectAllowLists(effectiveLayers.map(({ scope }) => scope.actions)) ?? []),
    notBefore,
    expiresAt,
  };
}

/** Evaluate one exact operation without widening the effective scope. */
export function evaluateEffectiveDatabaseAccess(
  access: EffectiveDatabaseAccess,
  request: DatabaseAccessRequest,
): DatabaseAccessDecision {
  request = DatabaseAccessRequestSchema.parse(request);
  const reasons = [...access.reasons];
  if (!access.complete) reasons.push('policy_incomplete');
  if (!access.active) reasons.push('policy_inactive');
  if (!access.workspace) reasons.push('workspace_denied');
  if (!access.actions.includes(request.action)) reasons.push('action_denied');
  const check = (value: string | undefined, allowed: readonly string[] | null, reason: string) => {
    if (value !== undefined && allowed !== null && !allowed.includes(value)) reasons.push(reason);
  };
  check(request.databaseId, access.databaseIds, 'database_denied');
  check(request.sourceId, access.sourceIds, 'source_denied');
  check(request.viewId, access.viewIds, 'view_denied');
  if (
    request.recordIds?.some(
      (recordId) => access.recordIds !== null && !access.recordIds.includes(recordId),
    )
  ) {
    reasons.push('record_denied');
  }
  if (
    request.propertyIds?.some(
      (propertyId) => access.propertyIds !== null && !access.propertyIds.includes(propertyId),
    )
  ) {
    reasons.push('property_denied');
  }
  if (request.includeBody && !access.allowBody) reasons.push('body_denied');
  const uniqueReasons = [...new Set(reasons)].sort();
  return {
    allowed: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    policyId: access.policyId,
    policyRevision: access.policyRevision,
    rowFilter: access.rowFilter ? structuredClone(access.rowFilter) : null,
    allowedRecordIds: access.recordIds === null ? null : [...access.recordIds],
    allowedPropertyIds: access.propertyIds === null ? null : [...access.propertyIds],
    allowBody: access.allowBody,
  };
}
