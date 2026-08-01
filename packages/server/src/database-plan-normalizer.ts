import type { DatabaseDraftArtifact } from './database-plan-artifacts.ts';
import type { DatabaseDesiredStateDraft } from './database-plan-draft-contracts.ts';
import { composeDatabasePlanSchema } from './database-plan-normalization-composition.ts';
import { resolveDatabasePlanNormalizationIdentity } from './database-plan-normalization-identity.ts';
import { normalizeDatabasePlanRecords } from './database-plan-normalization-records.ts';
import { normalizeDatabasePlanSources } from './database-plan-normalization-sources.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';

/** Coordinates normalization policy stages without owning their algorithms. */
export function normalizeDatabasePlanDesiredState(input: {
  desiredState: DatabaseDesiredStateDraft;
  databaseStore: DatabaseStore;
  databaseRecordIndex?: DatabaseRecordIndex;
  generateUuid: () => string;
  now: () => Date;
}): DatabaseDraftArtifact['normalized'] {
  const identity = resolveDatabasePlanNormalizationIdentity({
    desiredState: input.desiredState,
    snapshot: input.databaseStore.snapshot(),
    generateUuid: input.generateUuid,
  });
  const normalizedSources = normalizeDatabasePlanSources({
    ...identity,
    desiredState: input.desiredState,
    generateUuid: input.generateUuid,
  });
  const schema = composeDatabasePlanSchema({
    ...identity,
    desiredState: input.desiredState,
    normalizedSources,
    generateUuid: input.generateUuid,
  });
  return {
    definition: schema.definition,
    uniquePropertyId: schema.uniquePropertyId,
    ...normalizeDatabasePlanRecords({
      desiredState: input.desiredState,
      definition: schema.definition,
      uniquePropertyId: schema.uniquePropertyId,
      currentDefinition: identity.currentDefinition,
      targetResolutions: identity.targetResolutions,
      databaseId: identity.databaseId,
      databaseRecordIndex: input.databaseRecordIndex,
      generateUuid: input.generateUuid,
      now: input.now,
    }),
  };
}
