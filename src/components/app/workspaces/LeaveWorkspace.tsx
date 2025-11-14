import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useCurrentWorkspaceId } from '@/components/app/app.hooks';
import { useService } from '@/components/main/app.hooks';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function LeaveWorkspace({
  workspaceId,
  open,
  openOnChange,
  workspaceName,
}: {
  workspaceId: string;
  open: boolean;
  openOnChange: (open: boolean) => void;
  workspaceName: string;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const service = useService();
  const currentWorkspaceId = useCurrentWorkspaceId();

  const handleOk = async () => {
    if (!service) return;

    try {
      setLoading(true);
      await service.leaveWorkspace(workspaceId);
      openOnChange(false);
      if (currentWorkspaceId === workspaceId) {
        window.location.href = `/app`;
      }
      // eslint-disable-next-line
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={openOnChange}>
        <DialogContent
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleOk();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('workspace.leaveWorkspace', { workspaceName })}</DialogTitle>
          </DialogHeader>
          <DialogDescription>{t('workspace.leaveWorkspacePrompt', { workspaceName })}</DialogDescription>
          <DialogFooter>
            <Button variant='outline' onClick={() => openOnChange(false)}>
              {t('button.cancel')}
            </Button>
            <Button variant='destructive' loading={loading} onClick={handleOk}>
              {t('button.yes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default LeaveWorkspace;
