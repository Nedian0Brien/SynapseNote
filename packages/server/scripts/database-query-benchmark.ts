import { runWarmTypedQueryBenchmark } from '../src/database-performance-benchmark.ts';

function numeric(name: string): number | undefined {
  const index = Bun.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = Number(Bun.argv[index + 1]);
  return Number.isFinite(value) ? value : undefined;
}

const result = runWarmTypedQueryBenchmark({
  scale: '50k',
  warmups: numeric('--warmups'),
  samples: numeric('--samples'),
  budgetMs: 150,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
