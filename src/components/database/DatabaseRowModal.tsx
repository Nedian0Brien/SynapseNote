import { Dialog, DialogContent, DialogTitle } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useDeleteRowDispatch, useDuplicateRowDispatch } from '@/application/database-yjs/dispatch';
import { ReactComponent as DeleteIcon } from '@/assets/icons/delete.svg';
import { ReactComponent as DuplicateIcon } from '@/assets/icons/duplicate.svg';
import { ReactComponent as ExpandIcon } from '@/assets/icons/expand.svg';
import { ReactComponent as MoreIcon } from '@/assets/icons/more.svg';
import { DatabaseRow } from '@/components/database/DatabaseRow';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AFScroller } from '@/components/_shared/scroller';

function DatabaseRowModal({
  open,
  onOpenChange,
  rowId,
  openPage,
}: {
  open: boolean;
  rowId: string;
  onOpenChange: (open: boolean) => void;
  openPage?: (rowId: string) => void;
}) {
  // const {} = useDatabaseContext();
  const { t } = useTranslation();
  const duplicateRow = useDuplicateRowDispatch();
  const deleteRow = useDeleteRowDispatch();
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={() => {
        onOpenChange(false);
      }}
      fullWidth={true}
      keepMounted={false}
      disableAutoFocus={false}
      disableEnforceFocus={false}
      disableRestoreFocus={true}
      PaperProps={{
        className: `max-w-[70vw] relative w-[1188px] h-[80vh] overflow-hidden flex flex-col`,
      }}
    >
      <DialogContent className={'flex h-full w-full flex-col px-0 py-0'}>
        <DialogTitle className={'flex max-h-[48px] flex-1 items-center justify-end gap-2 px-2'}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size={'icon'}
                variant='ghost'
                onClick={() => {
                  openPage?.(rowId);
                  onOpenChange(false);
                }}
              >
                <ExpandIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('grid.rowPage.openAsFullPage')}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={'h-7 w-7'}>
                  <DropdownMenuTrigger asChild>
                    <Button size={'icon'} variant='ghost' onClick={() => onOpenChange(false)}>
                      <MoreIcon />
                    </Button>
                  </DropdownMenuTrigger>
                </div>
              </TooltipTrigger>
              <TooltipContent>{t('grid.rowPage.moreRowActions')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent className={' w-fit min-w-fit'}>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={async () => {
                    if (duplicateLoading) return;
                    setDuplicateLoading(true);
                    try {
                      await duplicateRow?.(rowId);
                      onOpenChange(false);
                      // eslint-disable-next-line
                    } catch (e: any) {
                      toast.error(e.message);
                    } finally {
                      setDuplicateLoading(false);
                    }
                  }}
                >
                  {duplicateLoading ? <Progress variant={'primary'} /> : <DuplicateIcon className={'h-5 w-5'} />}

                  {t('grid.row.duplicate')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant={'destructive'}
                  onSelect={() => {
                    deleteRow?.(rowId);
                    onOpenChange(false);
                  }}
                >
                  <DeleteIcon className={'h-5 w-5'} />
                  {t('grid.row.delete')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogTitle>

        <AFScroller overflowXHidden className={'appflowy-scroll-container w-full flex-1'}>
          <DatabaseRow rowId={rowId} />
        </AFScroller>
      </DialogContent>
    </Dialog>
  );
}

export default DatabaseRowModal;
