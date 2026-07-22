import { z } from 'zod';
import { isSafeDatabaseAssetPath, isSafeDatabaseExternalFileUrl } from './files.ts';
import { type DatabasePerson, findDatabasePersonByReference } from './person.ts';
import { type DatabaseQuery, DatabaseQuerySchema } from './query.ts';
import type {
  DatabaseFilter,
  DatabaseFilterValue,
  DatabaseProperty,
  DatabaseQueryOperator,
  DatabaseSource,
} from './schema.ts';

export const DatabaseFindInputSchema = z
  .object({
    text: z.string().trim().min(1).max(2_000),
    limit: z.number().int().min(1).max(500).default(25),
  })
  .strict();

export type DatabaseFindInput = z.infer<typeof DatabaseFindInputSchema>;

export type DatabaseFindWarningCode =
  | 'ambiguous_property'
  | 'invalid_property_value'
  | 'unsupported_property_operator'
  | 'free_text_unsearchable';

export interface DatabaseFindWarning {
  code: DatabaseFindWarningCode;
  message: string;
  phrase?: string;
  candidates?: readonly { id: string; key: string; name: string }[];
}

export interface DatabaseFindInterpretation {
  filters: readonly {
    phrase: string;
    propertyId: string;
    operator: DatabaseQueryOperator;
    value?: DatabaseFilterValue;
  }[];
  freeText: null | { text: string; searchedPropertyIds: readonly string[] };
  sorts: DatabaseQuery['sort'];
  limit: number;
  confidence: 'high' | 'medium' | 'low';
  warnings: readonly DatabaseFindWarning[];
  requiresResolution: boolean;
}

export interface DatabaseFindPlan {
  input: DatabaseFindInput;
  query: DatabaseQuery | null;
  interpretation: DatabaseFindInterpretation;
}

const OPERATOR_PATTERNS: readonly {
  pattern: string;
  operator: DatabaseQueryOperator;
}[] = [
  { pattern: 'is\\s+not|does\\s+not\\s+equal|!=|아님', operator: 'neq' },
  { pattern: 'at\\s+least|>=|이상', operator: 'gte' },
  { pattern: 'at\\s+most|<=|이하', operator: 'lte' },
  { pattern: 'greater\\s+than|more\\s+than|>|초과', operator: 'gt' },
  { pattern: 'less\\s+than|<|미만', operator: 'lt' },
  { pattern: 'contains?|includes?|포함', operator: 'contains' },
  { pattern: 'after|이후', operator: 'gt' },
  { pattern: 'before|이전', operator: 'lt' },
  { pattern: 'is|equals?|=|같음', operator: 'eq' },
];

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function propertyLabels(property: DatabaseProperty): readonly string[] {
  return [property.key, property.name, ...property.aliases];
}

function candidate(property: DatabaseProperty): { id: string; key: string; name: string } {
  return { id: property.id, key: property.key, name: property.name };
}

function canonicalValue(
  property: DatabaseProperty,
  operator: DatabaseQueryOperator,
  raw: string,
  people: readonly DatabasePerson[],
): { ok: true; value: DatabaseFilterValue } | { ok: false; reason: string } {
  const value = raw
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim();
  if (operator === 'is_empty' || operator === 'is_not_empty') {
    return { ok: false, reason: 'empty operators do not accept a value' };
  }
  switch (property.type) {
    case 'number': {
      const parsed = Number(value.replaceAll(',', ''));
      return Number.isFinite(parsed)
        ? { ok: true, value: parsed }
        : { ok: false, reason: 'expected a finite number' };
    }
    case 'checkbox': {
      const truthy = ['true', 'yes', 'checked', '참', '예'];
      const falsy = ['false', 'no', 'unchecked', '거짓', '아니오'];
      const lowered = normalized(value);
      if (truthy.includes(lowered)) return { ok: true, value: true };
      if (falsy.includes(lowered)) return { ok: true, value: false };
      return { ok: false, reason: 'expected true/false or yes/no' };
    }
    case 'select':
    case 'status':
    case 'multi_select': {
      const option = property.options.find(
        (entry) =>
          normalized(entry.key) === normalized(value) ||
          normalized(entry.name) === normalized(value),
      );
      return option
        ? { ok: true, value: option.id }
        : { ok: false, reason: `unknown option "${value}"` };
    }
    case 'person': {
      const person = findDatabasePersonByReference(people, value);
      return person
        ? {
            ok: true,
            value: operator === 'eq' || operator === 'neq' ? [person.id] : person.id,
          }
        : { ok: false, reason: `unknown or ambiguous person "${value}"` };
    }
    case 'files':
      return !isSafeDatabaseAssetPath(value) && !isSafeDatabaseExternalFileUrl(value)
        ? { ok: false, reason: 'expected a local asset path or external URL' }
        : {
            ok: true,
            value: operator === 'eq' || operator === 'neq' ? [value] : value,
          };
    case 'relation':
      return /^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)
        ? { ok: true, value }
        : { ok: false, reason: 'expected a stable record ID' };
    default:
      return value === ''
        ? { ok: false, reason: 'expected a non-empty value' }
        : { ok: true, value };
  }
}

function operatorAllowed(property: DatabaseProperty, operator: DatabaseQueryOperator): boolean {
  if (operator === 'contains') {
    return [
      'title',
      'text',
      'url',
      'email',
      'phone',
      'multi_select',
      'person',
      'files',
      'relation',
    ].includes(property.type);
  }
  if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
    return property.type === 'number' || property.type === 'date';
  }
  return ['eq', 'neq'].includes(operator);
}

function combine(filters: readonly DatabaseFilter[]): DatabaseFilter | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return { and: [...filters] };
}

function extractLimit(text: string, fallback: number): { text: string; limit: number } {
  const patterns = [/\b(?:top|first|limit)\s+(\d{1,3})\b/i, /(?:상위|최대)\s*(\d{1,3})\s*개?/i];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    return {
      text: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`,
      limit: Math.min(500, Math.max(1, Number(match[1]))),
    };
  }
  return { text, limit: fallback };
}

function extractSort(
  source: DatabaseSource,
  text: string,
): { text: string; sorts: DatabaseQuery['sort']; warnings: DatabaseFindWarning[] } {
  const match = /(?:sort(?:ed)?|order)\s+by\s+(.+?)\s+(asc(?:ending)?|desc(?:ending)?)\b/i.exec(
    text,
  );
  if (!match) return { text, sorts: [], warnings: [] };
  const label = normalized(match[1] ?? '');
  const candidates = source.properties.filter((property) =>
    propertyLabels(property).some((value) => normalized(value) === label),
  );
  const remaining = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
  if (candidates.length !== 1) {
    return {
      text: remaining,
      sorts: [],
      warnings: [
        {
          code: 'ambiguous_property',
          message: `Sort property "${match[1]}" did not resolve to exactly one property`,
          phrase: match[0],
          candidates: candidates.map(candidate),
        },
      ],
    };
  }
  return {
    text: remaining,
    sorts: [
      {
        propertyId: candidates[0]?.id ?? '',
        direction: normalized(match[2] ?? '').startsWith('desc') ? 'desc' : 'asc',
      },
    ],
    warnings: [],
  };
}

/**
 * Compile a deliberately bounded natural-language request into an exact query.
 * Every inferred field/value remains visible in `interpretation`; ambiguity or
 * invalid coercion returns `query: null` instead of guessing.
 */
export function compileDatabaseFind(
  source: DatabaseSource,
  raw: unknown,
  people: readonly DatabasePerson[] = [],
): DatabaseFindPlan {
  const input = DatabaseFindInputSchema.parse(raw);
  const limited = extractLimit(input.text, input.limit);
  const sorted = extractSort(source, limited.text);
  let remaining = sorted.text;
  const warnings = [...sorted.warnings];
  const interpreted: DatabaseFindInterpretation['filters'][number][] = [];
  const filters: DatabaseFilter[] = [];

  const labelMap = new Map<string, DatabaseProperty[]>();
  for (const property of source.properties) {
    for (const label of propertyLabels(property)) {
      const key = normalized(label);
      const current = labelMap.get(key) ?? [];
      if (!current.some((candidate) => candidate.id === property.id)) {
        labelMap.set(key, [...current, property]);
      }
    }
  }
  const labels = [...labelMap.keys()].sort((left, right) => right.length - left.length);
  const operatorPattern = OPERATOR_PATTERNS.map((entry) => entry.pattern).join('|');
  const clause = new RegExp(
    `(?:^|\\b)(${labels.map(escapeRegex).join('|')})\\s*(${operatorPattern})\\s+((?:["'][^"']+["'])|[^,;]+?)(?=\\s+(?:and|그리고)\\s+|,|;|$)`,
    'giu',
  );
  const matches = [...remaining.matchAll(clause)];
  for (const match of matches) {
    const phrase = match[0].trim();
    const candidates = labelMap.get(normalized(match[1] ?? '')) ?? [];
    if (candidates.length !== 1) {
      warnings.push({
        code: 'ambiguous_property',
        message: `Property "${match[1]}" is ambiguous`,
        phrase,
        candidates: candidates.map(candidate),
      });
      continue;
    }
    const property = candidates[0];
    if (!property) continue;
    const operatorEntry = OPERATOR_PATTERNS.find((entry) =>
      new RegExp(`^(?:${entry.pattern})$`, 'iu').test(match[2] ?? ''),
    );
    if (!operatorEntry || !operatorAllowed(property, operatorEntry.operator)) {
      warnings.push({
        code: 'unsupported_property_operator',
        message: `Operator "${match[2]}" is not supported for ${property.type} property "${property.key}"`,
        phrase,
        candidates: [candidate(property)],
      });
      continue;
    }
    const converted = canonicalValue(property, operatorEntry.operator, match[3] ?? '', people);
    if (!converted.ok) {
      warnings.push({
        code: 'invalid_property_value',
        message: `Could not interpret value for "${property.key}": ${converted.reason}`,
        phrase,
        candidates: [candidate(property)],
      });
      continue;
    }
    const filter: DatabaseFilter = {
      propertyId: property.id,
      operator: operatorEntry.operator as 'eq',
      value: converted.value,
    };
    filters.push(filter);
    interpreted.push({
      phrase,
      propertyId: property.id,
      operator: operatorEntry.operator,
      value: converted.value,
    });
    remaining = remaining.replace(match[0], ' ');
  }

  const freeText = remaining
    .replace(/\b(?:find|show|list|records?|where|with|please|that|are|and)\b/giu, ' ')
    .replace(/(?:찾아줘|보여줘|목록|레코드|그리고)/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const searchable = source.properties.filter((property) =>
    ['title', 'text', 'url', 'email', 'phone'].includes(property.type),
  );
  let freeTextInterpretation: DatabaseFindInterpretation['freeText'] = null;
  if (freeText !== '') {
    if (searchable.length === 0) {
      warnings.push({
        code: 'free_text_unsearchable',
        message: `No text-searchable properties can match "${freeText}"`,
        phrase: freeText,
      });
    } else {
      const freeFilters: DatabaseFilter[] = searchable.map((property) => ({
        propertyId: property.id,
        operator: 'contains',
        value: freeText,
      }));
      filters.push(freeFilters.length === 1 ? freeFilters[0] : { or: freeFilters });
      freeTextInterpretation = {
        text: freeText,
        searchedPropertyIds: searchable.map((property) => property.id),
      };
    }
  }

  const requiresResolution = warnings.some((warning) => warning.code !== 'free_text_unsearchable');
  const where = combine(filters);
  const query = requiresResolution
    ? null
    : DatabaseQuerySchema.parse({
        ...(where ? { where } : {}),
        sort: sorted.sorts,
        page: { limit: limited.limit },
      });
  return {
    input: { ...input, limit: limited.limit },
    query,
    interpretation: {
      filters: interpreted,
      freeText: freeTextInterpretation,
      sorts: sorted.sorts,
      limit: limited.limit,
      confidence:
        warnings.length > 0 ? 'low' : interpreted.length > 0 ? 'high' : freeText ? 'medium' : 'low',
      warnings,
      requiresResolution,
    },
  };
}
