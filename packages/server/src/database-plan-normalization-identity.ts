import type { DatabaseDefinition, DatabasePerson } from '@nedian0brien/synapsenote-core';
import type { DatabaseTargetResolution } from './database-plan-artifacts.ts';
import { compactDatabasePlanUuid as compactUuid } from './database-plan-convergence-policy.ts';
import type { DatabaseDesiredStateDraft } from './database-plan-draft-contracts.ts';
import type { DatabaseStore } from './database-store.ts';

export interface DatabasePlanNormalizationIdentity {
  currentDefinition: DatabaseDefinition | null;
  targetResolutions: DatabaseTargetResolution[];
  databaseId: string;
  normalizedPeople: DatabasePerson[];
  currentSourceByDesiredKey: Map<string, DatabaseDefinition['sources'][number] | null>;
  sourceIdByKey: Map<string, string>;
  propertyIdsBySource: Map<string, Map<string, string>>;
  wantsMarkdownTableStorage: boolean;
}

export function resolveDatabasePlanNormalizationIdentity(input: {
  desiredState: DatabaseDesiredStateDraft;
  snapshot: ReturnType<DatabaseStore['snapshot']>;
  generateUuid: () => string;
}): DatabasePlanNormalizationIdentity {
  const { desiredState } = input;
  const snapshot = input.snapshot;
  const existingById = desiredState.database.id
    ? (snapshot.databases.find((database) => database.id === desiredState.database.id) ?? null)
    : null;
  const existingByKey =
    snapshot.databases.find((database) => database.key === desiredState.database.key) ?? null;
  const currentDefinition = existingById ?? (desiredState.database.id ? null : existingByKey);
  const targetResolutions: DatabaseTargetResolution[] = [];
  const databaseId =
    desiredState.database.id ?? existingByKey?.id ?? `db_${compactUuid(input.generateUuid)}`;
  targetResolutions.push({
    kind: 'database',
    selector: desiredState.database.id ? 'database.id' : 'database.key',
    targetId: databaseId,
    via: desiredState.database.id ? 'explicit_id' : existingByKey ? 'stable_key' : 'generated',
  });
  const desiredPeople = desiredState.database.people ?? currentDefinition?.people ?? [];
  const normalizedPeople = desiredPeople.map((person) => {
    const currentPerson = currentDefinition?.people.find(
      (candidate) =>
        candidate.key === person.key ||
        (typeof person.id === 'string' && candidate.id === person.id),
    );
    const personId = person.id ?? currentPerson?.id ?? `person_${compactUuid(input.generateUuid)}`;
    targetResolutions.push({
      kind: 'person',
      selector: `database.people.${person.key}`,
      targetId: personId,
      via: person.id ? 'explicit_id' : currentPerson ? 'stable_key' : 'generated',
    });
    return {
      id: personId,
      key: person.key,
      name: person.name,
      kind: person.kind,
      ...(person.subjectId === undefined ? {} : { subjectId: person.subjectId }),
      ...(person.active === undefined ? {} : { active: person.active }),
    };
  });
  const currentSourceByDesiredKey = new Map(
    desiredState.sources.map((source) => [
      source.key,
      currentDefinition?.sources.find((candidate) => candidate.key === source.key) ?? null,
    ]),
  );
  const sourceIdByKey = new Map<string, string>();
  for (const source of desiredState.sources) {
    const currentSource = currentSourceByDesiredKey.get(source.key);
    const sourceId = source.id ?? currentSource?.id ?? `ds_${compactUuid(input.generateUuid)}`;
    sourceIdByKey.set(source.key, sourceId);
    targetResolutions.push({
      kind: 'source',
      selector: `sources.${source.key}`,
      targetId: sourceId,
      via: source.id ? 'explicit_id' : currentSource ? 'stable_key' : 'generated',
    });
  }
  const propertyIdsBySource = new Map<string, Map<string, string>>();
  for (const source of desiredState.sources) {
    const resolvedSourceId = sourceIdByKey.get(source.key);
    const currentSource = currentSourceByDesiredKey.get(source.key);
    const reusableSource = currentSource?.id === resolvedSourceId ? currentSource : null;
    const propertyIds = new Map<string, string>();
    for (const property of source.properties) {
      const currentProperty = reusableSource?.properties.find(
        (candidate) => candidate.key === property.key,
      );
      const propertyId =
        property.id ?? currentProperty?.id ?? `prop_${compactUuid(input.generateUuid)}`;
      propertyIds.set(property.key, propertyId);
      targetResolutions.push({
        kind: 'property',
        selector: `sources.${source.key}.properties.${property.key}`,
        targetId: propertyId,
        via: property.id ? 'explicit_id' : currentProperty ? 'stable_key' : 'generated',
      });
    }
    propertyIdsBySource.set(source.key, propertyIds);
  }
  const wantsMarkdownTableStorage =
    desiredState.sources.some(
      (source) =>
        source.storage === 'markdown_table' ||
        (source.storage && typeof source.storage === 'object'),
    ) || currentDefinition?.version === 2;
  return {
    currentDefinition,
    targetResolutions,
    databaseId,
    normalizedPeople: normalizedPeople as DatabasePerson[],
    currentSourceByDesiredKey,
    sourceIdByKey,
    propertyIdsBySource,
    wantsMarkdownTableStorage,
  };
}
