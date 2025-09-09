import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CalendarEvent, usePrimaryFieldId } from '@/application/database-yjs';
import { ReactComponent as DropdownIcon } from '@/assets/icons/alt_arrow_down.svg';
import { Button } from '@/components/ui/button';
import { DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { NoDateRow } from './NoDateRow';

interface NoDateButtonProps {
  emptyEvents: CalendarEvent[];
  isWeekView: boolean;
}

export const NoDateButton = memo(({ emptyEvents, isWeekView }: NoDateButtonProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const primaryFieldId = usePrimaryFieldId();

  if (emptyEvents.length === 0 || !primaryFieldId) {
    return null;
  }

  return (
    <Popover open={open}>
      <PopoverTrigger asChild>
        <Button
          onClick={() => {
            setOpen((prev) => !prev);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          size='sm'
          variant='ghost'
          className='no-date-button gap-1 overflow-hidden whitespace-nowrap'
        >
          {`${t('calendar.settings.noDateTitle')} (${emptyEvents.length})`}
          <DropdownIcon className='h-5 w-5' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;

          if (target.closest('.MuiDialogContent-root')) return;
          setOpen(false);
        }}
        className='appflowy-scroller max-h-[360px] w-[260px] overflow-y-auto p-2'
      >
        <DropdownMenuLabel className='px-3'>{t('calendar.settings.noDatePopoverTitle')}</DropdownMenuLabel>
        <div className='flex flex-col'>
          {emptyEvents.map((event) => {
            const rowId = event.id;

            return <NoDateRow primaryFieldId={primaryFieldId} rowId={rowId} key={event.id} isWeekView={isWeekView} />;
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
});

NoDateButton.displayName = 'NoDateButton';

export default NoDateButton;