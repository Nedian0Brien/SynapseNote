import type { DatabaseVerificationLifecycleInput } from '@nedian0brien/synapsenote-core';
import type {
  DatabaseButtonPlan,
  DatabaseButtonRun,
  DatabaseCommitResult,
  DatabaseDesiredStateDraftInput,
  DatabaseDraftArtifact,
  DatabasePlanApprovalCode,
  DatabasePlanArtifact,
  DatabaseUndoResult,
} from '@nedian0brien/synapsenote-server';

export interface DatabaseMutationClientOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export interface DatabaseUiActor {
  principalId: string;
  sessionId?: string;
}

export class DatabaseMutationClientError extends Error {
  readonly status: number;
  readonly problem: unknown;

  constructor(message: string, options: { status: number; problem?: unknown }) {
    super(message);
    this.name = 'DatabaseMutationClientError';
    this.status = options.status;
    this.problem = options.problem;
  }
}

export class DatabasePlanExecutionError extends Error {
  readonly plan: DatabasePlanArtifact;
  readonly status?: number;
  readonly problem?: unknown;

  constructor(cause: unknown, plan: DatabasePlanArtifact) {
    super(cause instanceof Error ? cause.message : 'Database plan execution failed', { cause });
    this.name = 'DatabasePlanExecutionError';
    this.plan = plan;
    if (cause instanceof DatabaseMutationClientError) {
      this.status = cause.status;
      this.problem = cause.problem;
    }
  }
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabaseMutationClientError(message, { status: 502, problem: value });
  }
  return value as Record<string, unknown>;
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  prefix: string,
  message: string,
): string {
  const field = value[key];
  if (typeof field !== 'string' || !field.startsWith(prefix)) {
    throw new DatabaseMutationClientError(message, { status: 502, problem: value });
  }
  return field;
}

function problemDetail(body: unknown, status: number, operation: string): string {
  if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
    return body.detail;
  }
  return `Database ${operation} failed with HTTP ${status}`;
}

async function post(
  path:
    | '/api/databases/plan'
    | '/api/databases/button'
    | '/api/databases/commit'
    | '/api/databases/undo',
  body: Record<string, unknown>,
  operation: string,
  options: DatabaseMutationClientOptions,
): Promise<unknown> {
  const response = await (options.fetch ?? globalThis.fetch)(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new DatabaseMutationClientError(problemDetail(result, response.status, operation), {
      status: response.status,
      problem: result,
    });
  }
  return result;
}

function draftFromResponse(value: unknown, expectedAction: string): DatabaseDraftArtifact {
  const response = object(value, 'Database draft returned an invalid response');
  if (response.action !== expectedAction) {
    throw new DatabaseMutationClientError('Database draft returned a different action', {
      status: 502,
      problem: response,
    });
  }
  const draft = object(response.draft, 'Database draft returned an invalid artifact');
  stringField(draft, 'id', 'draft_', 'Database draft returned an invalid stable ID');
  stringField(draft, 'revision', 'sha256:', 'Database draft returned an invalid revision');
  return draft as unknown as DatabaseDraftArtifact;
}

function planFromResponse(value: unknown, expectedAction: string): DatabasePlanArtifact {
  const response = object(value, 'Database plan returned an invalid response');
  if (response.action !== expectedAction) {
    throw new DatabaseMutationClientError('Database plan returned a different action', {
      status: 502,
      problem: response,
    });
  }
  const plan = object(response.plan, 'Database plan returned an invalid artifact');
  stringField(plan, 'id', 'plan_', 'Database plan returned an invalid stable ID');
  stringField(plan, 'hash', 'sha256:', 'Database plan returned an invalid hash');
  stringField(
    plan,
    'snapshotRevision',
    'sha256:',
    'Database plan returned an invalid snapshot revision',
  );
  if (
    typeof plan.committable !== 'boolean' ||
    typeof plan.requiresCommit !== 'boolean' ||
    !Array.isArray(plan.conflicts) ||
    !Array.isArray(plan.approvals) ||
    plan.diff === null ||
    typeof plan.diff !== 'object' ||
    (plan.conflictDomains !== undefined &&
      (!Array.isArray(plan.conflictDomains) ||
        plan.conflictDomains.some(
          (domain) =>
            ![
              'record_value',
              'schema',
              'option',
              'view',
              'formula',
              'relation',
              'automation',
            ].includes(String(domain)),
        )))
  ) {
    throw new DatabaseMutationClientError('Database plan returned an incomplete artifact', {
      status: 502,
      problem: plan,
    });
  }
  return plan as unknown as DatabasePlanArtifact;
}

function buttonPlanFromResponse(value: unknown): DatabaseButtonPlan {
  const response = object(value, 'Database Button returned an invalid response');
  const plan = object(response.plan, 'Database Button returned an invalid plan');
  stringField(plan, 'id', 'buttonplan_', 'Database Button returned an invalid stable ID');
  stringField(plan, 'hash', 'sha256:', 'Database Button returned an invalid hash');
  if (plan.expectedRecordRevision === null) {
    stringField(plan, 'buttonId', 'dbbtn_', 'Database Button returned an invalid button ID');
    if (plan.recordId !== null || plan.propertyId !== null) {
      throw new DatabaseMutationClientError(
        'Database Button returned an invalid database-level context',
        { status: 502, problem: plan },
      );
    }
  } else {
    stringField(
      plan,
      'expectedRecordRevision',
      'sha256:',
      'Database Button returned an invalid record revision',
    );
    stringField(plan, 'recordId', 'rec_', 'Database Button returned an invalid record ID');
    stringField(plan, 'propertyId', 'prop_', 'Database Button returned an invalid property ID');
    if (plan.buttonId !== null) {
      throw new DatabaseMutationClientError(
        'Database Button returned an invalid property-button context',
        { status: 502, problem: plan },
      );
    }
  }
  if (
    typeof plan.requiresApproval !== 'boolean' ||
    !Array.isArray(plan.externalSteps) ||
    !Array.isArray(plan.permissionGuards)
  ) {
    throw new DatabaseMutationClientError('Database Button returned an incomplete plan', {
      status: 502,
      problem: plan,
    });
  }
  return plan as unknown as DatabaseButtonPlan;
}

function commitFromResponse(value: unknown): DatabaseCommitResult {
  const result = object(value, 'Database commit returned an invalid response');
  stringField(result, 'mutationId', 'mut_', 'Database commit returned an invalid mutation ID');
  stringField(result, 'planId', 'plan_', 'Database commit returned an invalid plan ID');
  stringField(result, 'planHash', 'sha256:', 'Database commit returned an invalid plan hash');
  stringField(result, 'undoToken', 'undo_', 'Database commit returned an invalid undo token');
  const verification = object(
    result.verification,
    'Database commit returned an invalid verification result',
  );
  if (
    typeof result.idempotentReplay !== 'boolean' ||
    !Array.isArray(result.actualDiff) ||
    verification.status !== 'passed'
  ) {
    throw new DatabaseMutationClientError('Database commit did not return passed verification', {
      status: 502,
      problem: result,
    });
  }
  return result as unknown as DatabaseCommitResult;
}

function undoFromResponse(
  value: unknown,
  expectedAction: 'preview' | 'apply' | 'redo_preview' | 'redo_apply',
): DatabaseUndoResult {
  const result = object(value, 'Database undo returned an invalid response');
  if (result.action !== expectedAction) {
    throw new DatabaseMutationClientError('Database undo returned a different action', {
      status: 502,
      problem: result,
    });
  }
  stringField(result, 'undoId', 'undo_', 'Database undo returned an invalid stable ID');
  stringField(result, 'mutationId', 'mut_', 'Database undo returned an invalid mutation ID');
  if (typeof result.canApply !== 'boolean' || !Array.isArray(result.conflicts)) {
    throw new DatabaseMutationClientError('Database undo returned an incomplete receipt', {
      status: 502,
      problem: result,
    });
  }
  return result as unknown as DatabaseUndoResult;
}

export async function createDatabaseMutationDraft(
  desiredState: DatabaseDesiredStateDraftInput,
  options: DatabaseMutationClientOptions = {},
): Promise<DatabaseDraftArtifact> {
  return draftFromResponse(
    await post('/api/databases/plan', { action: 'create_draft', desiredState }, 'draft', options),
    'create_draft',
  );
}

export async function createDatabaseMutationPlan(
  draftId: string,
  options: DatabaseMutationClientOptions = {},
): Promise<DatabasePlanArtifact> {
  return planFromResponse(
    await post('/api/databases/plan', { action: 'create_plan', draftId }, 'plan', options),
    'create_plan',
  );
}

export async function createDatabaseVerificationPlan(
  input: {
    lifecycle: DatabaseVerificationLifecycleInput;
    actor: DatabaseUiActor;
  },
  options: DatabaseMutationClientOptions = {},
): Promise<{
  draft: DatabaseDraftArtifact;
  plan: DatabasePlanArtifact;
  review: Record<string, unknown>;
}> {
  const responseValue = await post(
    '/api/databases/plan',
    {
      action: 'create_verification_draft',
      lifecycle: input.lifecycle,
      actor: { ...input.actor, kind: 'human' },
    },
    'Verification draft',
    options,
  );
  const response = object(responseValue, 'Verification draft returned an invalid response');
  const draft = draftFromResponse(responseValue, 'create_verification_draft');
  const review = object(response.review, 'Verification draft returned an invalid review');
  const plan = await createDatabaseMutationPlan(draft.id, options);
  if (
    !plan.verificationReview ||
    plan.verificationReview.recordId !== input.lifecycle.recordId ||
    plan.verificationReview.propertyId !== input.lifecycle.propertyId ||
    plan.verificationReview.actor.principal_id !== input.actor.principalId
  ) {
    throw new DatabaseMutationClientError(
      'Verification plan does not match its authenticated draft review',
      { status: 502, problem: plan },
    );
  }
  return { draft, plan, review };
}

export async function createDatabaseButtonPlan(
  input: {
    databaseId: string;
  } & (
    | {
        sourceId: string;
        recordId: string;
        propertyId: string;
        expectedRecordRevision: string;
      }
    | { buttonId: string }
  ),
  options: DatabaseMutationClientOptions = {},
): Promise<DatabaseButtonPlan> {
  return buttonPlanFromResponse(await post('/api/databases/button', input, 'Button plan', options));
}

export async function executeDatabaseButtonPlan(
  input: {
    plan: DatabaseButtonPlan;
    actor: DatabaseUiActor;
    idempotencyKey: string;
  },
  options: DatabaseMutationClientOptions = {},
): Promise<{ run: DatabaseButtonRun; undoToken: string | null }> {
  const response = object(
    await post(
      '/api/databases/button',
      {
        action: 'execute',
        buttonPlanId: input.plan.id,
        buttonPlanHash: input.plan.hash,
        idempotencyKey: input.idempotencyKey,
        approvalToken: `approve:${input.plan.hash}`,
        actor: { ...input.actor, kind: 'human' },
      },
      'Button execution',
      options,
    ),
    'Database Button execution returned an invalid response',
  );
  if (response.action !== 'execute') {
    throw new DatabaseMutationClientError('Database Button execution returned a different action', {
      status: 502,
      problem: response,
    });
  }
  const run = object(response.run, 'Database Button execution returned an invalid run receipt');
  stringField(run, 'id', 'buttonrun_', 'Database Button run returned an invalid stable ID');
  if (
    run.buttonPlanId !== input.plan.id ||
    run.buttonPlanHash !== input.plan.hash ||
    !Array.isArray(run.actions) ||
    !['retry_wait', 'succeeded', 'failed'].includes(String(run.state))
  ) {
    throw new DatabaseMutationClientError(
      'Database Button execution receipt does not match its reviewed plan',
      { status: 502, problem: response },
    );
  }
  if (response.undoToken !== null && typeof response.undoToken !== 'string') {
    throw new DatabaseMutationClientError('Database Button returned an invalid undo token', {
      status: 502,
      problem: response,
    });
  }
  return {
    run: run as unknown as DatabaseButtonRun,
    undoToken: response.undoToken as string | null,
  };
}

export async function commitReviewedDatabasePlan(
  input: {
    plan: DatabasePlanArtifact;
    actor: DatabaseUiActor;
    idempotencyKey: string;
    assertions?: { databaseAbsent?: boolean; createdRecords?: number };
    approvalCodes?: readonly DatabasePlanApprovalCode[];
  },
  options: DatabaseMutationClientOptions = {},
): Promise<DatabaseCommitResult> {
  const result = commitFromResponse(
    await post(
      '/api/databases/commit',
      {
        planId: input.plan.id,
        planHash: input.plan.hash,
        expectedSnapshotRevision: input.plan.snapshotRevision,
        idempotencyKey: input.idempotencyKey,
        approvalToken: `approve:${input.plan.hash}`,
        actor: { ...input.actor, kind: 'human' },
        ...(input.approvalCodes ? { approvalCodes: input.approvalCodes } : {}),
        ...(input.assertions ? { assertions: input.assertions } : {}),
      },
      'commit',
      options,
    ),
  );
  if (result.planId !== input.plan.id || result.planHash !== input.plan.hash) {
    throw new DatabaseMutationClientError(
      'Database commit receipt does not match its reviewed plan',
      { status: 502, problem: result },
    );
  }
  return result;
}

export interface ExecuteDatabaseUiMutationInput {
  desiredState: DatabaseDesiredStateDraftInput;
  actor: DatabaseUiActor;
  idempotencyKey: string;
  assertions?: { databaseAbsent?: boolean; createdRecords?: number };
  review: (plan: DatabasePlanArtifact, ghost: DatabaseGhostState) => boolean | Promise<boolean>;
  onGhostStateChange?: (ghost: DatabaseGhostState | null) => void;
}

export interface DatabaseGhostState {
  readonly canonical: false;
  readonly phase: 'review' | 'committing';
  readonly planId: string;
  readonly planHash: string;
  readonly snapshotRevision: string;
  readonly risk: DatabasePlanArtifact['risk'];
  readonly diff: DatabasePlanArtifact['diff'];
  readonly approvals: DatabasePlanArtifact['approvals'];
}

function ghostState(plan: DatabasePlanArtifact, phase: DatabaseGhostState['phase']) {
  return {
    canonical: false as const,
    phase,
    planId: plan.id,
    planHash: plan.hash,
    snapshotRevision: plan.snapshotRevision,
    risk: structuredClone(plan.risk),
    diff: structuredClone(plan.diff),
    approvals: structuredClone(plan.approvals),
  };
}

export type ExecuteDatabaseUiMutationResult =
  | { status: 'blocked'; draft: DatabaseDraftArtifact; plan: DatabasePlanArtifact }
  | { status: 'converged'; draft: DatabaseDraftArtifact; plan: DatabasePlanArtifact }
  | { status: 'review_declined'; draft: DatabaseDraftArtifact; plan: DatabasePlanArtifact }
  | {
      status: 'committed';
      draft: DatabaseDraftArtifact;
      plan: DatabasePlanArtifact;
      result: DatabaseCommitResult;
    };

export type ExecuteReviewedDatabasePlanResult =
  | { status: 'blocked'; plan: DatabasePlanArtifact }
  | { status: 'converged'; plan: DatabasePlanArtifact }
  | { status: 'review_declined'; plan: DatabasePlanArtifact }
  | { status: 'committed'; plan: DatabasePlanArtifact; result: DatabaseCommitResult };

export interface ExecuteReviewedDatabasePlanInput {
  plan: DatabasePlanArtifact;
  actor: DatabaseUiActor;
  idempotencyKey: string;
  assertions?: { databaseAbsent?: boolean; createdRecords?: number };
  approvalCodes?: readonly DatabasePlanApprovalCode[];
  review: (plan: DatabasePlanArtifact, ghost: DatabaseGhostState) => boolean | Promise<boolean>;
  onGhostStateChange?: (ghost: DatabaseGhostState | null) => void;
}

/** Executes an already compiled immutable plan through the same human-review seam as UI drafts. */
export async function executeReviewedDatabasePlan(
  input: ExecuteReviewedDatabasePlanInput,
  options: DatabaseMutationClientOptions = {},
): Promise<ExecuteReviewedDatabasePlanResult> {
  if (!input.plan.requiresCommit) return { status: 'converged', plan: input.plan };
  if (!input.plan.committable) return { status: 'blocked', plan: input.plan };
  const reviewGhost = ghostState(input.plan, 'review');
  input.onGhostStateChange?.(reviewGhost);
  try {
    if (!(await input.review(input.plan, reviewGhost))) {
      return { status: 'review_declined', plan: input.plan };
    }
    input.onGhostStateChange?.(ghostState(input.plan, 'committing'));
    let result: DatabaseCommitResult;
    try {
      result = await commitReviewedDatabasePlan(
        {
          plan: input.plan,
          actor: input.actor,
          idempotencyKey: input.idempotencyKey,
          ...(input.approvalCodes ? { approvalCodes: input.approvalCodes } : {}),
          ...(input.assertions ? { assertions: input.assertions } : {}),
        },
        options,
      );
    } catch (cause) {
      if (cause instanceof DatabaseMutationClientError && cause.status === 409) {
        throw new DatabasePlanExecutionError(cause, input.plan);
      }
      throw cause;
    }
    return { status: 'committed', plan: input.plan, result };
  } finally {
    input.onGhostStateChange?.(null);
  }
}

/**
 * The only browser command for canonical database edits. It deliberately
 * cannot skip exact planning/commit verification or call a file endpoint
 * directly. Callers may auto-approve only after classifying a mutation as
 * direct-safe; elevated and destructive callers must keep the review seam.
 */
export async function executeDatabaseUiMutation(
  input: ExecuteDatabaseUiMutationInput,
  options: DatabaseMutationClientOptions = {},
): Promise<ExecuteDatabaseUiMutationResult> {
  const draft = await createDatabaseMutationDraft(input.desiredState, options);
  const plan = await createDatabaseMutationPlan(draft.id, options);
  const outcome = await executeReviewedDatabasePlan(
    {
      plan,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      ...(input.assertions ? { assertions: input.assertions } : {}),
      review: input.review,
      ...(input.onGhostStateChange ? { onGhostStateChange: input.onGhostStateChange } : {}),
    },
    options,
  );
  return outcome.status === 'committed' ? { ...outcome, draft } : { ...outcome, draft };
}

export async function previewDatabaseUiUndo(
  undoToken: string,
  options: DatabaseMutationClientOptions = {},
): Promise<DatabaseUndoResult> {
  return undoFromResponse(
    await post('/api/databases/undo', { action: 'preview', undoToken }, 'undo preview', options),
    'preview',
  );
}

export async function applyDatabaseUiUndo(
  input: { undoToken: string; actor: DatabaseUiActor; idempotencyKey: string },
  options: DatabaseMutationClientOptions = {},
): Promise<DatabaseUndoResult> {
  return undoFromResponse(
    await post(
      '/api/databases/undo',
      {
        action: 'apply',
        undoToken: input.undoToken,
        idempotencyKey: input.idempotencyKey,
        actor: { ...input.actor, kind: 'human' },
      },
      'undo apply',
      options,
    ),
    'apply',
  );
}

export async function previewDatabaseUiRedo(
  undoToken: string,
  options: DatabaseMutationClientOptions = {},
): Promise<DatabaseUndoResult> {
  return undoFromResponse(
    await post(
      '/api/databases/undo',
      { action: 'redo_preview', undoToken },
      'redo preview',
      options,
    ),
    'redo_preview',
  );
}

export async function applyDatabaseUiRedo(
  input: { undoToken: string; actor: DatabaseUiActor; idempotencyKey: string },
  options: DatabaseMutationClientOptions = {},
): Promise<DatabaseUndoResult> {
  return undoFromResponse(
    await post(
      '/api/databases/undo',
      {
        action: 'redo_apply',
        undoToken: input.undoToken,
        idempotencyKey: input.idempotencyKey,
        actor: { ...input.actor, kind: 'human' },
      },
      'redo apply',
      options,
    ),
    'redo_apply',
  );
}
