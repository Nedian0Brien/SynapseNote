import {
  NotionDatabaseCreationPage,
  type NotionDatabaseTarget,
} from '@/components/NotionDatabaseCreationPage';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import { databasePageTargetToHash, replaceDatabaseHash } from '@/lib/database-navigation';
import { cn } from '@/lib/utils';
import type {
  DatabaseInitialRecordAction,
  DatabaseSelectProperty,
  DatabaseTableSelection,
  DatabaseTableTarget,
  DatabaseTableViewState,
  LoadStatus,
} from './DatabaseTableGrid';
import {
  DatabaseAtomicApprovalScope,
  DatabaseStateNotice,
  DatabaseTable,
} from './DatabaseTableGrid';
import { DatabaseWorkspaceHeader } from './DatabaseWorkspaceHeader';
import { DatabaseWorkspaceOverlayHost } from './DatabaseWorkspaceOverlayHost';
import { DatabaseWorkspaceReadState } from './DatabaseWorkspaceReadState';
import { DatabaseWorkspaceSidebar } from './DatabaseWorkspaceSidebar';
import { DatabaseWorkspaceSuccessContent } from './DatabaseWorkspaceSuccessContent';
import { useDatabaseWorkspaceController } from './database-workspace/useDatabaseWorkspaceController';
import type { DatabaseTableDialogProps } from './database-workspace-types';

export type { DatabaseTableDialogProps } from './database-workspace-types';
export type {
  DatabaseInitialRecordAction,
  DatabaseSelectProperty,
  DatabaseTableSelection,
  DatabaseTableTarget,
  DatabaseTableViewState,
  LoadStatus,
};
export { DatabaseAtomicApprovalScope, DatabaseStateNotice, DatabaseTable };

function DatabaseTableSurface(props: DatabaseTableDialogProps) {
  const {
    workspaceRenderContext,
    open,
    onOpenChange,
    onCreationCancelled,
    initialAction,
    creationExperience,
    presentation,
    isPagePresentation,
    isCanvasPresentation,
    databasePageCover,
    selection,
    selectedView,
    lastRedoToken,
    handleDatabaseShortcut,
  } = useDatabaseWorkspaceController(props);
  const WorkspaceBody = isPagePresentation ? 'div' : 'main';
  if (creationExperience === 'notion' && initialAction === 'create') {
    if (!open) return null;
    return (
      <NotionDatabaseCreationPage
        open
        onCancel={() => {
          onCreationCancelled?.();
          onOpenChange(false);
        }}
        onCreated={(target: NotionDatabaseTarget) => {
          const route = databasePageTargetToHash(target);
          replaceDatabaseHash(route);
          // The canonical workspace now owns the route. Close the temporary
          // creation surface explicitly as well as broadcasting navigation so
          // a listener-order race cannot leave the page overlay above the
          // newly created database.
          onCreationCancelled?.();
        }}
      />
    );
  }
  return (
    <Dialog
      open={isPagePresentation ? true : open}
      // A route-level page must remain part of the document accessibility
      // tree. Only the compatibility management surface is modal; the page
      // and embedded canvas presentations are ordinary, non-modal workspace
      // surfaces even though they reuse the Dialog primitives for headers,
      // focus return, and nested reviewed controls.
      modal={presentation === 'dialog'}
      // The canonical canvas is owned by DatabasePageRoute's hash. Keeping
      // this presentation root open prevents nested menu/sheet portals from
      // being interpreted as an outside dismissal; explicit breadcrumb
      // navigation above remains the user-facing way to leave the page.
      onOpenChange={isCanvasPresentation ? () => {} : onOpenChange}
    >
      <DialogContent
        portal={!isCanvasPresentation}
        showOverlay={!isPagePresentation}
        showCloseButton={!isCanvasPresentation}
        role={isPagePresentation ? 'main' : undefined}
        onPointerDownOutside={
          presentation === 'page' ? (event) => event.preventDefault() : undefined
        }
        className={cn(
          'sm:max-w-[min(96vw,90rem)]',
          isPagePresentation &&
            'fixed inset-0 z-40 h-[100dvh] max-h-none max-w-none translate-x-0 translate-y-0 rounded-none bg-background p-0',
          isCanvasPresentation &&
            'relative inset-auto z-auto h-full max-h-none max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-0 shadow-none ring-0',
        )}
        data-database-workspace="true"
        data-database-page-workspace={isPagePresentation ? '' : undefined}
        data-database-id={selection?.databaseId ?? undefined}
        data-source-id={selection?.sourceId ?? undefined}
        data-view-id={selectedView?.id ?? undefined}
        data-database-machine-ids="stable"
      >
        {isPagePresentation && databasePageCover.kind !== 'unsupported' ? (
          <div
            className="h-32 w-full overflow-hidden border-b bg-muted sm:h-40"
            data-testid="database-page-cover"
          >
            <img
              src={databasePageCover.value}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : null}
        <DatabaseWorkspaceHeader context={workspaceRenderContext} />
        <DialogBody
          className={cn(
            'min-h-[min(34rem,70vh)] gap-0 overflow-x-hidden p-0',
            isCanvasPresentation ? 'block' : 'grid md:grid-cols-[17rem_minmax(0,1fr)]',
          )}
        >
          <DatabaseWorkspaceSidebar context={workspaceRenderContext} />
          <WorkspaceBody
            className="min-w-0 p-3 sm:p-5"
            // Keep the canonical route's semantic workspace marker on the
            // actual main-content node as well as the dialog primitive. Radix
            // may render the primitive through a non-forwarding composition
            // in non-modal canvas mode; the main node is the stable surface
            // boundary used by accessibility and browser geometry checks.
            data-database-workspace="true"
            data-database-id={selection?.databaseId ?? undefined}
            data-source-id={selection?.sourceId ?? undefined}
            data-view-id={selectedView?.id ?? undefined}
            data-database-redo-available={lastRedoToken ? 'true' : 'false'}
            data-database-layout={selectedView?.layout.type ?? 'table'}
            onKeyDown={handleDatabaseShortcut}
          >
            <DatabaseWorkspaceReadState context={workspaceRenderContext} />
            <DatabaseWorkspaceSuccessContent context={workspaceRenderContext} />
          </WorkspaceBody>
        </DialogBody>
      </DialogContent>
      <DatabaseWorkspaceOverlayHost context={workspaceRenderContext} />
    </Dialog>
  );
}

/**
 * Canonical database route surface.
 *
 * Keeping this entry point separate from the management dialog makes the
 * canvas contract explicit: the route always uses the non-portal workspace
 * presentation, while `DatabaseTableDialog` remains the compatibility entry
 * point for the management and reviewed modal surfaces.
 */
export function DatabaseTableDialog(props: DatabaseTableDialogProps) {
  return <DatabaseTableSurface {...props} />;
}

export function DatabaseWorkspacePage(props: Omit<DatabaseTableDialogProps, 'presentation'>) {
  return <DatabaseTableSurface {...props} presentation="canvas" />;
}
