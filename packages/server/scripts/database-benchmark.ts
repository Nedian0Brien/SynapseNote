import { resolve } from 'node:path';
import {
  DATABASE_BENCHMARK_SCALES,
  type DatabaseBenchmarkScale,
  materializeDatabaseBenchmarkCorpus,
} from '../src/database-benchmark-corpus.ts';

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

const scale = argument('--scale') as DatabaseBenchmarkScale | undefined;
const output = argument('--out');
const format = argument('--format');
if (
  !scale ||
  !(scale in DATABASE_BENCHMARK_SCALES) ||
  !output ||
  (format !== undefined && format !== 'jsonl' && format !== 'markdown')
) {
  process.stderr.write(
    'Usage: bun scripts/database-benchmark.ts --scale <1k|50k|500k|1m> --out <empty-output-directory> [--format jsonl|markdown]\n',
  );
  process.exitCode = 2;
} else {
  const result = await materializeDatabaseBenchmarkCorpus({
    root: resolve(output),
    scale,
    ...(format ? { format } : {}),
  });
  process.stdout.write(
    `${JSON.stringify({ version: 1, scale, records: DATABASE_BENCHMARK_SCALES[scale], ...result })}\n`,
  );
}
