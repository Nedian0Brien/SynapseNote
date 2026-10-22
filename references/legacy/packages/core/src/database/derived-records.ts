import { type DatabaseDateValue, databaseDateStart } from './date.ts';
import { type DatabaseFileValue, databaseFileDisplayName } from './files.ts';
import { evaluateFormula } from './formula-evaluator.ts';
import type { FormulaFunctionContext, FormulaPageRuntimeValue } from './formula-functions.ts';
import {
  type FormulaComputedResult,
  type FormulaPersistedRuntimeValue,
  type FormulaRuntimeProblemCode,
  formulaErrorResult,
  formulaValueResult,
} from './formula-result.ts';
import { type DatabasePlaceValue, databasePlaceSearchText } from './place.ts';
import type { DatabaseRecord, DatabaseValue } from './record.ts';
import { projectDatabaseRichText } from './rich-text.ts';
import { aggregateDatabaseRollup, RollupAggregationError } from './rollup.ts';
import type { DatabaseDefinition, DatabaseProperty, DatabaseSource } from './schema.ts';
import { formatDatabaseUniqueId } from './unique-id.ts';
import type { DatabaseVerificationValue } from './verification.ts';

export interface MaterializeDatabaseDerivedRecordsInput {
  definition: DatabaseDefinition;
  records: readonly DatabaseRecord[];
  context: FormulaFunctionContext;
  /** Stable permission snapshot identity carried into every Rollup result. */
  permissionRevision: string;
  canReadRecord?: (record: DatabaseRecord) => boolean;
  canReadProperty?: (sourceId: string, propertyId: string) => boolean;
  /** Internal cooperative cancellation seam for large derived projections. */
  throwIfCancelled?: () => void;
}

function runtimeValueToDatabaseValue(
  value: FormulaPersistedRuntimeValue,
): DatabaseValue | undefined {
  if (value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (!Array.isArray(value)) {
    switch (value.kind) {
      case 'date':
        return value.value;
      case 'person':
      case 'page':
        return value.id;
    }
  }
  const projected = value.map(runtimeValueToDatabaseValue);
  if (projected.some((entry) => entry === undefined || Array.isArray(entry))) return undefined;
  if (projected.every((entry) => typeof entry === 'string')) return projected as string[];
  if (projected.every((entry) => typeof entry === 'number')) return projected as number[];
  if (projected.every((entry) => typeof entry === 'boolean')) return projected as boolean[];
  return undefined;
}

/**
 * Converts a successful Formula/Rollup result into the homogeneous scalar shape
 * consumed by typed query indexes. Null, errors, nested lists, and mixed lists
 * remain available in computedResults but deliberately have no sortable value.
 */
export function formulaComputedResultToDatabaseValue(
  result: FormulaComputedResult,
): DatabaseValue | undefined {
  return result.kind === 'value' ? runtimeValueToDatabaseValue(result.value) : undefined;
}

function sourceForRecord(
  definition: DatabaseDefinition,
  record: DatabaseRecord,
): DatabaseSource | undefined {
  return definition.sources.find((source) => source.id === record.sourceId);
}

function propertyOwner(
  definition: DatabaseDefinition,
  propertyId: string,
): { source: DatabaseSource; property: DatabaseProperty } | null {
  for (const source of definition.sources) {
    const property = source.properties.find((candidate) => candidate.id === propertyId);
    if (property) return { source, property };
  }
  return null;
}

function rollupProblemCode(error: RollupAggregationError): FormulaRuntimeProblemCode {
  switch (error.code) {
    case 'resource_limit':
      return 'resource_limit';
    case 'permission_not_applied':
      return 'permission_denied';
    case 'invalid_aggregation':
    case 'incompatible_function':
      return 'result_type_mismatch';
    case 'duplicate_target':
      return 'invalid_operand';
  }
}

/**
 * Builds a permission-scoped, rebuildable derived projection. Canonical Markdown
 * values are never mutated or serialized; callers may discard this projection
 * whenever schema, records, clock context, or permission revision changes.
 */
export function materializeDatabaseDerivedRecords(
  input: MaterializeDatabaseDerivedRecordsInput,
): DatabaseRecord[] {
  const canReadRecord = input.canReadRecord ?? (() => true);
  const canReadProperty = input.canReadProperty ?? (() => true);
  const recordsById = new Map(input.records.map((record) => [record.id, record]));
  const cache = new Map<string, FormulaComputedResult>();
  const evaluating = new Set<string>();

  const titleFor = (record: DatabaseRecord): string | undefined => {
    const source = sourceForRecord(input.definition, record);
    const title = source?.properties.find((property) => property.type === 'title');
    const value = title ? record.values[title.id] : undefined;
    return typeof value === 'string' && title && canReadProperty(source?.id ?? '', title.id)
      ? value
      : undefined;
  };

  const pageFor = (record: DatabaseRecord): FormulaPageRuntimeValue => ({
    kind: 'page',
    id: record.id,
    sourceId: record.sourceId,
    ...(titleFor(record) ? { title: titleFor(record) } : {}),
  });

  const rawResult = (record: DatabaseRecord, property: DatabaseProperty): FormulaComputedResult => {
    const value = record.values[property.id];
    if (value === undefined) return formulaValueResult('null', null);
    switch (property.type) {
      case 'title':
      case 'url':
      case 'email':
      case 'phone':
        return formulaValueResult('text', value as string);
      case 'text':
        return formulaValueResult('text', projectDatabaseRichText(value as string).plainText);
      case 'number':
        return formulaValueResult('number', value as number);
      case 'checkbox':
        return formulaValueResult('boolean', value as boolean);
      case 'date':
        return formulaValueResult('date', {
          kind: 'date',
          value: databaseDateStart(value as DatabaseDateValue),
        });
      case 'select':
      case 'status': {
        const option = property.options.find((candidate) => candidate.id === value);
        return option
          ? formulaValueResult('text', option.name)
          : formulaErrorResult({
              code: 'missing_projection',
              message: `Option projection is unavailable for "${property.id}"`,
              propertyId: property.id,
            });
      }
      case 'multi_select': {
        const names = (value as string[]).map(
          (optionId) => property.options.find((candidate) => candidate.id === optionId)?.name,
        );
        return names.some((name) => name === undefined)
          ? formulaErrorResult({
              code: 'missing_projection',
              message: `Option projection is unavailable for "${property.id}"`,
              propertyId: property.id,
            })
          : formulaValueResult('list', names as string[]);
      }
      case 'person': {
        const people = (value as string[]).map((personId) => {
          const person = input.definition.people.find((candidate) => candidate.id === personId);
          return {
            kind: 'person' as const,
            id: personId,
            ...(person ? { name: person.name } : {}),
          };
        });
        return property.multiple
          ? formulaValueResult('list', people)
          : people[0]
            ? formulaValueResult('person', people[0])
            : formulaValueResult('null', null);
      }
      case 'files':
        return formulaValueResult(
          'list',
          (value as DatabaseFileValue[]).map((file) => databaseFileDisplayName(file)),
        );
      case 'place':
        return formulaValueResult('text', databasePlaceSearchText(value as DatabasePlaceValue));
      case 'relation': {
        const recordIds = (Array.isArray(value) ? value : [value]) as string[];
        const pages = recordIds.flatMap((recordId) => {
          const target = recordsById.get(recordId);
          return target && target.sourceId === property.targetSourceId && canReadRecord(target)
            ? [pageFor(target)]
            : [];
        });
        return property.cardinality === 'many'
          ? formulaValueResult('list', pages)
          : pages[0]
            ? formulaValueResult('page', pages[0])
            : formulaValueResult('null', null);
      }
      case 'created_time':
      case 'last_edited_time':
        return formulaValueResult('date', {
          kind: 'date',
          value: String(value),
        });
      case 'created_by':
      case 'last_edited_by':
        return formulaValueResult('text', String(value));
      case 'verification':
        return formulaValueResult('text', (value as DatabaseVerificationValue).state);
      case 'unique_id':
        return formulaValueResult('text', formatDatabaseUniqueId(property.prefix, value as number));
      case 'button':
        return formulaValueResult('null', null);
      case 'formula':
      case 'rollup':
        return formulaErrorResult({
          code: 'internal_error',
          message: 'Computed property requested through raw value projection',
          propertyId: property.id,
        });
    }
  };

  const resolveValue = (record: DatabaseRecord, propertyId: string): FormulaComputedResult => {
    const owner = propertyOwner(input.definition, propertyId);
    if (!owner || owner.source.id !== record.sourceId) {
      return formulaErrorResult({
        code: 'missing_property',
        message: `Property "${propertyId}" is not defined for record "${record.id}"`,
        propertyId,
      });
    }
    if (!canReadRecord(record) || !canReadProperty(record.sourceId, propertyId)) {
      return formulaErrorResult({
        code: 'permission_denied',
        message: `Property "${propertyId}" is not readable in this permission scope`,
        propertyId,
      });
    }
    if (record.invalidValues?.[propertyId] !== undefined) {
      return formulaErrorResult({
        code: 'result_type_mismatch',
        message: `Property "${propertyId}" has an invalid preserved canonical value`,
        propertyId,
      });
    }
    if (owner.property.type !== 'formula' && owner.property.type !== 'rollup') {
      return rawResult(record, owner.property);
    }
    const key = `${record.id}\0${propertyId}`;
    const cached = cache.get(key);
    if (cached) return cached;
    if (evaluating.has(key)) {
      return formulaErrorResult({
        code: 'dependency_cycle',
        message: `Computed dependency cycle reached "${propertyId}"`,
        propertyId,
      });
    }
    evaluating.add(key);
    let result: FormulaComputedResult;
    if (owner.property.type === 'formula') {
      result = evaluateFormula({
        ast: owner.property.ast,
        context: input.context,
        resolveProperty: ({ propertyId: dependencyId, record: explicitRecord }) => {
          const target = explicitRecord ? recordsById.get(explicitRecord.id) : record;
          if (!target || (explicitRecord && target.sourceId !== explicitRecord.sourceId)) {
            return formulaErrorResult({
              code: 'missing_record',
              message: `Formula target record is unavailable`,
              propertyId: dependencyId,
            });
          }
          return resolveValue(target, dependencyId);
        },
      });
    } else {
      const rollup = owner.property;
      const relationOwner = propertyOwner(input.definition, rollup.relationPropertyId);
      const relation = relationOwner?.property;
      if (
        !relationOwner ||
        relation?.type !== 'relation' ||
        relationOwner.source.id !== record.sourceId
      ) {
        result = formulaErrorResult({
          code: 'missing_property',
          message: `Rollup relation "${rollup.relationPropertyId}" is unavailable`,
          propertyId: rollup.relationPropertyId,
        });
      } else if (!canReadProperty(record.sourceId, relation.id)) {
        result = formulaErrorResult({
          code: 'permission_denied',
          message: `Rollup relation "${relation.id}" is not readable in this permission scope`,
          propertyId: relation.id,
        });
      } else {
        const relationValue = record.values[relation.id];
        const recordIds = (
          relationValue === undefined
            ? []
            : Array.isArray(relationValue)
              ? relationValue
              : [relationValue]
        ) as string[];
        let unavailable = false;
        const targets = recordIds.flatMap((recordId) => {
          const target = recordsById.get(recordId);
          if (!target || target.sourceId !== relation.targetSourceId) {
            unavailable = true;
            return [];
          }
          if (!canReadRecord(target)) return [];
          return [
            {
              recordId: target.id,
              ...(canReadProperty(target.sourceId, rollup.targetPropertyId)
                ? { value: resolveValue(target, rollup.targetPropertyId) }
                : {}),
            },
          ];
        });
        try {
          result = aggregateDatabaseRollup({
            sourceId: record.sourceId,
            relationPropertyId: relation.id,
            targetSourceId: relation.targetSourceId,
            targetPropertyId: rollup.targetPropertyId,
            function: rollup.function,
            targetValueType: rollup.targetValueType,
            ...(rollup.targetItemType ? { targetItemType: rollup.targetItemType } : {}),
            permission: { applied: true, revision: input.permissionRevision },
            snapshot: {
              complete: !unavailable,
              truncatedBy: unavailable ? 'unavailable_target' : null,
            },
            targets,
          }).result;
        } catch (error) {
          result = formulaErrorResult({
            code:
              error instanceof RollupAggregationError ? rollupProblemCode(error) : 'internal_error',
            message:
              error instanceof RollupAggregationError
                ? error.message
                : 'Rollup evaluation failed unexpectedly',
            propertyId: rollup.id,
          });
        }
      }
    }
    evaluating.delete(key);
    cache.set(key, result);
    return result;
  };

  return input.records.map((record, recordIndex) => {
    if (recordIndex % 64 === 0) input.throwIfCancelled?.();
    const source = sourceForRecord(input.definition, record);
    if (!source || !canReadRecord(record)) return structuredClone(record);
    const values = structuredClone(record.values);
    const computedResults: Record<string, FormulaComputedResult> = {};
    for (const [propertyIndex, property] of source.properties.entries()) {
      if (propertyIndex % 16 === 0) input.throwIfCancelled?.();
      if (
        (property.type !== 'formula' && property.type !== 'rollup') ||
        !canReadProperty(source.id, property.id)
      ) {
        continue;
      }
      const result = resolveValue(record, property.id);
      computedResults[property.id] = result;
      const value = formulaComputedResultToDatabaseValue(result);
      if (value === undefined) delete values[property.id];
      else values[property.id] = value;
    }
    return {
      ...structuredClone(record),
      values,
      ...(Object.keys(computedResults).length > 0 ? { computedResults } : {}),
    };
  });
}
