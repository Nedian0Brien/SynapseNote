import {
  assertNoTestRuntimeLeaks,
  captureTestRuntimeState,
  restoreEnvironment,
  type TestRuntimeState,
  trackTestResource,
} from './leak-detector.ts';

export interface TestIsolation {
  assertClean(): void;
  registerCleanup(cleanup: () => void | Promise<void>): void;
  trackResource(kind: string, label: string): () => void;
  restore(): Promise<void>;
}

export function createTestIsolation(
  label: string,
  options: { allowedEnvironmentKeys?: string[] } = {},
): TestIsolation {
  const environment = { ...process.env };
  const before = captureTestRuntimeState();
  const cleanups: Array<() => void | Promise<void>> = [];

  const assertClean = (): void => {
    assertNoTestRuntimeLeaks(before, captureTestRuntimeState(), {
      allowedEnvironmentKeys: options.allowedEnvironmentKeys,
      label,
    });
  };

  return {
    assertClean,
    registerCleanup(cleanup) {
      cleanups.push(cleanup);
    },
    trackResource(kind, resourceLabel) {
      const release = trackTestResource(kind, resourceLabel);
      cleanups.push(release);
      return release;
    },
    async restore() {
      let cleanupError: unknown;
      for (const cleanup of [...cleanups].reverse()) {
        try {
          await cleanup();
        } catch (error) {
          cleanupError ??= error;
        }
      }
      try {
        assertClean();
      } finally {
        restoreEnvironment(environment);
      }
      if (cleanupError) throw cleanupError;
    },
  };
}

export async function withTestIsolation<T>(
  label: string,
  callback: (isolation: TestIsolation) => T | Promise<T>,
  options: { allowedEnvironmentKeys?: string[] } = {},
): Promise<T> {
  const isolation = createTestIsolation(label, options);
  let result: T;
  try {
    result = await callback(isolation);
  } catch (error) {
    try {
      await isolation.restore();
    } catch {
      // Preserve the original assertion or fixture error when cleanup also fails.
    }
    throw error;
  }
  await isolation.restore();
  return result;
}

export type { TestRuntimeState };
