/**
 * Discovery and ambiguity-surfacing eval harness for RFC 0001 R-011/R-012.
 *
 * Unlike `embeddings/eval/semantic-eval.ts` (which evaluates a statistical
 * ranking model and needs a real tune/held split to guard against noise),
 * `DatabaseDataPlane#catalog` is a fully deterministic weighted-substring
 * matcher (`#catalogEntry` in database-data-plane.ts): the same query
 * against the same corpus always produces the same scores. A held-out
 * split still guards against hand-tuning the ambiguity margin to the
 * exact pairs it's graded against, but the eval set here is intentionally
 * small — it doesn't need statistical volume the way a model eval does.
 *
 * R-011: at least 95% Top-1 correct source selection on non-ambiguous
 * queries in the held split.
 * R-012: at least 99% of intentionally ambiguous queries in the held
 * split are surfaced as ambiguous rather than silently resolved.
 */
import { readFileSync } from 'node:fs';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import type { DatabaseDataPlane } from './database-data-plane.ts';

export interface DatabaseDiscoveryEvalPair {
  query: string;
  /** Null for `ambiguous: true` pairs — there is deliberately no single
   *  correct answer to check Top-1 against. */
  expectedDatabaseId: string | null;
  /** True when the corpus intentionally makes this query resolve to more
   *  than one plausible database — the eval expects ambiguity to be
   *  surfaced, not silently collapsed to `expectedDatabaseId`. */
  ambiguous: boolean;
  split: 'tune' | 'held';
}

export interface DatabaseDiscoveryEvalSet {
  note: string;
  pairs: DatabaseDiscoveryEvalPair[];
}

export function loadDatabaseDiscoveryEvalSet(): DatabaseDiscoveryEvalSet {
  return JSON.parse(
    readFileSync(new URL('./database-discovery-eval-set.json', import.meta.url), 'utf-8'),
  ) as DatabaseDiscoveryEvalSet;
}

/** Pre-registered ambiguity margin: two top candidates are "ambiguous"
 *  when their catalog scores are within this many points of each other.
 *  Fixed by inspecting only the `tune` split's score gaps — every tune
 *  ambiguous pair ties exactly (145 vs 145 or 70 vs 70), and every tune
 *  unambiguous pair resolves to a single candidate (the runner-up scores
 *  0 and is filtered out of the catalog response entirely), so any
 *  margin from 1 to a few dozen would separate them; 10 leaves headroom
 *  without being tuned to the held split. Do not adjust this to make
 *  `held`-split pairs pass — that would defeat the point of the split. */
export const DEFAULT_AMBIGUITY_MARGIN = 10;

export interface DatabaseDiscoveryOutcome {
  pair: DatabaseDiscoveryEvalPair;
  candidateIds: readonly string[];
  candidateScores: readonly number[];
  top1Id: string | null;
  flaggedAmbiguous: boolean;
  top1Correct: boolean;
  ambiguityCorrect: boolean;
}

export function isAmbiguousCatalogResult(
  candidateScores: readonly number[],
  margin = DEFAULT_AMBIGUITY_MARGIN,
): boolean {
  const [first, second] = candidateScores;
  if (first === undefined || second === undefined) return false;
  return first - second <= margin;
}

export function evaluateDatabaseDiscoveryPair(
  dataPlane: DatabaseDataPlane,
  pair: DatabaseDiscoveryEvalPair,
  margin = DEFAULT_AMBIGUITY_MARGIN,
): DatabaseDiscoveryOutcome {
  const catalog = dataPlane.catalog(pair.query);
  const candidateIds = catalog.candidates.map((candidate) => candidate.id);
  const candidateScores = catalog.candidates.map((candidate) => candidate.score);
  const top1Id = candidateIds[0] ?? null;
  const flaggedAmbiguous = isAmbiguousCatalogResult(candidateScores, margin);
  return {
    pair,
    candidateIds,
    candidateScores,
    top1Id,
    flaggedAmbiguous,
    top1Correct: !pair.ambiguous && top1Id === pair.expectedDatabaseId,
    ambiguityCorrect: pair.ambiguous ? flaggedAmbiguous : !flaggedAmbiguous,
  };
}

export interface DatabaseDiscoveryReport {
  /** R-011 metric: Top-1 accuracy over non-ambiguous pairs in the split. */
  top1Accuracy: number;
  /** R-012 metric: ambiguity-surfaced rate over ambiguous pairs in the split. */
  ambiguousSurfaceRate: number;
  outcomes: readonly DatabaseDiscoveryOutcome[];
  passes: boolean;
}

const R011_TOP1_ACCURACY_MIN = 0.95;
const R012_AMBIGUOUS_SURFACE_RATE_MIN = 0.99;

export function runDatabaseDiscoveryEval(
  dataPlane: DatabaseDataPlane,
  pairs: readonly DatabaseDiscoveryEvalPair[],
  margin = DEFAULT_AMBIGUITY_MARGIN,
): DatabaseDiscoveryReport {
  const outcomes = pairs.map((pair) => evaluateDatabaseDiscoveryPair(dataPlane, pair, margin));
  const unambiguous = outcomes.filter((outcome) => !outcome.pair.ambiguous);
  const ambiguous = outcomes.filter((outcome) => outcome.pair.ambiguous);
  const top1Accuracy =
    unambiguous.length === 0
      ? 1
      : unambiguous.filter((outcome) => outcome.top1Correct).length / unambiguous.length;
  const ambiguousSurfaceRate =
    ambiguous.length === 0
      ? 1
      : ambiguous.filter((outcome) => outcome.ambiguityCorrect).length / ambiguous.length;
  return {
    top1Accuracy,
    ambiguousSurfaceRate,
    outcomes,
    passes:
      top1Accuracy >= R011_TOP1_ACCURACY_MIN &&
      ambiguousSurfaceRate >= R012_AMBIGUOUS_SURFACE_RATE_MIN,
  };
}

function simpleDefinition(input: {
  id: string;
  key: string;
  name: string;
  purpose: string;
  vocabulary: string[];
  aliases?: string[];
}) {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: input.id,
    key: input.key,
    name: input.name,
    aliases: input.aliases ?? [],
    contract: {
      purpose: input.purpose,
      canonicality: 'canonical',
      vocabulary: input.vocabulary,
      freshness: { expectation: 'daily', maxAgeSeconds: 86_400 },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: `ds_${input.key.replaceAll('-', '_')}`,
        key: input.key,
        name: input.name,
        recordMeaning: `One ${input.name.toLocaleLowerCase()} record`,
        folder: input.key,
        properties: [
          {
            id: `prop_${input.key.replaceAll('-', '_')}_title`,
            key: 'title',
            name: 'Title',
            type: 'title',
          },
        ],
      },
    ],
  });
}

/**
 * Six databases: four with vocabulary unique enough to resolve cleanly,
 * and two overlapping pairs (feedback/research share "insights"; tasks/bugs
 * share "backlog" and a common "...engineering team" purpose phrase) that
 * deliberately produce close-scoring ties for the ambiguous half of the
 * eval set. The shared words live only in `purpose`/`vocabulary`, never in
 * `key`/`name` — `#catalogEntry` also scores key/name/source fields, so a
 * shared word that leaks into those (e.g. "customer", which is baked into
 * both `customer-feedback` and `customer-research`'s own keys) breaks the
 * intended tie instead of producing one.
 */
export function buildDatabaseDiscoveryCorpus() {
  return [
    simpleDefinition({
      id: 'db_feedback',
      key: 'customer-feedback',
      name: 'Customer feedback',
      purpose: 'Track actionable insights from customer conversations',
      vocabulary: ['customer', 'feedback', 'voice', 'insights'],
      aliases: ['Voice of customer'],
    }),
    simpleDefinition({
      id: 'db_research',
      key: 'customer-research',
      name: 'Customer research',
      purpose: 'Track customer insights and research sessions',
      vocabulary: ['customer', 'research', 'interview', 'insights'],
    }),
    simpleDefinition({
      id: 'db_tasks',
      key: 'engineering-tasks',
      name: 'Engineering tasks',
      purpose: 'Track sprint backlog work for the engineering team',
      vocabulary: ['task', 'sprint', 'engineering', 'backlog'],
    }),
    simpleDefinition({
      id: 'db_bugs',
      key: 'bug-tracker',
      name: 'Bug tracker',
      purpose: 'Track defect backlog found by the engineering team',
      vocabulary: ['bug', 'defect', 'engineering', 'backlog'],
    }),
    simpleDefinition({
      id: 'db_vendors',
      key: 'vendor-contracts',
      name: 'Vendor contracts',
      purpose: 'Track procurement agreements with external vendors',
      vocabulary: ['vendor', 'contract', 'procurement'],
    }),
    simpleDefinition({
      id: 'db_events',
      key: 'marketing-events',
      name: 'Marketing events',
      purpose: 'Track upcoming marketing campaigns and events',
      vocabulary: ['event', 'marketing', 'campaign'],
    }),
  ];
}
