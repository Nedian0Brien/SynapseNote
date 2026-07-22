import type { DatabaseOnboardingPreview, DatabaseTask } from '@nedian0brien/synapsenote-server';

export interface DatabaseOnboardingClientOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export class DatabaseOnboardingClientError extends Error {
  readonly status: number;
  readonly problem: unknown;

  constructor(message: string, options: { status: number; problem: unknown }) {
    super(message);
    this.name = 'DatabaseOnboardingClientError';
    this.status = options.status;
    this.problem = options.problem;
  }
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabaseOnboardingClientError(message, { status: 502, problem: value });
  }
  return value as Record<string, unknown>;
}

function detail(value: unknown, status: number): string {
  return value && typeof value === 'object' && 'detail' in value && typeof value.detail === 'string'
    ? value.detail
    : `Database source onboarding failed with HTTP ${status}`;
}

async function request(
  body: Record<string, unknown>,
  options: DatabaseOnboardingClientOptions,
): Promise<Record<string, unknown>> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/task', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new DatabaseOnboardingClientError(detail(result, response.status), {
      status: response.status,
      problem: result,
    });
  }
  return object(result, 'Database source onboarding returned an invalid response');
}

export interface DatabaseSourceOnboardingTarget {
  databaseId: string;
  sourceId: string;
  expectedManifestRevision: string;
}

export async function previewDatabaseSourceOnboarding(
  target: DatabaseSourceOnboardingTarget,
  options: DatabaseOnboardingClientOptions = {},
): Promise<DatabaseOnboardingPreview> {
  const result = await request({ action: 'preview_import', ...target }, options);
  if (result.action !== 'preview_import') {
    throw new DatabaseOnboardingClientError('Database source onboarding returned another action', {
      status: 502,
      problem: result,
    });
  }
  const preview = object(result.preview, 'Database source onboarding returned an invalid preview');
  if (
    preview.databaseId !== target.databaseId ||
    preview.sourceId !== target.sourceId ||
    !Array.isArray(preview.items) ||
    typeof preview.complete !== 'boolean' ||
    typeof preview.entryLimit !== 'number' ||
    preview.summary === null ||
    typeof preview.summary !== 'object'
  ) {
    throw new DatabaseOnboardingClientError(
      'Database source onboarding returned an incomplete preview',
      { status: 502, problem: result },
    );
  }
  return preview as unknown as DatabaseOnboardingPreview;
}

export async function startDatabaseSourceOnboarding(
  target: DatabaseSourceOnboardingTarget,
  options: DatabaseOnboardingClientOptions = {},
): Promise<DatabaseTask> {
  const result = await request(
    { action: 'start', task: { operation: 'import', ...target } },
    options,
  );
  if (result.action !== 'start') {
    throw new DatabaseOnboardingClientError('Database source onboarding returned another action', {
      status: 502,
      problem: result,
    });
  }
  const task = object(result.task, 'Database source onboarding returned an invalid task');
  if (
    typeof task.id !== 'string' ||
    !task.id.startsWith('task_') ||
    task.operation !== 'import' ||
    typeof task.state !== 'string' ||
    typeof task.revision !== 'string'
  ) {
    throw new DatabaseOnboardingClientError('Database source onboarding returned an invalid task', {
      status: 502,
      problem: result,
    });
  }
  return task as unknown as DatabaseTask;
}
