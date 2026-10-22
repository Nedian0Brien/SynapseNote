import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import type {
  DatabasePlanArtifact,
  DatabasePropertyConversionPlanPreview,
} from '@nedian0brien/synapsenote-server';
import { DatabaseMutationClientError } from './database-mutation-client';

export interface DatabasePropertyConversionClientOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabaseMutationClientError(message, { status: 502, problem: value });
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], message: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new DatabaseMutationClientError(message, { status: 502, problem: value });
  }
}

function stableId(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && value.startsWith(prefix);
}

function revision(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function parsePlan(value: unknown): DatabasePlanArtifact | null {
  if (value === null) return null;
  const plan = object(value, 'Property conversion returned an invalid exact plan');
  if (
    !stableId(plan.id, 'plan_') ||
    !revision(plan.hash) ||
    !revision(plan.snapshotRevision) ||
    typeof plan.committable !== 'boolean' ||
    typeof plan.requiresCommit !== 'boolean' ||
    !Array.isArray(plan.conflicts) ||
    !Array.isArray(plan.approvals) ||
    plan.diff === null ||
    typeof plan.diff !== 'object'
  ) {
    throw new DatabaseMutationClientError('Property conversion returned an incomplete exact plan', {
      status: 502,
      problem: plan,
    });
  }
  return plan as unknown as DatabasePlanArtifact;
}

function parseDraft(value: unknown): DatabasePropertyConversionPlanPreview['draft'] {
  if (value === null) return null;
  const draft = object(value, 'Property conversion returned an invalid draft');
  if (!stableId(draft.id, 'draft_') || !revision(draft.revision)) {
    throw new DatabaseMutationClientError('Property conversion returned an incomplete draft', {
      status: 502,
      problem: draft,
    });
  }
  return draft as unknown as DatabasePropertyConversionPlanPreview['draft'];
}

function parsePreview(value: unknown): DatabasePropertyConversionPlanPreview['preview'] {
  const preview = object(value, 'Property conversion returned an invalid preview');
  exactKeys(
    preview,
    ['rule', 'committable', 'requiresLossyApproval', 'summary', 'changes', 'rollbackValues'],
    'Property conversion preview has unknown or missing fields',
  );
  const rule = object(preview.rule, 'Property conversion returned an invalid rule');
  exactKeys(rule, ['from', 'to', 'kind', 'reason'], 'Property conversion rule is not strict');
  const kinds = new Set(['identity', 'lossless', 'conditional', 'lossy', 'blocked']);
  const summary = object(preview.summary, 'Property conversion returned an invalid summary');
  exactKeys(
    summary,
    ['total', 'empty', 'converted', 'lossy', 'blocked'],
    'Property conversion summary is not strict',
  );
  const changes = Array.isArray(preview.changes) ? preview.changes : null;
  const rollbackValues = object(
    preview.rollbackValues,
    'Property conversion returned invalid rollback values',
  );
  if (
    typeof rule.from !== 'string' ||
    typeof rule.to !== 'string' ||
    !kinds.has(String(rule.kind)) ||
    typeof rule.reason !== 'string' ||
    typeof preview.committable !== 'boolean' ||
    typeof preview.requiresLossyApproval !== 'boolean' ||
    !changes ||
    changes.length > 10_000 ||
    !['total', 'empty', 'converted', 'lossy', 'blocked'].every(
      (key) => Number.isInteger(summary[key]) && Number(summary[key]) >= 0,
    )
  ) {
    throw new DatabaseMutationClientError('Property conversion returned an incomplete preview', {
      status: 502,
      problem: preview,
    });
  }
  for (const rawChange of changes) {
    const change = object(rawChange, 'Property conversion returned an invalid row change');
    const allowedKeys = ['recordId', 'expectedRevision', 'outcome', 'before', 'after', 'reason'];
    if (Object.keys(change).some((key) => !allowedKeys.includes(key))) {
      throw new DatabaseMutationClientError('Property conversion row change is not strict', {
        status: 502,
        problem: change,
      });
    }
    if (
      !stableId(change.recordId, 'rec_') ||
      !revision(change.expectedRevision) ||
      !['empty', 'converted', 'lossy', 'blocked'].includes(String(change.outcome)) ||
      (change.reason !== undefined && typeof change.reason !== 'string')
    ) {
      throw new DatabaseMutationClientError(
        'Property conversion returned an incomplete row change',
        {
          status: 502,
          problem: change,
        },
      );
    }
  }
  void rollbackValues;
  return preview as unknown as DatabasePropertyConversionPlanPreview['preview'];
}

function parseResponse(value: unknown): DatabasePropertyConversionPlanPreview {
  const response = object(value, 'Property conversion returned an invalid response');
  exactKeys(
    response,
    [
      'databaseId',
      'sourceId',
      'propertyId',
      'manifestRevision',
      'indexRevision',
      'preview',
      'draft',
      'plan',
    ],
    'Property conversion response has unknown or missing fields',
  );
  if (
    !stableId(response.databaseId, 'db_') ||
    !stableId(response.sourceId, 'ds_') ||
    !stableId(response.propertyId, 'prop_') ||
    !revision(response.manifestRevision) ||
    !revision(response.indexRevision) ||
    (response.draft !== null && typeof response.draft !== 'object')
  ) {
    throw new DatabaseMutationClientError('Property conversion response is incomplete', {
      status: 502,
      problem: response,
    });
  }
  return {
    databaseId: response.databaseId,
    sourceId: response.sourceId,
    propertyId: response.propertyId,
    manifestRevision: response.manifestRevision,
    indexRevision: response.indexRevision,
    preview: parsePreview(response.preview),
    draft: parseDraft(response.draft),
    plan: parsePlan(response.plan),
  };
}

export async function previewDatabasePropertyConversionPlan(
  input: {
    databaseId: string;
    sourceId: string;
    propertyId: string;
    targetProperty: DatabaseProperty;
    allowLossy?: boolean;
  },
  options: DatabasePropertyConversionClientOptions = {},
): Promise<DatabasePropertyConversionPlanPreview> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/property-conversion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ ...input, allowLossy: input.allowLossy ?? false }),
    signal: options.signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
        ? body.detail
        : `Property conversion failed with HTTP ${response.status}`;
    throw new DatabaseMutationClientError(detail, { status: response.status, problem: body });
  }
  return parseResponse(body);
}
