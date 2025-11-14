import { useTranslation } from 'react-i18next';

import { ReactComponent as InvalidLinkLogo } from '@/assets/icons/invalid_link.svg';
import LandingPage from '@/components/_shared/landing-page/LandingPage';

export function InvalidLink() {
  const { t } = useTranslation();

  return (
    <LandingPage
      Logo={InvalidLinkLogo}
      title={t('landingPage.inviteMember.invalid')}
      description={t('landingPage.inviteMember.invalidMessage')}
      secondaryAction={{
        onClick: () => window.open('/app', '_self'),
        label: t('landingPage.backToHome'),
      }}
    />
  );
}
