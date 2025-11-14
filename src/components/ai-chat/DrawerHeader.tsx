import { ReactComponent as DoubleArrowRight } from '@/assets/icons/double_arrow_right.svg';
import { ReactComponent as ExpandIcon } from '@/assets/icons/full_screen.svg';
import { useAIChatContext } from '@/components/ai-chat/AIChatProvider';
import { useAppHandlers } from '@/components/app/app.hooks';
import MoreActions from '@/components/app/header/MoreActions';
import { IconButton, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import ShareButton from 'src/components/app/share/ShareButton';

function DrawerHeader() {
  const { t } = useTranslation();
  const { setDrawerOpen, onCloseView, openViewId } = useAIChatContext();

  const { toView } = useAppHandlers();

  if (!openViewId) {
    return null;
  }

  return (
    <div
      className={
        'sticky top-0 z-[100] flex min-h-[48px] w-full items-center justify-between border-b border-border-primary bg-background-primary px-4'
      }
    >
      <div className={'flex items-center gap-4'}>
        <Tooltip title={t('sideBar.closeSidebar')}>
          <IconButton
            size={'small'}
            onClick={async () => {
              setDrawerOpen(false);
            }}
          >
            <DoubleArrowRight className={'text-text-primary opacity-80'} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('tooltip.openAsPage')}>
          <IconButton
            size={'small'}
            onClick={async () => {
              if (!openViewId) return;
              await toView(openViewId);
              onCloseView();
            }}
          >
            <ExpandIcon className={'text-text-primary opacity-80'} />
          </IconButton>
        </Tooltip>
      </div>
      <div className={'flex items-center gap-4'}>
        <ShareButton viewId={openViewId} />
        <MoreActions onDeleted={onCloseView} viewId={openViewId} />
      </div>
    </div>
  );
}

export default DrawerHeader;
