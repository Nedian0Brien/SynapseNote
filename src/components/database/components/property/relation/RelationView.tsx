import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDatabaseContext } from '@/application/database-yjs';
import { View } from '@/application/types';
import { ReactComponent as RightIcon } from '@/assets/icons/alt_arrow_right.svg';
import { ReactComponent as PrivateIcon } from '@/assets/icons/lock.svg';
import { ReactComponent as MoreIcon } from '@/assets/icons/more.svg';
import { findAncestors } from '@/components/_shared/outline/utils';
import PageIcon from '@/components/_shared/view-icon/PageIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function RelationView({ view }: { view: View }) {
  const { t } = useTranslation();
  const { loadViews } = useDatabaseContext();
  const [outline, setOutline] = useState<View[]>([]);

  useEffect(() => {
    void (async () => {
      const views = await loadViews?.();

      setOutline(views || []);
    })();
  }, [loadViews]);

  const ancestors = useMemo(() => {
    if (!outline) return [];
    return findAncestors(outline, view.view_id)?.slice(0, -1) || [];
  }, [outline, view.view_id]);

  const renderBreadcrumb = useCallback(
    (view: View) => {
      const isPrivate = view.is_private && view.extra?.is_space;

      return (
        <Tooltip disableHoverableContent>
          <TooltipTrigger asChild>
            <div className={`flex max-w-full items-center gap-1 overflow-hidden text-text-secondary`}>
              <span className={'truncate'}>{view.name || t('menuAppHeader.defaultNewPageName')}</span>
              {isPrivate && (
                <div className={'min-h-5 min-w-5 text-base text-text-primary opacity-80'}>
                  <PrivateIcon className='h-5 w-5' />
                </div>
              )}
            </div>
          </TooltipTrigger>
          {view.name && <TooltipContent side={'left'}>{view.name || ''}</TooltipContent>}
        </Tooltip>
      );
    },
    [t]
  );

  const breadcrumbs = useMemo(() => {
    if (!ancestors) return null;
    if (ancestors.length <= 3) {
      return ancestors.map((ancestor, index) => {
        return (
          <div key={ancestor.view_id} className={'flex min-w-[40px] max-w-[120px] items-center overflow-hidden'}>
            {renderBreadcrumb(ancestor)}
            {index !== ancestors.length - 1 && <RightIcon className='h-4 w-4 text-icon-secondary' />}
          </div>
        );
      });
    }

    const first = renderBreadcrumb(ancestors[0]);
    const last = renderBreadcrumb(ancestors[ancestors.length - 1]);

    return (
      <>
        {first}
        <div className={'flex flex-1 items-center overflow-hidden'}>
          <RightIcon className='h-4 w-4 text-icon-secondary' />
          <MoreIcon className='h-5 w-5' />
          <RightIcon className='h-4 w-4 text-icon-secondary' />
          {last}
        </div>
      </>
    );
  }, [ancestors, renderBreadcrumb]);

  return (
    <div className='w-full overflow-hidden'>
      <div className='flex items-center gap-2'>
        <PageIcon className={'flex !h-5 !w-5 items-center justify-center text-xl'} iconSize={20} view={view} />

        <Tooltip disableHoverableContent delayDuration={1000}>
          <TooltipTrigger asChild>
            <div className={'flex-1 truncate'}>{view.name || t('menuAppHeader.defaultNewPageName')}</div>
          </TooltipTrigger>
          <TooltipContent side={'left'}>{view.name}</TooltipContent>
        </Tooltip>
      </div>
      <div className={'mt-1 flex w-full items-center overflow-hidden text-sm'}>{breadcrumbs}</div>
    </div>
  );
}
