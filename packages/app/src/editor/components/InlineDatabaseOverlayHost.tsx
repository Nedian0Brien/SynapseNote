import type {
  DatabaseDefinition,
  DatabaseFilter,
  DatabaseLinkedViewSettings,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { lazy, Suspense, useEffect } from 'react';
import { DatabaseAdvancedFilterDialog } from '@/components/DatabaseAdvancedFilterDialog';
import { DatabaseOverlayHost } from '@/components/DatabaseOverlayHost';
import type { DatabaseInitialRecordAction } from '@/components/DatabaseTableGrid';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import { DatabaseSavedViewSettingsShell } from '@/components/database-saved-view-settings/DatabaseSavedViewSettingsShell';
import { useDatabaseOverlayProvider } from '@/lib/database-overlay-store';
import type { DatabaseReadModelState } from '@/lib/database-read-model';
import type { DatabasePasteChange } from '@/lib/database-tsv';
import { InlineDatabaseCreationDialog } from './InlineDatabaseCreationDialog';

function loadDatabaseContextInspectorDialog() {
  return import('@/components/DatabaseContextInspectorDialog');
}

function loadDatabaseTableDialog() {
  return import('@/components/DatabaseTableDialog');
}

const LazyDatabaseContextInspectorDialog = lazy(() =>
  loadDatabaseContextInspectorDialog().then((module) => ({
    default: module.DatabaseContextInspectorDialog,
  })),
);
const LazyDatabaseTableDialog = lazy(() =>
  loadDatabaseTableDialog().then((module) => ({
    default: module.DatabaseTableDialog,
  })),
);

type InlineDatabaseReference = {
  data: { databaseId: string; sourceId: string; viewId: string; mode: 'inline' | 'full-page' };
};

export interface InlineDatabaseOverlayHostProps {
  state: DatabaseReadModelState;
  reference: InlineDatabaseReference;
  linkedSource: DatabaseSource | null;
  linkedDatabase: DatabaseDefinition | null;
  activeLinkedView?: DatabaseView;
  localViewOverrides: DatabaseLinkedViewSettings | undefined;
  persistLinkedViewOverrides: (next: DatabaseLinkedViewSettings | undefined) => void;
  linkedViewSettingsFromView: (view: DatabaseView) => DatabaseLinkedViewSettings;
  inlineCreationOpen: boolean;
  setInlineCreationOpen: (open: boolean) => void;
  applyReference: (
    next: { databaseId: string; sourceId: string; viewId: string },
    options?: { focusNewRecord?: boolean },
  ) => void;
  linkedFilterOpen: boolean;
  setLinkedFilterOpen: (open: boolean) => void;
  linkedFilterTargetId?: string;
  setLinkedFilterTargetId: (id: string | undefined) => void;
  linkedViewSettingsOpen: boolean;
  setLinkedViewSettingsOpen: (open: boolean) => void;
  linkedSortTargetId?: string;
  setLinkedSortTargetId: (id: string | undefined) => void;
  inlineContextInspectorScope: {
    recordId?: string;
    recordIds?: string[];
    propertyIds?: string[];
  } | null;
  setInlineContextInspectorScope: (
    scope: { recordId?: string; recordIds?: string[]; propertyIds?: string[] } | null,
  ) => void;
  fullDatabaseOpen: boolean;
  setFullDatabaseOpen: (open: boolean) => void;
  initialRecordAction?: DatabaseInitialRecordAction;
  setInitialRecordAction: (action: DatabaseInitialRecordAction | undefined) => void;
  initialTablePaste?: readonly DatabasePasteChange[];
  setInitialTablePaste: (paste: readonly DatabasePasteChange[] | undefined) => void;
  initialDatabaseSurface?: 'properties' | 'options' | 'view-settings' | 'view-manager' | 'filters';
  setInitialDatabaseSurface: (
    surface: 'properties' | 'options' | 'view-settings' | 'view-manager' | 'filters' | undefined,
  ) => void;
  initialViewAction?: DatabaseViewManagerInitialAction;
  setInitialViewAction: (action: DatabaseViewManagerInitialAction | undefined) => void;
  initialPropertyId?: string;
  setInitialPropertyId: (id: string | undefined) => void;
  initialSelectedRecordIds?: readonly string[];
  setInitialSelectedRecordIds: (ids: readonly string[] | undefined) => void;
}

export function InlineDatabaseOverlayHost({
  state,
  reference,
  linkedSource,
  linkedDatabase,
  activeLinkedView,
  localViewOverrides,
  persistLinkedViewOverrides,
  linkedViewSettingsFromView,
  inlineCreationOpen,
  setInlineCreationOpen,
  applyReference,
  linkedFilterOpen,
  setLinkedFilterOpen,
  linkedFilterTargetId,
  setLinkedFilterTargetId,
  linkedViewSettingsOpen,
  setLinkedViewSettingsOpen,
  linkedSortTargetId,
  setLinkedSortTargetId,
  inlineContextInspectorScope,
  setInlineContextInspectorScope,
  fullDatabaseOpen,
  setFullDatabaseOpen,
  initialRecordAction,
  setInitialRecordAction,
  initialTablePaste,
  setInitialTablePaste,
  initialDatabaseSurface,
  setInitialDatabaseSurface,
  initialViewAction,
  setInitialViewAction,
  initialPropertyId,
  setInitialPropertyId,
  initialSelectedRecordIds,
  setInitialSelectedRecordIds,
}: InlineDatabaseOverlayHostProps) {
  const hasRootOverlayHost = useDatabaseOverlayProvider();
  useEffect(() => {
    // Warm the document-native dialogs while the inline surface is idle. A
    // later click can open the requested control without covering the
    // database with a blocking lazy-renderer loading screen.
    void loadDatabaseContextInspectorDialog();
    void loadDatabaseTableDialog();
  }, []);
  return (
    <>
      {!hasRootOverlayHost ? <DatabaseOverlayHost /> : null}
      <InlineDatabaseCreationDialog
        open={inlineCreationOpen}
        onOpenChange={setInlineCreationOpen}
        onCreated={(next) => applyReference(next, { focusNewRecord: true })}
      />

      {linkedFilterOpen && linkedSource && activeLinkedView ? (
        <DatabaseAdvancedFilterDialog
          open
          source={linkedSource}
          initialPropertyId={linkedFilterTargetId}
          initialWhere={activeLinkedView.where}
          onOpenChange={(nextOpen) => {
            setLinkedFilterOpen(nextOpen);
            if (!nextOpen) setLinkedFilterTargetId(undefined);
          }}
          onSave={(where: DatabaseFilter | undefined) => {
            persistLinkedViewOverrides({
              ...localViewOverrides,
              where: where ?? null,
            });
            setLinkedFilterOpen(false);
            setLinkedFilterTargetId(undefined);
          }}
        />
      ) : null}
      {linkedViewSettingsOpen && linkedSource && linkedDatabase && activeLinkedView ? (
        <DatabaseSavedViewSettingsShell
          key={`${activeLinkedView.id}:${linkedSortTargetId ?? ''}`}
          open
          source={linkedSource}
          view={activeLinkedView}
          initialSortPropertyId={linkedSortTargetId}
          database={linkedDatabase}
          onOpenChange={(nextOpen) => {
            setLinkedViewSettingsOpen(nextOpen);
            if (!nextOpen) setLinkedSortTargetId(undefined);
          }}
          onSave={(nextView) => {
            persistLinkedViewOverrides(linkedViewSettingsFromView(nextView));
            setLinkedViewSettingsOpen(false);
            setLinkedSortTargetId(undefined);
          }}
        />
      ) : null}

      <Suspense fallback={null}>
        {inlineContextInspectorScope && state.status === 'ready' ? (
          <LazyDatabaseContextInspectorDialog
            open
            onOpenChange={(open) => {
              if (!open) setInlineContextInspectorScope(null);
            }}
            scope={{
              databaseId: state.description.database.id,
              sourceId: state.description.source?.id,
              viewId: reference.data.viewId,
              ...(inlineContextInspectorScope.recordId
                ? { recordId: inlineContextInspectorScope.recordId }
                : {}),
              ...(inlineContextInspectorScope.recordIds?.length
                ? { recordIds: inlineContextInspectorScope.recordIds }
                : {}),
              ...(inlineContextInspectorScope.propertyIds?.length
                ? { propertyIds: inlineContextInspectorScope.propertyIds }
                : {}),
            }}
          />
        ) : null}
        {fullDatabaseOpen ? (
          <LazyDatabaseTableDialog
            open
            onOpenChange={(nextOpen) => {
              setFullDatabaseOpen(nextOpen);
              if (!nextOpen) {
                setInitialRecordAction(undefined);
                setInitialTablePaste(undefined);
                setInitialDatabaseSurface(undefined);
                setInitialViewAction(undefined);
                setInitialPropertyId(undefined);
                setInitialSelectedRecordIds(undefined);
              }
            }}
            initialTarget={reference.data}
            initialRecordAction={initialRecordAction}
            initialTablePaste={initialTablePaste}
            initialDatabaseSurface={initialDatabaseSurface}
            initialViewAction={initialViewAction}
            initialPropertyId={initialPropertyId}
            initialSelectedRecordIds={initialSelectedRecordIds}
          />
        ) : null}
      </Suspense>
    </>
  );
}
