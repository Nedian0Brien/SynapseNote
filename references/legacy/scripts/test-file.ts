import { existsSync, mkdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { repositoryRoot, runBun, runBunScript } from './test-feedback/command.ts';

function fail(message: string): never {
  console.error(`[test:file] error: ${message}`);
  process.exit(2);
}

function isInsideRepository(path: string): boolean {
  const relativePath = relative(repositoryRoot, path);
  return relativePath === '' || (!relativePath.startsWith('../') && relativePath !== '..');
}

function resolveTestPath(input: string): string {
  const candidates = [resolve(repositoryRoot, input), resolve(process.cwd(), input)];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) fail(`test path does not exist: ${input}`);
  if (!isInsideRepository(path)) fail(`test path must be inside the repository: ${input}`);
  if (!statSync(path).isFile()) fail(`test path is not a file: ${input}`);

  const relativePath = relative(repositoryRoot, path).replaceAll('\\', '/');
  if (!/(?:\.test|\.spec|\.e2e)\.[cm]?[jt]sx?$/.test(relativePath)) {
    fail(`not a recognized test file (expected .test.*, .spec.*, or .e2e.*): ${input}`);
  }
  return relativePath;
}

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args.length === 0) fail('expected at least one test file path');

const testPaths: string[] = [];
const forwardedArgs: string[] = [];
const optionValues = new Set(['--test-name-pattern', '--timeout', '--max-concurrency']);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg.startsWith('-')) {
    forwardedArgs.push(arg);
    if (optionValues.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) fail(`${arg} requires a value`);
      forwardedArgs.push(value);
      index += 1;
    }
    continue;
  }
  testPaths.push(resolveTestPath(arg));
}
if (testPaths.length === 0) fail('no test file path was provided');

const domPaths = testPaths.filter((path) => path.endsWith('.dom.test.tsx'));
const legacyDomPaths = testPaths.filter((path) => path.endsWith('.dom.test.ts'));
if (legacyDomPaths.length > 0) {
  fail(`DOM tests must use the .dom.test.tsx suffix: ${legacyDomPaths.join(', ')}`);
}
if (domPaths.length > 0 && domPaths.length !== testPaths.length) {
  fail('DOM and non-DOM files must be run in separate test:file invocations');
}
if (domPaths.some((path) => !path.startsWith('packages/app/'))) {
  fail('DOM test:file routing currently supports packages/app only');
}

const status = (() => {
  const resultDirectory = process.env.TEST_RESULTS_DIR;
  const reporterArgs = resultDirectory
    ? (() => {
        const absoluteResultDirectory = resolve(repositoryRoot, resultDirectory);
        mkdirSync(absoluteResultDirectory, { recursive: true });
        return [
          '--reporter=junit',
          `--reporter-outfile=${resolve(absoluteResultDirectory, 'test-file.xml')}`,
        ];
      })()
    : [];
  return domPaths.length > 0
    ? runBunScript([
        '--cwd',
        'packages/app',
        'test:dom',
        ...domPaths.map((path) => path.slice('packages/app/'.length)),
        ...forwardedArgs,
        ...reporterArgs,
      ])
    : runBun({
        args: [
          'test',
          '--timeout',
          '30000',
          '--conditions',
          'development',
          ...testPaths,
          ...forwardedArgs,
          ...reporterArgs,
        ],
        label: `file tests: ${testPaths.join(', ')}`,
      });
})();

process.exit(status);
