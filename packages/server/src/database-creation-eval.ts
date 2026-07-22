/**
 * Prompt-to-valid-database evaluation harness for R-017.
 *
 * The harness owns the acceptance measurement, not the prompt planner. A
 * production agent, a replayed model response, or a deterministic test
 * planner can be injected. This keeps model quality separate from the shared
 * plan/validation contract and prevents a transcript from being counted as a
 * successful database creation.
 */

import type {
  DatabaseDesiredStateDraftInput,
  DatabaseDraftArtifact,
  DatabasePlanArtifact,
  DatabasePlanEngine,
} from './database-plan.ts';

export interface DatabaseCreationEvalCase {
  id: string;
  prompt: string;
  split: 'tune' | 'held';
  expected: {
    propertyKeys: readonly string[];
    viewLayouts: readonly string[];
  };
}

export interface DatabasePromptPlannerResult {
  desiredState: unknown;
  /** Number of schema-repair turns performed before returning the result. */
  repairAttempts?: number;
}

export type DatabasePromptPlanner = (
  prompt: string,
  context: { caseId: string },
) => DatabasePromptPlannerResult | unknown;

export interface DatabaseCreationEvalOutcome {
  case: DatabaseCreationEvalCase;
  validWithoutRepair: boolean;
  repairAttempts: number;
  draftId: string | null;
  planId: string | null;
  expectedPropertiesPresent: boolean;
  expectedViewLayoutsPresent: boolean;
  failureCode: string | null;
}

export interface DatabaseCreationEvalReport {
  evaluated: number;
  validWithoutRepair: number;
  repairFreeRate: number;
  schemaCoverageRate: number;
  viewCoverageRate: number;
  passes: boolean;
  outcomes: readonly DatabaseCreationEvalOutcome[];
}

const R017_REPAIR_FREE_RATE_MIN = 0.9;

function normalizedPlannerResult(result: DatabasePromptPlannerResult | unknown) {
  if (
    result &&
    typeof result === 'object' &&
    'desiredState' in result &&
    'repairAttempts' in result
  ) {
    const candidate = result as { desiredState: unknown; repairAttempts?: unknown };
    return {
      desiredState: candidate.desiredState,
      repairAttempts:
        typeof candidate.repairAttempts === 'number' &&
        Number.isInteger(candidate.repairAttempts) &&
        candidate.repairAttempts >= 0
          ? candidate.repairAttempts
          : 0,
    };
  }
  return { desiredState: result, repairAttempts: 0 };
}

function hasExpectedSchema(
  draft: DatabaseDraftArtifact,
  expected: DatabaseCreationEvalCase['expected'],
): { properties: boolean; views: boolean } {
  const source = draft.normalized.definition.sources[0];
  const propertyKeys = new Set(source?.properties.map((property) => property.key) ?? []);
  const viewLayouts = new Set<string>(
    draft.normalized.definition.views.map((view) => view.layout.type),
  );
  return {
    properties: expected.propertyKeys.every((key) => propertyKeys.has(key)),
    views: expected.viewLayouts.every((layout) => viewLayouts.has(layout)),
  };
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return error instanceof Error ? error.name : 'unknown_error';
}

export function evaluateDatabaseCreationCase(
  engine: Pick<DatabasePlanEngine, 'createDraft' | 'createPlan'>,
  planner: DatabasePromptPlanner,
  evalCase: DatabaseCreationEvalCase,
): DatabaseCreationEvalOutcome {
  let repairAttempts = 0;
  try {
    const planned = normalizedPlannerResult(planner(evalCase.prompt, { caseId: evalCase.id }));
    repairAttempts = planned.repairAttempts;
    const draft = engine.createDraft(planned.desiredState);
    const plan = engine.createPlan(draft.id);
    const coverage = hasExpectedSchema(draft, evalCase.expected);
    const validWithoutRepair = repairAttempts === 0 && coverage.properties && coverage.views;
    return {
      case: evalCase,
      validWithoutRepair,
      repairAttempts,
      draftId: draft.id,
      planId: plan.id,
      expectedPropertiesPresent: coverage.properties,
      expectedViewLayoutsPresent: coverage.views,
      failureCode: null,
    };
  } catch (error) {
    return {
      case: evalCase,
      validWithoutRepair: false,
      repairAttempts,
      draftId: null,
      planId: null,
      expectedPropertiesPresent: false,
      expectedViewLayoutsPresent: false,
      failureCode: errorCode(error),
    };
  }
}

export function runDatabaseCreationEval(
  engine: Pick<DatabasePlanEngine, 'createDraft' | 'createPlan'>,
  planner: DatabasePromptPlanner,
  cases: readonly DatabaseCreationEvalCase[],
): DatabaseCreationEvalReport {
  const outcomes = cases.map((evalCase) => evaluateDatabaseCreationCase(engine, planner, evalCase));
  const validWithoutRepair = outcomes.filter((outcome) => outcome.validWithoutRepair).length;
  const expected = outcomes.length || 1;
  const schemaCoverage = outcomes.filter((outcome) => outcome.expectedPropertiesPresent).length;
  const viewCoverage = outcomes.filter((outcome) => outcome.expectedViewLayoutsPresent).length;
  const repairFreeRate = validWithoutRepair / expected;
  const schemaCoverageRate = schemaCoverage / expected;
  const viewCoverageRate = viewCoverage / expected;
  return {
    evaluated: outcomes.length,
    validWithoutRepair,
    repairFreeRate,
    schemaCoverageRate,
    viewCoverageRate,
    passes: outcomes.length > 0 && repairFreeRate >= R017_REPAIR_FREE_RATE_MIN,
    outcomes,
  };
}

/** Reusable type aliases for consumers that want to persist an eval result. */
export type DatabaseCreationEvalDraft = DatabaseDesiredStateDraftInput;
export type DatabaseCreationEvalPlan = DatabasePlanArtifact;
