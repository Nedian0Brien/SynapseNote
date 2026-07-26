import { assertNoTestRuntimeLeaks, captureTestRuntimeState } from './leak-detector.ts';

const before = captureTestRuntimeState();

process.on('exit', () => {
  try {
    assertNoTestRuntimeLeaks(before, captureTestRuntimeState(), {
      label: 'test process',
      allowedEnvironmentKeys: ['BUN_TEST_WORKER_ID'],
    });
  } catch (error) {
    console.error(`[test-feedback] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
});
