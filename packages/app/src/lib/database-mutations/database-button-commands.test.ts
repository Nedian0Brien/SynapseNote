import { describe, expect, it } from 'bun:test';
import type { DatabaseDefinition, DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { DatabaseDesiredStateDraftSchema } from '@nedian0brien/synapsenote-server';

import { createDatabaseButtonPropertyChangeDesiredState } from './database-property-advanced-commands';
import {
  createDatabasePropertyDefinitionForAdd,
  nextDatabaseButtonActionId,
} from './database-property-catalog';
import { createDatabaseAddPropertyDesiredState } from './database-property-commands';

function definitionWith(extraProperties: readonly unknown[] = []): DatabaseDefinition {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_button_fixture',
    key: 'button_fixture',
    name: 'Button fixture',
    contract: {
      purpose: 'Exercise the Button seed and editor commands',
      canonicality: 'canonical',
      vocabulary: ['button'],
      freshness: { expectation: 'realtime' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_tasks',
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        folder: 'tasks',
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_done', key: 'done', name: 'Done', type: 'checkbox' },
          ...extraProperties,
        ],
      },
    ],
  });
}

function sourceOf(definition: DatabaseDefinition) {
  const source = definition.sources[0];
  if (!source) throw new Error('fixture source missing');
  return source;
}

describe('createDatabasePropertyDefinitionForAdd for button', () => {
  it('seeds a create-record step that fills the required Title', () => {
    const definition = definitionWith();
    const source = sourceOf(definition);
    const property = createDatabasePropertyDefinitionForAdd({
      name: 'Add task',
      type: 'button',
      existingKeys: source.properties.map((candidate) => candidate.key),
      database: definition,
      source,
    });
    expect(property.label).toBe('Add task');
    expect(property.actions).toEqual([
      {
        id: 'step_1',
        kind: 'create_record',
        sourceId: 'ds_tasks',
        values: { prop_title: 'New record' },
        body: '',
      },
    ]);
    const draft = createDatabaseAddPropertyDesiredState({ database: definition, source, property });
    const parsed = DatabaseDesiredStateDraftSchema.safeParse(draft);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  /**
   * The manifest rejects a create step that omits a required property, so the
   * seed has to refuse first — a Button that cannot be committed is worse than
   * an error naming the property that blocked it.
   */
  it('refuses to seed when a required property has no default to fall back on', () => {
    const definition = definitionWith([
      { id: 'prop_owner', key: 'owner', name: 'Owner', type: 'text', required: true },
    ]);
    expect(() =>
      createDatabasePropertyDefinitionForAdd({
        name: 'Add task',
        type: 'button',
        existingKeys: [],
        database: definition,
        source: sourceOf(definition),
      }),
    ).toThrow(/"Owner" has a default value/);
  });

  it('seeds alongside a required property that carries a default', () => {
    const definition = definitionWith([
      {
        id: 'prop_owner',
        key: 'owner',
        name: 'Owner',
        type: 'text',
        required: true,
        semantics: {
          defaultValue: 'unassigned',
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      },
    ]);
    const property = createDatabasePropertyDefinitionForAdd({
      name: 'Add task',
      type: 'button',
      existingKeys: [],
      database: definition,
      source: sourceOf(definition),
    });
    expect(property.actions).toHaveLength(1);
  });
});

describe('nextDatabaseButtonActionId', () => {
  it('fills the lowest free slot rather than counting entries', () => {
    expect(nextDatabaseButtonActionId([])).toBe('step_1');
    expect(nextDatabaseButtonActionId(['step_1', 'step_3'])).toBe('step_2');
    expect(nextDatabaseButtonActionId(['step_1', 'step_2'])).toBe('step_3');
  });
});

describe('createDatabaseButtonPropertyChangeDesiredState', () => {
  function definitionWithButton(): DatabaseDefinition {
    return definitionWith([
      {
        id: 'prop_run',
        key: 'run',
        name: 'Run',
        type: 'button',
        label: 'Run',
        actions: [{ id: 'step_1', kind: 'archive_record', action: 'archive' }],
      },
    ]);
  }

  function buttonOf(definition: DatabaseDefinition) {
    const property = sourceOf(definition).properties.find(
      (candidate): candidate is Extract<DatabaseProperty, { type: 'button' }> =>
        candidate.type === 'button',
    );
    if (!property) throw new Error('fixture button missing');
    return property;
  }

  it('replaces the whole action list so operands of the old kind cannot survive', () => {
    const definition = definitionWithButton();
    const draft = createDatabaseButtonPropertyChangeDesiredState({
      database: definition,
      source: sourceOf(definition),
      property: {
        ...buttonOf(definition),
        label: 'Mark done',
        actions: [
          {
            id: 'step_1',
            kind: 'update_record',
            operations: [{ op: 'set', propertyId: 'prop_done', value: true }],
          },
        ],
      },
    });
    const parsed = DatabaseDesiredStateDraftSchema.safeParse(draft);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
    const saved = draft.sources[0]?.properties.find(
      (property) => (property as { key?: string }).key === 'run',
    ) as { label: string; actions: readonly { kind: string }[] } | undefined;
    expect(saved?.label).toBe('Mark done');
    expect(saved?.actions).toEqual([
      {
        id: 'step_1',
        kind: 'update_record',
        operations: [{ op: 'set', propertyId: 'prop_done', value: true }],
      },
    ]);
  });

  it('refuses a Button that is not in the selected source', () => {
    const definition = definitionWithButton();
    expect(() =>
      createDatabaseButtonPropertyChangeDesiredState({
        database: definition,
        source: { ...sourceOf(definition), id: 'ds_other' },
        property: buttonOf(definition),
      }),
    ).toThrow(/outside the selected source/);
  });

  it('rejects an operation the manifest forbids, at the command rather than on commit', () => {
    const definition = definitionWithButton();
    expect(() =>
      createDatabaseButtonPropertyChangeDesiredState({
        database: definition,
        source: sourceOf(definition),
        property: {
          ...buttonOf(definition),
          actions: [
            {
              id: 'step_1',
              kind: 'update_record',
              // A Button cannot mutate itself: `button` is read-only.
              operations: [{ op: 'set', propertyId: 'prop_run', value: 'x' }],
            },
          ],
        },
      }),
    ).toThrow();
  });
});
