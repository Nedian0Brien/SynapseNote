import type {
  DatabaseCalculationFunction,
  DatabaseDateValue,
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseQueryResult,
  DatabaseValue,
  FormulaComputedResult,
  FormulaPersistedRuntimeValue,
  ProjectedDatabasePerson,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import {
  DatabaseDateValueSchema,
  DatabaseFilesValueSchema,
  DatabasePlaceValueSchema,
  databaseFileDisplayName,
  databaseFileIdentity,
  formatDatabaseDateValue,
  formatDatabaseNumber,
  formatDatabaseUniqueId,
  parseDatabaseRecordActorKey,
  serializeDatabaseDateValue,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseGhostState } from '@/lib/database-mutation-client';

export interface DatabaseCellRange {
  anchorRow: number;
  anchorColumn: number;
  focusRow: number;
  focusColumn: number;
}

export function normalizedCellRange(range: DatabaseCellRange) {
  return {
    rowStart: Math.min(range.anchorRow, range.focusRow),
    rowEnd: Math.max(range.anchorRow, range.focusRow),
    columnStart: Math.min(range.anchorColumn, range.focusColumn),
    columnEnd: Math.max(range.anchorColumn, range.focusColumn),
  };
}

export function cellIsInRange(
  range: DatabaseCellRange | null,
  row: number,
  column: number,
): boolean {
  if (!range) return false;
  const normalized = normalizedCellRange(range);
  return (
    row >= normalized.rowStart &&
    row <= normalized.rowEnd &&
    column >= normalized.columnStart &&
    column <= normalized.columnEnd
  );
}

export function databaseTableAggregate(
  calculationsByProperty: Record<string, DatabaseCalculationFunction>,
) {
  const calculations = Object.entries(calculationsByProperty)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 100)
    .map(([propertyId, calculation], index) => ({
      id: `table_calculation_${index}`,
      function: calculation,
      propertyId,
    }));
  return calculations.length > 0
    ? { groupBy: [], calculations, groupLimit: 100, membershipLimit: 100 }
    : undefined;
}

export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function displayValue(
  property: DatabaseProperty,
  value: unknown,
  people: readonly ProjectedDatabasePerson[] = [],
  relationRecords: readonly ProjectedDatabaseRelationRecord[] = [],
  personLabels: { agent: string; inactive: string } = {
    agent: 'agent',
    inactive: 'inactive',
  },
  fileStates: Readonly<Record<string, 'available' | 'missing'>> = {},
  missingFileLabel = 'missing',
  locale = 'en',
): string {
  if (value === undefined) return '—';
  if (
    property.type === 'date' ||
    property.type === 'created_time' ||
    property.type === 'last_edited_time'
  ) {
    const parsed = DatabaseDateValueSchema.safeParse(value);
    if (!parsed.success) return 'Invalid date';
    const formatted = formatDatabaseDateValue(parsed.data, {
      locale,
      timeZone:
        typeof Intl === 'undefined'
          ? 'UTC'
          : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      relative: property.semantics?.format?.style === 'relative',
    });
    const reminder = typeof parsed.data === 'string' ? undefined : parsed.data.reminder;
    return reminder
      ? `${formatted} · ${reminder.minutesBefore}m before ${reminder.anchor}`
      : formatted;
  }
  if (typeof value === 'boolean') return value ? '✓' : '—';
  if (
    (property.type === 'created_by' || property.type === 'last_edited_by') &&
    typeof value === 'string'
  ) {
    const actor = parseDatabaseRecordActorKey(value);
    return actor ? `${actor.kind} · ${actor.principal_id}` : value;
  }
  if (property.type === 'relation') {
    const ids = Array.isArray(value) ? value.map(String) : [String(value)];
    return ids
      .map((recordId) => {
        const record = relationRecords.find((candidate) => candidate.id === recordId);
        return record
          ? `${record.title}${record.archivedAt ? ' (archived)' : ''}`
          : `${recordId} (unavailable)`;
      })
      .join(', ');
  }
  if (Array.isArray(value)) {
    if (property.type === 'files') {
      const parsed = DatabaseFilesValueSchema.safeParse(value);
      return parsed.success
        ? parsed.data
            .map((file) => {
              const name = databaseFileDisplayName(file);
              const availability =
                file.kind === 'local' && fileStates[file.path] === 'missing'
                  ? ` (${missingFileLabel})`
                  : '';
              return `${name}${availability}${file.caption ? ` — ${file.caption}` : ''}`;
            })
            .join(', ')
        : 'Invalid files';
    }
    if (property.type === 'person') {
      return value
        .map((entry) => {
          const person = people.find((candidate) => candidate.id === String(entry));
          if (!person) return String(entry);
          return `${person.name}${
            person.kind === 'agent' ? ` (${personLabels.agent})` : ''
          }${person.active ? '' : ` (${personLabels.inactive})`}`;
        })
        .join(', ');
    }
    if (property.type === 'multi_select') {
      return value
        .map((entry) => {
          const key = String(entry);
          return property.options.find((option) => option.id === key)?.name ?? key;
        })
        .join(', ');
    }
    return value.map(String).join(', ');
  }
  if (property.type === 'select' || property.type === 'status') {
    const option = property.options.find((candidate) => candidate.id === value);
    return option
      ? `${option.name}${option.archived === true ? ' (archived)' : ''}`
      : String(value);
  }
  if (property.type === 'number' && typeof value === 'number') {
    return formatDatabaseNumber(value, property, locale);
  }
  if (property.type === 'unique_id' && typeof value === 'number') {
    return formatDatabaseUniqueId(property.prefix, value);
  }
  if (property.type === 'place' && value && typeof value === 'object' && !Array.isArray(value)) {
    const place = value as {
      label?: string;
      address?: string;
      lat?: number;
      lon?: number;
    };
    return place.label || place.address || `${String(place.lat)}, ${String(place.lon)}`;
  }
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

export function displayComputedRuntimeValue(value: FormulaPersistedRuntimeValue): string {
  if (value === null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(displayComputedRuntimeValue).join(', ');
  if (value.kind === 'date') {
    return formatDatabaseDateValue(value.value, {
      locale: typeof navigator === 'undefined' ? 'en' : navigator.language,
      timeZone:
        typeof Intl === 'undefined'
          ? 'UTC'
          : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
  }
  if (value.kind === 'person') return value.name ?? value.id;
  return value.title ?? value.id;
}

export function databasePlaceMapHref(value: unknown): string | null {
  const place = DatabasePlaceValueSchema.safeParse(value);
  if (!place.success) return null;
  const zoom = place.data.precision === 'approximate' ? 10 : 16;
  const lat = encodeURIComponent(String(place.data.lat));
  const lon = encodeURIComponent(String(place.data.lon));
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

export function displayComputedResult(result: FormulaComputedResult): string {
  return result.kind === 'error'
    ? `Error (${result.problem.code}): ${result.problem.message}`
    : displayComputedRuntimeValue(result.value);
}

export function databaseLinkHref(property: DatabaseProperty, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (property.type === 'url') return value;
  if (property.type === 'email') return `mailto:${value}`;
  if (property.type === 'phone') return `tel:${value.replace(/[^+\d]/g, '')}`;
  return null;
}

const DATABASE_INLINE_LIST_COLORS = {
  gray: 'bg-gray-500/15 text-foreground dark:bg-gray-400/15',
  brown: 'bg-amber-900/15 text-foreground dark:bg-amber-700/20',
  orange: 'bg-orange-500/15 text-foreground dark:bg-orange-400/20',
  yellow: 'bg-yellow-400/20 text-foreground dark:bg-yellow-300/15',
  green: 'bg-green-500/15 text-foreground dark:bg-green-400/20',
  blue: 'bg-blue-500/15 text-foreground dark:bg-blue-400/20',
  purple: 'bg-purple-500/15 text-foreground dark:bg-purple-400/20',
  pink: 'bg-pink-500/15 text-foreground dark:bg-pink-400/20',
  red: 'bg-red-500/15 text-foreground dark:bg-red-400/20',
} as const;

export function databaseInlineOptionColorClass(color?: string): string {
  if (color && color in DATABASE_INLINE_LIST_COLORS) {
    return DATABASE_INLINE_LIST_COLORS[color as keyof typeof DATABASE_INLINE_LIST_COLORS];
  }
  return 'bg-muted/70 text-muted-foreground dark:bg-muted/50';
}

export function databaseInlineRelationValues(
  value: unknown,
  relationRecords: readonly ProjectedDatabaseRelationRecord[],
): readonly { id: string; label: string; available: boolean }[] {
  if (value === undefined || value === null || value === '') return [];
  const ids = Array.isArray(value) ? value.map(String) : [String(value)];
  return ids.map((id) => {
    const record = relationRecords.find((candidate) => candidate.id === id);
    return {
      id,
      label: record
        ? `${record.title}${record.archivedAt ? ' (archived)' : ''}`
        : `${id} (unavailable)`,
      available: record !== undefined,
    };
  });
}

export function databaseInlinePersonValues(
  value: unknown,
  people: readonly ProjectedDatabasePerson[],
  personLabels: { agent: string; inactive: string },
): readonly { id: string; label: string; available: boolean }[] {
  if (value === undefined || value === null || value === '') return [];
  const ids = Array.isArray(value) ? value.map(String) : [String(value)];
  return ids.map((id) => {
    const person = people.find((candidate) => candidate.id === id);
    return {
      id,
      label: person
        ? `${person.name}${person.kind === 'agent' ? ` (${personLabels.agent})` : ''}${person.active ? '' : ` (${personLabels.inactive})`}`
        : `${id} (unavailable)`,
      available: person !== undefined,
    };
  });
}

export function databaseInlineFileValues(
  value: unknown,
  fileStates: Readonly<Record<string, 'available' | 'missing'>> = {},
  missingFileLabel: string,
): readonly { id: string; label: string; available: boolean }[] {
  const parsed = DatabaseFilesValueSchema.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((file) => {
    const identity = databaseFileIdentity(file);
    const missing = file.kind === 'local' && fileStates[file.path] === 'missing';
    return {
      id: identity,
      label: `${databaseFileDisplayName(file)}${missing ? ` (${missingFileLabel})` : ''}${file.caption ? ` — ${file.caption}` : ''}`,
      available: !missing,
    };
  });
}

export function sourceProperties(source: {
  properties: readonly DatabaseProperty[];
}): DatabaseProperty[] {
  return [...source.properties].sort((left, right) => {
    if (left.type === 'title') return -1;
    if (right.type === 'title') return 1;
    return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });
}

export function projectedGhostValues(
  values: Readonly<Record<string, unknown>>,
): Record<string, DatabaseValue> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, DatabaseValue] => {
      const value = entry[1];
      return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (Array.isArray(value) && value.every((item) => typeof item === 'string')) ||
        DatabaseFilesValueSchema.safeParse(value).success ||
        DatabasePlaceValueSchema.safeParse(value).success ||
        DatabaseDateValueSchema.safeParse(value).success
      );
    }),
  );
}

export function multiSelectDraftValues(draft: string): string[] {
  try {
    const value: unknown = JSON.parse(draft);
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
  } catch {
    return [];
  }
}

export function initialCellDraft(property: DatabaseProperty, value?: DatabaseValue): string {
  if (property.type === 'date' && value !== undefined) {
    return serializeDatabaseDateValue(value as DatabaseDateValue);
  }
  if (
    property.type === 'multi_select' ||
    property.type === 'person' ||
    property.type === 'files' ||
    (property.type === 'relation' && property.cardinality === 'many')
  ) {
    return JSON.stringify(Array.isArray(value) ? value : []);
  }
  if (property.type === 'checkbox') return String(typeof value === 'boolean' ? value : false);
  if (property.type === 'place') {
    return JSON.stringify(
      value ?? {
        label: '',
        address: '',
        lat: 0,
        lon: 0,
        precision: 'exact',
        source: 'manual',
      },
    );
  }
  if (property.type === 'select' || property.type === 'status') {
    return typeof value === 'string' ? value : '';
  }
  return value === undefined ? '' : String(value);
}

export function invalidExternalValueText(value: unknown): string {
  if (typeof value === 'string') return value;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

export function databasePlanHumanSummary(diff: DatabaseGhostState['diff']): string {
  const counts = new Map<DatabaseGhostState['diff']['records'][number]['action'], number>();
  for (const record of diff.records) {
    counts.set(record.action, (counts.get(record.action) ?? 0) + 1);
  }
  const labels: Record<DatabaseGhostState['diff']['records'][number]['action'], string> = {
    create: 'Create',
    update: 'Update',
    delete: 'Delete',
    move: 'Move',
  };
  const recordSummary = [...counts.entries()].map(
    ([action, count]) => `${labels[action]} ${count} record${count === 1 ? '' : 's'}`,
  );
  const fileSummary = [
    diff.manifests.length > 0
      ? `${diff.manifests[0]?.action === 'create' ? 'Create' : diff.manifests[0]?.action === 'delete' ? 'Delete' : 'Update'} ${diff.manifests.length} database manifest${diff.manifests.length === 1 ? '' : 's'}`
      : null,
    diff.templates.length > 0
      ? `${diff.templates.length} template${diff.templates.length === 1 ? '' : 's'}`
      : null,
  ].filter((value): value is string => value !== null);
  const scopedSummary = [
    recordSummary.length > 0 ? `Data: ${recordSummary.join(' · ')}` : null,
    fileSummary.length > 0 ? `Schema: ${fileSummary.join(' · ')}` : null,
  ].filter((value): value is string => value !== null);
  return scopedSummary.join(' · ') || 'No canonical file changes';
}

export function databaseCreationPreviewValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.map(databaseCreationPreviewValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const DATABASE_CONDITIONAL_COLOR_CLASSES: Record<
  NonNullable<DatabaseQueryResult['conditionalColors']>['rules'][number]['color'],
  string
> = {
  gray: 'bg-gray-500/15 dark:bg-gray-400/15',
  brown: 'bg-amber-900/15 dark:bg-amber-700/20',
  orange: 'bg-orange-500/15 dark:bg-orange-400/15',
  yellow: 'bg-yellow-400/20 dark:bg-yellow-300/15',
  green: 'bg-green-500/15 dark:bg-green-400/15',
  blue: 'bg-blue-500/15 dark:bg-blue-400/15',
  purple: 'bg-purple-500/15 dark:bg-purple-400/15',
  pink: 'bg-pink-500/15 dark:bg-pink-400/15',
  red: 'bg-red-500/15 dark:bg-red-400/15',
};

export type { DatabasePropertyType };
