import type { DatabasePublicShareTarget } from '@nedian0brien/synapsenote-core';

export interface DatabasePublicShare {
  version: 1;
  id: string;
  target: DatabasePublicShareTarget;
  access: 'public' | 'link';
  propertyIds: string[];
  allowBody: boolean;
  allowFormSubmission: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class DatabasePublicSharesClientError extends Error {
  readonly status: number;
  readonly problem: unknown;

  constructor(message: string, status: number, problem: unknown) {
    super(message);
    this.name = 'DatabasePublicSharesClientError';
    this.status = status;
    this.problem = problem;
  }
}

function isRevision(value: unknown): value is string {
  return (
    value === 'sha256:empty' || (typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value))
  );
}

function parseShare(value: unknown): DatabasePublicShare {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabasePublicSharesClientError('Invalid public share', 502, value);
  }
  const share = value as Record<string, unknown>;
  if (
    share.version !== 1 ||
    typeof share.id !== 'string' ||
    !/^dbshare_[a-f0-9-]{36}$/.test(share.id) ||
    !share.target ||
    typeof share.target !== 'object' ||
    (share.access !== 'public' && share.access !== 'link') ||
    !Array.isArray(share.propertyIds) ||
    share.propertyIds.some((id) => typeof id !== 'string' || !id.startsWith('prop_')) ||
    typeof share.allowBody !== 'boolean' ||
    typeof share.allowFormSubmission !== 'boolean' ||
    (share.expiresAt !== null && typeof share.expiresAt !== 'string') ||
    (share.revokedAt !== null && typeof share.revokedAt !== 'string') ||
    typeof share.createdAt !== 'string' ||
    typeof share.updatedAt !== 'string' ||
    'tokenHash' in share ||
    'createdBy' in share
  ) {
    throw new DatabasePublicSharesClientError('Incomplete public share', 502, value);
  }
  return share as unknown as DatabasePublicShare;
}

async function post(
  body: unknown,
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal },
): Promise<Record<string, unknown>> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/public-shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && 'detail' in value && typeof value.detail === 'string'
        ? value.detail
        : `HTTP ${response.status}`;
    throw new DatabasePublicSharesClientError(message, response.status, value);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabasePublicSharesClientError('Invalid public shares response', 502, value);
  }
  return value as Record<string, unknown>;
}

export async function accessDatabasePublicShare(
  input: {
    action: 'resolve' | 'describe' | 'query' | 'record' | 'submit_form';
    shareId: string;
    token?: string;
    query?: unknown;
    submissionId?: string;
    startedAt?: string;
    answers?: Readonly<Record<string, unknown>>;
    honeypot?: string;
  },
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<{ share: DatabasePublicShare; result?: unknown }> {
  const value = await post(input, options);
  if (value.action !== input.action) {
    throw new DatabasePublicSharesClientError('Mismatched public share response', 502, value);
  }
  return { share: parseShare(value.share), ...('result' in value ? { result: value.result } : {}) };
}

export async function fetchDatabasePublicShares(
  databaseId: string,
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<{ shares: DatabasePublicShare[]; revision: string }> {
  const value = await post({ action: 'list', databaseId }, options);
  if (value.action !== 'list' || !Array.isArray(value.shares) || !isRevision(value.revision)) {
    throw new DatabasePublicSharesClientError('Invalid public shares list', 502, value);
  }
  return { shares: value.shares.map(parseShare), revision: value.revision };
}

export async function saveDatabasePublicShare(
  input: {
    shareId?: string;
    target: DatabasePublicShareTarget;
    access: 'public' | 'link';
    propertyIds: readonly string[];
    allowBody: boolean;
    allowFormSubmission: boolean;
    expiresAt: string | null;
    rotateToken?: boolean;
    expectedRevision: string;
  },
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<{ share: DatabasePublicShare; token: string | null; revision: string }> {
  const value = await post({ action: 'upsert', ...input }, options);
  if (
    value.action !== 'upsert' ||
    (value.token !== null && typeof value.token !== 'string') ||
    !isRevision(value.revision)
  ) {
    throw new DatabasePublicSharesClientError('Invalid public share update', 502, value);
  }
  return { share: parseShare(value.share), token: value.token, revision: value.revision };
}

export async function revokeDatabasePublicShare(
  input: { shareId: string; expectedRevision: string },
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<{ shareId: string; revision: string }> {
  const value = await post({ action: 'revoke', ...input }, options);
  if (value.action !== 'revoke' || value.shareId !== input.shareId || !isRevision(value.revision)) {
    throw new DatabasePublicSharesClientError('Invalid public share revocation', 502, value);
  }
  return { shareId: input.shareId, revision: value.revision };
}
