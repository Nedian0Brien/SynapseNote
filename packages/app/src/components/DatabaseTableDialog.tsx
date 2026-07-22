import { Trans, useLingui } from '@lingui/react/macro';
import type {
  DatabaseCalculationFunction,
  DatabaseDateValue,
  DatabaseDefinition,
  DatabaseOption,
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseQueryResult,
  DatabaseSelectOptionChange,
  DatabaseSelectOptionPreview,
  DatabaseSource,
  DatabaseTableViewConfiguration,
  DatabaseValue,
  FormulaComputedResult,
  FormulaPersistedRuntimeValue,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import {
  DatabaseDateValueSchema,
  DatabaseFilesValueSchema,
  DatabasePlaceValueSchema,
  databaseCalculationFunctionsForProperty,
  databaseFileDisplayName,
  formatDatabaseDateValue,
  formatDatabaseNumber,
  formatDatabaseUniqueId,
  parseDatabaseRecordActorKey,
  previewDatabaseSelectOptionChange,
  projectDatabaseRichText,
  serializeDatabaseDateValue,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseButtonPlan,
  DatabaseContextInspectionScope,
  DatabaseDesiredStateDraftInput,
} from '@nedian0brien/synapsenote-server';
import {
  AlertCircle,
  Archive,
  Braces,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Download,
  ExternalLink,
  GripVertical,
  Loader2,
  MapPin,
  MoreHorizontalIcon,
  MoveRight,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Star,
  Table2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { DatabaseAdvancedFilterDialog } from '@/components/DatabaseAdvancedFilterDialog';
import { DatabaseAutomationsDialog } from '@/components/DatabaseAutomationsDialog';
import { DatabaseBoard, type DatabaseBoardTransition } from '@/components/DatabaseBoard';
import { DatabaseCalendar, type DatabaseCalendarChange } from '@/components/DatabaseCalendar';
import { DatabaseChart } from '@/components/DatabaseChart';
import { DatabaseComputedPropertyDialog } from '@/components/DatabaseComputedPropertyDialog';
import { DatabaseConflictResolutionNotice } from '@/components/DatabaseConflictResolutionNotice';
import { DatabaseCreationDialog } from '@/components/DatabaseCreationDialog';
import { DatabaseDashboard } from '@/components/DatabaseDashboard';
import { DatabaseDateCellEditor } from '@/components/DatabaseDateCellEditor';
import { DatabaseFeed } from '@/components/DatabaseFeed';
import { DatabaseFilesCellEditor } from '@/components/DatabaseFilesCellEditor';
import { DatabaseForm } from '@/components/DatabaseForm';
import { DatabaseGallery } from '@/components/DatabaseGallery';
import { DatabaseList } from '@/components/DatabaseList';
import { DatabaseMap } from '@/components/DatabaseMap';
import { DatabaseOnboardingDialog } from '@/components/DatabaseOnboardingDialog';
import { DatabasePermissionsDialog } from '@/components/DatabasePermissionsDialog';
import { DatabasePlaceCellEditor } from '@/components/DatabasePlaceCellEditor';
import { DatabasePlacePropertyDialog } from '@/components/DatabasePlacePropertyDialog';
import { DatabasePresenceBadges } from '@/components/DatabasePresenceBadges';
import { DatabasePropertiesDialog } from '@/components/DatabasePropertiesDialog';
import { DatabasePropertyConversionDialog } from '@/components/DatabasePropertyConversionDialog';
import { DatabaseRecordPeek } from '@/components/DatabaseRecordPeek';
import { DatabaseRelationCellEditor } from '@/components/DatabaseRelationCellEditor';
import { DatabaseRichTextCellEditor } from '@/components/DatabaseRichTextCellEditor';
import { DatabaseSavedViewSettingsDialog } from '@/components/DatabaseSavedViewSettingsDialog';
import { DatabaseTemplatesDialog } from '@/components/DatabaseTemplatesDialog';
import { DatabaseTimeline, type DatabaseTimelineChange } from '@/components/DatabaseTimeline';
import { DatabaseUniqueIdPropertyDialog } from '@/components/DatabaseUniqueIdPropertyDialog';
import { DatabaseViewManagerDialog } from '@/components/DatabaseViewManagerDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getBranchSnapshot } from '@/lib/current-branch-store';
import {
  type DatabaseCatalogCandidate,
  type DatabaseDescription,
  describeDatabase,
  fetchDatabaseCatalog,
} from '@/lib/database-catalog-client';
import {
  createDatabaseAddPropertyDesiredState,
  createDatabaseAutomationDesiredState,
  createDatabaseBulkCellMutationDesiredState,
  createDatabaseBulkCheckboxToggleDesiredState,
  createDatabaseCellMutationDesiredState,
  createDatabaseComputedPropertyChangeDesiredState,
  createDatabaseDefaultViewChangeDesiredState,
  createDatabasePageTitleDesiredState,
  createDatabasePlacePrivacyChangeDesiredState,
  createDatabaseRecordArchiveDesiredState,
  createDatabaseRecordCopyDesiredState,
  createDatabaseRecordDeletionDesiredState,
  createDatabaseRecordDesiredState,
  createDatabaseRecordMoveDesiredState,
  createDatabaseRemovePropertyDesiredState,
  createDatabaseRenamePropertyDesiredState,
  createDatabaseReorderPropertiesDesiredState,
  createDatabaseSelectOptionChangeDesiredState,
  createDatabaseTablePasteDesiredState,
  createDatabaseTemplateLifecycleDesiredState,
  createDatabaseUniqueIdPrefixChangeDesiredState,
  createDatabaseUnsetPropertyValuesDesiredState,
  createDatabaseViewConfigurationChangeDesiredState,
  createDatabaseViewFilterChangeDesiredState,
  createDatabaseViewLifecycleChangeDesiredState,
  databasePropertyKeyFromName,
  isDatabaseCellEditable,
  parseDatabaseCellDraft,
  rebaseQueuedDatabaseRecordMutations,
} from '@/lib/database-cell-mutation';
import {
  type DatabaseImportInspection,
  databaseDelimitedRecordIds,
  databaseRecordsToCsv,
  inspectDatabaseImport,
  planDatabaseDelimitedImport,
} from '@/lib/database-csv';
import { databaseSnapshotToJson } from '@/lib/database-json';
import {
  applyDatabaseUiRedo,
  applyDatabaseUiUndo,
  createDatabaseButtonPlan,
  createDatabaseVerificationPlan,
  type DatabaseGhostState,
  DatabasePlanExecutionError,
  type ExecuteDatabaseUiMutationResult,
  executeDatabaseButtonPlan,
  executeDatabaseUiMutation,
  executeReviewedDatabasePlan,
  previewDatabaseUiRedo,
  previewDatabaseUiUndo,
} from '@/lib/database-mutation-client';
import {
  type DatabaseUiMutationPolicyInput,
  databaseUiMutationReviewMode,
} from '@/lib/database-mutation-policy';
import {
  DATABASE_NAVIGATION_CHANGE_EVENT,
  databasePageTargetToHash,
  databaseViewOpenBehavior,
  isDatabasePageFavorite,
  setDatabasePageFavorite,
} from '@/lib/database-navigation';
import {
  cacheDatabaseCatalog,
  cacheDatabaseSnapshot,
  databaseOfflineCacheKey,
  readCachedDatabaseCatalog,
  readCachedDatabaseSnapshot,
} from '@/lib/database-offline-cache';
import {
  createOfflineDatabaseMutation,
  enqueueOfflineDatabaseMutation,
  type OfflineDatabaseMutation,
  offlineDatabaseMutationStore,
  offlineQueueableRecordMutations,
  reconcileOfflineDatabaseMutations,
} from '@/lib/database-offline-mutation-queue';
import type { DatabaseSourceOnboardingTarget } from '@/lib/database-onboarding-client';
import { useDatabasePresenceTarget, useRemoteDatabasePresence } from '@/lib/database-presence';
import {
  appendDatabaseQueryPage,
  fetchDatabaseRecord,
  queryDatabase,
} from '@/lib/database-query-client';
import { rememberDatabaseRecordNavigation } from '@/lib/database-record-navigation';
import {
  applyDatabaseSavedTableViewLayout,
  databaseTableRowHeightPixels,
  loadDatabaseTableLayout,
  moveDatabaseTableProperty,
  saveDatabaseTableLayout,
} from '@/lib/database-table-layout';
import {
  type DatabasePasteChange,
  databaseRangeToTsv,
  databaseRecordsToTsv,
  planDatabaseTsvPaste,
} from '@/lib/database-tsv';
import {
  classifyDatabaseUiProblem,
  type DatabaseUiProblem,
  databaseConflictProblem,
  databaseIndexProblem,
} from '@/lib/database-ui-problem';
import {
  databaseBrowserLoadedRecordLimit,
  databaseBrowserNextPageLimit,
} from '@/lib/database-view-bounds';
import { loadDatabaseLastOpenedView, saveDatabaseLastOpenedView } from '@/lib/database-view-state';
import { subscribeToDatabaseChanged } from '@/lib/documents-events';
import { dispatchExternalLinkClick, openExternalUrl } from '@/lib/external-link';
import { getServerInstanceId } from '@/lib/server-instance-store';
import { cn } from '@/lib/utils';

interface DatabaseTableSelection {
  databaseId: string;
  sourceId: string;
}

export interface DatabaseTableTarget extends DatabaseTableSelection {
  viewId?: string;
}

export type DatabaseInitialRecordAction =
  | { kind: 'create' }
  | {
      kind: 'duplicate' | 'move' | 'archive' | 'restore' | 'delete';
      recordId: string;
    }
  | {
      kind: 'transition';
      recordId: string;
      changes: Array<{ propertyId: string; value?: DatabaseValue }>;
    };

interface DatabaseCellRange {
  anchorRow: number;
  anchorColumn: number;
  focusRow: number;
  focusColumn: number;
}

interface DatabaseCellMenu {
  row: number;
  column: number;
  x: number;
  y: number;
}

function normalizedCellRange(range: DatabaseCellRange) {
  return {
    rowStart: Math.min(range.anchorRow, range.focusRow),
    rowEnd: Math.max(range.anchorRow, range.focusRow),
    columnStart: Math.min(range.anchorColumn, range.focusColumn),
    columnEnd: Math.max(range.anchorColumn, range.focusColumn),
  };
}

function cellIsInRange(range: DatabaseCellRange | null, row: number, column: number): boolean {
  if (!range) return false;
  const normalized = normalizedCellRange(range);
  return (
    row >= normalized.rowStart &&
    row <= normalized.rowEnd &&
    column >= normalized.columnStart &&
    column <= normalized.columnEnd
  );
}

function databaseTableAggregate(
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

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
type DatabaseSelectProperty = DatabaseProperty & {
  type: 'select';
  options: DatabaseOption[];
};

function isDatabaseSelectProperty(property: DatabaseProperty): property is DatabaseSelectProperty {
  return property.type === 'select';
}

const DATABASE_EXPORT_RECORD_LIMIT = 10_000;
/** Keeps the interactive grid DOM bounded even for imported wide schemas. */
export const DATABASE_TABLE_RENDERED_COLUMN_LIMIT = 100;

function downloadTextFile(contents: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function DatabaseStateNotice({
  problem,
  onAction,
  actionKind = 'recover',
}: {
  problem: DatabaseUiProblem;
  onAction?: () => void;
  actionKind?: 'recover' | 'reload' | 'back';
}) {
  const actionAvailable =
    onAction && (problem.retryable || problem.kind === 'conflict' || actionKind === 'back');
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
      role={problem.kind === 'stale_index' && !problem.retryable ? 'status' : 'alert'}
      data-database-state={problem.kind}
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-medium">
            {problem.kind === 'offline' ? (
              <Trans>Database is offline</Trans>
            ) : problem.kind === 'missing' ? (
              <Trans>Database page is unavailable</Trans>
            ) : problem.kind === 'invalid_schema' ? (
              <Trans>Database schema is invalid</Trans>
            ) : problem.kind === 'stale_index' ? (
              <Trans>Database index is not current</Trans>
            ) : problem.kind === 'conflict' ? (
              <Trans>Canonical state changed</Trans>
            ) : problem.kind === 'permission' ? (
              <Trans>Permission required</Trans>
            ) : (
              <Trans>Database request failed</Trans>
            )}
          </div>
          <p className="mt-0.5 break-words opacity-90">{problem.message}</p>
          {problem.kind === 'permission' ? (
            <p className="mt-1 opacity-90">
              <Trans>Request access or use fields available to your current policy.</Trans>
            </p>
          ) : null}
        </div>
      </div>
      {actionAvailable ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionKind === 'back' ? (
            <Trans>Back to databases</Trans>
          ) : actionKind === 'reload' || problem.kind === 'conflict' ? (
            <Trans>Reload latest</Trans>
          ) : problem.kind === 'stale_index' ? (
            <Trans>Check index again</Trans>
          ) : problem.kind === 'invalid_schema' ? (
            <Trans>Reload schema</Trans>
          ) : (
            <Trans>Retry</Trans>
          )}
        </Button>
      ) : null}
    </div>
  );
}

function displayValue(
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

function displayComputedRuntimeValue(value: FormulaPersistedRuntimeValue): string {
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

function databasePlaceMapHref(value: unknown): string | null {
  const place = DatabasePlaceValueSchema.safeParse(value);
  if (!place.success) return null;
  const zoom = place.data.precision === 'approximate' ? 10 : 16;
  const lat = encodeURIComponent(String(place.data.lat));
  const lon = encodeURIComponent(String(place.data.lon));
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

function displayComputedResult(result: FormulaComputedResult): string {
  return result.kind === 'error'
    ? `Error (${result.problem.code}): ${result.problem.message}`
    : displayComputedRuntimeValue(result.value);
}

function databaseLinkHref(property: DatabaseProperty, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (property.type === 'url') return value;
  if (property.type === 'email') return `mailto:${value}`;
  if (property.type === 'phone') return `tel:${value.replace(/[^+\d]/g, '')}`;
  return null;
}

function DatabaseValueCopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timeout);
  }, [copied]);
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      onClick={() => {
        if (!navigator.clipboard?.writeText) return;
        void navigator.clipboard.writeText(value).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </Button>
  );
}

function sourceProperties(source: DatabaseSource): DatabaseProperty[] {
  return [...source.properties].sort((left, right) => {
    if (left.type === 'title') return -1;
    if (right.type === 'title') return 1;
    return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });
}

async function searchDatabaseRelationRecords(
  database: DatabaseDefinition,
  property: Extract<DatabaseProperty, { type: 'relation' }>,
  searchText: string,
): Promise<ProjectedDatabaseRelationRecord[]> {
  const targetSource = database.sources.find((source) => source.id === property.targetSourceId);
  const titleProperty = targetSource?.properties.find((candidate) => candidate.type === 'title');
  if (!targetSource || !titleProperty) return [];
  const result = await queryDatabase({
    databaseId: database.id,
    sourceId: targetSource.id,
    query: {
      ...(searchText
        ? {
            where: {
              propertyId: titleProperty.id,
              operator: 'contains' as const,
              value: searchText,
            },
          }
        : {}),
      sort: [{ propertyId: titleProperty.id, direction: 'asc' }],
      select: [titleProperty.id],
      includeArchived: false,
      page: { limit: 100 },
    },
  });
  return result.records.flatMap((record) => {
    const title = record.values[titleProperty.id];
    return typeof title === 'string'
      ? [
          {
            id: record.id,
            sourceId: targetSource.id,
            title,
            ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
          },
        ]
      : [];
  });
}

function projectedGhostValues(
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

function multiSelectDraftValues(draft: string): string[] {
  try {
    const value: unknown = JSON.parse(draft);
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
  } catch {
    return [];
  }
}

function initialCellDraft(property: DatabaseProperty, value?: DatabaseValue): string {
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
    return typeof value === 'string'
      ? value
      : (property.options.find((option) => option.archived !== true)?.id ?? '');
  }
  return value === undefined ? '' : String(value);
}

function invalidExternalValueText(value: unknown): string {
  if (typeof value === 'string') return value;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

type DatabaseConditionalColorName = NonNullable<
  DatabaseQueryResult['conditionalColors']
>['rules'][number]['color'];

const DATABASE_CONDITIONAL_COLOR_CLASSES: Record<DatabaseConditionalColorName, string> = {
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

function databasePlanHumanSummary(diff: DatabaseGhostState['diff']): string {
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
    diff.manifests.length > 0 ? `${diff.manifests.length} database manifest` : null,
    diff.templates.length > 0 ? `${diff.templates.length} template` : null,
  ].filter((value): value is string => value !== null);
  return [...recordSummary, ...fileSummary].join(' · ') || 'No canonical file changes';
}

export function DatabaseTable({
  databaseId = '',
  viewId = null,
  source,
  result,
  people = result.people ?? [],
  relationRecords = result.relationRecords ?? [],
  ghost = null,
  optimisticCellValues,
  mutationLocked = false,
  selectedRecordIds = new Set<string>(),
  calculations = {},
  viewPropertyIds,
  viewConfiguration,
  onEdit,
  onDelete,
  onDuplicate,
  onArchive,
  onRequestMove,
  onOpen,
  onOpenContextInspector,
  onCreateRecord,
  onSelectionChange,
  onPaste,
  onCalculationChange,
  onRelationSearch,
  onConfigureComputedProperty,
  onConfigureUniqueIdProperty,
  onConfigurePlaceProperty,
  onConvertProperty,
  onInvokeButton,
  onVerificationAction,
  onManageProperties,
  onRemoveProperty,
}: {
  /** Canonical database ID; optional only for isolated component harnesses. */
  databaseId?: string;
  viewId?: string | null;
  source: DatabaseSource;
  result: DatabaseQueryResult;
  people?: readonly ProjectedDatabasePerson[];
  relationRecords?: readonly ProjectedDatabaseRelationRecord[];
  ghost?: DatabaseGhostState | null;
  /** Direct-safe human edits shown locally while the canonical commit settles. */
  optimisticCellValues?: ReadonlyMap<string, DatabaseValue | undefined>;
  mutationLocked?: boolean;
  selectedRecordIds?: ReadonlySet<string>;
  calculations?: Readonly<Record<string, DatabaseCalculationFunction>>;
  viewPropertyIds?: readonly string[];
  viewConfiguration?: DatabaseTableViewConfiguration;
  onEdit?: (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    value: DatabaseValue | undefined,
  ) => void;
  onDelete?: (record: ProjectedDatabaseRecord) => void;
  onDuplicate?: (record: ProjectedDatabaseRecord) => void;
  onArchive?: (record: ProjectedDatabaseRecord, action: 'archive' | 'restore') => void;
  onRequestMove?: (record: ProjectedDatabaseRecord) => void;
  onOpen?: (record: ProjectedDatabaseRecord) => void;
  onOpenContextInspector?: (record: ProjectedDatabaseRecord) => void;
  onCreateRecord?: (title: string) => void;
  onSelectionChange?: (recordIds: Set<string>) => void;
  onPaste?: (changes: readonly DatabasePasteChange[]) => void;
  onCalculationChange?: (
    propertyId: string,
    calculation: DatabaseCalculationFunction | null,
  ) => void;
  onRelationSearch?: (
    property: Extract<DatabaseProperty, { type: 'relation' }>,
    query: string,
  ) => Promise<readonly ProjectedDatabaseRelationRecord[]>;
  onConfigureComputedProperty?: (
    property: Extract<DatabaseProperty, { type: 'formula' | 'rollup' }>,
  ) => void;
  onConfigureUniqueIdProperty?: (
    property: Extract<DatabaseProperty, { type: 'unique_id' }>,
  ) => void;
  onConfigurePlaceProperty?: (property: Extract<DatabaseProperty, { type: 'place' }>) => void;
  onConvertProperty?: (property: DatabaseProperty) => void;
  onInvokeButton?: (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'button' }>,
  ) => void;
  onVerificationAction?: (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'verification' }>,
    action: 'verify' | 'renew' | 'unverify',
  ) => void;
  onManageProperties?: (propertyId?: string) => void;
  onRemoveProperty?: (property: DatabaseProperty) => void;
}) {
  'use no memo';
  const { i18n, t } = useLingui();
  const personLabels = { agent: t`agent`, inactive: t`inactive` };
  const missingFileLabel = t`missing`;
  const allProperties = sourceProperties(source);
  const [layout, setLayout] = useState(() => {
    const localLayout = loadDatabaseTableLayout(source.id, allProperties);
    return viewPropertyIds
      ? applyDatabaseSavedTableViewLayout(
          allProperties,
          localLayout,
          viewPropertyIds,
          viewConfiguration,
        )
      : localLayout;
  });
  const viewPropertySet = viewPropertyIds ? new Set(viewPropertyIds) : null;
  const visibleProperties = layout.propertyIds
    .filter((propertyId) => !layout.hiddenPropertyIds.includes(propertyId))
    .map((propertyId) => allProperties.find((property) => property.id === propertyId))
    .filter(
      (property): property is DatabaseProperty =>
        property !== undefined && (!viewPropertySet || viewPropertySet.has(property.id)),
    );
  const properties = visibleProperties.slice(0, DATABASE_TABLE_RENDERED_COLUMN_LIMIT);
  const omittedColumnCount = visibleProperties.length - properties.length;
  const canonicalIds = new Set(result.records.map((record) => record.id));
  const tableRecords: Array<{
    record: ProjectedDatabaseRecord;
    ghostCreated: boolean;
  }> = [
    ...result.records.map((record) => ({ record, ghostCreated: false })),
    ...(ghost?.diff.records ?? [])
      .filter(
        (record) =>
          record.action === 'create' &&
          record.after !== null &&
          record.sourceId === source.id &&
          !canonicalIds.has(record.recordId),
      )
      .map((record) => ({
        record: {
          id: record.recordId,
          path: record.path,
          revision: null,
          values: projectedGhostValues(record.after?.values ?? {}),
        },
        ghostCreated: true,
      })),
  ];
  const conditionalColorRules = new Map(
    (result.conditionalColors?.rules ?? []).map((rule) => [rule.id, rule] as const),
  );
  const [editing, setEditing] = useState<{
    recordId: string;
    propertyId: string;
    draft: string;
  } | null>(null);
  useDatabasePresenceTarget(
    editing && databaseId
      ? {
          databaseId,
          sourceId: source.id,
          recordId: editing.recordId,
          propertyId: editing.propertyId,
          viewId,
          scope: 'cell',
          operation: 'editing',
        }
      : null,
  );
  const remotePresence = useRemoteDatabasePresence();
  const [editError, setEditError] = useState<string | null>(null);
  const [cellRange, setCellRange] = useState<DatabaseCellRange | null>(null);
  const [cellMenu, setCellMenu] = useState<DatabaseCellMenu | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(620);
  const tableHostRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cellMenuRef = useRef<HTMLDivElement>(null);
  const editFocusRef = useRef<{ recordId: string; propertyId: string } | null>(null);
  useEffect(() => {
    if (!cellMenu) return;
    cellMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [cellMenu]);
  const allLoadedSelected =
    result.records.length > 0 && result.records.every((record) => selectedRecordIds.has(record.id));

  useEffect(() => {
    if (!viewPropertyIds) saveDatabaseTableLayout(source.id, layout);
  }, [layout, source.id, viewPropertyIds]);

  const rowHeightPixels = databaseTableRowHeightPixels(layout.rowHeight);
  const virtualized = tableRecords.length > 40 && !ghost;
  const virtualStart = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeightPixels) - 6) : 0;
  const virtualEnd = virtualized
    ? Math.min(tableRecords.length, Math.ceil((scrollTop + viewportHeight) / rowHeightPixels) + 6)
    : tableRecords.length;
  const renderedRecords = tableRecords
    .slice(virtualStart, virtualEnd)
    .map((entry, offset) => ({ ...entry, rowIndex: virtualStart + offset }));

  const beginEdit = (record: ProjectedDatabaseRecord, property: DatabaseProperty) => {
    const current = record.values[property.id];
    const invalid = record.invalidValues?.[property.id];
    if (!onEdit || mutationLocked || !isDatabaseCellEditable(property)) return;
    setEditError(null);
    setEditing({
      recordId: record.id,
      propertyId: property.id,
      draft:
        invalid === undefined
          ? initialCellDraft(property, current)
          : invalidExternalValueText(invalid),
    });
  };

  const rememberEditFocus = (record: ProjectedDatabaseRecord, property: DatabaseProperty) => {
    editFocusRef.current = { recordId: record.id, propertyId: property.id };
  };

  const cancelEdit = (record: ProjectedDatabaseRecord, property: DatabaseProperty) => {
    rememberEditFocus(record, property);
    setEditing(null);
    setEditError(null);
  };

  const saveEdit = (record: ProjectedDatabaseRecord, property: DatabaseProperty) => {
    if (!editing || editing.recordId !== record.id || editing.propertyId !== property.id) return;
    try {
      const value = parseDatabaseCellDraft(property, editing.draft, people);
      rememberEditFocus(record, property);
      setEditing(null);
      setEditError(null);
      onEdit?.(record, property, value);
    } catch (cause) {
      setEditError(errorMessage(cause, 'Invalid cell value'));
    }
  };

  useEffect(() => {
    const pending = editFocusRef.current;
    if (editing || !pending) return;
    const rowIndex = result.records.findIndex((record) => record.id === pending.recordId);
    const columnIndex = properties.findIndex((property) => property.id === pending.propertyId);
    if (rowIndex < 0 || columnIndex < 0) {
      editFocusRef.current = null;
      return;
    }
    const selector = `[data-database-cell-row="${rowIndex}"][data-database-cell-column="${columnIndex}"]`;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        tableHostRef.current?.querySelector<HTMLElement>(selector)?.focus();
        editFocusRef.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [editing, properties, result.records]);

  const focusCell = (rowIndex: number, columnIndex: number, extend: boolean) => {
    if (
      rowIndex < 0 ||
      rowIndex >= result.records.length ||
      columnIndex < 0 ||
      columnIndex >= properties.length
    ) {
      return;
    }
    setCellRange((current) => ({
      anchorRow: extend && current ? current.anchorRow : rowIndex,
      anchorColumn: extend && current ? current.anchorColumn : columnIndex,
      focusRow: rowIndex,
      focusColumn: columnIndex,
    }));
    const focusRenderedCell = () =>
      tableHostRef.current
        ?.querySelector<HTMLElement>(
          `[data-database-cell-row="${rowIndex}"][data-database-cell-column="${columnIndex}"]`,
        )
        ?.focus();
    if (virtualized && (rowIndex < virtualStart || rowIndex >= virtualEnd)) {
      const nextScrollTop = rowIndex * rowHeightPixels;
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
      requestAnimationFrame(focusRenderedCell);
      return;
    }
    focusRenderedCell();
  };

  const rangeTsv = (fallbackRow: number, fallbackColumn: number): string => {
    const range = cellIsInRange(cellRange, fallbackRow, fallbackColumn)
      ? cellRange
      : {
          anchorRow: fallbackRow,
          anchorColumn: fallbackColumn,
          focusRow: fallbackRow,
          focusColumn: fallbackColumn,
        };
    if (!range) return '';
    return databaseRangeToTsv({
      records: result.records,
      properties,
      people,
      ...normalizedCellRange(range),
    });
  };

  const applyTsvAtCell = (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    tsv: string,
  ) => {
    if (!onPaste || mutationLocked) return;
    try {
      const changes = planDatabaseTsvPaste({
        source,
        people,
        properties,
        records: result.records,
        anchorRecordId: record.id,
        anchorPropertyId: property.id,
        tsv,
      });
      setEditError(null);
      onPaste(changes);
    } catch (cause) {
      setEditError(errorMessage(cause, 'Invalid TSV paste'));
    }
  };

  const copyCellRange = (row: number, column: number) => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(rangeTsv(row, column));
  };

  return (
    <div ref={tableHostRef}>
      <details
        className="mb-2 rounded-md border bg-muted/10 p-2"
        data-testid="table-layout-controls"
      >
        <summary className="cursor-pointer select-none font-medium text-sm">
          <Trans>Table layout and calculations</Trans>
        </summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {onManageProperties ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onManageProperties()}
              >
                <Trans>Manage properties</Trans>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={layout.wrap ? 'secondary' : 'outline'}
              aria-pressed={layout.wrap}
              onClick={() => setLayout((current) => ({ ...current, wrap: !current.wrap }))}
            >
              <Trans>Wrap cells</Trans>
            </Button>
            <Select
              value={layout.rowHeight}
              onValueChange={(rowHeight: 'compact' | 'standard' | 'tall') =>
                setLayout((current) => ({ ...current, rowHeight }))
              }
            >
              <SelectTrigger size="sm" className="w-36" aria-label="Table row height">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="tall">Tall</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            {layout.propertyIds.map((propertyId, propertyIndex) => {
              const property = allProperties.find((candidate) => candidate.id === propertyId);
              if (!property) return null;
              const title = property.type === 'title';
              const shown = !layout.hiddenPropertyIds.includes(property.id);
              const allowedCalculations = databaseCalculationFunctionsForProperty(property);
              return (
                <div
                  key={property.id}
                  className="grid items-center gap-2 rounded border bg-background p-2 sm:grid-cols-[minmax(8rem,1fr)_auto_minmax(8rem,12rem)_minmax(10rem,14rem)]"
                  data-layout-property-id={property.id}
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Checkbox
                      checked={shown}
                      disabled={title}
                      aria-label={`Show ${property.name} column`}
                      onCheckedChange={(checked) =>
                        setLayout((current) => ({
                          ...current,
                          hiddenPropertyIds:
                            checked === true
                              ? current.hiddenPropertyIds.filter((id) => id !== property.id)
                              : [...new Set([...current.hiddenPropertyIds, property.id])],
                        }))
                      }
                    />
                    <span className="truncate">{property.name}</span>
                    {title ? <Badge variant="gray">Frozen</Badge> : null}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${property.name} left`}
                      disabled={title || propertyIndex <= 1}
                      onClick={() =>
                        setLayout((current) => moveDatabaseTableProperty(current, property.id, -1))
                      }
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${property.name} right`}
                      disabled={title || propertyIndex >= layout.propertyIds.length - 1}
                      onClick={() =>
                        setLayout((current) => moveDatabaseTableProperty(current, property.id, 1))
                      }
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="sr-only">{`Width of ${property.name}`}</span>
                    <Input
                      type="range"
                      min={120}
                      max={480}
                      step={20}
                      value={layout.widths[property.id] ?? 180}
                      aria-label={`Width of ${property.name}`}
                      onChange={(event) =>
                        setLayout((current) => ({
                          ...current,
                          widths: {
                            ...current.widths,
                            [property.id]: Number(event.currentTarget.value),
                          },
                        }))
                      }
                    />
                    <span>{layout.widths[property.id] ?? 180}px</span>
                  </div>
                  <Select
                    value={calculations[property.id] ?? 'none'}
                    onValueChange={(value) =>
                      onCalculationChange?.(
                        property.id,
                        value === 'none' ? null : (value as DatabaseCalculationFunction),
                      )
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={`Calculation for ${property.name}`}
                      disabled={!onCalculationChange}
                    >
                      <SelectValue placeholder="No calculation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No calculation</SelectItem>
                      {allowedCalculations.map((calculation) => (
                        <SelectItem key={calculation} value={calculation}>
                          {calculation.replaceAll('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      </details>
      {editError ? (
        <div
          className="mb-2 text-destructive text-xs"
          role="alert"
          data-database-state="invalid_value"
        >
          {editError}
        </div>
      ) : null}
      {result.records.length === 0 &&
      !ghost?.diff.records.some(
        (record) => record.action === 'create' && record.sourceId === source.id,
      ) ? (
        <div
          className="mb-2 rounded-md border border-dashed p-3 text-muted-foreground text-sm"
          data-database-state="empty"
        >
          <Trans>No records in this source.</Trans>{' '}
          <span className="text-xs">{t`Use the last row to add one.`}</span>
        </div>
      ) : null}
      {omittedColumnCount > 0 ? (
        <div
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
          role="status"
          data-testid="database-column-limit"
        >
          <Trans>
            This table shows the first {DATABASE_TABLE_RENDERED_COLUMN_LIMIT} visible properties;
            hide or reorder properties to view the remaining {omittedColumnCount}.
          </Trans>
        </div>
      ) : null}
      <Table
        role="grid"
        aria-label={`${source.name} database records`}
        aria-rowcount={tableRecords.length + 1}
        aria-colcount={properties.length + 2}
        className={cn(
          'min-w-full w-max',
          layout.rowHeight === 'compact' && '[&_td]:py-1',
          layout.rowHeight === 'tall' && '[&_td]:py-5',
        )}
        data-row-height={layout.rowHeight}
        containerClassName="max-h-[62vh] overflow-auto rounded-md border"
        containerRef={scrollContainerRef}
        onContainerScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
          setViewportHeight(event.currentTarget.clientHeight);
        }}
      >
        <TableCaption className="sr-only">
          <Trans>Canonical database records</Trans>
        </TableCaption>
        <TableHeader className="sticky top-0 z-20 bg-background">
          <TableRow noHover aria-rowindex={1}>
            <TableHead className="sticky left-0 z-40 w-10 bg-background" aria-colindex={1}>
              <Checkbox
                checked={allLoadedSelected}
                aria-label="Select all loaded records"
                disabled={!onSelectionChange || mutationLocked || result.records.length === 0}
                onCheckedChange={(checked) =>
                  onSelectionChange?.(
                    checked === true
                      ? new Set(result.records.map((record) => record.id))
                      : new Set(),
                  )
                }
              />
            </TableHead>
            {properties.map((property, index) => {
              const layoutPropertyIndex = layout.propertyIds.indexOf(property.id);
              const propertyVisible = !layout.hiddenPropertyIds.includes(property.id);
              const calculationOptions = databaseCalculationFunctionsForProperty(property);
              return (
                <TableHead
                  key={property.id}
                  aria-colindex={index + 2}
                  dir="auto"
                  className={cn(index === 0 && 'sticky left-10 z-30 min-w-56 bg-background')}
                  data-property-id={property.id}
                  style={{
                    minWidth: layout.widths[property.id],
                    width: layout.widths[property.id],
                    maxWidth: layout.widths[property.id],
                  }}
                >
                  <span>{property.name}</span>
                  <span className="ml-2 normal-case text-[10px] opacity-60">{property.type}</span>
                  {(property.type === 'formula' || property.type === 'rollup') &&
                  onConfigureComputedProperty ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="ml-1"
                      aria-label={`Configure ${property.name} ${property.type}`}
                      onClick={() => onConfigureComputedProperty(property)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  ) : null}
                  {property.type === 'unique_id' && onConfigureUniqueIdProperty ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="ml-1"
                      aria-label={`Configure ${property.name} Unique ID`}
                      onClick={() => onConfigureUniqueIdProperty(property)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  ) : null}
                  {property.type === 'place' && onConfigurePlaceProperty ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="ml-1"
                      aria-label={`Configure ${property.name} Place privacy`}
                      onClick={() => onConfigurePlaceProperty(property)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  ) : null}
                  {onConvertProperty ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="ml-1"
                      aria-label={`Convert ${property.name} property type`}
                      disabled={mutationLocked}
                      onClick={() => onConvertProperty(property)}
                    >
                      <MoveRight aria-hidden="true" />
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="ml-1"
                        aria-label={`Property options for ${property.name}`}
                        disabled={mutationLocked}
                        data-property-menu-trigger={property.id}
                      >
                        <MoreHorizontalIcon aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>{property.name}</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={propertyVisible}
                        disabled={property.type === 'title'}
                        onCheckedChange={(checked) =>
                          setLayout((current) => ({
                            ...current,
                            hiddenPropertyIds:
                              checked === true
                                ? current.hiddenPropertyIds.filter((id) => id !== property.id)
                                : [...new Set([...current.hiddenPropertyIds, property.id])],
                          }))
                        }
                      >
                        <Trans>Show column</Trans>
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuItem
                        disabled={property.type === 'title' || layoutPropertyIndex <= 1}
                        onSelect={() =>
                          setLayout((current) =>
                            moveDatabaseTableProperty(current, property.id, -1),
                          )
                        }
                      >
                        <ChevronLeft aria-hidden="true" />
                        <Trans>Move left</Trans>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={
                          property.type === 'title' ||
                          layoutPropertyIndex < 0 ||
                          layoutPropertyIndex >= layout.propertyIds.length - 1
                        }
                        onSelect={() =>
                          setLayout((current) => moveDatabaseTableProperty(current, property.id, 1))
                        }
                      >
                        <ChevronRight aria-hidden="true" />
                        <Trans>Move right</Trans>
                      </DropdownMenuItem>
                      {calculationOptions.length > 0 && onCalculationChange ? (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Trans>Calculate</Trans>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup
                              value={calculations[property.id] ?? 'none'}
                              onValueChange={(value) =>
                                onCalculationChange(
                                  property.id,
                                  value === 'none' ? null : (value as DatabaseCalculationFunction),
                                )
                              }
                            >
                              <DropdownMenuRadioItem value="none">
                                <Trans>No calculation</Trans>
                              </DropdownMenuRadioItem>
                              {calculationOptions.map((calculation) => (
                                <DropdownMenuRadioItem key={calculation} value={calculation}>
                                  {calculation.replaceAll('_', ' ')}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!onManageProperties}
                        onSelect={() => onManageProperties?.(property.id)}
                      >
                        <Pencil aria-hidden="true" />
                        <Trans>Rename or configure property</Trans>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!onConvertProperty || mutationLocked}
                        onSelect={() => onConvertProperty?.(property)}
                      >
                        <MoveRight aria-hidden="true" />
                        <Trans>Change property type</Trans>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={property.type === 'title' || !onRemoveProperty || mutationLocked}
                        onSelect={() => onRemoveProperty?.(property)}
                      >
                        <Trash2 aria-hidden="true" />
                        <Trans>Delete property</Trans>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableHead>
              );
            })}
            <TableHead
              className="sticky right-0 z-30 w-32 bg-background text-right"
              aria-colindex={properties.length + 2}
            >
              <span>
                <Trans>Actions</Trans>
              </span>
              {onManageProperties ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="ml-1"
                  aria-label="Add property"
                  disabled={mutationLocked}
                  onClick={() => onManageProperties()}
                >
                  <Plus aria-hidden="true" />
                </Button>
              ) : null}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {virtualized && virtualStart > 0 ? (
            <TableRow aria-hidden="true" noHover>
              <TableCell
                colSpan={properties.length + 2}
                className="p-0"
                style={{ height: virtualStart * rowHeightPixels }}
              />
            </TableRow>
          ) : null}
          {renderedRecords.map(({ record, ghostCreated, rowIndex }) => {
            const conditionalColorRecord = result.conditionalColors?.records[record.id];
            const pageColorRule = conditionalColorRecord?.pageRuleId
              ? conditionalColorRules.get(conditionalColorRecord.pageRuleId)
              : undefined;
            const proposedRecord = ghost?.diff.records.find(
              (candidate) => candidate.recordId === record.id,
            );
            const proposedDeletion = proposedRecord?.action === 'delete';
            const proposedArchiveAction =
              proposedRecord?.action === 'update' &&
              proposedRecord.before?.archivedAt !== proposedRecord.after?.archivedAt
                ? proposedRecord.after?.archivedAt
                  ? 'archive'
                  : 'restore'
                : null;
            const proposedMove = proposedRecord?.action === 'move';
            const nonCanonical = ghostCreated || proposedRecord !== undefined;
            return (
              <TableRow
                key={record.id}
                aria-rowindex={rowIndex + 2}
                aria-selected={selectedRecordIds.has(record.id)}
                data-record-id={record.id}
                data-canonical={nonCanonical ? 'false' : 'true'}
                data-proposed-deletion={proposedDeletion ? 'true' : undefined}
                data-conditional-color={pageColorRule?.color}
                data-conditional-color-rule={pageColorRule?.id}
                className={cn(
                  pageColorRule && DATABASE_CONDITIONAL_COLOR_CLASSES[pageColorRule.color],
                  nonCanonical && 'border-primary/40 border-dashed bg-primary/5',
                  proposedDeletion && 'opacity-70',
                )}
                style={{ height: rowHeightPixels }}
              >
                <TableCell
                  role="gridcell"
                  aria-colindex={1}
                  className={cn(
                    'sticky left-0 z-20 w-10 bg-background',
                    pageColorRule && DATABASE_CONDITIONAL_COLOR_CLASSES[pageColorRule.color],
                  )}
                >
                  {!ghostCreated ? (
                    <Checkbox
                      checked={selectedRecordIds.has(record.id)}
                      aria-label={`Select record ${record.id}`}
                      disabled={
                        !onSelectionChange || mutationLocked || proposedRecord !== undefined
                      }
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedRecordIds);
                        if (checked === true) next.add(record.id);
                        else next.delete(record.id);
                        onSelectionChange?.(next);
                      }}
                    />
                  ) : null}
                </TableCell>
                {properties.map((property, index) =>
                  (() => {
                    const beforeValue = proposedRecord?.before?.values[property.id];
                    const afterValue = proposedRecord?.after?.values[property.id];
                    const proposed =
                      proposedRecord !== undefined &&
                      (proposedDeletion ||
                        JSON.stringify(beforeValue) !== JSON.stringify(afterValue));
                    const optimisticKey = `${record.id}:${property.id}`;
                    const baseValue = optimisticCellValues?.has(optimisticKey)
                      ? optimisticCellValues.get(optimisticKey)
                      : record.values[property.id];
                    const shownValue =
                      proposedDeletion || proposedMove
                        ? baseValue
                        : proposed
                          ? afterValue
                          : baseValue;
                    const propertyColorRuleId =
                      conditionalColorRecord?.propertyRuleIds?.[property.id];
                    const propertyColorRule = propertyColorRuleId
                      ? conditionalColorRules.get(propertyColorRuleId)
                      : undefined;
                    const effectiveColorRule = propertyColorRule ?? pageColorRule;
                    const computedResult =
                      property.type === 'formula' || property.type === 'rollup'
                        ? record.computedResults?.[property.id]
                        : undefined;
                    const verificationProjection =
                      property.type === 'verification'
                        ? record.verificationProjections?.[property.id]
                        : undefined;
                    const invalidValue = record.invalidValues?.[property.id];
                    const invalidIssue = record.issues?.find(
                      (issue) => issue.propertyId === property.id,
                    );
                    const invalidValueText =
                      invalidValue === undefined ? null : invalidExternalValueText(invalidValue);
                    const shownText =
                      invalidValueText !== null
                        ? t`Invalid preserved value: ${invalidValueText}${
                            invalidIssue ? ` · ${invalidIssue.message}` : ''
                          }`
                        : computedResult
                          ? displayComputedResult(computedResult)
                          : property.type === 'verification'
                            ? (verificationProjection?.status ?? 'unverified')
                            : property.type === 'text' && typeof shownValue === 'string'
                              ? !proposed && record.textProjections?.[property.id]
                                ? record.textProjections[property.id].plainText
                                : projectDatabaseRichText(shownValue).plainText
                              : displayValue(
                                  property,
                                  shownValue,
                                  people,
                                  relationRecords,
                                  personLabels,
                                  result.fileStates,
                                  missingFileLabel,
                                  i18n.locale,
                                );
                    const cellEditing =
                      editing?.recordId === record.id && editing.propertyId === property.id;
                    const cellPresence = remotePresence.filter(
                      (entry) =>
                        entry.databaseId === databaseId &&
                        entry.sourceId === source.id &&
                        entry.scope === 'cell' &&
                        entry.recordId === record.id &&
                        entry.propertyId === property.id,
                    );
                    const linkHref = databaseLinkHref(property, shownValue);
                    return (
                      <TableCell
                        key={property.id}
                        role="gridcell"
                        aria-colindex={index + 2}
                        dir="auto"
                        className={cn(
                          layout.wrap
                            ? 'break-words whitespace-normal'
                            : 'overflow-hidden truncate whitespace-nowrap',
                          index === 0 && 'sticky left-10 z-10 bg-background font-medium',
                          effectiveColorRule &&
                            DATABASE_CONDITIONAL_COLOR_CLASSES[effectiveColorRule.color],
                          cellIsInRange(cellRange, rowIndex, index) &&
                            'outline -outline-offset-2 outline-2 outline-primary/70',
                          proposed &&
                            'border-primary/40 border-x border-dashed bg-primary/5 text-primary',
                          invalidValue !== undefined && 'bg-destructive/5 text-destructive',
                        )}
                        style={{
                          minWidth: layout.widths[property.id],
                          width: layout.widths[property.id],
                          maxWidth: layout.widths[property.id],
                        }}
                        data-property-id={property.id}
                        data-conditional-color={effectiveColorRule?.color}
                        data-conditional-color-rule={effectiveColorRule?.id}
                        data-canonical={proposed ? 'false' : 'true'}
                        title={shownText}
                        data-computed-state={computedResult?.kind}
                        data-invalid-preserved={invalidValue !== undefined ? 'true' : undefined}
                        tabIndex={
                          ghostCreated
                            ? -1
                            : cellRange
                              ? cellRange.focusRow === rowIndex && cellRange.focusColumn === index
                                ? 0
                                : -1
                              : rowIndex === 0 && index === 0
                                ? 0
                                : -1
                        }
                        aria-selected={cellIsInRange(cellRange, rowIndex, index)}
                        draggable={!ghostCreated && !cellEditing}
                        data-database-cell-row={rowIndex}
                        data-database-cell-column={index}
                        data-database-cell-selected={
                          cellIsInRange(cellRange, rowIndex, index) ? 'true' : undefined
                        }
                        onFocus={() => {
                          setEditError(null);
                          setCellRange(
                            (current) =>
                              current ?? {
                                anchorRow: rowIndex,
                                anchorColumn: index,
                                focusRow: rowIndex,
                                focusColumn: index,
                              },
                          );
                        }}
                        onClick={(event) => {
                          setCellMenu(null);
                          setCellRange((current) => ({
                            anchorRow: event.shiftKey && current ? current.anchorRow : rowIndex,
                            anchorColumn: event.shiftKey && current ? current.anchorColumn : index,
                            focusRow: rowIndex,
                            focusColumn: index,
                          }));
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          if (!cellIsInRange(cellRange, rowIndex, index)) {
                            setCellRange({
                              anchorRow: rowIndex,
                              anchorColumn: index,
                              focusRow: rowIndex,
                              focusColumn: index,
                            });
                          }
                          setCellMenu({
                            row: rowIndex,
                            column: index,
                            x: event.clientX,
                            y: event.clientY,
                          });
                        }}
                        onKeyDown={(event) => {
                          if (cellEditing) return;
                          if (event.key === 'Escape') {
                            setCellMenu(null);
                            return;
                          }
                          if (
                            event.key === 'ContextMenu' ||
                            (event.shiftKey && event.key === 'F10')
                          ) {
                            event.preventDefault();
                            const bounds = event.currentTarget.getBoundingClientRect();
                            setCellMenu({
                              row: rowIndex,
                              column: index,
                              x: bounds.left,
                              y: bounds.bottom,
                            });
                            return;
                          }
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            beginEdit(record, property);
                            return;
                          }
                          const offsets: Record<string, readonly [number, number]> = {
                            ArrowUp: [-1, 0],
                            ArrowDown: [1, 0],
                            ArrowLeft: [0, -1],
                            ArrowRight: [0, 1],
                          };
                          const offset = offsets[event.key];
                          if (!offset) return;
                          event.preventDefault();
                          focusCell(rowIndex + offset[0], index + offset[1], event.shiftKey);
                        }}
                        onCopy={(event) => {
                          if (cellEditing) return;
                          event.preventDefault();
                          event.clipboardData.setData('text/plain', rangeTsv(rowIndex, index));
                        }}
                        onPaste={(event) => {
                          if (
                            cellEditing ||
                            !onPaste ||
                            mutationLocked ||
                            ghostCreated ||
                            (event.target instanceof HTMLElement &&
                              event.target.closest('input, textarea, [contenteditable="true"]'))
                          ) {
                            return;
                          }
                          event.preventDefault();
                          applyTsvAtCell(
                            record,
                            property,
                            event.clipboardData.getData('text/plain'),
                          );
                        }}
                        onDragStart={(event) => {
                          if (ghostCreated || cellEditing) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData('text/plain', rangeTsv(rowIndex, index));
                        }}
                        onDragOver={(event) => {
                          if (!onPaste || mutationLocked || ghostCreated || cellEditing) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'copy';
                        }}
                        onDrop={(event) => {
                          if (!onPaste || mutationLocked || ghostCreated || cellEditing) return;
                          event.preventDefault();
                          applyTsvAtCell(
                            record,
                            property,
                            event.dataTransfer.getData('text/plain'),
                          );
                        }}
                      >
                        <DatabasePresenceBadges entries={cellPresence} scope="cell" />
                        {cellEditing ? (
                          <div className="flex min-w-56 items-center gap-1">
                            {property.type === 'checkbox' ? (
                              <Checkbox
                                autoFocus
                                checked={editing.draft === 'true'}
                                aria-label={`Edit ${property.name}`}
                                onCheckedChange={(checked) =>
                                  setEditing({
                                    ...editing,
                                    draft: checked === true ? 'true' : 'false',
                                  })
                                }
                              />
                            ) : property.type === 'text' ? (
                              <DatabaseRichTextCellEditor
                                draft={editing.draft}
                                propertyName={property.name}
                                people={people}
                                records={relationRecords}
                                onDraftChange={(draft) => setEditing({ ...editing, draft })}
                                onSave={() => saveEdit(record, property)}
                                onCancel={() => cancelEdit(record, property)}
                              />
                            ) : property.type === 'date' ? (
                              <DatabaseDateCellEditor
                                key={`${record.id}:${property.id}`}
                                draft={editing.draft}
                                propertyName={property.name}
                                onDraftChange={(draft) => setEditing({ ...editing, draft })}
                              />
                            ) : property.type === 'files' ? (
                              <DatabaseFilesCellEditor
                                draft={editing.draft}
                                propertyName={property.name}
                                parentDocName={record.path}
                                fileStates={result.fileStates}
                                onDraftChange={(draft) => setEditing({ ...editing, draft })}
                              />
                            ) : property.type === 'place' ? (
                              <DatabasePlaceCellEditor
                                draft={editing.draft}
                                property={property}
                                onDraftChange={(draft) => setEditing({ ...editing, draft })}
                              />
                            ) : property.type === 'relation' ? (
                              <DatabaseRelationCellEditor
                                property={property}
                                draft={editing.draft}
                                knownRecords={relationRecords}
                                searchRecords={
                                  onRelationSearch
                                    ? (query) => onRelationSearch(property, query)
                                    : undefined
                                }
                                onDraftChange={(draft) => setEditing({ ...editing, draft })}
                              />
                            ) : property.type === 'select' || property.type === 'status' ? (
                              <Select
                                value={editing.draft}
                                onValueChange={(value) => setEditing({ ...editing, draft: value })}
                              >
                                <SelectTrigger size="sm" aria-label={`Edit ${property.name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {property.options
                                    .filter(
                                      (option) =>
                                        option.archived !== true || option.id === editing.draft,
                                    )
                                    .map((option) => (
                                      <SelectItem key={option.id} value={option.id}>
                                        {property.type === 'status' && 'groupId' in option
                                          ? `${
                                              property.groups.find(
                                                (group) => group.id === option.groupId,
                                              )?.name ?? 'Status'
                                            } · ${option.name}`
                                          : option.name}
                                        {option.archived === true ? ' (archived)' : ''}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            ) : property.type === 'multi_select' || property.type === 'person' ? (
                              <fieldset className="flex flex-wrap gap-2">
                                <legend className="sr-only">{`Edit ${property.name}`}</legend>
                                {(property.type === 'multi_select'
                                  ? property.options.map((option) => ({
                                      id: option.id,
                                      name: option.name,
                                      available: option.archived !== true,
                                      suffix: option.archived === true ? ' (archived)' : '',
                                    }))
                                  : people.map((person) => ({
                                      id: person.id,
                                      name: person.name,
                                      available: person.active,
                                      suffix: `${
                                        person.kind === 'agent' ? ` (${personLabels.agent})` : ''
                                      }${person.active ? '' : ` (${personLabels.inactive})`}`,
                                    }))
                                ).map((option) => {
                                  const selected = multiSelectDraftValues(editing.draft);
                                  if (!option.available && !selected.includes(option.id))
                                    return null;
                                  return (
                                    <div
                                      key={option.id}
                                      className="flex items-center gap-1 text-xs"
                                    >
                                      <Checkbox
                                        checked={selected.includes(option.id)}
                                        aria-label={`${option.name} for ${property.name}`}
                                        onCheckedChange={(checked) => {
                                          const next = new Set(selected);
                                          if (checked === true) {
                                            if (property.type === 'person' && !property.multiple) {
                                              next.clear();
                                            }
                                            next.add(option.id);
                                          } else next.delete(option.id);
                                          setEditing({
                                            ...editing,
                                            draft: JSON.stringify([...next]),
                                          });
                                        }}
                                      />
                                      {option.name}
                                      {option.suffix}
                                    </div>
                                  );
                                })}
                              </fieldset>
                            ) : (
                              <Input
                                autoFocus
                                dir="auto"
                                value={editing.draft}
                                type={property.type === 'number' ? 'number' : 'text'}
                                step={property.type === 'number' ? 'any' : undefined}
                                inputMode={property.type === 'number' ? 'decimal' : undefined}
                                aria-label={`Edit ${property.name}`}
                                onChange={(event) =>
                                  setEditing({
                                    ...editing,
                                    draft: event.currentTarget.value,
                                  })
                                }
                                onKeyDown={(event) => {
                                  if (event.nativeEvent.isComposing) return;
                                  if (event.key === 'Enter') saveEdit(record, property);
                                  if (event.key === 'Escape') cancelEdit(record, property);
                                }}
                                className="h-8"
                              />
                            )}
                            {property.type !== 'text' ? (
                              <>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label="Save cell edit"
                                  onClick={() => saveEdit(record, property)}
                                >
                                  <Check />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label="Cancel cell edit"
                                  onClick={() => cancelEdit(record, property)}
                                >
                                  <X />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        ) : computedResult?.kind === 'error' ? (
                          <span
                            className="inline-flex max-w-full items-center gap-1 text-destructive"
                            role="status"
                            aria-label={shownText}
                          >
                            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{computedResult.problem.code}</span>
                          </span>
                        ) : linkHref ? (
                          <div className="flex min-w-0 items-center gap-1">
                            <a
                              href={linkHref}
                              target={property.type === 'url' ? '_blank' : undefined}
                              rel={property.type === 'url' ? 'noopener noreferrer' : undefined}
                              className="min-w-0 truncate text-azure-blue underline underline-offset-2"
                              aria-label={`Open ${property.name} for record ${record.id}`}
                              onClick={(event) => dispatchExternalLinkClick(event, linkHref)}
                              onAuxClick={(event) => {
                                if (event.button === 1) dispatchExternalLinkClick(event, linkHref);
                              }}
                            >
                              {String(shownValue)}
                            </a>
                            <DatabaseValueCopyButton
                              value={String(shownValue)}
                              label={`${property.name} for record ${record.id}`}
                            />
                            {onEdit && !ghostCreated ? (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                disabled={mutationLocked || proposed}
                                aria-label={`Edit ${property.name} for record ${record.id}`}
                                onClick={() => beginEdit(record, property)}
                              >
                                <Pencil />
                              </Button>
                            ) : null}
                          </div>
                        ) : property.type === 'button' && !ghostCreated ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={mutationLocked || proposed || !onInvokeButton}
                            aria-label={`${property.label} for record ${record.id}`}
                            onClick={() => onInvokeButton?.(record, property)}
                          >
                            {property.label}
                          </Button>
                        ) : property.type === 'verification' && !ghostCreated ? (
                          <div className="flex min-w-0 flex-wrap items-center gap-1">
                            <Badge
                              variant={
                                verificationProjection?.status === 'verified'
                                  ? 'primary'
                                  : verificationProjection?.status === 'expired' ||
                                      verificationProjection?.status === 'stale'
                                    ? 'warning'
                                    : 'gray'
                              }
                              title={
                                verificationProjection?.verifiedBy
                                  ? `${verificationProjection.status} · ${verificationProjection.verifiedBy.kind} · ${verificationProjection.verifiedBy.principal_id}`
                                  : 'unverified'
                              }
                            >
                              {shownText}
                            </Badge>
                            {onVerificationAction ? (
                              verificationProjection?.storedState === 'verified' ? (
                                <>
                                  {property.allowExpiry ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={mutationLocked || proposed}
                                      onClick={() =>
                                        onVerificationAction(record, property, 'renew')
                                      }
                                    >
                                      <Trans>Renew</Trans>
                                    </Button>
                                  ) : null}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={mutationLocked || proposed}
                                    onClick={() =>
                                      onVerificationAction(record, property, 'unverify')
                                    }
                                  >
                                    <Trans>Unverify</Trans>
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={mutationLocked || proposed || !record.evidenceRevision}
                                  onClick={() => onVerificationAction(record, property, 'verify')}
                                >
                                  <Trans>Verify</Trans>
                                </Button>
                              )
                            ) : null}
                          </div>
                        ) : property.type === 'place' &&
                          property.externalMap === 'explicit' &&
                          databasePlaceMapHref(shownValue) ? (
                          <div className="flex min-w-0 items-center gap-1">
                            {isDatabaseCellEditable(property) && onEdit && !ghostCreated ? (
                              <Button
                                variant="ghost"
                                disabled={mutationLocked || proposed}
                                className="h-auto min-w-0 justify-start px-1 py-0.5 font-inherit"
                                aria-label={`Edit ${property.name} for record ${record.id}`}
                                onClick={() => beginEdit(record, property)}
                              >
                                <span className="truncate">{shownText}</span>
                              </Button>
                            ) : (
                              <span className="truncate">{shownText}</span>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Open ${property.name} in OpenStreetMap; shares stored coordinates`}
                              title="OpenStreetMap receives the stored coordinates only after this click"
                              onClick={() => {
                                const href = databasePlaceMapHref(shownValue);
                                if (href) openExternalUrl(href);
                              }}
                            >
                              <MapPin aria-hidden="true" />
                            </Button>
                          </div>
                        ) : isDatabaseCellEditable(property) && onEdit && !ghostCreated ? (
                          <Button
                            variant="ghost"
                            disabled={mutationLocked || proposed}
                            className="h-auto max-w-full justify-start px-1 py-0.5 font-inherit"
                            aria-label={`Edit ${property.name} for record ${record.id}`}
                            onClick={() => beginEdit(record, property)}
                          >
                            {invalidValue !== undefined ? (
                              <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                            ) : null}
                            <span
                              className={cn(
                                property.type === 'text'
                                  ? 'line-clamp-3 whitespace-pre-wrap text-left'
                                  : 'truncate',
                              )}
                            >
                              {shownText}
                            </span>
                          </Button>
                        ) : (
                          shownText
                        )}
                      </TableCell>
                    );
                  })(),
                )}
                <TableCell
                  role="gridcell"
                  aria-colindex={properties.length + 2}
                  className="sticky right-0 z-10 bg-background text-right"
                >
                  {proposedDeletion ? (
                    <Badge variant="warning">
                      <Trans>Proposed deletion</Trans>
                    </Badge>
                  ) : proposedArchiveAction ? (
                    <Badge variant="warning">
                      {proposedArchiveAction === 'archive' ? (
                        <Trans>Proposed archive</Trans>
                      ) : (
                        <Trans>Proposed restore</Trans>
                      )}
                    </Badge>
                  ) : proposedMove ? (
                    <Badge variant="warning">
                      <Trans>Proposed move</Trans>
                    </Badge>
                  ) : !ghostCreated ? (
                    <div className="flex justify-end gap-1">
                      {record.archivedAt ? (
                        <Badge variant="gray">
                          <Trans>Archived</Trans>
                        </Badge>
                      ) : null}
                      {onOpen ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={mutationLocked || proposedRecord !== undefined}
                          aria-label={`Open record ${record.id}`}
                          onClick={() => onOpen(record)}
                        >
                          <ExternalLink />
                        </Button>
                      ) : null}
                      {onOpenContextInspector ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={mutationLocked || proposedRecord !== undefined}
                          aria-label={`Inspect context for record ${record.id}`}
                          onClick={() => onOpenContextInspector(record)}
                        >
                          <Braces aria-hidden="true" />
                        </Button>
                      ) : null}
                      {onDuplicate ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={mutationLocked || proposedRecord !== undefined}
                          aria-label={`Duplicate record ${record.id}`}
                          onClick={() => onDuplicate(record)}
                        >
                          <Copy />
                        </Button>
                      ) : null}
                      {onArchive ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={mutationLocked || proposedRecord !== undefined}
                          aria-label={`${
                            record.archivedAt ? 'Restore' : 'Archive'
                          } record ${record.id}`}
                          onClick={() =>
                            onArchive(record, record.archivedAt ? 'restore' : 'archive')
                          }
                        >
                          {record.archivedAt ? <RotateCcw /> : <Archive />}
                        </Button>
                      ) : null}
                      {onRequestMove ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={mutationLocked || proposedRecord !== undefined}
                          aria-label={`Move record ${record.id}`}
                          onClick={() => onRequestMove(record)}
                        >
                          <MoveRight />
                        </Button>
                      ) : null}
                      {onDelete ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={mutationLocked || proposedRecord !== undefined}
                          aria-label={`Delete record ${record.id}`}
                          onClick={() => onDelete(record)}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
          {virtualized && virtualEnd < tableRecords.length ? (
            <TableRow aria-hidden="true" noHover>
              <TableCell
                colSpan={properties.length + 2}
                className="p-0"
                style={{
                  height: (tableRecords.length - virtualEnd) * rowHeightPixels,
                }}
              />
            </TableRow>
          ) : null}
          {onCreateRecord ? (
            <TableRow
              aria-rowindex={tableRecords.length + 2}
              data-new-record-row
              data-canonical="false"
              className="border-primary/30 border-dashed bg-primary/5"
            >
              <TableCell role="gridcell" aria-colindex={1} className="sticky left-0 z-20 w-10" />
              {properties.map((property, index) => (
                <TableCell
                  key={property.id}
                  role="gridcell"
                  aria-colindex={index + 2}
                  className={cn(
                    index === 0 && 'sticky left-10 z-10 font-medium',
                    layout.wrap ? 'whitespace-normal' : 'whitespace-nowrap',
                  )}
                  style={{
                    minWidth: layout.widths[property.id],
                    width: layout.widths[property.id],
                    maxWidth: layout.widths[property.id],
                  }}
                >
                  {index === 0 && property.type === 'title' ? (
                    <Input
                      data-testid="database-new-row-title"
                      aria-label="New row title"
                      placeholder={t`New record title`}
                      disabled={mutationLocked}
                      className="h-8"
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          const title = event.currentTarget.value.trim();
                          if (title) {
                            event.currentTarget.value = '';
                            onCreateRecord(title);
                          } else {
                            setEditError(t`A record title is required`);
                          }
                        }
                        if (event.key === 'Escape') {
                          event.currentTarget.value = '';
                          setEditError(null);
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  ) : null}
                </TableCell>
              ))}
              <TableCell
                role="gridcell"
                aria-colindex={properties.length + 2}
                className="sticky right-0 z-10"
              >
                <span className="text-muted-foreground text-xs">{t`Press Enter to add`}</span>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
        {Object.keys(calculations).length > 0 ? (
          <TableFooter className="sticky bottom-0 z-20 bg-background">
            <TableRow noHover data-testid="database-calculation-row">
              <TableCell className="sticky left-0 z-20 bg-background" />
              {properties.map((property, index) => {
                const calculation = calculations[property.id];
                const resultValue = result.aggregation?.calculations.find(
                  (candidate) =>
                    candidate.propertyId === property.id && candidate.function === calculation,
                );
                let shown = '—';
                if (resultValue?.value !== null && resultValue?.value !== undefined) {
                  shown =
                    resultValue.unit === 'percentage'
                      ? `${String(resultValue.value)}%`
                      : property.type === 'number' && typeof resultValue.value === 'number'
                        ? formatDatabaseNumber(resultValue.value, property)
                        : String(resultValue.value);
                }
                return (
                  <TableCell
                    key={property.id}
                    className={cn(
                      'bg-background text-muted-foreground text-xs',
                      index === 0 && 'sticky left-10 z-10',
                    )}
                    style={{
                      minWidth: layout.widths[property.id],
                      width: layout.widths[property.id],
                      maxWidth: layout.widths[property.id],
                    }}
                  >
                    {calculation ? (
                      <span title={`${calculation.replaceAll('_', ' ')} over all matched records`}>
                        {calculation.replaceAll('_', ' ')}: {shown}
                      </span>
                    ) : null}
                  </TableCell>
                );
              })}
              <TableCell className="sticky right-0 bg-background" />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
      {cellMenu
        ? (() => {
            const record = result.records[cellMenu.row];
            const property = properties[cellMenu.column];
            if (!record || !property) return null;
            const close = () => setCellMenu(null);
            return (
              <div
                ref={cellMenuRef}
                role="menu"
                aria-label="Database cell actions"
                className="fixed z-[100] min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                style={{ left: cellMenu.x, top: cellMenu.y }}
                onKeyDown={(event) => {
                  const items = [
                    ...event.currentTarget.querySelectorAll<HTMLElement>(
                      '[role="menuitem"]:not([disabled])',
                    ),
                  ];
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    close();
                    tableHostRef.current
                      ?.querySelector<HTMLElement>(
                        `[data-database-cell-row="${cellMenu.row}"][data-database-cell-column="${cellMenu.column}"]`,
                      )
                      ?.focus();
                    return;
                  }
                  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const current = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? items.length - 1
                        : event.key === 'ArrowDown'
                          ? (current + 1) % items.length
                          : (current - 1 + items.length) % items.length;
                  items[next]?.focus();
                }}
              >
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    copyCellRange(cellMenu.row, cellMenu.column);
                    close();
                  }}
                >
                  <Copy /> <Trans>Copy selected cells</Trans>
                </Button>
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  disabled={mutationLocked || !onEdit || !isDatabaseCellEditable(property)}
                  onClick={() => {
                    beginEdit(record, property);
                    close();
                  }}
                >
                  <Pencil /> <Trans>Edit cell</Trans>
                </Button>
                {onOpen ? (
                  <Button
                    role="menuitem"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    disabled={mutationLocked}
                    onClick={() => {
                      onOpen(record);
                      close();
                    }}
                  >
                    <ExternalLink /> <Trans>Open record</Trans>
                  </Button>
                ) : null}
                {onOpenContextInspector ? (
                  <Button
                    role="menuitem"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    disabled={mutationLocked}
                    onClick={() => {
                      onOpenContextInspector(record);
                      close();
                    }}
                  >
                    <Braces /> <Trans>Inspect record context</Trans>
                  </Button>
                ) : null}
                {onDuplicate ? (
                  <Button
                    role="menuitem"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    disabled={mutationLocked}
                    onClick={() => {
                      onDuplicate(record);
                      close();
                    }}
                  >
                    <Copy /> <Trans>Duplicate record</Trans>
                  </Button>
                ) : null}
                {onArchive ? (
                  <Button
                    role="menuitem"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    disabled={mutationLocked}
                    onClick={() => {
                      onArchive(record, record.archivedAt ? 'restore' : 'archive');
                      close();
                    }}
                  >
                    {record.archivedAt ? <RotateCcw /> : <Archive />}
                    {record.archivedAt ? (
                      <Trans>Restore record</Trans>
                    ) : (
                      <Trans>Archive record</Trans>
                    )}
                  </Button>
                ) : null}
                {onRequestMove ? (
                  <Button
                    role="menuitem"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    disabled={mutationLocked}
                    onClick={() => {
                      onRequestMove(record);
                      close();
                    }}
                  >
                    <MoveRight /> <Trans>Move record</Trans>
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button
                    role="menuitem"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-destructive"
                    disabled={mutationLocked}
                    onClick={() => {
                      onDelete(record);
                      close();
                    }}
                  >
                    <Trash2 /> <Trans>Delete record</Trans>
                  </Button>
                ) : null}
              </div>
            );
          })()
        : null}
    </div>
  );
}

function SourceList({
  candidates,
  selected,
  onSelect,
}: {
  candidates: readonly DatabaseCatalogCandidate[];
  selected: DatabaseTableSelection | null;
  onSelect: (selection: DatabaseTableSelection) => void;
}) {
  return (
    <nav aria-label="Databases" className="space-y-4">
      {candidates.map((database) => (
        <section key={database.id}>
          <div className="mb-1 flex items-center gap-2 px-2 font-medium text-sm">
            <Database className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{database.name}</span>
          </div>
          <div className="space-y-1">
            {database.sources.map((source) => (
              <Button
                key={source.id}
                variant="ghost"
                className={cn(
                  'h-auto w-full justify-start px-3 py-2 text-left',
                  selected?.sourceId === source.id && 'bg-muted',
                )}
                onClick={() => onSelect({ databaseId: database.id, sourceId: source.id })}
              >
                <Table2 className="size-4" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{source.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {source.recordMeaning}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}

export function DatabaseTableDialog({
  open,
  onOpenChange,
  onOpenRecord,
  onOpenContextInspector,
  onCreationCancelled,
  initialTarget,
  initialAction,
  initialRecordAction,
  initialTablePaste,
  initialDatabaseSurface,
  initialPropertyId,
  initialSelectedRecordIds,
  presentation = 'dialog',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRecord?: (path: string) => void;
  onOpenContextInspector?: (scope?: DatabaseContextInspectionScope) => void;
  onCreationCancelled?: () => void;
  initialTarget?: DatabaseTableTarget;
  initialAction?: 'create';
  initialRecordAction?: DatabaseInitialRecordAction;
  /** Paste changes forwarded from an inline view into the canonical review surface. */
  initialTablePaste?: readonly DatabasePasteChange[];
  /** Optional reviewed surface to open when an inline view delegates a control. */
  initialDatabaseSurface?: 'properties' | 'view-settings' | 'view-manager' | 'filters';
  initialPropertyId?: string;
  initialSelectedRecordIds?: readonly string[];
  presentation?: 'dialog' | 'page';
}) {
  'use no memo';
  const { t } = useLingui();
  const initialDatabaseId = initialTarget?.databaseId;
  const initialSourceId = initialTarget?.sourceId;
  const initialViewId = initialTarget?.viewId;
  const personLabels = { agent: t`agent`, inactive: t`inactive` };
  const [candidates, setCandidates] = useState<DatabaseCatalogCandidate[]>([]);
  const [selection, setSelection] = useState<DatabaseTableSelection | null>(() =>
    initialDatabaseId && initialSourceId
      ? { databaseId: initialDatabaseId, sourceId: initialSourceId }
      : null,
  );
  const [description, setDescription] = useState<DatabaseDescription | null>(null);
  const [result, setResult] = useState<DatabaseQueryResult | null>(null);
  const [offlineCachedAt, setOfflineCachedAt] = useState<number | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>('idle');
  const [tableStatus, setTableStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<DatabaseUiProblem | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [ghost, setGhost] = useState<DatabaseGhostState | null>(null);
  const [mutationStatus, setMutationStatus] = useState<
    'idle' | 'planning' | 'review' | 'committing'
  >('idle');
  const [mutationReviewMode, setMutationReviewMode] = useState<'required' | 'automatic'>(
    'required',
  );
  const [saveFeedback, setSaveFeedback] = useState<'saved' | 'queued' | 'failed' | null>(null);
  const [optimisticCellValues, setOptimisticCellValues] = useState<
    Map<string, DatabaseValue | undefined>
  >(() => new Map());
  const [mutationError, setMutationError] = useState<DatabaseUiProblem | null>(null);
  const [mutationConflict, setMutationConflict] = useState<{
    plan: Parameters<typeof executeReviewedDatabasePlan>[0]['plan'];
    replan?: () => void;
  } | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<OfflineDatabaseMutation[]>([]);
  const [offlineQueueMessage, setOfflineQueueMessage] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [pageError, setPageError] = useState<DatabaseUiProblem | null>(null);
  const [newRecordOpen, setNewRecordOpen] = useState(false);
  const [newRecordTemplateId, setNewRecordTemplateId] = useState('__auto__');
  const [creationOpen, setCreationOpen] = useState(false);
  const [onboardingTarget, setOnboardingTarget] = useState<DatabaseSourceOnboardingTarget | null>(
    null,
  );
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [newRecordTitle, setNewRecordTitle] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(
    () => new Set(initialSelectedRecordIds ?? []),
  );
  const [bulkPropertyId, setBulkPropertyId] = useState<string>('');
  const [bulkDraft, setBulkDraft] = useState('');
  const [relationCandidates, setRelationCandidates] = useState<ProjectedDatabaseRelationRecord[]>(
    [],
  );
  const [lastUndoToken, setLastUndoToken] = useState<string | null>(null);
  const [undoStatus, setUndoStatus] = useState<'idle' | 'checking' | 'applying'>('idle');
  const [lastRedoToken, setLastRedoToken] = useState<string | null>(null);
  const [redoStatus, setRedoStatus] = useState<'idle' | 'checking' | 'applying'>('idle');
  const [showArchived, setShowArchived] = useState(initialRecordAction?.kind === 'restore');
  const [moveRecord, setMoveRecord] = useState<ProjectedDatabaseRecord | null>(null);
  const [moveTargetSourceId, setMoveTargetSourceId] = useState('');
  const [tableCalculations, setTableCalculations] = useState<
    Record<string, DatabaseCalculationFunction>
  >({});
  const [selectedViewId, setSelectedViewId] = useState(initialViewId ?? '');
  const [draggedViewId, setDraggedViewId] = useState<string | null>(null);
  const [dragOverViewId, setDragOverViewId] = useState<string | null>(null);
  const [pageFavorite, setPageFavorite] = useState(false);
  const [pageTitleEditing, setPageTitleEditing] = useState(false);
  const [pageTitleDraft, setPageTitleDraft] = useState('');
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [viewManagerOpen, setViewManagerOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [recordPeek, setRecordPeek] = useState<{
    record: ProjectedDatabaseRecord;
    mode: 'side_peek' | 'center_peek';
  } | null>(null);
  const [csvStatus, setCsvStatus] = useState<
    'idle' | 'exporting-current' | 'exporting-all' | 'exporting-json' | 'importing'
  >('idle');
  const [importPreview, setImportPreview] = useState<{
    filename: string;
    inspection: DatabaseImportInspection;
  } | null>(null);
  const [optionPropertyId, setOptionPropertyId] = useState('');
  const [optionId, setOptionId] = useState('');
  const [optionName, setOptionName] = useState('');
  const [optionColor, setOptionColor] = useState('');
  const [optionMergeTargetId, setOptionMergeTargetId] = useState('');
  const [optionStatus, setOptionStatus] = useState<'idle' | 'loading'>('idle');
  const [computedPropertyId, setComputedPropertyId] = useState<string | null>(null);
  const [uniqueIdPropertyId, setUniqueIdPropertyId] = useState<string | null>(null);
  const [placePropertyId, setPlacePropertyId] = useState<string | null>(null);
  const [conversionPropertyId, setConversionPropertyId] = useState<string | null>(null);
  const [propertiesDialogOpen, setPropertiesDialogOpen] = useState(false);
  const [propertiesDialogRenameId, setPropertiesDialogRenameId] = useState<string | null>(null);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [propertiesRemoveStatus, setPropertiesRemoveStatus] = useState<'idle' | 'loading'>('idle');
  const [buttonPlan, setButtonPlan] = useState<DatabaseButtonPlan | null>(null);
  const [buttonStatus, setButtonStatus] = useState<'idle' | 'planning' | 'committing'>('idle');
  const [optionPreview, setOptionPreview] = useState<{
    change: DatabaseSelectOptionChange;
    preview: DatabaseSelectOptionPreview;
    desiredState: DatabaseDesiredStateDraftInput | null;
  } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const pageTitleInputRef = useRef<HTMLInputElement>(null);
  const initialCreationActionHandledRef = useRef(false);
  const reviewResolver = useRef<((approved: boolean) => void) | null>(null);
  const handledInitialRecordAction = useRef<string | null>(null);
  const handledInitialTablePaste = useRef<string | null>(null);
  const handledInitialDatabaseSurface = useRef<string | null>(null);
  const handledInitialSelectedRecordIds = useRef<string | null>(null);
  const creationPageFlowRef = useRef(false);
  const queueReconciliationRunning = useRef(false);
  const offlineCacheKey = selection
    ? databaseOfflineCacheKey({
        ...selection,
        viewId: selectedViewId,
        showArchived,
        calculations: tableCalculations,
      })
    : null;
  const databasePageTitle =
    description?.source?.name ??
    description?.database.name ??
    (initialAction === 'create' ? t`New database` : t`Database`);
  const scopedOfflineQueue = selection
    ? offlineQueue.filter(
        (item) => item.databaseId === selection.databaseId && item.sourceId === selection.sourceId,
      )
    : [];
  const remotePresence = useRemoteDatabasePresence();
  const schemaSurfaceOpen =
    filterDialogOpen ||
    viewSettingsOpen ||
    viewManagerOpen ||
    templatesOpen ||
    automationsOpen ||
    permissionsOpen ||
    computedPropertyId !== null ||
    uniqueIdPropertyId !== null ||
    placePropertyId !== null ||
    conversionPropertyId !== null;
  useDatabasePresenceTarget(
    open && selection && (schemaSurfaceOpen || mutationStatus !== 'idle')
      ? {
          databaseId: selection.databaseId,
          sourceId: selection.sourceId,
          recordId: null,
          propertyId: null,
          viewId: selectedViewId || null,
          scope: 'schema',
          operation:
            mutationStatus === 'committing'
              ? 'committing'
              : mutationStatus === 'planning' || mutationStatus === 'review'
                ? 'planning'
                : 'editing',
        }
      : null,
  );

  useEffect(() => {
    if (!open || !initialDatabaseId || !initialSourceId) return;
    setSelection({
      databaseId: initialDatabaseId,
      sourceId: initialSourceId,
    });
    setSelectedViewId(initialViewId ?? '');
  }, [open, initialDatabaseId, initialSourceId, initialViewId]);

  useEffect(() => {
    if (!open) {
      initialCreationActionHandledRef.current = false;
      return;
    }
    if (initialAction === 'create' && !initialCreationActionHandledRef.current) {
      initialCreationActionHandledRef.current = true;
      setCreationOpen(true);
    }
  }, [open, initialAction]);

  useEffect(() => {
    if (open && initialAction === 'create' && presentation === 'page') {
      creationPageFlowRef.current = true;
      return;
    }
    // Keep the creation intent while the mutation is in flight. The app shell
    // may normalize the ephemeral hash before the commit response returns.
    if (open && initialAction !== 'create' && presentation !== 'page') {
      creationPageFlowRef.current = false;
    }
  }, [open, initialAction, presentation]);

  useEffect(() => {
    if (!open || typeof indexedDB === 'undefined') return;
    let active = true;
    void offlineDatabaseMutationStore
      .list()
      .then((items) => {
        if (active) setOfflineQueue(items);
      })
      .catch((cause: unknown) => {
        if (active) {
          setMutationError(
            classifyDatabaseUiProblem(cause, 'Unable to read queued database writes'),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleOnline = () => setRefresh((current) => current + 1);
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [open]);

  useEffect(() => {
    if (!saveFeedback) return;
    const timeout = window.setTimeout(() => setSaveFeedback(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [saveFeedback]);

  useEffect(() => {
    void open;
    void selection?.databaseId;
    void selection?.sourceId;
    void selectedViewId;
    setRecordPeek(null);
    setOptimisticCellValues(new Map());
  }, [open, selection?.databaseId, selection?.sourceId, selectedViewId]);

  useEffect(() => {
    const favoriteDatabaseId = selection?.databaseId;
    const favoriteSourceId = selection?.sourceId;
    if (!favoriteDatabaseId || !favoriteSourceId) {
      setPageFavorite(false);
      return;
    }
    setPageFavorite(
      isDatabasePageFavorite({ databaseId: favoriteDatabaseId, sourceId: favoriteSourceId }),
    );
  }, [selection]);

  useEffect(() => {
    if (!pageTitleEditing) setPageTitleDraft(databasePageTitle);
  }, [databasePageTitle, pageTitleEditing]);

  useEffect(() => {
    if (pageTitleEditing) pageTitleInputRef.current?.focus();
  }, [pageTitleEditing]);

  const finishReview = (approved: boolean) => {
    const resolve = reviewResolver.current;
    reviewResolver.current = null;
    setMutationStatus(approved ? 'committing' : 'idle');
    resolve?.(approved);
  };

  const searchRelationCandidates = async (
    property: Extract<DatabaseProperty, { type: 'relation' }>,
    query: string,
  ): Promise<ProjectedDatabaseRelationRecord[]> => {
    if (!description) return [];
    const found = await searchDatabaseRelationRecords(description.database, property, query);
    setRelationCandidates((current) => [
      ...new Map([...current, ...found].map((record) => [record.id, record])).values(),
    ]);
    return found;
  };

  const runMutation = (
    desiredState: DatabaseDesiredStateDraftInput,
    idempotencyPrefix: string,
    failureMessage: string,
    options: {
      assertions?: { databaseAbsent?: boolean; createdRecords?: number };
      review?: 'required' | 'automatic';
      policy?: DatabaseUiMutationPolicyInput;
      optimisticCellKey?: string;
      onCommitted?: (
        outcome: Extract<ExecuteDatabaseUiMutationResult, { status: 'committed' }>,
      ) => void;
      onFailed?: () => void;
    } = {},
  ) => {
    const idempotencyKey = `${idempotencyPrefix}-${crypto.randomUUID()}`;
    setMutationError(null);
    setMutationConflict(null);
    setOfflineQueueMessage(null);
    setSaveFeedback(null);
    const reviewMode = options.policy
      ? databaseUiMutationReviewMode(options.policy)
      : (options.review ?? 'required');
    setMutationReviewMode(reviewMode);
    setMutationStatus('planning');
    void executeDatabaseUiMutation({
      desiredState,
      actor: { principalId: 'user:local' },
      idempotencyKey,
      ...(options.assertions ? { assertions: options.assertions } : {}),
      review:
        reviewMode === 'automatic'
          ? () => true
          : () =>
              new Promise<boolean>((resolve) => {
                reviewResolver.current = resolve;
                setMutationStatus('review');
              }),
      ...(reviewMode === 'required' ? { onGhostStateChange: setGhost } : {}),
    })
      .then((outcome) => {
        if (outcome.status === 'blocked') {
          setMutationConflict({ plan: outcome.plan });
          setMutationError(
            databaseConflictProblem(
              outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
                'The database change is blocked by the current canonical state',
            ),
          );
        }
        if (outcome.status === 'committed') {
          setSaveFeedback('saved');
          setLastUndoToken(outcome.result.undoToken);
          setLastRedoToken(null);
          setSelectedRecordIds(new Set());
          setTableStatus('loading');
          setRefresh((current) => current + 1);
          options.onCommitted?.(outcome);
        }
        if (options.optimisticCellKey) {
          setOptimisticCellValues((current) => {
            if (!current.has(options.optimisticCellKey as string)) return current;
            const next = new Map(current);
            next.delete(options.optimisticCellKey as string);
            return next;
          });
        }
        setMutationStatus('idle');
      })
      .catch(async (cause: unknown) => {
        if (options.optimisticCellKey) {
          setOptimisticCellValues((current) => {
            if (!current.has(options.optimisticCellKey as string)) return current;
            const next = new Map(current);
            next.delete(options.optimisticCellKey as string);
            return next;
          });
        }
        setMutationStatus('idle');
        const problem = classifyDatabaseUiProblem(cause, failureMessage);
        if (problem.kind === 'conflict' && cause instanceof DatabasePlanExecutionError) {
          setMutationConflict({
            plan: cause.plan,
            replan: () => runMutation(desiredState, idempotencyPrefix, failureMessage, options),
          });
        }
        const recordMutations = offlineQueueableRecordMutations(desiredState);
        if (problem.kind === 'offline' && selection && recordMutations) {
          try {
            const queued = createOfflineDatabaseMutation({
              databaseId: selection.databaseId,
              sourceId: selection.sourceId,
              branch: getBranchSnapshot(),
              serverInstanceId: getServerInstanceId(),
              recordMutations,
              actor: { principalId: 'user:local' },
              idempotencyKey,
              label: failureMessage,
            });
            await enqueueOfflineDatabaseMutation(offlineDatabaseMutationStore, queued);
            setOfflineQueue(await offlineDatabaseMutationStore.list());
            setOfflineQueueMessage(
              'Write queued locally. It will be replanned against current data and require review after reconnecting.',
            );
            setSaveFeedback('queued');
            setMutationError(null);
            return;
          } catch (queueError) {
            setMutationError(
              classifyDatabaseUiProblem(queueError, 'Unable to store the offline database write'),
            );
            return;
          }
        }
        setSaveFeedback('failed');
        setMutationError(problem);
        options.onFailed?.();
      });
  };

  const reconcileQueuedWrites = useEffectEvent(async () => {
    if (!selection || queueReconciliationRunning.current || typeof indexedDB === 'undefined') {
      return;
    }
    const branch = getBranchSnapshot();
    const serverInstanceId = getServerInstanceId();
    if (!branch || !serverInstanceId) return;
    queueReconciliationRunning.current = true;
    setOfflineQueueMessage(null);
    try {
      const reconciliation = await reconcileOfflineDatabaseMutations({
        store: offlineDatabaseMutationStore,
        branch,
        serverInstanceId,
        shouldProcess: (item) =>
          item.databaseId === selection.databaseId && item.sourceId === selection.sourceId,
        execute: async (item) => {
          setMutationStatus('planning');
          const current = await describeDatabase({
            databaseId: item.databaseId,
            sourceId: item.sourceId,
          });
          if (!current.source) return 'blocked';
          const outcome = await executeDatabaseUiMutation({
            desiredState: rebaseQueuedDatabaseRecordMutations({
              database: current.database,
              recordMutations: item.recordMutations,
            }),
            actor: item.actor,
            idempotencyKey: item.idempotencyKey,
            review: () =>
              new Promise<boolean>((resolve) => {
                reviewResolver.current = resolve;
                setMutationStatus('review');
              }),
            onGhostStateChange: setGhost,
          });
          if (outcome.status === 'committed') {
            setLastUndoToken(outcome.result.undoToken);
            setLastRedoToken(null);
          }
          return outcome.status;
        },
        isOfflineError: (cause) =>
          classifyDatabaseUiProblem(cause, 'Offline queue reconciliation failed').kind ===
          'offline',
      });
      setOfflineQueue(await offlineDatabaseMutationStore.list());
      if (reconciliation.committed.length > 0 || reconciliation.converged.length > 0) {
        setOfflineQueueMessage(
          `${reconciliation.committed.length} queued write(s) committed and ${reconciliation.converged.length} already converged.`,
        );
        setRefresh((current) => current + 1);
      } else if (reconciliation.blocked.length > 0) {
        setOfflineQueueMessage(
          `${reconciliation.blocked.length} queued write(s) need attention because the workspace or canonical data changed.`,
        );
      }
    } catch (cause) {
      const problem = classifyDatabaseUiProblem(cause, 'Offline queue reconciliation failed');
      if (problem.kind !== 'offline') setMutationError(problem);
    }
    setMutationStatus('idle');
    queueReconciliationRunning.current = false;
  });

  const discardQueuedWrites = () => {
    if (!selection) return;
    const scoped = offlineQueue.filter(
      (item) => item.databaseId === selection.databaseId && item.sourceId === selection.sourceId,
    );
    if (scoped.length === 0) return;
    if (!window.confirm(`Discard ${scoped.length} queued database write(s)?`)) return;
    void Promise.all(scoped.map((item) => offlineDatabaseMutationStore.delete(item.id)))
      .then(() => offlineDatabaseMutationStore.list())
      .then((items) => {
        setOfflineQueue(items);
        setOfflineQueueMessage('Queued writes discarded.');
      })
      .catch((cause: unknown) =>
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to discard queued writes')),
      );
  };

  const runReviewedPlan = (
    plan: Parameters<typeof executeReviewedDatabasePlan>[0]['plan'],
    idempotencyPrefix: string,
    failureMessage: string,
  ) => {
    if (mutationStatus !== 'idle') return;
    setMutationError(null);
    setMutationConflict(null);
    setSaveFeedback(null);
    setMutationStatus('planning');
    void executeReviewedDatabasePlan({
      plan,
      actor: { principalId: 'user:local' },
      idempotencyKey: `${idempotencyPrefix}-${crypto.randomUUID()}`,
      review: () =>
        new Promise<boolean>((resolve) => {
          reviewResolver.current = resolve;
          setMutationStatus('review');
        }),
      onGhostStateChange: setGhost,
    })
      .then((outcome) => {
        if (outcome.status === 'blocked') {
          setMutationConflict({ plan: outcome.plan });
          setMutationError(
            databaseConflictProblem(
              outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
                'The property conversion is blocked by the current canonical state',
            ),
          );
        }
        if (outcome.status === 'committed') {
          setSaveFeedback('saved');
          setLastUndoToken(outcome.result.undoToken);
          setLastRedoToken(null);
          setSelectedRecordIds(new Set());
          setTableStatus('loading');
          setRefresh((current) => current + 1);
        }
        setMutationStatus('idle');
      })
      .catch((cause: unknown) => {
        setMutationStatus('idle');
        if (cause instanceof DatabasePlanExecutionError) {
          setMutationConflict({ plan: cause.plan });
        }
        setMutationError(classifyDatabaseUiProblem(cause, failureMessage));
      });
  };

  const planButton = (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'button' }>,
  ) => {
    if (!selection || !record.revision || buttonStatus !== 'idle' || mutationStatus !== 'idle') {
      return;
    }
    setMutationError(null);
    setButtonPlan(null);
    setButtonStatus('planning');
    void createDatabaseButtonPlan({
      databaseId: selection.databaseId,
      sourceId: selection.sourceId,
      recordId: record.id,
      propertyId: property.id,
      expectedRecordRevision: record.revision,
    })
      .then((plan) => setButtonPlan(plan))
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to plan the Button action'));
      })
      .finally(() => setButtonStatus('idle'));
  };

  const planDatabaseActionButton = (buttonId: string) => {
    if (!selection || buttonStatus !== 'idle' || mutationStatus !== 'idle') return;
    setMutationError(null);
    setButtonPlan(null);
    setButtonStatus('planning');
    void createDatabaseButtonPlan({
      databaseId: selection.databaseId,
      buttonId,
    })
      .then((plan) => setButtonPlan(plan))
      .catch((cause: unknown) => {
        setMutationError(
          classifyDatabaseUiProblem(cause, 'Unable to plan the database Button action'),
        );
      })
      .finally(() => setButtonStatus('idle'));
  };

  const commitButton = () => {
    if (!buttonPlan || buttonStatus !== 'idle' || mutationStatus !== 'idle') {
      return;
    }
    setButtonStatus('committing');
    setMutationError(null);
    void executeDatabaseButtonPlan({
      plan: buttonPlan,
      actor: { principalId: 'user:local' },
      idempotencyKey: `ui-button-${crypto.randomUUID()}`,
    })
      .then((result) => {
        if (result.undoToken) {
          setLastUndoToken(result.undoToken);
          setLastRedoToken(null);
        }
        if (result.run.state === 'succeeded') {
          setButtonPlan(null);
          setTableStatus('loading');
          setRefresh((current) => current + 1);
          return;
        }
        throw new Error(
          result.run.state === 'retry_wait'
            ? 'The database change committed and external delivery is queued for retry.'
            : result.run.error || 'Button execution failed',
        );
      })
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to run the Button action'));
      })
      .finally(() => setButtonStatus('idle'));
  };

  const editCell = (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    value: DatabaseValue | undefined,
  ) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      const optimisticCellKey = `${record.id}:${property.id}`;
      setOptimisticCellValues((current) => {
        const next = new Map(current);
        next.set(optimisticCellKey, value);
        return next;
      });
      runMutation(
        createDatabaseCellMutationDesiredState({
          database: description.database,
          source: description.source,
          record,
          property,
          value,
        }),
        'ui-cell',
        'Database cell edit failed',
        {
          policy: { operation: 'cell', actor: 'human', principalId: 'user:local' },
          optimisticCellKey,
        },
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the cell edit'));
    }
  };

  const changeVerification = (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'verification' }>,
    action: 'verify' | 'renew' | 'unverify',
  ) => {
    if (!description?.source || mutationStatus !== 'idle' || !record.revision) return;
    if (action !== 'unverify' && !record.evidenceRevision) {
      setMutationError(
        classifyDatabaseUiProblem(null, 'The current evidence revision is unavailable'),
      );
      return;
    }
    setMutationError(null);
    setMutationStatus('planning');
    const lifecycleBase = {
      databaseId: description.database.id,
      sourceId: description.source.id,
      recordId: record.id,
      propertyId: property.id,
      expectedRevision: record.revision,
    } as const;
    const lifecycle =
      action === 'renew'
        ? {
            ...lifecycleBase,
            action,
            expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            evidenceRevision: record.evidenceRevision as string,
          }
        : action === 'verify'
          ? {
              ...lifecycleBase,
              action,
              evidenceRevision: record.evidenceRevision as string,
            }
          : { ...lifecycleBase, action };
    void createDatabaseVerificationPlan({
      lifecycle,
      actor: { principalId: 'user:local' },
    })
      .then(async ({ plan }) => {
        const outcome = await executeReviewedDatabasePlan({
          plan,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-verification-${crypto.randomUUID()}`,
          assertions: { databaseAbsent: false, createdRecords: 1 },
          review: () =>
            new Promise<boolean>((resolve) => {
              reviewResolver.current = resolve;
              setMutationStatus('review');
            }),
          onGhostStateChange: setGhost,
        });
        if (outcome.status === 'blocked') {
          setMutationError(
            databaseConflictProblem(
              outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
                'The Verification change is blocked by the current canonical state',
            ),
          );
        }
        if (outcome.status === 'committed') {
          setLastUndoToken(outcome.result.undoToken);
          setLastRedoToken(null);
          setTableStatus('loading');
          setRefresh((current) => current + 1);
        }
      })
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Verification change failed'));
      })
      .finally(() => setMutationStatus('idle'));
  };

  const createRecord = (title = newRecordTitle) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      const desiredState = createDatabaseRecordDesiredState({
        database: description.database,
        source: description.source,
        title,
        ...(newRecordTemplateId === '__auto__'
          ? { viewId: selectedView?.id }
          : newRecordTemplateId === '__blank__'
            ? { body: '', skipTemplate: true }
            : { templateId: newRecordTemplateId }),
      });
      setNewRecordOpen(false);
      setNewRecordTitle('');
      runMutation(desiredState, 'ui-record-create', 'Database record creation failed', {
        policy: { operation: 'record-create', actor: 'human', principalId: 'user:local' },
      });
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the new record'));
    }
  };

  const deleteRecord = (record: ProjectedDatabaseRecord) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseRecordDeletionDesiredState({
          database: description.database,
          source: description.source,
          record,
        }),
        'ui-record-delete',
        'Database record deletion failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the record deletion'));
    }
  };

  const duplicateRecord = (record: ProjectedDatabaseRecord) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseRecordCopyDesiredState({
          database: description.database,
          source: description.source,
          record,
        }),
        'ui-record-copy',
        'Database record duplication failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the record duplicate'));
    }
  };

  const changeArchiveState = (record: ProjectedDatabaseRecord, action: 'archive' | 'restore') => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseRecordArchiveDesiredState({
          database: description.database,
          source: description.source,
          record,
          action,
        }),
        `ui-record-${action}`,
        `Database record ${action} failed`,
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, `Unable to prepare the record ${action}`));
    }
  };

  const planMove = () => {
    if (!description?.source || !moveRecord || mutationStatus !== 'idle') return;
    const targetSource = description.database.sources.find(
      (source) => source.id === moveTargetSourceId,
    );
    if (!targetSource) {
      setMutationError(classifyDatabaseUiProblem(null, 'Choose a valid target source'));
      return;
    }
    try {
      runMutation(
        createDatabaseRecordMoveDesiredState({
          database: description.database,
          source: description.source,
          targetSource,
          record: moveRecord,
        }),
        'ui-record-move',
        'Database record move failed',
      );
      setMoveRecord(null);
      setMoveTargetSourceId('');
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the record move'));
    }
  };

  const applyInitialRecordAction = useEffectEvent(
    (action: DatabaseInitialRecordAction, record?: ProjectedDatabaseRecord) => {
      if (action.kind === 'create') {
        setNewRecordOpen(true);
        return;
      }
      if (!record) return;
      switch (action.kind) {
        case 'duplicate':
          duplicateRecord(record);
          break;
        case 'move':
          setMoveRecord(record);
          setMoveTargetSourceId('');
          break;
        case 'archive':
        case 'restore':
          changeArchiveState(record, action.kind);
          break;
        case 'delete':
          deleteRecord(record);
          break;
        case 'transition': {
          if (!description?.source) return;
          const changes = action.changes.map((change) => {
            const property = description.source?.properties.find(
              (candidate) => candidate.id === change.propertyId,
            );
            if (!property)
              throw new Error(`Board transition property ${change.propertyId} is missing`);
            return { record, property, value: change.value };
          });
          runMutation(
            createDatabaseTablePasteDesiredState({
              database: description.database,
              source: description.source,
              changes,
            }),
            'ui-board-transition',
            'Board transition failed',
          );
          break;
        }
      }
    },
  );

  useEffect(() => {
    if (!open || !initialRecordAction || !description?.source || !result) return;
    const actionKey =
      initialRecordAction.kind === 'create'
        ? 'create'
        : `${initialRecordAction.kind}:${initialRecordAction.recordId}:${
            initialRecordAction.kind === 'transition'
              ? JSON.stringify(initialRecordAction.changes)
              : ''
          }`;
    if (handledInitialRecordAction.current === actionKey) return;
    if (initialRecordAction.kind === 'create') {
      handledInitialRecordAction.current = actionKey;
      applyInitialRecordAction(initialRecordAction);
      return;
    }
    const record = result.records.find(
      (candidate) => candidate.id === initialRecordAction.recordId,
    );
    if (!record) return;
    handledInitialRecordAction.current = actionKey;
    applyInitialRecordAction(initialRecordAction, record);
  }, [open, initialRecordAction, description, result]);

  const bulkProperty = description?.source?.properties.find(
    (property) => property.id === bulkPropertyId && isDatabaseCellEditable(property),
  );

  const planBulkEdit = () => {
    if (!description?.source || !result || !bulkProperty || mutationStatus !== 'idle') return;
    try {
      const records = result.records.filter((record) => selectedRecordIds.has(record.id));
      const value = parseDatabaseCellDraft(bulkProperty, bulkDraft, description.database.people);
      runMutation(
        createDatabaseBulkCellMutationDesiredState({
          database: description.database,
          source: description.source,
          records,
          property: bulkProperty,
          value,
        }),
        'ui-record-bulk',
        'Bulk database edit failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the bulk edit'));
    }
  };

  const planBulkCheckboxToggle = () => {
    if (
      !description?.source ||
      !result ||
      bulkProperty?.type !== 'checkbox' ||
      mutationStatus !== 'idle'
    ) {
      return;
    }
    try {
      const records = result.records.filter((record) => selectedRecordIds.has(record.id));
      runMutation(
        createDatabaseBulkCheckboxToggleDesiredState({
          database: description.database,
          source: description.source,
          records,
          property: bulkProperty,
        }),
        'ui-checkbox-toggle',
        'Bulk checkbox toggle failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the checkbox toggle'));
    }
  };

  const planTablePaste = useEffectEvent((changes: readonly DatabasePasteChange[]) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: description.database,
          source: description.source,
          changes,
        }),
        'ui-table-paste',
        'Database TSV paste failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the TSV paste'));
    }
  });

  useEffect(() => {
    if (!open || !initialTablePaste?.length || !description?.source || !result) return;
    const actionKey = initialTablePaste
      .map((change) => `${change.record.id}:${change.property.id}:${JSON.stringify(change.value)}`)
      .join('|');
    if (handledInitialTablePaste.current === actionKey) return;
    handledInitialTablePaste.current = actionKey;
    planTablePaste(initialTablePaste);
  }, [open, initialTablePaste, description, result]);

  useEffect(() => {
    if (!open || !initialDatabaseSurface || !description?.source || !result) return;
    const surfaceKey = `${initialDatabaseSurface}:${initialPropertyId ?? ''}`;
    if (handledInitialDatabaseSurface.current === surfaceKey) return;
    handledInitialDatabaseSurface.current = surfaceKey;
    if (initialDatabaseSurface === 'properties') {
      setPropertiesDialogRenameId(initialPropertyId ?? null);
      setPropertiesDialogOpen(true);
      return;
    }
    if (initialDatabaseSurface === 'view-manager') {
      setViewManagerOpen(true);
      return;
    }
    if (initialDatabaseSurface === 'filters') {
      setFilterDialogOpen(true);
      return;
    }
    setViewSettingsOpen(true);
  }, [open, initialDatabaseSurface, initialPropertyId, description, result]);

  useEffect(() => {
    if (!open || !initialSelectedRecordIds?.length || !result) return;
    const selectionKey = initialSelectedRecordIds.join('|');
    if (handledInitialSelectedRecordIds.current === selectionKey) return;
    handledInitialSelectedRecordIds.current = selectionKey;
    const available = new Set(result.records.map((record) => record.id));
    setSelectedRecordIds(
      new Set(initialSelectedRecordIds.filter((recordId) => available.has(recordId))),
    );
  }, [open, initialSelectedRecordIds, result]);

  const planBoardTransition = (transition: DatabaseBoardTransition) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: description.database,
          source: description.source,
          changes: transition.changes.map((change) => ({
            record: transition.record,
            property: change.property,
            value: change.value,
          })),
        }),
        'ui-board-transition',
        'Board transition failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the Board transition'));
    }
  };

  const planTimelineChange = (change: DatabaseTimelineChange) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: description.database,
          source: description.source,
          changes: change.changes.map((item) => ({
            record: change.record,
            property: item.property,
            value: item.value,
          })),
        }),
        'ui-timeline-date-change',
        'Timeline date change failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the Timeline change'));
    }
  };

  const planCalendarChange = (change: DatabaseCalendarChange) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: description.database,
          source: description.source,
          changes: change.changes.map((item) => ({
            record: change.record,
            property: item.property,
            value: item.value,
          })),
        }),
        'ui-calendar-date-change',
        'Calendar date change failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the Calendar change'));
    }
  };

  const copySelectedRecords = () => {
    if (!description?.source || !result || selectedRecordIds.size === 0) return;
    if (!navigator.clipboard?.writeText) {
      setMutationError(
        classifyDatabaseUiProblem(new Error('Clipboard access is unavailable'), 'Copy failed'),
      );
      return;
    }
    const records = result.records.filter((record) => selectedRecordIds.has(record.id));
    const tsv = databaseRecordsToTsv({
      source: description.source,
      records,
      people: description.database.people,
    });
    void navigator.clipboard.writeText(tsv).catch((cause: unknown) => {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to copy selected records'));
    });
  };

  const collectDatabaseSnapshot = async (scope: 'current' | 'all') => {
    if (!selection) throw new Error('Select a database source first');
    let exported: DatabaseQueryResult | null = null;
    let cursor: string | undefined;
    do {
      const page = await queryDatabase({
        ...selection,
        query: {
          sort: [],
          includeArchived: scope === 'all' ? true : showArchived,
          page: { limit: 500, ...(cursor ? { cursor } : {}) },
        },
      });
      exported = exported ? appendDatabaseQueryPage(exported, page) : page;
      if (exported.returned > DATABASE_EXPORT_RECORD_LIMIT) {
        throw new Error(
          `A complete browser snapshot is limited to ${DATABASE_EXPORT_RECORD_LIMIT} records; narrow the source first`,
        );
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    if (!exported) throw new Error('Database query returned no snapshot');
    if (!exported.isComplete || exported.nextCursor !== null) {
      throw new Error('Database query did not return a complete snapshot');
    }
    return exported;
  };

  const exportDatabase = (format: 'csv' | 'json', scope: 'current' | 'all') => {
    if (!selection || !description?.source || csvStatus !== 'idle') return;
    const selectedSource = description.source;
    const selectedDescription = description;
    setCsvStatus(
      format === 'json'
        ? 'exporting-json'
        : scope === 'all'
          ? 'exporting-all'
          : 'exporting-current',
    );
    setMutationError(null);
    void (async () => {
      const exported = await collectDatabaseSnapshot(scope);
      const sourceFilename = selectedSource.key.replaceAll(/[^a-zA-Z0-9_-]/g, '-');
      const scopeFilename = scope === 'all' ? 'all' : 'current';
      if (format === 'csv') {
        downloadTextFile(
          databaseRecordsToCsv({
            source: selectedSource,
            records: exported.records,
            people: selectedDescription.database.people,
          }),
          `${sourceFilename}-${scopeFilename}.csv`,
          'text/csv;charset=utf-8',
        );
      } else {
        downloadTextFile(
          databaseSnapshotToJson({
            database: selectedDescription.database,
            source: selectedSource,
            manifestRevision: selectedDescription.manifestRevision,
            schemaRevision: selectedDescription.schemaRevision,
            indexRevision: selectedDescription.index.revision,
            result: exported,
            scope,
          }),
          `${sourceFilename}-${scopeFilename}.json`,
          'application/json;charset=utf-8',
        );
      }
    })()
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to export database data'));
      })
      .finally(() => setCsvStatus('idle'));
  };

  const prepareSelectOptionChange = (change: DatabaseSelectOptionChange) => {
    if (!description?.source || !result || optionStatus !== 'idle' || mutationStatus !== 'idle') {
      return;
    }
    const selectedDatabase = description.database;
    const selectedSource = description.source;
    const property = selectedSource.properties.find(
      (candidate): candidate is DatabaseSelectProperty =>
        candidate.id === optionPropertyId && isDatabaseSelectProperty(candidate),
    );
    if (!property) return;
    const requiresComplete = change.kind === 'merge' || change.kind === 'delete';
    setOptionStatus('loading');
    setOptionPreview(null);
    setMutationError(null);
    void (async () => {
      const snapshot = requiresComplete ? await collectDatabaseSnapshot('all') : result;
      const preview = previewDatabaseSelectOptionChange({
        definition: selectedDatabase,
        sourceId: selectedSource.id,
        propertyId: property.id,
        records: snapshot.records,
        change,
      });
      let desiredState: DatabaseDesiredStateDraftInput | null = null;
      if (preview.canApply) {
        try {
          desiredState = createDatabaseSelectOptionChangeDesiredState({
            database: selectedDatabase,
            source: selectedSource,
            property,
            records: snapshot.records,
            recordsComplete:
              requiresComplete || (snapshot.isComplete && snapshot.nextCursor === null),
            change,
          }).desiredState;
        } catch (cause) {
          setMutationError(
            classifyDatabaseUiProblem(cause, 'Unable to compile the Select option change'),
          );
        }
      }
      setOptionPreview({ change, preview, desiredState });
    })()
      .catch((cause: unknown) => {
        setMutationError(
          classifyDatabaseUiProblem(cause, 'Unable to preview the Select option change'),
        );
      })
      .finally(() => setOptionStatus('idle'));
  };

  const planSelectOptionChange = () => {
    if (!optionPreview?.desiredState || mutationStatus !== 'idle') return;
    runMutation(
      optionPreview.desiredState,
      'ui-select-option',
      'Database Select option change failed',
    );
    setOptionPreview(null);
  };

  const addSchemaProperty = (input: { name: string; type: DatabasePropertyType }) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    const selectedSource = description.source;
    const selectedDatabase = description.database;
    setPropertiesError(null);
    try {
      const key = databasePropertyKeyFromName(
        input.name,
        selectedSource.properties.map((property) => property.key),
      );
      const property =
        input.type === 'select' || input.type === 'multi_select'
          ? { key, name: input.name, type: input.type, options: [] }
          : input.type === 'place'
            ? {
                key,
                name: input.name,
                type: input.type,
                externalSearch: 'disabled' as const,
                externalMap: 'disabled' as const,
              }
            : { key, name: input.name, type: input.type };
      const desiredState = createDatabaseAddPropertyDesiredState({
        database: selectedDatabase,
        source: selectedSource,
        property,
      });
      setPropertiesDialogOpen(false);
      runMutation(desiredState, 'ui-add-property', 'Add database property failed');
    } catch (cause) {
      setPropertiesError(classifyDatabaseUiProblem(cause, 'Unable to add the property').message);
    }
  };

  const renameSchemaProperty = (property: DatabaseProperty, name: string) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseRenamePropertyDesiredState({
          database: description.database,
          source: description.source,
          property,
          name,
        }),
        'ui-rename-property',
        'Rename database property failed',
      );
      setPropertiesDialogOpen(false);
      setPropertiesDialogRenameId(null);
    } catch (cause) {
      setPropertiesError(classifyDatabaseUiProblem(cause, 'Unable to rename the property').message);
    }
  };

  const removeSchemaProperty = (property: DatabaseProperty) => {
    if (!description?.source || mutationStatus !== 'idle' || propertiesRemoveStatus !== 'idle') {
      return;
    }
    const selectedSource = description.source;
    const selectedDatabase = description.database;
    setPropertiesError(null);
    setPropertiesRemoveStatus('loading');
    void collectDatabaseSnapshot('all')
      .then((snapshot) => {
        const unsetDesiredState = createDatabaseUnsetPropertyValuesDesiredState({
          database: selectedDatabase,
          source: selectedSource,
          property,
          records: snapshot.records,
          recordsComplete: snapshot.isComplete && snapshot.nextCursor === null,
        });
        setPropertiesDialogOpen(false);
        // Removing a property is two reviewed commits, never one: values must
        // be unset (a record-mutation patch, which preserves record body)
        // WHILE the property still exists, before the schema drops it. See
        // createDatabaseUnsetPropertyValuesDesiredState's comment for why a
        // single combined desired state cannot do this safely.
        //
        // The two commits are NEVER auto-chained back to back: firing the
        // second commit immediately after the first resolves reproducibly
        // hangs the server (confirmed manually — two commits against the
        // same database issued back to back can wedge the commit engine's
        // transaction-active state, even though each succeeds cleanly when
        // issued in isolation; this is the exact "two commits racing the
        // same database" gap R-008's evidence matrix already flags). Commit
        // only the unset here; once it settles, "Delete" finds zero
        // affected records and takes the single-step schema-removal path
        // on the next click.
        if (unsetDesiredState) {
          runMutation(
            unsetDesiredState,
            'ui-unset-property',
            'Unset database property value failed',
          );
        } else {
          const desiredState = createDatabaseRemovePropertyDesiredState({
            database: selectedDatabase,
            source: selectedSource,
            property,
          });
          runMutation(desiredState, 'ui-remove-property', 'Remove database property failed');
        }
      })
      .catch((cause: unknown) => {
        setPropertiesError(
          classifyDatabaseUiProblem(cause, 'Unable to remove the property').message,
        );
      })
      .finally(() => setPropertiesRemoveStatus('idle'));
  };

  const reorderSchemaProperties = (orderedPropertyIds: string[]) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    const selectedSource = description.source;
    const selectedDatabase = description.database;
    setPropertiesError(null);
    try {
      const desiredState = createDatabaseReorderPropertiesDesiredState({
        database: selectedDatabase,
        source: selectedSource,
        orderedPropertyIds,
      });
      setPropertiesDialogOpen(false);
      runMutation(desiredState, 'ui-reorder-properties', 'Reorder database properties failed');
    } catch (cause) {
      setPropertiesError(
        classifyDatabaseUiProblem(cause, 'Unable to reorder the properties').message,
      );
    }
  };

  const inspectImportFile = (file: File) => {
    if (!description?.source || csvStatus !== 'idle' || mutationStatus !== 'idle') return;
    const selectedSource = description.source;
    setCsvStatus('importing');
    setMutationError(null);
    void file
      .arrayBuffer()
      .then((buffer) =>
        inspectDatabaseImport({
          source: selectedSource,
          people: description.database.people,
          bytes: new Uint8Array(buffer),
          filename: file.name,
        }),
      )
      .then((inspection) => setImportPreview({ filename: file.name, inspection }))
      .catch((cause: unknown) => {
        setImportPreview(null);
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to inspect database import'));
      })
      .finally(() => setCsvStatus('idle'));
  };

  const commitImportPreview = () => {
    if (!selection || !description?.source || csvStatus !== 'idle' || mutationStatus !== 'idle') {
      return;
    }
    if (!importPreview || importPreview.inspection.issues.length > 0) return;
    const selectedSource = description.source;
    const selectedDatabase = description.database;
    const selectedAddress = selection;
    const inspection = importPreview.inspection;
    setCsvStatus('importing');
    setMutationError(null);
    void (async () => {
      const recordIds = databaseDelimitedRecordIds(
        selectedSource,
        inspection.contents,
        inspection.delimiter,
      );
      if (recordIds.length === 0) throw new Error('Import file has no record rows');
      const records = await Promise.all(
        recordIds.map((recordId) =>
          fetchDatabaseRecord({ ...selectedAddress, recordId }).then((lookup) => lookup.record),
        ),
      );
      const changes = planDatabaseDelimitedImport({
        source: selectedSource,
        people: selectedDatabase.people,
        contents: inspection.contents,
        delimiter: inspection.delimiter,
        records,
      });
      if (changes.length === 0) throw new Error('Import file has no property changes');
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: selectedDatabase,
          source: selectedSource,
          changes,
        }),
        'ui-delimited-import',
        'Database CSV/TSV import failed',
      );
      setImportPreview(null);
    })()
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to import database CSV/TSV'));
      })
      .finally(() => setCsvStatus('idle'));
  };

  const undoLastChange = () => {
    if (!lastUndoToken || undoStatus !== 'idle' || mutationStatus !== 'idle') return;
    const token = lastUndoToken;
    setMutationError(null);
    setUndoStatus('checking');
    void previewDatabaseUiUndo(token)
      .then((preview) => {
        if (!preview.canApply) {
          const reason = preview.conflicts[0]?.reason ?? 'the canonical state changed';
          throw new Error(`Undo is no longer safe: ${reason}`);
        }
        setUndoStatus('applying');
        return applyDatabaseUiUndo({
          undoToken: token,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-undo-${crypto.randomUUID()}`,
        });
      })
      .then((outcome) => {
        if (!outcome.canApply || outcome.receipt?.status !== 'applied') {
          throw new Error('The database undo was refused');
        }
        setLastUndoToken(null);
        setLastRedoToken(token);
        setSelectedRecordIds(new Set());
        setTableStatus('loading');
        setRefresh((current) => current + 1);
      })
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Database undo failed'));
      })
      .finally(() => setUndoStatus('idle'));
  };

  const redoLastChange = () => {
    if (!lastRedoToken || redoStatus !== 'idle' || mutationStatus !== 'idle') return;
    const token = lastRedoToken;
    setMutationError(null);
    setRedoStatus('checking');
    void previewDatabaseUiRedo(token)
      .then((preview) => {
        if (!preview.canApply) {
          const reason = preview.conflicts[0]?.reason ?? 'the canonical state changed';
          throw new Error(`Redo is no longer safe: ${reason}`);
        }
        setRedoStatus('applying');
        return applyDatabaseUiRedo({
          undoToken: token,
          actor: { principalId: 'user:local' },
          idempotencyKey: `ui-redo-${crypto.randomUUID()}`,
        });
      })
      .then((outcome) => {
        if (!outcome.canApply || outcome.receipt?.status !== 'applied') {
          throw new Error('The database redo was refused');
        }
        setLastRedoToken(null);
        setLastUndoToken(token);
        setSelectedRecordIds(new Set());
        setTableStatus('loading');
        setRefresh((current) => current + 1);
      })
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Database redo failed'));
      })
      .finally(() => setRedoStatus('idle'));
  };

  const requestedViewLayout = description?.database.views.find((view) => view.id === selectedViewId)
    ?.layout.type;
  const loadedRecordLimit = databaseBrowserLoadedRecordLimit(requestedViewLayout);

  const loadMore = () => {
    if (!selection || !result?.nextCursor || pageStatus === 'loading') return;
    const nextPageLimit = databaseBrowserNextPageLimit(requestedViewLayout, result.records.length);
    if (nextPageLimit === 0) return;
    const cursor = result.nextCursor;
    setPageStatus('loading');
    setPageError(null);
    void queryDatabase({
      ...selection,
      ...(selectedViewId ? { viewId: selectedViewId } : {}),
      query: {
        sort: [],
        includeArchived: showArchived,
        aggregate:
          requestedViewLayout === 'board' ||
          requestedViewLayout === 'timeline' ||
          requestedViewLayout === 'calendar' ||
          requestedViewLayout === 'list' ||
          requestedViewLayout === 'gallery' ||
          requestedViewLayout === 'chart'
            ? undefined
            : databaseTableAggregate(tableCalculations),
        page: { limit: nextPageLimit, cursor },
      },
    })
      .then((next) => {
        setResult((current) => (current ? appendDatabaseQueryPage(current, next) : next));
        setPageStatus('idle');
      })
      .catch((cause: unknown) => {
        setPageStatus('error');
        setPageError(classifyDatabaseUiProblem(cause, 'Unable to load the next database page'));
      });
  };
  const handleDatabaseShortcut = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    const isUndo = key === 'z' && !event.shiftKey;
    const isRedo = (key === 'z' && event.shiftKey) || key === 'y';
    if (!isUndo && !isRedo) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }
    if (
      mutationStatus !== 'idle' ||
      undoStatus !== 'idle' ||
      redoStatus !== 'idle' ||
      (isUndo && !lastUndoToken) ||
      (isRedo && !lastRedoToken)
    ) {
      return;
    }
    event.preventDefault();
    if (isRedo) redoLastChange();
    else if (lastUndoToken) undoLastChange();
  };

  useEffect(() => {
    void refresh;
    if (!open) return;
    const controller = new AbortController();
    setCatalogStatus('loading');
    setError(null);
    void fetchDatabaseCatalog({ signal: controller.signal })
      .then((catalog) => {
        cacheDatabaseCatalog(catalog.candidates);
        setCandidates(catalog.candidates);
        setSelection((current) => {
          if (
            current &&
            catalog.candidates.some(
              (database) =>
                database.id === current.databaseId &&
                database.sources.some((source) => source.id === current.sourceId),
            )
          ) {
            return current;
          }
          const database = catalog.candidates[0];
          const source = database?.sources[0];
          return database && source ? { databaseId: database.id, sourceId: source.id } : null;
        });
        setCatalogStatus('success');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const problem = classifyDatabaseUiProblem(cause, 'Unable to load databases');
        const cached = problem.kind === 'offline' ? readCachedDatabaseCatalog() : null;
        if (cached) setCandidates(cached.candidates);
        setError(problem);
        setCatalogStatus('error');
      });
    return () => controller.abort();
  }, [open, refresh]);

  useEffect(() => {
    void refresh;
    if (!open || !selection) {
      setDescription(null);
      setResult(null);
      setOfflineCachedAt(null);
      setRelationCandidates([]);
      setTableStatus('idle');
      return;
    }
    const controller = new AbortController();
    setRelationCandidates([]);
    setButtonPlan(null);
    setTableStatus('loading');
    setPageStatus('idle');
    setPageError(null);
    setError(null);
    void Promise.all([
      describeDatabase(selection, { signal: controller.signal }),
      queryDatabase(
        {
          ...selection,
          ...(selectedViewId ? { viewId: selectedViewId } : {}),
          query: {
            sort: [],
            includeArchived: showArchived,
            aggregate:
              requestedViewLayout === 'board' ||
              requestedViewLayout === 'timeline' ||
              requestedViewLayout === 'calendar' ||
              requestedViewLayout === 'list' ||
              requestedViewLayout === 'gallery' ||
              requestedViewLayout === 'chart'
                ? undefined
                : databaseTableAggregate(tableCalculations),
            page: { limit: 100 },
          },
        },
        { signal: controller.signal },
      ),
    ])
      .then(([nextDescription, nextResult]) => {
        if (!nextDescription.source || nextDescription.source.id !== selection.sourceId) {
          throw new Error('Database description omitted the selected source');
        }
        const availableViewIds = nextDescription.database.views
          .filter((view) => view.sourceId === nextDescription.source?.id)
          .map((view) => view.id);
        if (selectedViewId && !availableViewIds.includes(selectedViewId)) {
          setSelectedViewId('');
          return;
        }
        if (!selectedViewId) {
          const lastOpened = loadDatabaseLastOpenedView(
            selection.databaseId,
            selection.sourceId,
            availableViewIds,
          );
          const preferredViewId = lastOpened ?? nextDescription.source.defaultViewId ?? '';
          if (preferredViewId) {
            setSelectedViewId(preferredViewId);
            return;
          }
        }
        setDescription(nextDescription);
        setResult(nextResult);
        setOfflineCachedAt(null);
        if (offlineCacheKey) {
          cacheDatabaseSnapshot(offlineCacheKey, {
            description: nextDescription,
            result: nextResult,
          });
        }
        const availableRecordIds = new Set(nextResult.records.map((record) => record.id));
        setSelectedRecordIds(
          new Set(
            (initialSelectedRecordIds ?? []).filter((recordId) => availableRecordIds.has(recordId)),
          ),
        );
        setBulkPropertyId('');
        setBulkDraft('');
        const firstSelect = nextDescription.source.properties.find(isDatabaseSelectProperty);
        const firstOption = firstSelect?.options[0];
        setOptionPropertyId(firstSelect?.id ?? '');
        setOptionId(firstOption?.id ?? '');
        setOptionName(firstOption?.name ?? '');
        setOptionColor(firstOption?.color ?? '');
        setOptionMergeTargetId(
          firstSelect?.options.find(
            (option) => option.id !== firstOption?.id && option.archived !== true,
          )?.id ?? '',
        );
        setOptionPreview(null);
        setTableStatus('success');
        void reconcileQueuedWrites();
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const problem = classifyDatabaseUiProblem(cause, 'Unable to load database records');
        const cached =
          problem.kind === 'offline' && offlineCacheKey
            ? readCachedDatabaseSnapshot(offlineCacheKey)
            : null;
        if (cached) {
          setDescription(cached.description);
          setResult(cached.result);
          setOfflineCachedAt(cached.cachedAt);
          setError(problem);
          setTableStatus('success');
          return;
        }
        setDescription(null);
        setResult(null);
        setOfflineCachedAt(null);
        setError(problem);
        setTableStatus('error');
      });
    return () => controller.abort();
  }, [
    open,
    refresh,
    selection,
    selectedViewId,
    showArchived,
    tableCalculations,
    requestedViewLayout,
    offlineCacheKey,
    initialSelectedRecordIds,
  ]);

  useEffect(() => {
    if (!open) return;
    return subscribeToDatabaseChanged((payload) => {
      if (
        payload.scope === 'workspace' ||
        !selection ||
        payload.databaseIds.includes(selection.databaseId)
      ) {
        setRefresh((value) => value + 1);
      }
    });
  }, [open, selection]);

  useEffect(() => {
    if (open) return;
    reviewResolver.current?.(false);
    reviewResolver.current = null;
    setGhost(null);
    setMutationStatus('idle');
    setButtonPlan(null);
    setButtonStatus('idle');
    setSelectedRecordIds(new Set());
    setDraggedViewId(null);
    setDragOverViewId(null);
  }, [open]);

  const loading = catalogStatus === 'loading' || tableStatus === 'loading';
  const selectProperties = description?.source?.properties.filter(isDatabaseSelectProperty) ?? [];
  const selectedOptionProperty = selectProperties.find(
    (property) => property.id === optionPropertyId,
  );
  const selectedOption = selectedOptionProperty?.options.find((option) => option.id === optionId);
  const computedProperty = description?.source?.properties.find(
    (property): property is Extract<DatabaseProperty, { type: 'formula' | 'rollup' }> =>
      property.id === computedPropertyId &&
      (property.type === 'formula' || property.type === 'rollup'),
  );
  const uniqueIdProperty = description?.source?.properties.find(
    (property): property is Extract<DatabaseProperty, { type: 'unique_id' }> =>
      property.id === uniqueIdPropertyId && property.type === 'unique_id',
  );
  const placeProperty = description?.source?.properties.find(
    (property): property is Extract<DatabaseProperty, { type: 'place' }> =>
      property.id === placePropertyId && property.type === 'place',
  );
  const conversionProperty = description?.source?.properties.find(
    (property) => property.id === conversionPropertyId,
  );
  const sourceViews =
    description?.database.views.filter((view) => view.sourceId === description.source?.id) ?? [];
  const selectedView = sourceViews.find((view) => view.id === selectedViewId);
  const selectedViewIndex = selectedView ? sourceViews.indexOf(selectedView) : -1;
  const selectView = (viewId: string) => {
    const nextViewId = viewId === '__all__' ? '' : viewId;
    setSelectedViewId(nextViewId);
    saveDatabaseLastOpenedView(
      description?.database.id ?? '',
      description?.source?.id ?? selection?.sourceId ?? '',
      nextViewId,
    );
    if (presentation === 'page' && selection) {
      window.location.hash = databasePageTargetToHash({
        databaseId: selection.databaseId,
        sourceId: selection.sourceId,
        ...(nextViewId ? { viewId: nextViewId } : {}),
      });
    }
    setFilterDialogOpen(false);
    setViewSettingsOpen(false);
    setTableCalculations({});
  };
  const reorderSavedView = (viewId: string, direction: -1 | 1) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseViewLifecycleChangeDesiredState({
          database: description.database,
          source: description.source,
          change: { kind: 'reorder', viewId, direction },
        }),
        'ui-view-reorder',
        'Saved view reorder failed',
        { policy: { operation: 'view', actor: 'human', principalId: 'user:local' } },
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare saved view reorder'));
    }
  };
  const reorderSavedViewTo = (viewId: string, targetViewId: string) => {
    if (
      !description?.source ||
      mutationStatus !== 'idle' ||
      viewId === targetViewId ||
      !sourceViews.some((view) => view.id === viewId) ||
      !sourceViews.some((view) => view.id === targetViewId)
    ) {
      return;
    }
    try {
      runMutation(
        createDatabaseViewLifecycleChangeDesiredState({
          database: description.database,
          source: description.source,
          change: { kind: 'reorder-to', viewId, targetViewId },
        }),
        'ui-view-reorder-drag',
        'Saved view reorder failed',
        { policy: { operation: 'view', actor: 'human', principalId: 'user:local' } },
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare saved view reorder'));
    } finally {
      setDraggedViewId(null);
      setDragOverViewId(null);
    }
  };
  const commitPageTitle = () => {
    if (!description?.source || mutationStatus !== 'idle') return;
    const nextTitle = pageTitleDraft.trim();
    if (!nextTitle) {
      setMutationError(
        classifyDatabaseUiProblem(new Error('A database page title is required'), 'Rename failed'),
      );
      return;
    }
    if (nextTitle === databasePageTitle) {
      setPageTitleEditing(false);
      return;
    }
    try {
      runMutation(
        createDatabasePageTitleDesiredState({
          database: description.database,
          source: description.source,
          name: nextTitle,
        }),
        'ui-database-page-title',
        'Database page rename failed',
        {
          policy: { operation: 'title', actor: 'human', principalId: 'user:local' },
          onCommitted: () => setPageTitleEditing(false),
        },
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the page rename'));
    }
  };
  const openRecord = (record: ProjectedDatabaseRecord) => {
    rememberDatabaseRecordNavigation({
      databaseId: selection?.databaseId ?? description?.database.id ?? '',
      sourceId: selection?.sourceId ?? description?.source?.id ?? '',
      viewId: selectedView?.id,
      paths: result?.records.map((item) => item.path) ?? [],
      currentPath: record.path,
    });
    const behavior = selectedView ? databaseViewOpenBehavior(selectedView) : 'full_page';
    if (behavior === 'full_page') {
      if (onOpenRecord) {
        onOpenRecord(record.path);
        onOpenChange(false);
      }
    } else {
      setRecordPeek({ record, mode: behavior });
    }
  };
  const compatibleMoveTargets = description?.source
    ? description.database.sources.flatMap((targetSource) => {
        const mapping = (description.database.sourceMappings ?? []).find(
          (candidate) =>
            candidate.sourceId === description.source?.id &&
            candidate.targetSourceId === targetSource.id,
        );
        return mapping ? [{ source: targetSource, mapping }] : [];
      })
    : [];
  return (
    <Dialog
      open={presentation === 'page' ? true : open}
      modal={presentation !== 'page'}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        showOverlay={presentation !== 'page'}
        className={cn(
          'sm:max-w-[min(96vw,90rem)]',
          presentation === 'page' &&
            'fixed inset-0 z-40 h-[100dvh] max-h-none max-w-none translate-x-0 translate-y-0 rounded-none bg-background p-0',
        )}
        data-database-workspace
        data-database-page-workspace={presentation === 'page' ? '' : undefined}
      >
        <DialogHeader
          className={cn(presentation === 'page' && 'border-b px-4 py-3 sm:px-6')}
          data-database-page-chrome={presentation === 'page' ? '' : undefined}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              {presentation === 'page' ? (
                <nav
                  aria-label={t`Database breadcrumbs`}
                  data-testid="database-page-breadcrumbs"
                  className="mb-1 flex min-w-0 items-center gap-1 text-muted-foreground text-xs"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="-ml-2 h-6 px-2"
                    onClick={() => onOpenChange(false)}
                    data-testid="database-page-back"
                  >
                    <ChevronLeft aria-hidden="true" />
                    <Trans>Databases</Trans>
                  </Button>
                  {description?.database ? (
                    <>
                      <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{description.database.name}</span>
                    </>
                  ) : null}
                  {description?.source ? (
                    <>
                      <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{description.source.name}</span>
                    </>
                  ) : null}
                </nav>
              ) : null}
              <DialogTitle
                data-testid={presentation === 'page' ? 'database-page-title' : undefined}
                className={cn(presentation === 'page' && 'flex items-center gap-2')}
              >
                {presentation === 'page' ? (
                  <>
                    <Database
                      className="size-5 shrink-0 text-primary"
                      aria-hidden="true"
                      data-testid="database-page-icon"
                    />
                    {pageTitleEditing ? (
                      <Input
                        ref={pageTitleInputRef}
                        value={pageTitleDraft}
                        aria-label="Database page title"
                        data-testid="database-page-title-input"
                        className="h-8 min-w-48 max-w-xl text-base"
                        onChange={(event) => setPageTitleDraft(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitPageTitle();
                          if (event.key === 'Escape') {
                            setPageTitleDraft(databasePageTitle);
                            setPageTitleEditing(false);
                          }
                        }}
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 min-w-0 justify-start truncate px-1 text-left hover:underline"
                        aria-label={t`Rename database page`}
                        data-testid="database-page-title-value"
                        onClick={() => {
                          setPageTitleDraft(databasePageTitle);
                          setPageTitleEditing(true);
                        }}
                      >
                        {databasePageTitle}
                      </Button>
                    )}
                  </>
                ) : (
                  <Trans>Databases</Trans>
                )}
              </DialogTitle>
              <DialogDescription>
                {presentation === 'page' ? (
                  <Trans>Database pages share canonical records with every linked view.</Trans>
                ) : (
                  <Trans>
                    Browse canonical Markdown records through a snapshot-consistent table.
                  </Trans>
                )}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {mutationStatus !== 'idle' || saveFeedback ? (
                <span
                  className="inline-flex items-center gap-1.5 self-center text-muted-foreground text-xs"
                  role="status"
                  aria-live="polite"
                  data-testid="database-save-indicator"
                  data-database-save-indicator
                  data-database-save-state={
                    mutationStatus !== 'idle' ? 'saving' : (saveFeedback ?? undefined)
                  }
                >
                  {mutationStatus === 'planning' || mutationStatus === 'committing' ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      <Trans>Saving change</Trans>
                    </>
                  ) : mutationStatus === 'review' ? (
                    <>
                      <AlertCircle className="size-3.5" aria-hidden="true" />
                      <Trans>Review required</Trans>
                    </>
                  ) : saveFeedback === 'queued' ? (
                    <>
                      <Check className="size-3.5" aria-hidden="true" />
                      <Trans>Saved locally · queued for reconnect</Trans>
                    </>
                  ) : saveFeedback === 'failed' ? (
                    <>
                      <AlertCircle className="size-3.5" aria-hidden="true" />
                      <Trans>Save failed</Trans>
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" aria-hidden="true" />
                      <Trans>Saved</Trans>
                    </>
                  )}
                </span>
              ) : null}
              <Button
                variant="default"
                size="sm"
                data-testid="database-create-button"
                onClick={() => setCreationOpen(true)}
              >
                <Plus /> <Trans>Create database</Trans>
              </Button>
              {description?.source && selection ? (
                <Button
                  type="button"
                  variant={pageFavorite ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label={
                    pageFavorite ? t`Remove database page favorite` : t`Favorite database page`
                  }
                  aria-pressed={pageFavorite}
                  data-testid="database-page-favorite"
                  onClick={() => {
                    const next = !pageFavorite;
                    setPageFavorite(next);
                    setDatabasePageFavorite(selection, next);
                  }}
                >
                  <Star aria-hidden="true" />
                </Button>
              ) : null}
              {description?.source && selection ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.location.hash = databasePageTargetToHash({
                      databaseId: description.database.id,
                      sourceId: description.source?.id ?? selection.sourceId,
                      ...(selectedViewId ? { viewId: selectedViewId } : {}),
                    });
                    onOpenChange(false);
                  }}
                >
                  <ExternalLink /> <Trans>Open page</Trans>
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => setRefresh((value) => value + 1)}
              >
                <RefreshCw className={cn(loading && 'animate-spin')} /> <Trans>Refresh</Trans>
              </Button>
            </div>
          </div>
        </DialogHeader>
        <DialogBody className="grid min-h-[min(34rem,70vh)] gap-0 p-0 md:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="overflow-y-auto border-b p-3 md:border-r md:border-b-0">
            {catalogStatus === 'loading' && candidates.length === 0 ? (
              <div
                className="flex items-center gap-2 p-3 text-muted-foreground"
                role="status"
                data-database-state="loading"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <Trans>Loading databases</Trans>
              </div>
            ) : null}
            {catalogStatus === 'success' && candidates.length === 0 ? (
              <div className="p-3 text-muted-foreground text-sm" data-database-state="empty">
                <Trans>No databases yet.</Trans>
              </div>
            ) : null}
            <SourceList
              candidates={candidates}
              selected={selection}
              onSelect={(nextSelection) => {
                setTableCalculations({});
                setSelectedViewId('');
                setFilterDialogOpen(false);
                setViewSettingsOpen(false);
                setViewManagerOpen(false);
                setSelection(nextSelection);
              }}
            />
          </aside>
          <main
            className="min-w-0 p-3 sm:p-5"
            data-database-redo-available={lastRedoToken ? 'true' : 'false'}
            onKeyDown={handleDatabaseShortcut}
          >
            {ghost && !description?.source ? (
              <div
                className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 border-dashed bg-primary/5 p-3"
                data-testid="database-creation-ghost-review"
                data-canonical="false"
              >
                <div>
                  <Badge variant="primary">
                    <Trans>Proposed database · not saved</Trans>
                  </Badge>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {ghost.diff.manifests.length} manifest · {ghost.diff.records.length} records ·{' '}
                    <Trans>review the exact plan before canonical creation</Trans>
                  </p>
                </div>
                {mutationStatus === 'review' ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => finishReview(false)}>
                      <Trans>Discard</Trans>
                    </Button>
                    <Button size="sm" onClick={() => finishReview(true)}>
                      <Trans>Commit creation</Trans>
                    </Button>
                  </div>
                ) : (
                  <Loader2
                    className="size-4 animate-spin"
                    aria-label="Committing database creation"
                  />
                )}
              </div>
            ) : null}
            {scopedOfflineQueue.length > 0 || offlineQueueMessage ? (
              <div
                className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                data-database-offline-queue
                role="status"
              >
                <div>
                  <div className="font-medium">
                    <Trans>Offline write queue</Trans>
                  </div>
                  {scopedOfflineQueue.length > 0 ? (
                    <p className="text-muted-foreground text-xs">
                      {scopedOfflineQueue.filter((item) => item.state === 'queued').length} queued ·{' '}
                      {scopedOfflineQueue.filter((item) => item.state === 'blocked').length}{' '}
                      blocked. Reconnected writes are replanned against current property values and
                      require exact review before commit.
                    </p>
                  ) : null}
                  {offlineQueueMessage ? (
                    <p className="text-muted-foreground text-xs">{offlineQueueMessage}</p>
                  ) : null}
                </div>
                {scopedOfflineQueue.length > 0 ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={mutationStatus !== 'idle'}
                      onClick={() => setRefresh((current) => current + 1)}
                    >
                      <Trans>Retry reconciliation</Trans>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={mutationStatus !== 'idle'}
                      onClick={discardQueuedWrites}
                    >
                      <Trans>Discard queued writes</Trans>
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {error && (catalogStatus === 'error' || tableStatus === 'error') ? (
              <DatabaseStateNotice
                problem={error}
                onAction={
                  error.kind === 'permission'
                    ? undefined
                    : error.kind === 'missing'
                      ? () => onOpenChange(false)
                      : () => setRefresh((value) => value + 1)
                }
                actionKind={error.kind === 'missing' ? 'back' : 'recover'}
              />
            ) : null}
            {tableStatus === 'loading' ? (
              <div
                className="flex min-h-72 items-center justify-center text-muted-foreground"
                role="status"
                data-database-state="loading"
              >
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                <Trans>Loading records</Trans>
              </div>
            ) : null}
            {tableStatus === 'success' && description?.source && result ? (
              <div className="space-y-3">
                {offlineCachedAt !== null ? (
                  <div
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                    role="status"
                    data-database-state="offline-cache"
                  >
                    <div className="font-medium">
                      <Trans>Read-only cached database</Trans>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      <Trans>
                        Cached {new Date(offlineCachedAt).toLocaleString()} · snapshot{' '}
                        {result.snapshotRevision} · index {result.indexFreshness}. Relations and
                        derived values are only as current as this snapshot.
                      </Trans>
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-lg">{description.source.name}</h2>
                    <p className="text-muted-foreground text-sm">
                      {description.source.recordMeaning}
                    </p>
                    <nav
                      className="mt-2 flex max-w-full items-center gap-1 overflow-x-auto"
                      aria-label="Database views"
                      data-database-view-tabs
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant={selectedViewId ? 'ghost' : 'secondary'}
                        role="tab"
                        aria-selected={!selectedViewId}
                        onClick={() => selectView('__all__')}
                      >
                        <Trans>All records</Trans>
                      </Button>
                      {sourceViews.map((view) => (
                        <fieldset
                          key={view.id}
                          aria-label={`${view.name} view tab controls`}
                          className={cn(
                            'inline-flex items-center rounded-md border-0 p-0',
                            dragOverViewId === view.id && 'ring-2 ring-primary/50',
                          )}
                          data-view-id={view.id}
                          data-view-drag-over={dragOverViewId === view.id ? 'true' : undefined}
                          onDragOver={(event) => {
                            if (!draggedViewId || draggedViewId === view.id) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setDragOverViewId(view.id);
                          }}
                          onDragLeave={() => {
                            if (dragOverViewId === view.id) setDragOverViewId(null);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const sourceViewId =
                              draggedViewId || event.dataTransfer.getData('text/plain');
                            reorderSavedViewTo(sourceViewId, view.id);
                          }}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="cursor-grab touch-none active:cursor-grabbing"
                            aria-label={`Drag ${view.name} view`}
                            draggable
                            disabled={mutationStatus !== 'idle'}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', view.id);
                              setDraggedViewId(view.id);
                              setDragOverViewId(null);
                            }}
                            onDragEnd={() => {
                              setDraggedViewId(null);
                              setDragOverViewId(null);
                            }}
                          >
                            <GripVertical aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={selectedViewId === view.id ? 'secondary' : 'ghost'}
                            role="tab"
                            aria-selected={selectedViewId === view.id}
                            onClick={() => selectView(view.id)}
                          >
                            {view.favorite === true ? '★ ' : ''}
                            {view.name}
                          </Button>
                          {selectedViewId === view.id ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon-xs"
                                  className="-ml-1 rounded-l-none"
                                  aria-label={`View options for ${view.name}`}
                                  data-active-view-menu
                                >
                                  <MoreHorizontalIcon aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuLabel>{view.name}</DropdownMenuLabel>
                                <DropdownMenuItem
                                  disabled={mutationStatus !== 'idle'}
                                  onSelect={() => setFilterDialogOpen(true)}
                                >
                                  <Trans>Filters</Trans>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={mutationStatus !== 'idle'}
                                  onSelect={() => setViewSettingsOpen(true)}
                                >
                                  <Trans>View settings</Trans>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={mutationStatus !== 'idle' || selectedViewIndex <= 0}
                                  onSelect={() => reorderSavedView(view.id, -1)}
                                >
                                  <Trans>Move left</Trans>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={
                                    mutationStatus !== 'idle' ||
                                    selectedViewIndex < 0 ||
                                    selectedViewIndex >= sourceViews.length - 1
                                  }
                                  onSelect={() => reorderSavedView(view.id, 1)}
                                >
                                  <Trans>Move right</Trans>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={mutationStatus !== 'idle'}
                                  onSelect={() => setViewManagerOpen(true)}
                                >
                                  <Trans>Manage views</Trans>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </fieldset>
                      ))}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="New database view"
                        disabled={mutationStatus !== 'idle'}
                        onClick={() => setViewManagerOpen(true)}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                    </nav>
                    <DatabasePresenceBadges
                      scope="schema"
                      entries={remotePresence.filter(
                        (entry) =>
                          entry.databaseId === description.database.id &&
                          entry.sourceId === description.source?.id &&
                          entry.scope === 'schema',
                      )}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedViewId || '__all__'} onValueChange={selectView}>
                      <SelectTrigger
                        size="sm"
                        className="min-w-40"
                        aria-label="Saved database view"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">
                          <Trans>All records</Trans>
                        </SelectItem>
                        {sourceViews.map((view) => (
                          <SelectItem key={view.id} value={view.id}>
                            {view.favorite === true ? '★ ' : ''}
                            {view.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {description.database.buttons
                      .filter(
                        (button) =>
                          button.placement.kind === 'database' ||
                          (button.placement.kind === 'source' &&
                            button.placement.sourceId === description.source?.id),
                      )
                      .map((button) => (
                        <Button
                          key={button.id}
                          variant="outline"
                          size="sm"
                          disabled={mutationStatus !== 'idle' || buttonStatus !== 'idle'}
                          onClick={() => planDatabaseActionButton(button.id)}
                        >
                          {button.name}
                        </Button>
                      ))}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedView || mutationStatus !== 'idle'}
                      onClick={() => setFilterDialogOpen(true)}
                    >
                      <Trans>Filters</Trans>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedView || mutationStatus !== 'idle'}
                      onClick={() => setViewSettingsOpen(true)}
                    >
                      <Trans>View settings</Trans>
                    </Button>
                    <Input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv,.tsv,text/csv,text/tab-separated-values"
                      className="hidden"
                      aria-label="Import database CSV or TSV file"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = '';
                        if (file) inspectImportFile(file);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mutationStatus !== 'idle'}
                      onClick={() => setNewRecordOpen(true)}
                    >
                      <Plus /> <Trans>New record</Trans>
                    </Button>
                    <Button
                      variant={showArchived ? 'secondary' : 'outline'}
                      size="sm"
                      disabled={mutationStatus !== 'idle'}
                      aria-pressed={showArchived}
                      onClick={() => setShowArchived((value) => !value)}
                    >
                      <Archive />
                      {showArchived ? <Trans>Hide archived</Trans> : <Trans>Show archived</Trans>}
                    </Button>
                    <Badge variant={description.index.state === 'idle' ? 'gray' : 'warning'}>
                      {description.index.state}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {result.returned} / {result.matched}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="More database actions"
                          data-testid="database-more-actions"
                        >
                          <MoreHorizontalIcon aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>
                          <Trans>Database actions</Trans>
                        </DropdownMenuLabel>
                        {onOpenContextInspector ? (
                          <DropdownMenuItem
                            onSelect={() => {
                              if (!description?.source) return;
                              onOpenContextInspector({
                                databaseId: description.database.id,
                                sourceId: description.source.id,
                                ...(selectedViewId ? { viewId: selectedViewId } : {}),
                              });
                            }}
                          >
                            <Braces aria-hidden="true" /> <Trans>Inspect agent context</Trans>
                          </DropdownMenuItem>
                        ) : null}
                        {onOpenContextInspector && selectedRecordIds.size > 0 ? (
                          <DropdownMenuItem
                            onSelect={() => {
                              if (!description?.source) return;
                              onOpenContextInspector({
                                databaseId: description.database.id,
                                sourceId: description.source.id,
                                ...(selectedViewId ? { viewId: selectedViewId } : {}),
                                recordIds: [...selectedRecordIds],
                              });
                            }}
                          >
                            <Braces aria-hidden="true" /> <Trans>Inspect selected context</Trans>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          disabled={mutationStatus !== 'idle'}
                          onSelect={() => setTemplatesOpen(true)}
                        >
                          <Table2 aria-hidden="true" /> <Trans>Templates</Trans>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={mutationStatus !== 'idle'}
                          onSelect={() => setAutomationsOpen(true)}
                        >
                          <Trans>Automations</Trans>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={mutationStatus !== 'idle'}
                          onSelect={() => setPermissionsOpen(true)}
                        >
                          <ShieldCheck aria-hidden="true" /> <Trans>Share</Trans>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={mutationStatus !== 'idle'}
                          onSelect={() => setViewManagerOpen(true)}
                        >
                          <Trans>Manage views</Trans>
                        </DropdownMenuItem>
                        {selectedView && description.source.defaultViewId !== selectedView.id ? (
                          <DropdownMenuItem
                            disabled={mutationStatus !== 'idle'}
                            onSelect={() =>
                              runMutation(
                                createDatabaseDefaultViewChangeDesiredState({
                                  database: description.database,
                                  source: description.source as DatabaseSource,
                                  viewId: selectedView.id,
                                }),
                                'ui-default-view',
                                'Default view change failed',
                                {
                                  policy: {
                                    operation: 'view',
                                    actor: 'human',
                                    principalId: 'user:local',
                                  },
                                },
                              )
                            }
                          >
                            <Star aria-hidden="true" /> <Trans>Make default</Trans>
                          </DropdownMenuItem>
                        ) : null}
                        {description.source.defaultViewId ? (
                          <DropdownMenuItem
                            disabled={mutationStatus !== 'idle'}
                            onSelect={() =>
                              runMutation(
                                createDatabaseDefaultViewChangeDesiredState({
                                  database: description.database,
                                  source: description.source as DatabaseSource,
                                }),
                                'ui-default-view-clear',
                                'Default view change failed',
                                {
                                  policy: {
                                    operation: 'view',
                                    actor: 'human',
                                    principalId: 'user:local',
                                  },
                                },
                              )
                            }
                          >
                            <Trans>Clear default</Trans>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={csvStatus !== 'idle' || mutationStatus !== 'idle'}
                          onSelect={() => csvInputRef.current?.click()}
                        >
                          {csvStatus === 'importing' ? (
                            <Loader2 className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Upload aria-hidden="true" />
                          )}
                          <Trans>Import CSV/TSV</Trans>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={csvStatus !== 'idle'}
                          onSelect={() => exportDatabase('csv', 'current')}
                        >
                          <Download aria-hidden="true" /> <Trans>Export current CSV</Trans>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={csvStatus !== 'idle'}
                          onSelect={() => exportDatabase('csv', 'all')}
                        >
                          <Download aria-hidden="true" /> <Trans>Export all CSV</Trans>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={csvStatus !== 'idle'}
                          onSelect={() => exportDatabase('json', 'all')}
                        >
                          <Download aria-hidden="true" /> <Trans>Export JSON</Trans>
                        </DropdownMenuItem>
                        {lastUndoToken ? (
                          <DropdownMenuItem
                            disabled={mutationStatus !== 'idle' || undoStatus !== 'idle'}
                            onSelect={undoLastChange}
                          >
                            {undoStatus !== 'idle' ? (
                              <Loader2 className="animate-spin" aria-hidden="true" />
                            ) : null}
                            <Trans>Undo last change</Trans>
                          </DropdownMenuItem>
                        ) : null}
                        {lastRedoToken ? (
                          <DropdownMenuItem
                            disabled={mutationStatus !== 'idle' || redoStatus !== 'idle'}
                            onSelect={redoLastChange}
                          >
                            {redoStatus !== 'idle' ? (
                              <Loader2 className="animate-spin" aria-hidden="true" />
                            ) : null}
                            <Trans>Redo last change</Trans>
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {newRecordOpen ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                    <Input
                      autoFocus={!pageTitleEditing}
                      value={newRecordTitle}
                      aria-label="New record title"
                      placeholder="Record title"
                      className="min-w-56 flex-1"
                      onChange={(event) => setNewRecordTitle(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') createRecord();
                        if (event.key === 'Escape') setNewRecordOpen(false);
                      }}
                    />
                    <Select value={newRecordTemplateId} onValueChange={setNewRecordTemplateId}>
                      <SelectTrigger
                        size="sm"
                        className="min-w-44"
                        aria-label="New record template"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">
                          <Trans>Automatic default</Trans>
                        </SelectItem>
                        <SelectItem value="__blank__">
                          <Trans>Blank record</Trans>
                        </SelectItem>
                        {description.database.templates
                          .filter(
                            (template) =>
                              template.sourceId === description.source?.id &&
                              template.archivedAt === null,
                          )
                          .sort((left, right) => left.order - right.order)
                          .map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => setNewRecordOpen(false)}>
                      <Trans>Cancel</Trans>
                    </Button>
                    <Button size="sm" onClick={() => createRecord()}>
                      <Trans>Plan new record</Trans>
                    </Button>
                  </div>
                ) : null}
                {selectedOptionProperty && selectedOption ? (
                  <details className="rounded-md border bg-muted/10 p-3">
                    <summary className="cursor-pointer font-medium text-sm">
                      <Trans>Manage Select options</Trans>
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1 text-xs">
                          <span className="text-muted-foreground">
                            <Trans>Property</Trans>
                          </span>
                          <Select
                            value={optionPropertyId}
                            onValueChange={(propertyId) => {
                              const property = selectProperties.find(
                                (candidate) => candidate.id === propertyId,
                              );
                              const option = property?.options[0];
                              setOptionPropertyId(propertyId);
                              setOptionId(option?.id ?? '');
                              setOptionName(option?.name ?? '');
                              setOptionColor(option?.color ?? '');
                              setOptionMergeTargetId(
                                property?.options.find(
                                  (candidate) =>
                                    candidate.id !== option?.id && candidate.archived !== true,
                                )?.id ?? '',
                              );
                              setOptionPreview(null);
                            }}
                          >
                            <SelectTrigger
                              size="sm"
                              className="min-w-40"
                              aria-label="Select property"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {selectProperties.map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                  {property.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 text-xs">
                          <span className="text-muted-foreground">
                            <Trans>Option</Trans>
                          </span>
                          <Select
                            value={optionId}
                            onValueChange={(nextOptionId) => {
                              const option = selectedOptionProperty.options.find(
                                (candidate) => candidate.id === nextOptionId,
                              );
                              setOptionId(nextOptionId);
                              setOptionName(option?.name ?? '');
                              setOptionColor(option?.color ?? '');
                              setOptionMergeTargetId(
                                selectedOptionProperty.options.find(
                                  (candidate) =>
                                    candidate.id !== nextOptionId && candidate.archived !== true,
                                )?.id ?? '',
                              );
                              setOptionPreview(null);
                            }}
                          >
                            <SelectTrigger
                              size="sm"
                              className="min-w-40"
                              aria-label="Select option"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedOptionProperty.options.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.name}
                                  {option.archived === true ? ' (archived)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 text-xs">
                          <span className="text-muted-foreground">
                            <Trans>Name</Trans>
                          </span>
                          <Input
                            value={optionName}
                            className="h-8 w-40"
                            aria-label="Select option name"
                            onChange={(event) => setOptionName(event.currentTarget.value)}
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={optionStatus !== 'idle'}
                          onClick={() =>
                            prepareSelectOptionChange({
                              kind: 'rename',
                              optionId: selectedOption.id,
                              name: optionName,
                            })
                          }
                        >
                          <Trans>Preview rename</Trans>
                        </Button>
                        <div className="space-y-1 text-xs">
                          <span className="text-muted-foreground">
                            <Trans>Color</Trans>
                          </span>
                          <Input
                            value={optionColor}
                            className="h-8 w-32"
                            aria-label="Select option color"
                            placeholder="blue"
                            onChange={(event) => setOptionColor(event.currentTarget.value)}
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={optionStatus !== 'idle'}
                          onClick={() =>
                            prepareSelectOptionChange({
                              kind: 'recolor',
                              optionId: selectedOption.id,
                              ...(optionColor.trim() ? { color: optionColor.trim() } : {}),
                            })
                          }
                        >
                          <Trans>Preview color</Trans>
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            optionStatus !== 'idle' ||
                            selectedOptionProperty.options[0]?.id === selectedOption.id
                          }
                          onClick={() => {
                            const optionIds = selectedOptionProperty.options.map(
                              (option) => option.id,
                            );
                            const index = optionIds.indexOf(selectedOption.id);
                            [optionIds[index - 1], optionIds[index]] = [
                              optionIds[index] as string,
                              optionIds[index - 1] as string,
                            ];
                            prepareSelectOptionChange({
                              kind: 'reorder',
                              optionIds,
                            });
                          }}
                        >
                          <Trans>Preview move up</Trans>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            optionStatus !== 'idle' ||
                            selectedOptionProperty.options.at(-1)?.id === selectedOption.id
                          }
                          onClick={() => {
                            const optionIds = selectedOptionProperty.options.map(
                              (option) => option.id,
                            );
                            const index = optionIds.indexOf(selectedOption.id);
                            [optionIds[index], optionIds[index + 1]] = [
                              optionIds[index + 1] as string,
                              optionIds[index] as string,
                            ];
                            prepareSelectOptionChange({
                              kind: 'reorder',
                              optionIds,
                            });
                          }}
                        >
                          <Trans>Preview move down</Trans>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={optionStatus !== 'idle'}
                          onClick={() =>
                            prepareSelectOptionChange({
                              kind: 'archive',
                              optionId: selectedOption.id,
                              archived: selectedOption.archived !== true,
                            })
                          }
                        >
                          {selectedOption.archived === true ? (
                            <Trans>Preview restore option</Trans>
                          ) : (
                            <Trans>Preview archive option</Trans>
                          )}
                        </Button>
                        {selectedOptionProperty.options.some(
                          (option) => option.id !== selectedOption.id && option.archived !== true,
                        ) ? (
                          <>
                            <Select
                              value={optionMergeTargetId}
                              onValueChange={setOptionMergeTargetId}
                            >
                              <SelectTrigger
                                size="sm"
                                className="min-w-40"
                                aria-label="Merge target option"
                              >
                                <SelectValue placeholder="Merge target" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedOptionProperty.options
                                  .filter(
                                    (option) =>
                                      option.id !== selectedOption.id && option.archived !== true,
                                  )
                                  .map((option) => (
                                    <SelectItem key={option.id} value={option.id}>
                                      {option.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={optionStatus !== 'idle' || !optionMergeTargetId}
                              onClick={() =>
                                prepareSelectOptionChange({
                                  kind: 'merge',
                                  sourceOptionId: selectedOption.id,
                                  targetOptionId: optionMergeTargetId,
                                })
                              }
                            >
                              <Trans>Preview merge</Trans>
                            </Button>
                          </>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          disabled={optionStatus !== 'idle'}
                          onClick={() =>
                            prepareSelectOptionChange({
                              kind: 'delete',
                              optionId: selectedOption.id,
                            })
                          }
                        >
                          <Trans>Preview delete</Trans>
                        </Button>
                        {optionStatus === 'loading' ? (
                          <span
                            className="flex items-center gap-1 text-muted-foreground text-xs"
                            role="status"
                          >
                            <Loader2 className="size-3 animate-spin" />
                            <Trans>Inspecting all records</Trans>
                          </span>
                        ) : null}
                      </div>
                      {optionPreview ? (
                        <section
                          className="space-y-2 rounded border bg-background p-3 text-sm"
                          aria-label="Select option impact preview"
                        >
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={optionPreview.preview.canApply ? 'gray' : 'warning'}>
                              {optionPreview.preview.canApply ? 'ready' : 'blocked'}
                            </Badge>
                            <span>
                              {optionPreview.preview.recordChanges.length} records ·{' '}
                              {optionPreview.preview.affectedViewIds.length} views · default{' '}
                              {optionPreview.preview.defaultChanged ? 'changes' : 'unchanged'}
                            </span>
                          </div>
                          {optionPreview.preview.conflicts.length > 0 ? (
                            <ul className="list-disc pl-5 text-destructive" role="alert">
                              {optionPreview.preview.conflicts.map((conflict) => (
                                <li key={conflict.code}>{conflict.message}</li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOptionPreview(null)}
                            >
                              <Trans>Discard preview</Trans>
                            </Button>
                            <Button
                              size="sm"
                              disabled={!optionPreview.desiredState || mutationStatus !== 'idle'}
                              onClick={planSelectOptionChange}
                            >
                              <Trans>Plan exact option change</Trans>
                            </Button>
                          </div>
                        </section>
                      ) : null}
                    </div>
                  </details>
                ) : null}
                {importPreview ? (
                  <section
                    className="space-y-3 rounded-md border bg-muted/10 p-3"
                    aria-label="Database import preview"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{importPreview.filename}</strong>
                      <Badge variant="gray">{importPreview.inspection.encoding}</Badge>
                      <Badge variant="gray">{importPreview.inspection.delimiterLabel}</Badge>
                      <span className="text-muted-foreground text-xs">
                        {importPreview.inspection.rowCount} rows ·{' '}
                        {importPreview.inspection.emptyValueCount} empty ·{' '}
                        {importPreview.inspection.dateValueCount} dates ·{' '}
                        {importPreview.inspection.optionValueCount} options
                      </span>
                    </div>
                    <fieldset className="flex flex-wrap gap-2">
                      <legend className="sr-only">Import header mappings</legend>
                      {importPreview.inspection.mappings.map((mapping) => (
                        <Badge key={mapping.propertyId} variant="gray">
                          {mapping.header} → {mapping.propertyName} ({mapping.propertyType})
                        </Badge>
                      ))}
                    </fieldset>
                    {importPreview.inspection.preview.length > 0 ? (
                      <div className="max-h-36 overflow-auto rounded border bg-background p-2 font-mono text-xs">
                        {importPreview.inspection.preview.map((row) => (
                          <div key={row.recordId} className="break-all">
                            {row.recordId}: {JSON.stringify(row.values)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {importPreview.inspection.issues.length > 0 ? (
                      <div className="text-destructive text-sm" role="alert">
                        <div className="font-medium">
                          <Trans>Fix import values before planning</Trans>
                        </div>
                        <ul className="list-disc pl-5">
                          {importPreview.inspection.issues.slice(0, 20).map((issue) => (
                            <li key={`${issue.row}:${issue.header}:${issue.message}`}>
                              Row {issue.row}, {issue.header}: {issue.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setImportPreview(null)}>
                        <Trans>Cancel</Trans>
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          importPreview.inspection.issues.length > 0 ||
                          csvStatus !== 'idle' ||
                          mutationStatus !== 'idle'
                        }
                        onClick={commitImportPreview}
                      >
                        <Trans>Plan import</Trans>
                      </Button>
                    </div>
                  </section>
                ) : null}
                {moveRecord ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                    <span className="text-sm">
                      <Trans>Move selected record to</Trans>
                    </span>
                    <Select value={moveTargetSourceId} onValueChange={setMoveTargetSourceId}>
                      <SelectTrigger size="sm" className="min-w-48" aria-label="Move target source">
                        <SelectValue placeholder="Choose source" />
                      </SelectTrigger>
                      <SelectContent>
                        {compatibleMoveTargets.map(({ source, mapping }) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.name} ·{' '}
                            <Trans>{mapping.propertyMappings.length} mapped properties</Trans>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!moveTargetSourceId || mutationStatus !== 'idle'}
                      onClick={planMove}
                    >
                      <Trans>Plan move</Trans>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setMoveRecord(null)}>
                      <Trans>Cancel</Trans>
                    </Button>
                  </div>
                ) : null}
                {selectedRecordIds.size > 0 ? (
                  <div
                    className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3"
                    data-testid="database-bulk-toolbar"
                  >
                    <Badge variant="gray">
                      <Trans>{selectedRecordIds.size} selected</Trans>
                    </Badge>
                    <Button variant="outline" size="sm" onClick={copySelectedRecords}>
                      <Copy /> <Trans>Copy TSV</Trans>
                    </Button>
                    <Select
                      value={bulkPropertyId}
                      onValueChange={(propertyId) => {
                        const property = description.source?.properties.find(
                          (candidate) => candidate.id === propertyId,
                        );
                        setBulkPropertyId(propertyId);
                        setBulkDraft(property ? initialCellDraft(property) : '');
                      }}
                    >
                      <SelectTrigger size="sm" className="min-w-44" aria-label="Bulk property">
                        <SelectValue placeholder="Choose property" />
                      </SelectTrigger>
                      <SelectContent>
                        {description.source.properties
                          .filter(isDatabaseCellEditable)
                          .map((property) => (
                            <SelectItem key={property.id} value={property.id}>
                              {property.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {bulkProperty?.type === 'checkbox' ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={bulkDraft === 'true'}
                          aria-label={`Bulk value for ${bulkProperty.name}`}
                          onCheckedChange={(checked) =>
                            setBulkDraft(checked === true ? 'true' : 'false')
                          }
                        />
                        {bulkProperty.name}
                      </div>
                    ) : bulkProperty?.type === 'select' || bulkProperty?.type === 'status' ? (
                      <Select value={bulkDraft} onValueChange={setBulkDraft}>
                        <SelectTrigger size="sm" className="min-w-40" aria-label="Bulk value">
                          <SelectValue placeholder="Choose value" />
                        </SelectTrigger>
                        <SelectContent>
                          {bulkProperty.options
                            .filter((option) => option.archived !== true)
                            .map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {bulkProperty.type === 'status' && 'groupId' in option
                                  ? `${
                                      bulkProperty.groups.find(
                                        (group) => group.id === option.groupId,
                                      )?.name ?? 'Status'
                                    } · ${option.name}`
                                  : option.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : bulkProperty?.type === 'multi_select' ? (
                      <fieldset className="flex flex-wrap gap-2">
                        <legend className="sr-only">Bulk values</legend>
                        {bulkProperty.options.map((option) => {
                          const selected = multiSelectDraftValues(bulkDraft);
                          return (
                            <div key={option.id} className="flex items-center gap-1 text-xs">
                              <Checkbox
                                checked={selected.includes(option.id)}
                                aria-label={`${option.name} bulk value`}
                                onCheckedChange={(checked) => {
                                  const next = new Set(selected);
                                  if (checked === true) next.add(option.id);
                                  else next.delete(option.id);
                                  setBulkDraft(JSON.stringify([...next]));
                                }}
                              />
                              {option.name}
                            </div>
                          );
                        })}
                      </fieldset>
                    ) : bulkProperty?.type === 'person' ? (
                      <fieldset className="flex flex-wrap gap-2">
                        <legend className="sr-only">Bulk people</legend>
                        {description.database.people
                          .filter((person) => person.active)
                          .map((person) => {
                            const selected = multiSelectDraftValues(bulkDraft);
                            return (
                              <div key={person.id} className="flex items-center gap-1 text-xs">
                                <Checkbox
                                  checked={selected.includes(person.id)}
                                  aria-label={`${person.name} bulk person`}
                                  onCheckedChange={(checked) => {
                                    const next = new Set(selected);
                                    if (checked === true) {
                                      if (!bulkProperty.multiple) next.clear();
                                      next.add(person.id);
                                    } else {
                                      next.delete(person.id);
                                    }
                                    setBulkDraft(JSON.stringify([...next]));
                                  }}
                                />
                                {person.name}
                                {person.kind === 'agent' ? ` (${personLabels.agent})` : ''}
                              </div>
                            );
                          })}
                      </fieldset>
                    ) : bulkProperty?.type === 'files' ? (
                      <DatabaseFilesCellEditor
                        draft={bulkDraft}
                        propertyName={bulkProperty.name}
                        parentDocName={
                          result.records.find((record) => selectedRecordIds.has(record.id))?.path ??
                          `${description.source.folder}/database-record.md`
                        }
                        fileStates={result.fileStates}
                        onDraftChange={setBulkDraft}
                      />
                    ) : bulkProperty?.type === 'relation' ? (
                      <DatabaseRelationCellEditor
                        property={bulkProperty}
                        draft={bulkDraft}
                        knownRecords={[
                          ...new Map(
                            [...relationCandidates, ...(result.relationRecords ?? [])].map(
                              (record) => [record.id, record],
                            ),
                          ).values(),
                        ]}
                        searchRecords={(query) => searchRelationCandidates(bulkProperty, query)}
                        onDraftChange={setBulkDraft}
                      />
                    ) : bulkProperty ? (
                      <Input
                        value={bulkDraft}
                        type={bulkProperty.type === 'number' ? 'number' : 'text'}
                        aria-label="Bulk value"
                        className="h-8 min-w-48 flex-1"
                        onChange={(event) => setBulkDraft(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') planBulkEdit();
                        }}
                      />
                    ) : null}
                    <Button
                      size="sm"
                      disabled={!bulkProperty || mutationStatus !== 'idle'}
                      onClick={planBulkEdit}
                    >
                      <Trans>Plan bulk edit</Trans>
                    </Button>
                    {bulkProperty?.type === 'checkbox' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={mutationStatus !== 'idle'}
                        onClick={planBulkCheckboxToggle}
                      >
                        <Trans>Toggle selected</Trans>
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={mutationStatus !== 'idle'}
                      onClick={() => setSelectedRecordIds(new Set())}
                    >
                      <Trans>Clear selection</Trans>
                    </Button>
                  </div>
                ) : null}
                {description.index.state === 'error' ? (
                  <DatabaseStateNotice
                    problem={databaseIndexProblem(
                      'error',
                      description.index.lastError?.message ?? 'Database index failed.',
                    )}
                    onAction={() => setRefresh((value) => value + 1)}
                  />
                ) : description.index.state === 'rebuilding' ? (
                  <DatabaseStateNotice
                    problem={databaseIndexProblem(
                      'rebuilding',
                      'Database index is rebuilding; shown rows may refresh.',
                    )}
                  />
                ) : null}
                {!result.isComplete ? (
                  <div
                    className="rounded-md border bg-muted/30 p-3 text-muted-foreground text-sm"
                    data-database-state="partial"
                  >
                    <Trans>This snapshot is paginated; not all matching records are shown.</Trans>
                  </div>
                ) : null}
                {buttonStatus === 'planning' ? (
                  <div
                    className="flex items-center gap-2 rounded-md border p-3 text-muted-foreground text-sm"
                    role="status"
                  >
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    <Trans>Planning exact Button actions</Trans>
                  </div>
                ) : buttonPlan ? (
                  <section
                    className="space-y-3 rounded-md border border-primary/40 border-dashed bg-primary/5 p-3"
                    data-testid="database-button-review"
                    data-canonical="false"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="primary">
                        <Trans>Button plan · not executed</Trans>
                      </Badge>
                      <span className="font-medium text-sm">{buttonPlan.label}</span>
                      <span className="font-mono text-muted-foreground text-xs">
                        {buttonPlan.id}
                      </span>
                    </div>
                    {buttonPlan.confirmation ? (
                      <div className="text-sm">
                        <div className="font-medium">{buttonPlan.confirmation.title}</div>
                        {buttonPlan.confirmation.description ? (
                          <p className="text-muted-foreground text-xs">
                            {buttonPlan.confirmation.description}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="text-muted-foreground text-xs">
                      {buttonPlan.internalPlan?.diff.records.length ?? 0} database record changes ·{' '}
                      {buttonPlan.externalSteps.length} external actions
                    </div>
                    {buttonPlan.externalSteps.map((step) => (
                      <div key={step.actionId} className="rounded border bg-background p-2 text-xs">
                        <div className="font-medium">
                          {step.eventName} → {step.connectionId}
                        </div>
                        <div className="text-muted-foreground">
                          {step.egressBytes} bytes · properties{' '}
                          {Object.keys(step.payload.properties).join(', ') || 'none'}
                          {step.payload.body === undefined ? '' : ' · includes body'}
                        </div>
                      </div>
                    ))}
                    {buttonPlan.externalSteps.length > 0 ? (
                      <p className="text-amber-700 text-xs" role="status">
                        <Trans>
                          External actions run after the verified database commit and use durable
                          idempotent delivery with bounded retry.
                        </Trans>
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={buttonStatus === 'committing'}
                        onClick={() => setButtonPlan(null)}
                      >
                        <Trans>Cancel</Trans>
                      </Button>
                      <Button
                        size="sm"
                        disabled={
                          buttonStatus === 'committing' ||
                          (buttonPlan.internalPlan !== null &&
                            !buttonPlan.internalPlan.committable) ||
                          (buttonPlan.internalPlan === null &&
                            buttonPlan.externalSteps.length === 0)
                        }
                        onClick={commitButton}
                      >
                        {buttonStatus === 'committing' ? (
                          <Loader2 className="animate-spin" aria-hidden="true" />
                        ) : null}
                        <Trans>Run Button</Trans>
                      </Button>
                    </div>
                  </section>
                ) : null}
                {ghost ? (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 border-dashed bg-primary/5 p-3"
                    data-testid="database-ghost-review"
                    data-canonical="false"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="primary">
                          <Trans>Proposed · not saved</Trans>
                        </Badge>
                        <span className="font-mono text-muted-foreground text-xs">
                          {ghost.planId}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground text-xs">
                        <Trans>
                          This ghost value is not canonical until the exact plan commits and the
                          table refreshes.
                        </Trans>
                      </p>
                      <p
                        className="mt-1 font-medium text-xs"
                        data-testid="database-human-plan-summary"
                      >
                        {databasePlanHumanSummary(ghost.diff)}
                      </p>
                      <p
                        className="mt-1 text-muted-foreground text-xs"
                        data-testid="database-exact-change-scope"
                      >
                        Scope: {ghost.diff.records.length} record file(s),{' '}
                        {ghost.diff.manifests.length} manifest(s), {ghost.diff.templates.length}{' '}
                        template file(s) · risk {ghost.risk.level}
                      </p>
                      {ghost.risk.reasons.length > 0 ? (
                        <ul className="mt-1 list-disc pl-5 text-xs" aria-label="Change risks">
                          {ghost.risk.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : null}
                      <p className="mt-1 text-muted-foreground text-xs">
                        Recovery: a successful reversible commit exposes Undo last change; the
                        durable transaction receipt retains its exact recovery scope.
                      </p>
                      <details className="mt-2 rounded border bg-background/60 px-2 py-1 text-xs">
                        <summary className="cursor-pointer font-medium">
                          <Trans>Exact plan details</Trans>
                        </summary>
                        <dl className="mt-2 grid gap-1 font-mono text-[11px]">
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Plan</dt>
                            <dd className="break-all text-right">{ghost.planId}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Plan hash</dt>
                            <dd className="break-all text-right">{ghost.planHash}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Snapshot</dt>
                            <dd className="break-all text-right">{ghost.snapshotRevision}</dd>
                          </div>
                        </dl>
                      </details>
                    </div>
                    {mutationStatus === 'review' ? (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => finishReview(false)}>
                          <Trans>Discard</Trans>
                        </Button>
                        <Button size="sm" onClick={() => finishReview(true)}>
                          <Trans>Commit change</Trans>
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-2 text-muted-foreground text-sm"
                        role="status"
                      >
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        <Trans>Committing exact plan</Trans>
                      </div>
                    )}
                  </div>
                ) : mutationStatus === 'planning' ? (
                  <div
                    className="flex items-center gap-2 rounded-md border p-3 text-muted-foreground text-sm"
                    role="status"
                  >
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {mutationReviewMode === 'automatic' ? (
                      <Trans>Saving change</Trans>
                    ) : (
                      <Trans>Planning exact cell change</Trans>
                    )}
                  </div>
                ) : null}
                {mutationConflict ? (
                  <DatabaseConflictResolutionNotice
                    plan={mutationConflict.plan}
                    onUseLatest={() => {
                      setMutationConflict(null);
                      setMutationError(null);
                      setRefresh((value) => value + 1);
                    }}
                    onReplan={mutationConflict.replan}
                  />
                ) : mutationError ? (
                  <DatabaseStateNotice
                    problem={mutationError}
                    actionKind="reload"
                    onAction={
                      mutationError.kind === 'permission'
                        ? undefined
                        : () => {
                            setMutationError(null);
                            setRefresh((value) => value + 1);
                          }
                    }
                  />
                ) : null}
                {pageError ? (
                  <DatabaseStateNotice
                    problem={pageError}
                    onAction={
                      pageError.kind === 'permission'
                        ? undefined
                        : pageError.kind === 'missing'
                          ? () => onOpenChange(false)
                          : loadMore
                    }
                    actionKind={pageError.kind === 'missing' ? 'back' : 'recover'}
                  />
                ) : null}
                {result.records.length === 0 &&
                selectedView?.layout.type !== 'board' &&
                selectedView?.layout.type !== 'timeline' &&
                selectedView?.layout.type !== 'calendar' &&
                selectedView?.layout.type !== 'list' &&
                selectedView?.layout.type !== 'gallery' &&
                selectedView?.layout.type !== 'chart' &&
                selectedView?.layout.type !== 'feed' &&
                selectedView?.layout.type !== 'table' &&
                selectedView?.layout.type !== undefined &&
                !ghost?.diff.records.some(
                  (record) =>
                    record.action === 'create' && record.sourceId === description.source?.id,
                ) ? (
                  <div
                    className="flex min-h-64 items-center justify-center rounded-md border border-dashed text-muted-foreground text-sm"
                    data-database-state="empty"
                  >
                    <Trans>No records in this source.</Trans>
                  </div>
                ) : selectedView?.layout.type === 'board' ? (
                  <DatabaseBoard
                    key={`${description.source.id}:${selectedView.id}:${description.schemaRevision}:${result.snapshotRevision}`}
                    source={description.source}
                    view={selectedView}
                    result={result}
                    people={description.database.people}
                    relationRecords={[
                      ...new Map(
                        [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                          record.id,
                          record,
                        ]),
                      ).values(),
                    ]}
                    mutationLocked={
                      mutationStatus !== 'idle' ||
                      buttonStatus !== 'idle' ||
                      offlineCachedAt !== null
                    }
                    onTransition={planBoardTransition}
                    onDuplicate={duplicateRecord}
                    onArchive={changeArchiveState}
                    onRequestMove={
                      compatibleMoveTargets.length > 0
                        ? (record) => {
                            setMoveRecord(record);
                            setMoveTargetSourceId('');
                          }
                        : undefined
                    }
                    onDelete={deleteRecord}
                    onOpen={openRecord}
                  />
                ) : selectedView?.layout.type === 'timeline' ? (
                  <DatabaseTimeline
                    key={`${description.source.id}:${selectedView.id}:${description.schemaRevision}:${result.snapshotRevision}`}
                    source={description.source}
                    view={selectedView}
                    result={result}
                    people={description.database.people}
                    relationRecords={[
                      ...new Map(
                        [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                          record.id,
                          record,
                        ]),
                      ).values(),
                    ]}
                    mutationLocked={mutationStatus !== 'idle' || buttonStatus !== 'idle'}
                    onChange={planTimelineChange}
                    onOpen={openRecord}
                  />
                ) : selectedView?.layout.type === 'calendar' ? (
                  <DatabaseCalendar
                    key={`${description.source.id}:${selectedView.id}:${description.schemaRevision}:${result.snapshotRevision}`}
                    source={description.source}
                    view={selectedView}
                    result={result}
                    people={description.database.people}
                    relationRecords={[
                      ...new Map(
                        [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                          record.id,
                          record,
                        ]),
                      ).values(),
                    ]}
                    mutationLocked={mutationStatus !== 'idle' || buttonStatus !== 'idle'}
                    onChange={planCalendarChange}
                    onOpen={openRecord}
                  />
                ) : selectedView?.layout.type === 'list' ? (
                  <DatabaseList
                    key={`${description.source.id}:${selectedView.id}:${description.schemaRevision}:${result.snapshotRevision}`}
                    source={description.source}
                    view={selectedView}
                    result={result}
                    people={description.database.people}
                    relationRecords={[
                      ...new Map(
                        [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                          record.id,
                          record,
                        ]),
                      ).values(),
                    ]}
                    onOpen={openRecord}
                  />
                ) : selectedView?.layout.type === 'gallery' ? (
                  <DatabaseGallery
                    key={`${description.source.id}:${selectedView.id}:${description.schemaRevision}:${result.snapshotRevision}`}
                    source={description.source}
                    view={selectedView}
                    result={result}
                    people={description.database.people}
                    relationRecords={[
                      ...new Map(
                        [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                          record.id,
                          record,
                        ]),
                      ).values(),
                    ]}
                    onOpen={openRecord}
                  />
                ) : selectedView?.layout.type === 'form' ? (
                  <DatabaseForm
                    key={`${description.source.id}:${selectedView.id}:${description.schemaRevision}`}
                    databaseId={description.database.id}
                    source={description.source}
                    view={selectedView}
                    people={description.database.people}
                  />
                ) : selectedView?.layout.type === 'chart' ? (
                  <DatabaseChart
                    key={`${description.source.id}:${selectedView.id}:${description.schemaRevision}:${result.snapshotRevision}`}
                    source={description.source}
                    view={selectedView}
                    result={result}
                    people={description.database.people}
                    relationRecords={[
                      ...new Map(
                        [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                          record.id,
                          record,
                        ]),
                      ).values(),
                    ]}
                    onOpen={openRecord}
                  />
                ) : selectedView?.layout.type === 'map' ? (
                  <DatabaseMap
                    key={`${description.source.id}:${selectedView.id}:${description.schemaRevision}:${result.snapshotRevision}`}
                    source={description.source}
                    view={selectedView}
                    result={result}
                    onOpen={openRecord}
                  />
                ) : selectedView?.layout.type === 'dashboard' ? (
                  <DatabaseDashboard
                    key={`${description.database.id}:${selectedView.id}:${description.schemaRevision}`}
                    databaseId={description.database.id}
                    database={description.database}
                    view={selectedView}
                    onOpen={openRecord}
                  />
                ) : selectedView?.layout.type === 'feed' ? (
                  <DatabaseFeed
                    key={`${description.source.id}:${selectedView.id}:${description.schemaRevision}:${result.snapshotRevision}`}
                    source={description.source}
                    view={selectedView}
                    result={result}
                    people={description.database.people}
                    onOpen={openRecord}
                  />
                ) : (
                  <DatabaseTable
                    key={`${description.source.id}:${
                      selectedView?.id ?? 'all'
                    }:${description.schemaRevision}:${result.snapshotRevision}`}
                    source={description.source}
                    databaseId={description.database.id}
                    viewId={selectedView?.id ?? null}
                    result={result}
                    people={description.database.people}
                    relationRecords={[
                      ...new Map(
                        [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                          record.id,
                          record,
                        ]),
                      ).values(),
                    ]}
                    ghost={ghost}
                    optimisticCellValues={optimisticCellValues}
                    mutationLocked={mutationStatus !== 'idle' || buttonStatus !== 'idle'}
                    selectedRecordIds={selectedRecordIds}
                    calculations={tableCalculations}
                    viewPropertyIds={selectedView?.projection.propertyIds}
                    viewConfiguration={
                      selectedView?.layout.type === 'table'
                        ? selectedView.layout.configuration
                        : undefined
                    }
                    onEdit={editCell}
                    onVerificationAction={changeVerification}
                    onDelete={deleteRecord}
                    onDuplicate={duplicateRecord}
                    onArchive={changeArchiveState}
                    onRequestMove={
                      compatibleMoveTargets.length > 0
                        ? (record) => {
                            setMoveRecord(record);
                            setMoveTargetSourceId('');
                          }
                        : undefined
                    }
                    onOpen={openRecord}
                    onOpenContextInspector={
                      onOpenContextInspector
                        ? (record) => {
                            if (!description.source) return;
                            onOpenContextInspector({
                              databaseId: description.database.id,
                              sourceId: description.source.id,
                              ...(selectedViewId ? { viewId: selectedViewId } : {}),
                              recordId: record.id,
                            });
                          }
                        : undefined
                    }
                    onCreateRecord={createRecord}
                    onSelectionChange={setSelectedRecordIds}
                    onPaste={planTablePaste}
                    onCalculationChange={(propertyId, calculation) =>
                      setTableCalculations((current) => {
                        if (calculation === null) {
                          const next = { ...current };
                          delete next[propertyId];
                          return next;
                        }
                        return { ...current, [propertyId]: calculation };
                      })
                    }
                    onRelationSearch={searchRelationCandidates}
                    onConfigureComputedProperty={(property) => setComputedPropertyId(property.id)}
                    onConfigureUniqueIdProperty={(property) => setUniqueIdPropertyId(property.id)}
                    onConfigurePlaceProperty={(property) => setPlacePropertyId(property.id)}
                    onConvertProperty={(property) => setConversionPropertyId(property.id)}
                    onInvokeButton={planButton}
                    onManageProperties={(propertyId) => {
                      setPropertiesDialogRenameId(propertyId ?? null);
                      setPropertiesDialogOpen(true);
                    }}
                    onRemoveProperty={removeSchemaProperty}
                  />
                )}
                {result.nextCursor && result.records.length < loadedRecordLimit ? (
                  <div className="flex justify-center pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pageStatus === 'loading'}
                      onClick={loadMore}
                    >
                      {pageStatus === 'loading' ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : null}
                      <Trans>Load more records</Trans>
                    </Button>
                  </div>
                ) : null}
                {result.nextCursor && result.records.length >= loadedRecordLimit ? (
                  <div
                    className="rounded-md border px-3 py-2 text-muted-foreground text-sm"
                    role="status"
                  >
                    <Trans>
                      This view keeps at most {loadedRecordLimit.toLocaleString()} loaded records in
                      memory. Narrow the filters or open another saved view to continue.
                    </Trans>
                  </div>
                ) : null}
              </div>
            ) : null}
          </main>
        </DialogBody>
      </DialogContent>
      {recordPeek && description?.source ? (
        <DatabaseRecordPeek
          key={`${recordPeek.record.id}:${recordPeek.mode}`}
          mode={recordPeek.mode}
          database={description.database}
          source={description.source}
          record={recordPeek.record}
          onClose={() => setRecordPeek(null)}
          onOpenFull={() => {
            onOpenRecord?.(recordPeek.record.path);
            setRecordPeek(null);
            onOpenChange(false);
          }}
        />
      ) : null}
      <DatabaseCreationDialog
        open={creationOpen}
        onOpenChange={(nextOpen, reason) => {
          setCreationOpen(nextOpen);
          if (!nextOpen && reason !== 'submit') onCreationCancelled?.();
        }}
        onCreate={(desiredState, mode) => {
          runMutation(desiredState, 'ui-database-create', 'Database creation failed', {
            assertions: {
              databaseAbsent: true,
              createdRecords: desiredState.sampleRecords?.length ?? 0,
            },
            // A blank human-created database has no external side effect or
            // destructive target. Let it land directly in the editable page,
            // while templates imported from a folder/CSV remain reviewed.
            policy:
              mode === 'blank'
                ? {
                    operation: 'blank-database-create',
                    actor: 'human',
                    principalId: 'user:local',
                  }
                : undefined,
            onCommitted: (outcome) => {
              // The creation form is a draft surface. Once the mutation is
              // committed, close it before handing the user to the new page;
              // otherwise the original `initialAction="create"` can reopen
              // the modal during the canonical-route transition.
              setCreationOpen(false);
              // Keep creation in one continuous flow. Once the canonical
              // manifest exists, select its source/view immediately so the
              // next catalog refresh lands on the new editable table instead
              // of making the user rediscover it in the left rail.
              const definition = outcome.draft.normalized?.definition;
              if (!definition || !Array.isArray(definition.sources)) return;
              const source = definition.sources[0];
              if (!source) return;
              const firstView = (definition.views ?? []).find(
                (view) => view.sourceId === source.id,
              );
              setSelection({ databaseId: definition.id, sourceId: source.id });
              setSelectedViewId(firstView?.id ?? '');
              if (creationPageFlowRef.current) {
                const route = databasePageTargetToHash({
                  databaseId: definition.id,
                  sourceId: source.id,
                  ...(firstView?.id ? { viewId: firstView.id } : {}),
                });
                window.history.replaceState(null, '', route);
                window.dispatchEvent(new Event(DATABASE_NAVIGATION_CHANGE_EVENT));
                window.dispatchEvent(new HashChangeEvent('hashchange'));
              }
              if (mode === 'blank') {
                setPageTitleDraft(source.name ?? definition.name);
                setPageTitleEditing(true);
                setNewRecordTitle('');
                setNewRecordOpen(true);
              }
              if (mode === 'folder') {
                setOnboardingTarget({
                  databaseId: definition.id,
                  sourceId: source.id,
                  expectedManifestRevision: outcome.result.revisions.snapshotRevision,
                });
                setOnboardingOpen(true);
              }
            },
            onFailed: () => setCreationOpen(true),
          });
        }}
      />
      <DatabaseOnboardingDialog
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        target={onboardingTarget}
      />
      {description?.source && result && computedProperty ? (
        <DatabaseComputedPropertyDialog
          key={`${computedProperty.id}:${description.schemaRevision}`}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setComputedPropertyId(null);
          }}
          definition={description.database}
          source={description.source}
          property={computedProperty}
          previewRecord={result.records[0] ?? null}
          people={result.people ?? []}
          relationRecords={result.relationRecords ?? []}
          evaluationNow={
            description.index.lastIncrementalAt ??
            description.index.lastRebuiltAt ??
            '1970-01-01T00:00:00.000Z'
          }
          onSave={(property) => {
            try {
              runMutation(
                createDatabaseComputedPropertyChangeDesiredState({
                  database: description.database,
                  source: description.source as DatabaseSource,
                  property,
                }),
                'ui-computed-property',
                'Computed property change failed',
              );
              setComputedPropertyId(null);
            } catch (cause) {
              setMutationError(
                classifyDatabaseUiProblem(cause, 'Unable to prepare the computed property change'),
              );
            }
          }}
        />
      ) : null}
      {description?.source && uniqueIdProperty ? (
        <DatabaseUniqueIdPropertyDialog
          key={`${uniqueIdProperty.id}:${description.schemaRevision}`}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setUniqueIdPropertyId(null);
          }}
          property={uniqueIdProperty}
          onSave={(prefix) => {
            try {
              runMutation(
                createDatabaseUniqueIdPrefixChangeDesiredState({
                  database: description.database,
                  source: description.source as DatabaseSource,
                  property: uniqueIdProperty,
                  prefix,
                }),
                'ui-unique-id-prefix',
                'Unique ID prefix change failed',
              );
              setUniqueIdPropertyId(null);
            } catch (cause) {
              setMutationError(
                classifyDatabaseUiProblem(cause, 'Unable to prepare the Unique ID prefix change'),
              );
            }
          }}
        />
      ) : null}
      {description?.source && placeProperty ? (
        <DatabasePlacePropertyDialog
          key={`${placeProperty.id}:${description.schemaRevision}`}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPlacePropertyId(null);
          }}
          property={placeProperty}
          onSave={({ externalSearch, externalMap }) => {
            try {
              runMutation(
                createDatabasePlacePrivacyChangeDesiredState({
                  database: description.database,
                  source: description.source as DatabaseSource,
                  property: placeProperty,
                  externalSearch,
                  externalMap,
                }),
                'ui-place-privacy',
                'Place privacy change failed',
              );
              setPlacePropertyId(null);
            } catch (cause) {
              setMutationError(
                classifyDatabaseUiProblem(cause, 'Unable to prepare the Place privacy change'),
              );
            }
          }}
        />
      ) : null}
      {description?.source && conversionProperty && selection ? (
        <DatabasePropertyConversionDialog
          key={`${conversionProperty.id}:${description.schemaRevision}`}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setConversionPropertyId(null);
          }}
          databaseId={selection.databaseId}
          sourceId={selection.sourceId}
          property={conversionProperty}
          onReviewPlan={(plan) => {
            setConversionPropertyId(null);
            runReviewedPlan(plan, 'ui-property-conversion', 'Property conversion failed');
          }}
        />
      ) : null}
      {description?.source && propertiesDialogOpen ? (
        <DatabasePropertiesDialog
          key={`${description.source.id}:${description.schemaRevision}`}
          open
          onOpenChange={(nextOpen) => {
            setPropertiesDialogOpen(nextOpen);
            if (!nextOpen) {
              setPropertiesError(null);
              setPropertiesDialogRenameId(null);
            }
          }}
          source={description.source}
          initialRenamePropertyId={propertiesDialogRenameId}
          mutationLocked={mutationStatus !== 'idle' || propertiesRemoveStatus !== 'idle'}
          error={propertiesError}
          onAddProperty={addSchemaProperty}
          onRemoveProperty={removeSchemaProperty}
          onReorderProperties={reorderSchemaProperties}
          onRenameProperty={renameSchemaProperty}
        />
      ) : null}
      {description?.source && selectedView && filterDialogOpen ? (
        <DatabaseAdvancedFilterDialog
          key={`${selectedView.id}:${description.schemaRevision}`}
          open
          onOpenChange={setFilterDialogOpen}
          source={description.source}
          initialWhere={selectedView.where}
          onSave={(where) => {
            try {
              runMutation(
                createDatabaseViewFilterChangeDesiredState({
                  database: description.database,
                  source: description.source as DatabaseSource,
                  viewId: selectedView.id,
                  ...(where ? { where } : {}),
                }),
                'ui-view-filter',
                'Saved filter change failed',
                {
                  policy: { operation: 'view', actor: 'human', principalId: 'user:local' },
                },
              );
              setFilterDialogOpen(false);
            } catch (cause) {
              setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare saved filters'));
            }
          }}
        />
      ) : null}
      {description?.source && selectedView && viewSettingsOpen ? (
        <DatabaseSavedViewSettingsDialog
          key={`${selectedView.id}:${description.schemaRevision}`}
          open
          onOpenChange={setViewSettingsOpen}
          source={description.source}
          view={selectedView}
          database={description.database}
          onSave={(view) => {
            try {
              runMutation(
                createDatabaseViewConfigurationChangeDesiredState({
                  database: description.database,
                  source: description.source as DatabaseSource,
                  view,
                }),
                'ui-view-settings',
                'Saved view settings change failed',
                {
                  policy: { operation: 'view', actor: 'human', principalId: 'user:local' },
                },
              );
              setViewSettingsOpen(false);
            } catch (cause) {
              setMutationError(
                classifyDatabaseUiProblem(cause, 'Unable to prepare saved view settings'),
              );
            }
          }}
        />
      ) : null}
      {description?.source && viewManagerOpen ? (
        <DatabaseViewManagerDialog
          key={`${description.source.id}:${description.schemaRevision}`}
          open
          onOpenChange={setViewManagerOpen}
          source={description.source}
          views={sourceViews}
          busy={mutationStatus !== 'idle'}
          onChange={(change) => {
            try {
              runMutation(
                createDatabaseViewLifecycleChangeDesiredState({
                  database: description.database,
                  source: description.source as DatabaseSource,
                  change,
                }),
                `ui-view-${change.kind}`,
                'Saved view change failed',
                change.kind === 'delete'
                  ? undefined
                  : {
                      policy: { operation: 'view', actor: 'human', principalId: 'user:local' },
                    },
              );
            } catch (cause) {
              setMutationError(
                classifyDatabaseUiProblem(cause, 'Unable to prepare saved view change'),
              );
            }
          }}
        />
      ) : null}
      {description?.source && templatesOpen ? (
        <DatabaseTemplatesDialog
          key={`${description.source.id}:${description.schemaRevision}`}
          open
          onOpenChange={setTemplatesOpen}
          database={description.database}
          source={description.source}
          views={sourceViews}
          busy={mutationStatus !== 'idle'}
          onChange={(change) => {
            try {
              runMutation(
                createDatabaseTemplateLifecycleDesiredState({
                  database: description.database,
                  source: description.source as DatabaseSource,
                  change,
                }),
                `ui-template-${change.kind}`,
                'Database template change failed',
              );
            } catch (cause) {
              setMutationError(
                classifyDatabaseUiProblem(cause, 'Unable to prepare database template change'),
              );
            }
          }}
        />
      ) : null}
      {description?.source && automationsOpen ? (
        <DatabaseAutomationsDialog
          key={`${description.database.id}:${description.schemaRevision}`}
          open
          onOpenChange={setAutomationsOpen}
          database={description.database}
          busy={mutationStatus !== 'idle'}
          onChange={(automations) => {
            try {
              runMutation(
                createDatabaseAutomationDesiredState({
                  database: description.database,
                  automations,
                }),
                'ui-automation-definition',
                'Database automation change failed',
              );
            } catch (cause) {
              setMutationError(
                classifyDatabaseUiProblem(cause, 'Unable to prepare database automation change'),
              );
            }
          }}
        />
      ) : null}
      {description && permissionsOpen ? (
        <DatabasePermissionsDialog
          key={`${description.database.id}:${description.schemaRevision}`}
          open
          onOpenChange={setPermissionsOpen}
          databaseId={description.database.id}
          databaseName={description.database.name}
          database={description.database}
          selectedViewId={selectedViewId || undefined}
          selectedRecordId={recordPeek?.record.id}
        />
      ) : null}
    </Dialog>
  );
}
