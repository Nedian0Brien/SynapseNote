import { FormulaAstSchema, type FormulaExpression } from './formula.ts';
import { DatabasePropertyIdSchema, DataSourceIdSchema } from './stable-ids.ts';

export const FORMULA_DEPENDENCY_MAX_NODES = 10_000;
export const FORMULA_DEPENDENCY_MAX_EDGES = 100_000;

export interface FormulaComputedPropertyInput {
  propertyId: string;
  sourceId: string;
  kind: 'formula' | 'rollup';
  ast?: unknown;
  dependencies?: readonly string[];
}

export interface FormulaDependencyNode {
  propertyId: string;
  sourceId: string;
  kind: 'formula' | 'rollup';
  dependencies: readonly string[];
  computedDependencies: readonly string[];
  dependents: readonly string[];
}

export interface FormulaDependencyCycle {
  propertyIds: readonly string[];
  path: readonly string[];
}

export interface FormulaDependencyGraph {
  nodes: readonly FormulaDependencyNode[];
  evaluationOrder: readonly string[];
  cycles: readonly FormulaDependencyCycle[];
  blockedPropertyIds: readonly string[];
}

export interface BuildFormulaDependencyGraphOptions {
  cyclePolicy?: 'reject' | 'surface';
}

export class FormulaDependencyError extends Error {
  readonly code:
    | 'invalid_computed_property'
    | 'duplicate_computed_property'
    | 'resource_limit'
    | 'dependency_cycle';
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: FormulaDependencyError['code'],
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'FormulaDependencyError';
    this.code = code;
    this.details = details;
  }
}

function pushStableId(heap: string[], value: string): void {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    const parentValue = heap[parent];
    if (parentValue === undefined || parentValue.localeCompare(value) <= 0) break;
    heap[index] = parentValue;
    index = parent;
  }
  heap[index] = value;
}

function popStableId(heap: string[]): string | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (first === undefined || last === undefined || heap.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const leftValue = heap[left];
    const rightValue = heap[right];
    if (leftValue === undefined) break;
    const child =
      rightValue !== undefined && rightValue.localeCompare(leftValue) < 0 ? right : left;
    const childValue = heap[child];
    if (childValue === undefined || childValue.localeCompare(last) >= 0) break;
    heap[index] = childValue;
    index = child;
  }
  heap[index] = last;
  return first;
}

function expressionChildren(expression: FormulaExpression): readonly FormulaExpression[] {
  switch (expression.type) {
    case 'literal':
    case 'variable':
      return [];
    case 'property':
      return expression.record ? [expression.record] : [];
    case 'list':
      return expression.items;
    case 'unary':
      return [expression.operand];
    case 'binary':
      return [expression.left, expression.right];
    case 'conditional':
      return [expression.condition, expression.whenTrue, expression.whenFalse];
    case 'call':
      return expression.arguments;
    case 'let':
      return [...expression.bindings.map((binding) => binding.value), expression.body];
    case 'lambda':
      return [expression.body];
  }
}

export function collectFormulaPropertyDependencies(input: unknown): readonly string[] {
  const ast = FormulaAstSchema.parse(input);
  const dependencies = new Set<string>();
  const pending = [ast.expression];
  while (pending.length > 0) {
    const expression = pending.pop();
    if (!expression) continue;
    if (expression.type === 'property') dependencies.add(expression.propertyId);
    pending.push(...expressionChildren(expression));
  }
  return [...dependencies].sort((left, right) => left.localeCompare(right));
}

function cyclePath(
  members: readonly string[],
  computedDependencies: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const memberSet = new Set(members);
  const start = members[0];
  if (!start) return [];
  for (const first of computedDependencies.get(start) ?? []) {
    if (!memberSet.has(first)) continue;
    if (first === start) return [start, start];
    const queue = [first];
    let offset = 0;
    const parent = new Map<string, string | null>([[first, null]]);
    while (offset < queue.length) {
      const current = queue[offset];
      offset += 1;
      if (!current) continue;
      for (const dependency of computedDependencies.get(current) ?? []) {
        if (!memberSet.has(dependency)) continue;
        if (dependency === start) {
          const reversed: string[] = [];
          let cursor: string | null = current;
          while (cursor) {
            reversed.push(cursor);
            cursor = parent.get(cursor) ?? null;
          }
          return [start, ...reversed.reverse(), start];
        }
        if (parent.has(dependency)) continue;
        parent.set(dependency, current);
        queue.push(dependency);
      }
    }
  }
  return [...members, start];
}

function stronglyConnectedComponents(
  propertyIds: readonly string[],
  computedDependencies: ReadonlyMap<string, readonly string[]>,
): readonly string[][] {
  const visited = new Set<string>();
  const finishOrder: string[] = [];
  for (const root of propertyIds) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack: Array<{ propertyId: string; nextDependency: number }> = [
      { propertyId: root, nextDependency: 0 },
    ];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) break;
      const dependencies = computedDependencies.get(frame.propertyId) ?? [];
      const dependency = dependencies[frame.nextDependency];
      if (dependency !== undefined) {
        frame.nextDependency += 1;
        if (visited.has(dependency)) continue;
        visited.add(dependency);
        stack.push({ propertyId: dependency, nextDependency: 0 });
        continue;
      }
      finishOrder.push(frame.propertyId);
      stack.pop();
    }
  }

  const reverse = new Map(propertyIds.map((propertyId) => [propertyId, [] as string[]]));
  for (const propertyId of propertyIds) {
    for (const dependency of computedDependencies.get(propertyId) ?? []) {
      reverse.get(dependency)?.push(propertyId);
    }
  }
  for (const dependents of reverse.values()) {
    dependents.sort((left, right) => left.localeCompare(right));
  }

  const assigned = new Set<string>();
  const components: string[][] = [];
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const root = finishOrder[index];
    if (!root || assigned.has(root)) continue;
    const component: string[] = [];
    const pending = [root];
    assigned.add(root);
    while (pending.length > 0) {
      const propertyId = pending.pop();
      if (!propertyId) continue;
      component.push(propertyId);
      for (const dependent of reverse.get(propertyId) ?? []) {
        if (assigned.has(dependent)) continue;
        assigned.add(dependent);
        pending.push(dependent);
      }
    }
    component.sort((left, right) => left.localeCompare(right));
    components.push(component);
  }
  return components;
}

export function buildFormulaDependencyGraph(
  inputs: readonly FormulaComputedPropertyInput[],
  options: BuildFormulaDependencyGraphOptions = {},
): FormulaDependencyGraph {
  if (inputs.length > FORMULA_DEPENDENCY_MAX_NODES) {
    throw new FormulaDependencyError(
      'resource_limit',
      `Computed property count exceeds ${FORMULA_DEPENDENCY_MAX_NODES}`,
      { observed: inputs.length, maximum: FORMULA_DEPENDENCY_MAX_NODES },
    );
  }
  const normalized = new Map<
    string,
    Omit<FormulaDependencyNode, 'computedDependencies' | 'dependents'>
  >();
  let edgeCount = 0;
  for (const [index, input] of inputs.entries()) {
    if (
      !DatabasePropertyIdSchema.safeParse(input.propertyId).success ||
      !DataSourceIdSchema.safeParse(input.sourceId).success
    ) {
      throw new FormulaDependencyError(
        'invalid_computed_property',
        `Computed property at index ${index} has an invalid stable ID`,
        { index },
      );
    }
    if (normalized.has(input.propertyId)) {
      throw new FormulaDependencyError(
        'duplicate_computed_property',
        `Computed property "${input.propertyId}" is declared more than once`,
        { propertyId: input.propertyId },
      );
    }
    let dependencies: readonly string[];
    if (input.kind === 'formula') {
      if (input.ast === undefined) {
        throw new FormulaDependencyError(
          'invalid_computed_property',
          `Formula property "${input.propertyId}" requires an AST`,
          { propertyId: input.propertyId },
        );
      }
      dependencies = collectFormulaPropertyDependencies(input.ast);
    } else {
      dependencies = [...new Set(input.dependencies ?? [])].sort((left, right) =>
        left.localeCompare(right),
      );
    }
    if (
      dependencies.some((dependency) => !DatabasePropertyIdSchema.safeParse(dependency).success)
    ) {
      throw new FormulaDependencyError(
        'invalid_computed_property',
        `Computed property "${input.propertyId}" has an invalid dependency ID`,
        { propertyId: input.propertyId },
      );
    }
    edgeCount += dependencies.length;
    if (edgeCount > FORMULA_DEPENDENCY_MAX_EDGES) {
      throw new FormulaDependencyError(
        'resource_limit',
        `Dependency edge count exceeds ${FORMULA_DEPENDENCY_MAX_EDGES}`,
        { observed: edgeCount, maximum: FORMULA_DEPENDENCY_MAX_EDGES },
      );
    }
    normalized.set(input.propertyId, {
      propertyId: input.propertyId,
      sourceId: input.sourceId,
      kind: input.kind,
      dependencies,
    });
  }

  const propertyIds = [...normalized.keys()].sort((left, right) => left.localeCompare(right));
  const computedPropertyIds = new Set(propertyIds);
  const computedDependencies = new Map<string, readonly string[]>();
  const dependents = new Map(propertyIds.map((propertyId) => [propertyId, [] as string[]]));
  for (const propertyId of propertyIds) {
    const dependencies = (normalized.get(propertyId)?.dependencies ?? []).filter((dependency) =>
      computedPropertyIds.has(dependency),
    );
    computedDependencies.set(propertyId, dependencies);
    for (const dependency of dependencies) dependents.get(dependency)?.push(propertyId);
  }
  for (const values of dependents.values()) values.sort((left, right) => left.localeCompare(right));

  const components = stronglyConnectedComponents(propertyIds, computedDependencies);
  const cycles = components
    .filter(
      (component) =>
        component.length > 1 ||
        Boolean(component[0] && computedDependencies.get(component[0])?.includes(component[0])),
    )
    .map((propertyIds) => ({
      propertyIds,
      path: cyclePath(propertyIds, computedDependencies),
    }))
    .sort((left, right) => (left.propertyIds[0] ?? '').localeCompare(right.propertyIds[0] ?? ''));

  const blocked = new Set(cycles.flatMap((cycle) => cycle.propertyIds));
  const pendingBlocked = [...blocked];
  let blockedOffset = 0;
  while (blockedOffset < pendingBlocked.length) {
    const propertyId = pendingBlocked[blockedOffset];
    blockedOffset += 1;
    if (!propertyId) continue;
    for (const dependent of dependents.get(propertyId) ?? []) {
      if (blocked.has(dependent)) continue;
      blocked.add(dependent);
      pendingBlocked.push(dependent);
    }
  }

  const indegree = new Map<string, number>();
  for (const propertyId of propertyIds) {
    if (blocked.has(propertyId)) continue;
    indegree.set(
      propertyId,
      (computedDependencies.get(propertyId) ?? []).filter((dependency) => !blocked.has(dependency))
        .length,
    );
  }
  const ready: string[] = [];
  for (const [propertyId, count] of indegree) {
    if (count === 0) pushStableId(ready, propertyId);
  }
  const evaluationOrder: string[] = [];
  while (ready.length > 0) {
    const propertyId = popStableId(ready);
    if (!propertyId) continue;
    evaluationOrder.push(propertyId);
    for (const dependent of dependents.get(propertyId) ?? []) {
      if (blocked.has(dependent)) continue;
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) pushStableId(ready, dependent);
    }
  }

  const graph: FormulaDependencyGraph = {
    nodes: propertyIds.map((propertyId) => {
      const node = normalized.get(propertyId);
      if (!node) throw new Error(`Normalized computed property "${propertyId}" is missing`);
      return {
        ...node,
        computedDependencies: computedDependencies.get(propertyId) ?? [],
        dependents: dependents.get(propertyId) ?? [],
      };
    }),
    evaluationOrder,
    cycles,
    blockedPropertyIds: [...blocked].sort((left, right) => left.localeCompare(right)),
  };
  if (cycles.length > 0 && (options.cyclePolicy ?? 'reject') === 'reject') {
    throw new FormulaDependencyError('dependency_cycle', 'Computed property cycle detected', {
      graph,
      cycles,
    });
  }
  return graph;
}
