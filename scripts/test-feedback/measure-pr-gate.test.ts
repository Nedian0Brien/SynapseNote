import { describe, expect, test } from 'bun:test';

import { PR_GATE_COMMANDS, PR_GATE_SCENARIOS, prGateEnvironment } from './measure-pr-gate.ts';

describe('PR gate benchmark scenarios', () => {
  test('covers the three representative change shapes', () => {
    expect(PR_GATE_SCENARIOS).toEqual(['app-only', 'server-only', 'cross-package']);
    expect(PR_GATE_COMMANDS['app-only']).toEqual(['run', 'check:package', '--', 'app']);
    expect(PR_GATE_COMMANDS['server-only']).toEqual([
      'scripts/test-feedback/run-server-pr-gate.ts',
    ]);
    expect(PR_GATE_COMMANDS['cross-package']).toEqual(['run', 'check:repository']);
  });

  test('keeps server logs and JUnit results separate for every repeat', () => {
    expect(prGateEnvironment('server-only', '/tmp/pr-gate', 7)).toEqual({
      TEST_FEEDBACK_TIER: 'pr',
      SERVER_PR_GATE_LOG_DIR: '/tmp/pr-gate/server/7',
      SERVER_PR_GATE_RESULTS_DIR: '/tmp/pr-gate/server-results/7',
    });
    expect(prGateEnvironment('app-only', '/tmp/pr-gate', 7)).toEqual({
      TEST_FEEDBACK_TIER: 'pr',
    });
  });
});
