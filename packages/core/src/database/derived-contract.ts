import {
  buildFormulaDependencyGraph,
  type FormulaComputedPropertyInput,
  FormulaDependencyError,
  type FormulaDependencyGraph,
} from './formula-dependencies.ts';
import { compileFormulaSource, FormulaTypeError } from './formula-language.ts';
import type { DatabaseDefinition, DatabaseProperty } from './schema.ts';

export type DatabaseDerivedContractDiagnosticCode =
  | 'unknown_property'
  | 'ambiguous_property'
  | 'formula_compile_failed'
  | 'formula_ast_mismatch'
  | 'dependency_cycle'
  | 'invalid_rollup_dependency';

export interface DatabaseDerivedContractDiagnostic {
  code: DatabaseDerivedContractDiagnosticCode;
  sourceId?: string;
  propertyId?: string;
  dependencyPath?: readonly string[];
  message: string;
}

export interface DatabaseDerivedContract {
  graph: FormulaDependencyGraph | null;
  compiledFormulaAsts: Readonly<Record<string, unknown>>;
  diagnostics: readonly DatabaseDerivedContractDiagnostic[];
}

function propertyMap(
  definition: DatabaseDefinition,
): Map<string, { sourceId: string; property: DatabaseProperty }> {
  const result = new Map<string, { sourceId: string; property: DatabaseProperty }>();
  for (const source of definition.sources) {
    for (const property of source.properties)
      result.set(property.id, { sourceId: source.id, property });
  }
  return result;
}

function astEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Compile all user Formula source strings to stable property-ID ASTs and
 * construct one cross-source Formula/Rollup dependency graph.  This is a pure
 * pre-commit contract; callers can reject the definition when diagnostics are
 * present and never need to persist computed values.
 */
export function compileDatabaseDerivedContract(
  definition: DatabaseDefinition,
): DatabaseDerivedContract {
  const diagnostics: DatabaseDerivedContractDiagnostic[] = [];
  const compiledFormulaAsts: Record<string, unknown> = {};
  const properties = propertyMap(definition);
  const inputs: FormulaComputedPropertyInput[] = [];
  for (const source of definition.sources) {
    for (const property of source.properties) {
      if (property.type === 'formula') {
        try {
          const compiled = compileFormulaSource(property.source, {
            definition,
            sourceId: source.id,
            resultType: property.ast.resultType,
          });
          compiledFormulaAsts[property.id] = compiled;
          if (!astEqual(compiled, property.ast)) {
            diagnostics.push({
              code: 'formula_ast_mismatch',
              sourceId: source.id,
              propertyId: property.id,
              message: `Formula "${property.id}" source does not compile to its stored stable-ID AST`,
            });
          }
          inputs.push({
            propertyId: property.id,
            sourceId: source.id,
            kind: 'formula',
            ast: compiled,
          });
        } catch (error) {
          const message =
            error instanceof FormulaTypeError
              ? error.issues.map((issue) => issue.message).join('; ')
              : error instanceof Error
                ? error.message
                : String(error);
          diagnostics.push({
            code: 'formula_compile_failed',
            sourceId: source.id,
            propertyId: property.id,
            message,
          });
          inputs.push({
            propertyId: property.id,
            sourceId: source.id,
            kind: 'formula',
            ast: property.ast,
          });
        }
      } else if (property.type === 'rollup') {
        const relation = source.properties.find(
          (candidate) => candidate.id === property.relationPropertyId,
        );
        const target =
          relation?.type === 'relation' ? properties.get(property.targetPropertyId) : undefined;
        if (
          !relation ||
          relation.type !== 'relation' ||
          !target ||
          target.sourceId !== relation.targetSourceId
        ) {
          diagnostics.push({
            code: 'invalid_rollup_dependency',
            sourceId: source.id,
            propertyId: property.id,
            message: `Rollup "${property.id}" has an invalid cross-source relation/target dependency`,
          });
        }
        inputs.push({
          propertyId: property.id,
          sourceId: source.id,
          kind: 'rollup',
          dependencies: [property.relationPropertyId, property.targetPropertyId],
        });
      }
    }
  }
  let graph: FormulaDependencyGraph | null = null;
  try {
    graph = buildFormulaDependencyGraph(inputs, { cyclePolicy: 'surface' });
    for (const cycle of graph.cycles) {
      diagnostics.push({
        code: 'dependency_cycle',
        dependencyPath: cycle.path,
        message: `Computed dependency cycle: ${cycle.path.join(' -> ')}`,
      });
    }
  } catch (error) {
    const code =
      error instanceof FormulaDependencyError && error.code === 'dependency_cycle'
        ? 'dependency_cycle'
        : 'invalid_rollup_dependency';
    diagnostics.push({ code, message: error instanceof Error ? error.message : String(error) });
  }
  return { graph, compiledFormulaAsts, diagnostics };
}

export function assertDatabaseDerivedContract(
  definition: DatabaseDefinition,
): DatabaseDerivedContract {
  const contract = compileDatabaseDerivedContract(definition);
  if (contract.diagnostics.length > 0) {
    const first = contract.diagnostics[0];
    if (!first) throw new Error('derived contract diagnostics unexpectedly missing');
    throw new Error(first.message);
  }
  return contract;
}
