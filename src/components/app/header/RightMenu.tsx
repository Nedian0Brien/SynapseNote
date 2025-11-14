import { Divider, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { ReactComponent as Logo } from '@/assets/icons/logo.svg';
import { useAppViewId } from '@/components/app/app.hooks';
import { openOrDownload } from '@/utils/open_schema';

import ShareButton from 'src/components/app/share/ShareButton';

import MoreActions from './MoreActions';
import { Users } from './Users';

function RightMenu() {
  const { t } = useTranslation();
  const viewId = useAppViewId();

  return (
    <div className={'flex items-center gap-2'}>
      <Users viewId={viewId} />
      {viewId && <ShareButton viewId={viewId} />}
      {viewId && <MoreActions viewId={viewId} />}

      <Divider orientation={'vertical'} className={'mx-2'} flexItem />
      <Tooltip title={t('publish.downloadApp')}>
        <button onClick={() => openOrDownload()}>
          <Logo className={'h-6 w-6'} />
        </button>
      </Tooltip>
    </div>
  );
}

export default RightMenu;
