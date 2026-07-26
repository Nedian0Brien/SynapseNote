import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { repositoryRoot, runBun } from './command.ts';
import { feedbackTier, testFeedbackPolicy } from './policy.ts';

const seedValue = process.argv.find((arg) => arg.startsWith('--seed='))?.slice('--seed='.length);
const seed = Number(seedValue);
if (!Number.isInteger(seed) || seed < 0) {
  console.error('[shuffle] --seed=INTEGER is required');
  process.exit(2);
}

const policy = testFeedbackPolicy({ ...process.env, TEST_FEEDBACK_TIER: 'nightly' });
const resultDirectory = process.env.TEST_RESULTS_DIR ?? 'test-results/shuffle';
const absoluteResultDirectory = isAbsolute(resultDirectory)
  ? resultDirectory
  : join(repositoryRoot, 'packages/server', resultDirectory);
mkdirSync(absoluteResultDirectory, { recursive: true });
const startedAt = new Date().toISOString();
const status = runBun({
  cwd: repositoryRoot,
  env: { TEST_FEEDBACK_TIER: 'nightly' },
  args: [
    'packages/server/scripts/run-server-test-task.ts',
    'unit',
    '--randomize',
    `--seed=${seed}`,
    `--rerun-each=${policy.repeatEach}`,
  ],
  label: `nightly server unit shuffle seed=${seed}`,
});
writeFileSync(
  join(absoluteResultDirectory, `shuffle-${seed}.json`),
  `${JSON.stringify(
    {
      seed,
      tier: feedbackTier({ TEST_FEEDBACK_TIER: 'nightly' }),
      repeatEach: policy.repeatEach,
      retries: policy.retries,
      startedAt,
      finishedAt: new Date().toISOString(),
      status,
    },
    null,
  )}\n`,
);
process.exit(status);
