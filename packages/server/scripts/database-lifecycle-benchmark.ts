import { runDatabaseLifecycleBenchmark } from '../src/database-lifecycle-benchmark.ts';

const result = await runDatabaseLifecycleBenchmark();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
