export const DATABASE_AUTONOMY_MODES = ['review', 'balanced', 'autonomous'] as const;
export type DatabaseAutonomyMode = (typeof DATABASE_AUTONOMY_MODES)[number];

export const DATABASE_MUTATION_ACTIONS = [
  'create_database',
  'delete_database',
  'alter_schema',
  'create_record',
  'update_record',
  'delete_record',
  'bulk_update',
  'change_permission',
  'publish',
  'external_communication',
  'automation',
] as const;
export type DatabaseMutationAction = (typeof DATABASE_MUTATION_ACTIONS)[number];

export interface DatabaseAutonomyScope {
  databaseIds: readonly string[];
  actions: readonly DatabaseMutationAction[];
  propertyIds: readonly string[];
  allowBody: boolean;
  maxRecordsPerAction: number;
  maxRecordsTotal: number;
  maxActionsTotal: number;
  maxEgressBytesTotal: number;
  notBefore?: string;
  expiresAt: string;
}

export interface DatabaseAutonomyUsage {
  records: number;
  actions: number;
  egressBytes: number;
}

export interface DatabaseAutonomyOperation {
  action: DatabaseMutationAction;
  recordCount: number;
  propertyIds?: readonly string[];
  touchesBody?: boolean;
  externalEgressBytes?: number;
  usage?: DatabaseAutonomyUsage;
  reversible: boolean;
  destructive?: boolean;
  changesPermissions?: boolean;
  publishesData?: boolean;
  externalSideEffect?: boolean;
}

export interface DatabaseAutonomyEvaluationInput extends DatabaseAutonomyOperation {
  databaseId: string;
  databaseMode?: DatabaseAutonomyMode;
  sessionMode?: DatabaseAutonomyMode;
  delegation?: DatabaseAutonomyScope;
  now?: Date;
}

export type DatabaseAutonomyDecision =
  | {
      decision: 'allow';
      effectiveMode: 'balanced' | 'autonomous';
      reasons: readonly string[];
      delegationExpiresAt: string | null;
    }
  | {
      decision: 'require_approval';
      effectiveMode: DatabaseAutonomyMode;
      reasons: readonly string[];
      delegationExpiresAt: string | null;
    };

const MODE_RANK: Readonly<Record<DatabaseAutonomyMode, number>> = {
  review: 0,
  balanced: 1,
  autonomous: 2,
};

const ACTION_EFFECTS: Readonly<
  Partial<
    Record<
      DatabaseMutationAction,
      {
        destructive?: boolean;
        changesPermissions?: boolean;
        publishesData?: boolean;
        externalSideEffect?: boolean;
      }
    >
  >
> = {
  delete_record: { destructive: true },
  change_permission: { changesPermissions: true },
  publish: { publishesData: true, externalSideEffect: true },
  external_communication: { externalSideEffect: true },
};

/** Missing database or session policy is fail-closed Review mode. */
export function resolveDatabaseAutonomyMode(
  databaseMode: DatabaseAutonomyMode | undefined,
  sessionMode: DatabaseAutonomyMode | undefined,
): DatabaseAutonomyMode {
  const database = databaseMode ?? 'review';
  const session = sessionMode ?? 'review';
  return MODE_RANK[database] <= MODE_RANK[session] ? database : session;
}

function sensitiveReasons(input: DatabaseAutonomyEvaluationInput): string[] {
  const effects = ACTION_EFFECTS[input.action];
  return [
    ...(input.destructive || effects?.destructive ? ['destructive_operation'] : []),
    ...(input.changesPermissions || effects?.changesPermissions ? ['permission_change'] : []),
    ...(input.publishesData || effects?.publishesData ? ['public_sharing'] : []),
    ...(input.externalSideEffect || effects?.externalSideEffect ? ['external_side_effect'] : []),
    ...(!input.reversible ? ['irreversible_operation'] : []),
  ];
}

function delegationReasons(input: DatabaseAutonomyEvaluationInput, now: Date): string[] {
  const delegation = input.delegation;
  if (!delegation) return ['delegation_missing'];
  const notBefore = delegation.notBefore ? Date.parse(delegation.notBefore) : null;
  const expiresAt = Date.parse(delegation.expiresAt);
  const usage = input.usage ?? { records: 0, actions: 0, egressBytes: 0 };
  const propertyIds = [...new Set(input.propertyIds ?? [])];
  const egressBytes = input.externalEgressBytes ?? 0;
  return [
    ...(notBefore !== null && (!Number.isFinite(notBefore) || notBefore > now.getTime())
      ? ['delegation_not_active']
      : []),
    ...(!Number.isFinite(expiresAt) || expiresAt <= now.getTime() ? ['delegation_expired'] : []),
    ...(!delegation.databaseIds.includes(input.databaseId) ? ['database_not_delegated'] : []),
    ...(!delegation.actions.includes(input.action) ? ['action_not_delegated'] : []),
    ...(propertyIds.some((propertyId) => !delegation.propertyIds.includes(propertyId))
      ? ['property_not_delegated']
      : []),
    ...(input.touchesBody && !delegation.allowBody ? ['body_not_delegated'] : []),
    ...(input.recordCount > delegation.maxRecordsPerAction ? ['row_budget_exceeded'] : []),
    ...(usage.records + input.recordCount > delegation.maxRecordsTotal
      ? ['cumulative_row_budget_exceeded']
      : []),
    ...(usage.actions + 1 > delegation.maxActionsTotal ? ['action_budget_exceeded'] : []),
    ...(usage.egressBytes + egressBytes > delegation.maxEgressBytesTotal
      ? ['egress_budget_exceeded']
      : []),
  ];
}

/** Pure fail-closed decision shared by server enforcement and UI review. */
export function evaluateDatabaseAutonomy(
  input: DatabaseAutonomyEvaluationInput,
): DatabaseAutonomyDecision {
  if (!Number.isSafeInteger(input.recordCount) || input.recordCount < 0) {
    throw new RangeError('recordCount must be a non-negative safe integer');
  }
  if (
    !Number.isSafeInteger(input.externalEgressBytes ?? 0) ||
    (input.externalEgressBytes ?? 0) < 0
  ) {
    throw new RangeError('externalEgressBytes must be a non-negative safe integer');
  }
  for (const [name, value] of Object.entries(
    input.usage ?? { records: 0, actions: 0, egressBytes: 0 },
  )) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`usage.${name} must be a non-negative safe integer`);
    }
  }
  const effectiveMode = resolveDatabaseAutonomyMode(input.databaseMode, input.sessionMode);
  const delegationExpiresAt = input.delegation?.expiresAt ?? null;
  if (effectiveMode === 'review') {
    return {
      decision: 'require_approval',
      effectiveMode,
      reasons: ['review_mode'],
      delegationExpiresAt,
    };
  }
  const sensitive = sensitiveReasons(input);
  if (effectiveMode !== 'autonomous' && sensitive.length > 0) {
    return {
      decision: 'require_approval',
      effectiveMode,
      reasons: sensitive,
      delegationExpiresAt,
    };
  }
  if (effectiveMode === 'balanced') {
    const reasons = [
      ...(input.action !== 'update_record' ? ['balanced_action_requires_review'] : []),
      ...(input.recordCount > 20 ? ['balanced_row_limit_exceeded'] : []),
    ];
    return reasons.length === 0
      ? {
          decision: 'allow',
          effectiveMode,
          reasons: ['small_reversible_edit'],
          delegationExpiresAt,
        }
      : { decision: 'require_approval', effectiveMode, reasons, delegationExpiresAt };
  }
  const reasons = [...sensitive, ...delegationReasons(input, input.now ?? new Date())];
  return reasons.length === 0
    ? { decision: 'allow', effectiveMode, reasons: ['explicit_delegation'], delegationExpiresAt }
    : { decision: 'require_approval', effectiveMode, reasons, delegationExpiresAt };
}
