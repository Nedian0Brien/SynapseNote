import { CalendarEvent } from '@/application/database-yjs';
import NoDateRow from '@/components/database/components/calendar/toolbar/NoDateRow';
import { RichTooltip } from '@/components/_shared/popover';
import { Button } from '@mui/material';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

function NoDate({ emptyEvents }: { emptyEvents: CalendarEvent[] }) {
  const [open, setOpen] = React.useState(false);
  const { t } = useTranslation();
  const content = useMemo(() => {
    return (
      <div className={'flex w-[260px] flex-col gap-3 p-2 text-xs font-medium max-sm:gap-1'}>
        {/*<div className={'text-text-secondary'}>{t('calendar.settings.clickToOpen')}</div>*/}
        {emptyEvents.map((event) => {
          const rowId = event.id.split(':')[0];

          return <NoDateRow rowId={rowId} key={event.id} />;
        })}
      </div>
    );
  }, [emptyEvents]);

  return (
    <RichTooltip
      content={content}
      open={open}
      placement={'bottom'}
      onClose={() => {
        setOpen(false);
      }}
    >
      <Button
        size={'small'}
        variant={'outlined'}
        disabled
        className={'overflow-hidden whitespace-nowrap rounded-md border-border-primary'}
        color={'inherit'}
        // onClick={() => setOpen(true)}
      >
        {`${t('calendar.settings.noDateTitle')} (${emptyEvents.length})`}
      </Button>
    </RichTooltip>
  );
}

export default NoDate;
