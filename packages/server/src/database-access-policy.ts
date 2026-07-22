import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  DATABASE_PERMISSION_ACTIONS,
  type DatabaseAccessLayer,
  type DatabaseAccessScope,
  type DatabasePermissionAction,
  evaluateEffectiveDatabaseAccess,
  resolveEffectiveDatabaseAccess,
} from '@nedian0brien/synapsenote-core';
import { validateAgentId } from './agent-id.ts';
import type {
  ResolveDatabaseGlobalAccess,
  ResolveDatabaseQueryAccess,
} from './database-data-plane.ts';
import type { DatabasePermissionState } from './database-permission-store.ts';

export const DATABASE_AGENT_ID_HEADER = 'x-synapsenote-agent-id';

export function databaseAccessHeaders(
  identity: { connectionId: string } | undefined,
): Record<string, string> | undefined {
  return identity ? { [DATABASE_AGENT_ID_HEADER]: identity.connectionId } : undefined;
}

export function resolveDatabaseAccessPrincipal(request: IncomingMessage, invokingUserId: string) {
  const rawAgentId = request.headers[DATABASE_AGENT_ID_HEADER];
  const agentId = validateAgentId(Array.isArray(rawAgentId) ? rawAgentId[0] : rawAgentId);
  return agentId
    ? {
        kind: 'agent' as const,
        id: `agent:${agentId}`,
        invokingUserId,
        sessionId: agentId,
      }
    : { kind: 'user' as const, id: invokingUserId };
}

const AGENT_READ_ACTIONS: readonly DatabasePermissionAction[] = [
  'catalog',
  'describe',
  'read_record',
  'search',
  'query',
  'aggregate',
  'expand_relation',
  'pack_context',
  'read_audit',
];

function revision(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function scope(
  actions: readonly DatabasePermissionAction[],
  overrides: Partial<DatabaseAccessScope> = {},
): DatabaseAccessScope {
  return {
    workspace: true,
    databaseIds: null,
    sourceIds: null,
    viewIds: null,
    recordIds: null,
    rowFilter: null,
    propertyIds: null,
    allowBody: true,
    actions: [...actions],
    notBefore: null,
    expiresAt: null,
    ...overrides,
  };
}

function layer(
  kind: DatabaseAccessLayer['kind'],
  principalId: string,
  layerScope: DatabaseAccessScope,
): DatabaseAccessLayer {
  const identity = { kind, principalId, scope: layerScope };
  return {
    kind,
    id: `builtin:${kind}`,
    revision: revision(identity),
    principalId,
    scope: layerScope,
  };
}

/**
 * Standalone-local policy adapter. It preserves unrestricted project-owner
 * reads while ensuring MCP agents pass through all four independently
 * receipted layers. A selected view narrows the agent projection and row
 * predicate; request JSON cannot supply or widen any layer.
 */
export function createDefaultDatabaseQueryAccessResolver(
  options: {
    ownerPrincipalId?: () => string | null;
    permissionState?: () => DatabasePermissionState;
  } = {},
): ResolveDatabaseQueryAccess {
  return (input) => {
    const principal = input.principal;
    const userId = principal.kind === 'agent' ? principal.invokingUserId : principal.id;
    const ownerPrincipalId = options.ownerPrincipalId?.() ?? 'user:local-owner';
    const permissionState = options.permissionState?.();
    const userActions =
      !permissionState || userId === ownerPrincipalId
        ? DATABASE_PERMISSION_ACTIONS
        : [
            ...new Set(
              Object.values(permissionState.grants)
                .filter(
                  (grant) =>
                    grant.principalId === userId &&
                    (grant.databaseId === null || grant.databaseId === input.database.id),
                )
                .flatMap((grant) => grant.actions),
            ),
          ].sort();
    const userPermission = layer(
      'user_permission',
      userId,
      scope(userActions, {
        databaseIds: [input.database.id],
        sourceIds: [input.source.id],
      }),
    );
    const layers: DatabaseAccessLayer[] = [userPermission];
    if (principal.kind === 'agent') {
      layers.push(
        layer('agent_capability', principal.id, scope(AGENT_READ_ACTIONS)),
        layer(
          'agent_view_policy',
          principal.id,
          scope(AGENT_READ_ACTIONS, {
            viewIds: input.view ? [input.view.id] : null,
            rowFilter: input.view?.where ?? null,
            propertyIds: input.view ? [...input.view.projection.propertyIds] : null,
            allowBody: input.view ? input.view.projection.body !== 'hidden' : true,
          }),
        ),
        layer('session_delegation', principal.id, scope(AGENT_READ_ACTIONS)),
      );
    }
    const effective = resolveEffectiveDatabaseAccess({ principal, layers });
    const decision = evaluateEffectiveDatabaseAccess(effective, {
      action: input.action,
      databaseId: input.database.id,
      sourceId: input.source.id,
      ...(input.view ? { viewId: input.view.id } : {}),
    });
    return {
      allowed: decision.allowed,
      policyId: decision.policyId,
      policyRevision: decision.policyRevision,
      allowedRecordIds: decision.allowed ? decision.allowedRecordIds : [],
      allowedPropertyIds: decision.allowed ? decision.allowedPropertyIds : [],
      allowBody: decision.allowed && decision.allowBody,
    };
  };
}

/** Resolve workspace-scoped create and permission-management actions. */
export function createDefaultDatabaseGlobalAccessResolver(options: {
  ownerPrincipalId: () => string | null;
  permissionState: () => DatabasePermissionState;
}): ResolveDatabaseGlobalAccess {
  return ({ action, principal }) => {
    const userId = principal.kind === 'agent' ? principal.invokingUserId : principal.id;
    const state = options.permissionState();
    const owner = userId === (options.ownerPrincipalId() ?? 'user:local-owner');
    const grantedActions = new Set(
      Object.values(state.grants)
        .filter((grant) => grant.databaseId === null && grant.principalId === userId)
        .flatMap((grant) => grant.actions),
    );
    const allowed = (owner || grantedActions.has(action)) && principal.kind === 'user';
    return {
      allowed,
      policyId: `dbglobal_${revision({ principal, owner, stateRevision: state.revision }).slice(7, 31)}`,
      policyRevision: revision({
        principal,
        owner,
        stateRevision: state.revision,
        action,
        allowed,
      }),
    };
  };
}
