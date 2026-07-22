import {
  DATABASE_PERMISSION_ACTIONS,
  DATABASE_PERMISSION_ROLES,
  type DatabasePermissionAction,
  type DatabasePermissionRole,
  databasePermissionRoleActions,
} from '@nedian0brien/synapsenote-core';

export interface DatabasePermissionGrant {
  id: string;
  databaseId: string | null;
  principalId: string;
  role: DatabasePermissionRole;
  actions: DatabasePermissionAction[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabasePermissionSnapshot {
  grants: DatabasePermissionGrant[];
  revision: string;
}

export class DatabasePermissionsClientError extends Error {
  readonly status: number;
  readonly problem: unknown;

  constructor(message: string, status: number, problem: unknown) {
    super(message);
    this.name = 'DatabasePermissionsClientError';
    this.status = status;
    this.problem = problem;
  }
}

function isRevision(value: unknown): value is string {
  return (
    value === 'sha256:empty' || (typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value))
  );
}

function parseGrant(value: unknown): DatabasePermissionGrant {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabasePermissionsClientError('Invalid database permission grant', 502, value);
  }
  const grant = value as Record<string, unknown>;
  const actionSet = new Set<string>(DATABASE_PERMISSION_ACTIONS);
  const roleSet = new Set<string>(DATABASE_PERMISSION_ROLES);
  if (
    typeof grant.id !== 'string' ||
    !/^dbgrant_[a-f0-9-]{36}$/.test(grant.id) ||
    (grant.databaseId !== null &&
      (typeof grant.databaseId !== 'string' || !grant.databaseId.startsWith('db_'))) ||
    typeof grant.principalId !== 'string' ||
    typeof grant.role !== 'string' ||
    !roleSet.has(grant.role) ||
    !Array.isArray(grant.actions) ||
    grant.actions.length === 0 ||
    grant.actions.some((action) => typeof action !== 'string' || !actionSet.has(action)) ||
    typeof grant.createdBy !== 'string' ||
    typeof grant.createdAt !== 'string' ||
    typeof grant.updatedAt !== 'string'
  ) {
    throw new DatabasePermissionsClientError('Incomplete database permission grant', 502, value);
  }
  if (grant.role !== 'custom') {
    const expected = [
      ...databasePermissionRoleActions(grant.role as 'view_only' | 'content_editor'),
    ].sort();
    const actual = [...(grant.actions as string[])].sort();
    if (
      expected.length !== actual.length ||
      expected.some((action, index) => action !== actual[index])
    ) {
      throw new DatabasePermissionsClientError(
        'Database permission role actions do not match',
        502,
        value,
      );
    }
  }
  return grant as unknown as DatabasePermissionGrant;
}

async function post(
  body: unknown,
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal },
) {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && 'detail' in value && typeof value.detail === 'string'
        ? value.detail
        : `HTTP ${response.status}`;
    throw new DatabasePermissionsClientError(message, response.status, value);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabasePermissionsClientError('Invalid database permissions response', 502, value);
  }
  return value as Record<string, unknown>;
}

export async function fetchDatabasePermissions(
  databaseId: string,
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<DatabasePermissionSnapshot> {
  const value = await post({ action: 'list', databaseId }, options);
  if (value.action !== 'list' || !Array.isArray(value.grants) || !isRevision(value.revision)) {
    throw new DatabasePermissionsClientError('Invalid database permissions list', 502, value);
  }
  return { grants: value.grants.map(parseGrant), revision: value.revision };
}

export async function saveDatabasePermission(
  input: {
    grantId?: string;
    databaseId: string | null;
    principalId: string;
    role: DatabasePermissionRole;
    actions: readonly DatabasePermissionAction[];
    expectedRevision: string;
  },
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<{ grant: DatabasePermissionGrant; revision: string }> {
  const value = await post({ action: 'upsert', ...input }, options);
  if (value.action !== 'upsert' || !isRevision(value.revision)) {
    throw new DatabasePermissionsClientError('Invalid database permission update', 502, value);
  }
  return { grant: parseGrant(value.grant), revision: value.revision };
}

export async function removeDatabasePermission(
  input: { grantId: string; expectedRevision: string },
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<{ grantId: string; revision: string }> {
  const value = await post({ action: 'remove', ...input }, options);
  if (value.action !== 'remove' || value.grantId !== input.grantId || !isRevision(value.revision)) {
    throw new DatabasePermissionsClientError('Invalid database permission removal', 502, value);
  }
  return { grantId: input.grantId, revision: value.revision };
}
