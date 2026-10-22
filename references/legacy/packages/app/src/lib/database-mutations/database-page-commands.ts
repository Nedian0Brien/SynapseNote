import type {
  DatabaseDefinition,
  DatabasePageLayout,
  DatabaseRecordPageLayoutOverride,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import {
  DatabaseDefinitionSchema,
  databaseRecordPageLayoutOverrideIssues,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { databaseDraftBase } from './database-desired-state-base';

/**
 * Rename the visible database page without changing its stable database/source
 * identities. When the source and database currently share a title, keep both
 * names synchronized; otherwise only the selected source page title changes.
 */
export function createDatabasePageTitleDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  name: string;
}): DatabaseDesiredStateDraftInput {
  const name = input.name.trim();
  if (!name) throw new Error('A database page title is required');
  const source = input.database.sources.find((candidate) => candidate.id === input.source.id);
  if (!source) throw new Error('The selected source is outside the database');
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    ...(input.database.name === source.name ? { name } : {}),
    sources: input.database.sources.map((candidate) =>
      candidate.id === source.id ? { ...candidate, name } : candidate,
    ),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

/** Persist the optional Notion-style page icon/cover without changing stable IDs. */
export function createDatabasePageAppearanceDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  icon?: string | null;
  cover?: string | null;
}): DatabaseDesiredStateDraftInput {
  const source = input.database.sources.find((candidate) => candidate.id === input.source.id);
  if (!source) throw new Error('The selected source is outside the database');
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    ...(input.icon === undefined
      ? {}
      : input.icon === null || input.icon.trim() === ''
        ? { icon: undefined }
        : { icon: input.icon.trim() }),
    ...(input.cover === undefined
      ? {}
      : input.cover === null || input.cover.trim() === ''
        ? { cover: undefined }
        : { cover: input.cover.trim() }),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

export function createDatabasePageLayoutChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  pageLayout: DatabasePageLayout;
}): DatabaseDesiredStateDraftInput {
  const source = input.database.sources.find((candidate) => candidate.id === input.source.id);
  if (!source) throw new Error('The selected source is outside the database');
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((candidate) =>
      candidate.id === source.id
        ? { ...candidate, pageLayout: structuredClone(input.pageLayout) }
        : candidate,
    ),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

export function createDatabaseRecordPageLayoutOverrideDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  body: string;
  pageLayoutOverride: DatabaseRecordPageLayoutOverride | null;
}): DatabaseDesiredStateDraftInput {
  if (!input.record.revision) throw new Error('The record has no stable revision');
  if (input.pageLayoutOverride) {
    const issues = databaseRecordPageLayoutOverrideIssues(input.source, input.pageLayoutOverride);
    if (issues.length > 0) throw new Error(issues.join('; '));
  }
  const storedTypes = new Set([
    'title',
    'text',
    'number',
    'select',
    'status',
    'multi_select',
    'date',
    'person',
    'files',
    'checkbox',
    'url',
    'email',
    'phone',
    'place',
    'relation',
  ]);
  const values = Object.fromEntries(
    input.source.properties.flatMap((property) => {
      const value = input.record.values[property.id];
      return value !== undefined && storedTypes.has(property.type)
        ? [[property.key, structuredClone(value)]]
        : [];
    }),
  );
  return {
    ...databaseDraftBase(input.database),
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 1 },
    sampleRecords: [
      {
        id: input.record.id,
        expectedRevision: input.record.revision,
        sourceKey: input.source.key,
        values,
        body: input.body,
        pageLayoutOverride: input.pageLayoutOverride,
      },
    ],
    recordMutations: [],
  };
}
