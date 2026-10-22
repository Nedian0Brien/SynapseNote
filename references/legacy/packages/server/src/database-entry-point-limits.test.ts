import { describe, expect, test } from 'bun:test';
import { DatabaseAgentEntryPointLimiter } from './database-entry-point-limits.ts';

describe('DatabaseAgentEntryPointLimiter', () => {
  test('bounds calls and resets an idle session after the fixed window', () => {
    let now = 1_000;
    const limiter = new DatabaseAgentEntryPointLimiter({
      requestsPerWindow: 2,
      windowMs: 10_000,
      now: () => now,
    });
    expect(limiter.acquire('agent:a:session:s')).toEqual({ ok: true });
    limiter.release('agent:a:session:s');
    expect(limiter.acquire('agent:a:session:s')).toEqual({ ok: true });
    limiter.release('agent:a:session:s');
    expect(limiter.acquire('agent:a:session:s')).toEqual({
      ok: false,
      reason: 'rate_limit',
      retryAfterSeconds: 10,
    });
    now += 10_000;
    expect(limiter.acquire('agent:a:session:s')).toEqual({ ok: true });
  });

  test('bounds in-flight work and tracked session cardinality', () => {
    const limiter = new DatabaseAgentEntryPointLimiter({
      maxConcurrent: 1,
      maxTrackedSessions: 1,
    });
    expect(limiter.acquire('one')).toEqual({ ok: true });
    expect(limiter.acquire('one')).toMatchObject({ ok: false, reason: 'concurrency_limit' });
    expect(limiter.acquire('two')).toMatchObject({ ok: false, reason: 'capacity_limit' });
    limiter.release('one');
  });
});
