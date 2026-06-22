import { useCallback, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ReactComponent as SuccessLogo } from '@/assets/icons/success_logo.svg';
import LandingPage from '@/components/_shared/landing-page/LandingPage';

function AfterPaymentPage() {
  const openSynapseNote = useCallback(() => {
    window.open(`/app${window.location.search || ''}`, '_self');
  }, []);
  const { t } = useTranslation();

  useLayoutEffect(() => {
    openSynapseNote();
  }, [openSynapseNote]);

  return (
    <LandingPage
      Logo={SuccessLogo}
      title={t('landingPage.afterPayment.title')}
      description={t('landingPage.afterPayment.description')}
      secondaryAction={{
        onClick: () => window.open('/app', '_self'),
        label: t('landingPage.backToHome'),
      }}
    />
  );
}

export default AfterPaymentPage;
