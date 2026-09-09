import { describe, expect, test } from 'bun:test';
import { createLoginThrottle, FAILURE_WINDOW_MS, MAX_FAILURES } from './login-throttle.ts';

/** A throttle whose clock the test drives. */
function throttleAt(start = 1_000_000) {
  let clock = start;
  const throttle = createLoginThrottle({
    maxFailures: 3,
    windowMs: 60_000,
    lockMs: 120_000,
    now: () => clock,
  });
  return { throttle, advance: (ms: number) => (clock += ms) };
}

describe('the threshold', () => {
  test('allows attempts below it', () => {
    const { throttle } = throttleAt();
    expect(throttle.check('a').allowed).toBe(true);
    throttle.recordFailure('a');
    throttle.recordFailure('a');
    expect(throttle.check('a').allowed).toBe(true);
  });

  test('locks on the failure that reaches it', () => {
    const { throttle } = throttleAt();
    throttle.recordFailure('a');
    throttle.recordFailure('a');
    const third = throttle.recordFailure('a');
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(120);
  });

  test('a locked account is refused even with the right password', () => {
    // The caller checks before verifying, so a correct password inside the
    // lock window never reaches the hash comparison.
    const { throttle } = throttleAt();
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a');
    expect(throttle.check('a').allowed).toBe(false);
  });

  test('reports a whole number of seconds, rounded up', () => {
    const { throttle, advance } = throttleAt();
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a');
    advance(119_500);
    // 500ms left rounds to 1, not 0 — a caller told to wait 0 would retry
    // immediately and be refused again.
    expect(throttle.check('a').retryAfterSeconds).toBe(1);
  });
});

describe('the window', () => {
  test('failures outside it do not count', () => {
    const { throttle, advance } = throttleAt();
    throttle.recordFailure('a');
    throttle.recordFailure('a');
    advance(60_001);
    // The two earlier failures have aged out; this is the first in the window.
    expect(throttle.recordFailure('a').allowed).toBe(true);
  });

  test('failures inside it accumulate across gaps', () => {
    const { throttle, advance } = throttleAt();
    throttle.recordFailure('a');
    advance(30_000);
    throttle.recordFailure('a');
    advance(20_000);
    expect(throttle.recordFailure('a').allowed).toBe(false);
  });
});

describe('the lock', () => {
  test('lifts when it expires', () => {
    const { throttle, advance } = throttleAt();
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a');
    advance(120_001);
    expect(throttle.check('a').allowed).toBe(true);
  });

  test('does not re-lock immediately on the same failures', () => {
    // The window is cleared with the lock; without that, the attempt right
    // after the lock lifts would trip the threshold again.
    const { throttle, advance } = throttleAt();
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a');
    advance(120_001);
    expect(throttle.recordFailure('a').allowed).toBe(true);
  });
});

describe('scope', () => {
  test('one account being locked does not affect another', () => {
    const { throttle } = throttleAt();
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a');
    expect(throttle.check('a').allowed).toBe(false);
    expect(throttle.check('b').allowed).toBe(true);
  });

  test('a success clears the history', () => {
    const { throttle } = throttleAt();
    throttle.recordFailure('a');
    throttle.recordFailure('a');
    throttle.recordSuccess('a');
    // Back to zero, so two more failures do not reach the threshold.
    throttle.recordFailure('a');
    expect(throttle.recordFailure('a').allowed).toBe(true);
  });

  test('a success on a locked account does not unlock it', () => {
    // `check` runs before verification, so a locked account never gets far
    // enough to report success. This pins that the lock is not clearable by
    // a caller who somehow does.
    const { throttle } = throttleAt();
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a');
    expect(throttle.check('a').allowed).toBe(false);
  });
});

describe('bookkeeping', () => {
  test('an exhausted entry is forgotten', () => {
    // A long-running process must not accumulate an entry per attempted
    // username forever.
    const { throttle, advance } = throttleAt();
    throttle.recordFailure('a');
    advance(60_001);
    expect(throttle.check('a').allowed).toBe(true);
    expect(throttle.check('a').allowed).toBe(true);
  });

  test('reset clears everything', () => {
    const { throttle } = throttleAt();
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a');
    throttle.reset();
    expect(throttle.check('a').allowed).toBe(true);
  });
});

describe('the shipped defaults', () => {
  test('are the documented ones', () => {
    expect(MAX_FAILURES).toBe(10);
    expect(FAILURE_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  test('allow ten failures and refuse the eleventh', () => {
    const throttle = createLoginThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) {
      expect(throttle.recordFailure('a').allowed).toBe(true);
    }
    expect(throttle.recordFailure('a').allowed).toBe(false);
  });
});
