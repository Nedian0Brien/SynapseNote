/** Compiles cross-database relation conflicts without accessing engine state. */
import type { DatabaseDefinition } from '@nedian0brien/synapsenote-core';
import type { DatabasePlanConflict } from './database-plan-artifacts.ts';

export function compileDatabaseRelationConflicts(
  definition: DatabaseDefinition,
  snapshot: { databases: readonly DatabaseDefinition[] },
): DatabasePlanConflict[] {
  const conflicts: DatabasePlanConflict[] = [];
  for (const source of definition.sources) {
    for (const property of source.properties) {
      if (property.type !== 'relation') continue;
      const targetDatabaseId = property.targetDatabaseId;
      if (targetDatabaseId === undefined || targetDatabaseId === definition.id) continue;
      const targetDatabase = snapshot.databases.find(
        (candidate) => candidate.id === targetDatabaseId,
      );
      if (!targetDatabase) {
        conflicts.push({
          code: 'relation_target_missing',
          message: `Relation "${property.id}" targets database "${targetDatabaseId}", which is not in this workspace`,
          targetId: property.id,
          propertyId: property.id,
        });
      } else if (
        !targetDatabase.sources.some((candidate) => candidate.id === property.targetSourceId)
      ) {
        conflicts.push({
          code: 'relation_target_missing',
          message: `Relation "${property.id}" targets source "${property.targetSourceId}", which database "${targetDatabaseId}" does not define`,
          targetId: property.id,
          propertyId: property.id,
        });
      }
    }
  }
  return conflicts;
}
