import { ReactComponent as LinkIcon } from '@/assets/icons/link.svg';
import { ReactComponent as ShareIcon } from '@/assets/icons/users.svg';

import { notify } from '@/components/_shared/notify';
import { copyTextToClipboard } from '@/utils/copy';
import { Button, OutlinedInput } from '@mui/material';
import { useTranslation } from 'react-i18next';

function SharePanel() {
  const { t } = useTranslation();

  const handleCopy = () => {
    void copyTextToClipboard(window.location.href);
    notify.success(t('shareAction.copyLinkSuccess'));
  };

  return (
    <div className={'flex w-full flex-col px-1 pb-2'}>
      <div className={'flex w-full items-center gap-2 text-sm'}>
        <ShareIcon className={'h-5 w-5'} />
        <span>{t('shareAction.shareTabTitle')}</span>
      </div>
      <div className={'flex w-full items-center gap-2 text-sm text-text-secondary'}>
        {t('shareAction.shareTabDescription')}
      </div>
      <div className={'mt-4 flex w-full items-center gap-2 text-sm'}>
        <OutlinedInput
          onClick={(e) => {
            if (e.detail > 2) {
              e.preventDefault();
              e.stopPropagation();
              handleCopy();
            }
          }}
          size={'small'}
          className={'flex-1'}
          readOnly={true}
          value={window.location.href}
        />
        <Button
          variant={'contained'}
          color={'primary'}
          className={'h-[40px] flex-nowrap rounded-[12px]'}
          onClick={handleCopy}
          startIcon={<LinkIcon />}
        >
          <span className={'whitespace-nowrap'}> {t('shareAction.copyLink')}</span>
        </Button>
      </div>
    </div>
  );
}

export default SharePanel;
