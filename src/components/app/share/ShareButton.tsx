import React from 'react';
import { useTranslation } from 'react-i18next';

import { ViewLayout } from '@/application/types';
import { useAppView } from '@/components/app/app.hooks';
import ShareTabs from '@/components/app/share/ShareTabs';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function ShareButton({ viewId }: { viewId: string }) {
  const { t } = useTranslation();

  const view = useAppView(viewId);
  const layout = view?.layout;
  const [opened, setOpened] = React.useState(false);

  if (layout === ViewLayout.AIChat) return null;

  return (
    <Popover open={opened} onOpenChange={setOpened}>
      <PopoverTrigger asChild>
        <Button className={'mx-2'} data-testid={'share-button'} size={'sm'} variant={'default'}>
          {t('shareAction.buttonText')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side='bottom'
        align='end'
        alignOffset={-20}
        className={'h-fit min-w-[480px] max-w-[480px]'}
        data-testid={'share-popover'}
      >
        <ShareTabs opened={opened} viewId={viewId} onClose={() => setOpened(false)} />
      </PopoverContent>
    </Popover>
  );
}

export default ShareButton;
