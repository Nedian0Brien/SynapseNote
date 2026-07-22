import { parseSerializedDatabaseDateValue, serializeDatabaseDateValue } from './date.ts';
import { DatabaseFilesValueSchema } from './files.ts';
import { canonicalizeDatabasePlaceValue } from './place.ts';
import {
  DATABASE_PROPERTY_TYPES,
  type DatabaseProperty,
  type DatabasePropertyType,
  isValidDatabaseEmail,
  isValidDatabasePhone,
  isValidDatabaseUrl,
  validateDatabasePropertyConstraints,
} from './schema.ts';

export type DatabasePropertyConversionKind =
  | 'identity'
  | 'lossless'
  | 'conditional'
  | 'lossy'
  | 'blocked';

export interface DatabasePropertyConversionRule {
  from: DatabasePropertyType;
  to: DatabasePropertyType;
  kind: DatabasePropertyConversionKind;
  reason: string;
}

const DERIVED_TYPES = new Set<DatabasePropertyType>([
  'created_time',
  'last_edited_time',
  'created_by',
  'last_edited_by',
  'button',
  'verification',
  'unique_id',
  'formula',
  'rollup',
]);
const TEXT_TYPES = new Set<DatabasePropertyType>(['title', 'text', 'url', 'email', 'phone']);
const OPTION_TYPES = new Set<DatabasePropertyType>(['select', 'status']);

function conversionRule(
  from: DatabasePropertyType,
  to: DatabasePropertyType,
): DatabasePropertyConversionRule {
  if (from === to) return { from, to, kind: 'identity', reason: 'Canonical values are unchanged' };
  if (DERIVED_TYPES.has(from) || DERIVED_TYPES.has(to)) {
    return {
      from,
      to,
      kind: 'blocked',
      reason: 'Derived, virtual, and allocated properties cannot participate in value conversion',
    };
  }
  if (to === 'text') {
    const lossless =
      TEXT_TYPES.has(from) || from === 'number' || from === 'checkbox' || from === 'date';
    return {
      from,
      to,
      kind: lossless ? 'lossless' : 'lossy',
      reason: lossless
        ? 'Each value has a stable canonical text representation'
        : 'Structured identity or collection semantics are flattened into canonical JSON text',
    };
  }
  if (
    from === 'text' &&
    (TEXT_TYPES.has(to) || ['number', 'checkbox', 'date', 'place', 'files'].includes(to))
  ) {
    return {
      from,
      to,
      kind: 'conditional',
      reason: 'Every non-empty value must parse and satisfy the target property contract',
    };
  }
  if (from === 'checkbox' && to === 'number') {
    return { from, to, kind: 'lossless', reason: 'false and true map to 0 and 1' };
  }
  if (from === 'number' && to === 'checkbox') {
    return { from, to, kind: 'conditional', reason: 'Only 0 and 1 can map without guessing' };
  }
  if (
    (OPTION_TYPES.has(from) && OPTION_TYPES.has(to)) ||
    (OPTION_TYPES.has(from) && to === 'multi_select') ||
    (from === 'multi_select' && OPTION_TYPES.has(to))
  ) {
    return {
      from,
      to,
      kind: 'conditional',
      reason:
        from === 'multi_select'
          ? 'A record must contain at most one option and every option key must exist in the target'
          : 'Stable option keys are mapped into the target option vocabulary',
    };
  }
  return {
    from,
    to,
    kind: 'blocked',
    reason:
      'No deterministic direct conversion is defined; convert through an explicitly reviewed text export',
  };
}

export const DATABASE_PROPERTY_CONVERSION_MATRIX: Readonly<
  Record<
    DatabasePropertyType,
    Readonly<Record<DatabasePropertyType, DatabasePropertyConversionRule>>
  >
> = Object.freeze(
  Object.fromEntries(
    DATABASE_PROPERTY_TYPES.map((from) => [
      from,
      Object.freeze(
        Object.fromEntries(
          DATABASE_PROPERTY_TYPES.map((to) => [to, Object.freeze(conversionRule(from, to))]),
        ),
      ),
    ]),
  ) as Record<DatabasePropertyType, Record<DatabasePropertyType, DatabasePropertyConversionRule>>,
);

export function databasePropertyConversionRule(
  from: DatabasePropertyType,
  to: DatabasePropertyType,
): DatabasePropertyConversionRule {
  return DATABASE_PROPERTY_CONVERSION_MATRIX[from][to];
}

function optionKey(property: DatabaseProperty, value: string): string | null {
  if (
    property.type !== 'select' &&
    property.type !== 'status' &&
    property.type !== 'multi_select'
  ) {
    return null;
  }
  return property.options.find((option) => option.id === value)?.key ?? null;
}

function targetOptionId(property: DatabaseProperty, value: string): string | null {
  if (
    property.type !== 'select' &&
    property.type !== 'status' &&
    property.type !== 'multi_select'
  ) {
    return null;
  }
  const candidates = property.options.filter(
    (option) => option.id === value || option.key === value || option.name === value,
  );
  return candidates.length === 1 && candidates[0]?.archived !== true
    ? (candidates[0]?.id ?? null)
    : null;
}

function convertOption(source: DatabaseProperty, target: DatabaseProperty, value: string): string {
  const key = optionKey(source, value) ?? value;
  const converted = targetOptionId(target, key);
  if (!converted)
    throw new Error(`Target option vocabulary has no unambiguous active key "${key}"`);
  return converted;
}

function convertValue(source: DatabaseProperty, target: DatabaseProperty, value: unknown): unknown {
  if (source.type === target.type) return structuredClone(value);
  if (target.type === 'text') {
    if (typeof value === 'string') {
      if (OPTION_TYPES.has(source.type)) return optionKey(source, value) ?? value;
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (source.type === 'date') return serializeDatabaseDateValue(value as never);
    return JSON.stringify(value);
  }
  if (source.type === 'text' && typeof value === 'string') {
    const trimmed = value.trim();
    if (target.type === 'title') {
      if (trimmed === '') throw new Error('Title cannot be empty');
      return value;
    }
    if (target.type === 'url') {
      if (!isValidDatabaseUrl(value)) throw new Error('Value is not an HTTP(S) URL');
      return value;
    }
    if (target.type === 'email') {
      if (!isValidDatabaseEmail(value)) throw new Error('Value is not an email address');
      return value;
    }
    if (target.type === 'phone') {
      if (!isValidDatabasePhone(value)) throw new Error('Value is not a dialable phone number');
      return value;
    }
    if (target.type === 'number') {
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
        throw new Error('Value is not a canonical number');
      }
      const number = Number(trimmed);
      if (!Number.isFinite(number)) throw new Error('Value is not a finite number');
      return number;
    }
    if (target.type === 'checkbox') {
      if (trimmed === 'true') return true;
      if (trimmed === 'false') return false;
      throw new Error('Checkbox text must be exactly true or false');
    }
    if (target.type === 'date') return parseSerializedDatabaseDateValue(trimmed);
    if (target.type === 'place') return canonicalizeDatabasePlaceValue(JSON.parse(value));
    if (target.type === 'files') return DatabaseFilesValueSchema.parse(JSON.parse(value));
  }
  if (source.type === 'checkbox' && target.type === 'number') return value === true ? 1 : 0;
  if (source.type === 'number' && target.type === 'checkbox') {
    if (value === 0) return false;
    if (value === 1) return true;
    throw new Error('Only 0 and 1 can become Checkbox values');
  }
  if (OPTION_TYPES.has(source.type) && OPTION_TYPES.has(target.type) && typeof value === 'string') {
    return convertOption(source, target, value);
  }
  if (
    OPTION_TYPES.has(source.type) &&
    target.type === 'multi_select' &&
    typeof value === 'string'
  ) {
    return [convertOption(source, target, value)];
  }
  if (source.type === 'multi_select' && OPTION_TYPES.has(target.type) && Array.isArray(value)) {
    if (value.length > 1)
      throw new Error('Multiple options cannot become one option without data loss');
    if (value.length === 0) return undefined;
    return convertOption(source, target, String(value[0]));
  }
  throw new Error('No deterministic direct conversion is defined');
}

export interface DatabasePropertyConversionRecordInput {
  id: string;
  revision: string;
  value: unknown;
}

export interface DatabasePropertyConversionChange {
  recordId: string;
  expectedRevision: string;
  outcome: 'empty' | 'converted' | 'lossy' | 'blocked';
  before: unknown;
  after?: unknown;
  reason?: string;
}

export interface DatabasePropertyConversionPreview {
  rule: DatabasePropertyConversionRule;
  committable: boolean;
  requiresLossyApproval: boolean;
  summary: { total: number; empty: number; converted: number; lossy: number; blocked: number };
  changes: readonly DatabasePropertyConversionChange[];
  rollbackValues: Readonly<Record<string, unknown>>;
}

export function previewDatabasePropertyConversion(input: {
  sourceProperty: DatabaseProperty;
  targetProperty: DatabaseProperty;
  records: readonly DatabasePropertyConversionRecordInput[];
  maxRecords?: number;
  allowLossy?: boolean;
}): DatabasePropertyConversionPreview {
  const maxRecords = input.maxRecords ?? 10_000;
  if (input.records.length > maxRecords)
    throw new Error(`Conversion preview exceeds ${maxRecords} records`);
  if (input.sourceProperty.id !== input.targetProperty.id) {
    throw new Error('Property conversion must preserve the stable property ID');
  }
  if (new Set(input.records.map((record) => record.id)).size !== input.records.length) {
    throw new Error('Conversion preview record IDs must be unique');
  }
  const rule = databasePropertyConversionRule(input.sourceProperty.type, input.targetProperty.type);
  const changes = input.records.map((record): DatabasePropertyConversionChange => {
    const before = structuredClone(record.value);
    if (record.value === undefined || record.value === null || record.value === '') {
      return { recordId: record.id, expectedRevision: record.revision, outcome: 'empty', before };
    }
    if (rule.kind === 'blocked') {
      return {
        recordId: record.id,
        expectedRevision: record.revision,
        outcome: 'blocked',
        before,
        reason: rule.reason,
      };
    }
    try {
      const after = convertValue(input.sourceProperty, input.targetProperty, record.value);
      const constraint =
        after === undefined
          ? null
          : validateDatabasePropertyConstraints(input.targetProperty, after);
      if (constraint) throw new Error(constraint);
      return {
        recordId: record.id,
        expectedRevision: record.revision,
        outcome: rule.kind === 'lossy' ? 'lossy' : 'converted',
        before,
        ...(after === undefined ? {} : { after }),
        ...(rule.kind === 'lossy' ? { reason: rule.reason } : {}),
      };
    } catch (error) {
      return {
        recordId: record.id,
        expectedRevision: record.revision,
        outcome: 'blocked',
        before,
        reason: error instanceof Error ? error.message : 'Value conversion failed',
      };
    }
  });
  const summary = {
    total: changes.length,
    empty: changes.filter((change) => change.outcome === 'empty').length,
    converted: changes.filter((change) => change.outcome === 'converted').length,
    lossy: changes.filter((change) => change.outcome === 'lossy').length,
    blocked: changes.filter((change) => change.outcome === 'blocked').length,
  };
  return {
    rule,
    committable: summary.blocked === 0 && (summary.lossy === 0 || input.allowLossy === true),
    requiresLossyApproval: summary.lossy > 0 && input.allowLossy !== true,
    summary,
    changes,
    rollbackValues: Object.freeze(
      Object.fromEntries(
        changes.map((change) => [change.recordId, structuredClone(change.before)]),
      ),
    ),
  };
}
