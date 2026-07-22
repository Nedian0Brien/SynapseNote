/**
 * Final-state evaluation for the R-018 agent database gate.
 *
 * Transcript text is deliberately not an input to this evaluator. A run only
 * passes when the canonical state, evidence references, budget, tool trace,
 * latency, and recovery result all satisfy the registered contract.
 */

export interface DatabaseFinalEvalInput {
  finalState: {
    databaseId: string | null;
    sourceId: string | null;
    expectedDatabaseId: string;
    expectedSourceId: string;
    canonicalRecordIds: readonly string[];
    expectedRecordIds: readonly string[];
    manifestPresent: boolean;
    recordsPresent: boolean;
    valid: boolean;
  };
  evidence: {
    expectedRecordIds: readonly string[];
    returnedRecordIds: readonly string[];
    citations: readonly { recordId: string; path: string }[];
    expectedPathsByRecordId: Readonly<Record<string, string>>;
    complete: boolean;
  };
  tokens: {
    estimated: number;
    budget: number;
    input: number;
    output: number;
  };
  toolTrace: {
    calls: readonly string[];
    maxCalls: number;
  };
  latency: {
    totalMs: number;
    maxMs: number;
  };
  recovery: {
    previewCanApply: boolean;
    applied: boolean;
    restored: boolean;
  };
}

export interface DatabaseFinalEvalReport {
  finalState: {
    pass: boolean;
    missingRecordIds: readonly string[];
    unexpectedRecordIds: readonly string[];
  };
  evidence: {
    pass: boolean;
    recall: number;
    precision: number;
    citationPrecision: number;
    complete: boolean;
  };
  tokens: {
    pass: boolean;
    estimated: number;
    budget: number;
    input: number;
    output: number;
  };
  toolTrace: { pass: boolean; calls: number; maxCalls: number };
  latency: { pass: boolean; totalMs: number; maxMs: number };
  recovery: { pass: boolean; previewCanApply: boolean; applied: boolean; restored: boolean };
  passes: boolean;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

/**
 * Evaluate an observed agent run against the R-018 final-state contract.
 *
 * The function is intentionally pure so the same acceptance logic can be used
 * by server tests, a local benchmark, or a hosted release job without making
 * any transport or filesystem assumptions.
 */
export function evaluateDatabaseFinalState(input: DatabaseFinalEvalInput): DatabaseFinalEvalReport {
  const expectedRecords = unique(input.finalState.expectedRecordIds);
  const actualRecords = unique(input.finalState.canonicalRecordIds);
  const expectedSet = new Set(expectedRecords);
  const actualSet = new Set(actualRecords);
  const missingRecordIds = expectedRecords.filter((id) => !actualSet.has(id));
  const unexpectedRecordIds = actualRecords.filter((id) => !expectedSet.has(id));
  const finalStatePass =
    input.finalState.valid &&
    input.finalState.manifestPresent &&
    input.finalState.recordsPresent &&
    input.finalState.databaseId === input.finalState.expectedDatabaseId &&
    input.finalState.sourceId === input.finalState.expectedSourceId &&
    missingRecordIds.length === 0 &&
    unexpectedRecordIds.length === 0;

  const evidenceExpected = unique(input.evidence.expectedRecordIds);
  const evidenceReturned = unique(input.evidence.returnedRecordIds);
  const evidenceExpectedSet = new Set(evidenceExpected);
  const evidenceReturnedSet = new Set(evidenceReturned);
  const relevantReturned = evidenceReturned.filter((id) => evidenceExpectedSet.has(id)).length;
  const evidenceRecall = ratio(
    evidenceExpected.filter((id) => evidenceReturnedSet.has(id)).length,
    evidenceExpected.length,
  );
  const evidencePrecision = ratio(relevantReturned, evidenceReturned.length);
  const citationCandidates = input.evidence.citations.filter((citation) =>
    evidenceReturnedSet.has(citation.recordId),
  );
  const citationCorrect = citationCandidates.filter(
    (citation) => input.evidence.expectedPathsByRecordId[citation.recordId] === citation.path,
  ).length;
  const citationPrecision = ratio(citationCorrect, citationCandidates.length);
  const evidencePass =
    evidenceRecall >= 0.9 &&
    evidencePrecision >= 0.95 &&
    citationPrecision === 1 &&
    input.evidence.complete;

  const tokenValues = [
    input.tokens.estimated,
    input.tokens.budget,
    input.tokens.input,
    input.tokens.output,
  ];
  const tokensFinite = tokenValues.every((value) => Number.isFinite(value) && value >= 0);
  const tokensPass = tokensFinite && input.tokens.estimated <= input.tokens.budget;

  const calls = input.toolTrace.calls.length;
  const toolTracePass = calls > 0 && calls <= input.toolTrace.maxCalls;
  const latencyPass =
    Number.isFinite(input.latency.totalMs) &&
    input.latency.totalMs >= 0 &&
    Number.isFinite(input.latency.maxMs) &&
    input.latency.maxMs >= 0 &&
    input.latency.totalMs <= input.latency.maxMs;
  const recoveryPass =
    input.recovery.previewCanApply && input.recovery.applied && input.recovery.restored;

  return {
    finalState: { pass: finalStatePass, missingRecordIds, unexpectedRecordIds },
    evidence: {
      pass: evidencePass,
      recall: evidenceRecall,
      precision: evidencePrecision,
      citationPrecision,
      complete: input.evidence.complete,
    },
    tokens: {
      pass: tokensPass,
      estimated: input.tokens.estimated,
      budget: input.tokens.budget,
      input: input.tokens.input,
      output: input.tokens.output,
    },
    toolTrace: { pass: toolTracePass, calls, maxCalls: input.toolTrace.maxCalls },
    latency: {
      pass: latencyPass,
      totalMs: input.latency.totalMs,
      maxMs: input.latency.maxMs,
    },
    recovery: { pass: recoveryPass, ...input.recovery },
    passes:
      finalStatePass && evidencePass && tokensPass && toolTracePass && latencyPass && recoveryPass,
  };
}
