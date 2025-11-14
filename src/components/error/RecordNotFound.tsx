import { useTranslation } from 'react-i18next';

import { ReactComponent as ErrorIcon } from '@/assets/icons/error.svg';
import { ReactComponent as NoAccessIcon } from '@/assets/icons/no_access.svg';
import { ReactComponent as WarningIcon } from '@/assets/icons/warning.svg';
import emptyImageSrc from '@/assets/images/empty.png';
import { AppError, ErrorType } from '@/application/utils/error-utils';
import LandingPage from '@/components/_shared/landing-page/LandingPage';
import { useCurrentWorkspaceId } from '@/components/app/app.hooks';
import { RequestAccessContent } from '@/components/app/share/RequestAccessContent';

function RecordNotFound({
  viewId,
  noContent,
  isViewNotFound,
  error,
}: {
  viewId?: string;
  noContent?: boolean;
  isViewNotFound?: boolean;
  error?: AppError;
}) {
  const { t } = useTranslation();
  const currentWorkspaceId = useCurrentWorkspaceId();

  // NEW: If error is provided, render specific error page based on error type
  if (error) {
    switch (error.type) {
      case ErrorType.PageNotFound:
        return (
          <LandingPage
            Logo={WarningIcon}
            title={t('landingPage.pageNotFound.title')}
            description={t('landingPage.pageNotFound.description')}
            primaryAction={{
              onClick: () => window.open('/app', '_self'),
              label: t('landingPage.pageNotFound.goToHomepage'),
            }}
          />
        );

      case ErrorType.Unauthorized:
        return (
          <LandingPage
            Logo={NoAccessIcon}
            title={t('landingPage.unauthorized.title')}
            description={t('landingPage.unauthorized.description')}
            primaryAction={{
              onClick: () => window.open('/', '_self'),
              label: t('landingPage.unauthorized.signIn'),
            }}
          />
        );

      case ErrorType.Forbidden:
        // If viewId and workspaceId available, show request access
        if (viewId && currentWorkspaceId) {
          return <RequestAccessContent viewId={viewId} workspaceId={currentWorkspaceId} />;
        }

        return (
          <LandingPage
            Logo={NoAccessIcon}
            title={t('landingPage.forbidden.title')}
            description={t('landingPage.forbidden.description')}
          />
        );

      case ErrorType.ServerError:
        return (
          <LandingPage
            Logo={ErrorIcon}
            title={t('landingPage.serverError.title')}
            description={t('landingPage.serverError.description')}
            primaryAction={{
              onClick: () => window.location.reload(),
              label: t('landingPage.serverError.retry'),
            }}
          />
        );

      case ErrorType.NetworkError:
        return (
          <LandingPage
            Logo={ErrorIcon}
            title={t('landingPage.networkError.title')}
            description={t('landingPage.networkError.description')}
            primaryAction={{
              onClick: () => window.location.reload(),
              label: t('landingPage.networkError.retry'),
            }}
          />
        );

      case ErrorType.InvalidLink:
        return (
          <LandingPage
            Logo={WarningIcon}
            title={t('landingPage.invalidLink.title')}
            description={t('landingPage.invalidLink.description')}
            primaryAction={{
              onClick: () => window.open('/app', '_self'),
              label: t('landingPage.invalidLink.goToHomepage'),
            }}
          />
        );

      case ErrorType.AlreadyJoined:
        return (
          <LandingPage
            Logo={NoAccessIcon}
            title={t('landingPage.alreadyJoined.title')}
            description={t('landingPage.alreadyJoined.description')}
            primaryAction={{
              onClick: () => window.open('/app', '_self'),
              label: t('landingPage.alreadyJoined.goToWorkspace'),
            }}
          />
        );

      case ErrorType.RateLimited:
        return (
          <LandingPage
            Logo={WarningIcon}
            title={t('landingPage.rateLimited.title')}
            description={t('landingPage.rateLimited.description')}
            primaryAction={{
              onClick: () => window.location.reload(),
              label: t('landingPage.rateLimited.retry'),
            }}
          />
        );

      default:
        // Unknown error - fall through to legacy handling
        break;
    }
  }

  // LEGACY: If viewId is provided without error object, render the request access component
  if (viewId && currentWorkspaceId && !error) {
    return <RequestAccessContent viewId={viewId} workspaceId={currentWorkspaceId} />;
  }

  // LEGACY: Original fallback rendering
  return (
    <div className={'flex h-full w-full flex-col items-center justify-center px-4'}>
      {!noContent && (
        <>
          <div className={'flex items-center gap-4 text-2xl font-bold text-text-primary opacity-70'}>
            <WarningIcon className={'h-12 w-12'} />
            {isViewNotFound ? 'Page Not Found' : 'Record Not Found'}
          </div>
          <div className={'mt-4 whitespace-pre-wrap break-words text-center text-lg text-text-primary opacity-50'}>
            {`We're sorry for inconvenience\n`}
            Submit an issue on our{' '}
            <a
              className={'text-text-action  underline'}
              href={'https://github.com/AppFlowy-IO/AppFlowy/issues/new?template=bug_report.yaml'}
            >
              Github
            </a>{' '}
            page that describes your error
          </div>
        </>
      )}

      <img src={emptyImageSrc} alt={'AppFlowy'} />
    </div>
  );
}

export default RecordNotFound;
