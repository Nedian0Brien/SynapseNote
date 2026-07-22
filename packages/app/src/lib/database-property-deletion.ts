import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { collectFormulaPropertyDependencies } from '@nedian0brien/synapsenote-core';

export type DatabasePropertyDeletionDependency = {
  id: string;
  name: string;
  kind: 'property' | 'view';
  reason: string;
};

export type DatabasePropertyDeletionPreview = {
  property: DatabaseProperty;
  records: readonly ProjectedDatabaseRecord[];
  recordCount: number;
  valueCount: number;
  dependencies: readonly DatabasePropertyDeletionDependency[];
};

function hasStoredValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function viewReferencesProperty(view: unknown, propertyId: string): boolean {
  return JSON.stringify(view).includes(`"${propertyId}"`);
}

function propertyReferencesTarget(property: DatabaseProperty, targetId: string): string | null {
  if (property.type === 'formula') {
    return collectFormulaPropertyDependencies(property.ast).includes(targetId)
      ? 'Formula reads this property'
      : null;
  }
  if (property.type === 'rollup') {
    return property.relationPropertyId === targetId || property.targetPropertyId === targetId
      ? 'Rollup reads this property'
      : null;
  }
  if (property.type === 'relation' && property.pairedPropertyId === targetId) {
    return 'Paired relation uses this property';
  }
  return null;
}

export function createDatabasePropertyDeletionPreview(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: DatabaseProperty;
  records: readonly ProjectedDatabaseRecord[];
  recordsComplete: boolean;
}): DatabasePropertyDeletionPreview {
  if (input.property.type === 'title') {
    throw new Error('The Title property cannot be deleted');
  }
  if (!input.recordsComplete) {
    throw new Error('Deleting a property requires a complete source snapshot');
  }
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (!currentSource || !currentProperty) {
    throw new Error('The property is outside the selected source');
  }

  const dependencies: DatabasePropertyDeletionDependency[] = [];
  for (const source of input.database.sources) {
    for (const property of source.properties) {
      const reason = propertyReferencesTarget(property, currentProperty.id);
      if (reason) {
        dependencies.push({
          id: property.id,
          name: `${source.name}: ${property.name}`,
          kind: 'property',
          reason,
        });
      }
    }
  }
  for (const view of input.database.views ?? []) {
    if (view.sourceId !== currentSource.id || !viewReferencesProperty(view, currentProperty.id)) {
      continue;
    }
    dependencies.push({
      id: view.id,
      name: view.name,
      kind: 'view',
      reason: 'View configuration references this property',
    });
  }

  return {
    property: currentProperty,
    records: input.records,
    recordCount: input.records.length,
    valueCount: input.records.filter((record) => hasStoredValue(record.values[currentProperty.id]))
      .length,
    dependencies,
  };
}
