import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useCurrentUser } from '@/components/main/app.hooks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

function EditWorkspace({
  open,
  openOnChange,
  defaultName,
  onOk,
  okText,
  title,
}: {
  defaultName?: string;
  open?: boolean;
  openOnChange?: (open: boolean) => void;
  onOk?: (name: string) => Promise<void>;
  okText?: string;
  title?: string;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const currentUser = useCurrentUser();

  const [name, setName] = useState(defaultName || `${currentUser?.name}'s Workspace`);

  const handleCreate = useCallback(async () => {
    setLoading(true);
    try {
      await onOk?.(name);
      openOnChange?.(false);
      // eslint-disable-next-line
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [name, openOnChange, onOk]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
    }
  }, [open, openOnChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={openOnChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title || t('workspace.createNewWorkspace')}</DialogTitle>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='grid gap-3'>
              <Label htmlFor='name'>{t('workspace.workspaceName')}</Label>
              <Input
                id='name'
                name='name'
                autoFocus
                value={name}
                autoComplete='off'
                ref={(input: HTMLInputElement) => {
                  if (!input) return;
                  if (!inputRef.current) {
                    setTimeout(() => {
                      input.focus();
                      input.setSelectionRange(0, input.value.length);
                    }, 100);
                    inputRef.current = input;
                  }
                }}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    void handleCreate();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant={'outline'} onClick={() => openOnChange?.(false)}>
              {t('button.cancel')}
            </Button>
            <Button
              disabled={!name.trim()}
              loading={loading}
              onClick={() => {
                void handleCreate();
                openOnChange?.(false);
              }}
            >
              {loading ? <Progress /> : null}
              {okText || t('workspace.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default EditWorkspace;
