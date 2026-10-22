import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/test-feedback.yml', 'utf8');

describe('test feedback workflow contract', () => {
  test('manual dispatch can select one server shard', () => {
    expect(workflow).toContain('server_shard:');
    expect(workflow).toContain('default: all');
    expect(workflow).toContain('- 1/4');
    expect(workflow).toContain('- 4/4');
    expect(workflow).toContain('bun scripts/test-feedback/ci-plan.ts >> "$GITHUB_OUTPUT"');
    expect(workflow).not.toContain("selectedShard !== 'all' ? [selectedShard] : allShards");
  });

  test('server matrix preserves independent failure and artifact evidence', () => {
    expect(workflow).toContain('fail-fast: false');
    expect(workflow).toContain('fromJSON(needs.plan.outputs.server_shards)');
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain(`server-test-results-\${{ matrix.shard }}`);
    expect(workflow).toContain('needs: server-shards');
  });

  test('manual benchmarks expose the RFC repeat counts and metrics artifact', () => {
    expect(workflow).toContain('benchmark_server_shards:');
    expect(workflow).toContain('benchmark_pr_gate:');
    expect(workflow).toContain("SERVER_SHARD_REPEATS: '3'");
    expect(workflow).toContain("PR_GATE_REPEATS: '10'");
    expect(workflow).toContain(
      `SERVER_PR_GATE_LOG_DIR: pr-gate-logs/\${{ matrix.scenario }}/server`,
    );
    expect(workflow).toContain('server-test-feedback-metrics.json');
    expect(workflow).toContain('server-operations-weekly-report.json');
    expect(workflow).toContain('operations-weekly:');
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('--require-weeks=4');
    expect(workflow).toContain(`package-feedback-metrics-\${{ matrix.package }}`);
    expect(workflow).toContain('repository-feedback-metrics.json');
    expect(workflow).toContain(`pr-gate-benchmark-\${{ matrix.scenario }}`);
  });
});
