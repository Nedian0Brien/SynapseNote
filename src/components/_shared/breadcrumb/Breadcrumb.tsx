import { IconButton } from '@mui/material';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { UIVariant, View } from '@/application/types';
import { ReactComponent as RightIcon } from '@/assets/icons/alt_arrow_right.svg';
import { ReactComponent as MoreIcon } from '@/assets/icons/more.svg';
import { ReactComponent as PrivateSpaceIcon } from '@/assets/icons/private-space.svg';
import { ReactComponent as ShareIcon } from '@/assets/icons/share-to.svg';
import { ReactComponent as TeamIcon } from '@/assets/icons/team.svg';
import BreadcrumbItem from '@/components/_shared/breadcrumb/BreadcrumbItem';
import BreadcrumbMoreModal from '@/components/_shared/breadcrumb/BreadcrumbMoreModal';
import { useCurrentWorkspaceId } from '@/components/app/app.hooks';
import { useCurrentUser, useService } from '@/components/main/app.hooks';
import { Progress } from '@/components/ui/progress';
import { getPlatform } from '@/utils/platform';

export interface BreadcrumbProps {
  crumbs: View[];
  toView?: (viewId: string) => Promise<void>;
  variant?: UIVariant;
}

export function Breadcrumb({ crumbs, toView, variant }: BreadcrumbProps) {
  const [openMore, setOpenMore] = useState(false);
  const renderCrumb = useMemo(() => {
    const tailCount = getPlatform().isMobile ? 1 : 2;

    if (crumbs.length > tailCount + 1) {
      const firstCrumb = crumbs[0];
      const lastCrumbs = crumbs.slice(-tailCount);

      return (
        <>
          {firstCrumb.extra?.is_hidden_space ? null : (
            <div className={'flex min-w-0 max-w-[160px] items-center gap-2 truncate text-text-primary'}>
              <BreadcrumbItem variant={variant} toView={toView} crumb={firstCrumb} disableClick={true} />
              <RightIcon className={'h-5 w-5 shrink-0'} />
            </div>
          )}
          <div className={'flex min-w-0 max-w-[160px] shrink-0 items-center gap-2 truncate text-text-primary'}>
            <IconButton
              onClick={() => {
                setOpenMore(true);
              }}
            >
              <MoreIcon className={'h-5 w-5 shrink-0'} />
            </IconButton>

            <RightIcon className={'h-5 w-5 shrink-0'} />
          </div>
          {lastCrumbs.map((crumb, index) => {
            const key = `${crumb.view_id}-${index}`;

            return (
              <div className={'flex min-w-0 max-w-[160px] items-center gap-2 truncate text-text-primary'} key={key}>
                <BreadcrumbItem
                  variant={variant}
                  toView={toView}
                  crumb={crumb}
                  disableClick={index === lastCrumbs.length - 1}
                />
                {index === lastCrumbs.length - 1 ? null : <RightIcon className={'h-5 w-5 shrink-0'} />}
              </div>
            );
          })}
        </>
      );
    }

    return crumbs?.map((crumb, index) => {
      const isLast = index === crumbs.length - 1;
      const key = `${crumb.view_id}-${index}`;

      if (crumb.extra?.is_hidden_space) {
        return null;
      }

      return (
        <div
          className={`${
            isLast ? 'text-text-primary' : 'text-text-secondary'
          } flex min-w-0 max-w-[160px] items-center gap-2 truncate`}
          key={key}
        >
          <BreadcrumbItem variant={variant} toView={toView} crumb={crumb} disableClick={isLast} />
          {!isLast && <RightIcon className={'h-5 w-5 shrink-0'} />}
        </div>
      );
    });
  }, [crumbs, toView, variant]);

  const service = useService();
  const currentWorkspaceId = useCurrentWorkspaceId();
  const currentUser = useCurrentUser();
  const { t } = useTranslation();
  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);

  const isPrivate = crumbs.some((crumb) => crumb.is_private);

  useEffect(() => {
    if (!service || !currentWorkspaceId || !currentUser) return;
    const loadShareDetail = async () => {
      const viewId = crumbs[crumbs.length - 1].view_id;
      const ancestorViewIds = crumbs.map((crumb) => crumb.view_id);

      try {
        setLoading(true);
        const res = await service.getShareDetail(currentWorkspaceId, viewId, ancestorViewIds);
        const shared = res.shared_with.some((item) => item.email !== currentUser.email);

        setIsShared(shared);
      } catch (error) {
        setIsShared(false);
      } finally {
        setLoading(false);
      }
    };

    void loadShareDetail();
  }, [service, currentWorkspaceId, currentUser, crumbs]);

  return (
    <div
      data-testid='breadcrumb-navigation'
      className={'relative flex h-full w-full flex-1 items-center gap-2 overflow-hidden'}
    >
      {renderCrumb}
      <BreadcrumbMoreModal open={openMore} onClose={() => setOpenMore(false)} crumbs={crumbs} toView={toView} />
      {variant === UIVariant.App && !isPrivate && (
        <div className='ml-2 flex items-center gap-1 text-xs font-medium text-text-tertiary'>
          <TeamIcon className='h-5 w-5 shrink-0 text-icon-tertiary' />
          {t('teamSpace')}
        </div>
      )}
      {variant === UIVariant.App && isPrivate && (
        <div className='ml-2 flex items-center  gap-1 text-xs font-medium text-text-tertiary'>
          {loading && <Progress variant={'primary'} />}
          {isShared ? (
            <>
              <ShareIcon className='h-5 w-5 shrink-0 text-icon-tertiary' />
              {t('share')}
            </>
          ) : (
            <>
              <PrivateSpaceIcon className='h-5 w-5 shrink-0 text-icon-tertiary' />
              {t('private')}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(Breadcrumb);
