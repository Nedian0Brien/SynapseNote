import { describe, expect, test } from 'bun:test';
import { runDatabaseResourceRegression } from './database-resource-regression.ts';

describe('database resource regression gate', () => {
  test('bounds the 50k retained projection, index payload, and context tokens', () => {
    const result = runDatabaseResourceRegression();
    expect(result).toMatchObject({
      version: 1,
      benchmark: 'database-resource-regression',
      scale: '50k',
      records: 50_000,
      passed: true,
      metrics: {
        retainedMemory: { model: 'js-structural-v1', passed: true },
        indexSize: { encoding: 'canonical-jsonl-utf8', passed: true },
        tokenUse: { tokenizer: 'utf8_bytes_div3', passed: true },
      },
    });
    expect(result.metrics.tokenUse.returned).toBeGreaterThan(0);
  });
});
