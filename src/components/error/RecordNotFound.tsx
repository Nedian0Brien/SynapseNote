import { ReactComponent as WarningIcon } from '@/assets/icons/warning.svg';
import emptyImageSrc from '@/assets/images/empty.png';
import { useCurrentWorkspaceId } from '@/components/app/app.hooks';
import { RequestAccessContent } from '@/components/app/share/RequestAccessContent';

function RecordNotFound({
  viewId,
  noContent,
  isViewNotFound,
}: {
  viewId?: string;
  noContent?: boolean;
  isViewNotFound?: boolean;
}) {
  const currentWorkspaceId = useCurrentWorkspaceId();

  // If viewId is provided, render the request access component instead
  if (viewId && currentWorkspaceId) {
    return <RequestAccessContent viewId={viewId} workspaceId={currentWorkspaceId} />;
  }

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
