import { DOCUMENT_OPEN_BYTE_LIMIT } from '../constants/document-open.ts';
import { stripFrontmatter, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import type { FrontmatterValue } from '../frontmatter/schema.ts';
import { parseFrontmatterYaml } from '../frontmatter/yaml-codec.ts';
import {
  canonicalizeDatabaseDateValue,
  type DatabaseDateRangeValue,
  DatabaseDateValueSchema,
} from './date.ts';
import { DatabaseFilesValueSchema, type DatabaseFileValue } from './files.ts';
import type { FormulaComputedResult } from './formula-result.ts';
import { findDatabasePersonByReference } from './person.ts';
import {
  canonicalizeDatabasePlaceValue,
  type DatabasePlaceValue,
  DatabasePlaceValueSchema,
} from './place.ts';
import { DATABASE_RECORD_FRONTMATTER_BYTE_LIMIT } from './record-identity.ts';
import {
  type DatabaseDefinition,
  type DatabaseProperty,
  type DatabaseRecordActor,
  type DatabaseRecordId,
  DatabaseRecordIdSchema,
  type DatabaseRecordPageLayoutOverride,
  type DatabaseSource,
  databaseRecordActorKey,
  databaseRecordPageLayoutOverrideIssues,
  isValidDatabaseEmail,
  isValidDatabasePhone,
  isValidDatabaseUrl,
  StoredDatabaseRecordMetadataSchema,
  validateDatabasePropertyConstraints,
} from './schema.ts';
import { type DatabaseVerificationValue, DatabaseVerificationValueSchema } from './verification.ts';

export type DatabaseValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[]
  | DatabaseFileValue[]
  | DatabasePlaceValue
  | DatabaseDateRangeValue
  | DatabaseVerificationValue;

export interface DatabaseRecord {
  id: DatabaseRecordId;
  databaseId: string;
  sourceId: string;
  path: string;
  revision: string | null;
  /** Semantic revision of body and non-Verification values; stable across badge-only changes. */
  evidenceRevision?: string | null;
  values: Record<string, DatabaseValue>;
  /** Raw canonical frontmatter values that failed typed projection. */
  invalidValues?: Record<string, FrontmatterValue>;
  /** Property-local diagnostics retained with invalidValues for repair/UI. */
  issues?: DatabaseRecordIssue[];
  /** Rebuildable Formula/Rollup results. Never serialized into record frontmatter. */
  computedResults?: Record<string, FormulaComputedResult>;
  body: string;
  archivedAt?: string | null;
  pageLayoutOverride?: DatabaseRecordPageLayoutOverride;
}

export type DatabaseRecordIssueCode =
  | 'missing_required_value'
  | 'invalid_property_value'
  | 'unknown_select_option'
  | 'unknown_person'
  | 'duplicate_array_value'
  | 'missing_unique_id';

export interface DatabaseRecordIssue {
  code: DatabaseRecordIssueCode;
  propertyId: string;
  propertyKey: string;
  message: string;
}

export type MaterializeDatabaseRecordResult =
  | { ok: true; record: DatabaseRecord }
  | {
      ok: false;
      code:
        | 'unknown_source'
        | 'invalid_path'
        | 'outside_source'
        | 'missing_frontmatter'
        | 'document_too_large'
        | 'frontmatter_too_large'
        | 'malformed_frontmatter'
        | 'missing_record_metadata'
        | 'database_mismatch'
        | 'source_mismatch'
        | 'invalid_record';
      message: string;
      issues?: DatabaseRecordIssue[];
    };

export interface MaterializeDatabaseRecordInput {
  definition: DatabaseDefinition;
  sourceId: string;
  path: string;
  markdown: string;
  revision?: string;
  /** Filesystem creation time used only when legacy metadata has no created_at. */
  fileCreatedAt?: string;
  /** Filesystem mtime used to observe edits made outside SynapseNote. */
  fileLastEditedAt?: string;
  /** Definite provenance supplied by a live filesystem/sync ingestion event. */
  fileLastEditedBy?: DatabaseRecordActor;
  /** Index/read surfaces may retain invalid property values without accepting them as typed. */
  preserveInvalidValues?: boolean;
}

function isSafeRecordPath(path: string): boolean {
  if (path === '' || path.includes('\0') || path.includes('\\')) return false;
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  if (!path.endsWith('.md') && !path.endsWith('.mdx')) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '..');
}

export function isRecordPathInSource(path: string, source: DatabaseSource): boolean {
  if (!isSafeRecordPath(path)) return false;
  const folder = source.folder === '.' ? '' : source.folder;
  const relative =
    folder === '' ? path : path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : '';
  if (relative === '') return false;
  return source.includeSubfolders || !relative.includes('/');
}

function invalidValue(property: DatabaseProperty, expected: string): DatabaseRecordIssue {
  return {
    code: 'invalid_property_value',
    propertyId: property.id,
    propertyKey: property.key,
    message: `Property "${property.key}" must be ${expected}`,
  };
}

function canonicalizePropertyValue(
  definition: DatabaseDefinition,
  property: DatabaseProperty,
  raw: FrontmatterValue,
): { ok: true; value: DatabaseValue } | { ok: false; issue: DatabaseRecordIssue } {
  switch (property.type) {
    case 'title':
    case 'text':
      return typeof raw === 'string'
        ? { ok: true, value: raw }
        : { ok: false, issue: invalidValue(property, 'a string') };
    case 'url': {
      return isValidDatabaseUrl(raw)
        ? { ok: true, value: raw }
        : { ok: false, issue: invalidValue(property, 'an HTTP or HTTPS URL string') };
    }
    case 'email': {
      return isValidDatabaseEmail(raw)
        ? { ok: true, value: raw }
        : { ok: false, issue: invalidValue(property, 'an email address string') };
    }
    case 'phone': {
      return isValidDatabasePhone(raw)
        ? { ok: true, value: raw }
        : { ok: false, issue: invalidValue(property, 'a dialable phone number string') };
    }
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw)
        ? { ok: true, value: raw }
        : { ok: false, issue: invalidValue(property, 'a finite number') };
    case 'checkbox':
      return typeof raw === 'boolean'
        ? { ok: true, value: raw }
        : { ok: false, issue: invalidValue(property, 'a boolean') };
    case 'date': {
      const parsed = DatabaseDateValueSchema.safeParse(raw);
      return parsed.success
        ? { ok: true, value: canonicalizeDatabaseDateValue(parsed.data) }
        : {
            ok: false,
            issue: invalidValue(
              property,
              'an ISO 8601 date/timestamp or canonical date range object',
            ),
          };
    }
    case 'verification': {
      const parsed = DatabaseVerificationValueSchema.safeParse(raw);
      return parsed.success
        ? { ok: true, value: parsed.data }
        : {
            ok: false,
            issue: invalidValue(property, 'governed verification metadata'),
          };
    }
    case 'select':
    case 'status': {
      if (typeof raw !== 'string') {
        return { ok: false, issue: invalidValue(property, 'an option key') };
      }
      const option = property.options.find((candidate) => candidate.key === raw);
      if (!option) {
        return {
          ok: false,
          issue: {
            code: 'unknown_select_option',
            propertyId: property.id,
            propertyKey: property.key,
            message: `Property "${property.key}" has no option with key "${raw}"`,
          },
        };
      }
      return { ok: true, value: option.id };
    }
    case 'multi_select': {
      if (!Array.isArray(raw) || raw.some((value) => typeof value !== 'string')) {
        return { ok: false, issue: invalidValue(property, 'an array of select option keys') };
      }
      const canonical: string[] = [];
      for (const key of raw) {
        const option = property.options.find((candidate) => candidate.key === key);
        if (!option) {
          return {
            ok: false,
            issue: {
              code: 'unknown_select_option',
              propertyId: property.id,
              propertyKey: property.key,
              message: `Property "${property.key}" has no option with key "${key}"`,
            },
          };
        }
        if (canonical.includes(option.id)) {
          return {
            ok: false,
            issue: {
              code: 'duplicate_array_value',
              propertyId: property.id,
              propertyKey: property.key,
              message: `Property "${property.key}" repeats option "${key}"`,
            },
          };
        }
        canonical.push(option.id);
      }
      return { ok: true, value: canonical };
    }
    case 'person': {
      if (!Array.isArray(raw) || raw.some((value) => typeof value !== 'string')) {
        return { ok: false, issue: invalidValue(property, 'an array of person keys') };
      }
      if (!property.multiple && raw.length > 1) {
        return { ok: false, issue: invalidValue(property, 'at most one person key') };
      }
      const canonical: string[] = [];
      for (const reference of raw) {
        const person = findDatabasePersonByReference(definition.people, reference);
        if (!person) {
          return {
            ok: false,
            issue: {
              code: 'unknown_person',
              propertyId: property.id,
              propertyKey: property.key,
              message: `Property "${property.key}" has no unambiguous person matching "${reference}"`,
            },
          };
        }
        if (canonical.includes(person.id)) {
          return {
            ok: false,
            issue: {
              code: 'duplicate_array_value',
              propertyId: property.id,
              propertyKey: property.key,
              message: `Property "${property.key}" repeats person "${reference}"`,
            },
          };
        }
        canonical.push(person.id);
      }
      return { ok: true, value: canonical };
    }
    case 'files': {
      const parsed = DatabaseFilesValueSchema.safeParse(raw);
      return parsed.success
        ? { ok: true, value: parsed.data }
        : {
            ok: false,
            issue: invalidValue(
              property,
              'an ordered list of unique local asset or external URL objects',
            ),
          };
    }
    case 'place': {
      const parsed = DatabasePlaceValueSchema.safeParse(raw);
      return parsed.success
        ? { ok: true, value: canonicalizeDatabasePlaceValue(parsed.data) }
        : {
            ok: false,
            issue: invalidValue(
              property,
              'a canonical place with label or address, coordinates, precision, and source',
            ),
          };
    }
    case 'relation': {
      if (property.cardinality === 'one') {
        return typeof raw === 'string' && DatabaseRecordIdSchema.safeParse(raw).success
          ? { ok: true, value: raw }
          : { ok: false, issue: invalidValue(property, 'one record ID') };
      }
      if (
        !Array.isArray(raw) ||
        raw.some(
          (value) => typeof value !== 'string' || !DatabaseRecordIdSchema.safeParse(value).success,
        )
      ) {
        return { ok: false, issue: invalidValue(property, 'an array of record IDs') };
      }
      const relationIds = raw as string[];
      if (property.required && relationIds.length === 0) {
        return { ok: false, issue: invalidValue(property, 'at least one record ID') };
      }
      if (new Set(relationIds).size !== relationIds.length) {
        return {
          ok: false,
          issue: {
            code: 'duplicate_array_value',
            propertyId: property.id,
            propertyKey: property.key,
            message: `Property "${property.key}" repeats a related record ID`,
          },
        };
      }
      return { ok: true, value: relationIds };
    }
    case 'unique_id':
      return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 1
        ? { ok: true, value: raw }
        : { ok: false, issue: invalidValue(property, 'a positive safe integer') };
    case 'formula':
    case 'rollup':
    case 'created_time':
    case 'last_edited_time':
    case 'created_by':
    case 'last_edited_by':
    case 'button':
      return {
        ok: false,
        issue: invalidValue(property, 'omitted because derived properties are read-only'),
      };
  }
}

/**
 * Materialize one Markdown file into a typed record keyed by stable property
 * IDs. Unrelated frontmatter is intentionally ignored.
 */
export function materializeDatabaseRecord(
  input: MaterializeDatabaseRecordInput,
): MaterializeDatabaseRecordResult {
  const source = input.definition.sources.find((candidate) => candidate.id === input.sourceId);
  if (!source) {
    return {
      ok: false,
      code: 'unknown_source',
      message: `Data source "${input.sourceId}" is not defined by database "${input.definition.id}"`,
    };
  }
  if (!isSafeRecordPath(input.path)) {
    return {
      ok: false,
      code: 'invalid_path',
      message: `Record path "${input.path}" is not a safe Markdown path`,
    };
  }
  if (!isRecordPathInSource(input.path, source)) {
    return {
      ok: false,
      code: 'outside_source',
      message: `Record path "${input.path}" is outside source folder "${source.folder}"`,
    };
  }

  const markdownBytes = new TextEncoder().encode(input.markdown).byteLength;
  if (markdownBytes > DOCUMENT_OPEN_BYTE_LIMIT) {
    return {
      ok: false,
      code: 'document_too_large',
      message: `Record "${input.path}" is ${markdownBytes} bytes; SynapseNote database pages must stay within the ${DOCUMENT_OPEN_BYTE_LIMIT}-byte document-open limit. Move large content to linked documents or Files, then retry.`,
    };
  }
  const { frontmatter, body } = stripFrontmatter(input.markdown);
  if (frontmatter === '') {
    return {
      ok: false,
      code: 'missing_frontmatter',
      message: `Record "${input.path}" has no frontmatter`,
    };
  }
  const frontmatterBytes = new TextEncoder().encode(frontmatter).byteLength;
  if (frontmatterBytes > DATABASE_RECORD_FRONTMATTER_BYTE_LIMIT) {
    return {
      ok: false,
      code: 'frontmatter_too_large',
      message: `Record "${input.path}" frontmatter is ${frontmatterBytes} bytes; database properties must stay within ${DATABASE_RECORD_FRONTMATTER_BYTE_LIMIT} bytes. Move large text to the Markdown body, linked records, or Files, then retry.`,
    };
  }

  const parsedFrontmatter = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter));
  if (parsedFrontmatter.map === null) {
    return {
      ok: false,
      code: 'malformed_frontmatter',
      message: `Record "${input.path}" has malformed frontmatter: ${parsedFrontmatter.parseError}`,
    };
  }

  const metadata = StoredDatabaseRecordMetadataSchema.safeParse(parsedFrontmatter.map._sn);
  if (!metadata.success) {
    return {
      ok: false,
      code: 'missing_record_metadata',
      message: `Record "${input.path}" must define valid _sn database_id, source_id, and record_id values`,
    };
  }
  if (metadata.data.database_id !== input.definition.id) {
    return {
      ok: false,
      code: 'database_mismatch',
      message: `Record "${input.path}" belongs to database "${metadata.data.database_id}", not "${input.definition.id}"`,
    };
  }
  if (metadata.data.source_id !== source.id) {
    return {
      ok: false,
      code: 'source_mismatch',
      message: `Record "${input.path}" belongs to source "${metadata.data.source_id}", not "${source.id}"`,
    };
  }
  if (metadata.data.page_layout_override) {
    const layoutIssues = databaseRecordPageLayoutOverrideIssues(
      source,
      metadata.data.page_layout_override,
    );
    if (layoutIssues.length > 0) {
      return {
        ok: false,
        code: 'invalid_record',
        message: `Record "${input.path}" has an invalid page layout override: ${layoutIssues.join('; ')}`,
      };
    }
  }

  const values: Record<string, DatabaseValue> = {};
  const invalidValues: Record<string, FrontmatterValue> = {};
  const issues: DatabaseRecordIssue[] = [];
  for (const property of source.properties) {
    const raw = parsedFrontmatter.map[property.key];
    if (
      property.type === 'created_time' ||
      property.type === 'last_edited_time' ||
      property.type === 'created_by' ||
      property.type === 'last_edited_by' ||
      property.type === 'button'
    ) {
      if (raw !== undefined) {
        issues.push(
          invalidValue(property, 'omitted because derived metadata properties are read-only'),
        );
        invalidValues[property.id] = raw;
      }
      if (property.type === 'button') continue;
      if (property.type === 'created_time' || property.type === 'last_edited_time') {
        const timestamp =
          property.type === 'created_time'
            ? (metadata.data.created_at ?? input.fileCreatedAt)
            : latestTimestamp(metadata.data.last_edited_at, input.fileLastEditedAt);
        if (timestamp !== undefined) values[property.id] = timestamp;
      } else {
        const filesystemActor: DatabaseRecordActor = {
          kind: 'filesystem',
          principal_id: 'local',
        };
        const actor =
          property.type === 'created_by'
            ? (metadata.data.created_by ?? (input.fileCreatedAt ? filesystemActor : undefined))
            : (input.fileLastEditedBy ??
              (filesystemEditIsLater(metadata.data.last_edited_at, input.fileLastEditedAt)
                ? filesystemActor
                : metadata.data.last_edited_by) ??
              (input.fileLastEditedAt ? filesystemActor : undefined));
        if (actor !== undefined) values[property.id] = databaseRecordActorKey(actor);
      }
      continue;
    }
    if (raw === undefined) {
      if (property.type === 'unique_id') {
        issues.push({
          code: 'missing_unique_id',
          propertyId: property.id,
          propertyKey: property.key,
          message: `Record "${input.path}" is missing allocated Unique ID property "${property.key}"`,
        });
      } else if (property.required) {
        issues.push({
          code: 'missing_required_value',
          propertyId: property.id,
          propertyKey: property.key,
          message: `Record "${input.path}" is missing required property "${property.key}"`,
        });
      }
      continue;
    }
    const canonical = canonicalizePropertyValue(input.definition, property, raw);
    if (!canonical.ok) {
      issues.push(canonical.issue);
      invalidValues[property.id] = raw;
      continue;
    }
    if (
      (property.type === 'person' || property.type === 'files') &&
      property.required &&
      Array.isArray(canonical.value) &&
      canonical.value.length === 0
    ) {
      issues.push({
        code: 'missing_required_value',
        propertyId: property.id,
        propertyKey: property.key,
        message: `Record "${input.path}" requires at least one ${property.type === 'person' ? 'person' : 'file'} in "${property.key}"`,
      });
      invalidValues[property.id] = raw;
      continue;
    }
    const constraintIssue = validateDatabasePropertyConstraints(property, canonical.value);
    if (constraintIssue) {
      issues.push({
        code: 'invalid_property_value',
        propertyId: property.id,
        propertyKey: property.key,
        message: `Property "${property.key}" ${constraintIssue}`,
      });
      invalidValues[property.id] = raw;
      continue;
    }
    values[property.id] = canonical.value;
  }

  if (issues.length > 0 && !input.preserveInvalidValues) {
    return {
      ok: false,
      code: 'invalid_record',
      message: `Record "${input.path}" has ${issues.length} invalid database value${issues.length === 1 ? '' : 's'}`,
      issues,
    };
  }

  return {
    ok: true,
    record: {
      id: metadata.data.record_id,
      databaseId: input.definition.id,
      sourceId: source.id,
      path: input.path,
      revision: input.revision ?? null,
      values,
      ...(Object.keys(invalidValues).length > 0 ? { invalidValues } : {}),
      ...(issues.length > 0 ? { issues } : {}),
      body,
      archivedAt: metadata.data.archived_at ?? null,
      ...(metadata.data.page_layout_override
        ? { pageLayoutOverride: metadata.data.page_layout_override }
        : {}),
    },
  };
}

function latestTimestamp(
  embedded: string | undefined,
  filesystem: string | undefined,
): string | undefined {
  if (embedded === undefined) return filesystem;
  if (filesystem === undefined) return embedded;
  return Date.parse(filesystem) > Date.parse(embedded) ? filesystem : embedded;
}

function filesystemEditIsLater(
  embedded: string | undefined,
  filesystem: string | undefined,
): boolean {
  if (filesystem === undefined) return false;
  if (embedded === undefined) return true;
  return Date.parse(filesystem) > Date.parse(embedded) + 1_000;
}
