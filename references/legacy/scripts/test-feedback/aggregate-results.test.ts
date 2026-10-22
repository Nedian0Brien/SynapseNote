import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  aggregateJUnitResults,
  categoryForJUnitFile,
  renderSlowTestMarkdown,
} from './aggregate-results.ts';

describe('JUnit result aggregation', () => {
  test('classifies server result files and emits the slowest files with failure counts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'synapsenote-junit-'));
    mkdirSync(join(directory, 'nested'));
    writeFileSync(
      join(directory, 'nested', 'process-1-of-4.xml'),
      `<testsuite><testcase classname="server" name="slow" file="src/server.test.ts" time="2.0"><failure>boom</failure></testcase><testcase classname="server" name="fast" file="src/server.test.ts" time="0.5" /></testsuite>`,
    );
    writeFileSync(
      join(directory, 'unit-1-of-4.xml'),
      `<testsuite><testcase classname="unit" name="unit" file="src/unit.test.ts" time="0.1" /></testsuite>`,
    );

    const report = aggregateJUnitResults(directory);

    expect(categoryForJUnitFile('database-1-of-4.xml')).toBe('database');
    expect(report.summary).toMatchObject({
      failedCases: 1,
      junitFiles: 2,
      totalCases: 3,
      testFiles: 2,
    });
    expect(report.slowestFiles[0]).toMatchObject({
      category: 'process',
      durationMs: 2500,
      failedCount: 1,
      file: 'src/server.test.ts',
    });
    expect(report.timings.files['src/server.test.ts']).toBe(2500);
    expect(renderSlowTestMarkdown(report)).toContain('server boot');
  });
});
