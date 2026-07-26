import type { HocuspocusProvider } from '@hocuspocus/provider';
import { Trans } from '@lingui/react/macro';
import type { DatabasePageLayout } from '@nedian0brien/synapsenote-core';
import {
  bindFrontmatterDoc,
  type DatabaseProperty,
  type FrontmatterSnapshot,
  type FrontmatterValue,
  type ProjectedDatabaseRecord,
  stripFrontmatter,
} from '@nedian0brien/synapsenote-core';
import {
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  History,
  Link2,
  MoreHorizontal,
  MoveRight,
  Palette,
  RotateCcw,
  Settings2,
  Shield,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { DatabaseAgentScopeMenu } from '@/components/DatabaseAgentScopeMenu';
import { DatabaseConflictResolutionNotice } from '@/components/DatabaseConflictResolutionNotice';
import {
  type DatabasePageAppearance,
  DatabasePageAppearanceDialog,
} from '@/components/DatabasePageAppearanceDialog';
import { DatabasePageLayoutDialog } from '@/components/DatabasePageLayoutDialog';
import { DatabasePermissionsDialog } from '@/components/DatabasePermissionsDialog';
import { DatabasePresenceBadges } from '@/components/DatabasePresenceBadges';
import { DatabaseRecordHistoryDialog } from '@/components/DatabaseRecordHistoryDialog';
import { DatabaseRecordLayoutOverrideDialog } from '@/components/DatabaseRecordLayoutOverrideDialog';
import { DatabaseRecordPageSurface } from '@/components/DatabaseRecordPageSurface';
import { DatabaseRecordPeekComments } from '@/components/DatabaseRecordPeekComments';
import { DatabaseRelationsDialog } from '@/components/DatabaseRelationsDialog';
import { PageHeader } from '@/components/PageHeader';
import { PropertyPanel } from '@/components/PropertyPanel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { subscribeToDatabaseAgentRunChanged } from '@/lib/database-agent-run-events';
import type {
  DatabaseCommentRequest,
  DatabaseCommentSnapshot,
} from '@/lib/database-comments-client';
import { publishDatabaseRecordHeader } from '@/lib/database-record-header';
import { describeDatabase } from '@/lib/database-catalog-client';
import {
  createDatabaseCellMutationDesiredState,
  createDatabasePageLayoutChangeDesiredState,
  createDatabaseRecordArchiveDesiredState,
  createDatabaseRecordCopyDesiredState,
  createDatabaseRecordDeletionDesiredState,
  createDatabaseRecordMoveDesiredState,
  createDatabaseRecordPageLayoutOverrideDesiredState,
} from '@/lib/database-cell-mutation';
import {
  DatabasePlanExecutionError,
  executeDatabaseUiMutation,
} from '@/lib/database-mutation-client';
import { resolveDatabasePageLayout } from '@/lib/database-page-layout';
import { useDatabasePresenceTarget, useRemoteDatabasePresence } from '@/lib/database-presence';
import { fetchDatabaseRecord } from '@/lib/database-query-client';
import {
  type DatabaseRecordNavigationState,
  readDatabaseRecordNavigation,
} from '@/lib/database-record-navigation';
import { databaseRecordMetadata, databaseValueFromFrontmatter } from '@/lib/database-record-page';
import type { DatabaseRelationNavigationItem } from '@/lib/database-relation-navigation';
import { resolveDatabaseRelationNavigation } from '@/lib/database-relation-navigation';
import { subscribeToDatabaseChanged } from '@/lib/documents-events';
import {
  bindingMatchesMetadata,
  type DatabaseRecordPageBindingState,
} from './DatabaseRecordPageBinding';
import {
  databaseRecordPageFallbackHash,
  databaseRecordPageHash,
  databaseRecordPageOriginHash,
  navigateToDatabaseRecordPageHash,
} from './DatabaseRecordPageRouteAdapter';
import {
  type DatabaseRecordPageProblem,
  databaseRecordPageProblem,
  readInitialSnapshot,
} from './database-record-page-utils';

interface DatabaseRecordPageChromeProps {
  provider: HocuspocusProvider;
  docName: string;
  docExt: string;
  fallbackTitle: string;
  /**
   * The normal editor body belongs to the page, immediately after its
   * properties. Keeping this slot on the page chrome makes the ordering an
   * explicit contract instead of relying on two sibling render branches in
   * the activity pool.
   */
  body?: ReactNode;
  services?: DatabaseRecordPageServices;
  commentsRequest?: (input: DatabaseCommentRequest) => Promise<DatabaseCommentSnapshot>;
}

export interface DatabaseRecordPageServices {
  describe: typeof describeDatabase;
  fetchRecord: typeof fetchDatabaseRecord;
  executeMutation: typeof executeDatabaseUiMutation;
  confirm: (message: string) => boolean;
}

type RecordMutationDesiredState = Parameters<
  DatabaseRecordPageServices['executeMutation']
>[0]['desiredState'];

const DEFAULT_SERVICES: DatabaseRecordPageServices = {
  describe: describeDatabase,
  fetchRecord: fetchDatabaseRecord,
  executeMutation: executeDatabaseUiMutation,
  confirm: (message) => window.confirm(message),
};

function DatabaseRecordPageStateNotice({
  problem,
  onBack,
}: {
  problem: DatabaseRecordPageProblem;
  onBack?: () => void;
}) {
  return (
    <div className="editor-content-aligned py-3 text-sm">
      <div
        className="flex flex-wrap items-start justify-between gap-3"
        role="alert"
        data-database-record-state={problem.kind}
      >
        <div>
          <p className="font-medium">
            {problem.kind === 'missing'
              ? 'Page is unavailable'
              : problem.kind === 'permission'
                ? 'Permission required'
                : 'Page could not be loaded'}
          </p>
          <p className="text-muted-foreground">{problem.message}</p>
          {problem.kind === 'permission' ? (
            <p className="text-muted-foreground">
              Request access or use fields available to your current policy.
            </p>
          ) : null}
        </div>
        {onBack ? (
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <Trans>Back to database view</Trans>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function DatabaseRecordPageChrome({
  provider,
  docName,
  docExt,
  fallbackTitle,
  body,
  services = DEFAULT_SERVICES,
  commentsRequest,
}: DatabaseRecordPageChromeProps) {
  'use no memo';
  const [snapshot, setSnapshot] = useState<FrontmatterSnapshot>(() =>
    readInitialSnapshot(provider),
  );
  const metadata = databaseRecordMetadata(snapshot.map);
  const databaseId = metadata?.database_id ?? null;
  const sourceId = metadata?.source_id ?? null;
  const recordId = metadata?.record_id ?? null;
  const metadataKey = metadata ? `${databaseId}\0${sourceId}\0${metadata.record_id}` : null;
  const recordNavigationPath = metadata ? `${docName}${docExt}` : null;
  const metadataPageLayoutOverrideKey = JSON.stringify({
    record: metadataKey,
    override: metadata?.page_layout_override ?? null,
  });
  const [binding, setBinding] = useState<DatabaseRecordPageBindingState>({
    status: metadataKey ? 'loading' : 'idle',
    key: metadataKey,
    description: null,
  });
  const [recordPageProblem, setRecordPageProblem] = useState<DatabaseRecordPageProblem | null>(
    null,
  );
  const [mutationPropertyId, setMutationPropertyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationConflict, setMutationConflict] = useState<
    DatabasePlanExecutionError['plan'] | null
  >(null);
  const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
  const [recordLayoutDialogOpen, setRecordLayoutDialogOpen] = useState(false);
  const [appearanceDialogOpen, setAppearanceDialogOpen] = useState(false);
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [recordActionRunning, setRecordActionRunning] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetSourceId, setMoveTargetSourceId] = useState('');
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [relationsDialogOpen, setRelationsDialogOpen] = useState(false);
  const [relationTargets, setRelationTargets] = useState<DatabaseRelationNavigationItem[]>([]);
  const [relationTargetsLoading, setRelationTargetsLoading] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<
    Awaited<ReturnType<typeof fetchDatabaseRecord>>['record'] | null
  >(null);
  const [layoutMutationRunning, setLayoutMutationRunning] = useState(false);
  const [recordPageLayoutOverride, setRecordPageLayoutOverride] = useState(
    metadata?.page_layout_override ?? null,
  );
  const [recordNavigation, setRecordNavigation] = useState<DatabaseRecordNavigationState | null>(
    null,
  );
  const remotePresence = useRemoteDatabasePresence();
  const schemaOperation = layoutDialogOpen || recordLayoutDialogOpen || layoutMutationRunning;
  useDatabasePresenceTarget(
    metadata
      ? {
          databaseId: metadata.database_id,
          sourceId: metadata.source_id,
          recordId: schemaOperation ? null : metadata.record_id,
          propertyId: schemaOperation ? null : mutationPropertyId,
          viewId: null,
          scope: schemaOperation ? 'schema' : mutationPropertyId ? 'cell' : 'record',
          operation:
            layoutMutationRunning || recordActionRunning
              ? 'committing'
              : schemaOperation || mutationPropertyId
                ? 'editing'
                : 'viewing',
        }
      : null,
  );
  const recordPresence = metadata
    ? remotePresence.filter(
        (entry) =>
          entry.databaseId === metadata.database_id &&
          entry.sourceId === metadata.source_id &&
          ((entry.scope === 'record' && entry.recordId === metadata.record_id) ||
            (entry.scope === 'cell' && entry.recordId === metadata.record_id) ||
            entry.scope === 'schema'),
      )
    : [];

  useEffect(() => {
    const parsed = JSON.parse(metadataPageLayoutOverrideKey) as {
      override: typeof recordPageLayoutOverride;
    };
    setRecordPageLayoutOverride(parsed.override);
  }, [metadataPageLayoutOverrideKey]);

  useEffect(() => {
    setRecordNavigation(
      recordNavigationPath ? readDatabaseRecordNavigation(recordNavigationPath) : null,
    );
  }, [recordNavigationPath]);

  const navigateToRecord = (index: number) => {
    if (!recordNavigation) return;
    const hash = databaseRecordPageHash(recordNavigation, index);
    if (hash) navigateToDatabaseRecordPageHash(hash);
  };

  useEffect(() => {
    const next = bindFrontmatterDoc(provider);
    setSnapshot(next.current());
    const unsubscribe = next.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      next.dispose();
    };
  }, [provider]);

  useEffect(() => {
    if (!databaseId || !sourceId || !recordId) return;
    const unsubscribeDatabaseChanged = subscribeToDatabaseChanged((payload) => {
      const sameRecord =
        payload.scope === 'workspace' ||
        (payload.databaseIds.includes(databaseId) &&
          (payload.sourceIds.includes(sourceId) ||
            payload.recordIds.includes(recordId) ||
            !payload.affectedIdsComplete));
      if (!sameRecord || provider.hasUnsyncedChanges) return;
      // Database table mutations update the canonical Markdown/index path. A
      // clean record page can safely ask its existing Y.Doc connection for the
      // delta; local body/property edits stay untouched until they are synced.
      provider.forceSync();
    });
    const unsubscribeAgentRunChanged = subscribeToDatabaseAgentRunChanged((detail) => {
      const sameRecord =
        detail.databaseIds.length === 0 ||
        (detail.databaseIds.includes(databaseId) &&
          (detail.sourceIds.includes(sourceId) || detail.recordIds.includes(recordId)));
      if (!sameRecord || provider.hasUnsyncedChanges) return;
      provider.forceSync();
    });
    return () => {
      unsubscribeDatabaseChanged();
      unsubscribeAgentRunChanged();
    };
  }, [databaseId, recordId, provider, sourceId]);

  useEffect(() => {
    if (!databaseId || !sourceId || !metadataKey) {
      setBinding({ status: 'idle', key: null, description: null });
      setRecordPageProblem(null);
      return;
    }
    const controller = new AbortController();
    setRecordPageProblem(null);
    setBinding({ status: 'loading', key: metadataKey, description: null });
    void services
      .describe({ databaseId, sourceId }, { signal: controller.signal })
      .then((description) => {
        if (!description.source) throw new Error('The page data source is unavailable');
        if (!description.source.properties.some((property) => property.type === 'title')) {
          throw new Error('The record data source has no Title property');
        }
        setRecordPageProblem(null);
        setBinding({ status: 'ready', key: metadataKey, description });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const problem = databaseRecordPageProblem(cause);
        setRecordPageProblem(problem);
        setBinding({
          status: 'error',
          key: metadataKey,
          description: null,
          message: problem.message,
        });
      });
    return () => controller.abort();
  }, [databaseId, metadataKey, services, sourceId]);

  const currentBinding = bindingMatchesMetadata(binding, metadataKey) ? binding.description : null;
  const source = currentBinding?.source ?? null;
  const titleProperty = source?.properties.find((property) => property.type === 'title') ?? null;
  const databaseTitle =
    titleProperty && typeof snapshot.map[titleProperty.key] === 'string'
      ? (snapshot.map[titleProperty.key] as string)
      : undefined;
  useEffect(() => {
    if (!currentBinding || !source) return;
    return publishDatabaseRecordHeader(docName, {
      databaseName: currentBinding.database.name,
      sourceName: source.name,
      recordTitle: databaseTitle ?? fallbackTitle,
    });
  }, [currentBinding, databaseTitle, docName, fallbackTitle, source]);
  const recordIcon = typeof snapshot.map.icon === 'string' ? snapshot.map.icon : undefined;
  const recordCover = typeof snapshot.map.cover === 'string' ? snapshot.map.cover : undefined;
  const reservedKeys = ['_sn', ...(titleProperty ? [titleProperty.key] : [])];
  const pageLayout =
    source && (source.pageLayout || recordPageLayoutOverride)
      ? resolveDatabasePageLayout(source, source.pageLayout, recordPageLayoutOverride ?? undefined)
      : null;
  const compatibleMoveTargets =
    currentBinding?.database.sources.flatMap((targetSource) => {
      if (!source || targetSource.id === source.id) return [];
      const mapping = (currentBinding.database.sourceMappings ?? []).find(
        (candidate) =>
          candidate.sourceId === source.id && candidate.targetSourceId === targetSource.id,
      );
      return mapping ? [{ source: targetSource, mapping }] : [];
    }) ?? [];

  useEffect(() => {
    if (!databaseId || !sourceId || !recordId || !currentBinding || !source) {
      setCurrentRecord(null);
      setRelationTargets([]);
      setRelationTargetsLoading(false);
      return;
    }
    let active = true;
    const hasRelations = source.properties.some((property) => property.type === 'relation');
    setRelationTargets([]);
    setRelationTargetsLoading(hasRelations);
    void services
      .fetchRecord({
        databaseId,
        sourceId,
        recordId,
      })
      .then(async ({ record }) => {
        if (!active) return null;
        setCurrentRecord(record);
        setRecordPageProblem(null);
        if (!hasRelations) return null;
        return resolveDatabaseRelationNavigation({
          database: currentBinding.database,
          source,
          record,
          limit: 100,
          fetchRecord: services.fetchRecord,
        });
      })
      .then((result) => {
        if (!active || !result) return;
        setRelationTargets(result.items);
        setRelationTargetsLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const problem = databaseRecordPageProblem(cause);
        setRecordPageProblem(problem);
        setCurrentRecord(null);
        setRelationTargets([]);
        setRelationTargetsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentBinding, databaseId, recordId, services, source, sourceId]);

  async function executeRecordMutation(
    desiredState: RecordMutationDesiredState,
    summary: string,
  ): Promise<boolean> {
    if (recordActionRunning || mutationPropertyId !== null || layoutMutationRunning) return false;
    setRecordActionRunning(true);
    setMutationError(null);
    setMutationConflict(null);
    try {
      const outcome = await services.executeMutation({
        desiredState,
        actor: { principalId: 'user:local' },
        idempotencyKey: `ui-record-action-${crypto.randomUUID()}`,
        review: (plan) =>
          services.confirm(`${summary}\n\nExact plan: ${plan.id}\nPlan hash: ${plan.hash}`),
      });
      if (outcome.status === 'blocked') {
        setMutationConflict(outcome.plan);
        setMutationError(
          outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
            'The record action is blocked by the current canonical state',
        );
        return false;
      }
      if (outcome.status === 'review_declined') return false;
      return true;
    } catch (cause) {
      if (cause instanceof DatabasePlanExecutionError) setMutationConflict(cause.plan);
      setMutationError(cause instanceof Error ? cause.message : `${summary} failed`);
      return false;
    } finally {
      setRecordActionRunning(false);
    }
  }

  async function runCurrentRecordAction(
    summary: string,
    build: (record: ProjectedDatabaseRecord) => RecordMutationDesiredState,
  ): Promise<void> {
    if (!metadata || !currentBinding || !source) return;
    const record = await ensureCurrentRecord();
    if (!record) return;
    try {
      await executeRecordMutation(build(record), summary);
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : `${summary} failed`);
    }
  }

  async function openMoveDialog(): Promise<void> {
    if (!metadata || !currentBinding || !source || compatibleMoveTargets.length === 0) return;
    if (await ensureCurrentRecord()) {
      setMoveTargetSourceId('');
      setMoveDialogOpen(true);
    }
  }

  async function commitMove(): Promise<void> {
    if (!metadata || !currentBinding || !source || !currentRecord) return;
    const target = compatibleMoveTargets.find(
      (candidate) => candidate.source.id === moveTargetSourceId,
    );
    if (!target) {
      setMutationError('Choose a compatible target source');
      return;
    }
    const committed = await executeRecordMutation(
      createDatabaseRecordMoveDesiredState({
        database: currentBinding.database,
        source,
        targetSource: target.source,
        record: currentRecord,
      }),
      `Move this record to ${target.source.name}`,
    );
    if (committed) {
      setMoveDialogOpen(false);
      setMoveTargetSourceId('');
    }
  }

  function duplicateCurrentRecord(): Promise<void> {
    return runCurrentRecordAction('Duplicate this record', (record) => {
      if (!currentBinding || !source) throw new Error('Database schema is not ready');
      return createDatabaseRecordCopyDesiredState({
        database: currentBinding.database,
        source,
        record,
      });
    });
  }

  function toggleArchiveCurrentRecord(): Promise<void> {
    return runCurrentRecordAction('Change this record archive state', (record) => {
      if (!currentBinding || !source) throw new Error('Database schema is not ready');
      return createDatabaseRecordArchiveDesiredState({
        database: currentBinding.database,
        source,
        record,
        action: record.archivedAt ? 'restore' : 'archive',
      });
    });
  }

  function deleteCurrentRecord(): Promise<void> {
    return runCurrentRecordAction('Delete this record', (record) => {
      if (!currentBinding || !source) throw new Error('Database schema is not ready');
      return createDatabaseRecordDeletionDesiredState({
        database: currentBinding.database,
        source,
        record,
      });
    });
  }

  async function commitDatabaseProperty(
    property: DatabaseProperty,
    frontmatterValue: FrontmatterValue,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!metadata || !currentBinding || !source) {
      return { ok: false, error: 'Database schema is not ready' };
    }
    if (mutationPropertyId !== null) {
      return { ok: false, error: 'Another database property change is still running' };
    }
    setMutationPropertyId(property.id);
    setMutationError(null);
    setMutationConflict(null);
    try {
      const value = databaseValueFromFrontmatter(
        property,
        frontmatterValue,
        currentBinding.database.people,
      );
      const lookup = await services.fetchRecord({
        databaseId: metadata.database_id,
        sourceId: metadata.source_id,
        recordId: metadata.record_id,
      });
      const expectedPath = `${docName}${docExt}`;
      if (lookup.record.path !== expectedPath) {
        throw new Error('The open page no longer matches the database page path');
      }
      const desiredState = createDatabaseCellMutationDesiredState({
        database: currentBinding.database,
        source,
        record: lookup.record,
        property,
        value,
      });
      const outcome = await services.executeMutation({
        desiredState,
        actor: { principalId: 'user:local' },
        idempotencyKey: `ui-record-page-${crypto.randomUUID()}`,
        review: (plan) =>
          services.confirm(
            `Apply this ${property.name} change to the database page?\n\nExact plan: ${plan.id}\nPlan hash: ${plan.hash}`,
          ),
      });
      if (outcome.status === 'blocked') {
        setMutationConflict(outcome.plan);
        return {
          ok: false,
          error:
            outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
            'The database change is blocked by the current canonical state',
        };
      }
      if (outcome.status === 'review_declined') {
        return { ok: false, error: 'The database change was not approved' };
      }
      return { ok: true };
    } catch (cause) {
      if (cause instanceof DatabasePlanExecutionError) setMutationConflict(cause.plan);
      const message = cause instanceof Error ? cause.message : 'Database property update failed';
      setMutationError(message);
      return { ok: false, error: message };
    } finally {
      setMutationPropertyId(null);
    }
  }

  async function ensureCurrentRecord(): Promise<typeof currentRecord> {
    if (!metadata || !source) return null;
    if (currentRecord?.id === metadata.record_id) return currentRecord;
    setMutationError(null);
    try {
      const result = await services.fetchRecord({
        databaseId: metadata.database_id,
        sourceId: metadata.source_id,
        recordId: metadata.record_id,
      });
      setCurrentRecord(result.record);
      setRecordPageProblem(null);
      return result.record;
    } catch (cause) {
      const problem = databaseRecordPageProblem(cause);
      setRecordPageProblem(problem);
      setMutationError(problem.message);
      return null;
    }
  }

  async function openRelations(): Promise<void> {
    if (await ensureCurrentRecord()) setRelationsDialogOpen(true);
  }

  function commitRecordAppearance({ icon, cover }: DatabasePageAppearance): void {
    if (appearanceSaving) return;
    setAppearanceSaving(true);
    setMutationError(null);
    const binding = bindFrontmatterDoc(provider);
    const result = binding.patch({ icon, cover });
    binding.dispose();
    if (!result.ok) {
      setMutationError(
        result.error.code === 'SCHEMA_INVALID'
          ? result.error.issues.map((issue) => issue.message).join('; ')
          : result.error.detail,
      );
      setAppearanceSaving(false);
      return;
    }
    setAppearanceDialogOpen(false);
    setAppearanceSaving(false);
  }

  async function commitPageLayout(nextLayout: DatabasePageLayout): Promise<void> {
    if (!currentBinding || !source || layoutMutationRunning) return;
    setLayoutMutationRunning(true);
    setMutationError(null);
    setMutationConflict(null);
    try {
      const desiredState = createDatabasePageLayoutChangeDesiredState({
        database: currentBinding.database,
        source,
        pageLayout: nextLayout,
      });
      const outcome = await services.executeMutation({
        desiredState,
        actor: { principalId: 'user:local' },
        idempotencyKey: `ui-record-layout-${crypto.randomUUID()}`,
        review: (plan) =>
          services.confirm(
            `Apply this page layout to the database source?\n\nExact plan: ${plan.id}\nPlan hash: ${plan.hash}`,
          ),
      });
      if (outcome.status === 'blocked') {
        setMutationConflict(outcome.plan);
        throw new Error(
          outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
            'The page layout change is blocked by the current canonical state',
        );
      }
      if (outcome.status === 'review_declined') return;
      setBinding((current) => {
        if (
          current.status !== 'ready' ||
          current.key !== metadataKey ||
          !current.description.source
        ) {
          return current;
        }
        const nextSource = { ...current.description.source, pageLayout: nextLayout };
        return {
          ...current,
          description: {
            ...current.description,
            source: nextSource,
            database: {
              ...current.description.database,
              sources: current.description.database.sources.map((candidate) =>
                candidate.id === nextSource.id ? nextSource : candidate,
              ),
            },
          },
        };
      });
      setLayoutDialogOpen(false);
    } catch (cause) {
      if (cause instanceof DatabasePlanExecutionError) setMutationConflict(cause.plan);
      setMutationError(
        cause instanceof Error ? cause.message : 'Database page layout update failed',
      );
    } finally {
      setLayoutMutationRunning(false);
    }
  }

  async function commitRecordPageLayoutOverride(
    nextOverride: typeof recordPageLayoutOverride,
  ): Promise<void> {
    if (!metadata || !currentBinding || !source || layoutMutationRunning) return;
    setLayoutMutationRunning(true);
    setMutationError(null);
    setMutationConflict(null);
    try {
      const record = await services.fetchRecord({
        databaseId: metadata.database_id,
        sourceId: metadata.source_id,
        recordId: metadata.record_id,
      });
      if (record.record.path !== `${docName}${docExt}`) {
        throw new Error('The open page no longer matches the database page path');
      }
      const body = stripFrontmatter(provider.document.getText('source').toString()).body;
      const desiredState = createDatabaseRecordPageLayoutOverrideDesiredState({
        database: currentBinding.database,
        source,
        record: record.record,
        body,
        pageLayoutOverride: nextOverride,
      });
      const outcome = await services.executeMutation({
        desiredState,
        actor: { principalId: 'user:local' },
        idempotencyKey: `ui-record-layout-override-${crypto.randomUUID()}`,
        review: (plan) =>
          services.confirm(
            `Apply this presentation override to the current record?\n\nExact plan: ${plan.id}\nPlan hash: ${plan.hash}`,
          ),
      });
      if (outcome.status === 'blocked') {
        setMutationConflict(outcome.plan);
        throw new Error(
          outcome.plan.conflicts.map((conflict) => conflict.message).join('\n') ||
            'The page layout override is blocked by the current database state',
        );
      }
      if (outcome.status === 'review_declined') return;
      setRecordPageLayoutOverride(nextOverride);
      setRecordLayoutDialogOpen(false);
    } catch (cause) {
      if (cause instanceof DatabasePlanExecutionError) setMutationConflict(cause.plan);
      setMutationError(
        cause instanceof Error ? cause.message : 'Database page layout override failed',
      );
    } finally {
      setLayoutMutationRunning(false);
    }
  }

  if (!metadata) {
    return (
      <DatabaseRecordPageSurface mode="full_page">
        <PageHeader
          provider={provider}
          docName={docName}
          docExt={docExt}
          fallbackTitle={fallbackTitle}
        />
        <PropertyPanel provider={provider} reservedKeys={['_sn']} />
        {body ? (
          <div
            className="relative min-h-0 flex-1"
            data-database-record-body
            data-record-body-position="below-properties"
          >
            {body}
          </div>
        ) : null}
      </DatabaseRecordPageSurface>
    );
  }

  const recordUnavailable =
    (binding.status === 'error' && binding.key === metadataKey) || recordPageProblem !== null;
  const backToDatabase = () => {
    navigateToDatabaseRecordPageHash(
      recordNavigation
        ? databaseRecordPageOriginHash(recordNavigation)
        : databaseRecordPageFallbackHash(metadata.database_id, metadata.source_id),
    );
  };

  return (
    <DatabaseRecordPageSurface
      mode="full_page"
      databaseId={metadata.database_id}
      sourceId={metadata.source_id}
      recordId={metadata.record_id}
    >
      <PageHeader
        provider={provider}
        docName={docName}
        docExt={docExt}
        fallbackTitle={fallbackTitle}
        databaseTitle={databaseTitle}
        onDatabaseTitleCommit={
          titleProperty
            ? (nextTitle) => commitDatabaseProperty(titleProperty, nextTitle)
            : undefined
        }
      />
      <div className="editor-content-aligned py-1">
        <DatabasePresenceBadges entries={recordPresence} scope="record" />
      </div>
      {binding.status === 'loading' || binding.key !== metadataKey ? (
        <div className="editor-content-aligned py-3">
          <p className="text-sm text-muted-foreground" role="status">
            <Trans>Loading verified database properties</Trans>
          </p>
        </div>
      ) : null}
      {recordUnavailable ? (
        <DatabaseRecordPageStateNotice
          problem={
            recordPageProblem ?? {
              kind: 'error',
              message: binding.status === 'error' ? binding.message : 'The page is unavailable',
            }
          }
          onBack={backToDatabase}
        />
      ) : null}
      {!recordUnavailable && currentRecord?.archivedAt ? (
        <div className="editor-content-aligned py-2">
          <p
            className="text-sm text-muted-foreground"
            role="status"
            data-database-record-state="archived"
          >
            <Trans>This page is archived. Restore it from More page actions.</Trans>
          </p>
        </div>
      ) : null}
      {!recordUnavailable && mutationConflict ? (
        <div className="editor-content-aligned py-2">
          <DatabaseConflictResolutionNotice
            plan={mutationConflict}
            onUseLatest={() => {
              setMutationConflict(null);
              setMutationError(null);
            }}
          />
        </div>
      ) : !recordUnavailable && mutationError ? (
        <div className="editor-content-aligned py-2">
          <p className="text-sm text-destructive" role="alert">
            {mutationError}
          </p>
        </div>
      ) : null}
      {source && !recordUnavailable ? (
        <div className="editor-content-aligned py-1">
          <div className="flex min-w-0 items-center justify-end gap-1" data-database-record-toolbar>
            {recordNavigation ? (
              <>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Previous page"
                  title="Previous page"
                  disabled={recordNavigation.index === 0}
                  onClick={() => navigateToRecord(recordNavigation.index - 1)}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Next page"
                  title="Next page"
                  disabled={recordNavigation.index === recordNavigation.paths.length - 1}
                  onClick={() => navigateToRecord(recordNavigation.index + 1)}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Back to database view"
                  title="Back to database view"
                  onClick={() => {
                    navigateToDatabaseRecordPageHash(
                      databaseRecordPageOriginHash(recordNavigation),
                    );
                  }}
                >
                  <ArrowLeft aria-hidden="true" />
                </Button>
              </>
            ) : null}
            <DatabaseAgentScopeMenu
              scope={{
                databaseId: metadata.database_id,
                sourceId: metadata.source_id,
                recordId: metadata.record_id,
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="More page actions"
                  data-database-record-actions
                  disabled={recordActionRunning}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <Trans>Page options</Trans>
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setHistoryDialogOpen(true)}>
                  <History aria-hidden="true" /> <Trans>Page history</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setPermissionsDialogOpen(true)}
                  data-database-record-permissions
                >
                  <Shield aria-hidden="true" /> <Trans>Permissions</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={appearanceSaving || mutationPropertyId !== null}
                  onSelect={() => setAppearanceDialogOpen(true)}
                  data-database-record-appearance
                >
                  <Palette aria-hidden="true" /> <Trans>Customize appearance</Trans>
                </DropdownMenuItem>
                {source.properties.some((property) => property.type === 'relation') ? (
                  <DropdownMenuItem onSelect={() => void openRelations()}>
                    <Link2 aria-hidden="true" /> <Trans>Relations</Trans>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  disabled={layoutMutationRunning || mutationPropertyId !== null}
                  onSelect={() => setRecordLayoutDialogOpen(true)}
                >
                  <Settings2 aria-hidden="true" /> <Trans>Customize this page</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={layoutMutationRunning || mutationPropertyId !== null}
                  onSelect={() => setLayoutDialogOpen(true)}
                >
                  <SlidersHorizontal aria-hidden="true" /> <Trans>Customize layout</Trans>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>
                  <Trans>Page actions</Trans>
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => void duplicateCurrentRecord()}>
                  <Copy aria-hidden="true" /> <Trans>Duplicate page</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void toggleArchiveCurrentRecord()}>
                  {currentRecord?.archivedAt ? (
                    <RotateCcw aria-hidden="true" />
                  ) : (
                    <Archive aria-hidden="true" />
                  )}
                  {currentRecord?.archivedAt ? (
                    <Trans>Restore page</Trans>
                  ) : (
                    <Trans>Archive page</Trans>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={compatibleMoveTargets.length === 0}
                  onSelect={() => void openMoveDialog()}
                >
                  <MoveRight aria-hidden="true" /> <Trans>Move page</Trans>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => void deleteCurrentRecord()}
                >
                  <Trash2 aria-hidden="true" /> <Trans>Delete page</Trans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : null}
      {source && !recordUnavailable ? (
        pageLayout ? (
          <div
            data-database-page-layout
            data-full-width-content={pageLayout.fullWidthContent ? 'true' : 'false'}
          >
            {pageLayout.pinned.length > 0 ? (
              <PropertyPanel
                provider={provider}
                reservedKeys={reservedKeys}
                managedProperties={pageLayout.pinned}
                visibleKeys={pageLayout.pinned.map((property) => property.key)}
                title={<Trans>Pinned</Trans>}
                allowAdd={false}
                onManagedPropertyCommit={commitDatabaseProperty}
                relationTargets={relationTargets}
                relationTargetsLoading={relationTargetsLoading}
              />
            ) : null}
            {pageLayout.panel.length > 0 ? (
              <PropertyPanel
                provider={provider}
                reservedKeys={reservedKeys}
                managedProperties={pageLayout.panel}
                visibleKeys={pageLayout.panel.map((property) => property.key)}
                allowAdd={false}
                onManagedPropertyCommit={commitDatabaseProperty}
                relationTargets={relationTargets}
                relationTargetsLoading={relationTargetsLoading}
              />
            ) : null}
            {pageLayout.sections.map((section) => (
              <section key={section.id} className="py-2" data-database-layout-section={section.id}>
                <div className="editor-content-aligned">
                  <h2 className="font-heading font-semibold text-base">{section.name}</h2>
                </div>
                {section.groups.map((group) => (
                  <PropertyPanel
                    key={group.id}
                    provider={provider}
                    reservedKeys={reservedKeys}
                    managedProperties={group.properties}
                    visibleKeys={group.properties.map((property) => property.key)}
                    title={group.name}
                    allowAdd={false}
                    defaultCollapsed={group.collapsed}
                    onManagedPropertyCommit={commitDatabaseProperty}
                    relationTargets={relationTargets}
                    relationTargetsLoading={relationTargetsLoading}
                  />
                ))}
              </section>
            ))}
            <PropertyPanel
              provider={provider}
              reservedKeys={['_sn', ...source.properties.map((property) => property.key)]}
              title={<Trans>Other properties</Trans>}
            />
          </div>
        ) : (
          <PropertyPanel
            provider={provider}
            reservedKeys={reservedKeys}
            managedProperties={source.properties}
            onManagedPropertyCommit={commitDatabaseProperty}
            relationTargets={relationTargets}
            relationTargetsLoading={relationTargetsLoading}
          />
        )
      ) : null}
      {source && currentBinding && currentRecord && !recordUnavailable ? (
        <div className="editor-content-aligned">
          <DatabaseRecordPeekComments
            database={currentBinding.database}
            source={source}
            record={currentRecord}
            request={commentsRequest}
          />
        </div>
      ) : null}
      {mutationPropertyId ? (
        <div className="editor-content-aligned py-2">
          <p className="text-xs text-muted-foreground" role="status">
            <Trans>Verifying database change</Trans>
          </p>
        </div>
      ) : null}
      {body && !recordUnavailable ? (
        <div
          className="relative min-h-0 flex-1"
          data-database-record-body
          data-record-body-position="below-properties"
        >
          {body}
        </div>
      ) : null}
      {source && currentBinding && !recordUnavailable && layoutDialogOpen ? (
        <DatabasePageLayoutDialog
          key={source.id}
          open
          source={source}
          onOpenChange={setLayoutDialogOpen}
          onSave={(layout) => void commitPageLayout(layout)}
        />
      ) : null}
      {source && currentBinding && !recordUnavailable && recordLayoutDialogOpen ? (
        <DatabaseRecordLayoutOverrideDialog
          key={`${source.id}:${metadata.record_id}`}
          open
          source={source}
          override={recordPageLayoutOverride}
          onOpenChange={setRecordLayoutDialogOpen}
          onSave={(override) => void commitRecordPageLayoutOverride(override)}
        />
      ) : null}
      {source && currentBinding && !recordUnavailable && currentRecord && relationsDialogOpen ? (
        <DatabaseRelationsDialog
          open
          onOpenChange={setRelationsDialogOpen}
          database={currentBinding.database}
          source={source}
          record={currentRecord}
        />
      ) : null}
      {source && !recordUnavailable && historyDialogOpen ? (
        <DatabaseRecordHistoryDialog
          open
          onOpenChange={setHistoryDialogOpen}
          docName={docName}
          source={source}
        />
      ) : null}
      {source && !recordUnavailable && appearanceDialogOpen ? (
        <DatabasePageAppearanceDialog
          open
          mode="record"
          onOpenChange={setAppearanceDialogOpen}
          icon={recordIcon}
          cover={recordCover}
          busy={appearanceSaving}
          onSave={commitRecordAppearance}
        />
      ) : null}
      {source && currentBinding && !recordUnavailable && permissionsDialogOpen ? (
        <DatabasePermissionsDialog
          open
          onOpenChange={setPermissionsDialogOpen}
          databaseId={currentBinding.database.id}
          databaseName={currentBinding.database.name}
          database={currentBinding.database}
          selectedViewId={recordNavigation?.viewId}
          selectedRecordId={metadata.record_id}
        />
      ) : null}
      {source && currentBinding && !recordUnavailable && currentRecord && moveDialogOpen ? (
        <Dialog open onOpenChange={setMoveDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                <Trans>Move page</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>
                  Choose a compatible data source. The move will use the same reviewed plan as the
                  database row action.
                </Trans>
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Select value={moveTargetSourceId} onValueChange={setMoveTargetSourceId}>
                <SelectTrigger aria-label="Move target source">
                  <SelectValue placeholder="Choose source" />
                </SelectTrigger>
                <SelectContent>
                  {compatibleMoveTargets.map(({ source: targetSource, mapping }) => (
                    <SelectItem key={targetSource.id} value={targetSource.id}>
                      {targetSource.name} · {mapping.propertyMappings.length} mapped properties
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMoveDialogOpen(false)}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                type="button"
                disabled={!moveTargetSourceId || recordActionRunning}
                onClick={() => void commitMove()}
              >
                <Trans>Plan move</Trans>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </DatabaseRecordPageSurface>
  );
}
