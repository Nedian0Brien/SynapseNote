import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

import { repositoryRoot } from './command.ts';
import { type JUnitCase, parseJUnit, runtimeInfo } from './measure.ts';

const CATEGORY_CAUSES: Record<string, string> = {
  a11y: 'browser accessibility tree and audit setup',
  contract: 'serialization and API contract setup',
  database: 'temporary database I/O and schema setup',
  dom: 'DOM renderer, portal, and fixture setup',
  e2e: 'browser launch, server, and journey fixtures',
  filesystem: 'filesystem watcher and temporary I/O',
  git: 'real Git subprocesses and repository I/O',
  process: 'server boot, subprocess, port, and shutdown lifecycle',
  search: 'index/search fixture setup and query evaluation',
  sync: 'synchronization fixture and persistence setup',
  unit: 'module evaluation and pure computation',
  visual: 'browser rendering and screenshot capture',
};

const KNOWN_CATEGORIES = Object.keys(CATEGORY_CAUSES).sort(
  (left, right) => right.length - left.length,
);

export interface AggregatedTestFile {
  category: string;
  costCause: string;
  durationMs: number;
  failedCount: number;
  file: string;
  junitFiles: string[];
  testCount: number;
}

export interface AggregatedTestCase extends JUnitCase {
  category: string;
  costCause: string;
  junitFile: string;
}

export interface AggregatedJUnitReport {
  generatedAt: string;
  inputDirectory: string;
  runtime: ReturnType<typeof runtimeInfo>;
  timings: { files: Record<string, number> };
  slowestCases: AggregatedTestCase[];
  slowestFiles: AggregatedTestFile[];
  summary: {
    failedCases: number;
    junitFiles: number;
    skippedCases: number;
    totalCases: number;
    totalDurationMs: number;
    testFiles: number;
  };
}

function parseArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function findXmlFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findXmlFiles(path));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.xml') files.push(path);
  }
  return files.sort();
}

export function categoryForJUnitFile(path: string): string {
  const name = basename(path).toLowerCase();
  if (name.includes('startup')) return 'process';
  return (
    KNOWN_CATEGORIES.find((category) => name.includes(category)) ??
    (name.includes('test') ? 'test' : 'unknown')
  );
}

function costCauseForCategory(category: string): string {
  return CATEGORY_CAUSES[category] ?? 'unclassified test runner or fixture setup';
}

function testFileForCase(testCase: JUnitCase): string {
  return testCase.file || testCase.classname || testCase.name || '<unknown test file>';
}

export function aggregateJUnitResults(inputDirectory: string): AggregatedJUnitReport {
  const xmlFiles = findXmlFiles(inputDirectory);
  const cases: AggregatedTestCase[] = [];
  for (const xmlFile of xmlFiles) {
    const category = categoryForJUnitFile(xmlFile);
    const costCause = costCauseForCategory(category);
    for (const testCase of parseJUnit(readFileSync(xmlFile, 'utf8'))) {
      cases.push({
        ...testCase,
        category,
        costCause,
        junitFile: xmlFile,
      });
    }
  }

  const files = new Map<string, AggregatedTestFile>();
  for (const testCase of cases) {
    const file = testFileForCase(testCase);
    const key = `${testCase.category}\u0000${file}`;
    const existing = files.get(key) ?? {
      category: testCase.category,
      costCause: testCase.costCause,
      durationMs: 0,
      failedCount: 0,
      file,
      junitFiles: [],
      testCount: 0,
    };
    existing.durationMs += testCase.durationMs;
    existing.failedCount += testCase.failure ? 1 : 0;
    existing.testCount += 1;
    if (!existing.junitFiles.includes(testCase.junitFile))
      existing.junitFiles.push(testCase.junitFile);
    files.set(key, existing);
  }

  const slowestFiles = [...files.values()]
    .map((file) => ({ ...file, durationMs: Math.round(file.durationMs * 1000) / 1000 }))
    .sort(
      (left, right) => right.durationMs - left.durationMs || left.file.localeCompare(right.file),
    )
    .slice(0, 30);
  const slowestCases = [...cases]
    .sort(
      (left, right) =>
        right.durationMs - left.durationMs ||
        left.name.localeCompare(right.name) ||
        left.junitFile.localeCompare(right.junitFile),
    )
    .slice(0, 30);
  const timingFiles: Record<string, number> = {};
  for (const file of files.values()) timingFiles[file.file] = file.durationMs;

  return {
    generatedAt: new Date().toISOString(),
    inputDirectory,
    runtime: runtimeInfo(),
    slowestCases,
    slowestFiles,
    timings: { files: timingFiles },
    summary: {
      failedCases: cases.filter((testCase) => testCase.failure).length,
      junitFiles: xmlFiles.length,
      skippedCases: cases.filter((testCase) => testCase.skipped).length,
      totalCases: cases.length,
      totalDurationMs:
        Math.round(cases.reduce((total, testCase) => total + testCase.durationMs, 0) * 1000) / 1000,
      testFiles: files.size,
    },
  };
}

export function renderSlowTestMarkdown(report: AggregatedJUnitReport): string {
  const lines = [
    '# Slow test report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Cases: ${report.summary.totalCases}; files: ${report.summary.testFiles}; failures: ${report.summary.failedCases}; skipped: ${report.summary.skippedCases}; total duration: ${report.summary.totalDurationMs.toFixed(1)} ms`,
    '',
    '| Rank | Category | Test file | Duration | Failures | Cost cause |',
    '| ---: | --- | --- | ---: | ---: | --- |',
  ];
  report.slowestFiles.forEach((file, index) => {
    lines.push(
      `| ${index + 1} | ${file.category} | ${file.file.replaceAll('|', '\\|')} | ${file.durationMs.toFixed(1)} ms | ${file.failedCount} | ${file.costCause} |`,
    );
  });
  lines.push('');
  return `${lines.join('\n')}\n`;
}

if (import.meta.main) {
  const inputArgument = parseArgument('input');
  const outputArgument = parseArgument('output');
  if (!inputArgument || !outputArgument) {
    console.error(
      '[aggregate] usage: bun scripts/test-feedback/aggregate-results.ts --input=DIR --output=FILE',
    );
    process.exit(2);
  }

  const inputDirectory = resolve(repositoryRoot, inputArgument);
  const outputPath = resolve(repositoryRoot, outputArgument);
  const report = aggregateJUnitResults(inputDirectory);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    outputPath.replace(/\.json$/i, '-timings.json'),
    `${JSON.stringify(report.timings, null, 2)}\n`,
  );
  writeFileSync(outputPath.replace(/\.json$/i, '.md'), renderSlowTestMarkdown(report));
  console.log(
    `[aggregate] ${report.summary.totalCases} cases from ${report.summary.junitFiles} JUnit file(s)`,
  );
}
