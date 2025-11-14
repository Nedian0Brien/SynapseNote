import { useTranslation } from 'react-i18next';

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

export function LogoutConfirm({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  const handleLogout = () => {
    onConfirm();
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
          if (createHotkey(HOT_KEY_NAME.ENTER)(e.nativeEvent)) {
            handleLogout();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('button.logout')}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          {t('settings.menu.logoutPrompt')}
        </DialogDescription>
        <DialogFooter>
          <Button variant={'outline'} onClick={onClose}>
            {t('button.cancel')}
          </Button>
          <Button variant={'destructive'} onClick={handleLogout} data-testid="logout-confirm-button">
            {t('button.logout')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LogoutConfirm;
