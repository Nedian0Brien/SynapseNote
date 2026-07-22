/**
 * Retrieval recall/precision and token-reduction eval harness for RFC 0001
 * R-013/R-014.
 *
 * Ground truth is authored directly into the fixture (each record's body
 * deliberately contains both of its topic's two words, and a `topic`
 * property tags it — see buildDatabaseRetrievalCorpus in the paired test
 * file) rather than derived from any product search call, so scoring
 * recall/precision against `DatabaseDataPlane#pack`'s evidence disclosure
 * is not circular.
 *
 * R-013: at least 90% recall and 95% evidence precision within the token
 * budget, on the held split.
 * R-014: at least 50% fewer estimated tokens than full-record retrieval of
 * the same matched records, on the held split. The full-record baseline is
 * `pack()` itself with `disclosure: { level: 'full_body' }` on the same
 * topic-scoped record set as the evidence pack — comparing the two
 * disclosure levels of the identical mechanism isolates exactly the
 * representation difference (evidence snippets vs full bodies) rather than
 * conflating it with Context Pack's fixed schema/snapshot overhead, which
 * would dominate a comparison against a bare JSON record dump at this
 * corpus's small scale.
 */

import { readFileSync } from 'node:fs';
import type { DatabaseDataPlane } from './database-data-plane.ts';

export interface DatabaseRetrievalEvalPair {
  query: string;
  /** The `topic` property value shared by every record in `expectedRecordIds` —
   *  used to scope the R-014 full-body baseline to the identical record set
   *  the evidence pack matched, via a structured `where` filter. */
  topic: string;
  /** Hand-authored ground truth — the record IDs whose body contains this
   *  query's topic keyword, known because the fixture put it there. */
  expectedRecordIds: string[];
  split: 'tune' | 'held';
}

export interface DatabaseRetrievalEvalSet {
  note: string;
  pairs: DatabaseRetrievalEvalPair[];
}

export function loadDatabaseRetrievalEvalSet(): DatabaseRetrievalEvalSet {
  return JSON.parse(
    readFileSync(new URL('./database-retrieval-eval-set.json', import.meta.url), 'utf-8'),
  ) as DatabaseRetrievalEvalSet;
}

export interface DatabaseRetrievalOutcome {
  pair: DatabaseRetrievalEvalPair;
  returnedRecordIds: string[];
  recall: number;
  precision: number;
  evidenceTokens: number;
  fullBodyTokens: number;
  tokenReduction: number;
  isComplete: boolean;
  truncationReason: 'token_budget' | 'query_page' | null;
}

export function evaluateDatabaseRetrievalPair(
  dataPlane: DatabaseDataPlane,
  databaseId: string,
  sourceId: string,
  topicPropertyId: string,
  pair: DatabaseRetrievalEvalPair,
  maxTokens: number,
): DatabaseRetrievalOutcome {
  const evidencePack = dataPlane.pack({
    databaseId,
    sourceId,
    goal: `Find records about ${pair.query}`,
    maxTokens,
    tokenizer: 'utf8_bytes_div3',
    encoding: 'object_rows',
    disclosure: { level: 'evidence', searchText: pair.query },
  });
  const records = Array.isArray(evidencePack.records) ? evidencePack.records : [];
  const returnedRecordIds = records.map((record) => record.id);
  const expected = new Set(pair.expectedRecordIds);
  const returnedRelevant = returnedRecordIds.filter((id) => expected.has(id));
  const recall = expected.size === 0 ? 1 : returnedRelevant.length / expected.size;
  const precision =
    returnedRecordIds.length === 0
      ? expected.size === 0
        ? 1
        : 0
      : returnedRelevant.length / returnedRecordIds.length;

  // Full-body baseline scoped to the exact same topic's records via a
  // structured filter (not the free-text search), with a generous budget
  // so it is never itself truncated — the honest cost of "read every full
  // record on this topic" rather than a budget-starved partial read.
  const fullBodyPack = dataPlane.pack({
    databaseId,
    sourceId,
    goal: `Find records about ${pair.query}`,
    maxTokens: 10 * maxTokens,
    tokenizer: 'utf8_bytes_div3',
    encoding: 'object_rows',
    disclosure: { level: 'full_body' },
    query: {
      where: { propertyId: topicPropertyId, operator: 'eq', value: pair.topic },
      sort: [],
      includeArchived: false,
    },
  });

  return {
    pair,
    returnedRecordIds,
    recall,
    precision,
    evidenceTokens: evidencePack.budget.estimatedTokens,
    fullBodyTokens: fullBodyPack.budget.estimatedTokens,
    tokenReduction:
      fullBodyPack.budget.estimatedTokens === 0
        ? 0
        : 1 - evidencePack.budget.estimatedTokens / fullBodyPack.budget.estimatedTokens,
    isComplete: evidencePack.isComplete,
    truncationReason: evidencePack.omitted.reason,
  };
}

export interface DatabaseRetrievalReport {
  meanRecall: number;
  meanPrecision: number;
  meanTokenReduction: number;
  outcomes: readonly DatabaseRetrievalOutcome[];
  passes: boolean;
}

const R013_RECALL_MIN = 0.9;
const R013_PRECISION_MIN = 0.95;
const R014_TOKEN_REDUCTION_MIN = 0.5;

export function runDatabaseRetrievalEval(
  dataPlane: DatabaseDataPlane,
  databaseId: string,
  sourceId: string,
  topicPropertyId: string,
  pairs: readonly DatabaseRetrievalEvalPair[],
  maxTokens: number,
): DatabaseRetrievalReport {
  const outcomes = pairs.map((pair) =>
    evaluateDatabaseRetrievalPair(
      dataPlane,
      databaseId,
      sourceId,
      topicPropertyId,
      pair,
      maxTokens,
    ),
  );
  const mean = (values: number[]): number =>
    values.length === 0 ? 1 : values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanRecall = mean(outcomes.map((outcome) => outcome.recall));
  const meanPrecision = mean(outcomes.map((outcome) => outcome.precision));
  const meanTokenReduction = mean(outcomes.map((outcome) => outcome.tokenReduction));
  return {
    meanRecall,
    meanPrecision,
    meanTokenReduction,
    outcomes,
    passes:
      meanRecall >= R013_RECALL_MIN &&
      meanPrecision >= R013_PRECISION_MIN &&
      meanTokenReduction >= R014_TOKEN_REDUCTION_MIN,
  };
}
