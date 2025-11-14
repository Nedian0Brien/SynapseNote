import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ReactComponent as ErrorLogo } from '@/assets/icons/warning_logo.svg';
import { Progress } from '@/components/ui/progress';
import LandingPage from '@/components/_shared/landing-page/LandingPage';

export function ErrorPage({ onRetry }: { onRetry?: () => Promise<void> }) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);

  return (
    <LandingPage
      Logo={ErrorLogo}
      title={t('landingPage.error.title')}
      description={
        <Trans
          i18nKey={'landingPage.error.description'}
          components={{
            support: (
              <span
                onClick={() => window.open('mailto:support@appflowy.io', '_blank')}
                className='cursor-pointer text-text-action'
              >
                support@appflowy.io
              </span>
            ),
          }}
        />
      }
      primaryAction={
        onRetry
          ? {
              onClick: async () => {
                try {
                  setLoading(true);
                  await onRetry();
                  setLoading(false);
                } catch (e) {
                  setLoading(false);
                }
              },
              label: loading ? (
                <span className='flex items-center gap-2'>
                  <Progress />
                  {t('landingPage.error.retry')}
                </span>
              ) : (
                t('landingPage.error.retry')
              ),
            }
          : undefined
      }
      secondaryAction={{
        onClick: () => window.open('/app', '_self'),
        label: t('landingPage.backToHome'),
      }}
    />
  );
}
