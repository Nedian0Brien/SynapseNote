import {
  type DatabaseFilter,
  type DatabaseQuery,
  DatabaseQueryError,
  type DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseQueryAccessDecision } from './database-data-plane.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';

export function databaseFilterPropertyIds(filter: DatabaseFilter | undefined): string[] {
  if (!filter) return [];
  if ('and' in filter) return filter.and.flatMap(databaseFilterPropertyIds);
  if ('or' in filter) return filter.or.flatMap(databaseFilterPropertyIds);
  if ('not' in filter) return databaseFilterPropertyIds(filter.not);
  return [filter.propertyId];
}

export function collectDatabaseQueryPropertyIds(input: {
  query: DatabaseQuery;
  colorPropertyIds: readonly string[];
  visualPropertyIds: readonly string[];
}): { requested: readonly string[]; dependencies: readonly string[] } {
  const aggregatePropertyIds = [
    ...(input.query.aggregate?.groupBy.map((group) => group.propertyId) ?? []),
    ...(input.query.aggregate?.calculations.flatMap((calculation) =>
      calculation.propertyId ? [calculation.propertyId] : [],
    ) ?? []),
  ];
  const dependencies = [
    ...databaseFilterPropertyIds(input.query.where),
    ...input.query.sort.map((sort) => sort.propertyId),
    ...aggregatePropertyIds,
    ...input.colorPropertyIds,
    ...input.visualPropertyIds,
  ];
  return {
    requested: [...dependencies, ...(input.query.select ?? [])],
    dependencies,
  };
}

export function scopeDatabaseQueryProjection(input: {
  source: DatabaseSource;
  query: DatabaseQuery;
  requestedPropertyIds: readonly string[];
  dependencyPropertyIds: readonly string[];
  access: DatabaseQueryAccessDecision;
}): {
  allPropertyIds: ReadonlySet<string>;
  allowedPropertyIds: ReadonlySet<string>;
  selectedPropertyIds: readonly string[];
  scopedQuery: DatabaseQuery;
} {
  const allPropertyIds = new Set(input.source.properties.map((property) => property.id));
  const allowedPropertyIds =
    input.access.allowedPropertyIds === null
      ? allPropertyIds
      : new Set(
          input.access.allowedPropertyIds.filter((propertyId) => allPropertyIds.has(propertyId)),
        );
  const unknownPropertyId = input.requestedPropertyIds.find(
    (propertyId) => !allPropertyIds.has(propertyId),
  );
  if (unknownPropertyId && input.access.allowedPropertyIds !== null) {
    throw new DatabaseDataPlaneError(
      'permission_denied',
      'The query references a property outside the effective read scope',
      {
        policyId: input.access.policyId,
        policyRevision: input.access.policyRevision,
        deniedPropertyIds: [unknownPropertyId],
        allowedPropertyIds: [...allowedPropertyIds].sort(),
      },
    );
  }
  if (unknownPropertyId) {
    throw new DatabaseQueryError(
      'unknown_property',
      `Property "${unknownPropertyId}" is not defined by source "${input.source.id}"`,
      {
        propertyId: unknownPropertyId,
        candidates: input.source.properties
          .filter((property) => allowedPropertyIds.has(property.id))
          .map((property) => ({ id: property.id, key: property.key, name: property.name })),
      },
    );
  }
  if (input.query.select && new Set(input.query.select).size !== input.query.select.length) {
    throw new DatabaseQueryError(
      'duplicate_property',
      'Query select contains the same property more than once',
      { propertyIds: input.query.select },
    );
  }
  const deniedDependencies = [...new Set(input.dependencyPropertyIds)].filter(
    (propertyId) => !allowedPropertyIds.has(propertyId),
  );
  if (deniedDependencies.length > 0) {
    throw new DatabaseDataPlaneError(
      'permission_denied',
      'The query filters, sorts, groups, or calculates a property outside the effective read scope',
      {
        policyId: input.access.policyId,
        policyRevision: input.access.policyRevision,
        deniedPropertyIds: deniedDependencies,
        allowedPropertyIds: [...allowedPropertyIds].sort(),
      },
    );
  }
  const selectedPropertyIds = (input.query.select ?? [...allPropertyIds]).filter((propertyId) =>
    allowedPropertyIds.has(propertyId),
  );
  return {
    allPropertyIds,
    allowedPropertyIds,
    selectedPropertyIds,
    scopedQuery: { ...input.query, select: selectedPropertyIds },
  };
}
