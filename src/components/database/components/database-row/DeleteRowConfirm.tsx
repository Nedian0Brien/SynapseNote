import { useTranslation } from 'react-i18next';

import { useBulkDeleteRowDispatch } from '@/application/database-yjs/dispatch';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createHotkey, HOT_KEY_NAME } from '@/utils/hotkeys';

export function DeleteRowConfirm({
  open,
  onClose,
  rowIds,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  rowIds: string[];
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const deleteRowsDispatch = useBulkDeleteRowDispatch();

  const handleDelete = () => {
    deleteRowsDispatch(rowIds);
    onDeleted?.();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(status) => {
        if (!status) {
          onClose();
        }
      }}
    >
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          console.debug(e.key);
          if (createHotkey(HOT_KEY_NAME.ENTER)(e.nativeEvent)) {
            handleDelete();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('grid.row.delete')}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{t('grid.row.deleteRowPrompt', { count: rowIds?.length || 0 })}</DialogDescription>
        <DialogFooter>
          <Button variant={'outline'} onClick={onClose}>
            {t('button.cancel')}
          </Button>
          <Button variant={'destructive'} onClick={handleDelete}>
            {t('button.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteRowConfirm;
