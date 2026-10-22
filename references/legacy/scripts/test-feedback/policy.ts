export const FEEDBACK_TIERS = ['local', 'pr', 'nightly', 'release'] as const;
export type FeedbackTier = (typeof FEEDBACK_TIERS)[number];

export interface TestFeedbackPolicy {
  failOnFlakyTests: boolean;
  randomize: boolean;
  repeatEach: number;
  retries: number;
  tier: FeedbackTier;
}

function isFeedbackTier(value: string | undefined): value is FeedbackTier {
  return value !== undefined && FEEDBACK_TIERS.includes(value as FeedbackTier);
}

export function feedbackTier(env: NodeJS.ProcessEnv = process.env): FeedbackTier {
  if (isFeedbackTier(env.TEST_FEEDBACK_TIER)) return env.TEST_FEEDBACK_TIER;
  if (env.GITHUB_EVENT_NAME === 'schedule') return 'nightly';
  if (env.CI) return 'pr';
  return 'local';
}

/** Required tests never turn a retry success into a green result. */
export function testFeedbackPolicy(env: NodeJS.ProcessEnv = process.env): TestFeedbackPolicy {
  const tier = feedbackTier(env);
  const longRunningTier = tier === 'nightly';
  return {
    tier,
    retries: 0,
    repeatEach: longRunningTier ? 3 : 1,
    randomize: longRunningTier,
    failOnFlakyTests: true,
  };
}

export function assertRequiredNoRetry(policy: TestFeedbackPolicy): void {
  if (policy.retries !== 0 || !policy.failOnFlakyTests) {
    throw new Error('Required test feedback must preserve the first failure and use zero retries.');
  }
}
