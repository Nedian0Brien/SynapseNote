import type { DatabaseSource } from '@nedian0brien/synapsenote-core';
import { DatabaseAdvancedFilterDialog } from '@/components/DatabaseAdvancedFilterDialog';
import { DatabaseAutomationsDialog } from '@/components/DatabaseAutomationsDialog';
import { DatabaseComputedPropertyDialog } from '@/components/DatabaseComputedPropertyDialog';
import { DatabaseCreationDialog } from '@/components/DatabaseCreationDialog';
import { DatabaseSourceIdentityMigrationDialog } from '@/components/DatabaseOnboardingDialog';
import { DatabaseOverlayHost } from '@/components/DatabaseOverlayHost';
import { DatabasePageAppearanceDialog } from '@/components/DatabasePageAppearanceDialog';
import { DatabasePermissionsDialog } from '@/components/DatabasePermissionsDialog';
import { DatabasePlacePropertyDialog } from '@/components/DatabasePlacePropertyDialog';
import { DatabasePropertiesDialog } from '@/components/DatabasePropertiesDialog';
import { DatabasePropertyConversionDialog } from '@/components/DatabasePropertyConversionDialog';
import { DatabasePropertyDeletionPreviewDialog } from '@/components/DatabasePropertyDeletionPreviewDialog';
import { DatabaseTemplatesDialog } from '@/components/DatabaseTemplatesDialog';
import { DatabaseUniqueIdPropertyDialog } from '@/components/DatabaseUniqueIdPropertyDialog';
import { DatabaseViewManagerDialog } from '@/components/DatabaseViewManagerDialog';
import { DatabaseViewRenameDialog } from '@/components/DatabaseViewRenameDialog';
import { DatabaseSavedViewSettingsShell } from '@/components/database-saved-view-settings/DatabaseSavedViewSettingsShell';
import { CreatePromptComposer } from '@/components/empty-state/CreatePromptComposer';
import {
  createDatabaseAutomationDesiredState,
  createDatabaseComputedPropertyChangeDesiredState,
  createDatabasePlacePrivacyChangeDesiredState,
  createDatabaseTemplateLifecycleDesiredState,
  createDatabaseUniqueIdPrefixChangeDesiredState,
  createDatabaseViewFilterChangeDesiredState,
  createDatabaseViewLifecycleChangeDesiredState,
} from '@/lib/database-cell-mutation';
import type { ExecuteDatabaseUiMutationResult } from '@/lib/database-mutation-client';
import { databasePageTargetToHash, replaceDatabaseHash } from '@/lib/database-navigation';
import { useDatabaseOverlayProvider, useDatabaseOverlayState } from '@/lib/database-overlay-store';
import { classifyDatabaseUiProblem } from '@/lib/database-ui-problem';
import { databaseSchemaMutationPolicy } from './DatabaseTableGrid';
import type { DatabaseWorkspaceRenderContext } from './database-workspace-context';

export function DatabaseWorkspaceOverlayHost({
  context,
}: {
  context: DatabaseWorkspaceRenderContext;
}) {
  const {
    description,
    result,
    isPagePresentation,
    onOpenChange,
    open,
    presentation,
    setCreationOpen,
    setCreationPreview,
    runMutation,
    setOnboardingOpen,
    mutationStatus,
    computedProperty,
    setComputedPropertyId,
    uniqueIdProperty,
    setUniqueIdPropertyId,
    placeProperty,
    setPlacePropertyId,
    conversionProperty,
    setConversionPropertyId,
    selection,
    setPropertiesDialogOpen,
    propertiesRemoveStatus,
    propertyDeletionPreview,
    selectedView,
    setFilterDialogOpen,
    propertyFilterTargetId,
    setPropertyFilterTargetId,
    propertySortTargetId,
    setViewSettingsOpen,
    setPropertySortTargetId,
    viewRenameTarget,
    sourceViews,
    selectedViewId,
    setMutationError,
    creationInstanceKey,
    creationOpen,
    onCreationCancelled,
    setCreationInstanceKey,
    setSelection,
    setSelectedViewId,
    setPageTitleDraft,
    setPageTitleEditing,
    setNewRecordTitle,
    setNewRecordOpen,
    setOnboardingTarget,
    appearanceOpen,
    setAppearanceOpen,
    commitPageAppearance,
    onboardingOpen,
    onboardingTarget,
    runReviewedPlan,
    propertiesDialogOpen,
    setPropertiesError,
    setPropertiesDialogRenameId,
    propertiesDialogRenameId,
    propertiesError,
    addSchemaProperty,
    removeSchemaProperty,
    reorderSchemaProperties,
    renameSchemaProperty,
    setPropertyDeletionPreview,
    commitPropertyDeletionPreview,
    filterDialogOpen,
    viewSettingsOpen,
    commitSavedViewConfiguration,
    setViewRenameTarget,
    reviewViewRename,
    viewManagerOpen,
    setViewManagerOpen,
    initialViewAction,
    templatesOpen,
    setTemplatesOpen,
    automationsOpen,
    setAutomationsOpen,
    permissionsOpen,
    setPermissionsOpen,
  } = context;
  const hasRootOverlayHost = useDatabaseOverlayProvider();
  const { recordPeek } = useDatabaseOverlayState();
  // Narrow on `presentation` itself rather than an equivalent boolean flag so
  // 'canvas' is provably excluded from the creation dialog's narrower
  // 'page' | 'dialog' prop.
  const creationPresentation = presentation === 'canvas' ? 'page' : presentation;

  return (
    <>
      {!hasRootOverlayHost ? <DatabaseOverlayHost /> : null}
      <DatabaseCreationDialog
        key={creationInstanceKey}
        open={open && creationOpen}
        presentation={creationPresentation}
        agentComposer={<CreatePromptComposer scenario="new-project" databasePreview />}
        onOpenChange={(nextOpen, reason) => {
          setCreationOpen(nextOpen);
          if (!nextOpen && reason !== 'submit') onCreationCancelled?.();
        }}
        onCreate={(desiredState, mode) => {
          setCreationPreview(desiredState);
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
            onCommitted: (
              outcome: Extract<ExecuteDatabaseUiMutationResult, { status: 'committed' }>,
            ) => {
              // The creation form is a draft surface. Once the mutation is
              // committed, close it before handing the user to the new page;
              // otherwise the original `initialAction="create"` can reopen
              // the modal during the canonical-route transition.
              setCreationOpen(false);
              setCreationInstanceKey((current: number) => current + 1);
              // Keep creation in one continuous flow. Once the canonical
              // manifest exists, select its source/view immediately so the
              // next catalog refresh lands on the new editable table instead
              // of making the user rediscover it in the left rail.
              setCreationPreview(null);
              const definition = outcome.draft.normalized?.definition;
              if (!definition || !Array.isArray(definition.sources)) return;
              const source = definition.sources[0];
              if (!source) return;
              const firstView = (definition.views ?? []).find(
                (view: { sourceId: string }) => view.sourceId === source.id,
              );
              setSelection({ databaseId: definition.id, sourceId: source.id });
              setSelectedViewId(firstView?.id ?? '');
              // Every successful creation lands on the canonical page route,
              // even when the creator was opened from the legacy management
              // dialog. Existing-folder creation keeps that shell mounted only
              // long enough to host its separate identity-migration review.
              const route = databasePageTargetToHash({
                databaseId: definition.id,
                sourceId: source.id,
                ...(firstView?.id ? { viewId: firstView.id } : {}),
              });
              replaceDatabaseHash(route);
              if (!isPagePresentation && mode !== 'folder') onOpenChange(false);
              if (mode === 'blank') {
                setPageTitleDraft(source.name ?? definition.name);
                // Keep the canonical title visible while the table handoff
                // settles. The inline flow owns first-row focus; the page
                // shell can still enter title editing explicitly.
                setPageTitleEditing(false);
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
      {description?.source && appearanceOpen ? (
        <DatabasePageAppearanceDialog
          open
          onOpenChange={setAppearanceOpen}
          icon={description.database.icon}
          cover={description.database.cover}
          busy={mutationStatus !== 'idle'}
          onSave={commitPageAppearance}
        />
      ) : null}
      <DatabaseSourceIdentityMigrationDialog
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        target={onboardingTarget}
      />
      {description?.source && result && computedProperty ? (
        <DatabaseComputedPropertyDialog
          key={computedProperty.id}
          open
          onOpenChange={(nextOpen: boolean) => {
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
                { policy: databaseSchemaMutationPolicy },
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
          key={uniqueIdProperty.id}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setUniqueIdPropertyId(null);
          }}
          property={uniqueIdProperty}
          onSave={(prefix: string) => {
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
                { policy: databaseSchemaMutationPolicy },
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
          key={placeProperty.id}
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
                { policy: databaseSchemaMutationPolicy },
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
          key={conversionProperty.id}
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
          key={description.source.id}
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
      {description?.source && propertyDeletionPreview ? (
        <DatabasePropertyDeletionPreviewDialog
          open
          preview={propertyDeletionPreview}
          busy={mutationStatus !== 'idle' || propertiesRemoveStatus !== 'idle'}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setPropertyDeletionPreview(null);
              setPropertiesDialogOpen(true);
            }
          }}
          onConfirm={() => commitPropertyDeletionPreview(propertyDeletionPreview)}
        />
      ) : null}
      {description?.source && selectedView && filterDialogOpen ? (
        <DatabaseAdvancedFilterDialog
          key={`${selectedView.id}:${propertyFilterTargetId ?? ''}`}
          open
          onOpenChange={(nextOpen) => {
            setFilterDialogOpen(nextOpen);
            if (!nextOpen) setPropertyFilterTargetId(null);
          }}
          source={description.source}
          initialPropertyId={propertyFilterTargetId ?? undefined}
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
              setPropertyFilterTargetId(null);
            } catch (cause) {
              setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare saved filters'));
            }
          }}
        />
      ) : null}
      {description?.source && selectedView && viewSettingsOpen ? (
        <DatabaseSavedViewSettingsShell
          key={`${selectedView.id}:${propertySortTargetId ?? ''}`}
          open
          onOpenChange={(nextOpen) => {
            setViewSettingsOpen(nextOpen);
            if (!nextOpen) setPropertySortTargetId(null);
          }}
          source={description.source}
          view={selectedView}
          initialSortPropertyId={propertySortTargetId ?? undefined}
          database={description.database}
          onSave={(view) => {
            if (
              commitSavedViewConfiguration(
                view,
                'ui-view-settings',
                'Saved view settings change failed',
              )
            ) {
              setViewSettingsOpen(false);
              setPropertySortTargetId(null);
            }
          }}
        />
      ) : null}
      {viewRenameTarget ? (
        <DatabaseViewRenameDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setViewRenameTarget(null);
          }}
          view={viewRenameTarget}
          busy={mutationStatus !== 'idle'}
          onReview={reviewViewRename}
        />
      ) : null}
      {description?.source && viewManagerOpen ? (
        <DatabaseViewManagerDialog
          open
          onOpenChange={setViewManagerOpen}
          source={description.source}
          views={sourceViews}
          busy={mutationStatus !== 'idle'}
          initialAction={initialViewAction}
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
          key={description.source.id}
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
          key={description.database.id}
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
          key={description.database.id}
          open
          onOpenChange={setPermissionsOpen}
          databaseId={description.database.id}
          databaseName={description.database.name}
          database={description.database}
          selectedViewId={selectedViewId || undefined}
          selectedRecordId={recordPeek?.record.id}
        />
      ) : null}
    </>
  );
}
