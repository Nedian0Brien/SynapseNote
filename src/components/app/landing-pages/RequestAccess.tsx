import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ReactComponent as NoAccessLogo } from '@/assets/icons/no_access.svg';
import { ReactComponent as SuccessLogo } from '@/assets/icons/success_logo.svg';
import { useAppViewId, useCurrentWorkspaceId } from '@/components/app/app.hooks';
import { useCurrentUser, useService } from '@/components/main/app.hooks';
import { Progress } from '@/components/ui/progress';
import { ErrorPage } from '@/components/_shared/landing-page/ErrorPage';
import LandingPage from '@/components/_shared/landing-page/LandingPage';

const REPEAT_REQUEST_CODE = 1043;

function RequestAccess() {
  const { t } = useTranslation();
  const service = useService();
  const currentWorkspaceId = useCurrentWorkspaceId();
  const viewId = useAppViewId();
  const [searchParams] = useSearchParams();
  const isGuest = searchParams.get('is_guest') === 'true';
  const [hasSend, setHasSend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const currentUser = useCurrentUser();
  const handleSendRequest = async () => {
    try {
      if (!service) return;
      if (!currentWorkspaceId || !viewId) {
        setIsError(true);
        return;
      }

      setLoading(true);
      await service.sendRequestAccess(currentWorkspaceId, viewId);

      toast.success(t('landingPage.noAccess.requestAccessSuccess'));
      setHasSend(true);
      // eslint-disable-next-line
    } catch (e: any) {
      if (e.code === REPEAT_REQUEST_CODE) {
        toast.error(t('requestAccess.repeatRequestError'));
      } else {
        toast.error(e.message);
        setIsError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isGuest && currentUser) {
      window.open(
        `appflowy-flutter://open-page?workspace_id=${currentWorkspaceId}&view_id=${viewId}&email=${currentUser.email}`,
        '_self'
      );
    }
  }, [isGuest, currentWorkspaceId, viewId, currentUser]);

  const description = isGuest
    ? `${t(
        'landingPage.noAccess.description'
      )}\n\n Guests invited to this page can access it via the desktop or mobile app.`
    : t('landingPage.noAccess.description');

  if (hasSend) {
    return (
      <LandingPage
        Logo={SuccessLogo}
        title={t('landingPage.noAccess.requestAccessSuccess')}
        description={t('landingPage.noAccess.requestAccessSuccessMessage')}
        secondaryAction={{
          onClick: () => window.open('/app', '_self'),
          label: t('landingPage.backToHome'),
        }}
      />
    );
  }

  if (isError) {
    return <ErrorPage onRetry={handleSendRequest} />;
  }

  return (
    <LandingPage
      Logo={NoAccessLogo}
      title={t('landingPage.noAccess.title')}
      description={description}
      primaryAction={{
        onClick: handleSendRequest,
        loading,
        label: loading ? (
          <span className='flex items-center gap-2'>
            <Progress />
            {t('landingPage.noAccess.requestAccess')}
          </span>
        ) : (
          t('landingPage.noAccess.requestAccess')
        ),
      }}
      secondaryAction={{
        onClick: () => window.open('/app', '_self'),
        label: t('landingPage.backToHome'),
      }}
    />
  );
}

export default RequestAccess;
