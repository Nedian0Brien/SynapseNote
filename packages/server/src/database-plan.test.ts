import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createDatabasePlanEngine, DatabasePlanError } from './database-plan.ts';
import { DatabasePlanApprovalCodeSchema as extractedApprovalCodeSchema } from './database-plan-artifacts.ts';
import { hashDatabasePlanValue } from './database-plan-convergence-policy.ts';
import { DatabaseDesiredStateDraftSchema as extractedDraftSchema } from './database-plan-draft-contracts.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function files(root: string): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else found.push(relative(root, path));
    }
  };
  visit(root);
  return found.sort();
}

function desiredState() {
  return {
    database: {
      key: 'agent-tasks',
      name: 'Agent tasks',
      people: [
        {
          key: 'scheduler',
          name: 'Template scheduler',
          kind: 'agent' as const,
          subjectId: 'agent:template-scheduler',
          active: true,
        },
      ],
      contract: {
        purpose: 'Coordinate work between humans and agents',
        canonicality: 'canonical',
        vocabulary: ['task', 'agent'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
    },
    sources: [
      {
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One delegated task',
        folder: 'tasks',
        properties: [
          { key: 'title', name: 'Title', type: 'title', required: true },
          {
            key: 'status',
            name: 'Status',
            type: 'select',
            options: [
              { key: 'todo', name: 'Todo' },
              { key: 'done', name: 'Done' },
            ],
          },
        ],
      },
    ],
    views: [
      {
        key: 'open-table',
        name: 'Open tasks',
        sourceKey: 'tasks',
        layout: { type: 'table' },
        where: { propertyKey: 'status', operator: 'eq', value: 'todo' },
        sort: [{ propertyKey: 'title', direction: 'asc' }],
        projection: { propertyKeys: ['title', 'status'], body: 'preview' },
      },
    ],
    uniqueKey: { sourceKey: 'tasks', propertyKey: 'title' },
    templates: [
      {
        key: 'default-task',
        name: 'Default task',
        sourceKey: 'tasks',
        markdown: '## Context\n',
        propertyValues: { status: 'todo' },
        defaultFor: { source: true, viewKeys: ['open-table'], entryPoints: ['quick_capture'] },
        repeat: {
          schedule: { kind: 'weekly' as const, weekdays: [1, 5], time: '09:00' },
          timeZone: 'Asia/Seoul',
          ownerKey: 'scheduler',
          paused: false,
          retry: { maxAttempts: 3, initialBackoffSeconds: 60, multiplier: 2 },
        },
      },
    ],
    policy: {
      mode: 'review',
      allowedOperations: ['upsert_records'],
      maxRecordsPerCommit: 25,
    },
    sampleRecords: [
      {
        sourceKey: 'tasks',
        values: { title: 'Review evidence', status: 'todo' },
        body: 'Ground the decision in source excerpts.',
      },
    ],
  };
}

function bindStableIds(
  input: ReturnType<typeof desiredState>,
  definition: ReturnType<
    ReturnType<typeof fixture>['engine']['getDraft']
  >['normalized']['definition'],
) {
  const state = structuredClone(input) as ReturnType<typeof desiredState> & {
    database: ReturnType<typeof desiredState>['database'] & { id?: string };
  };
  state.database.id = definition.id;
  for (const source of state.sources) {
    const normalizedSource = definition.sources.find((candidate) => candidate.key === source.key);
    if (!normalizedSource) throw new Error(`missing source ${source.key}`);
    source.id = normalizedSource.id;
    for (const property of source.properties) {
      const normalizedProperty = normalizedSource.properties.find(
        (candidate) => candidate.key === property.key,
      );
      if (!normalizedProperty) throw new Error(`missing property ${property.key}`);
      property.id = normalizedProperty.id;
      if (
        (normalizedProperty.type === 'select' || normalizedProperty.type === 'multi_select') &&
        'options' in property &&
        Array.isArray(property.options)
      ) {
        for (const option of property.options) {
          const normalizedOption = normalizedProperty.options.find(
            (candidate) => candidate.key === option.key,
          );
          if (normalizedOption) option.id = normalizedOption.id;
        }
      }
    }
  }
  for (const view of state.views) {
    const normalizedView = definition.views.find((candidate) => candidate.key === view.key);
    if (normalizedView) view.id = normalizedView.id;
  }
  return state;
}

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-plan-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  const recordIndex = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  let counter = 0;
  let now = new Date('2026-07-19T10:00:00.000Z');
  const engine = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: recordIndex,
    projectDir,
    contentDir,
    now: () => now,
    generateUuid: () => `${String(++counter).padStart(8, '0')}-0000-4000-8000-000000000000`,
  });
  return {
    projectDir,
    contentDir,
    store,
    recordIndex,
    engine,
    setNow: (value: Date) => (now = value),
  };
}

describe('DatabasePlanEngine ephemeral desired state', () => {
  test('exposes the desired-state contract from its dedicated module', () => {
    expect(extractedDraftSchema.safeParse(desiredState()).success).toBe(true);
  });

  test('exposes immutable plan approval contracts from their dedicated module', () => {
    expect(extractedApprovalCodeSchema.parse('alter_schema')).toBe('alter_schema');
  });

  test('keeps plan hash canonicalization in the pure convergence policy', () => {
    expect(hashDatabasePlanValue({ b: 1, a: 2 })).toBe(
      'sha256:d3626ac30a87e6f7a6428233b3c68299976865fa5508e4267c5415c76af7a772',
    );
  });

  test('classifies every user-resolvable area touched by an exact plan', () => {
    const { engine } = fixture();
    const state = desiredState() as ReturnType<typeof desiredState> & { automations: unknown[] };
    const source = state.sources[0];
    if (!source) throw new Error('source fixture is missing');
    source.properties.push({
      key: 'score',
      name: 'Score',
      type: 'formula',
      source: '1',
      ast: {
        language: 'synapse-formula-1',
        version: 1,
        resultType: 'number',
        expression: { type: 'literal', valueType: 'number', value: 1 },
      },
    } as never);
    state.automations = [
      {
        key: 'notify-change',
        name: 'Notify on change',
        version: 1,
        enabled: false,
        ownerKey: 'scheduler',
        trigger: { kind: 'property_changed', sourceKey: 'tasks', propertyKey: 'status' },
        actions: [
          {
            id: 'notify',
            kind: 'notification',
            recipientKeys: ['scheduler'],
            title: 'Task changed',
          },
        ],
      },
    ];
    source.properties.push({
      key: 'parent',
      name: 'Parent',
      type: 'relation',
      targetSourceKey: 'tasks',
      cardinality: 'many',
    } as never);

    const plan = engine.createPlan(engine.createDraft(state).id);

    expect(plan.conflictDomains).toEqual([
      'record_value',
      'schema',
      'option',
      'view',
      'formula',
      'relation',
      'automation',
    ]);
    expect(plan.affectedObjects.automationIds).toHaveLength(1);
  });

  test('creates only authenticated, source-permitted, revision-bound Verification lifecycle plans', async () => {
    const { engine, store, recordIndex, contentDir } = fixture();
    const initial = desiredState();
    (initial.sources[0]?.properties as unknown[]).push({
      key: 'verification',
      name: 'Verification',
      type: 'verification',
      allowExpiry: true,
      requireEvidenceRevision: true,
    });
    const bootstrap = engine.createDraft(initial);
    await store.create(bootstrap.normalized.definition);
    const source = bootstrap.normalized.definition.sources[0];
    const sample = bootstrap.normalized.sampleRecords[0];
    const verification = source?.properties.find((property) => property.type === 'verification');
    if (!source || !sample || !verification) throw new Error('Verification fixture is missing');
    mkdirSync(join(contentDir, source.folder), { recursive: true });
    writeFileSync(
      join(contentDir, source.folder, 'review.md'),
      `---\n_sn:\n  database_id: ${bootstrap.normalized.definition.id}\n  source_id: ${source.id}\n  record_id: ${sample.id}\ntitle: Review evidence\nstatus: todo\n---\nEvidence body.\n`,
    );
    await recordIndex.rebuild();
    const indexed = recordIndex.getById(sample.id);
    if (!indexed?.revision || !indexed.evidenceRevision) {
      throw new Error('Verification record was not indexed');
    }

    expect(() =>
      engine.createVerificationDraft(
        {
          databaseId: bootstrap.normalized.definition.id,
          sourceId: source.id,
          recordId: sample.id,
          propertyId: verification.id,
          expectedRevision: indexed.revision,
          action: 'verify',
          evidenceRevision: indexed.evidenceRevision,
          expiresAt: '2026-07-20T10:00:00.000Z',
        },
        { kind: 'system', principal_id: 'forged' },
      ),
    ).toThrow('authenticated human, agent, or sync');

    const lifecycle = engine.createVerificationDraft(
      {
        databaseId: bootstrap.normalized.definition.id,
        sourceId: source.id,
        recordId: sample.id,
        propertyId: verification.id,
        expectedRevision: indexed.revision,
        action: 'verify',
        evidenceRevision: indexed.evidenceRevision,
        expiresAt: '2026-07-20T10:00:00.000Z',
        note: 'Reviewed against primary evidence.',
      },
      { kind: 'agent', principal_id: 'agent:reviewer' },
    );
    const plan = engine.createPlan(lifecycle.draft.id);
    expect(lifecycle.review).toMatchObject({
      action: 'verify',
      actor: { kind: 'agent', principal_id: 'agent:reviewer' },
      evidenceRevision: indexed.evidenceRevision,
      notePresent: true,
    });
    expect(plan.writeGuards.permissions).toContainEqual(
      expect.objectContaining({ scopeId: source.id, capability: 'verification' }),
    );
    expect(plan.verificationReview).toEqual(lifecycle.review);
    expect(plan.approvals).toContainEqual(
      expect.objectContaining({ code: 'verification_change', required: true }),
    );
    expect(plan.postconditions).toContainEqual(
      expect.objectContaining({ code: 'verification_attribution' }),
    );
    expect(plan.diff.records[0]?.after?.values[verification.id]).toMatchObject({
      state: 'verified',
      verifiedBy: { kind: 'agent', principal_id: 'agent:reviewer' },
      evidenceRevision: indexed.evidenceRevision,
    });
  });

  test('normalizes agent-authored conditional color keys to stable property and rule IDs', async () => {
    const { engine, store } = fixture();
    const initial = desiredState();
    Object.assign(initial.views[0] as object, {
      conditionalColors: [
        {
          key: 'todo-row',
          name: 'Todo row',
          color: 'yellow',
          where: { propertyKey: 'status', operator: 'eq', value: 'todo' },
          applyTo: { type: 'page' },
        },
        {
          key: 'todo-status',
          name: 'Todo status',
          color: 'orange',
          where: { propertyKey: 'status', operator: 'eq', value: 'todo' },
          applyTo: { type: 'property', propertyKey: 'status' },
        },
      ],
    });
    const first = engine.createDraft(initial);
    const normalizedView = first.normalized.definition.views[0];
    const status = first.normalized.definition.sources[0]?.properties.find(
      (property) => property.key === 'status',
    );
    if (!normalizedView || !status) throw new Error('conditional color fixture is missing');
    const storedDefinition = structuredClone(first.normalized.definition);
    expect(normalizedView.conditionalColors).toMatchObject([
      {
        id: expect.stringMatching(/^ccr_/),
        key: 'todo-row',
        where: { propertyId: status.id, operator: 'eq' },
        applyTo: { type: 'page' },
      },
      {
        id: expect.stringMatching(/^ccr_/),
        key: 'todo-status',
        where: { propertyId: status.id, operator: 'eq' },
        applyTo: { type: 'property', propertyId: status.id },
      },
    ]);
    expect(first.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'conditional_color_rule', via: 'generated' }),
      ]),
    );

    await store.create(storedDefinition);
    const repeated = engine.createDraft(initial);
    expect(
      repeated.normalized.definition.views[0]?.conditionalColors.map((rule) => rule.id),
    ).toEqual(normalizedView.conditionalColors.map((rule) => rule.id));
    expect(repeated.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'conditional_color_rule', via: 'stable_key' }),
      ]),
    );
  });

  test('normalizes Place values and keeps external search/map fail-closed', () => {
    const { engine } = fixture();
    const state = desiredState() as unknown as {
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
      sampleRecords: Array<{ values: Record<string, unknown> }>;
    };
    state.sources[0]?.properties.push({ key: 'where', name: 'Where', type: 'place' });
    const sample = state.sampleRecords[0];
    if (!sample) throw new Error('Place sample fixture missing');
    sample.values.where = {
      label: 'Approximate office',
      address: 'Jongno-gu, Seoul',
      lat: 37.5729381,
      lon: 126.9793579,
      precision: 'approximate',
      source: 'manual',
    };

    const draft = engine.createDraft(state as never);
    const place = draft.normalized.definition.sources[0]?.properties.find(
      (property) => property.type === 'place',
    );
    if (!place || place.type !== 'place') throw new Error('Place fixture missing');
    expect(place).toMatchObject({ externalSearch: 'disabled', externalMap: 'disabled' });
    expect(draft.normalized.sampleRecords[0]?.values[place.id]).toMatchObject({
      lat: 37.57,
      lon: 126.98,
      precision: 'approximate',
      source: 'manual',
    });

    const invalid = structuredClone(state);
    const invalidSample = invalid.sampleRecords[0];
    if (!invalidSample) throw new Error('Invalid Place sample fixture missing');
    (invalidSample.values.where as { lat: number }).lat = 91;
    expect(() => engine.createDraft(invalid as never)).toThrow(
      expect.objectContaining({
        details: { reason: expect.stringContaining('expected a place object') },
      }),
    );
  });

  test('allocates Unique IDs in declared create order and advances the durable watermark', () => {
    const { engine } = fixture();
    const state = desiredState() as unknown as {
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
      sampleRecords: Array<Record<string, unknown>>;
    };
    state.sources[0]?.properties.push({
      key: 'ticket',
      name: 'Ticket',
      type: 'unique_id',
      prefix: 'TASK',
      nextNumber: 40,
    });
    state.sampleRecords.push({
      sourceKey: 'tasks',
      values: { title: 'Second task', status: 'todo' },
      body: '',
    });

    const draft = engine.createDraft(state as never);
    const property = draft.normalized.definition.sources[0]?.properties.find(
      (candidate) => candidate.type === 'unique_id',
    );
    if (!property || property.type !== 'unique_id') throw new Error('Unique ID fixture missing');
    expect(draft.normalized.sampleRecords.map((record) => record.values[property.id])).toEqual([
      40, 41,
    ]);
    expect(property.nextNumber).toBe(42);

    const forged = structuredClone(state);
    const first = forged.sampleRecords[0] as { values?: Record<string, unknown> } | undefined;
    if (!first?.values) throw new Error('sample fixture missing');
    first.values.ticket = 999;
    expect(() => engine.createDraft(forged as never)).toThrow(
      expect.objectContaining({
        details: { reason: expect.stringContaining('derived and read-only') },
      }),
    );
  });

  test('resolves agent-authored Button source/property keys to canonical stable IDs', () => {
    const { engine } = fixture();
    const state = desiredState() as unknown as {
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
    };
    state.sources[0]?.properties.push({
      key: 'finish',
      name: 'Finish',
      type: 'button',
      label: 'Mark done',
      actions: [
        {
          id: 'mark_done',
          kind: 'update_record',
          operations: [{ op: 'set', propertyKey: 'status', value: 'done' }],
        },
        {
          id: 'notify',
          kind: 'external_webhook',
          connectionId: 'conn_tracker',
          eventName: 'task_finished',
          propertyKeys: ['title', 'status'],
        },
      ],
    });
    const draft = engine.createDraft(state as never);
    const source = draft.normalized.definition.sources[0];
    const button = source?.properties.find((property) => property.type === 'button');
    const status = source?.properties.find((property) => property.key === 'status');
    const title = source?.properties.find((property) => property.key === 'title');
    if (!button || button.type !== 'button' || !status || !title) {
      throw new Error('normalized Button fixture missing');
    }
    expect(button.actions).toEqual([
      {
        id: 'mark_done',
        kind: 'update_record',
        operations: [{ op: 'set', propertyId: status.id, value: 'done' }],
      },
      {
        id: 'notify',
        kind: 'external_webhook',
        connectionId: 'conn_tracker',
        eventName: 'task_finished',
        propertyIds: [title.id, status.id],
        includeBody: false,
      },
    ]);
    expect(draft.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'property', targetId: status.id, via: 'stable_key' }),
        expect.objectContaining({ kind: 'property', targetId: title.id, via: 'stable_key' }),
      ]),
    );
  });

  test('resolves Person keys and names to stable IDs and blocks inactive assignments', () => {
    const { engine } = fixture();
    const state = desiredState() as unknown as {
      database: Record<string, unknown>;
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
      sampleRecords: Array<{ values: Record<string, unknown> }>;
      templates: Array<{ repeat?: unknown }>;
    };
    if (state.templates[0]) delete state.templates[0].repeat;
    state.database.people = [
      {
        key: 'owner',
        name: 'Owner Name',
        kind: 'collaborator',
        subjectId: 'collaborator:owner',
      },
      { key: 'former', name: 'Former User', kind: 'guest', active: false },
      { key: 'codex', name: 'Codex', kind: 'agent', subjectId: 'agent:codex' },
    ];
    state.sources[0]?.properties.push({
      key: 'assignees',
      name: 'Assignees',
      type: 'person',
      multiple: true,
    });
    if (!state.sampleRecords[0]) throw new Error('expected sample record');
    state.sampleRecords[0].values.assignees = ['Owner Name', 'codex'];

    const draft = engine.createDraft(state as never);
    const people = draft.normalized.definition.people;
    const assignees = draft.normalized.definition.sources[0]?.properties.at(-1);
    const owner = people.find((person) => person.key === 'owner');
    const codex = people.find((person) => person.key === 'codex');
    if (!assignees || !owner || !codex) throw new Error('expected normalized Person targets');
    expect(draft.normalized.sampleRecords[0]?.values).toMatchObject({
      [assignees.id]: [owner.id, codex.id],
    });
    expect(draft.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'person', via: 'exact_name' }),
        expect.objectContaining({ kind: 'person', via: 'stable_key' }),
      ]),
    );

    state.sampleRecords[0].values.assignees = ['former'];
    try {
      engine.createDraft(state as never);
      throw new Error('expected inactive Person assignment to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabasePlanError);
      expect((error as DatabasePlanError).details.reason).toMatch(/inactive/);
    }
  });

  test('compiles agent-authored automation keys into stable trigger and action IDs', () => {
    const { engine } = fixture();
    const state = desiredState() as ReturnType<typeof desiredState> & { automations: unknown[] };
    state.automations = [
      {
        key: 'finish-followup',
        name: 'Create a follow-up when status changes',
        version: 2,
        enabled: true,
        ownerKey: 'scheduler',
        trigger: { kind: 'property_changed', sourceKey: 'tasks', propertyKey: 'status' },
        actions: [
          {
            id: 'create_followup',
            kind: 'create_record',
            sourceKey: 'tasks',
            values: {
              title: { fromEvent: 'property', propertyKey: 'title' },
              status: 'todo',
            },
          },
          {
            id: 'notify_scheduler',
            kind: 'notification',
            recipientKeys: ['scheduler'],
            title: 'Follow-up created',
          },
          {
            id: 'publish_change',
            kind: 'external_webhook',
            connectionId: 'conn_tasks',
            eventName: 'task_changed',
            propertyKeys: ['title', 'status'],
          },
        ],
      },
    ];

    const draft = engine.createDraft(state);
    const definition = draft.normalized.definition;
    const source = definition.sources[0];
    const automation = definition.automations[0];
    const owner = definition.people.find((person) => person.key === 'scheduler');
    const title = source?.properties.find((property) => property.key === 'title');
    const status = source?.properties.find((property) => property.key === 'status');
    if (!automation || !owner || !source || !title || !status) {
      throw new Error('normalized automation fixture missing');
    }
    expect(automation).toMatchObject({
      id: expect.stringMatching(/^auto_/),
      version: 2,
      enabled: true,
      ownerId: owner.id,
      trigger: { kind: 'property_changed', sourceId: source.id, propertyId: status.id },
      actions: [
        {
          id: 'create_followup',
          sourceId: source.id,
          values: {
            [title.id]: { fromEvent: 'property', propertyId: title.id },
            [status.id]: 'todo',
          },
        },
        { id: 'notify_scheduler', recipientIds: [owner.id] },
        { id: 'publish_change', propertyIds: [title.id, status.id], includeBody: false },
      ],
    });
    expect(draft.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'automation', targetId: automation.id, via: 'generated' }),
      ]),
    );
  });

  test('normalizes ordered Files values and rejects traversal, duplicate sources, and empty required lists', () => {
    const { engine } = fixture();
    const state = desiredState() as unknown as {
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
      sampleRecords: Array<{ values: Record<string, unknown> }>;
    };
    const source = state.sources[0];
    const sample = state.sampleRecords[0];
    if (!source || !sample) throw new Error('expected Files plan fixtures');
    source.properties.push({ key: 'assets', name: 'Assets', type: 'files', required: true });
    sample.values.assets = [
      { kind: 'local', path: 'assets/brief.pdf', caption: 'Source brief' },
      {
        kind: 'external',
        url: 'https://cdn.example.com/demo.mp4',
        name: 'Demo',
      },
    ];

    const draft = engine.createDraft(state as never);
    const property = draft.normalized.definition.sources[0]?.properties.at(-1);
    if (!property || property.type !== 'files') throw new Error('expected normalized Files');
    expect(draft.normalized.sampleRecords[0]?.values[property.id]).toEqual(sample.values.assets);

    for (const invalid of [
      [],
      [{ kind: 'local', path: '../escape.pdf' }],
      [
        { kind: 'local', path: 'assets/repeated.pdf' },
        { kind: 'local', path: 'assets/repeated.pdf' },
      ],
    ]) {
      sample.values.assets = invalid;
      expect(() => engine.createDraft(state as never)).toThrow(DatabasePlanError);
    }
  });

  test('applies defaults and enforces declared value and uniqueness constraints', () => {
    const { engine } = fixture();
    const state = desiredState();
    state.sources[0]?.properties.push({
      key: 'code',
      name: 'Code',
      type: 'text',
      semantics: {
        constraints: { unique: true, maxLength: 4, pattern: '^[A-Z]+$' },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
        defaultValue: 'NEW',
      },
    } as never);
    state.sources[0]?.properties.push({
      key: 'rank',
      name: 'Rank',
      type: 'number',
      semantics: {
        constraints: { unique: false, min: 0, max: 10 },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
      },
    } as never);

    const draft = engine.createDraft(state);
    const code = draft.normalized.definition.sources[0]?.properties.find(
      (property) => property.key === 'code',
    );
    if (!code) throw new Error('code property missing');
    expect(draft.normalized.sampleRecords[0]?.values[code.id]).toBe('NEW');

    const invalid = structuredClone(state);
    const invalidSample = invalid.sampleRecords[0];
    if (!invalidSample) throw new Error('sample fixture missing');
    invalidSample.values.rank = 11;
    expect(() => engine.createDraft(invalid)).toThrow(
      expect.objectContaining({
        code: 'invalid_desired_state',
        details: { reason: expect.stringContaining('at most 10') },
      }),
    );

    const duplicate = structuredClone(state);
    duplicate.sampleRecords.push({
      sourceKey: 'tasks',
      values: { title: 'Second record', status: 'todo', code: 'NEW' },
      body: '',
    });
    const duplicateDraft = engine.createDraft(duplicate);
    const duplicateCode = duplicateDraft.normalized.definition.sources[0]?.properties.find(
      (property) => property.key === 'code',
    );
    if (!duplicateCode) throw new Error('duplicate code property missing');
    const duplicatePlan = engine.createPlan(duplicateDraft.id);
    expect(duplicatePlan.committable).toBe(false);
    expect(duplicatePlan.conflicts).toContainEqual(
      expect.objectContaining({
        code: 'sample_unique_value_duplicate',
        propertyId: duplicateCode.id,
      }),
    );
  });

  test('creates stable default Status groups and options for an agent-authored property', () => {
    const { engine } = fixture();
    const state = desiredState() as unknown as Record<string, unknown> & {
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
      views: unknown[];
      sampleRecords: Array<{ values: Record<string, unknown> }>;
    };
    const source = state.sources[0];
    const sample = state.sampleRecords[0];
    if (!source || !sample) throw new Error('expected desired-state fixtures');
    state.templates = [];
    source.properties[1] = { key: 'status', name: 'Status', type: 'status' };
    state.views = [];
    sample.values.status = 'not_started';

    const draft = engine.createDraft(state);
    const property = draft.normalized.definition.sources[0]?.properties[1];
    if (!property || property.type !== 'status') throw new Error('expected Status property');
    expect(property.groups.map((group) => group.category)).toEqual([
      'todo',
      'in_progress',
      'complete',
    ]);
    expect(property.groups.every((group) => group.id.startsWith('stg_'))).toBe(true);
    expect(property.options.map((option) => option.key)).toEqual([
      'not_started',
      'in_progress',
      'done',
    ]);
    expect(property.options.every((option) => option.id.startsWith('opt_'))).toBe(true);
    expect(
      property.options.every((option) => property.groups.some((g) => g.id === option.groupId)),
    ).toBe(true);
    expect(draft.normalized.sampleRecords[0]?.values[property.id]).toBe(property.options[0]?.id);
  });

  test('normalizes schema references to stable IDs without writing project files', () => {
    const { projectDir, engine } = fixture();
    const before = files(projectDir);
    const draft = engine.createDraft(desiredState());
    const draftId = draft.id;
    const sampleValues = Object.values(draft.normalized.sampleRecords[0]?.values ?? {});
    const after = files(projectDir);

    expect(after).toEqual(before);
    expect(draft).toMatchObject({
      id: expect.stringMatching(/^draft_/),
      normalized: {
        definition: {
          id: expect.stringMatching(/^db_/),
          key: 'agent-tasks',
          sources: [
            {
              id: expect.stringMatching(/^ds_/),
              properties: [
                {
                  id: expect.stringMatching(/^prop_/),
                  key: 'title',
                  semantics: { constraints: { unique: true } },
                },
                { id: expect.stringMatching(/^prop_/), key: 'status' },
              ],
            },
          ],
          views: [
            {
              id: expect.stringMatching(/^view_/),
              where: {
                propertyId: expect.stringMatching(/^prop_/),
                value: expect.stringMatching(/^opt_/),
              },
              projection: {
                propertyIds: expect.arrayContaining([expect.stringMatching(/^prop_/)]),
              },
            },
          ],
        },
        sampleRecords: [
          {
            id: expect.stringMatching(/^rec_/),
            values: expect.objectContaining({}),
          },
        ],
      },
    });
    expect(draft.normalized.uniquePropertyId).toMatch(/^prop_/);
    expect(sampleValues).toContain('Review evidence');
    expect(
      sampleValues.some((value) => typeof value === 'string' && value.startsWith('opt_')),
    ).toBe(true);

    draft.normalized.definition.name = 'Mutated caller copy';
    expect(engine.getDraft(draftId).normalized.definition.name).toBe('Agent tasks');
  });

  test('compiles an explicit stable default-view ID into the source manifest', async () => {
    const { engine, store } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    const initialDraft = engine.createDraft(initial);
    await store.create(initialDraft.normalized.definition);
    const changed = bindStableIds(initial, initialDraft.normalized.definition);
    const source = changed.sources[0] as (typeof changed.sources)[number] & {
      defaultViewId?: string;
    };
    const viewId = initialDraft.normalized.definition.views[0]?.id;
    if (!viewId) throw new Error('expected saved view fixture');
    source.defaultViewId = viewId;

    const draft = engine.createDraft(changed);
    expect(draft.normalized.definition.sources[0]?.defaultViewId).toBe(viewId);
    const plan = engine.createPlan(draft.id);
    expect(plan.committable).toBe(true);
    expect(plan.diff.manifests[0]?.after).toContain(`defaultViewId: ${viewId}`);
  });

  test('preserves typed table display settings in a reviewed saved-view revision', async () => {
    const { engine, store } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    const initialDraft = engine.createDraft(initial);
    await store.create(initialDraft.normalized.definition);
    const changed = bindStableIds(initial, initialDraft.normalized.definition);
    const titleId = initialDraft.normalized.definition.sources[0]?.properties.find(
      (property) => property.key === 'title',
    )?.id;
    const statusId = initialDraft.normalized.definition.sources[0]?.properties.find(
      (property) => property.key === 'status',
    )?.id;
    const view = changed.views[0];
    if (!view || !titleId || !statusId) throw new Error('expected saved table view fixture');
    (view as typeof view & { favorite?: boolean }).favorite = true;
    view.layout = {
      type: 'table',
      configuration: {
        wrap: true,
        rowHeight: 'compact',
        propertyWidths: { [titleId]: 320, [statusId]: 180 },
      },
    };

    const draft = engine.createDraft(changed);
    expect(draft.normalized.definition.views[0]?.layout).toEqual(view.layout);
    const plan = engine.createPlan(draft.id);
    expect(plan.committable).toBe(true);
    expect(plan.diff.manifests[0]?.after).toContain('rowHeight: compact');
    expect(plan.diff.manifests[0]?.after).toContain(`${titleId}: 320`);
    expect(plan.diff.manifests[0]?.after).toContain('favorite: true');
  });

  test('preserves Formula manifests and resolves Rollup property keys to stable IDs', () => {
    const { engine } = fixture();
    const state = desiredState() as unknown as ReturnType<typeof desiredState> & {
      sources: Array<{
        id?: string;
        key: string;
        name: string;
        recordMeaning: string;
        folder: string;
        properties: Array<Record<string, unknown>>;
      }>;
      sampleRecords: Array<{ values: Record<string, unknown> }>;
    };
    const tasks = state.sources[0];
    const sample = state.sampleRecords[0];
    if (!tasks || !sample) throw new Error('expected desired-state fixtures');
    tasks.id = 'ds_tasks';
    tasks.properties[0] = {
      ...tasks.properties[0],
      id: 'prop_title',
    };
    tasks.properties[1] = {
      ...tasks.properties[1],
      id: 'prop_status',
    };
    tasks.properties.push(
      { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
      {
        id: 'prop_double_score',
        key: 'double_score',
        name: 'Double score',
        type: 'formula',
        source: 'prop("score") * 2',
        ast: {
          language: 'synapse-formula-1',
          version: 1,
          resultType: 'number',
          expression: {
            type: 'binary',
            operator: 'multiply',
            left: { type: 'property', propertyId: 'prop_score' },
            right: { type: 'literal', valueType: 'number', value: 2 },
          },
        },
      },
      {
        id: 'prop_project',
        key: 'project',
        name: 'Project',
        type: 'relation',
        targetSourceKey: 'projects',
        cardinality: 'many',
      },
      {
        id: 'prop_project_budget',
        key: 'project_budget',
        name: 'Project budget',
        type: 'rollup',
        relationPropertyKey: 'project',
        targetPropertyKey: 'budget',
        function: 'sum',
        targetValueType: 'number',
      },
    );
    state.sources.push({
      id: 'ds_projects',
      key: 'projects',
      name: 'Projects',
      recordMeaning: 'One project',
      folder: 'projects',
      properties: [
        { id: 'prop_project_title', key: 'title', name: 'Title', type: 'title', required: true },
        { id: 'prop_budget', key: 'budget', name: 'Budget', type: 'number' },
      ],
    });
    sample.values.score = 4;

    const draft = engine.createDraft(state as never);
    const normalizedTasks = draft.normalized.definition.sources.find(
      (source) => source.id === 'ds_tasks',
    );
    const formula = normalizedTasks?.properties.find(
      (property) => property.id === 'prop_double_score',
    );
    const rollup = normalizedTasks?.properties.find(
      (property) => property.id === 'prop_project_budget',
    );
    expect(formula).toMatchObject({
      type: 'formula',
      source: 'prop("score") * 2',
      ast: { resultType: 'number' },
    });
    expect(rollup).toMatchObject({
      type: 'rollup',
      relationPropertyId: 'prop_project',
      targetPropertyId: 'prop_budget',
      function: 'sum',
      targetValueType: 'number',
    });
    expect(draft.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: 'sources.tasks.properties.project_budget.relationProperty',
          targetId: 'prop_project',
          via: 'stable_key',
        }),
        expect.objectContaining({
          selector: 'sources.tasks.properties.project_budget.targetProperty',
          targetId: 'prop_budget',
          via: 'stable_key',
        }),
      ]),
    );

    const forged = structuredClone(state);
    const forgedSample = forged.sampleRecords[0];
    if (!forgedSample) throw new Error('expected forged sample fixture');
    forgedSample.values.double_score = 8;
    expect(() => engine.createDraft(forged as never)).toThrow(
      expect.objectContaining({
        details: { reason: expect.stringContaining('derived and read-only') },
      }),
    );
  });

  test('normalizes symmetric paired relation keys and expands one-sided replacement atomically', async () => {
    const { contentDir, engine, store, recordIndex } = fixture();
    const state = desiredState() as unknown as ReturnType<typeof desiredState> & {
      database: ReturnType<typeof desiredState>['database'] & { id?: string };
      sources: Array<{
        id?: string;
        key: string;
        name: string;
        recordMeaning: string;
        folder: string;
        properties: Array<Record<string, unknown>>;
      }>;
    };
    state.templates = [];
    state.sampleRecords = [];
    state.sources[0]?.properties.push({
      key: 'project',
      name: 'Project',
      type: 'relation',
      targetSourceKey: 'projects',
      cardinality: 'one',
      pairedPropertyKey: 'task',
    });
    state.sources.push({
      key: 'projects',
      name: 'Projects',
      recordMeaning: 'One project',
      folder: 'projects',
      properties: [
        { key: 'title', name: 'Title', type: 'title', required: true },
        {
          key: 'task',
          name: 'Task',
          type: 'relation',
          targetSourceKey: 'tasks',
          cardinality: 'one',
          pairedPropertyKey: 'project',
        },
      ],
    });

    const initialDraft = engine.createDraft(state as never);
    const definition = initialDraft.normalized.definition;
    const tasks = definition.sources.find((source) => source.key === 'tasks');
    const projects = definition.sources.find((source) => source.key === 'projects');
    const projectProperty = tasks?.properties.find((property) => property.key === 'project');
    const taskProperty = projects?.properties.find((property) => property.key === 'task');
    if (
      !tasks ||
      !projects ||
      !projectProperty ||
      projectProperty.type !== 'relation' ||
      !taskProperty ||
      taskProperty.type !== 'relation'
    ) {
      throw new Error('expected paired relation fixtures');
    }
    expect(projectProperty.pairedPropertyId).toBe(taskProperty.id);
    expect(taskProperty.pairedPropertyId).toBe(projectProperty.id);
    expect(initialDraft.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'property', targetId: taskProperty.id, via: 'stable_key' }),
        expect.objectContaining({
          kind: 'property',
          targetId: projectProperty.id,
          via: 'stable_key',
        }),
      ]),
    );

    await store.create(definition);
    mkdirSync(join(contentDir, tasks.folder), { recursive: true });
    mkdirSync(join(contentDir, projects.folder), { recursive: true });
    writeFileSync(
      join(contentDir, tasks.folder, 'rec_task.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${tasks.id}\n  record_id: rec_task\ntitle: Task\nproject: rec_project_old\n---\n`,
    );
    writeFileSync(
      join(contentDir, projects.folder, 'rec_project_old.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${projects.id}\n  record_id: rec_project_old\ntitle: Old project\ntask: rec_task\n---\n`,
    );
    writeFileSync(
      join(contentDir, projects.folder, 'rec_project_new.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${projects.id}\n  record_id: rec_project_new\ntitle: New project\n---\n`,
    );
    await recordIndex.rebuild();
    const task = recordIndex.getById('rec_task');
    if (!task?.revision) throw new Error('expected indexed task');

    const stableState = structuredClone(state);
    stableState.database.id = definition.id;
    for (const source of stableState.sources) {
      const normalizedSource = definition.sources.find((candidate) => candidate.key === source.key);
      if (!normalizedSource) throw new Error('normalized source is missing');
      source.id = normalizedSource.id;
      for (const property of source.properties) {
        const normalizedProperty = normalizedSource.properties.find(
          (candidate) => candidate.key === property.key,
        );
        if (!normalizedProperty) throw new Error('normalized property is missing');
        property.id = normalizedProperty.id;
        if (normalizedProperty.type === 'relation') {
          property.targetSourceId = normalizedProperty.targetSourceId;
          property.pairedPropertyId = normalizedProperty.pairedPropertyId;
          delete property.targetSourceKey;
          delete property.pairedPropertyKey;
        }
      }
    }
    stableState.recordMutations = [
      {
        id: task.id,
        expectedRevision: task.revision,
        sourceKey: tasks.key,
        operations: [
          {
            op: 'link',
            propertyKey: projectProperty.key,
            recordId: 'rec_project_new',
          },
        ],
      },
    ];
    const mutationDraft = engine.createDraft(stableState as never);
    expect(mutationDraft.normalized.sampleRecords).toHaveLength(3);
    const plannedTask = mutationDraft.normalized.sampleRecords.find(
      (sample) => sample.id === 'rec_task',
    );
    const oldProject = mutationDraft.normalized.sampleRecords.find(
      (sample) => sample.id === 'rec_project_old',
    );
    const newProject = mutationDraft.normalized.sampleRecords.find(
      (sample) => sample.id === 'rec_project_new',
    );
    expect(plannedTask?.values[projectProperty.id]).toBe('rec_project_new');
    expect(oldProject?.values[taskProperty.id]).toBeUndefined();
    expect(newProject?.values[taskProperty.id]).toBe('rec_task');
    expect(mutationDraft.normalized.sampleRecords.every((sample) => sample.expectedRevision)).toBe(
      true,
    );
    expect(mutationDraft.normalized.recordMutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordId: 'rec_project_old',
          operations: expect.arrayContaining([
            expect.objectContaining({ kind: 'unlink', recordId: 'rec_task' }),
          ]),
        }),
        expect.objectContaining({
          recordId: 'rec_project_new',
          operations: expect.arrayContaining([
            expect.objectContaining({ kind: 'link', recordId: 'rec_task' }),
          ]),
        }),
      ]),
    );
    const plan = engine.createPlan(mutationDraft.id);
    expect(plan.committable).toBe(true);
    expect(plan.diff.records).toHaveLength(3);
    expect(plan.diff.records.every((record) => record.action === 'update')).toBe(true);
    expect(plan.normalizedOperations).toContainEqual(
      expect.objectContaining({
        kind: 'ensure_relation',
        propertyId: projectProperty.id,
        pairedPropertyId: taskProperty.id,
      }),
    );

    const oneSidedRemoval = structuredClone(stableState);
    const oneSidedTasks = oneSidedRemoval.sources.find((source) => source.key === 'tasks');
    if (!oneSidedTasks) throw new Error('tasks source is missing');
    oneSidedTasks.properties = oneSidedTasks.properties.filter(
      (property) => property.key !== 'project',
    );
    oneSidedRemoval.recordMutations = [];
    expect(() => engine.createDraft(oneSidedRemoval as never)).toThrow(DatabasePlanError);

    const pairedRemoval = structuredClone(oneSidedRemoval);
    const pairedProjects = pairedRemoval.sources.find((source) => source.key === 'projects');
    if (!pairedProjects) throw new Error('projects source is missing');
    pairedProjects.properties = pairedProjects.properties.filter(
      (property) => property.key !== 'task',
    );
    const blockedRemoval = engine.createPlan(engine.createDraft(pairedRemoval as never).id);
    expect(blockedRemoval.committable).toBe(false);
    expect(blockedRemoval.conflicts).toContainEqual(
      expect.objectContaining({ code: 'source_record_migration_required' }),
    );

    pairedRemoval.sampleRecords = [
      {
        id: 'rec_task',
        expectedRevision: recordIndex.getById('rec_task')?.revision,
        sourceKey: 'tasks',
        values: { title: 'Task', status: 'todo' },
        body: '',
      },
      {
        id: 'rec_project_old',
        expectedRevision: recordIndex.getById('rec_project_old')?.revision,
        sourceKey: 'projects',
        values: { title: 'Old project' },
        body: '',
      },
      {
        id: 'rec_project_new',
        expectedRevision: recordIndex.getById('rec_project_new')?.revision,
        sourceKey: 'projects',
        values: { title: 'New project' },
        body: '',
      },
    ] as never;
    const exactRemoval = engine.createPlan(engine.createDraft(pairedRemoval as never).id);
    expect(exactRemoval.committable).toBe(true);
    expect(exactRemoval.conflicts).not.toContainEqual(
      expect.objectContaining({ code: 'source_record_migration_required' }),
    );
    expect(exactRemoval.diff.records).toHaveLength(2);

    const sourceRemoval = structuredClone(pairedRemoval);
    sourceRemoval.sampleRecords = [];
    sourceRemoval.sources = sourceRemoval.sources.filter((source) => source.key !== 'projects');
    const blockedSourceRemoval = engine.createPlan(engine.createDraft(sourceRemoval as never).id);
    expect(blockedSourceRemoval.committable).toBe(false);
    expect(blockedSourceRemoval.conflicts).toContainEqual(
      expect.objectContaining({ code: 'source_removal_blocked', targetId: projects.id }),
    );
  });

  test('creates an immutable snapshot-bound plan with exact diff and safety metadata', () => {
    const { projectDir, engine } = fixture();
    const before = files(projectDir);
    const state = desiredState();
    state.templates = [];
    const draft = engine.createDraft(state);
    const plan = engine.createPlan(draft.id);
    const planId = plan.id;
    const planHash = plan.hash;
    expect(files(projectDir)).toEqual(before);
    expect(plan).toMatchObject({
      id: expect.stringMatching(/^plan_/),
      hash: expect.stringMatching(/^sha256:/),
      draftId: draft.id,
      snapshotRevision: 'sha256:empty',
      diff: {
        mode: 'exact',
        manifests: [
          {
            path: '.ok/databases/agent-tasks.yml',
            before: null,
            after: expect.stringContaining('key: agent-tasks'),
          },
        ],
        records: [
          {
            path: expect.stringMatching(/^tasks\/rec_/),
            before: null,
            after: { body: 'Ground the decision in source excerpts.' },
          },
        ],
      },
      risk: { level: 'medium' },
      conflicts: [],
      approvals: expect.arrayContaining([
        expect.objectContaining({ code: 'create_database', required: true }),
        expect.objectContaining({
          code: 'sample_record_write',
          required: true,
        }),
      ]),
      postconditions: expect.arrayContaining([
        expect.objectContaining({ code: 'manifest_valid' }),
        expect.objectContaining({ code: 'unique_key' }),
      ]),
      committable: true,
    });
    expect(plan.normalizedOperations.map((operation) => operation.kind)).toEqual([
      'ensure_database',
      'ensure_property',
      'ensure_property',
      'ensure_view',
      'upsert_records',
    ]);
    expect(plan.immutableTargetSet).toEqual([...plan.immutableTargetSet].sort());
    expect(new Set(plan.immutableTargetSet).size).toBe(plan.immutableTargetSet.length);
    expect(
      plan.targetResolutions.every((resolution) =>
        plan.immutableTargetSet.includes(resolution.targetId),
      ),
    ).toBe(true);

    const sameBody = engine.createPlan(draft.id);
    expect(sameBody.hash).toBe(planHash);
    const manifest = plan.diff.manifests[0];
    if (!manifest) throw new Error('expected manifest diff');
    (manifest as { after: string }).after = 'caller mutation';
    expect(engine.getPlan(planId).diff.manifests[0]?.after).not.toBe('caller mutation');
  });

  test('compiles stable-ID ensure and alter-schema commands into create, update, and no-op actions', async () => {
    const { engine, store } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    const initialDraft = engine.createDraft(initial);
    await store.create(initialDraft.normalized.definition);

    const keyResolvedDraft = engine.createDraft(initial);
    expect(keyResolvedDraft.normalized.definition).toEqual(initialDraft.normalized.definition);
    expect(keyResolvedDraft.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'database', via: 'stable_key' }),
        expect.objectContaining({ kind: 'source', via: 'stable_key' }),
        expect.objectContaining({ kind: 'property', via: 'stable_key' }),
        expect.objectContaining({ kind: 'option', via: 'stable_key' }),
        expect.objectContaining({ kind: 'view', via: 'stable_key' }),
      ]),
    );
    const stableState = bindStableIds(initial, initialDraft.normalized.definition);
    const noOpPlan = engine.createPlan(keyResolvedDraft.id);
    expect(noOpPlan).toMatchObject({
      conflicts: [],
      committable: false,
      requiresCommit: false,
      diff: { manifests: [], records: [] },
    });
    expect(noOpPlan.normalizedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ensure_database', action: 'noop' }),
        expect.objectContaining({ kind: 'ensure_property', action: 'noop' }),
        expect.objectContaining({ kind: 'ensure_view', action: 'noop' }),
        expect.objectContaining({ kind: 'alter_schema', action: 'noop' }),
      ]),
    );

    const changed = structuredClone(stableState);
    changed.sources[0].properties[1].name = 'Workflow status';
    changed.sources[0].properties.push({
      id: 'prop_related_tasks',
      key: 'related_tasks',
      name: 'Related tasks',
      type: 'relation',
      targetSourceKey: 'tasks',
      cardinality: 'many',
    });
    const updatePlan = engine.createPlan(engine.createDraft(changed).id);
    expect(updatePlan).toMatchObject({
      conflicts: [],
      committable: true,
      requiresCommit: true,
      diff: {
        manifests: [
          {
            path: '.ok/databases/agent-tasks.yml',
            action: 'update',
            before: expect.stringContaining('name: Agent tasks'),
            after: expect.stringContaining('name: Workflow status'),
          },
        ],
      },
    });
    expect(updatePlan.normalizedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ensure_database', action: 'update' }),
        expect.objectContaining({ kind: 'ensure_property', action: 'update' }),
        expect.objectContaining({ kind: 'ensure_relation', action: 'create' }),
        expect.objectContaining({
          kind: 'alter_schema',
          action: 'update',
          addedIds: ['prop_related_tasks'],
        }),
      ]),
    );
  });

  test('plans revision-bound record upserts as create, update, or no-op', async () => {
    const { contentDir, engine, store, recordIndex } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    const initialDraft = engine.createDraft(initial);
    const definition = initialDraft.normalized.definition;
    await store.create(definition);
    const source = definition.sources[0];
    if (!source) throw new Error('expected source');
    mkdirSync(join(contentDir, source.folder), { recursive: true });
    writeFileSync(
      join(contentDir, source.folder, 'rec_existing.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${source.id}\n  record_id: rec_existing\ntitle: Existing\nstatus: todo\n---\nOriginal body\n`,
    );
    await recordIndex.rebuild();
    const existing = recordIndex.getById('rec_existing');
    if (!existing?.revision) throw new Error('expected indexed record');

    const stableState = bindStableIds(initial, definition);
    const canonicalViewState = structuredClone(stableState);
    const canonicalView = definition.views[0];
    if (!canonicalView) throw new Error('expected canonical view');
    canonicalViewState.views = [
      {
        ...structuredClone(canonicalView),
        sourceKey: source.key,
      } as never,
    ];
    const canonicalViewDraft = engine.createDraft(canonicalViewState);
    expect(canonicalViewDraft.normalized.definition.views[0]).toEqual(canonicalView);

    const unsafeSchema = structuredClone(stableState);
    unsafeSchema.sources[0].properties[1].key = 'workflow_status';
    unsafeSchema.views[0].where.propertyKey = 'workflow_status';
    unsafeSchema.views[0].projection.propertyKeys = ['title', 'workflow_status'];
    const migrationRequired = engine.createPlan(engine.createDraft(unsafeSchema).id);
    expect(migrationRequired.committable).toBe(false);
    expect(migrationRequired.conflicts).toContainEqual(
      expect.objectContaining({ code: 'source_record_migration_required', targetId: source.id }),
    );

    const reorderedSchema = structuredClone(stableState);
    const reorderedStatus = reorderedSchema.sources[0].properties[1];
    if (!Array.isArray(reorderedStatus.options)) throw new Error('expected status options');
    reorderedStatus.options.reverse();
    const reorderPlan = engine.createPlan(engine.createDraft(reorderedSchema).id);
    expect(reorderPlan.committable).toBe(true);
    expect(reorderPlan.conflicts).not.toContainEqual(
      expect.objectContaining({ code: 'source_record_migration_required' }),
    );
    expect(reorderPlan.diff.records).toEqual([]);

    const mergedSchema = structuredClone(stableState);
    const mergedStatus = mergedSchema.sources[0].properties[1];
    if (!Array.isArray(mergedStatus.options)) throw new Error('expected status options');
    mergedStatus.options = mergedStatus.options.filter((option) => option.key !== 'todo');
    const mergedView = mergedSchema.views[0];
    if (!mergedView?.where || !('value' in mergedView.where)) {
      throw new Error('expected status view filter');
    }
    mergedView.where.value = 'done';
    mergedSchema.recordMutations = [
      {
        id: existing.id,
        expectedRevision: existing.revision,
        sourceKey: 'tasks',
        operations: [{ op: 'set', propertyKey: 'status', value: 'done' }],
      },
    ];
    const mergePlan = engine.createPlan(engine.createDraft(mergedSchema).id);
    expect(mergePlan.committable).toBe(true);
    expect(mergePlan.conflicts).not.toContainEqual(
      expect.objectContaining({ code: 'source_record_migration_required' }),
    );
    expect(mergePlan.diff.records).toEqual([
      expect.objectContaining({
        recordId: existing.id,
        action: 'update',
        after: expect.objectContaining({ values: expect.objectContaining({}) }),
      }),
    ]);

    stableState.sampleRecords = [
      {
        id: existing.id,
        expectedRevision: existing.revision,
        sourceKey: 'tasks',
        values: { title: 'Existing', status: 'todo' },
        body: 'Original body\n',
      },
    ];
    const noOp = engine.createPlan(engine.createDraft(stableState).id);
    expect(noOp.requiresCommit).toBe(false);
    expect(noOp.normalizedOperations).toContainEqual(
      expect.objectContaining({
        kind: 'upsert_records',
        created: 0,
        updated: 0,
        unchanged: 1,
      }),
    );

    stableState.sampleRecords[0].values.status = 'done';
    stableState.sampleRecords[0].body = 'Updated body\n';
    const update = engine.createPlan(engine.createDraft(stableState).id);
    expect(update.diff.records).toEqual([
      expect.objectContaining({
        recordId: existing.id,
        action: 'update',
        before: expect.objectContaining({ revision: existing.revision }),
        after: expect.objectContaining({ body: 'Updated body\n' }),
      }),
    ]);

    delete stableState.sampleRecords[0].expectedRevision;
    const unsafe = engine.createPlan(engine.createDraft(stableState).id);
    expect(unsafe.committable).toBe(false);
    expect(unsafe.conflicts).toContainEqual(
      expect.objectContaining({ code: 'record_revision_required', targetId: existing.id }),
    );

    stableState.sampleRecords = [
      {
        id: 'rec_new_record',
        sourceKey: 'tasks',
        values: { title: 'New', status: 'todo' },
        body: '',
      },
    ];
    const create = engine.createPlan(engine.createDraft(stableState).id);
    expect(create.diff.records).toEqual([
      expect.objectContaining({ recordId: 'rec_new_record', action: 'create', before: null }),
    ]);

    stableState.policy.maxRecordsPerCommit = 1;
    stableState.sampleRecords.push(structuredClone(stableState.sampleRecords[0]));
    const duplicate = engine.createPlan(engine.createDraft(stableState).id);
    expect(duplicate.committable).toBe(false);
    expect(duplicate.conflicts.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining(['duplicate_record_target', 'record_limit_exceeded']),
    );
  });

  test('requires a stable document identity for explicit v2 create IDs', async () => {
    const { engine } = fixture();
    const state = desiredState() as ReturnType<typeof desiredState> & {
      sampleRecords: Array<{ id?: string; documentId?: string }>;
    };
    const source = state.sources[0];
    const sample = state.sampleRecords[0];
    if (!source || !sample) throw new Error('expected v2 identity fixtures');
    source.storage = 'markdown_table';
    sample.id = 'rec_caller_supplied';
    delete sample.documentId;

    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan.committable).toBe(false);
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        code: 'record_identity_required',
        targetId: 'rec_caller_supplied',
      }),
    );
  });

  test('plans revision-bound record deletion as an exact high-risk diff', async () => {
    const { contentDir, engine, store, recordIndex } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    const initialDraft = engine.createDraft(initial);
    const definition = initialDraft.normalized.definition;
    await store.create(definition);
    const source = definition.sources[0];
    if (!source) throw new Error('expected source');
    mkdirSync(join(contentDir, source.folder), { recursive: true });
    writeFileSync(
      join(contentDir, source.folder, 'rec_delete_me.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${source.id}\n  record_id: rec_delete_me\ntitle: Delete me\nstatus: todo\n---\nPreserve for undo.\n`,
    );
    await recordIndex.rebuild();
    const existing = recordIndex.getById('rec_delete_me');
    if (!existing?.revision) throw new Error('expected indexed deletion target');

    const stableState = bindStableIds(initial, definition) as ReturnType<
      typeof engine.createDraft
    >['desiredState'];
    stableState.recordDeletions = [
      { id: existing.id, expectedRevision: existing.revision, sourceKey: 'tasks' },
    ];
    const plan = engine.createPlan(engine.createDraft(stableState).id);
    expect(plan).toMatchObject({
      committable: true,
      requiresCommit: true,
      conflicts: [],
      risk: { level: 'high', reasons: ['Deletes 1 canonical record(s)'] },
      diff: {
        manifests: [],
        records: [
          {
            recordId: existing.id,
            action: 'delete',
            before: { revision: existing.revision, body: 'Preserve for undo.\n' },
            after: null,
          },
        ],
      },
    });
    expect(plan.normalizedOperations).toContainEqual({
      kind: 'delete_records',
      sourceId: source.id,
      recordIds: [existing.id],
    });
    expect(plan.approvals).toContainEqual(
      expect.objectContaining({ code: 'delete_record', required: true }),
    );
    expect(plan.immutableTargetSet).toContain(existing.id);

    const staleState = structuredClone(stableState);
    const staleDeletion = staleState.recordDeletions[0];
    if (!staleDeletion) throw new Error('expected stale deletion fixture');
    staleDeletion.expectedRevision = `sha256:${'0'.repeat(64)}`;
    const stalePlan = engine.createPlan(engine.createDraft(staleState).id);
    expect(stalePlan.committable).toBe(false);
    expect(stalePlan.conflicts).toContainEqual(
      expect.objectContaining({ code: 'record_revision_changed', targetId: existing.id }),
    );

    const duplicateState = structuredClone(stableState);
    duplicateState.sampleRecords = [
      {
        id: existing.id,
        expectedRevision: existing.revision,
        sourceKey: 'tasks',
        values: { title: 'Delete me', status: 'todo' },
        body: 'Preserve for undo.\n',
      },
    ];
    const duplicatePlan = engine.createPlan(engine.createDraft(duplicateState).id);
    expect(duplicatePlan.committable).toBe(false);
    expect(duplicatePlan.conflicts).toContainEqual(
      expect.objectContaining({ code: 'duplicate_record_target', targetId: existing.id }),
    );
  });

  test('blocks deletion while a surviving record still references the target', async () => {
    const { contentDir, engine, store, recordIndex } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    initial.sources[0].properties.push({
      key: 'related',
      name: 'Related',
      type: 'relation',
      targetSourceKey: 'tasks',
      cardinality: 'many',
    } as never);
    const initialDraft = engine.createDraft(initial);
    const definition = initialDraft.normalized.definition;
    await store.create(definition);
    const source = definition.sources[0];
    const relation = source?.properties.find((property) => property.key === 'related');
    if (!source || !relation) throw new Error('expected relation source');
    mkdirSync(join(contentDir, source.folder), { recursive: true });
    writeFileSync(
      join(contentDir, source.folder, 'rec_delete_target.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${source.id}\n  record_id: rec_delete_target\ntitle: Target\nstatus: todo\n---\n`,
    );
    writeFileSync(
      join(contentDir, source.folder, 'rec_survivor.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${source.id}\n  record_id: rec_survivor\ntitle: Survivor\nstatus: todo\nrelated:\n  - rec_delete_target\n---\n`,
    );
    await recordIndex.rebuild();
    const target = recordIndex.getById('rec_delete_target');
    if (!target?.revision) throw new Error('expected deletion target');
    const state = bindStableIds(initial, definition) as ReturnType<
      typeof engine.createDraft
    >['desiredState'];
    state.recordDeletions = [
      { id: target.id, expectedRevision: target.revision, sourceKey: 'tasks' },
    ];
    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan.committable).toBe(false);
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        code: 'relation_target_missing',
        targetId: target.id,
        propertyId: relation.id,
        sampleRecordId: 'rec_survivor',
      }),
    );
  });

  test('blocks a target move that would leave a relation pointing at the wrong source', async () => {
    const { contentDir, engine, store, recordIndex } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    initial.sources[0].properties.push({
      key: 'related',
      name: 'Related',
      type: 'relation',
      targetSourceKey: 'tasks',
      cardinality: 'many',
    } as never);
    initial.sources.push({
      key: 'archive',
      name: 'Archive',
      recordMeaning: 'One archived task',
      folder: 'archive',
      properties: [
        { key: 'title', name: 'Title', type: 'title', required: true },
        {
          key: 'status',
          name: 'Status',
          type: 'select',
          options: [
            { key: 'todo', name: 'Todo' },
            { key: 'done', name: 'Done' },
          ],
        },
      ],
    });
    initial.sourceMappings = [
      {
        sourceKey: 'tasks',
        targetSourceKey: 'archive',
        propertyMappings: [
          { sourcePropertyKey: 'title', targetPropertyKey: 'title', optionMappings: [] },
          {
            sourcePropertyKey: 'status',
            targetPropertyKey: 'status',
            optionMappings: [
              { sourceOptionKey: 'todo', targetOptionKey: 'todo' },
              { sourceOptionKey: 'done', targetOptionKey: 'done' },
            ],
          },
        ],
      },
    ];
    const initialDraft = engine.createDraft(initial);
    const definition = initialDraft.normalized.definition;
    await store.create(definition);
    const source = definition.sources.find((candidate) => candidate.key === 'tasks');
    const relation = source?.properties.find((property) => property.key === 'related');
    if (!source || !relation) throw new Error('expected relation source');
    mkdirSync(join(contentDir, source.folder), { recursive: true });
    writeFileSync(
      join(contentDir, source.folder, 'rec_move_target.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${source.id}\n  record_id: rec_move_target\ntitle: Target\nstatus: todo\n---\n`,
    );
    writeFileSync(
      join(contentDir, source.folder, 'rec_move_survivor.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${source.id}\n  record_id: rec_move_survivor\ntitle: Survivor\nstatus: todo\nrelated:\n  - rec_move_target\n---\n`,
    );
    await recordIndex.rebuild();
    const target = recordIndex.getById('rec_move_target');
    if (!target?.revision) throw new Error('expected move target');
    const state = bindStableIds(initial, definition) as ReturnType<
      typeof engine.createDraft
    >['desiredState'];
    state.recordMoves = [
      {
        id: target.id,
        expectedRevision: target.revision,
        sourceKey: 'tasks',
        targetSourceKey: 'archive',
      },
    ];
    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan.committable).toBe(false);
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        code: 'relation_target_missing',
        targetId: target.id,
        propertyId: relation.id,
        sampleRecordId: 'rec_move_survivor',
      }),
    );
  });

  test('plans a duplicate from an exact source revision without mutating the source', async () => {
    const { contentDir, engine, store, recordIndex } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    const initialDraft = engine.createDraft(initial);
    const definition = initialDraft.normalized.definition;
    await store.create(definition);
    const source = definition.sources[0];
    if (!source) throw new Error('expected source');
    mkdirSync(join(contentDir, source.folder), { recursive: true });
    writeFileSync(
      join(contentDir, source.folder, 'rec_copy_source.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${source.id}\n  record_id: rec_copy_source\ntitle: Original\nstatus: todo\n---\nExact copied body.\n`,
    );
    await recordIndex.rebuild();
    const existing = recordIndex.getById('rec_copy_source');
    if (!existing?.revision) throw new Error('expected copy source');
    const state = bindStableIds(initial, definition) as ReturnType<
      typeof engine.createDraft
    >['desiredState'];
    state.recordCopies = [
      {
        id: existing.id,
        expectedRevision: existing.revision,
        sourceKey: source.key,
        newId: 'rec_copy_target',
        title: 'Original copy',
      },
    ];
    const plan = engine.createPlan(engine.createDraft(state).id);
    expect(plan).toMatchObject({
      committable: true,
      conflicts: [],
      diff: {
        manifests: [],
        records: [
          {
            recordId: 'rec_copy_target',
            action: 'create',
            before: null,
            after: { body: 'Exact copied body.\n' },
          },
        ],
      },
    });
    expect(plan.normalizedOperations).toContainEqual({
      kind: 'duplicate_records',
      sourceId: source.id,
      copies: [{ sourceRecordId: existing.id, newRecordId: 'rec_copy_target' }],
    });
    expect(plan.immutableTargetSet).toEqual(
      expect.arrayContaining([existing.id, 'rec_copy_target']),
    );
    const titleProperty = source.properties.find((property) => property.type === 'title');
    if (!titleProperty) throw new Error('expected title property');
    expect(plan.diff.records[0]?.after?.values[titleProperty.id]).toBe('Original copy');

    const stale = structuredClone(state);
    const staleCopy = stale.recordCopies[0];
    if (!staleCopy) throw new Error('expected copy fixture');
    staleCopy.expectedRevision = `sha256:${'0'.repeat(64)}`;
    const stalePlan = engine.createPlan(engine.createDraft(stale).id);
    expect(stalePlan.committable).toBe(false);
    expect(stalePlan.conflicts).toContainEqual(
      expect.objectContaining({ code: 'record_revision_changed', targetId: existing.id }),
    );
  });

  test('gives a duplicate a fresh Unique ID and persists the advanced watermark', async () => {
    const { contentDir, engine, store, recordIndex } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    initial.sources[0].properties.push({
      key: 'ticket',
      name: 'Ticket',
      type: 'unique_id',
      prefix: 'TASK',
      nextNumber: 6,
    } as never);
    const initialDraft = engine.createDraft(initial);
    const definition = initialDraft.normalized.definition;
    await store.create(definition);
    const source = definition.sources[0];
    const uniqueId = source?.properties.find((property) => property.type === 'unique_id');
    if (!source || !uniqueId || uniqueId.type !== 'unique_id') {
      throw new Error('expected Unique ID source');
    }
    mkdirSync(join(contentDir, source.folder), { recursive: true });
    writeFileSync(
      join(contentDir, source.folder, 'rec_unique_source.md'),
      `---\n_sn:\n  database_id: ${definition.id}\n  source_id: ${source.id}\n  record_id: rec_unique_source\ntitle: Original\nstatus: todo\nticket: 5\n---\n`,
    );
    await recordIndex.rebuild();
    const existing = recordIndex.getById('rec_unique_source');
    if (!existing?.revision) throw new Error('expected Unique ID copy source');
    const state = bindStableIds(initial, definition) as ReturnType<
      typeof engine.createDraft
    >['desiredState'];
    state.recordCopies = [
      {
        id: existing.id,
        expectedRevision: existing.revision,
        sourceKey: source.key,
        newId: 'rec_unique_target',
        title: 'Original copy',
      },
    ];

    const draft = engine.createDraft(state);
    const nextProperty = draft.normalized.definition.sources[0]?.properties.find(
      (property) => property.id === uniqueId.id,
    );
    expect(nextProperty).toMatchObject({ type: 'unique_id', nextNumber: 7 });
    expect(draft.normalized.sampleRecords[0]?.values[uniqueId.id]).toBe(6);
    const plan = engine.createPlan(draft.id);
    expect(plan.committable).toBe(true);
    expect(plan.diff.manifests).toHaveLength(1);
    expect(plan.diff.records).toEqual([
      expect.objectContaining({
        recordId: 'rec_unique_target',
        action: 'create',
        after: expect.objectContaining({
          values: expect.objectContaining({ [uniqueId.id]: 6 }),
        }),
      }),
    ]);
    expect(recordIndex.getById(existing.id)?.values[uniqueId.id]).toBe(5);
  });

  test('compiles templates into the canonical manifest with stable references', () => {
    const { engine } = fixture();
    const plan = engine.createPlan(engine.createDraft(desiredState()).id);
    expect(plan.committable).toBe(true);
    expect(plan.diff.manifests[0]?.after).toContain('key: default-task');
    expect(plan.diff.manifests[0]?.after).toContain('source: true');
    expect(plan.diff.manifests[0]?.after).toContain('quick_capture');
    expect(plan.targetResolutions).toContainEqual(
      expect.objectContaining({ kind: 'template', selector: 'templates.default-task' }),
    );
  });

  test('compiles agent-authored database Buttons to stable source and property IDs', () => {
    const { engine } = fixture();
    const state = desiredState();
    state.templates = [];
    state.sampleRecords = [];
    state.buttons = [
      {
        key: 'create-pair',
        name: 'Create task pair',
        placement: { kind: 'source', sourceKey: 'tasks' },
        actions: [
          {
            id: 'create_first',
            kind: 'create_record',
            sourceKey: 'tasks',
            values: { title: 'First generated task', status: 'todo' },
            body: '',
          },
          {
            id: 'create_second',
            kind: 'create_record',
            sourceKey: 'tasks',
            values: { title: 'Second generated task', status: 'todo' },
            body: '',
          },
        ],
      },
    ];
    const draft = engine.createDraft(state);
    const button = draft.normalized.definition.buttons[0];
    const source = draft.normalized.definition.sources[0];
    const title = source?.properties.find((property) => property.key === 'title');
    expect(button).toMatchObject({
      id: expect.stringMatching(/^dbbtn_/),
      placement: { kind: 'source', sourceId: source?.id },
      actions: [
        expect.objectContaining({
          sourceId: source?.id,
          values: expect.objectContaining({ [String(title?.id)]: 'First generated task' }),
        }),
        expect.objectContaining({ sourceId: source?.id }),
      ],
    });
    const plan = engine.createPlan(draft.id);
    expect(plan.committable).toBe(true);
    expect(plan.targetResolutions).toContainEqual(
      expect.objectContaining({ kind: 'action_button', selector: 'buttons.create-pair' }),
    );
  });

  test('expires drafts and converges an existing identical database without a schema conflict', async () => {
    const { engine, store, setNow } = fixture();
    const expiring = engine.createDraft(desiredState(), 60);
    setNow(new Date('2026-07-19T10:01:01.000Z'));
    expect(() => engine.getDraft(expiring.id)).toThrow(DatabasePlanError);

    setNow(new Date('2026-07-19T10:02:00.000Z'));
    const state = desiredState();
    state.templates = [];
    const draft = engine.createDraft(state);
    await store.create(draft.normalized.definition);
    const convergent = engine.createPlan(draft.id);
    expect(convergent.committable).toBe(true);
    expect(convergent.conflicts).toEqual([]);
    expect(convergent.diff.manifests).toEqual([]);
    expect(convergent.normalizedOperations[0]).toMatchObject({
      kind: 'ensure_database',
      action: 'noop',
    });
  });

  test('expires immutable plans independently and returns a stable stale-plan error', () => {
    const { engine, setNow } = fixture();
    const draft = engine.createDraft(desiredState(), 600);
    const plan = engine.createPlan(draft.id, 60);
    expect(engine.getPlan(plan.id).hash).toBe(plan.hash);
    setNow(new Date('2026-07-19T10:01:01.000Z'));
    try {
      engine.getPlan(plan.id);
      throw new Error('expected plan expiry');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'plan_expired',
        details: { id: plan.id, expiredAt: '2026-07-19T10:01:00.000Z' },
      });
    }
  });

  test('restores an exact persisted plan and draft into a fresh engine', () => {
    const { engine, store, recordIndex, projectDir, contentDir } = fixture();
    const draft = engine.createDraft(desiredState());
    const plan = engine.createPlan(draft.id);
    const restarted = createDatabasePlanEngine({
      databaseStore: store,
      databaseRecordIndex: recordIndex,
      projectDir,
      contentDir,
      now: () => new Date('2026-07-19T10:00:00.000Z'),
    });
    restarted.restoreDraft(draft);
    restarted.restorePlan(plan);
    expect(restarted.getDraft(draft.id)).toEqual(draft);
    expect(restarted.getPlan(plan.id)).toEqual(plan);
  });

  test('returns stable recovery issues for malformed desired state', () => {
    const { engine } = fixture();
    try {
      engine.createDraft({ database: { key: 'broken' }, sources: [] });
      throw new Error('expected invalid desired state');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid_desired_state',
        details: { issues: expect.any(Array) },
      });
    }
  });

  test('refuses ambiguous natural option names while stable keys remain deterministic', () => {
    const { engine } = fixture();
    const state = desiredState();
    state.templates = [];
    const options = state.sources[0]?.properties[1]?.options;
    if (!options) throw new Error('expected select options');
    options[0].name = 'Shared label';
    options[1].name = 'Shared label';
    if (!state.sampleRecords[0]) throw new Error('expected sample record');
    state.sampleRecords[0].values.status = 'Shared label';
    expect(() => engine.createDraft(state)).toThrow(
      expect.objectContaining({
        code: 'invalid_desired_state',
        details: { reason: expect.stringContaining('ambiguous option name') },
      }),
    );

    options[0].name = 'Todo label';
    options[1].name = 'todo';
    state.sampleRecords[0].values.status = 'todo';
    const stable = engine.createDraft(state);
    const statusProperty = stable.normalized.definition.sources[0]?.properties[1];
    const todoId =
      statusProperty?.type === 'select'
        ? statusProperty.options.find((option) => option.key === 'todo')?.id
        : undefined;
    expect(Object.values(stable.normalized.sampleRecords[0]?.values ?? {})).toContain(todoId);
  });

  test('refuses a unique-key record selector that resolves to multiple stable IDs', async () => {
    const { contentDir, engine, store, recordIndex } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    const draft = engine.createDraft(initial);
    await store.create(draft.normalized.definition);
    const source = draft.normalized.definition.sources[0];
    if (!source) throw new Error('expected source');
    mkdirSync(join(contentDir, source.folder), { recursive: true });
    for (const id of ['rec_duplicate_a', 'rec_duplicate_b']) {
      writeFileSync(
        join(contentDir, source.folder, `${id}.md`),
        `---\n_sn:\n  database_id: ${draft.normalized.definition.id}\n  source_id: ${source.id}\n  record_id: ${id}\ntitle: Duplicate\nstatus: todo\n---\n`,
      );
    }
    await recordIndex.rebuild();

    const repeated = desiredState();
    repeated.templates = [];
    repeated.sampleRecords = [
      { sourceKey: 'tasks', values: { title: 'Duplicate', status: 'done' }, body: '' },
    ];
    expect(() => engine.createDraft(repeated)).toThrow(
      expect.objectContaining({
        code: 'invalid_desired_state',
        details: { reason: expect.stringContaining('resolves ambiguously') },
      }),
    );
  });

  test('validates fine-grained mutation targets and property-specific operation types', async () => {
    const { contentDir, engine, store, recordIndex } = fixture();
    const initial = desiredState();
    initial.templates = [];
    initial.sampleRecords = [];
    initial.sources[0]?.properties.push({
      key: 'tags',
      name: 'Tags',
      type: 'multi_select',
      options: [
        { key: 'red', name: 'Red' },
        { key: 'blue', name: 'Blue' },
      ],
    } as never);
    const initialDraft = engine.createDraft(initial);
    await store.create(initialDraft.normalized.definition);
    const source = initialDraft.normalized.definition.sources[0];
    if (!source) throw new Error('expected source');
    mkdirSync(join(contentDir, source.folder), { recursive: true });
    writeFileSync(
      join(contentDir, source.folder, 'mutation-target.md'),
      `---\n_sn:\n  database_id: ${initialDraft.normalized.definition.id}\n  source_id: ${source.id}\n  record_id: rec_mutation_target\ntitle: Mutation target\nstatus: todo\ntags: [red]\n---\nBody\n`,
    );
    await recordIndex.rebuild();
    const record = recordIndex.getById('rec_mutation_target');
    if (!record?.revision) throw new Error('expected mutation target');
    const base = structuredClone(initialDraft.desiredState);
    const invalid = [
      { op: 'set', propertyKey: 'status', value: 'missing-option' },
      { op: 'unset', propertyKey: 'title' },
      { op: 'add', propertyKey: 'status', value: 'todo' },
      { op: 'remove', propertyKey: 'status', value: 'todo' },
      { op: 'increment', propertyKey: 'title', by: 1 },
      { op: 'append', propertyKey: 'status', value: 'x' },
      { op: 'link', propertyKey: 'status', recordId: record.id },
      { op: 'unlink', propertyKey: 'status', recordId: record.id },
    ] as const;
    for (const operation of invalid) {
      const state = structuredClone(base);
      state.recordMutations = [
        {
          id: record.id,
          expectedRevision: record.revision,
          sourceKey: 'tasks',
          operations: [operation],
        },
      ];
      expect(() => engine.createDraft(state)).toThrow(
        expect.objectContaining({ code: 'invalid_desired_state' }),
      );
    }
    for (const operation of [
      { op: 'set', propertyKey: 'status' },
      { op: 'add', propertyKey: 'status' },
      { op: 'remove', propertyKey: 'status' },
    ]) {
      const state = structuredClone(base) as Record<string, unknown>;
      state.recordMutations = [
        {
          id: record.id,
          expectedRevision: record.revision,
          sourceKey: 'tasks',
          operations: [operation],
        },
      ];
      expect(() => engine.createDraft(state as never)).toThrow(
        expect.objectContaining({ code: 'invalid_desired_state' }),
      );
    }

    const archivedOption = structuredClone(base) as Record<string, unknown>;
    const archivedSources = archivedOption.sources as Array<{
      properties: Array<{ key: string; options?: Array<{ key: string; archived?: boolean }> }>;
    }>;
    const status = archivedSources[0]?.properties.find((property) => property.key === 'status');
    const done = status?.options?.find((option) => option.key === 'done');
    if (!done) throw new Error('expected done option');
    done.archived = true;
    archivedOption.recordMutations = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        operations: [{ op: 'set', propertyKey: 'status', value: 'done' }],
      },
    ];
    expect(() => engine.createDraft(archivedOption as never)).toThrow(
      expect.objectContaining({
        code: 'invalid_desired_state',
        details: { reason: expect.stringContaining('archived') },
      }),
    );

    const uniqueTarget = structuredClone(base);
    uniqueTarget.recordMutations = [
      {
        sourceKey: 'tasks',
        uniqueValue: 'Mutation target',
        operations: [{ op: 'set', propertyKey: 'status', value: 'done' }],
      },
    ];
    const compiled = engine.createDraft(uniqueTarget);
    expect(compiled.normalized.recordMutations[0]).toMatchObject({
      recordId: record.id,
      sourceId: source.id,
      operations: [{ kind: 'set' }],
    });
    expect(compiled.normalized.sampleRecords[0]).toMatchObject({
      id: record.id,
      expectedRevision: record.revision,
    });

    const tags = source.properties.find((property) => property.key === 'tags');
    if (!tags || tags.type !== 'multi_select') throw new Error('expected multi-select tags');
    const blue = tags.options.find((option) => option.key === 'blue');
    if (!blue) throw new Error('expected blue option');
    const setMutation = structuredClone(base);
    setMutation.recordMutations = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        operations: [
          { op: 'add', propertyKey: 'tags', value: 'blue' },
          { op: 'add', propertyKey: 'tags', value: 'blue' },
          { op: 'remove', propertyKey: 'tags', value: 'red' },
        ],
      },
    ];
    const setDraft = engine.createDraft(setMutation);
    expect(setDraft.normalized.sampleRecords[0]?.values[tags.id]).toEqual([blue.id]);

    const statusProperty = source.properties.find((property) => property.key === 'status');
    const titleProperty = source.properties.find((property) => property.key === 'title');
    if (!statusProperty || !titleProperty) throw new Error('expected collaboration properties');
    writeFileSync(
      join(contentDir, source.folder, 'mutation-target.md'),
      `---\n_sn:\n  database_id: ${initialDraft.normalized.definition.id}\n  source_id: ${source.id}\n  record_id: rec_mutation_target\ntitle: Concurrent title\nstatus: todo\ntags: [red]\n---\nBody\n`,
    );
    await recordIndex.rebuild();
    const concurrent = recordIndex.getById(record.id);
    if (!concurrent?.revision) throw new Error('expected concurrent record revision');

    const disjoint = structuredClone(base);
    disjoint.recordMutations = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        preconditions: [
          {
            propertyKey: 'status',
            present: true,
            value: record.values[statusProperty.id],
          },
        ],
        operations: [{ op: 'set', propertyKey: 'status', value: 'done' }],
      },
    ];
    const disjointDraft = engine.createDraft(disjoint);
    expect(disjointDraft.normalized.sampleRecords[0]?.expectedRevision).toBe(concurrent.revision);
    expect(engine.createPlan(disjointDraft.id).committable).toBe(true);

    const sameProperty = structuredClone(base);
    sameProperty.recordMutations = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        preconditions: [
          {
            propertyKey: 'title',
            present: true,
            value: record.values[titleProperty.id],
          },
        ],
        operations: [{ op: 'set', propertyKey: 'title', value: 'Our title' }],
      },
    ];
    const samePropertyPlan = engine.createPlan(engine.createDraft(sameProperty).id);
    expect(samePropertyPlan.committable).toBe(false);
    expect(samePropertyPlan.conflicts).toContainEqual(
      expect.objectContaining({ code: 'record_revision_changed', targetId: record.id }),
    );

    const sameResult = structuredClone(base);
    sameResult.recordMutations = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        preconditions: [
          {
            propertyKey: 'title',
            present: true,
            value: record.values[titleProperty.id],
          },
        ],
        operations: [{ op: 'set', propertyKey: 'title', value: 'Concurrent title' }],
      },
    ];
    const sameResultPlan = engine.createPlan(engine.createDraft(sameResult).id);
    expect(sameResultPlan.requiresCommit).toBe(false);
    expect(sameResultPlan.conflicts).toEqual([]);
  });
});
