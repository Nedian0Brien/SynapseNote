import type { FormulaAst, FormulaValueType } from './formula.ts';
import { collectFormulaPropertyDependencies } from './formula-dependencies.ts';
import { type EvaluateFormulaInput, evaluateFormula } from './formula-evaluator.ts';
import { SYNAPSE_FORMULA_FUNCTION_SIGNATURES } from './formula-functions.ts';
import {
  compileFormulaSource,
  FormulaSyntaxError,
  FormulaTypeError,
  formatFormulaSource,
} from './formula-language.ts';
import type { FormulaComputedResult } from './formula-result.ts';
import type { DatabaseDefinition, DatabasePropertyType } from './schema.ts';

export interface FormulaEditorDiagnostic {
  phase: 'syntax' | 'type';
  code: string;
  message: string;
  path?: readonly (string | number)[];
  offset?: number;
  length?: number;
  line?: number;
  column?: number;
}

export interface FormulaEditorPropertyReference {
  propertyId: string;
  sourceId: string;
  key: string;
  name: string;
  propertyType: DatabasePropertyType;
}

export interface FormulaEditorSuggestion {
  kind: 'property' | 'function';
  label: string;
  insertText: string;
  detail: string;
  propertyId?: string;
}

export interface FormulaEditorAnalysis {
  valid: boolean;
  ast?: FormulaAst;
  canonicalSource?: string;
  diagnostics: readonly FormulaEditorDiagnostic[];
  references: readonly FormulaEditorPropertyReference[];
  suggestions: readonly FormulaEditorSuggestion[];
  preview?: FormulaComputedResult;
}

export interface AnalyzeFormulaEditorInput {
  source: string;
  definition: DatabaseDefinition;
  sourceId: string;
  resultType?: FormulaValueType;
  suggestionQuery?: string;
  preview?: Omit<EvaluateFormulaInput, 'ast'>;
}

function lineAndColumn(source: string, offset: number): { line: number; column: number } {
  const prefix = source.slice(0, Math.max(0, offset));
  const lines = prefix.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function propertyReference(
  definition: DatabaseDefinition,
  propertyId: string,
): FormulaEditorPropertyReference | null {
  for (const source of definition.sources) {
    const property = source.properties.find((candidate) => candidate.id === propertyId);
    if (property) {
      return {
        propertyId,
        sourceId: source.id,
        key: property.key,
        name: property.name,
        propertyType: property.type,
      };
    }
  }
  return null;
}

export function buildFormulaEditorSuggestions(
  definition: DatabaseDefinition,
  sourceId: string,
  query = '',
): readonly FormulaEditorSuggestion[] {
  const normalized = query.trim().toLocaleLowerCase('en-US');
  const source = definition.sources.find((candidate) => candidate.id === sourceId);
  const properties: FormulaEditorSuggestion[] = (source?.properties ?? []).map((property) => ({
    kind: 'property',
    label: property.name,
    insertText: `prop(${JSON.stringify(property.key)})`,
    detail: `${property.type} · ${property.id}`,
    propertyId: property.id,
  }));
  const functions: FormulaEditorSuggestion[] = Object.entries(
    SYNAPSE_FORMULA_FUNCTION_SIGNATURES,
  ).map(([name, signature]) => ({
    kind: 'function',
    label: name,
    insertText: `${name}()`,
    detail: `${signature.minimumArguments ?? signature.parameters.length}${signature.variadic ? '+' : ''} args`,
  }));
  return [...properties, ...functions]
    .filter(
      (suggestion) =>
        normalized === '' ||
        suggestion.label.toLocaleLowerCase('en-US').includes(normalized) ||
        suggestion.detail.toLocaleLowerCase('en-US').includes(normalized),
    )
    .sort((left, right) =>
      left.kind === right.kind
        ? left.label.localeCompare(right.label)
        : left.kind === 'property'
          ? -1
          : 1,
    );
}

export function analyzeFormulaEditor(input: AnalyzeFormulaEditorInput): FormulaEditorAnalysis {
  const suggestions = buildFormulaEditorSuggestions(
    input.definition,
    input.sourceId,
    input.suggestionQuery,
  );
  let ast: FormulaAst;
  try {
    ast = compileFormulaSource(input.source, {
      definition: input.definition,
      sourceId: input.sourceId,
      ...(input.resultType ? { resultType: input.resultType } : {}),
    });
  } catch (error) {
    if (error instanceof FormulaSyntaxError) {
      return {
        valid: false,
        diagnostics: [
          {
            phase: 'syntax',
            code: 'syntax_error',
            message: error.message,
            offset: error.offset,
            length: error.length,
            ...lineAndColumn(input.source, error.offset),
          },
        ],
        references: [],
        suggestions,
      };
    }
    if (error instanceof FormulaTypeError) {
      return {
        valid: false,
        diagnostics: error.issues.map((issue) => ({ phase: 'type', ...issue })),
        references: [],
        suggestions,
      };
    }
    return {
      valid: false,
      diagnostics: [
        { phase: 'syntax', code: 'invalid_formula', message: 'Formula could not be compiled' },
      ],
      references: [],
      suggestions,
    };
  }
  const references = collectFormulaPropertyDependencies(ast)
    .map((propertyId) => propertyReference(input.definition, propertyId))
    .filter((reference): reference is FormulaEditorPropertyReference => Boolean(reference));
  const keyById = new Map(references.map((reference) => [reference.propertyId, reference.key]));
  return {
    valid: true,
    ast,
    canonicalSource: formatFormulaSource(ast, {
      propertyReference: (propertyId) => keyById.get(propertyId) ?? propertyId,
    }),
    diagnostics: [],
    references,
    suggestions,
    ...(input.preview ? { preview: evaluateFormula({ ...input.preview, ast }) } : {}),
  };
}
