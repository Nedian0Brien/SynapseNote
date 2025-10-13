import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ReactComponent as LockIcon } from '@/assets/icons/lock.svg';
import { findView } from '@/components/_shared/outline/utils';
import { useAppOutline, useUserWorkspaceInfo } from '@/components/app/app.hooks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function GeneralAccess({ viewId }: { viewId: string }) {
  const { t } = useTranslation();
  const userWorkspaceInfo = useUserWorkspaceInfo();

  const selectedWorkspace = userWorkspaceInfo?.selectedWorkspace;
  const outline = useAppOutline();

  const isPrivateView = useMemo(() => {
    return findView(outline || [], viewId)?.is_private;
  }, [outline, viewId]);

  if (!selectedWorkspace) {
    return null;
  }

  return (
    <div className='flex w-full flex-col px-2 pt-2'>
      <div className='px-2 py-1.5'>
        <Label>{t('shareAction.generalAccess')}</Label>
      </div>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <div className='flex w-full items-center rounded-300 px-2 py-1.5 hover:bg-fill-content-hover'>
            <div className='flex w-full flex-row items-center justify-between gap-2'>
              {isPrivateView ? (
                <Avatar shape={'square'}>
                  <AvatarFallback
                    style={{
                      backgroundColor: 'var(--surface-container-layer-01)',
                      color: 'var(--icon-secondary)',
                    }}
                    className='rounded-300 border border-border-primary'
                  >
                    <LockIcon className='h-6 w-6' />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Avatar shape={'square'}>
                  <AvatarImage src={selectedWorkspace.icon} alt={''} />
                  <AvatarFallback className='rounded-300 border border-border-primary' name={selectedWorkspace.name}>
                    {selectedWorkspace.icon ? (
                      <span className='text-lg'>{selectedWorkspace.icon}</span>
                    ) : (
                      selectedWorkspace.name
                    )}
                  </AvatarFallback>
                </Avatar>
              )}

              <div className='flex w-full flex-1 flex-col gap-0.5 overflow-hidden'>
                {isPrivateView ? (
                  <>
                    <div className='truncate text-sm text-text-primary'>{t('shareAction.restricted')}</div>
                    <div className='text-xs text-text-secondary'>{t('shareAction.restrictedDescription')}</div>
                  </>
                ) : (
                  <>
                    <div className='truncate text-sm text-text-primary'>
                      {t('shareAction.anyoneAt')}
                      {selectedWorkspace.name}
                    </div>
                    <div className='text-xs text-text-secondary'>
                      {t('shareAction.anyoneInThisGroupWithTheLinkHasFullAccess')}
                    </div>
                  </>
                )}
              </div>

              {!isPrivateView && (
                <div className='mr-2 px-3 py-1.5 text-sm text-text-secondary'>{t('shareAction.fullAccess')}</div>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side={'bottom'} align='center'>
          {selectedWorkspace.name}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
