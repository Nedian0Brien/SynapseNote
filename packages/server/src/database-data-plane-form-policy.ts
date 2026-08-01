import { createHash } from 'node:crypto';
import {
  type DatabaseDefinition,
  DatabaseFilesValueSchema,
  type DatabaseFormValue,
  type DatabaseFormViewConfiguration,
  type DatabasePublicSharePolicy,
  type DatabaseSource,
  isDatabaseValueValidForProperty,
  validateDatabasePropertyConstraints,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseCommitInput } from './database-commit.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import {
  type DatabaseFormStateStore,
  databaseFormPrivateKey,
} from './database-form-state-store.ts';
import type {
  DatabaseDesiredStateDraftInput,
  DatabaseDraftArtifact,
  DatabasePlanArtifact,
} from './database-plan.ts';

export interface DatabaseFormSubmissionInput {
  databaseId: string;
  sourceId: string;
  viewId: string;
  submissionId: string;
  startedAt: string;
  answers: Readonly<Record<string, DatabaseFormValue>>;
  honeypot?: string;
  remoteAddress: string;
}

export interface DatabaseFormSubmissionResult {
  status: 'created';
  recordId: string;
  submittedAt: string;
  idempotentReplay: boolean;
  confirmation: DatabaseFormViewConfiguration['confirmation'];
}

export interface DatabaseFormUploadAuthorization {
  parentDocName: string;
}

interface DatabaseFormPolicyPort {
  assertMutationAllowed(): void;
  describeCanonical(input: { databaseId: string; sourceId: string }): {
    database: DatabaseDefinition;
    source: DatabaseSource | null;
  };
  publicShare(): DatabasePublicSharePolicy | undefined;
  now(): Date;
  formStateStore: DatabaseFormStateStore;
  recordById(recordId: string): { databaseId: string; sourceId: string } | undefined;
  query(input: unknown): { matched: number };
  databaseDefinitionDraftBase(database: DatabaseDefinition): DatabaseDesiredStateDraftInput;
  withTrustedMutation<T>(operation: () => T): T;
  createDraft(input: unknown, ttlSeconds?: number): DatabaseDraftArtifact;
  createPlan(draftId: string, ttlSeconds?: number): DatabasePlanArtifact;
  commit(input: DatabaseCommitInput): Promise<unknown>;
  publishFormAutomationEvent(receipt: {
    id: string;
    databaseId: string;
    sourceId: string;
    viewId: string;
    recordId: string;
  }): Promise<void>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function isLoopbackAddress(value: string): boolean {
  const address = value.trim().toLowerCase();
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === 'localhost' ||
    address.startsWith('127.') ||
    address === '::ffff:127.0.0.1'
  );
}

function isEmptyFormValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function formValuesEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function formQuestionVisible(
  question: DatabaseFormViewConfiguration['questions'][number],
  questions: readonly DatabaseFormViewConfiguration['questions'][number][],
  answers: Readonly<Record<string, DatabaseFormValue>>,
): boolean {
  if (!question.visibleWhen) return true;
  const byQuestionId = new Map(questions.map((candidate) => [candidate.id, candidate] as const));
  const outcomes = question.visibleWhen.conditions.map((condition) => {
    const dependency = byQuestionId.get(condition.questionId);
    const answer = dependency ? answers[dependency.propertyId] : undefined;
    switch (condition.operator) {
      case 'equals':
        return formValuesEqual(answer, condition.value);
      case 'not_equals':
        return !formValuesEqual(answer, condition.value);
      case 'is_empty':
        return isEmptyFormValue(answer);
      case 'is_not_empty':
        return !isEmptyFormValue(answer);
      default:
        return false;
    }
  });
  return question.visibleWhen.mode === 'all' ? outcomes.every(Boolean) : outcomes.some(Boolean);
}

export async function submitDatabaseForm(
  port: DatabaseFormPolicyPort,
  input: DatabaseFormSubmissionInput,
): Promise<DatabaseFormSubmissionResult> {
  port.assertMutationAllowed();
  const described = port.describeCanonical({
    databaseId: input.databaseId,
    sourceId: input.sourceId,
  });
  if (!described.source) {
    throw new DatabaseDataPlaneError('source_not_found', 'Form data source was not found');
  }
  const view = described.database.views.find((candidate) => candidate.id === input.viewId);
  if (!view || view.layout.type !== 'form') {
    throw new DatabaseDataPlaneError('form_not_found', 'Form view was not found', {
      viewId: input.viewId,
    });
  }
  if (view.sourceId !== described.source.id) {
    throw new DatabaseDataPlaneError('view_source_mismatch', 'Form belongs to another source');
  }
  const publicShare = port.publicShare();
  if (
    publicShare &&
    (publicShare.target.kind !== 'form' ||
      publicShare.target.databaseId !== input.databaseId ||
      publicShare.target.viewId !== input.viewId ||
      !publicShare.allowFormSubmission)
  ) {
    throw new DatabaseDataPlaneError(
      'form_access_denied',
      'This public share does not accept form submissions.',
    );
  }
  const configuration = view.layout.configuration;
  if (
    !publicShare &&
    configuration.access === 'internal' &&
    !isLoopbackAddress(input.remoteAddress)
  ) {
    throw new DatabaseDataPlaneError(
      'form_access_denied',
      'This form only accepts responses from the local workspace.',
    );
  }

  const now = port.now();
  if (configuration.closesAt && now.getTime() >= Date.parse(configuration.closesAt)) {
    throw new DatabaseDataPlaneError('form_closed', configuration.closedMessage, {
      closesAt: configuration.closesAt,
    });
  }
  const receiptKey = `${described.database.id}:${view.id}:${input.submissionId}`;
  const receiptKeyHash = databaseFormPrivateKey(receiptKey);
  const fingerprint = `sha256:${createHash('sha256')
    .update(stableJson({ startedAt: input.startedAt, answers: input.answers }))
    .digest('hex')}`;
  const prior = await port.formStateStore.get(receiptKeyHash);
  if (prior) {
    if (prior.fingerprint !== fingerprint) {
      throw new DatabaseDataPlaneError(
        'form_duplicate_submission',
        'Submission ID was already used for different answers.',
      );
    }
    if (prior.state === 'created') {
      await port.publishFormAutomationEvent(prior);
      return { ...prior.result, idempotentReplay: true };
    }
    if (prior.state === 'deleted') {
      throw new DatabaseDataPlaneError(
        'form_duplicate_submission',
        'This submission was accepted previously and has passed its retention period.',
      );
    }
    const indexed = port.recordById(prior.recordId);
    if (indexed?.databaseId === described.database.id && indexed.sourceId === described.source.id) {
      await port.formStateStore.markCreated(prior.id, now.toISOString());
      await port.publishFormAutomationEvent(prior);
      return { ...prior.result, idempotentReplay: true };
    }
  }
  if (configuration.spamProtection.honeypot && (input.honeypot ?? '') !== '') {
    throw new DatabaseDataPlaneError('form_invalid_submission', 'Form submission was rejected.');
  }
  const startedAt = Date.parse(input.startedAt);
  const minimumMs = configuration.spamProtection.minimumCompletionSeconds * 1_000;
  if (!Number.isFinite(startedAt) || now.getTime() - startedAt < minimumMs) {
    throw new DatabaseDataPlaneError(
      'form_invalid_submission',
      'Form was submitted too quickly. Please review your answers and try again.',
    );
  }
  const rate = configuration.spamProtection.rateLimit;
  if (!prior) {
    const rateDecision = await port.formStateStore.consumeRate({
      keyHash: databaseFormPrivateKey(
        `submit:${described.database.id}:${view.id}:${input.remoteAddress}`,
      ),
      nowMs: now.getTime(),
      windowSeconds: rate.windowSeconds,
      limit: rate.maxSubmissions,
    });
    if (!rateDecision.allowed) {
      throw new DatabaseDataPlaneError(
        'form_rate_limited',
        'Too many responses were submitted. Please try again later.',
        { retryAfterSeconds: rateDecision.retryAfterSeconds },
      );
    }
  }

  const knownPropertyIds = new Set(configuration.questions.map((question) => question.propertyId));
  for (const propertyId of Object.keys(input.answers)) {
    if (!knownPropertyIds.has(propertyId)) {
      throw new DatabaseDataPlaneError(
        'form_invalid_submission',
        `Answer targets an unknown form property "${propertyId}".`,
      );
    }
  }

  const visiblePropertyIds = new Set<string>();
  for (const question of configuration.questions) {
    const visible = formQuestionVisible(question, configuration.questions, input.answers);
    const answer = input.answers[question.propertyId];
    if (!visible) {
      if (answer !== undefined) {
        throw new DatabaseDataPlaneError(
          'form_invalid_submission',
          `Hidden question "${question.label}" cannot be submitted.`,
        );
      }
      continue;
    }
    visiblePropertyIds.add(question.propertyId);
    if (question.required && isEmptyFormValue(answer)) {
      throw new DatabaseDataPlaneError(
        'form_invalid_submission',
        `"${question.label}" is required.`,
        { propertyId: question.propertyId },
      );
    }
  }

  const valuesByPropertyId: Record<string, DatabaseFormValue> = {
    ...structuredClone(configuration.defaults),
  };
  for (const [propertyId, value] of Object.entries(input.answers)) {
    if (visiblePropertyIds.has(propertyId) && !isEmptyFormValue(value)) {
      valuesByPropertyId[propertyId] = structuredClone(value);
    }
  }
  const valuesByPropertyKey: Record<string, DatabaseFormValue> = {};
  for (const [propertyId, value] of Object.entries(valuesByPropertyId)) {
    const property = described.source.properties.find((candidate) => candidate.id === propertyId);
    if (!property || !isDatabaseValueValidForProperty(property, value)) {
      throw new DatabaseDataPlaneError(
        'form_invalid_submission',
        `Submitted value is invalid for property "${propertyId}".`,
        { propertyId },
      );
    }
    const constraintIssue = validateDatabasePropertyConstraints(property, value);
    if (constraintIssue) {
      throw new DatabaseDataPlaneError(
        'form_invalid_submission',
        `${property.name} ${constraintIssue}.`,
        { propertyId },
      );
    }
    if (property.type === 'files') {
      const files = DatabaseFilesValueSchema.parse(value);
      if (
        !configuration.fileUploads.enabled ||
        files.length > configuration.fileUploads.maxFilesPerQuestion ||
        files.some((file) => file.kind !== 'local')
      ) {
        throw new DatabaseDataPlaneError(
          'form_invalid_submission',
          'File answers must use uploaded local files within the configured limit.',
          { propertyId },
        );
      }
    }
    valuesByPropertyKey[property.key] = value;
  }

  const duplicatePolicy = configuration.duplicateSubmission;
  if (duplicatePolicy.type === 'reject_property') {
    const duplicateValue = valuesByPropertyId[duplicatePolicy.propertyId];
    if (isEmptyFormValue(duplicateValue)) {
      throw new DatabaseDataPlaneError(
        'form_invalid_submission',
        'The duplicate-check field requires a value.',
        { propertyId: duplicatePolicy.propertyId },
      );
    }
    if (
      typeof duplicateValue !== 'string' &&
      typeof duplicateValue !== 'number' &&
      typeof duplicateValue !== 'boolean'
    ) {
      throw new DatabaseDataPlaneError(
        'form_invalid_submission',
        'The duplicate-check field must contain one scalar value.',
      );
    }
    const existing = port.query({
      databaseId: described.database.id,
      sourceId: described.source.id,
      query: {
        where: {
          propertyId: duplicatePolicy.propertyId,
          operator: 'eq',
          value: duplicateValue,
        },
        select: [duplicatePolicy.propertyId],
        page: { limit: 1 },
      },
    });
    if (existing.matched > 0) {
      throw new DatabaseDataPlaneError(
        'form_duplicate_submission',
        'A response with this value has already been submitted.',
        { propertyId: duplicatePolicy.propertyId },
      );
    }
  }

  const desiredState: DatabaseDesiredStateDraftInput = {
    ...port.databaseDefinitionDraftBase(described.database),
    sampleRecords: [
      {
        id:
          prior?.recordId ??
          `rec_form_${receiptKeyHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
        sourceKey: described.source.key,
        values: valuesByPropertyKey,
        body: '',
      },
    ],
    recordMutations: [],
  };
  const draft = port.withTrustedMutation(() => port.createDraft(desiredState, 300));
  const recordId = draft.normalized.sampleRecords[0]?.id;
  if (!recordId) throw new Error('Form draft did not allocate a record ID');
  const plan = port.withTrustedMutation(() => port.createPlan(draft.id, 300));
  if (!plan.committable) {
    throw new DatabaseDataPlaneError(
      'form_invalid_submission',
      'Form response does not satisfy the database schema.',
      { conflicts: plan.conflicts },
    );
  }
  const result: DatabaseFormSubmissionResult = {
    status: 'created',
    recordId,
    submittedAt: prior?.result.submittedAt ?? now.toISOString(),
    idempotentReplay: false,
    confirmation: structuredClone(configuration.confirmation),
  };
  const deleteAfter =
    configuration.retention.type === 'delete_after'
      ? new Date(
          Date.parse(result.submittedAt) + configuration.retention.days * 86_400_000,
        ).toISOString()
      : null;
  const receipt = await port.formStateStore.reserve({
    keyHash: receiptKeyHash,
    fingerprint,
    databaseId: described.database.id,
    sourceId: described.source.id,
    viewId: view.id,
    recordId,
    result,
    deleteAfter,
    now: now.toISOString(),
  });
  try {
    await port.withTrustedMutation(() =>
      port.commit({
        planId: plan.id,
        planHash: plan.hash,
        expectedSnapshotRevision: plan.snapshotRevision,
        idempotencyKey: `form:${view.id}:${input.submissionId}`,
        approvalToken: `approve:${plan.hash}`,
        actor: { kind: 'system', principalId: `form:${view.id}` },
      }),
    );
  } catch (error) {
    const indexed = port.recordById(receipt.recordId);
    if (
      !indexed ||
      indexed.databaseId !== receipt.databaseId ||
      indexed.sourceId !== receipt.sourceId
    ) {
      throw error;
    }
    await port.formStateStore.markCreated(receipt.id, port.now().toISOString());
    await port.publishFormAutomationEvent(receipt);
    return { ...receipt.result, idempotentReplay: true };
  }
  await port.formStateStore.markCreated(receipt.id, port.now().toISOString());
  await port.publishFormAutomationEvent(receipt);
  return result;
}

export async function authorizeDatabaseFormUpload(
  port: DatabaseFormPolicyPort,
  input: {
    databaseId: string;
    sourceId: string;
    viewId: string;
    remoteAddress: string;
  },
): Promise<DatabaseFormUploadAuthorization> {
  const described = port.describeCanonical({
    databaseId: input.databaseId,
    sourceId: input.sourceId,
  });
  if (!described.source) {
    throw new DatabaseDataPlaneError('source_not_found', 'Form data source was not found');
  }
  const view = described.database.views.find((candidate) => candidate.id === input.viewId);
  if (!view || view.layout.type !== 'form') {
    throw new DatabaseDataPlaneError('form_not_found', 'Form view was not found');
  }
  if (view.sourceId !== described.source.id) {
    throw new DatabaseDataPlaneError('view_source_mismatch', 'Form belongs to another source');
  }
  const configuration = view.layout.configuration;
  if (configuration.access === 'internal' && !isLoopbackAddress(input.remoteAddress)) {
    throw new DatabaseDataPlaneError(
      'form_access_denied',
      'This form only accepts uploads from the local workspace.',
    );
  }
  const now = port.now();
  if (configuration.closesAt && now.getTime() >= Date.parse(configuration.closesAt)) {
    throw new DatabaseDataPlaneError('form_closed', configuration.closedMessage);
  }
  if (!configuration.fileUploads.enabled) {
    throw new DatabaseDataPlaneError(
      'form_invalid_submission',
      'This form does not accept file uploads.',
    );
  }
  const rate = configuration.spamProtection.rateLimit;
  const uploadLimit = rate.maxSubmissions * configuration.fileUploads.maxFilesPerQuestion;
  const rateDecision = await port.formStateStore.consumeRate({
    keyHash: databaseFormPrivateKey(
      `upload:${described.database.id}:${view.id}:${input.remoteAddress}`,
    ),
    nowMs: now.getTime(),
    windowSeconds: rate.windowSeconds,
    limit: uploadLimit,
  });
  if (!rateDecision.allowed) {
    throw new DatabaseDataPlaneError(
      'form_rate_limited',
      'Too many form files were uploaded. Please try again later.',
      { retryAfterSeconds: rateDecision.retryAfterSeconds },
    );
  }
  const folder = described.source.folder === '.' ? '' : `${described.source.folder}/`;
  return { parentDocName: `${folder}form-response` };
}
