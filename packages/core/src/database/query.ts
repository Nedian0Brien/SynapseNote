import { z } from 'zod';
import { type FrontmatterValue, FrontmatterValueSchema } from '../frontmatter/schema.ts';
import {
  DatabaseDateRangeValueSchema,
  type DatabaseDateValue,
  databaseDateEnd,
  databaseDateEndEpoch,
  databaseDateStart,
  databaseDateStartEpoch,
  isDatabaseDateOnly,
  isDatabaseDatePoint,
  serializeDatabaseDateValue,
} from './date.ts';
import {
  type DatabaseFileAvailability,
  DatabaseFileAvailabilitySchema,
  DatabaseFilesValueSchema,
  type DatabaseFileValue,
  databaseFileDisplayName,
  databaseFileIdentity,
  isSafeDatabaseAssetPath,
  isSafeDatabaseExternalFileUrl,
} from './files.ts';
import { type FormulaComputedResult, FormulaComputedResultSchema } from './formula-result.ts';
import { DatabaseMarkdownRecordRevisionSetSchema } from './markdown-table-revision.ts';
import {
  type DatabasePerson,
  DatabasePersonIdSchema,
  type ProjectedDatabasePerson,
  ProjectedDatabasePersonSchema,
  projectDatabasePerson,
} from './person.ts';
import {
  type DatabasePlaceValue,
  DatabasePlaceValueSchema,
  databasePlaceSearchText,
} from './place.ts';
import type { DatabaseRecord, DatabaseRecordIssue, DatabaseValue } from './record.ts';
import {
  type ProjectedDatabaseRelationRecord,
  ProjectedDatabaseRelationRecordSchema,
} from './relation.ts';
import {
  type DatabaseRichTextReference,
  DatabaseRichTextReferenceSchema,
  projectDatabaseRichText,
} from './rich-text.ts';
import {
  type DatabaseConditionalColorRule,
  type DatabaseFilter,
  DatabaseFilterSchema,
  type DatabaseFilterValue,
  type DatabaseProperty,
  DatabasePropertyIdSchema,
  type DatabasePropertyType,
  type DatabaseQueryOperator,
  type DatabaseSource,
} from './schema.ts';
import {
  DatabaseVerificationProjectionSchema,
  DatabaseVerificationValueSchema,
  projectDatabaseVerification,
} from './verification.ts';

export {
  DATABASE_QUERY_OPERATORS,
  type DatabaseFilter,
  DatabaseFilterSchema,
  type DatabaseFilterValue,
  type DatabaseQueryOperator,
} from './schema.ts';

export const DatabaseQuerySchema = z
  .object({
    /** Optional server-side full-text search across the source's readable values and path. */
    search: z.string().trim().max(256).optional(),
    where: DatabaseFilterSchema.optional(),
    sort: z
      .array(
        z
          .object({
            propertyId: DatabasePropertyIdSchema,
            direction: z.enum(['asc', 'desc']).default('asc'),
          })
          .strict(),
      )
      .default([]),
    select: z.array(DatabasePropertyIdSchema).optional(),
    includeArchived: z.boolean().default(false),
    aggregate: z
      .object({
        groupBy: z
          .array(
            z
              .object({
                propertyId: DatabasePropertyIdSchema,
                direction: z.enum(['asc', 'desc']).default('asc'),
                arrayMode: z.enum(['set', 'each']).default('set'),
                includeEmpty: z.boolean().default(true),
              })
              .strict(),
          )
          .max(2)
          .default([]),
        calculations: z
          .array(
            z
              .object({
                id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
                function: z.enum([
                  'count_all',
                  'count_values',
                  'count_unique',
                  'percent_empty',
                  'percent_not_empty',
                  'sum',
                  'average',
                  'median',
                  'min',
                  'max',
                  'range',
                  'earliest',
                  'latest',
                  'date_range',
                  'checked',
                  'unchecked',
                  'percent_checked',
                  'percent_unchecked',
                ]),
                propertyId: DatabasePropertyIdSchema.optional(),
              })
              .strict(),
          )
          .max(100)
          .default([]),
        groupLimit: z.number().int().min(1).max(500).default(100),
        membershipLimit: z.number().int().min(1).max(1_000).default(100),
      })
      .strict()
      .refine((value) => value.groupBy.length > 0 || value.calculations.length > 0, {
        message: 'aggregate requires at least one group or calculation',
      })
      .optional(),
    page: z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        cursor: z.string().min(1).optional(),
      })
      .strict()
      .default({ limit: 100 }),
  })
  .strict();

export type DatabaseQuery = z.infer<typeof DatabaseQuerySchema>;

export const DATABASE_QUERY_SORT_SEMANTICS = {
  version: 1,
  locale: 'und',
  normalization: 'NFKD',
  collation: 'unicode_code_point',
  case: 'insensitive_primary_uppercase_first_tertiary',
  diacritic: 'insensitive_primary_sensitive_secondary',
  naturalNumbers: 'ascii_decimal_runs',
  emptyValues: 'last_regardless_of_direction',
  arrays: 'sorted_elements_then_lexicographic',
  tieBreaker: 'record_id',
} as const;

export type DatabaseQueryErrorCode =
  | 'invalid_query'
  | 'unknown_property'
  | 'duplicate_property'
  | 'invalid_operator'
  | 'invalid_value'
  | 'invalid_calculation'
  | 'duplicate_calculation'
  | 'invalid_cursor'
  | 'wrong_source'
  | 'duplicate_record_id';

export class DatabaseQueryError extends Error {
  readonly code: DatabaseQueryErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: DatabaseQueryErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DatabaseQueryError';
    this.code = code;
    this.details = details;
  }
}

export const DatabaseValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number().finite()),
  z.array(z.boolean()),
  DatabaseFilesValueSchema,
  DatabaseDateRangeValueSchema,
  DatabasePlaceValueSchema,
  DatabaseVerificationValueSchema,
]);

export const ProjectedDatabaseRecordSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1),
    revision: z.string().nullable(),
    storageRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    semanticRevisions: DatabaseMarkdownRecordRevisionSetSchema.optional(),
    evidenceRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    values: z.record(z.string(), DatabaseValueSchema),
    textProjections: z
      .record(
        z.string(),
        z
          .object({
            plainText: z.string().max(1_000_000),
            references: z.array(DatabaseRichTextReferenceSchema).max(10_000),
          })
          .strict(),
      )
      .optional(),
    invalidValues: z.record(z.string(), FrontmatterValueSchema).optional(),
    issues: z
      .array(
        z
          .object({
            code: z.enum([
              'missing_required_value',
              'invalid_property_value',
              'unknown_select_option',
              'unknown_person',
              'duplicate_array_value',
            ]),
            propertyId: z.string().startsWith('prop_'),
            propertyKey: z.string().min(1),
            message: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
    computedResults: z.record(z.string(), FormulaComputedResultSchema).optional(),
    archivedAt: z.string().datetime({ offset: true }).optional(),
    verificationProjections: z.record(z.string(), DatabaseVerificationProjectionSchema).optional(),
  })
  .strict();

export interface ProjectedDatabaseRecord {
  id: string;
  path: string;
  revision: string | null;
  storageRevision?: string | null;
  semanticRevisions?: z.infer<typeof DatabaseMarkdownRecordRevisionSetSchema>;
  evidenceRevision?: string | null;
  values: Record<string, DatabaseValue>;
  textProjections?: Record<
    string,
    { plainText: string; references: readonly DatabaseRichTextReference[] }
  >;
  invalidValues?: Record<string, FrontmatterValue>;
  issues?: DatabaseRecordIssue[];
  computedResults?: Record<string, FormulaComputedResult>;
  archivedAt?: string;
  verificationProjections?: Record<string, z.infer<typeof DatabaseVerificationProjectionSchema>>;
}

export interface DatabaseQueryResult {
  sourceId: string;
  snapshotRevision: string;
  /** Full canonical owner-document revision for storage-aware v2 writes. */
  storageRevision?: string | null;
  /** Permission/evaluation/dependency-bound revision for Formula/Rollup snapshots. */
  derivedRevision?: string | null;
  matched: number;
  returned: number;
  isComplete: boolean;
  nextCursor: string | null;
  truncatedBy: 'page_limit' | null;
  indexFreshness: 'snapshot';
  records: ProjectedDatabaseRecord[];
  aggregation: DatabaseAggregationResult | null;
  /** Returned-page-only memberships for grouped visual layouts. */
  groupMemberships?: DatabaseGroupMemberships;
  /** Only identities referenced by projected Person values; subject IDs are omitted. */
  people?: ProjectedDatabasePerson[];
  /** Local paths referenced by the permission-filtered projection; external URLs are omitted. */
  fileStates?: Record<string, DatabaseFileAvailability>;
  /** Minimal readable cards for relation targets allowed by the target source's read scope. */
  relationRecords?: ProjectedDatabaseRelationRecord[];
  /** Display-only saved-view rules evaluated over the permission-scoped returned page. */
  conditionalColors?: DatabaseConditionalColorResult;
}

export type DatabaseGroupMembershipKey = Array<{
  propertyId: string;
  value: DatabaseValue | null;
}>;

export type DatabaseGroupMemberships = Record<string, DatabaseGroupMembershipKey[]>;

export interface DatabaseConditionalColorResultRule {
  id: string;
  key: string;
  name: string;
  color: DatabaseConditionalColorRule['color'];
  applyTo: DatabaseConditionalColorRule['applyTo'];
}

export interface DatabaseConditionalColorRecordResult {
  pageRuleId?: string;
  propertyRuleIds?: Record<string, string>;
}

export interface DatabaseConditionalColorResult {
  rules: DatabaseConditionalColorResultRule[];
  records: Record<string, DatabaseConditionalColorRecordResult>;
}

export type DatabaseCalculationFunction = NonNullable<
  DatabaseQuery['aggregate']
>['calculations'][number]['function'];

export interface DatabaseCalculationResult {
  id: string;
  function: DatabaseCalculationFunction;
  propertyId: string | null;
  value: number | string | null;
  unit: 'count' | 'number' | 'percentage' | 'date' | 'milliseconds';
}

export interface DatabaseAggregationGroup {
  /** 1 for a group and 2 for its subgroup. */
  level: 1 | 2;
  key: Array<{ propertyId: string; value: DatabaseValue | null }>;
  matched: number;
  calculations: DatabaseCalculationResult[];
}

export interface DatabaseAggregationResult {
  matched: number;
  groupBy: NonNullable<DatabaseQuery['aggregate']>['groupBy'];
  calculations: DatabaseCalculationResult[];
  totalGroups: number;
  returnedGroups: number;
  groupsComplete: boolean;
  truncatedBy: 'group_limit' | null;
  groups: DatabaseAggregationGroup[];
}

export const DatabaseCalculationResultSchema = z
  .object({
    id: z.string().min(1),
    function: DatabaseQuerySchema.shape.aggregate.unwrap().shape.calculations.unwrap().element.shape
      .function,
    propertyId: z.string().nullable(),
    value: z.union([z.number().finite(), z.string()]).nullable(),
    unit: z.enum(['count', 'number', 'percentage', 'date', 'milliseconds']),
  })
  .strict();

export const DatabaseAggregationResultSchema = z
  .object({
    matched: z.number().int().nonnegative(),
    groupBy: DatabaseQuerySchema.shape.aggregate.unwrap().shape.groupBy,
    calculations: z.array(DatabaseCalculationResultSchema),
    totalGroups: z.number().int().nonnegative(),
    returnedGroups: z.number().int().nonnegative(),
    groupsComplete: z.boolean(),
    truncatedBy: z.literal('group_limit').nullable(),
    groups: z.array(
      z
        .object({
          level: z.union([z.literal(1), z.literal(2)]),
          key: z.array(
            z
              .object({
                propertyId: z.string().min(1),
                value: DatabaseValueSchema.nullable(),
              })
              .strict(),
          ),
          matched: z.number().int().nonnegative(),
          calculations: z.array(DatabaseCalculationResultSchema),
        })
        .strict(),
    ),
  })
  .strict();

export const DatabaseGroupMembershipsSchema = z.record(
  z.string(),
  z.array(
    z.array(
      z
        .object({
          propertyId: DatabasePropertyIdSchema,
          value: DatabaseValueSchema.nullable(),
        })
        .strict(),
    ),
  ),
);

export const DatabaseConditionalColorResultSchema = z
  .object({
    rules: z.array(
      z
        .object({
          id: z.string().regex(/^ccr_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
          key: z.string().min(1),
          name: z.string().min(1),
          color: z.enum([
            'gray',
            'brown',
            'orange',
            'yellow',
            'green',
            'blue',
            'purple',
            'pink',
            'red',
          ]),
          applyTo: z.discriminatedUnion('type', [
            z.object({ type: z.literal('page') }).strict(),
            z
              .object({ type: z.literal('property'), propertyId: DatabasePropertyIdSchema })
              .strict(),
          ]),
        })
        .strict(),
    ),
    records: z.record(
      z.string(),
      z
        .object({
          pageRuleId: z.string().optional(),
          propertyRuleIds: z.record(z.string(), z.string()).optional(),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Portable query-result envelope consumed by UI and SDK clients. Server
 * transports may add revision, permission, and explain metadata at the top
 * level, so the base contract intentionally preserves unknown top-level keys.
 */
export const DatabaseQueryResultSchema = z
  .object({
    sourceId: z.string().min(1),
    snapshotRevision: z.string().min(1),
    /** Full canonical owner-document revision for storage-aware v2 writes. */
    storageRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    derivedRevision: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    matched: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    isComplete: z.boolean(),
    nextCursor: z.string().nullable(),
    truncatedBy: z.literal('page_limit').nullable(),
    indexFreshness: z.literal('snapshot'),
    records: z.array(ProjectedDatabaseRecordSchema),
    aggregation: DatabaseAggregationResultSchema.nullable(),
    groupMemberships: DatabaseGroupMembershipsSchema.optional(),
    people: z.array(ProjectedDatabasePersonSchema).optional(),
    fileStates: z.record(z.string(), DatabaseFileAvailabilitySchema).optional(),
    relationRecords: z.array(ProjectedDatabaseRelationRecordSchema).optional(),
    conditionalColors: DatabaseConditionalColorResultSchema.optional(),
  })
  .passthrough();

export interface QueryDatabaseRecordsInput {
  source: DatabaseSource;
  records: readonly DatabaseRecord[];
  query?: unknown;
  snapshotRevision: string;
  /** Optional canonical owner-document revision for storage-aware mutation clients. */
  storageRevision?: string | null;
  derivedRevision?: string | null;
  /** One frozen read instant for deterministic expiry projection across this result. */
  verificationTime?: Date;
  people?: readonly DatabasePerson[];
  resolveFileAvailability?: (path: string) => DatabaseFileAvailability;
  resolveRelationRecord?: (
    recordId: string,
    targetSourceId: string,
  ) => ProjectedDatabaseRelationRecord | null;
  /** Internal cooperative cancellation seam; never serialized into query contracts. */
  throwIfCancelled?: () => void;
}

function propertySuggestions(source: DatabaseSource): Array<{
  id: string;
  key: string;
  name: string;
}> {
  return source.properties.map((property) => ({
    id: property.id,
    key: property.key,
    name: property.name,
  }));
}

function requireProperty(source: DatabaseSource, propertyId: string): DatabaseProperty {
  const property = source.properties.find((candidate) => candidate.id === propertyId);
  if (!property) {
    throw new DatabaseQueryError(
      'unknown_property',
      `Property "${propertyId}" is not defined by source "${source.id}"`,
      { propertyId, candidates: propertySuggestions(source) },
    );
  }
  return property;
}

function isCanonicalScalarValue(
  property: DatabaseProperty,
  value: unknown,
  people?: readonly DatabasePerson[],
): boolean {
  if (property.type === 'formula') {
    switch (property.ast.resultType) {
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return typeof value === 'string' && isDatabaseDatePoint(value);
      case 'null':
        return false;
      case 'text':
      case 'person':
      case 'page':
        return typeof value === 'string';
      case 'list':
        return (
          typeof value === 'string' ||
          (typeof value === 'number' && Number.isFinite(value)) ||
          typeof value === 'boolean'
        );
    }
  }
  if (property.type === 'rollup') {
    if (property.function === 'earliest' || property.function === 'latest') {
      return typeof value === 'string' && isDatabaseDatePoint(value);
    }
    if (property.function !== 'show_original') {
      return typeof value === 'number' && Number.isFinite(value);
    }
    const targetType =
      property.targetValueType === 'list' ? property.targetItemType : property.targetValueType;
    if (targetType === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (targetType === 'boolean') return typeof value === 'boolean';
    if (targetType === 'date') return typeof value === 'string' && isDatabaseDatePoint(value);
    return typeof value === 'string';
  }
  switch (property.type) {
    case 'number':
    case 'unique_id':
      return typeof value === 'number' && Number.isFinite(value);
    case 'place':
      return typeof value === 'string';
    case 'checkbox':
      return typeof value === 'boolean';
    case 'date':
      return typeof value === 'string' && isDatabaseDatePoint(value);
    case 'select':
    case 'status':
      return typeof value === 'string' && property.options.some((option) => option.id === value);
    case 'multi_select':
      return typeof value === 'string' && property.options.some((option) => option.id === value);
    case 'person':
      return (
        DatabasePersonIdSchema.safeParse(value).success &&
        (people === undefined || people.some((person) => person.id === value))
      );
    case 'files':
      return isSafeDatabaseAssetPath(value) || isSafeDatabaseExternalFileUrl(value);
    case 'relation':
      return typeof value === 'string' && /^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
    default:
      return typeof value === 'string';
  }
}

function isValueCompatible(
  property: DatabaseProperty,
  operator: Exclude<DatabaseQueryOperator, 'is_empty' | 'is_not_empty'>,
  value: DatabaseFilterValue,
  people?: readonly DatabasePerson[],
): boolean {
  if (operator === 'in') {
    if (!Array.isArray(value)) return false;
    return value.every((item) => isCanonicalScalarValue(property, item, people));
  }
  if (operator === 'contains' || operator === 'does_not_contain') {
    return isCanonicalScalarValue(property, value, people);
  }
  if (
    property.type === 'multi_select' ||
    property.type === 'person' ||
    property.type === 'files' ||
    (property.type === 'relation' && property.cardinality === 'many') ||
    (property.type === 'formula' && property.ast.resultType === 'list') ||
    (property.type === 'rollup' && property.function === 'show_original')
  ) {
    return operator === 'eq' || operator === 'neq'
      ? Array.isArray(value) &&
          value.every((item) => isCanonicalScalarValue(property, item, people))
      : isCanonicalScalarValue(property, value, people);
  }
  return isCanonicalScalarValue(property, value, people);
}

const EQUALITY_OPERATORS = ['eq', 'neq', 'in', 'is_empty', 'is_not_empty'] as const;
const TEXT_OPERATORS = [
  ...EQUALITY_OPERATORS,
  'contains',
  'does_not_contain',
  'starts_with',
  'ends_with',
] as const;
const COLLECTION_OPERATORS = [...EQUALITY_OPERATORS, 'contains', 'does_not_contain'] as const;

export const DATABASE_QUERY_OPERATOR_MATRIX = {
  title: TEXT_OPERATORS,
  text: TEXT_OPERATORS,
  number: [...EQUALITY_OPERATORS, 'gt', 'gte', 'lt', 'lte'],
  checkbox: EQUALITY_OPERATORS,
  date: [...EQUALITY_OPERATORS, 'gt', 'gte', 'lt', 'lte'],
  created_time: [...EQUALITY_OPERATORS, 'gt', 'gte', 'lt', 'lte'],
  last_edited_time: [...EQUALITY_OPERATORS, 'gt', 'gte', 'lt', 'lte'],
  created_by: EQUALITY_OPERATORS,
  last_edited_by: EQUALITY_OPERATORS,
  verification: EQUALITY_OPERATORS,
  button: [],
  unique_id: [...EQUALITY_OPERATORS, 'gt', 'gte', 'lt', 'lte'],
  place: TEXT_OPERATORS,
  select: EQUALITY_OPERATORS,
  status: EQUALITY_OPERATORS,
  multi_select: COLLECTION_OPERATORS,
  person: COLLECTION_OPERATORS,
  files: COLLECTION_OPERATORS,
  url: TEXT_OPERATORS,
  email: TEXT_OPERATORS,
  phone: TEXT_OPERATORS,
  relation: COLLECTION_OPERATORS,
  formula: [],
  rollup: [],
} as const satisfies Record<DatabasePropertyType, readonly DatabaseQueryOperator[]>;

export function databaseQueryOperatorsForProperty(
  property: DatabaseProperty,
): readonly DatabaseQueryOperator[] {
  if (property.type === 'formula') {
    switch (property.ast.resultType) {
      case 'text':
        return TEXT_OPERATORS;
      case 'number':
        return [...EQUALITY_OPERATORS, 'gt', 'gte', 'lt', 'lte'];
      case 'date':
        return [...EQUALITY_OPERATORS, 'gt', 'gte', 'lt', 'lte'];
      case 'list':
        return COLLECTION_OPERATORS;
      case 'boolean':
      case 'person':
      case 'page':
        return EQUALITY_OPERATORS;
      case 'null':
        return ['is_empty', 'is_not_empty'];
    }
  }
  if (property.type === 'rollup') {
    if (property.function === 'show_original') return COLLECTION_OPERATORS;
    if (property.function === 'earliest' || property.function === 'latest') {
      return [...EQUALITY_OPERATORS, 'gt', 'gte', 'lt', 'lte'];
    }
    return [...EQUALITY_OPERATORS, 'gt', 'gte', 'lt', 'lte'];
  }
  return DATABASE_QUERY_OPERATOR_MATRIX[property.type];
}

function isDateQueryProperty(property: DatabaseProperty): boolean {
  return (
    property.type === 'date' ||
    property.type === 'created_time' ||
    property.type === 'last_edited_time' ||
    (property.type === 'formula' && property.ast.resultType === 'date') ||
    (property.type === 'rollup' &&
      (property.function === 'earliest' || property.function === 'latest'))
  );
}

export function validateDatabaseFilter(
  source: DatabaseSource,
  filter: DatabaseFilter,
  people?: readonly DatabasePerson[],
): void {
  if ('and' in filter) {
    for (const child of filter.and) validateDatabaseFilter(source, child, people);
    return;
  }
  if ('or' in filter) {
    for (const child of filter.or) validateDatabaseFilter(source, child, people);
    return;
  }
  if ('not' in filter) {
    validateDatabaseFilter(source, filter.not, people);
    return;
  }

  const property = requireProperty(source, filter.propertyId);
  const allowedOperators = databaseQueryOperatorsForProperty(property);
  if (!allowedOperators.includes(filter.operator)) {
    throw new DatabaseQueryError(
      'invalid_operator',
      `Operator "${filter.operator}" is not valid for ${property.type} property "${property.key}"`,
      {
        propertyId: property.id,
        propertyType: property.type,
        allowedOperators: [...allowedOperators],
      },
    );
  }
  if ('value' in filter && !isValueCompatible(property, filter.operator, filter.value, people)) {
    throw new DatabaseQueryError(
      'invalid_value',
      `Value for operator "${filter.operator}" is incompatible with ${property.type} property "${property.key}"`,
      { propertyId: property.id, propertyType: property.type, value: filter.value },
    );
  }
}

function valuesEqual(
  left: DatabaseValue,
  right: DatabaseFilterValue,
  property: DatabaseProperty,
): boolean {
  if (property.type === 'text' && typeof left === 'string' && typeof right === 'string') {
    return projectDatabaseRichText(left).plainText === projectDatabaseRichText(right).plainText;
  }
  if (isDateQueryProperty(property) && typeof right === 'string') {
    const leftStart = databaseDateStart(left as DatabaseDateValue);
    return isDatabaseDateOnly(leftStart) || isDatabaseDateOnly(right)
      ? leftStart === right
      : databaseDateStartEpoch(left as DatabaseDateValue) === Date.parse(right);
  }
  if (property.type === 'files' && Array.isArray(left) && Array.isArray(right)) {
    const identities = (left as DatabaseFileValue[]).map(databaseFileIdentity);
    return (
      identities.length === right.length &&
      identities.every((value, index) => value === right[index])
    );
  }
  if (!Array.isArray(left) || !Array.isArray(right)) return left === right;
  if (left.length !== right.length) return false;
  const rightSet = new Set<unknown>(right as readonly unknown[]);
  return left.every((value) => rightSet.has(value));
}

function compareValues(
  left: DatabaseValue,
  right: DatabaseFilterValue,
  property: DatabaseProperty,
): number {
  if (Array.isArray(left) || Array.isArray(right)) return 0;
  if (property.type === 'text') {
    return projectDatabaseRichText(String(left)).plainText.localeCompare(
      projectDatabaseRichText(String(right)).plainText,
    );
  }
  if (isDateQueryProperty(property)) {
    return databaseDateStartEpoch(left as DatabaseDateValue) - Date.parse(String(right));
  }
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function matchesLeaf(
  recordValue: DatabaseValue | undefined,
  property: DatabaseProperty,
  filter: Extract<DatabaseFilter, { propertyId: string }>,
): boolean {
  if (property.type === 'place' && recordValue !== undefined) {
    recordValue = databasePlaceSearchText(recordValue as DatabasePlaceValue);
  }
  if (property.type === 'text' && typeof recordValue === 'string') {
    recordValue = projectDatabaseRichText(recordValue).plainText;
  }
  if (property.type === 'verification' && recordValue !== undefined) {
    const parsed = DatabaseVerificationValueSchema.safeParse(recordValue);
    recordValue = parsed.success ? parsed.data.state : undefined;
  }
  if (filter.operator === 'is_empty') {
    return (
      recordValue === undefined ||
      recordValue === '' ||
      (Array.isArray(recordValue) && recordValue.length === 0)
    );
  }
  if (filter.operator === 'is_not_empty') {
    return (
      recordValue !== undefined &&
      recordValue !== '' &&
      (!Array.isArray(recordValue) || recordValue.length > 0)
    );
  }
  if (recordValue === undefined) {
    return filter.operator === 'neq' || filter.operator === 'does_not_contain';
  }

  switch (filter.operator) {
    case 'eq':
      return valuesEqual(recordValue, filter.value, property);
    case 'neq':
      return !valuesEqual(recordValue, filter.value, property);
    case 'contains':
      if (property.type === 'files' && Array.isArray(recordValue)) {
        return (recordValue as DatabaseFileValue[]).some(
          (file) => databaseFileIdentity(file) === String(filter.value),
        );
      }
      if (Array.isArray(recordValue))
        return (recordValue as string[]).includes(String(filter.value));
      return String(recordValue).toLowerCase().includes(String(filter.value).toLowerCase());
    case 'does_not_contain':
      if (property.type === 'files' && Array.isArray(recordValue)) {
        return !(recordValue as DatabaseFileValue[]).some(
          (file) => databaseFileIdentity(file) === String(filter.value),
        );
      }
      if (Array.isArray(recordValue))
        return !(recordValue as string[]).includes(String(filter.value));
      return !String(recordValue).toLowerCase().includes(String(filter.value).toLowerCase());
    case 'starts_with':
      return String(recordValue).toLowerCase().startsWith(String(filter.value).toLowerCase());
    case 'ends_with':
      return String(recordValue).toLowerCase().endsWith(String(filter.value).toLowerCase());
    case 'in':
      if (!Array.isArray(filter.value)) return false;
      if (Array.isArray(recordValue)) {
        const candidates = new Set<unknown>(filter.value as readonly unknown[]);
        return property.type === 'files'
          ? (recordValue as DatabaseFileValue[]).some((file) =>
              candidates.has(databaseFileIdentity(file)),
            )
          : recordValue.some((value) => candidates.has(value));
      }
      return (filter.value as readonly unknown[]).includes(recordValue);
    case 'gt':
      return compareValues(recordValue, filter.value, property) > 0;
    case 'gte':
      return compareValues(recordValue, filter.value, property) >= 0;
    case 'lt':
      return compareValues(recordValue, filter.value, property) < 0;
    case 'lte':
      return compareValues(recordValue, filter.value, property) <= 0;
  }
}

function matchesFilterState(
  record: DatabaseRecord,
  source: DatabaseSource,
  filter: DatabaseFilter,
): boolean | null {
  if ('and' in filter) {
    const states = filter.and.map((child) => matchesFilterState(record, source, child));
    return states.includes(false) ? false : states.includes(null) ? null : true;
  }
  if ('or' in filter) {
    const states = filter.or.map((child) => matchesFilterState(record, source, child));
    return states.includes(true) ? true : states.includes(null) ? null : false;
  }
  if ('not' in filter) {
    const state = matchesFilterState(record, source, filter.not);
    return state === null ? null : !state;
  }
  const property = requireProperty(source, filter.propertyId);
  if (record.invalidValues?.[property.id] !== undefined) return null;
  return matchesLeaf(record.values[property.id], property, filter);
}

/** Evaluate a canonical filter without treating malformed stored values as a match. */
export function evaluateDatabaseFilter(
  record: DatabaseRecord,
  source: DatabaseSource,
  filter: DatabaseFilter,
): 'match' | 'no_match' | 'invalid' {
  const state = matchesFilterState(record, source, filter);
  return state === true ? 'match' : state === false ? 'no_match' : 'invalid';
}

function matchesFilter(
  record: DatabaseRecord,
  source: DatabaseSource,
  filter: DatabaseFilter,
): boolean {
  return matchesFilterState(record, source, filter) === true;
}

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function naturalTokens(value: string): string[] {
  return value.match(/\d+|\D+/g) ?? [];
}

function naturalCodePointCompare(left: string, right: string): number {
  const leftTokens = naturalTokens(left);
  const rightTokens = naturalTokens(right);
  const length = Math.max(leftTokens.length, rightTokens.length);
  for (let index = 0; index < length; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];
    if (leftToken === undefined) return -1;
    if (rightToken === undefined) return 1;
    const leftNumeric = /^\d+$/.test(leftToken);
    const rightNumeric = /^\d+$/.test(rightToken);
    if (leftNumeric && rightNumeric) {
      const leftMagnitude = leftToken.replace(/^0+(?=\d)/, '');
      const rightMagnitude = rightToken.replace(/^0+(?=\d)/, '');
      if (leftMagnitude.length !== rightMagnitude.length) {
        return leftMagnitude.length - rightMagnitude.length;
      }
      const magnitudeOrder = codePointCompare(leftMagnitude, rightMagnitude);
      if (magnitudeOrder !== 0) return magnitudeOrder;
      if (leftToken.length !== rightToken.length) return leftToken.length - rightToken.length;
      continue;
    }
    const tokenOrder = codePointCompare(leftToken, rightToken);
    if (tokenOrder !== 0) return tokenOrder;
  }
  return 0;
}

function compareTextForSort(left: string, right: string): number {
  const normalizedLeft = left.normalize('NFKD');
  const normalizedRight = right.normalize('NFKD');
  const primaryLeft = normalizedLeft.replace(/\p{M}/gu, '').toLowerCase();
  const primaryRight = normalizedRight.replace(/\p{M}/gu, '').toLowerCase();
  const primary = naturalCodePointCompare(primaryLeft, primaryRight);
  if (primary !== 0) return primary;
  const secondary = naturalCodePointCompare(
    normalizedLeft.toLowerCase(),
    normalizedRight.toLowerCase(),
  );
  if (secondary !== 0) return secondary;
  return naturalCodePointCompare(normalizedLeft, normalizedRight);
}

function isEmptySortValue(value: DatabaseValue | undefined): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function compareArraysForSort(
  left: readonly (string | number | boolean)[],
  right: readonly (string | number | boolean)[],
): number {
  const scalar = (value: string | number | boolean): string => `${typeof value}:${String(value)}`;
  const sortedLeft = [...left].map(scalar).sort(compareTextForSort);
  const sortedRight = [...right].map(scalar).sort(compareTextForSort);
  const length = Math.max(sortedLeft.length, sortedRight.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = sortedLeft[index];
    const rightValue = sortedRight[index];
    if (leftValue === undefined) return -1;
    if (rightValue === undefined) return 1;
    const compared = compareTextForSort(leftValue, rightValue);
    if (compared !== 0) return compared;
  }
  return 0;
}

function compareForSort(
  left: DatabaseValue | undefined,
  right: DatabaseValue | undefined,
  property: DatabaseProperty,
  people?: readonly DatabasePerson[],
): number {
  if (left === undefined || right === undefined) return 0;
  if (property.type === 'place') {
    return compareTextForSort(
      databasePlaceSearchText(left as DatabasePlaceValue),
      databasePlaceSearchText(right as DatabasePlaceValue),
    );
  }
  if (property.type === 'text') {
    return compareTextForSort(
      projectDatabaseRichText(String(left)).plainText,
      projectDatabaseRichText(String(right)).plainText,
    );
  }
  if (property.type === 'verification') {
    const leftValue = DatabaseVerificationValueSchema.parse(left);
    const rightValue = DatabaseVerificationValueSchema.parse(right);
    return compareTextForSort(leftValue.state, rightValue.state);
  }
  if (isDateQueryProperty(property)) {
    return (
      databaseDateStartEpoch(left as DatabaseDateValue) -
      databaseDateStartEpoch(right as DatabaseDateValue)
    );
  }
  if (property.type === 'person' && Array.isArray(left) && Array.isArray(right)) {
    const label = (personId: string) => {
      const person = people?.find((candidate) => candidate.id === personId);
      return person ? `${person.name}\0${person.key}\0${person.id}` : personId;
    };
    return compareArraysForSort((left as string[]).map(label), (right as string[]).map(label));
  }
  if (property.type === 'files' && Array.isArray(left) && Array.isArray(right)) {
    const labels = (files: DatabaseFileValue[]) =>
      files.map((file) => `${databaseFileDisplayName(file)}\0${databaseFileIdentity(file)}`);
    return compareArraysForSort(
      labels(left as DatabaseFileValue[]),
      labels(right as DatabaseFileValue[]),
    );
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return compareArraysForSort(
      left as Array<string | number | boolean>,
      right as Array<string | number | boolean>,
    );
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right);
  }
  if (property.type === 'status' && typeof left === 'string' && typeof right === 'string') {
    const orderedOptionIds = property.groups.flatMap((group) =>
      property.options.filter((option) => option.groupId === group.id).map((option) => option.id),
    );
    const leftIndex = orderedOptionIds.indexOf(left);
    const rightIndex = orderedOptionIds.indexOf(right);
    if (leftIndex !== -1 && rightIndex !== -1 && leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
  }
  return compareTextForSort(String(left), String(right));
}

const UNIVERSAL_CALCULATIONS = [
  'count_values',
  'count_unique',
  'percent_empty',
  'percent_not_empty',
] as const;
const NUMBER_CALCULATIONS = ['sum', 'average', 'median', 'min', 'max', 'range'] as const;
const DATE_CALCULATIONS = ['earliest', 'latest', 'date_range'] as const;
const CHECKBOX_CALCULATIONS = [
  'checked',
  'unchecked',
  'percent_checked',
  'percent_unchecked',
] as const;

export function databaseCalculationFunctionsForProperty(
  property: DatabaseProperty,
): readonly DatabaseCalculationFunction[] {
  const formulaType = property.type === 'formula' ? property.ast.resultType : null;
  const rollupType =
    property.type === 'rollup'
      ? property.function === 'earliest' || property.function === 'latest'
        ? 'date'
        : property.function === 'show_original'
          ? 'list'
          : 'number'
      : null;
  if (
    property.type === 'number' ||
    property.type === 'unique_id' ||
    formulaType === 'number' ||
    rollupType === 'number'
  ) {
    return [...UNIVERSAL_CALCULATIONS, ...NUMBER_CALCULATIONS];
  }
  if (
    property.type === 'date' ||
    property.type === 'created_time' ||
    property.type === 'last_edited_time' ||
    formulaType === 'date' ||
    rollupType === 'date'
  ) {
    return [...UNIVERSAL_CALCULATIONS, ...DATE_CALCULATIONS];
  }
  if (property.type === 'checkbox' || formulaType === 'boolean') {
    return [...UNIVERSAL_CALCULATIONS, ...CHECKBOX_CALCULATIONS];
  }
  return UNIVERSAL_CALCULATIONS;
}

function validateAggregate(
  source: DatabaseSource,
  aggregate: NonNullable<DatabaseQuery['aggregate']>,
) {
  assertUniquePropertyIds(
    aggregate.groupBy.map((group) => group.propertyId),
    'group',
  );
  for (const group of aggregate.groupBy) requireProperty(source, group.propertyId);
  const calculationIds = new Set<string>();
  for (const calculation of aggregate.calculations) {
    if (calculationIds.has(calculation.id)) {
      throw new DatabaseQueryError(
        'duplicate_calculation',
        `Calculation ID "${calculation.id}" is repeated`,
        { calculationId: calculation.id },
      );
    }
    calculationIds.add(calculation.id);
    if (calculation.function === 'count_all') {
      if (calculation.propertyId !== undefined) {
        throw new DatabaseQueryError(
          'invalid_calculation',
          'count_all must not specify a property',
          { calculationId: calculation.id, propertyId: calculation.propertyId },
        );
      }
      continue;
    }
    if (calculation.propertyId === undefined) {
      throw new DatabaseQueryError(
        'invalid_calculation',
        `Calculation "${calculation.function}" requires a property`,
        { calculationId: calculation.id, function: calculation.function },
      );
    }
    const property = requireProperty(source, calculation.propertyId);
    const allowedFunctions = databaseCalculationFunctionsForProperty(property);
    if (!allowedFunctions.includes(calculation.function)) {
      throw new DatabaseQueryError(
        'invalid_calculation',
        `Calculation "${calculation.function}" is not valid for ${property.type} property "${property.key}"`,
        {
          calculationId: calculation.id,
          propertyId: property.id,
          propertyType: property.type,
          allowedFunctions: [...allowedFunctions],
        },
      );
    }
  }
}

function canonicalValueKey(value: DatabaseValue | null): string {
  if (value === null) return 'null';
  if (DatabaseFilesValueSchema.safeParse(value).success) {
    return `files:${JSON.stringify(value)}`;
  }
  if (Array.isArray(value))
    return `array:${JSON.stringify([...(value as string[])].sort(compareTextForSort))}`;
  if (DatabasePlaceValueSchema.safeParse(value).success) return `place:${JSON.stringify(value)}`;
  if (typeof value === 'object')
    return `date:${serializeDatabaseDateValue(value as DatabaseDateValue)}`;
  return `${typeof value}:${String(value)}`;
}

function isEmptyCalculationValue(value: DatabaseValue | undefined): boolean {
  return isEmptySortValue(value);
}

function calculateRows(
  records: readonly DatabaseRecord[],
  calculations: NonNullable<DatabaseQuery['aggregate']>['calculations'],
  throwIfCancelled?: () => void,
): DatabaseCalculationResult[] {
  return calculations.map((calculation, index) => {
    if (index % 8 === 0) throwIfCancelled?.();
    if (calculation.function === 'count_all') {
      return {
        id: calculation.id,
        function: calculation.function,
        propertyId: null,
        value: records.length,
        unit: 'count',
      };
    }
    const propertyId = calculation.propertyId as string;
    const eligibleRecords = records.filter(
      (record) => record.invalidValues?.[propertyId] === undefined,
    );
    const allValues = eligibleRecords.map((record) => record.values[propertyId]);
    const populated = allValues.filter(
      (value): value is DatabaseValue => !isEmptyCalculationValue(value),
    );
    const emptyCount = allValues.length - populated.length;
    const percentage = (numerator: number) =>
      eligibleRecords.length === 0 ? null : (numerator / eligibleRecords.length) * 100;
    let value: number | string | null;
    let unit: DatabaseCalculationResult['unit'];
    switch (calculation.function) {
      case 'count_values':
        value = populated.length;
        unit = 'count';
        break;
      case 'count_unique':
        value = new Set(populated.map((item) => canonicalValueKey(item))).size;
        unit = 'count';
        break;
      case 'percent_empty':
        value = percentage(emptyCount);
        unit = 'percentage';
        break;
      case 'percent_not_empty':
        value = percentage(populated.length);
        unit = 'percentage';
        break;
      case 'sum': {
        const numbers = populated as number[];
        value = numbers.reduce((sum, item) => sum + item, 0);
        unit = 'number';
        break;
      }
      case 'average': {
        const numbers = populated as number[];
        value =
          numbers.length === 0
            ? null
            : numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
        unit = 'number';
        break;
      }
      case 'median': {
        const numbers = [...(populated as number[])].sort((left, right) => left - right);
        const middle = Math.floor(numbers.length / 2);
        value =
          numbers.length === 0
            ? null
            : numbers.length % 2 === 1
              ? (numbers[middle] ?? null)
              : ((numbers[middle - 1] ?? 0) + (numbers[middle] ?? 0)) / 2;
        unit = 'number';
        break;
      }
      case 'min': {
        const numbers = populated as number[];
        value =
          numbers.length === 0 ? null : numbers.reduce((minimum, item) => Math.min(minimum, item));
        unit = 'number';
        break;
      }
      case 'max': {
        const numbers = populated as number[];
        value =
          numbers.length === 0 ? null : numbers.reduce((maximum, item) => Math.max(maximum, item));
        unit = 'number';
        break;
      }
      case 'range': {
        const numbers = populated as number[];
        value =
          numbers.length === 0
            ? null
            : numbers.reduce((maximum, item) => Math.max(maximum, item)) -
              numbers.reduce((minimum, item) => Math.min(minimum, item));
        unit = 'number';
        break;
      }
      case 'earliest':
      case 'latest': {
        const dateValues = populated as DatabaseDateValue[];
        if (dateValues.length === 0) value = null;
        else if (calculation.function === 'earliest') {
          const earliest = dateValues.reduce((candidate, item) =>
            databaseDateStartEpoch(item) < databaseDateStartEpoch(candidate) ? item : candidate,
          );
          value = databaseDateStart(earliest);
        } else {
          const latest = dateValues.reduce((candidate, item) =>
            databaseDateEndEpoch(item) > databaseDateEndEpoch(candidate) ? item : candidate,
          );
          value = databaseDateEnd(latest);
        }
        unit = 'date';
        break;
      }
      case 'date_range': {
        const starts = populated.map((item) => databaseDateStartEpoch(item as DatabaseDateValue));
        const ends = populated.map((item) => databaseDateEndEpoch(item as DatabaseDateValue));
        value =
          starts.length === 0
            ? null
            : ends.reduce((maximum, item) => Math.max(maximum, item)) -
              starts.reduce((minimum, item) => Math.min(minimum, item));
        unit = 'milliseconds';
        break;
      }
      case 'checked':
      case 'unchecked': {
        const expected = calculation.function === 'checked';
        value = (populated as boolean[]).filter((item) => item === expected).length;
        unit = 'count';
        break;
      }
      case 'percent_checked':
      case 'percent_unchecked': {
        const expected = calculation.function === 'percent_checked';
        value = percentage((populated as boolean[]).filter((item) => item === expected).length);
        unit = 'percentage';
        break;
      }
    }
    return { id: calculation.id, function: calculation.function, propertyId, value, unit };
  });
}

function groupValues(
  record: DatabaseRecord,
  source: DatabaseSource,
  group: NonNullable<DatabaseQuery['aggregate']>['groupBy'][number],
): Array<DatabaseValue | null> {
  if (record.invalidValues?.[group.propertyId] !== undefined) return [];
  const value = record.values[group.propertyId];
  if (isEmptySortValue(value)) return group.includeEmpty ? [null] : [];
  const property = requireProperty(source, group.propertyId);
  if (property.type === 'place') {
    return [databasePlaceSearchText(value as DatabasePlaceValue)];
  }
  if (property.type === 'text' && typeof value === 'string') {
    return [projectDatabaseRichText(value).plainText];
  }
  if (property.type === 'verification') {
    return [DatabaseVerificationValueSchema.parse(value).state];
  }
  if (property.type === 'files' && Array.isArray(value)) {
    const identities = (value as DatabaseFileValue[]).map(databaseFileIdentity);
    return group.arrayMode === 'each' ? identities : [identities];
  }
  if (Array.isArray(value) && group.arrayMode === 'each') {
    return [...new Set(value as string[])].sort(compareTextForSort);
  }
  if (Array.isArray(value)) return [[...(value as string[])].sort(compareTextForSort)];
  return [value ?? null];
}

function recordGroupMemberships(
  record: DatabaseRecord,
  source: DatabaseSource,
  aggregate: NonNullable<DatabaseQuery['aggregate']>,
): DatabaseGroupMembershipKey[] {
  let prefixes: DatabaseGroupMembershipKey[] = [[]];
  for (const [index, group] of aggregate.groupBy.entries()) {
    const nextPrefixes: DatabaseGroupMembershipKey[] = [];
    for (const prefix of prefixes) {
      for (const value of groupValues(record, source, group)) {
        nextPrefixes.push([...prefix, { propertyId: group.propertyId, value }]);
        if (nextPrefixes.length > aggregate.membershipLimit) {
          throw new DatabaseQueryError(
            'invalid_query',
            `Record "${record.id}" exceeds the aggregate group membership limit`,
            {
              recordId: record.id,
              membershipLimit: aggregate.membershipLimit,
              groupLevel: index + 1,
            },
          );
        }
      }
    }
    prefixes = nextPrefixes;
  }
  return prefixes;
}

function buildAggregation(
  records: readonly DatabaseRecord[],
  source: DatabaseSource,
  aggregate: NonNullable<DatabaseQuery['aggregate']>,
  people?: readonly DatabasePerson[],
  throwIfCancelled?: () => void,
): DatabaseAggregationResult {
  const groupMaps = aggregate.groupBy.map(
    () => new Map<string, { key: DatabaseAggregationGroup['key']; records: DatabaseRecord[] }>(),
  );
  for (const [recordIndex, record] of records.entries()) {
    if (recordIndex % 256 === 0) throwIfCancelled?.();
    const seenSignatures = new Set<string>();
    for (const key of recordGroupMemberships(record, source, aggregate)) {
      for (let index = 0; index < key.length; index += 1) {
        const prefix = key.slice(0, index + 1);
        const signature = prefix
          .map((item) => `${item.propertyId}:${canonicalValueKey(item.value)}`)
          .join('|');
        const map = groupMaps[index];
        if (!map) continue;
        if (seenSignatures.has(signature)) continue;
        seenSignatures.add(signature);
        const existing = map.get(signature);
        if (existing) existing.records.push(record);
        else map.set(signature, { key: prefix, records: [record] });
      }
    }
  }
  const compareGroupKeys = (
    left: DatabaseAggregationGroup['key'],
    right: DatabaseAggregationGroup['key'],
  ) => {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const leftItem = left[index];
      const rightItem = right[index];
      if (!leftItem) return -1;
      if (!rightItem) return 1;
      const group = aggregate.groupBy[index];
      if (!group) continue;
      const leftEmpty = leftItem.value === null;
      const rightEmpty = rightItem.value === null;
      if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
      if (leftEmpty) continue;
      const property = requireProperty(source, group.propertyId);
      const compared = compareForSort(
        leftItem.value ?? undefined,
        rightItem.value ?? undefined,
        property,
        people,
      );
      if (compared !== 0) return group.direction === 'asc' ? compared : -compared;
    }
    return codePointCompare(
      left.map((item) => `${item.propertyId}:${canonicalValueKey(item.value)}`).join('|'),
      right.map((item) => `${item.propertyId}:${canonicalValueKey(item.value)}`).join('|'),
    );
  };
  const allGroups = groupMaps.flatMap((map, index) =>
    [...map.values()]
      .sort((left, right) => compareGroupKeys(left.key, right.key))
      .map((group) => ({
        level: (index + 1) as 1 | 2,
        key: group.key,
        matched: group.records.length,
        calculations: calculateRows(group.records, aggregate.calculations, throwIfCancelled),
      })),
  );
  const groups = allGroups.slice(0, aggregate.groupLimit);
  return {
    matched: records.length,
    groupBy: structuredClone(aggregate.groupBy),
    calculations: calculateRows(records, aggregate.calculations, throwIfCancelled),
    totalGroups: allGroups.length,
    returnedGroups: groups.length,
    groupsComplete: groups.length === allGroups.length,
    truncatedBy: groups.length === allGroups.length ? null : 'group_limit',
    groups,
  };
}

function cursorFingerprint(
  sourceId: string,
  snapshotRevision: string,
  query: DatabaseQuery,
): string {
  const serialized = JSON.stringify({
    sortSemanticsVersion: DATABASE_QUERY_SORT_SEMANTICS.version,
    sourceId,
    snapshotRevision,
    where: query.where ?? null,
    search: query.search ?? null,
    sort: query.sort,
    select: query.select ?? null,
    aggregate: query.aggregate ?? null,
    includeArchived: query.includeArchived,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseCursor(
  cursor: string | undefined,
  matched: number,
  expectedFingerprint: string,
): number {
  if (cursor === undefined) return 0;
  const match = /^v2:([0-9a-f]{8}):(\d+)$/.exec(cursor);
  const fingerprint = match?.[1];
  const offset = match ? Number(match[2]) : Number.NaN;
  if (
    fingerprint !== expectedFingerprint ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > matched
  ) {
    throw new DatabaseQueryError('invalid_cursor', `Query cursor "${cursor}" is invalid`, {
      cursor,
      matched,
    });
  }
  return offset;
}

function assertUniquePropertyIds(
  propertyIds: readonly string[],
  location: 'select' | 'sort' | 'group',
): void {
  const seen = new Set<string>();
  for (const propertyId of propertyIds) {
    if (seen.has(propertyId)) {
      throw new DatabaseQueryError(
        'duplicate_property',
        `Property "${propertyId}" is repeated in query ${location}`,
        { propertyId, location },
      );
    }
    seen.add(propertyId);
  }
}

function matchesDatabaseSearch(
  record: DatabaseRecord,
  source: DatabaseSource,
  search?: string,
): boolean {
  const needle = search?.trim().toLocaleLowerCase();
  if (!needle) return true;
  const readableValues = source.properties.map((property) => {
    const value = record.values[property.id];
    return `${property.name} ${typeof value === 'string' ? value : JSON.stringify(value ?? '')}`;
  });
  return [record.path, ...readableValues].join('\n').toLocaleLowerCase().includes(needle);
}

/** Execute an exact typed query over one complete source snapshot. */
export function queryDatabaseRecords(input: QueryDatabaseRecordsInput): DatabaseQueryResult {
  input.throwIfCancelled?.();
  if (input.snapshotRevision.trim() === '') {
    throw new DatabaseQueryError('invalid_query', 'snapshotRevision must not be empty');
  }

  const parsedQuery = DatabaseQuerySchema.safeParse(input.query ?? {});
  if (!parsedQuery.success) {
    throw new DatabaseQueryError(
      'invalid_query',
      parsedQuery.error.issues[0]?.message ?? 'Invalid query',
      {
        issues: parsedQuery.error.issues,
      },
    );
  }
  const query = parsedQuery.data;
  const verificationTime = input.verificationTime ?? new Date();

  if (query.where) validateDatabaseFilter(input.source, query.where, input.people);
  if (query.aggregate) validateAggregate(input.source, query.aggregate);
  const selectedPropertyIds =
    query.select ?? input.source.properties.map((property) => property.id);
  assertUniquePropertyIds(selectedPropertyIds, 'select');
  assertUniquePropertyIds(
    query.sort.map((sort) => sort.propertyId),
    'sort',
  );
  for (const propertyId of selectedPropertyIds) requireProperty(input.source, propertyId);
  const resolvedSort = query.sort.map((sort) => ({
    ...sort,
    property: requireProperty(input.source, sort.propertyId),
  }));

  const recordIds = new Set<string>();
  for (const [recordIndex, record] of input.records.entries()) {
    if (recordIndex % 256 === 0) input.throwIfCancelled?.();
    if (record.sourceId !== input.source.id) {
      throw new DatabaseQueryError(
        'wrong_source',
        `Record "${record.id}" belongs to source "${record.sourceId}", not "${input.source.id}"`,
        { recordId: record.id, sourceId: record.sourceId },
      );
    }
    if (recordIds.has(record.id)) {
      throw new DatabaseQueryError(
        'duplicate_record_id',
        `Record ID "${record.id}" appears more than once in the query snapshot`,
        { recordId: record.id },
      );
    }
    recordIds.add(record.id);
  }

  const matching: DatabaseRecord[] = [];
  for (const [recordIndex, record] of input.records.entries()) {
    if (recordIndex % 256 === 0) input.throwIfCancelled?.();
    if (
      (query.includeArchived || !record.archivedAt) &&
      (!query.where || matchesFilter(record, input.source, query.where)) &&
      matchesDatabaseSearch(record, input.source, query.search)
    ) {
      matching.push(record);
    }
  }
  let sortComparisons = 0;
  const sorted = [...matching].sort((left, right) => {
    sortComparisons += 1;
    if (sortComparisons % 256 === 0) input.throwIfCancelled?.();
    for (const sort of resolvedSort) {
      const leftValue = left.values[sort.propertyId];
      const rightValue = right.values[sort.propertyId];
      const leftEmpty = isEmptySortValue(leftValue);
      const rightEmpty = isEmptySortValue(rightValue);
      if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
      if (leftEmpty && rightEmpty) continue;
      const compared = compareForSort(leftValue, rightValue, sort.property, input.people);
      if (compared !== 0) {
        return sort.direction === 'asc' ? compared : -compared;
      }
    }
    return codePointCompare(left.id, right.id);
  });

  const fingerprint = cursorFingerprint(input.source.id, input.snapshotRevision, query);
  const offset = parseCursor(query.page.cursor, sorted.length, fingerprint);
  const end = Math.min(offset + query.page.limit, sorted.length);
  const page = sorted.slice(offset, end);
  const nextCursor = end < sorted.length ? `v2:${fingerprint}:${end}` : null;
  const aggregation = query.aggregate
    ? buildAggregation(sorted, input.source, query.aggregate, input.people, input.throwIfCancelled)
    : null;
  input.throwIfCancelled?.();
  const groupMemberships =
    query.aggregate && query.aggregate.groupBy.length > 0
      ? Object.fromEntries(
          page.map((record) => [
            record.id,
            recordGroupMemberships(
              record,
              input.source,
              query.aggregate as NonNullable<DatabaseQuery['aggregate']>,
            ),
          ]),
        )
      : undefined;
  const records = page.map((record, recordIndex) => {
    if (recordIndex % 64 === 0) input.throwIfCancelled?.();
    const textProjections = Object.fromEntries(
      selectedPropertyIds.flatMap((propertyId) => {
        const property = input.source.properties.find((candidate) => candidate.id === propertyId);
        const value = record.values[propertyId];
        if (property?.type !== 'text' || typeof value !== 'string') return [];
        const projection = projectDatabaseRichText(value);
        return [
          [propertyId, { plainText: projection.plainText, references: projection.references }],
        ];
      }),
    );
    const verificationProjections = Object.fromEntries(
      selectedPropertyIds.flatMap((propertyId) => {
        const property = input.source.properties.find((candidate) => candidate.id === propertyId);
        const parsed = DatabaseVerificationValueSchema.safeParse(record.values[propertyId]);
        if (property?.type !== 'verification' || !parsed.success) return [];
        return [
          [
            propertyId,
            projectDatabaseVerification(
              parsed.data,
              record.revision,
              record.evidenceRevision ?? record.revision,
              verificationTime,
            ),
          ],
        ];
      }),
    );
    return {
      id: record.id,
      path: record.path,
      revision: record.revision,
      ...(record.storageRevision === undefined ? {} : { storageRevision: record.storageRevision }),
      ...(record.semanticRevisions === undefined
        ? {}
        : { semanticRevisions: structuredClone(record.semanticRevisions) }),
      ...(record.evidenceRevision === undefined
        ? {}
        : { evidenceRevision: record.evidenceRevision }),
      ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
      values: Object.fromEntries(
        selectedPropertyIds.flatMap((propertyId) => {
          const value = record.values[propertyId];
          return value === undefined ? [] : [[propertyId, value]];
        }),
      ),
      ...(Object.keys(textProjections).length > 0 ? { textProjections } : {}),
      ...(Object.keys(verificationProjections).length > 0 ? { verificationProjections } : {}),
      ...(record.invalidValues
        ? {
            invalidValues: Object.fromEntries(
              selectedPropertyIds.flatMap((propertyId) => {
                const value = record.invalidValues?.[propertyId];
                return value === undefined ? [] : [[propertyId, value]];
              }),
            ),
            issues: (record.issues ?? []).filter((issue) =>
              selectedPropertyIds.includes(issue.propertyId),
            ),
          }
        : {}),
      ...(record.computedResults
        ? {
            computedResults: Object.fromEntries(
              selectedPropertyIds.flatMap((propertyId) => {
                const result = record.computedResults?.[propertyId];
                return result === undefined ? [] : [[propertyId, result]];
              }),
            ),
          }
        : {}),
    };
  });
  const referencedPersonIds = new Set<string>();
  const referencedLocalFilePaths = new Set<string>();
  const referencedRelationRecords = new Map<string, string>();
  for (const [recordIndex, record] of records.entries()) {
    if (recordIndex % 64 === 0) input.throwIfCancelled?.();
    for (const [propertyId, value] of Object.entries(record.values)) {
      const property = input.source.properties.find((candidate) => candidate.id === propertyId);
      if (property?.type === 'text' && record.textProjections?.[propertyId]) {
        for (const reference of record.textProjections[propertyId].references) {
          if (reference.kind === 'person') referencedPersonIds.add(reference.target);
        }
      }
      if (property?.type === 'relation') {
        const relationIds = Array.isArray(value) ? value : [value];
        for (const recordId of relationIds) {
          if (typeof recordId === 'string') {
            referencedRelationRecords.set(recordId, property.targetSourceId);
          }
        }
        continue;
      }
      if (!Array.isArray(value)) continue;
      if (property?.type === 'files') {
        for (const file of value as DatabaseFileValue[]) {
          if (file.kind === 'local') referencedLocalFilePaths.add(file.path);
        }
        continue;
      }
      for (const entry of value) {
        if (typeof entry === 'string' && DatabasePersonIdSchema.safeParse(entry).success) {
          referencedPersonIds.add(entry);
        }
      }
    }
  }
  for (const group of aggregation?.groups ?? []) {
    for (const item of group.key) {
      const property = input.source.properties.find(
        (candidate) => candidate.id === item.propertyId,
      );
      const entries = Array.isArray(item.value)
        ? item.value
        : typeof item.value === 'string'
          ? [item.value]
          : [];
      if (property?.type === 'relation') {
        for (const recordId of entries) {
          if (typeof recordId === 'string') {
            referencedRelationRecords.set(recordId, property.targetSourceId);
          }
        }
        continue;
      }
      for (const entry of entries) {
        if (property?.type === 'files' && typeof entry === 'string') {
          if (isSafeDatabaseAssetPath(entry)) referencedLocalFilePaths.add(entry);
          continue;
        }
        if (typeof entry === 'string' && DatabasePersonIdSchema.safeParse(entry).success) {
          referencedPersonIds.add(entry);
        }
      }
    }
  }

  input.throwIfCancelled?.();
  return {
    sourceId: input.source.id,
    snapshotRevision: input.snapshotRevision,
    ...(input.storageRevision === undefined ? {} : { storageRevision: input.storageRevision }),
    ...(input.derivedRevision === undefined ? {} : { derivedRevision: input.derivedRevision }),
    matched: sorted.length,
    returned: page.length,
    isComplete: nextCursor === null,
    nextCursor,
    truncatedBy: nextCursor === null ? null : 'page_limit',
    indexFreshness: 'snapshot',
    records,
    aggregation,
    ...(groupMemberships ? { groupMemberships } : {}),
    ...(input.people
      ? {
          people: input.people
            .filter((person) => referencedPersonIds.has(person.id))
            .map(projectDatabasePerson),
        }
      : {}),
    ...(input.resolveFileAvailability && referencedLocalFilePaths.size > 0
      ? {
          fileStates: Object.fromEntries(
            [...referencedLocalFilePaths]
              .sort(codePointCompare)
              .map((path) => [path, input.resolveFileAvailability?.(path) ?? 'missing']),
          ),
        }
      : {}),
    ...(input.resolveRelationRecord && referencedRelationRecords.size > 0
      ? {
          relationRecords: [...referencedRelationRecords]
            .sort(([left], [right]) => codePointCompare(left, right))
            .flatMap(([recordId, sourceId]) => {
              const record = input.resolveRelationRecord?.(recordId, sourceId) ?? null;
              return record ? [record] : [];
            }),
        }
      : {}),
  };
}
