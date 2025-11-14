import { useTranslation } from 'react-i18next';

import { ReactComponent as NoAccessLogo } from '@/assets/icons/no_access.svg';
import LandingPage from '@/components/_shared/landing-page/LandingPage';

const NotFound = () => {
  const { t } = useTranslation();

  return (
    <div data-testid={'public-not-found'}>
      <LandingPage
        Logo={NoAccessLogo}
        title={t('landingPage.noAccess.title')}
        description={
          <div className='w-full text-center'>
            {t('publish.createWithAppFlowy')}
            <div className={'flex w-full items-center justify-center gap-1'}>
              <div className={'font-semibold text-text-action'}>{t('publish.fastWithAI')}</div>
              <div>{t('publish.tryItNow')}</div>
            </div>
          </div>
        }
        primaryAction={{
          onClick: () => window.open('https://appflowy.com/download', '_self'),
          label: t('publish.downloadApp'),
        }}
        secondaryAction={{
          onClick: () => window.open('/app', '_self'),
          label: t('landingPage.backToHome'),
        }}
      />
    </div>
  );
};

export default NotFound;
