import { useLingui } from '@lingui/react/macro';
import { createDatabaseWorkspaceRenderContext } from './database-workspace-controller-boundaries';
import type { DatabaseTableDialogProps } from './database-workspace-types';
import { useDatabaseWorkspaceControllerState } from './use-database-workspace-controller-state';
import { useDatabaseWorkspaceMutationRecordCommands } from './use-database-workspace-mutation-record-commands';
import { useDatabaseWorkspaceReadLifecycle } from './use-database-workspace-read-lifecycle';
import { useDatabaseWorkspaceStructureCommands } from './use-database-workspace-structure-commands';

/** Composes responsibility-owned workspace state, reads, commands, and rendering. */
export function useDatabaseWorkspaceController(props: DatabaseTableDialogProps) {
  'use no memo';
  const {
    open,
    onOpenChange,
    onOpenContextInspector,
    onOpenAgentRuns,
    onCreationCancelled,
    initialTarget,
    initialAction,
    creationExperience = 'admin',
    presentation = 'dialog',
  } = props;
  const { t } = useLingui();
  const isPagePresentation = presentation !== 'dialog';
  const isCanvasPresentation = presentation === 'canvas';
  const state = useDatabaseWorkspaceControllerState({
    initialDatabaseId: initialTarget?.databaseId,
    initialSourceId: initialTarget?.sourceId,
    initialViewId: initialTarget?.viewId,
    initialSelectedRecordIds: props.initialSelectedRecordIds,
    restoreInitial: props.initialRecordAction?.kind === 'restore',
  });
  const read = useDatabaseWorkspaceReadLifecycle({
    props,
    state,
    isPagePresentation,
    isCanvasPresentation,
    defaultPageTitle: initialAction === 'create' ? t`New database` : t`Database`,
  });
  const selectedView = read.description?.database.views.find(
    (view) => view.id === state.selectedViewId && view.sourceId === read.description?.source?.id,
  );
  const mutationRecordCommands = useDatabaseWorkspaceMutationRecordCommands({
    props,
    state,
    description: read.description,
    result: read.result,
    selectedView,
    itemNoun: isPagePresentation ? 'page' : 'record',
  });
  const structureCommands = useDatabaseWorkspaceStructureCommands({
    props,
    state,
    description: read.description,
    result: read.result,
    catalogStatus: read.catalogStatus,
    tableStatus: read.tableStatus,
    databasePageTitle: read.databasePageTitle,
    isCanvasPresentation,
    isPagePresentation,
    mutationRecordCommands,
  });
  const workspaceRenderContext = createDatabaseWorkspaceRenderContext({
    ...state,
    ...read,
    ...mutationRecordCommands,
    ...structureCommands,
    open,
    presentation,
    isPagePresentation,
    isCanvasPresentation,
    onOpenChange,
    onOpenAgentRuns,
    onOpenContextInspector,
    onCreationCancelled,
    selectedView: structureCommands.selectedView,
    personLabels: { agent: t`agent`, inactive: t`inactive` },
  });
  return {
    workspaceRenderContext,
    open,
    onOpenChange,
    onCreationCancelled,
    initialAction,
    creationExperience,
    presentation,
    isPagePresentation,
    isCanvasPresentation,
    databasePageCover: read.databasePageCover,
    selection: state.selection,
    selectedView: structureCommands.selectedView,
    lastRedoToken: state.lastRedoToken,
    handleDatabaseShortcut: structureCommands.handleDatabaseShortcut,
  };
}
