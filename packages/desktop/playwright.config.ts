import { defineConfig } from '@playwright/test';

import { testFeedbackPolicy } from '../../scripts/test-feedback/policy.ts';

const feedbackPolicy = testFeedbackPolicy();

/**
 * Desktop-package Playwright config.
 *
 * Scopes to `tests/smoke/*.e2e.ts` — Electron-launch + URL-scheme + packaged-
 * build smoke tests. Runs independently from `packages/app`'s Playwright config
 * (which exercises the React editor in a Chromium renderer) because the app
 * config relies on a Vite dev server fixture while desktop tests drive a real
 * Electron binary.
 *
 * Expected invocation: `bunx playwright test packages/desktop/tests/smoke/`
 * after the electron-vite build has produced `out/main/index.js` (via
 * `bun run build:desktop`). Individual tests guard against "built output
 * missing" with a `test.skip` + structured reason so CI runs without a
 * pre-build are informative rather than silently red.
 */

export default defineConfig({
  testDir: './tests/smoke',
  testMatch: /.*\.e2e\.ts$/,
  // Underscore-prefixed `_*.e2e.ts` are dev-only screenshot/utility scripts
  // (opt-in via OK_DESKTOP_E2E_SMOKE=1). They produce no assertions and exist
  // to capture rendered Electron output for visual comparison during design
  // iteration. Excluding them at the matcher level codifies the convention:
  // CI never runs them even if the smoke env var leaks in.
  testIgnore: ['**/_*.e2e.ts'],
  // CI gets 150s per test to accommodate cumulative inner timeouts on the
  // assertion path (helper waits + window-show + poll budgets can sum to
  // 80-140s on a slow macos-latest runner. 150s gives 10s headroom over the heaviest standard-
  // pattern test (create-new-project.e2e.ts at 140s). Tests that
  // structurally exceed this (e.g. qa-create-new-extended.e2e.ts which
  // launches Electron twice for cross-restart state checks) opt into a
  // launches Electron twice for cross-restart state checks) opt into a
  // structural reason is local to the test that needs it. Local dev keeps
  // 60s so real regressions surface immediately. Same CI-vs-local
  // 60s so real regressions surface immediately. Same CI-vs-local
  // divergence is controlled by the shared test feedback policy below.
  timeout: process.env.CI ? 150_000 : 60_000,
  // Required smoke keeps the first failure visible. Nightly uses repeatEach=3
  // through the shared policy instead of retrying a failed assertion.
  retries: feedbackPolicy.retries,
  repeatEach: feedbackPolicy.repeatEach,
  failOnFlakyTests: feedbackPolicy.failOnFlakyTests,
  // Fail-fast diagnostic when src/ is newer than out/. The smoke harness
  // launches `out/main/index.js` directly; if out/ is stale, tests run
  // against a phantom version of the app and produce failures unrelated to
  // the actual source. CI is unaffected (build runs immediately before
  // tests). See _helpers/stale-build-guard.ts for the rationale.
  globalSetup: './tests/smoke/_helpers/stale-build-guard.ts',
  // One worker — Electron launches are expensive, and these smokes don't
  // parallelize meaningfully (they poke at OS-level URL scheme dispatch).
  workers: 1,
  fullyParallel: false,
  // `html` reporter generates `playwright-report/` so testInfo.attach() body-
  // style attachments (e.g. `main-process-stderr` from the smoke tests'
  // electron-stderr capture) materialize as artifact files in the CI upload.
  // Without it, the workflow's `if-no-files-found: ignore` silently skips.
  // `open: never` suppresses the auto-open browser tab during local runs.
  // `json` writes machine-readable run stats so the desktop-smoke job can assert
  // the gate isn't vacuous (a whole-suite env-skip reads green but asserts
  // nothing). Parsed by scripts/assert-smoke-not-vacuous.mjs.
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/desktop-smoke-results.json' }],
  ],
  use: {
    // No baseURL — these tests don't hit HTTP.
    trace: 'retain-on-failure',
  },
});
