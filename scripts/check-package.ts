import { SUPPORTED_PACKAGE_KEYS, type SupportedPackageKey } from './test-feedback/affected.ts';
import { repositoryRoot, runBun } from './test-feedback/command.ts';

interface PackageCheckManifest {
  lintPaths: string[];
  name: string;
  testTasks: string[];
}

const PACKAGE_CHECKS: Record<SupportedPackageKey, PackageCheckManifest> = {
  app: {
    name: '@nedian0brien/synapsenote-app',
    lintPaths: ['packages/app'],
    testTasks: ['test', 'test:dom', 'test:integration', 'test:conversion'],
  },
  server: {
    name: '@nedian0brien/synapsenote-server',
    lintPaths: ['packages/server'],
    testTasks: [
      'test:unit',
      'test:database',
      'test:filesystem',
      'test:git',
      'test:process',
      'test:contract',
    ],
  },
  core: {
    name: '@nedian0brien/synapsenote-core',
    lintPaths: ['packages/core'],
    testTasks: ['test'],
  },
  cli: {
    name: '@nedian0brien/synapsenote',
    lintPaths: ['packages/cli'],
    testTasks: ['test'],
  },
  desktop: {
    name: '@nedian0brien/synapsenote-desktop',
    lintPaths: ['packages/desktop'],
    testTasks: ['test'],
  },
};

function fail(message: string): never {
  console.error(`[check:package] error: ${message}`);
  process.exit(2);
}

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args[0] === '--list') {
  for (const [key, manifest] of Object.entries(PACKAGE_CHECKS)) {
    console.log(`${key}\t${manifest.name}\ttasks=${manifest.testTasks.join(',')}`);
  }
  process.exit(0);
}

const packageKey = args[0] as SupportedPackageKey | undefined;
if (!packageKey || !SUPPORTED_PACKAGE_KEYS.includes(packageKey)) {
  fail(
    `expected one of ${SUPPORTED_PACKAGE_KEYS.join(', ')}; received ${packageKey ?? '(missing)'}`,
  );
}
if (args.length > 1) fail(`unexpected arguments: ${args.slice(1).join(' ')}`);

const manifest = PACKAGE_CHECKS[packageKey];
const isPrAppGate = process.env.TEST_FEEDBACK_TIER === 'pr' && packageKey === 'app';
const turboConcurrency = isPrAppGate ? '4' : '1';
const testTasks = isPrAppGate
  ? manifest.testTasks.flatMap((task) =>
      task === 'test:integration' ? ['test:integration:shard1', 'test:integration:shard2'] : [task],
    )
  : manifest.testTasks;
console.log(`[check:package] ${packageKey} (${manifest.name})`);
console.log(`[check:package] turbo concurrency=${turboConcurrency}`);
if (isPrAppGate)
  console.log('[check:package] PR app gate splits integration tests into two shards');

const lintStatus = runBun({
  args: [
    'x',
    'biome',
    'check',
    ...manifest.lintPaths,
    'package.json',
    'biome.jsonc',
    '--error-on-warnings',
  ],
  cwd: repositoryRoot,
  label: `${packageKey} biome lint`,
});
if (lintStatus !== 0) process.exit(lintStatus);

const oxlintStatus = runBun({
  args: ['x', 'oxlint', '--max-warnings', '0', ...manifest.lintPaths],
  cwd: repositoryRoot,
  label: `${packageKey} oxlint`,
});
if (oxlintStatus !== 0) process.exit(oxlintStatus);

const turboStatus = runBun({
  args: [
    'x',
    'turbo',
    'run',
    'typecheck',
    ...testTasks,
    `--filter=${manifest.name}`,
    `--concurrency=${turboConcurrency}`,
    '--summarize',
    '--output-logs=errors-only',
  ],
  cwd: repositoryRoot,
  label: `${packageKey} typecheck and tests`,
});
process.exit(turboStatus);
