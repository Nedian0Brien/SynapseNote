import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';
import type { DatabaseAutomationAction } from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import { z } from 'zod';

const ConnectionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().startsWith('conn_'),
      kind: z.literal('webhook'),
      url: z.string().url(),
      allowedHosts: z.array(z.string().min(1)).min(1).max(20),
      allowPrivateNetwork: z.boolean().default(false),
      headers: z.record(z.string().min(1), z.string()).default({}),
      maxEgressBytes: z.number().int().min(1).max(10_000_000).default(1_000_000),
    })
    .strict(),
  z
    .object({
      id: z.string().startsWith('conn_'),
      kind: z.literal('email_http'),
      endpoint: z.string().url(),
      allowedHosts: z.array(z.string().min(1)).min(1).max(20),
      allowPrivateNetwork: z.boolean().default(false),
      apiKeyHeader: z.string().min(1).max(100).default('authorization'),
      apiKey: z.string().min(1).max(10_000),
      from: z.string().email(),
      allowedRecipientDomains: z.array(z.string().min(1)).min(1).max(100),
      maxEgressBytes: z.number().int().min(1).max(10_000_000).default(1_000_000),
    })
    .strict(),
]);

const ConnectionsSchema = z
  .object({ version: z.literal(1), connections: z.array(ConnectionSchema).max(100) })
  .strict();

const DeliverySchema = z
  .object({
    idempotencyKeyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    connectionId: z.string().startsWith('conn_'),
    state: z.enum(['pending', 'succeeded']),
    receiptId: z.string().startsWith('delivery_'),
    updatedAt: z.string().datetime(),
  })
  .strict();

const DeliveriesSchema = z
  .object({ version: z.literal(1), deliveries: z.array(DeliverySchema).max(5_000) })
  .strict();

type ExternalAction = Extract<
  DatabaseAutomationAction,
  { kind: 'external_webhook' | 'external_email' }
>;

function hash(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function privateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    const [a = 0, b = 0] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (mappedIpv4 && privateAddress(mappedIpv4)) return true;
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  );
}

export class DatabaseConnectionExecutor {
  readonly #connectionsPath: string;
  readonly #deliveriesPath: string;
  readonly #lockPath: string;
  readonly #fetch: typeof fetch;
  readonly #resolveAddresses: (host: string) => Promise<string[]>;
  readonly #now: () => Date;

  constructor(options: {
    projectDir: string;
    fetch?: typeof fetch;
    resolveAddresses?: (host: string) => Promise<string[]>;
    now?: () => Date;
  }) {
    const localDir = resolve(options.projectDir, '.ok', 'local');
    this.#connectionsPath = resolve(localDir, 'database-connections.json');
    this.#deliveriesPath = resolve(localDir, 'database-deliveries.json');
    this.#lockPath = resolve(localDir, '.database-delivery.lock');
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#resolveAddresses =
      options.resolveAddresses ??
      (async (host) => (await lookup(host, { all: true })).map((entry) => entry.address));
    this.#now = options.now ?? (() => new Date());
  }

  resolvePolicy(input: { action: ExternalAction; egressBytes: number }): {
    allowed: boolean;
    policyId: string;
    policyRevision: string;
    maxEgressBytes: number;
    reason?: string;
  } {
    let connections: z.infer<typeof ConnectionsSchema>;
    try {
      connections = ConnectionsSchema.parse(
        JSON.parse(readFileSync(this.#connectionsPath, 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const policyRevision = hash(JSON.stringify({ missing: input.action.connectionId }));
      return {
        allowed: false,
        policyId: `connection:${input.action.connectionId}`,
        policyRevision,
        maxEgressBytes: 0,
        reason: 'connection_not_found',
      };
    }
    const connection = connections.connections.find(
      (candidate) => candidate.id === input.action.connectionId,
    );
    const policyRevision = hash(
      JSON.stringify(
        connection
          ? {
              id: connection.id,
              kind: connection.kind,
              allowedHosts: connection.allowedHosts,
              allowPrivateNetwork: connection.allowPrivateNetwork,
              maxEgressBytes: connection.maxEgressBytes,
              ...(connection.kind === 'email_http'
                ? { allowedRecipientDomains: connection.allowedRecipientDomains }
                : {}),
            }
          : { missing: input.action.connectionId },
      ),
    );
    if (!connection) {
      return {
        allowed: false,
        policyId: `connection:${input.action.connectionId}`,
        policyRevision,
        maxEgressBytes: 0,
        reason: 'connection_not_found',
      };
    }
    if (
      (input.action.kind === 'external_webhook' && connection.kind !== 'webhook') ||
      (input.action.kind === 'external_email' && connection.kind !== 'email_http')
    ) {
      return {
        allowed: false,
        policyId: `connection:${connection.id}`,
        policyRevision,
        maxEgressBytes: connection.maxEgressBytes,
        reason: 'connection_kind_mismatch',
      };
    }
    if (input.action.kind === 'external_email' && connection.kind === 'email_http') {
      const denied = input.action.to.find(
        (address) =>
          !connection.allowedRecipientDomains.includes(
            address.split('@').at(-1)?.toLowerCase() ?? '',
          ),
      );
      if (denied) {
        return {
          allowed: false,
          policyId: `connection:${connection.id}`,
          policyRevision,
          maxEgressBytes: connection.maxEgressBytes,
          reason: 'recipient_domain_denied',
        };
      }
    }
    return {
      allowed: input.egressBytes <= connection.maxEgressBytes,
      policyId: `connection:${connection.id}`,
      policyRevision,
      maxEgressBytes: connection.maxEgressBytes,
      ...(input.egressBytes > connection.maxEgressBytes ? { reason: 'egress_limit_exceeded' } : {}),
    };
  }

  async deliver(input: {
    connectionId: string;
    kind: 'external_webhook' | 'external_email';
    payload: Readonly<Record<string, unknown>>;
    idempotencyKey: string;
  }): Promise<{ receiptId: string }> {
    await mkdir(dirname(this.#lockPath), { recursive: true });
    return withFileLock(this.#lockPath, async () => {
      const connections = await this.#connections();
      const connection = connections.connections.find(
        (candidate) => candidate.id === input.connectionId,
      );
      if (!connection) throw new Error('External database connection was not found');
      if (
        (input.kind === 'external_webhook' && connection.kind !== 'webhook') ||
        (input.kind === 'external_email' && connection.kind !== 'email_http')
      ) {
        throw new Error('External database connection kind does not match the action');
      }
      const url = new URL(connection.kind === 'webhook' ? connection.url : connection.endpoint);
      if (url.protocol !== 'https:') throw new Error('External database connections require HTTPS');
      if (!connection.allowedHosts.includes(url.hostname)) {
        throw new Error('External database connection host is outside its allowlist');
      }
      const addresses = await this.#resolveAddresses(url.hostname);
      if (
        addresses.length === 0 ||
        (!connection.allowPrivateNetwork && addresses.some(privateAddress))
      ) {
        throw new Error('External database connection resolved to a blocked network');
      }
      const body =
        connection.kind === 'webhook'
          ? JSON.stringify(input.payload)
          : JSON.stringify({
              from: connection.from,
              to: input.payload.to,
              subject: input.payload.subject,
              data: input.payload,
            });
      if (Buffer.byteLength(body) > connection.maxEgressBytes) {
        throw new Error('External database delivery exceeds its egress limit');
      }
      const deliveries = await this.#deliveries();
      const idempotencyKeyHash = hash(input.idempotencyKey);
      const fingerprint = hash(
        JSON.stringify({
          connectionId: input.connectionId,
          kind: input.kind,
          payload: input.payload,
        }),
      );
      const existing = deliveries.deliveries.find(
        (delivery) => delivery.idempotencyKeyHash === idempotencyKeyHash,
      );
      if (existing?.fingerprint !== undefined && existing.fingerprint !== fingerprint) {
        throw new Error('External delivery idempotency key was reused with a new payload');
      }
      if (existing?.state === 'succeeded') return { receiptId: existing.receiptId };
      const receiptId = existing?.receiptId ?? `delivery_${idempotencyKeyHash.slice(7, 39)}`;
      const pending = DeliverySchema.parse({
        idempotencyKeyHash,
        fingerprint,
        connectionId: connection.id,
        state: 'pending',
        receiptId,
        updatedAt: this.#now().toISOString(),
      });
      deliveries.deliveries = [
        pending,
        ...deliveries.deliveries.filter(
          (delivery) => delivery.idempotencyKeyHash !== idempotencyKeyHash,
        ),
      ].slice(0, 5_000);
      await this.#writeDeliveries(deliveries);
      const response = await this.#fetch(url, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': input.idempotencyKey,
          ...(connection.kind === 'webhook'
            ? connection.headers
            : { [connection.apiKeyHeader]: connection.apiKey }),
        },
        body,
      });
      if (!response.ok)
        throw new Error(`External database delivery failed with HTTP ${response.status}`);
      pending.state = 'succeeded';
      pending.updatedAt = this.#now().toISOString();
      await this.#writeDeliveries(deliveries);
      return { receiptId };
    });
  }

  async #connections(): Promise<z.infer<typeof ConnectionsSchema>> {
    return ConnectionsSchema.parse(JSON.parse(await readFile(this.#connectionsPath, 'utf8')));
  }

  async #deliveries(): Promise<z.infer<typeof DeliveriesSchema>> {
    try {
      return DeliveriesSchema.parse(JSON.parse(await readFile(this.#deliveriesPath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, deliveries: [] };
      throw error;
    }
  }

  async #writeDeliveries(deliveries: z.infer<typeof DeliveriesSchema>): Promise<void> {
    await atomicWriteFile(
      this.#deliveriesPath,
      `${JSON.stringify(DeliveriesSchema.parse(deliveries), null, 2)}\n`,
    );
  }
}

export function createDatabaseConnectionExecutor(options: {
  projectDir: string;
  fetch?: typeof fetch;
  resolveAddresses?: (host: string) => Promise<string[]>;
  now?: () => Date;
}) {
  return new DatabaseConnectionExecutor(options);
}
