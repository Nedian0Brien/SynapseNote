import { describe, expect, test } from 'bun:test';
import {
  type DatabaseAccessLayer,
  DatabaseAccessPrincipalSchema,
  type DatabaseAccessScope,
  databasePermissionRoleActions,
  evaluateEffectiveDatabaseAccess,
  resolveEffectiveDatabaseAccess,
} from './permissions.ts';

const revision = (character: string) => `sha256:${character.repeat(64)}`;
const principal = {
  kind: 'agent' as const,
  id: 'agent:codex',
  invokingUserId: 'user:owner',
  sessionId: 'session-1',
};

function scope(input: Partial<DatabaseAccessScope> = {}): DatabaseAccessScope {
  return {
    workspace: true,
    databaseIds: null,
    sourceIds: null,
    viewIds: null,
    recordIds: null,
    rowFilter: null,
    propertyIds: null,
    allowBody: true,
    actions: ['catalog', 'describe', 'search', 'query', 'pack_context', 'update_record'],
    notBefore: null,
    expiresAt: null,
    ...input,
  };
}

function layer(
  kind: DatabaseAccessLayer['kind'],
  character: string,
  accessScope: DatabaseAccessScope,
): DatabaseAccessLayer {
  return {
    kind,
    id: `${kind}:fixture`,
    revision: revision(character),
    principalId: kind === 'user_permission' ? principal.invokingUserId : principal.id,
    scope: accessScope,
  };
}

function completeLayers(): DatabaseAccessLayer[] {
  return [
    layer(
      'user_permission',
      'a',
      scope({
        databaseIds: ['db_tasks', 'db_private'],
        sourceIds: ['ds_tasks'],
        recordIds: ['rec_visible', 'rec_user_only'],
        propertyIds: ['prop_title', 'prop_private'],
      }),
    ),
    layer(
      'agent_capability',
      'b',
      scope({
        databaseIds: ['db_tasks'],
        recordIds: ['rec_visible'],
        propertyIds: ['prop_title'],
        actions: ['catalog', 'describe', 'search', 'query', 'pack_context'],
      }),
    ),
    layer(
      'agent_view_policy',
      'c',
      scope({
        databaseIds: ['db_tasks'],
        sourceIds: ['ds_tasks'],
        viewIds: ['view_agent'],
        rowFilter: { propertyId: 'prop_title', operator: 'contains', value: 'current' },
        propertyIds: ['prop_title'],
        actions: ['search', 'query', 'pack_context'],
      }),
    ),
    layer(
      'session_delegation',
      'd',
      scope({
        databaseIds: ['db_tasks'],
        sourceIds: ['ds_tasks'],
        viewIds: ['view_agent'],
        recordIds: ['rec_visible'],
        propertyIds: ['prop_title'],
        allowBody: false,
        actions: ['query', 'pack_context'],
        notBefore: '2026-07-20T00:00:00.000Z',
        expiresAt: '2026-07-22T00:00:00.000Z',
      }),
    ),
  ];
}

describe('database effective access', () => {
  test('expands named roles without granting schema or permission administration', () => {
    const viewer = databasePermissionRoleActions('view_only');
    const editor = databasePermissionRoleActions('content_editor');
    expect(viewer).toContain('query');
    expect(viewer).not.toContain('update_record');
    expect(editor).toEqual(
      expect.arrayContaining(['query', 'create_record', 'update_record', 'delete_record']),
    );
    for (const denied of [
      'create_database',
      'delete_database',
      'alter_schema',
      'manage_permissions',
      'publish',
    ]) {
      expect(editor).not.toContain(denied);
    }
  });

  test('models an agent as distinct from its invoking user', () => {
    expect(DatabaseAccessPrincipalSchema.parse(principal)).toEqual(principal);
    expect(() =>
      DatabaseAccessPrincipalSchema.parse({
        ...principal,
        id: principal.invokingUserId,
      }),
    ).toThrow(/distinct/i);
  });

  test('intersects all four layers across hierarchy, rows, properties, body, actions, and time', () => {
    const effective = resolveEffectiveDatabaseAccess({
      principal,
      layers: [...completeLayers()].reverse(),
      now: new Date('2026-07-21T00:00:00.000Z'),
    });
    expect(effective).toMatchObject({
      complete: true,
      active: true,
      workspace: true,
      databaseIds: ['db_tasks'],
      sourceIds: ['ds_tasks'],
      viewIds: ['view_agent'],
      recordIds: ['rec_visible'],
      propertyIds: ['prop_title'],
      allowBody: false,
      actions: ['pack_context', 'query'],
      notBefore: '2026-07-20T00:00:00.000Z',
      expiresAt: '2026-07-22T00:00:00.000Z',
      rowFilter: { propertyId: 'prop_title', operator: 'contains', value: 'current' },
    });
    expect(effective.policyId).toMatch(/^dbpolicy_[a-f0-9]{24}$/);
    expect(effective.policyRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(effective.layerReceipts.map(({ kind }) => kind)).toEqual([
      'user_permission',
      'agent_capability',
      'agent_view_policy',
      'session_delegation',
    ]);

    expect(
      evaluateEffectiveDatabaseAccess(effective, {
        action: 'query',
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        viewId: 'view_agent',
        recordIds: ['rec_visible'],
        propertyIds: ['prop_title'],
      }),
    ).toMatchObject({ allowed: true, reasons: [], allowBody: false });
    expect(
      evaluateEffectiveDatabaseAccess(effective, {
        action: 'query',
        databaseId: 'db_private',
        sourceId: 'ds_tasks',
        propertyIds: ['prop_private'],
        includeBody: true,
      }),
    ).toMatchObject({
      allowed: false,
      reasons: ['body_denied', 'database_denied', 'property_denied'],
    });
  });

  test('fails closed for missing, duplicate, mis-bound, inactive, or expired layers', () => {
    const missing = resolveEffectiveDatabaseAccess({
      principal,
      layers: completeLayers().slice(0, 3),
      now: new Date('2026-07-21T00:00:00.000Z'),
    });
    expect(missing).toMatchObject({
      complete: false,
      active: false,
      workspace: false,
      databaseIds: [],
      actions: [],
      reasons: ['missing_session_delegation'],
    });

    const duplicated = resolveEffectiveDatabaseAccess({
      principal,
      layers: [...completeLayers(), completeLayers()[1] as DatabaseAccessLayer],
      now: new Date('2026-07-21T00:00:00.000Z'),
    });
    expect(duplicated.complete).toBe(false);
    expect(duplicated.reasons).toContain('duplicate_agent_capability');

    const mismatchedLayers = completeLayers();
    mismatchedLayers[1] = {
      ...(mismatchedLayers[1] as DatabaseAccessLayer),
      principalId: 'agent:other',
    };
    expect(
      resolveEffectiveDatabaseAccess({ principal, layers: mismatchedLayers }).reasons,
    ).toContain('principal_mismatch_agent_capability');

    const inactive = resolveEffectiveDatabaseAccess({
      principal,
      layers: completeLayers(),
      now: new Date('2026-07-19T00:00:00.000Z'),
    });
    expect(inactive).toMatchObject({ complete: true, active: false, reasons: ['not_active'] });
    expect(evaluateEffectiveDatabaseAccess(inactive, { action: 'query' })).toMatchObject({
      allowed: false,
      reasons: ['not_active', 'policy_inactive'],
    });

    const expired = resolveEffectiveDatabaseAccess({
      principal,
      layers: completeLayers(),
      now: new Date('2026-07-23T00:00:00.000Z'),
    });
    expect(expired).toMatchObject({ complete: true, active: false, reasons: ['expired'] });
  });

  test('uses only the invoking user permission for a human principal', () => {
    const userPrincipal = { kind: 'user' as const, id: 'user:owner' };
    const userLayer: DatabaseAccessLayer = {
      ...layer('user_permission', 'e', scope({ databaseIds: ['db_tasks'], allowBody: false })),
      principalId: userPrincipal.id,
    };
    const effective = resolveEffectiveDatabaseAccess({
      principal: userPrincipal,
      layers: [userLayer],
    });
    expect(effective).toMatchObject({ complete: true, active: true, databaseIds: ['db_tasks'] });
    expect(
      evaluateEffectiveDatabaseAccess(effective, {
        action: 'query',
        databaseId: 'db_tasks',
        includeBody: true,
      }),
    ).toMatchObject({ allowed: false, reasons: ['body_denied'] });
  });

  test('binds policy identity to every layer revision independent of input order', () => {
    const layers = completeLayers();
    const first = resolveEffectiveDatabaseAccess({ principal, layers });
    const reordered = resolveEffectiveDatabaseAccess({ principal, layers: [...layers].reverse() });
    expect(reordered.policyRevision).toBe(first.policyRevision);
    const changed = structuredClone(layers);
    changed[3] = { ...(changed[3] as DatabaseAccessLayer), revision: revision('f') };
    expect(resolveEffectiveDatabaseAccess({ principal, layers: changed }).policyRevision).not.toBe(
      first.policyRevision,
    );
  });
});
