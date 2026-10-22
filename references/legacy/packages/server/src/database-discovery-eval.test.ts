import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseDataPlane } from './database-data-plane.ts';
import {
  buildDatabaseDiscoveryCorpus,
  DEFAULT_AMBIGUITY_MARGIN,
  loadDatabaseDiscoveryEvalSet,
  runDatabaseDiscoveryEval,
} from './database-discovery-eval.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-discovery-eval-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  for (const definition of buildDatabaseDiscoveryCorpus()) {
    await store.create(definition);
  }
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  const plans = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
  });
  return createDatabaseDataPlane({
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
  });
}

describe('database discovery eval set (structural)', () => {
  test('every pair references a database that exists in the corpus', () => {
    const corpusIds = new Set(buildDatabaseDiscoveryCorpus().map((definition) => definition.id));
    const { pairs } = loadDatabaseDiscoveryEvalSet();
    for (const pair of pairs) {
      if (pair.ambiguous) {
        expect(pair.expectedDatabaseId).toBeNull();
      } else {
        expect(pair.expectedDatabaseId).not.toBeNull();
        expect(corpusIds.has(pair.expectedDatabaseId ?? '')).toBe(true);
      }
    }
  });

  test('both splits are represented for both ambiguous and unambiguous pairs', () => {
    const { pairs } = loadDatabaseDiscoveryEvalSet();
    for (const split of ['tune', 'held'] as const) {
      for (const ambiguous of [true, false]) {
        const count = pairs.filter((p) => p.split === split && p.ambiguous === ambiguous).length;
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('no duplicate query text within the set', () => {
    const { pairs } = loadDatabaseDiscoveryEvalSet();
    const queries = pairs.map((p) => p.query);
    expect(new Set(queries).size).toBe(queries.length);
  });
});

describe('R-011/R-012 database discovery eval (held-out)', () => {
  test('the tune split scores 100% at the pre-registered ambiguity margin', async () => {
    // Calibration check only — this must never be adjusted based on the
    // held split's results, only reported alongside them.
    const dataPlane = await fixture();
    const { pairs } = loadDatabaseDiscoveryEvalSet();
    const tune = pairs.filter((pair) => pair.split === 'tune');
    const report = runDatabaseDiscoveryEval(dataPlane, tune, DEFAULT_AMBIGUITY_MARGIN);
    expect(report.top1Accuracy).toBe(1);
    expect(report.ambiguousSurfaceRate).toBe(1);
  });

  test('the held split meets the R-011 (95% Top-1) and R-012 (99% ambiguity-surfaced) thresholds', async () => {
    const dataPlane = await fixture();
    const { pairs } = loadDatabaseDiscoveryEvalSet();
    const held = pairs.filter((pair) => pair.split === 'held');
    const report = runDatabaseDiscoveryEval(dataPlane, held, DEFAULT_AMBIGUITY_MARGIN);

    expect(report.top1Accuracy).toBeGreaterThanOrEqual(0.95);
    expect(report.ambiguousSurfaceRate).toBeGreaterThanOrEqual(0.99);
    expect(report.passes).toBe(true);

    // Print the exact numbers for the checklist evidence trail — this is a
    // one-time eval report, not a flaky assertion; failures above already
    // fail the test with the precise threshold miss.
    for (const outcome of report.outcomes) {
      if (outcome.pair.ambiguous ? !outcome.ambiguityCorrect : !outcome.top1Correct) {
        throw new Error(
          `held-out discovery eval regression: query=${JSON.stringify(outcome.pair.query)} ` +
            `expected=${outcome.pair.expectedDatabaseId ?? 'ambiguous'} ` +
            `top1=${outcome.top1Id ?? 'none'} scores=${JSON.stringify(outcome.candidateScores)}`,
        );
      }
    }
  });
});
