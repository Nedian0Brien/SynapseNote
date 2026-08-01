import { useLingui } from '@lingui/react/macro';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import type { FileTreeTarget } from '@/components/file-tree-operations';
import { selectTrashConfirmCopy, trashTargetDisplayName } from '@/components/file-tree-trash-copy';
import { NewItemDialog } from '@/components/NewItemDialog';
import { type TrashFailedTarget, TrashFailureModal } from '@/components/TrashFailureModal';
import { Dialog } from '@/components/ui/dialog';

type Props = {
  deleteRequest: { targets: FileTreeTarget[] } | null;
  busy: boolean;
  onCloseDelete: () => void;
  onDelete: (targets: FileTreeTarget[]) => void;
  trashFailure: { failed: TrashFailedTarget[] } | null;
  onCloseTrashFailure: () => void;
  onDeletePermanently: () => void;
  onRetry: () => void;
  newItemOpen: boolean;
  newItemInitialDir: string;
  onCloseNewItem: () => void;
};

/** Renders destructive confirmation and template creation dialogs for the FileTree facade. */
export function FileTreeDialogs({
  deleteRequest,
  busy,
  onCloseDelete,
  onDelete,
  trashFailure,
  onCloseTrashFailure,
  onDeletePermanently,
  onRetry,
  newItemOpen,
  newItemInitialDir,
  onCloseNewItem,
}: Props) {
  const { t } = useLingui();
  const primaryTarget = deleteRequest?.targets[0] ?? null;
  return (
    <>
      <Dialog
        open={deleteRequest !== null}
        onOpenChange={(open) => !open && !busy && onCloseDelete()}
      >
        {deleteRequest && primaryTarget && (
          <DeleteConfirmationDialog
            {...(() => {
              const variant: 'electron' | 'web' =
                typeof window !== 'undefined' && window.okDesktop != null ? 'electron' : 'web';
              const copy = selectTrashConfirmCopy(variant, deleteRequest.targets);
              if (copy) {
                return {
                  customTitle: copy.title,
                  customDescription: '',
                  customDetail: copy.detail,
                  customConfirmLabel: copy.confirmLabel,
                  customConfirmLabelBusy: copy.confirmLabelBusy,
                  children: copy.listedTargets ? (
                    <ul className="flex flex-col gap-1 font-mono text-foreground text-xs">
                      {copy.listedTargets.map((target) => (
                        <li key={`${target.kind}:${target.path}`} data-testid="delete-target-row">
                          {trashTargetDisplayName(target)}
                        </li>
                      ))}
                    </ul>
                  ) : null,
                };
              }
              const count = deleteRequest.targets.length;
              const folderName = primaryTarget.name;
              return {
                itemName:
                  count === 1
                    ? primaryTarget.kind === 'folder'
                      ? `${primaryTarget.name}/`
                      : primaryTarget.kind === 'file'
                        ? `${primaryTarget.name}${primaryTarget.docExt ?? '.md'}`
                        : primaryTarget.name
                    : undefined,
                customTitle: count > 1 ? t`Delete selected items` : undefined,
                customDescription:
                  count > 1
                    ? t`Are you sure you want to delete ${count} selected items? Folders and all files inside them will be deleted. This action cannot be undone.`
                    : primaryTarget.kind === 'folder'
                      ? t`Are you sure you want to delete ${folderName}/ and all files inside? This action cannot be undone.`
                      : undefined,
              };
            })()}
            isSubmitting={busy}
            onDelete={() => onDelete(deleteRequest.targets)}
          />
        )}
      </Dialog>
      <Dialog
        open={trashFailure !== null}
        onOpenChange={(open) => !open && !busy && onCloseTrashFailure()}
      >
        {trashFailure && (
          <TrashFailureModal
            failedTargets={trashFailure.failed}
            isSubmitting={busy}
            onDeletePermanently={onDeletePermanently}
            onRetry={onRetry}
            onCancel={onCloseTrashFailure}
          />
        )}
      </Dialog>
      <NewItemDialog
        open={newItemOpen}
        onOpenChange={(open) => !open && onCloseNewItem()}
        kind="file"
        initialDir={newItemInitialDir}
        defaultToTemplate
      />
    </>
  );
}
