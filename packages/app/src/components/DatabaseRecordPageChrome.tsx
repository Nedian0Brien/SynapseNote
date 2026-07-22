import type { HocuspocusProvider } from '@hocuspocus/provider';
import { Trans } from '@lingui/react/macro';
import type { DatabasePageLayout } from '@nedian0brien/synapsenote-core';
import {
  bindFrontmatterDoc,
  type DatabaseProperty,
  type FrontmatterSnapshot,
  type FrontmatterValue,
  readFmKeys,
  readFmRegionWithError,
  stripFrontmatter,
} from '@nedian0brien/synapsenote-core';
import { History, Link2, MessageSquare, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DatabaseCommentsDialog } from '@/components/DatabaseCommentsDialog';
import { DatabaseConflictResolutionNotice } from '@/components/DatabaseConflictResolutionNotice';
import { DatabasePageLayoutDialog } from '@/components/DatabasePageLayoutDialog';
import { DatabasePresenceBadges } from '@/components/DatabasePresenceBadges';
import { DatabaseRecordHistoryDialog } from '@/components/DatabaseRecordHistoryDialog';
import { DatabaseRecordLayoutOverrideDialog } from '@/components/DatabaseRecordLayoutOverrideDialog';
import { DatabaseRelationsDialog } from '@/components/DatabaseRelationsDialog';
import { PageHeader } from '@/components/PageHeader';
import { PropertyPanel } from '@/components/PropertyPanel';
import { Button } from '@/components/ui/button';
import { type DatabaseDescription, describeDatabase } from '@/lib/database-catalog-client';
import {
  createDatabaseCellMutationDesiredState,
  createDatabasePageLayoutChangeDesiredState,
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
  databaseRecordNavigationHash,
  databaseRecordNavigationOriginHash,
  readDatabaseRecordNavigation,
} from '@/lib/database-record-navigation';
import { databaseRecordMetadata, databaseValueFromFrontmatter } from '@/lib/database-record-page';

interface DatabaseRecordPageChromeProps {
  provider: HocuspocusProvider;
  docName: string;
  docExt: string;
  fallbackTitle: string;
  services?: DatabaseRecordPageServices;
}

export interface DatabaseRecordPageServices {
  describe: typeof describeDatabase;
  fetchRecord: typeof fetchDatabaseRecord;
  executeMutation: typeof executeDatabaseUiMutation;
  confirm: (message: string) => boolean;
}

const DEFAULT_SERVICES: DatabaseRecordPageServices = {
  describe: describeDatabase,
  fetchRecord: fetchDatabaseRecord,
  executeMutation: executeDatabaseUiMutation,
  confirm: (message) => window.confirm(message),
};

function readInitialSnapshot(provider: HocuspocusProvider): FrontmatterSnapshot {
  const source = provider.document.getText('source').toString();
  const { map, parseError } = readFmRegionWithError(source);
  return { map, keys: readFmKeys(source), parseError };
}

type BindingState =
  | { status: 'idle' | 'loading'; key: string | null; description: null }
  | { status: 'ready'; key: string; description: DatabaseDescription }
  | { status: 'error'; key: string; description: null; message: string };

export function DatabaseRecordPageChrome({
  provider,
  docName,
  docExt,
  fallbackTitle,
  services = DEFAULT_SERVICES,
}: DatabaseRecordPageChromeProps) {
  'use no memo';
  const [snapshot, setSnapshot] = useState<FrontmatterSnapshot>(() =>
    readInitialSnapshot(provider),
  );
  const metadata = databaseRecordMetadata(snapshot.map);
  const databaseId = metadata?.database_id ?? null;
  const sourceId = metadata?.source_id ?? null;
  const metadataKey = metadata ? `${databaseId}\0${sourceId}\0${metadata.record_id}` : null;
  const recordNavigationPath = metadata ? `${docName}${docExt}` : null;
  const metadataPageLayoutOverrideKey = JSON.stringify({
    record: metadataKey,
    override: metadata?.page_layout_override ?? null,
  });
  const [binding, setBinding] = useState<BindingState>({
    status: metadataKey ? 'loading' : 'idle',
    key: metadataKey,
    description: null,
  });
  const [mutationPropertyId, setMutationPropertyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationConflict, setMutationConflict] = useState<
    DatabasePlanExecutionError['plan'] | null
  >(null);
  const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
  const [recordLayoutDialogOpen, setRecordLayoutDialogOpen] = useState(false);
  const [commentsDialogOpen, setCommentsDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [relationsDialogOpen, setRelationsDialogOpen] = useState(false);
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
          operation: layoutMutationRunning
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
    const hash = databaseRecordNavigationHash(recordNavigation, index);
    if (hash) window.location.hash = hash;
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
    if (!databaseId || !sourceId || !metadataKey) {
      setBinding({ status: 'idle', key: null, description: null });
      return;
    }
    const controller = new AbortController();
    setBinding({ status: 'loading', key: metadataKey, description: null });
    void services
      .describe({ databaseId, sourceId }, { signal: controller.signal })
      .then((description) => {
        if (!description.source) throw new Error('The record data source is unavailable');
        if (!description.source.properties.some((property) => property.type === 'title')) {
          throw new Error('The record data source has no Title property');
        }
        setBinding({ status: 'ready', key: metadataKey, description });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setBinding({
          status: 'error',
          key: metadataKey,
          description: null,
          message: cause instanceof Error ? cause.message : 'Could not load database properties',
        });
      });
    return () => controller.abort();
  }, [databaseId, metadataKey, services, sourceId]);

  const currentBinding =
    binding.status === 'ready' && binding.key === metadataKey ? binding.description : null;
  const source = currentBinding?.source ?? null;
  const titleProperty = source?.properties.find((property) => property.type === 'title') ?? null;
  const databaseTitle =
    titleProperty && typeof snapshot.map[titleProperty.key] === 'string'
      ? (snapshot.map[titleProperty.key] as string)
      : undefined;
  const reservedKeys = ['_sn', ...(titleProperty ? [titleProperty.key] : [])];
  const pageLayout =
    source && (source.pageLayout || recordPageLayoutOverride)
      ? resolveDatabasePageLayout(source, source.pageLayout, recordPageLayoutOverride ?? undefined)
      : null;

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
        throw new Error('The open page no longer matches the canonical database record path');
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
            `Apply this ${property.name} change to the database record?\n\nExact plan: ${plan.id}\nPlan hash: ${plan.hash}`,
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
    setMutationError(null);
    try {
      const result = await services.fetchRecord({
        databaseId: metadata.database_id,
        sourceId: metadata.source_id,
        recordId: metadata.record_id,
      });
      setCurrentRecord(result.record);
      return result.record;
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : 'Could not load database record');
      return null;
    }
  }

  async function openComments(): Promise<void> {
    if (await ensureCurrentRecord()) setCommentsDialogOpen(true);
  }

  async function openRelations(): Promise<void> {
    if (await ensureCurrentRecord()) setRelationsDialogOpen(true);
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
            `Apply this record layout to the database source?\n\nExact plan: ${plan.id}\nPlan hash: ${plan.hash}`,
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
        throw new Error('The open page no longer matches the canonical database record path');
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
            'The record layout override is blocked by the current canonical state',
        );
      }
      if (outcome.status === 'review_declined') return;
      setRecordPageLayoutOverride(nextOverride);
      setRecordLayoutDialogOpen(false);
    } catch (cause) {
      if (cause instanceof DatabasePlanExecutionError) setMutationConflict(cause.plan);
      setMutationError(
        cause instanceof Error ? cause.message : 'Database record layout override failed',
      );
    } finally {
      setLayoutMutationRunning(false);
    }
  }

  if (!metadata) {
    return (
      <>
        <PageHeader
          provider={provider}
          docName={docName}
          docExt={docExt}
          fallbackTitle={fallbackTitle}
        />
        <PropertyPanel provider={provider} reservedKeys={['_sn']} />
      </>
    );
  }

  return (
    <>
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
        <p className="editor-content-aligned py-3 text-sm text-muted-foreground" role="status">
          <Trans>Loading verified database properties</Trans>
        </p>
      ) : null}
      {binding.status === 'error' && binding.key === metadataKey ? (
        <p className="editor-content-aligned py-3 text-sm text-destructive" role="alert">
          {binding.message}
        </p>
      ) : null}
      {mutationConflict ? (
        <div className="editor-content-aligned py-2">
          <DatabaseConflictResolutionNotice
            plan={mutationConflict}
            onUseLatest={() => {
              setMutationConflict(null);
              setMutationError(null);
            }}
          />
        </div>
      ) : mutationError ? (
        <p className="editor-content-aligned py-2 text-sm text-destructive" role="alert">
          {mutationError}
        </p>
      ) : null}
      {source ? (
        <div className="editor-content-aligned py-1">
          <div className="flex justify-end">
            {recordNavigation ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={recordNavigation.index === 0}
                  onClick={() => navigateToRecord(recordNavigation.index - 1)}
                >
                  Previous record
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={recordNavigation.index === recordNavigation.paths.length - 1}
                  onClick={() => navigateToRecord(recordNavigation.index + 1)}
                >
                  Next record
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    window.location.hash = databaseRecordNavigationOriginHash(recordNavigation);
                  }}
                >
                  Back to database view
                </Button>
              </>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={() => void openComments()}>
              <MessageSquare /> <Trans>Comments</Trans>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setHistoryDialogOpen(true)}
            >
              <History /> <Trans>Record history</Trans>
            </Button>
            {source.properties.some((property) => property.type === 'relation') ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => void openRelations()}>
                <Link2 /> <Trans>Relations</Trans>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={layoutMutationRunning || mutationPropertyId !== null}
              onClick={() => setRecordLayoutDialogOpen(true)}
            >
              <Settings2 /> <Trans>Customize this record</Trans>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={layoutMutationRunning || mutationPropertyId !== null}
              onClick={() => setLayoutDialogOpen(true)}
            >
              <Settings2 /> <Trans>Customize layout</Trans>
            </Button>
          </div>
        </div>
      ) : null}
      {source ? (
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
          />
        )
      ) : null}
      {mutationPropertyId ? (
        <p className="editor-content-aligned py-2 text-xs text-muted-foreground" role="status">
          <Trans>Verifying database change</Trans>
        </p>
      ) : null}
      {source && currentBinding && layoutDialogOpen ? (
        <DatabasePageLayoutDialog
          key={`${source.id}:${currentBinding.schemaRevision}`}
          open
          source={source}
          onOpenChange={setLayoutDialogOpen}
          onSave={(layout) => void commitPageLayout(layout)}
        />
      ) : null}
      {source && currentBinding && recordLayoutDialogOpen ? (
        <DatabaseRecordLayoutOverrideDialog
          key={`${source.id}:${metadata.record_id}:${currentBinding.schemaRevision}`}
          open
          source={source}
          override={recordPageLayoutOverride}
          onOpenChange={setRecordLayoutDialogOpen}
          onSave={(override) => void commitRecordPageLayoutOverride(override)}
        />
      ) : null}
      {source && currentBinding && currentRecord && commentsDialogOpen ? (
        <DatabaseCommentsDialog
          open
          onOpenChange={setCommentsDialogOpen}
          database={currentBinding.database}
          source={source}
          record={currentRecord}
        />
      ) : null}
      {source && currentBinding && currentRecord && relationsDialogOpen ? (
        <DatabaseRelationsDialog
          open
          onOpenChange={setRelationsDialogOpen}
          database={currentBinding.database}
          source={source}
          record={currentRecord}
        />
      ) : null}
      {source && historyDialogOpen ? (
        <DatabaseRecordHistoryDialog
          open
          onOpenChange={setHistoryDialogOpen}
          docName={docName}
          source={source}
        />
      ) : null}
    </>
  );
}
