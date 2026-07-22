import { afterEach, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseConnectionExecutor } from './database-connection-executor.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-connections-'));
  tempDirs.push(projectDir);
  const localDir = join(projectDir, '.ok', 'local');
  mkdirSync(localDir, { recursive: true });
  writeFileSync(
    join(localDir, 'database-connections.json'),
    JSON.stringify({
      version: 1,
      connections: [
        {
          id: 'conn_tasks',
          kind: 'webhook',
          url: 'https://hooks.example.test/tasks',
          allowedHosts: ['hooks.example.test'],
          allowPrivateNetwork: false,
          headers: { authorization: 'Bearer super-secret' },
          maxEgressBytes: 10_000,
        },
        {
          id: 'conn_mail',
          kind: 'email_http',
          endpoint: 'https://mail.example.test/send',
          allowedHosts: ['mail.example.test'],
          allowPrivateNetwork: false,
          apiKeyHeader: 'x-api-key',
          apiKey: 'mail-secret',
          from: 'synapse@example.test',
          allowedRecipientDomains: ['example.test'],
          maxEgressBytes: 10_000,
        },
      ],
    }),
  );
  return projectDir;
}

describe('DatabaseConnectionExecutor', () => {
  test('keeps secrets local, enforces egress policy, and replays webhook delivery', async () => {
    const projectDir = fixture();
    const requests: Array<{ headers: Headers; body: string }> = [];
    const fetcher = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push({ headers: new Headers(init?.headers), body: String(init?.body) });
      return new Response('', { status: 202 });
    }) as typeof fetch;
    const executor = createDatabaseConnectionExecutor({
      projectDir,
      fetch: fetcher,
      resolveAddresses: async () => ['203.0.113.10'],
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });
    const action = {
      id: 'publish',
      kind: 'external_webhook' as const,
      connectionId: 'conn_tasks',
      eventName: 'task_changed',
      propertyIds: [],
      includeBody: false,
    };
    const policy = executor.resolvePolicy({ action, egressBytes: 100 });
    expect(policy).toMatchObject({ allowed: true, maxEgressBytes: 10_000 });
    expect(JSON.stringify(policy)).not.toContain('super-secret');
    const input = {
      connectionId: 'conn_tasks',
      kind: 'external_webhook' as const,
      payload: { eventName: 'task_changed', recordId: 'rec_one' },
      idempotencyKey: 'automation-run:one:action:publish',
    };
    const delivered = await executor.deliver(input);
    expect(await executor.deliver(input)).toEqual(delivered);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer super-secret');
    expect(requests[0]?.headers.get('idempotency-key')).toBe(input.idempotencyKey);
  });

  test('rejects email recipients outside the connection allowlist and private DNS targets', async () => {
    const projectDir = fixture();
    const executor = createDatabaseConnectionExecutor({
      projectDir,
      fetch: mock(async () => new Response('', { status: 202 })) as typeof fetch,
      resolveAddresses: async () => ['127.0.0.1'],
    });
    const email = {
      id: 'email',
      kind: 'external_email' as const,
      connectionId: 'conn_mail',
      to: ['person@outside.test'],
      subject: 'Task changed',
      propertyIds: [],
      includeBody: false,
    };
    expect(executor.resolvePolicy({ action: email, egressBytes: 100 })).toMatchObject({
      allowed: false,
      reason: 'recipient_domain_denied',
    });
    await expect(
      executor.deliver({
        connectionId: 'conn_tasks',
        kind: 'external_webhook',
        payload: { eventName: 'task_changed' },
        idempotencyKey: 'automation-run:private:action:publish',
      }),
    ).rejects.toThrow(/blocked network/i);
  });

  test('rejects IPv4-mapped IPv6 loopback targets', async () => {
    const executor = createDatabaseConnectionExecutor({
      projectDir: fixture(),
      fetch: mock(async () => new Response('', { status: 202 })) as typeof fetch,
      resolveAddresses: async () => ['::ffff:127.0.0.1'],
    });
    await expect(
      executor.deliver({
        connectionId: 'conn_tasks',
        kind: 'external_webhook',
        payload: { eventName: 'task_changed' },
        idempotencyKey: 'automation-run:mapped-loopback:action:publish',
      }),
    ).rejects.toThrow(/blocked network/i);
  });
});
