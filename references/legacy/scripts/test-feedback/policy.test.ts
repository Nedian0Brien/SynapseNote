import { describe, expect, test } from 'bun:test';

import { assertRequiredNoRetry, feedbackTier, testFeedbackPolicy } from './policy.ts';

describe('test feedback policy', () => {
  test('required local and PR gates do not retry or hide flaky failures', () => {
    for (const env of [{}, { CI: 'true' }, { TEST_FEEDBACK_TIER: 'pr' }]) {
      const policy = testFeedbackPolicy(env);
      expect(policy.retries).toBe(0);
      expect(policy.repeatEach).toBe(1);
      expect(policy.failOnFlakyTests).toBe(true);
      assertRequiredNoRetry(policy);
    }
  });

  test('nightly uses deterministic repetition and randomization instead of retry masking', () => {
    const policy = testFeedbackPolicy({ TEST_FEEDBACK_TIER: 'nightly' });
    expect(policy).toEqual({
      tier: 'nightly',
      retries: 0,
      repeatEach: 3,
      randomize: true,
      failOnFlakyTests: true,
    });
    expect(feedbackTier({ GITHUB_EVENT_NAME: 'schedule', CI: 'true' })).toBe('nightly');
  });
});
