import {
  FORMULA_DEPENDENCY_MAX_NODES,
  type FormulaDependencyGraph,
  type FormulaDependencyNode,
} from './formula-dependencies.ts';
import { DatabasePropertyIdSchema, DatabaseRecordIdSchema, DataSourceIdSchema } from './schema.ts';

export const FORMULA_RECOMPUTE_MAX_TARGETS = 100_000;

export interface FormulaRecomputeChangeSet {
  /** Values already changed in storage. The changed computed value itself is not re-evaluated. */
  changedPropertyIds?: readonly string[];
  /** Formula/Rollup definitions or cached values that must themselves be re-evaluated. */
  invalidatedComputedPropertyIds?: readonly string[];
}

export interface FormulaRecomputeStep {
  propertyId: string;
  sourceId: string;
  kind: 'formula' | 'rollup';
  directInputPropertyIds: readonly string[];
  invalidated: boolean;
  dependentPropertyIds: readonly string[];
}

export interface FormulaRecomputePlan {
  changedPropertyIds: readonly string[];
  invalidatedComputedPropertyIds: readonly string[];
  directlyAffectedPropertyIds: readonly string[];
  potentiallyAffectedPropertyIds: readonly string[];
  blockedPropertyIds: readonly string[];
  steps: readonly FormulaRecomputeStep[];
}

export interface FormulaRecomputeEvaluationInput {
  propertyId: string;
  sourceId: string;
  kind: 'formula' | 'rollup';
  /** Direct raw changes, explicit invalidations, or upstream values that actually changed. */
  triggerPropertyIds: readonly string[];
}

export interface FormulaRecomputeEvaluationResult {
  /** Whether the persisted value or persisted error state changed. */
  changed: boolean;
}

export interface FormulaRecomputeExecutionEntry {
  propertyId: string;
  triggerPropertyIds: readonly string[];
  changed: boolean;
}

export interface FormulaRecomputeExecutionReport {
  evaluated: readonly FormulaRecomputeExecutionEntry[];
  prunedPropertyIds: readonly string[];
  blockedPropertyIds: readonly string[];
}

export type FormulaRecomputeEvaluator = (
  input: FormulaRecomputeEvaluationInput,
) => FormulaRecomputeEvaluationResult | Promise<FormulaRecomputeEvaluationResult>;

export interface FormulaRecomputeValueChange {
  sourceId: string;
  recordId: string;
  propertyId: string;
}

export interface ScopedFormulaRecomputeTarget {
  sourceId: string;
  recordId: string;
  propertyId: string;
  kind: 'formula' | 'rollup';
}

export interface ResolveFormulaDependentRecordsInput {
  change: FormulaRecomputeValueChange;
  dependent: Pick<ScopedFormulaRecomputeTarget, 'sourceId' | 'propertyId' | 'kind'>;
}

export type ResolveFormulaDependentRecords = (
  input: ResolveFormulaDependentRecordsInput,
) => readonly string[] | Promise<readonly string[]>;

export interface ScopedFormulaRecomputeEvaluationInput extends ScopedFormulaRecomputeTarget {
  triggers: readonly FormulaRecomputeValueChange[];
}

export type ScopedFormulaRecomputeEvaluator = (
  input: ScopedFormulaRecomputeEvaluationInput,
) => FormulaRecomputeEvaluationResult | Promise<FormulaRecomputeEvaluationResult>;

export interface ScopedFormulaRecomputeExecutionEntry extends ScopedFormulaRecomputeTarget {
  triggers: readonly FormulaRecomputeValueChange[];
  changed: boolean;
}

export interface ScopedFormulaRecomputeReport {
  evaluated: readonly ScopedFormulaRecomputeExecutionEntry[];
  blockedTargets: readonly ScopedFormulaRecomputeTarget[];
}

export interface ExecuteScopedFormulaRecomputationInput {
  graph: FormulaDependencyGraph;
  changes?: readonly FormulaRecomputeValueChange[];
  invalidatedTargets?: readonly Omit<ScopedFormulaRecomputeTarget, 'kind'>[];
  /** Adds reverse-relation/cross-source owners. Same-source same-record propagation is automatic. */
  resolveDependentRecords?: ResolveFormulaDependentRecords;
  evaluate: ScopedFormulaRecomputeEvaluator;
}

export class FormulaRecomputeError extends Error {
  readonly code:
    | 'invalid_change_set'
    | 'unknown_computed_property'
    | 'invalid_dependency_graph'
    | 'resource_limit'
    | 'target_resolution_failed'
    | 'evaluation_failed';
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: FormulaRecomputeError['code'],
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'FormulaRecomputeError';
    this.code = code;
    this.details = details;
  }
}

function sortedUniquePropertyIds(
  values: readonly string[] | undefined,
  field: keyof FormulaRecomputeChangeSet,
): readonly string[] {
  const ids = [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right));
  const invalid = ids.find((propertyId) => !DatabasePropertyIdSchema.safeParse(propertyId).success);
  if (invalid) {
    throw new FormulaRecomputeError(
      'invalid_change_set',
      `Change set field "${field}" contains an invalid property ID`,
      { field, propertyId: invalid },
    );
  }
  if (ids.length > FORMULA_DEPENDENCY_MAX_NODES) {
    throw new FormulaRecomputeError(
      'resource_limit',
      `Change set field "${field}" exceeds ${FORMULA_DEPENDENCY_MAX_NODES} properties`,
      { field, observed: ids.length, maximum: FORMULA_DEPENDENCY_MAX_NODES },
    );
  }
  return ids;
}

function graphNodes(graph: FormulaDependencyGraph): ReadonlyMap<string, FormulaDependencyNode> {
  const nodes = new Map<string, FormulaDependencyNode>();
  for (const node of graph.nodes) {
    if (nodes.has(node.propertyId)) {
      throw new FormulaRecomputeError(
        'invalid_dependency_graph',
        `Dependency graph repeats computed property "${node.propertyId}"`,
        { propertyId: node.propertyId },
      );
    }
    nodes.set(node.propertyId, node);
  }
  return nodes;
}

/**
 * Produces a serializable upper-bound plan. Execution can prune downstream work
 * further when an evaluated upstream value (or error state) did not change.
 */
export function planFormulaRecomputation(
  graph: FormulaDependencyGraph,
  changes: FormulaRecomputeChangeSet,
): FormulaRecomputePlan {
  const changedPropertyIds = sortedUniquePropertyIds(
    changes.changedPropertyIds,
    'changedPropertyIds',
  );
  const invalidatedComputedPropertyIds = sortedUniquePropertyIds(
    changes.invalidatedComputedPropertyIds,
    'invalidatedComputedPropertyIds',
  );
  const nodes = graphNodes(graph);
  for (const propertyId of invalidatedComputedPropertyIds) {
    if (!nodes.has(propertyId)) {
      throw new FormulaRecomputeError(
        'unknown_computed_property',
        `Cannot invalidate unknown computed property "${propertyId}"`,
        { propertyId },
      );
    }
  }

  const changedSet = new Set(changedPropertyIds);
  const invalidatedSet = new Set(invalidatedComputedPropertyIds);
  const directInputs = new Map<string, readonly string[]>();
  const directlyAffected = new Set<string>(invalidatedComputedPropertyIds);
  for (const node of graph.nodes) {
    const inputs = node.dependencies
      .filter((propertyId) => changedSet.has(propertyId))
      .sort((left, right) => left.localeCompare(right));
    if (inputs.length === 0) continue;
    directlyAffected.add(node.propertyId);
    directInputs.set(node.propertyId, inputs);
  }

  const potentiallyAffected = new Set(directlyAffected);
  const pending = [...directlyAffected].sort((left, right) => left.localeCompare(right));
  let pendingOffset = 0;
  while (pendingOffset < pending.length) {
    const propertyId = pending[pendingOffset];
    pendingOffset += 1;
    if (!propertyId) continue;
    const node = nodes.get(propertyId);
    if (!node) {
      throw new FormulaRecomputeError(
        'invalid_dependency_graph',
        `Affected property "${propertyId}" is missing from the dependency graph`,
        { propertyId },
      );
    }
    for (const dependent of node.dependents) {
      if (potentiallyAffected.has(dependent)) continue;
      potentiallyAffected.add(dependent);
      pending.push(dependent);
    }
  }

  const blockedSet = new Set(graph.blockedPropertyIds);
  const blockedPropertyIds = [...potentiallyAffected]
    .filter((propertyId) => blockedSet.has(propertyId))
    .sort((left, right) => left.localeCompare(right));
  const runnable = new Set(
    [...potentiallyAffected].filter((propertyId) => !blockedSet.has(propertyId)),
  );
  const evaluationOrder = graph.evaluationOrder.filter((propertyId) => runnable.has(propertyId));
  if (evaluationOrder.length !== runnable.size) {
    const missing = [...runnable]
      .filter((propertyId) => !evaluationOrder.includes(propertyId))
      .sort((left, right) => left.localeCompare(right));
    throw new FormulaRecomputeError(
      'invalid_dependency_graph',
      'Dependency graph evaluation order omits an affected runnable property',
      { propertyIds: missing },
    );
  }

  const steps = evaluationOrder.map((propertyId): FormulaRecomputeStep => {
    const node = nodes.get(propertyId);
    if (!node) {
      throw new FormulaRecomputeError(
        'invalid_dependency_graph',
        `Evaluation property "${propertyId}" is missing from the dependency graph`,
        { propertyId },
      );
    }
    return {
      propertyId,
      sourceId: node.sourceId,
      kind: node.kind,
      directInputPropertyIds: directInputs.get(propertyId) ?? [],
      invalidated: invalidatedSet.has(propertyId),
      dependentPropertyIds: node.dependents.filter((dependent) => runnable.has(dependent)),
    };
  });

  return {
    changedPropertyIds,
    invalidatedComputedPropertyIds,
    directlyAffectedPropertyIds: [...directlyAffected].sort((left, right) =>
      left.localeCompare(right),
    ),
    potentiallyAffectedPropertyIds: [...potentiallyAffected].sort((left, right) =>
      left.localeCompare(right),
    ),
    blockedPropertyIds,
    steps,
  };
}

/** Executes a plan sequentially in dependency order and stops propagation at unchanged results. */
export async function executeFormulaRecomputation(
  plan: FormulaRecomputePlan,
  evaluate: FormulaRecomputeEvaluator,
): Promise<FormulaRecomputeExecutionReport> {
  if (plan.steps.length > FORMULA_DEPENDENCY_MAX_NODES) {
    throw new FormulaRecomputeError(
      'resource_limit',
      `Recomputation plan exceeds ${FORMULA_DEPENDENCY_MAX_NODES} steps`,
      { observed: plan.steps.length, maximum: FORMULA_DEPENDENCY_MAX_NODES },
    );
  }
  const triggerByProperty = new Map<string, Set<string>>();
  const stepIds = new Set(plan.steps.map((step) => step.propertyId));
  for (const step of plan.steps) {
    const triggers = new Set(step.directInputPropertyIds);
    if (step.invalidated) triggers.add(step.propertyId);
    if (triggers.size > 0) triggerByProperty.set(step.propertyId, triggers);
  }

  const evaluated: FormulaRecomputeExecutionEntry[] = [];
  for (const step of plan.steps) {
    const triggers = triggerByProperty.get(step.propertyId);
    if (!triggers || triggers.size === 0) continue;
    const triggerPropertyIds = [...triggers].sort((left, right) => left.localeCompare(right));
    let result: FormulaRecomputeEvaluationResult;
    try {
      result = await evaluate({
        propertyId: step.propertyId,
        sourceId: step.sourceId,
        kind: step.kind,
        triggerPropertyIds,
      });
    } catch (error) {
      throw new FormulaRecomputeError(
        'evaluation_failed',
        `Recomputation failed for property "${step.propertyId}"`,
        {
          propertyId: step.propertyId,
          evaluatedPropertyIds: evaluated.map((entry) => entry.propertyId),
          cause: error instanceof Error ? error.message : 'Unknown evaluator failure',
        },
      );
    }
    if (!result || typeof result.changed !== 'boolean') {
      throw new FormulaRecomputeError(
        'evaluation_failed',
        `Recomputation evaluator returned an invalid result for property "${step.propertyId}"`,
        {
          propertyId: step.propertyId,
          evaluatedPropertyIds: evaluated.map((entry) => entry.propertyId),
        },
      );
    }
    evaluated.push({ propertyId: step.propertyId, triggerPropertyIds, changed: result.changed });
    if (!result.changed) continue;
    for (const dependent of step.dependentPropertyIds) {
      if (!stepIds.has(dependent)) continue;
      const dependentTriggers = triggerByProperty.get(dependent) ?? new Set<string>();
      dependentTriggers.add(step.propertyId);
      triggerByProperty.set(dependent, dependentTriggers);
    }
  }

  const evaluatedIds = new Set(evaluated.map((entry) => entry.propertyId));
  return {
    evaluated,
    prunedPropertyIds: plan.steps
      .map((step) => step.propertyId)
      .filter((propertyId) => !evaluatedIds.has(propertyId)),
    blockedPropertyIds: plan.blockedPropertyIds,
  };
}

function valueChangeKey(change: FormulaRecomputeValueChange): string {
  return `${change.sourceId}\0${change.recordId}\0${change.propertyId}`;
}

function targetKey(
  target: Pick<ScopedFormulaRecomputeTarget, 'sourceId' | 'recordId' | 'propertyId'>,
) {
  return valueChangeKey(target);
}

function compareValueChanges(
  left: FormulaRecomputeValueChange,
  right: FormulaRecomputeValueChange,
) {
  return valueChangeKey(left).localeCompare(valueChangeKey(right));
}

function validateValueChange(
  change: FormulaRecomputeValueChange,
  field: 'changes' | 'invalidatedTargets' | 'resolvedTargets',
): void {
  if (
    !DataSourceIdSchema.safeParse(change.sourceId).success ||
    !DatabaseRecordIdSchema.safeParse(change.recordId).success ||
    !DatabasePropertyIdSchema.safeParse(change.propertyId).success
  ) {
    throw new FormulaRecomputeError(
      field === 'resolvedTargets' ? 'target_resolution_failed' : 'invalid_change_set',
      `Scoped recomputation field "${field}" contains an invalid stable ID`,
      { field, change },
    );
  }
}

/**
 * Recomputes concrete record/property targets. Same-source formulas inherit the
 * changed record automatically; callers resolve only cross-source or reverse-
 * relation owners from their permission-filtered relation index.
 */
export async function executeScopedFormulaRecomputation(
  input: ExecuteScopedFormulaRecomputationInput,
): Promise<ScopedFormulaRecomputeReport> {
  const nodes = graphNodes(input.graph);
  const blockedProperties = new Set(input.graph.blockedPropertyIds);
  const dependencies = new Map<string, FormulaDependencyNode[]>();
  for (const node of input.graph.nodes) {
    for (const dependency of node.dependencies) {
      const dependents = dependencies.get(dependency) ?? [];
      dependents.push(node);
      dependencies.set(dependency, dependents);
    }
  }
  for (const dependents of dependencies.values()) {
    dependents.sort((left, right) => left.propertyId.localeCompare(right.propertyId));
  }

  const changes = [
    ...new Map((input.changes ?? []).map((change) => [valueChangeKey(change), change])).values(),
  ].sort(compareValueChanges);
  if (changes.length > FORMULA_RECOMPUTE_MAX_TARGETS) {
    throw new FormulaRecomputeError(
      'resource_limit',
      `Scoped change set exceeds ${FORMULA_RECOMPUTE_MAX_TARGETS} entries`,
      { observed: changes.length, maximum: FORMULA_RECOMPUTE_MAX_TARGETS },
    );
  }
  for (const change of changes) validateValueChange(change, 'changes');

  const pendingByProperty = new Map<
    string,
    Map<
      string,
      { target: ScopedFormulaRecomputeTarget; triggers: Map<string, FormulaRecomputeValueChange> }
    >
  >();
  const blockedTargets = new Map<string, ScopedFormulaRecomputeTarget>();
  const scheduledTargets = new Set<string>();

  const trackTarget = (target: ScopedFormulaRecomputeTarget): void => {
    const key = targetKey(target);
    scheduledTargets.add(key);
    if (scheduledTargets.size > FORMULA_RECOMPUTE_MAX_TARGETS) {
      throw new FormulaRecomputeError(
        'resource_limit',
        `Scoped recomputation exceeds ${FORMULA_RECOMPUTE_MAX_TARGETS} targets`,
        { observed: scheduledTargets.size, maximum: FORMULA_RECOMPUTE_MAX_TARGETS },
      );
    }
  };

  const enqueue = (
    node: FormulaDependencyNode,
    recordId: string,
    trigger: FormulaRecomputeValueChange,
  ): void => {
    const target: ScopedFormulaRecomputeTarget = {
      sourceId: node.sourceId,
      recordId,
      propertyId: node.propertyId,
      kind: node.kind,
    };
    validateValueChange(target, 'resolvedTargets');
    trackTarget(target);
    const key = targetKey(target);
    if (blockedProperties.has(node.propertyId)) {
      blockedTargets.set(key, target);
      return;
    }
    const targets = pendingByProperty.get(node.propertyId) ?? new Map();
    const current = targets.get(key) ?? { target, triggers: new Map() };
    current.triggers.set(valueChangeKey(trigger), trigger);
    targets.set(key, current);
    pendingByProperty.set(node.propertyId, targets);
  };

  const resolveAndEnqueue = async (
    change: FormulaRecomputeValueChange,
    node: FormulaDependencyNode,
  ): Promise<void> => {
    const recordIds = new Set<string>();
    if (change.sourceId === node.sourceId) recordIds.add(change.recordId);
    if (input.resolveDependentRecords) {
      let resolved: readonly string[];
      try {
        resolved = await input.resolveDependentRecords({
          change,
          dependent: {
            sourceId: node.sourceId,
            propertyId: node.propertyId,
            kind: node.kind,
          },
        });
      } catch (error) {
        throw new FormulaRecomputeError(
          'target_resolution_failed',
          `Could not resolve dependent records for property "${node.propertyId}"`,
          {
            propertyId: node.propertyId,
            change,
            cause: error instanceof Error ? error.message : 'Unknown target resolver failure',
          },
        );
      }
      if (!Array.isArray(resolved)) {
        throw new FormulaRecomputeError(
          'target_resolution_failed',
          `Dependent record resolver returned an invalid result for property "${node.propertyId}"`,
          { propertyId: node.propertyId, change },
        );
      }
      for (const recordId of resolved) recordIds.add(recordId);
    }
    for (const recordId of [...recordIds].sort((left, right) => left.localeCompare(right))) {
      enqueue(node, recordId, change);
    }
  };

  for (const change of changes) {
    for (const node of dependencies.get(change.propertyId) ?? []) {
      await resolveAndEnqueue(change, node);
    }
  }

  const invalidatedTargets = [...(input.invalidatedTargets ?? [])].sort((left, right) =>
    targetKey(left).localeCompare(targetKey(right)),
  );
  for (const target of invalidatedTargets) {
    validateValueChange(target, 'invalidatedTargets');
    const node = nodes.get(target.propertyId);
    if (!node || node.sourceId !== target.sourceId) {
      throw new FormulaRecomputeError(
        'unknown_computed_property',
        `Cannot invalidate unknown computed target "${target.propertyId}" in source "${target.sourceId}"`,
        { target },
      );
    }
    enqueue(node, target.recordId, target);
  }

  const evaluated: ScopedFormulaRecomputeExecutionEntry[] = [];
  const processedProperties = new Set<string>();
  for (const propertyId of input.graph.evaluationOrder) {
    processedProperties.add(propertyId);
    const targets = pendingByProperty.get(propertyId);
    if (!targets) continue;
    const node = nodes.get(propertyId);
    if (!node) {
      throw new FormulaRecomputeError(
        'invalid_dependency_graph',
        `Evaluation property "${propertyId}" is missing from the dependency graph`,
        { propertyId },
      );
    }
    for (const current of [...targets.values()].sort((left, right) =>
      targetKey(left.target).localeCompare(targetKey(right.target)),
    )) {
      const triggers = [...current.triggers.values()].sort(compareValueChanges);
      let result: FormulaRecomputeEvaluationResult;
      try {
        result = await input.evaluate({ ...current.target, triggers });
      } catch (error) {
        throw new FormulaRecomputeError(
          'evaluation_failed',
          `Scoped recomputation failed for "${propertyId}" on record "${current.target.recordId}"`,
          {
            target: current.target,
            evaluatedTargets: evaluated.map(({ sourceId, recordId, propertyId }) => ({
              sourceId,
              recordId,
              propertyId,
            })),
            cause: error instanceof Error ? error.message : 'Unknown evaluator failure',
          },
        );
      }
      if (!result || typeof result.changed !== 'boolean') {
        throw new FormulaRecomputeError(
          'evaluation_failed',
          `Scoped recomputation evaluator returned an invalid result for "${propertyId}"`,
          { target: current.target },
        );
      }
      evaluated.push({ ...current.target, triggers, changed: result.changed });
      if (!result.changed) continue;
      const change: FormulaRecomputeValueChange = {
        sourceId: node.sourceId,
        recordId: current.target.recordId,
        propertyId: node.propertyId,
      };
      for (const dependentId of node.dependents) {
        if (processedProperties.has(dependentId)) {
          throw new FormulaRecomputeError(
            'invalid_dependency_graph',
            `Dependency graph schedules "${dependentId}" before "${propertyId}"`,
            { propertyId, dependentPropertyId: dependentId },
          );
        }
        const dependent = nodes.get(dependentId);
        if (!dependent) {
          throw new FormulaRecomputeError(
            'invalid_dependency_graph',
            `Dependent property "${dependentId}" is missing from the dependency graph`,
            { propertyId, dependentPropertyId: dependentId },
          );
        }
        await resolveAndEnqueue(change, dependent);
      }
    }
  }

  const unevaluated = [...pendingByProperty.keys()].filter(
    (propertyId) => !processedProperties.has(propertyId),
  );
  if (unevaluated.length > 0) {
    throw new FormulaRecomputeError(
      'invalid_dependency_graph',
      'Dependency graph evaluation order omits scoped recomputation targets',
      { propertyIds: unevaluated.sort((left, right) => left.localeCompare(right)) },
    );
  }
  return {
    evaluated,
    blockedTargets: [...blockedTargets.values()].sort((left, right) =>
      targetKey(left).localeCompare(targetKey(right)),
    ),
  };
}
