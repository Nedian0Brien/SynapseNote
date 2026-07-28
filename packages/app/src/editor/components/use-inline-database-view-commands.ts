import type {
  DatabaseDefinition,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import type { DatabaseViewManagerInitialAction } from '@/components/DatabaseViewManagerDialog';
import type { DatabaseViewTabAction } from '@/components/DatabaseViewTabMenu';
import type { DatabaseMutationPolicy } from '@/lib/database-mutation-controller';
import type { DatabaseViewLifecycleChange } from '@/lib/database-mutations/database-view-commands';
import {
  createDatabaseDefaultViewChangeDesiredState,
  createDatabaseViewLifecycleChangeDesiredState,
} from '@/lib/database-mutations/database-view-commands';
import { databaseViewTabActionToInitialAction } from './inline-database-utils';
import type { useInlineDatabaseControllerState } from './use-inline-database-controller-state';

type InlineControllerState = ReturnType<typeof useInlineDatabaseControllerState>;
type RunInlineMutation = (
  desiredState: DatabaseDesiredStateDraftInput,
  policy: DatabaseMutationPolicy,
) => void;

/** Surfaces an inline command can route to, inline overlay or full workspace. */
export type InlineDatabaseSurfaceTarget =
  | 'properties'
  | 'options'
  | 'view-settings'
  | 'view-manager'
  | 'filters';

export interface InlineDatabaseViewCommandsInput {
  isReady: boolean;
  linkedSource: DatabaseSource | null | undefined;
  linkedDatabase: DatabaseDefinition | null | undefined;
  controller: Pick<
    InlineControllerState,
    | 'inlineOverlayState'
    | 'setFullDatabaseOpen'
    | 'setInitialDatabaseSurface'
    | 'setInitialPropertyId'
    | 'setInitialViewAction'
    | 'setInlineViewManagerInitialAction'
    | 'setInlineViewManagerOpen'
    | 'setLinkedFilterOpen'
    | 'setLinkedFilterTargetId'
    | 'setLinkedSortTargetId'
    | 'setLinkedViewSettingsOpen'
  >;
  runInlineMutation: RunInlineMutation;
  setInlineMutationErrorFromCause: (cause: unknown, fallback: string) => void;
}

/**
 * Saved-view routing and lifecycle commands for an inline database block.
 * Extracted from `use-inline-database-commands.ts` so both modules stay inside
 * their RFC 0002 size budget; record, cell, and property commands stay there.
 */
export function createInlineDatabaseViewCommands({
  isReady,
  linkedSource,
  linkedDatabase,
  controller,
  runInlineMutation,
  setInlineMutationErrorFromCause,
}: InlineDatabaseViewCommandsInput) {
  const {
    inlineOverlayState,
    setFullDatabaseOpen,
    setInitialDatabaseSurface,
    setInitialPropertyId,
    setInitialViewAction,
    setInlineViewManagerInitialAction,
    setInlineViewManagerOpen,
    setLinkedFilterOpen,
    setLinkedFilterTargetId,
    setLinkedSortTargetId,
    setLinkedViewSettingsOpen,
  } = controller;

  const openInlineDatabaseSurface = (
    surface: InlineDatabaseSurfaceTarget,
    propertyId?: string,
    viewAction?: DatabaseViewManagerInitialAction,
    options: { advanced?: boolean } = {},
  ) => {
    if (surface === 'properties') {
      if (!options.advanced) {
        inlineOverlayState.openProperties();
        return;
      }
      setInitialDatabaseSurface('properties');
      setInitialPropertyId(propertyId);
      setFullDatabaseOpen(true);
      return;
    }
    if (surface === 'view-settings') {
      if (!options.advanced) {
        inlineOverlayState.openSort(propertyId);
        return;
      }
      setLinkedSortTargetId(propertyId);
      setLinkedViewSettingsOpen(true);
      return;
    }
    if (surface === 'filters') {
      if (!options.advanced) {
        inlineOverlayState.openFilter(propertyId);
        return;
      }
      setLinkedFilterTargetId(propertyId);
      setLinkedFilterOpen(true);
      return;
    }
    if (surface === 'view-manager' && !options.advanced) {
      setInlineViewManagerInitialAction(viewAction);
      setInlineViewManagerOpen(true);
      return;
    }
    setInitialDatabaseSurface(surface);
    setInitialPropertyId(propertyId);
    setInitialViewAction(viewAction);
    setFullDatabaseOpen(true);
  };

  const handleInlineViewTabAction = (
    view: Pick<DatabaseView, 'id' | 'favorite'>,
    action: DatabaseViewTabAction,
  ) => {
    if (action === 'filters') {
      openInlineDatabaseSurface('filters', undefined, undefined, { advanced: true });
      return;
    }
    if (action === 'settings') {
      openInlineDatabaseSurface('view-settings', undefined, undefined, { advanced: true });
      return;
    }
    const initialAction = databaseViewTabActionToInitialAction(view, action);
    openInlineDatabaseSurface('view-manager', undefined, initialAction ?? undefined);
  };

  const commitInlineViewChange = (change: DatabaseViewLifecycleChange) => {
    if (!isReady || !linkedSource || !linkedDatabase) return;
    try {
      runInlineMutation(
        createDatabaseViewLifecycleChangeDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          change,
        }),
        {
          operation: 'view',
          onCommitted: () => {
            setInlineViewManagerInitialAction(undefined);
            setInlineViewManagerOpen(false);
          },
        },
      );
    } catch (cause) {
      setInlineMutationErrorFromCause(cause, 'Unable to update saved view');
    }
  };

  const commitInlineDefaultViewChange = (nextViewId?: string) => {
    if (!isReady || !linkedSource || !linkedDatabase) return;
    try {
      runInlineMutation(
        createDatabaseDefaultViewChangeDesiredState({
          database: linkedDatabase,
          source: linkedSource,
          ...(nextViewId ? { viewId: nextViewId } : {}),
        }),
        { operation: 'view', onCommitted: () => setInlineViewManagerOpen(false) },
      );
    } catch (cause) {
      setInlineMutationErrorFromCause(cause, 'Unable to update default view');
    }
  };

  return {
    openInlineDatabaseSurface,
    handleInlineViewTabAction,
    commitInlineViewChange,
    commitInlineDefaultViewChange,
  };
}
