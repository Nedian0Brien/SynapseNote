import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type DatabaseCreationEvalCase,
  runDatabaseCreationEval,
} from './database-creation-eval.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function desiredState(name: string, properties: readonly string[], layout: 'table' | 'board') {
  return {
    database: {
      key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      contract: {
        purpose: `Track ${name.toLowerCase()}`,
        canonicality: 'canonical' as const,
        vocabulary: ['agent', 'records'],
        freshness: { expectation: 'daily' as const, maxAgeSeconds: 86_400 },
        sensitivity: 'internal' as const,
      },
    },
    sources: [
      {
        key: 'entries',
        name: 'Entries',
        recordMeaning: `One ${name.toLowerCase()} entry`,
        folder: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        properties: [
          { key: 'title', name: 'Title', type: 'title' as const, required: true },
          ...properties.map((key) => ({ key, name: key, type: 'text' as const })),
        ],
      },
    ],
    views: [
      {
        key: 'default',
        name: 'All entries',
        sourceKey: 'entries',
        layout: { type: layout },
      },
    ],
    templates: [],
    policy: { mode: 'review' as const, allowedOperations: [], maxRecordsPerCommit: 10 },
    sampleRecords: [],
  };
}

const CASES: readonly DatabaseCreationEvalCase[] = [
  {
    id: 'tasks',
    prompt: 'Create a task tracker with status and owner fields.',
    split: 'tune',
    expected: { propertyKeys: ['title', 'status', 'owner'], viewLayouts: ['table'] },
  },
  {
    id: 'research',
    prompt: 'Create a research table with source and tags.',
    split: 'held',
    expected: { propertyKeys: ['title', 'source', 'tags'], viewLayouts: ['table'] },
  },
  {
    id: 'feedback',
    prompt: 'Create a feedback list with channel and sentiment.',
    split: 'held',
    expected: { propertyKeys: ['title', 'channel', 'sentiment'], viewLayouts: ['table'] },
  },
  {
    id: 'incidents',
    prompt: 'Create an incident tracker with severity and service.',
    split: 'held',
    expected: { propertyKeys: ['title', 'severity', 'service'], viewLayouts: ['table'] },
  },
  {
    id: 'vendors',
    prompt: 'Create a vendor table with renewal and owner.',
    split: 'held',
    expected: { propertyKeys: ['title', 'renewal', 'owner'], viewLayouts: ['table'] },
  },
];

async function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-creation-eval-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  return createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
    generateUuid: (() => {
      let count = 0;
      return () => `${String(++count).padStart(8, '0')}-0000-4000-8000-000000000000`;
    })(),
  });
}

describe('R-017 prompt-to-valid-database evaluator', () => {
  test('evaluates an injected planner on a held-out-shaped case set', async () => {
    const engine = await fixture();
    const planner = (prompt: string) => {
      const evalCase = CASES.find((candidate) => prompt.startsWith(candidate.prompt.slice(0, 18)));
      if (!evalCase) throw new Error('unknown prompt');
      const expected = evalCase.expected.propertyKeys.filter((key) => key !== 'title');
      return {
        desiredState: desiredState(
          evalCase.id,
          expected,
          evalCase.expected.viewLayouts[0] === 'board' ? 'board' : 'table',
        ),
        repairAttempts: 0,
      };
    };
    const report = runDatabaseCreationEval(engine, planner, CASES);
    expect(report.evaluated).toBe(5);
    expect(report.repairFreeRate).toBe(1);
    expect(report.schemaCoverageRate).toBe(1);
    expect(report.viewCoverageRate).toBe(1);
    expect(report.passes).toBe(true);
  });

  test('accepts planner responses that omit the optional repair count', async () => {
    const engine = await fixture();
    const report = runDatabaseCreationEval(
      engine,
      () => ({
        desiredState: desiredState('Tasks', ['status', 'owner'], 'table'),
      }),
      [CASES[0]],
    );

    expect(report.repairFreeRate).toBe(1);
    expect(report.outcomes[0]?.repairAttempts).toBe(0);
    expect(report.passes).toBe(true);
  });

  test('fails the gate when planner output needs repair or misses requested schema', async () => {
    const engine = await fixture();
    const report = runDatabaseCreationEval(
      engine,
      () => ({
        desiredState: desiredState('Incomplete', [], 'table'),
        repairAttempts: 1,
      }),
      CASES.slice(0, 2),
    );
    expect(report.repairFreeRate).toBe(0);
    expect(report.passes).toBe(false);
    expect(report.outcomes.every((outcome) => outcome.repairAttempts === 1)).toBe(true);
  });
});
