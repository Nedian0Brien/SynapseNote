import { EventApi, EventContentArg } from '@fullcalendar/core';
import { memo, useCallback, useEffect, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useEventContext } from '../CalendarContent';

import { EventDisplay } from './EventDisplay';
import EventPopoverContent from './EventPopoverContent';

interface EventWithPopoverProps {
  event: EventApi;
  eventInfo: EventContentArg;
  isWeekView?: boolean;
  isHiddenFirst?: boolean;
}

export const EventWithPopover = memo(({ event, eventInfo, isWeekView = false, isHiddenFirst = false }: EventWithPopoverProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { clearNewEvent, setOpenEventRowId, clearUpdateEvent } = useEventContext();
  const rowId =  event.id;

  // Check if this is a newly created event and should auto-open
  // For newly created events, only open the start segment (isStart=true)
  const isNewEvent = event.extendedProps?.isNew;
  const isUpdateEvent = event.extendedProps?.isUpdate;
  const isStart = eventInfo.isStart;

  useEffect(() => {
    // Auto-open newly created events at their start segment
    if ((isNewEvent || isUpdateEvent) && isStart) {
      setIsOpen(true);
    }
  }, [isNewEvent, isUpdateEvent, isStart, eventInfo]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);

      // When closing the popover for a new event, clear its new status
      if (!open && isNewEvent) {
        clearNewEvent(rowId);
      }

      if (!open && isUpdateEvent) {
        clearUpdateEvent(rowId);
      }

      if (open) {
        setOpenEventRowId(rowId);
      } else {
        setOpenEventRowId(null);
      }
    },
    [isNewEvent, isUpdateEvent, rowId, clearNewEvent, clearUpdateEvent, setOpenEventRowId]
  );

  const handleCloseEvent = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleGotoDate = useCallback(
    (date: Date) => {
      const calendar = eventInfo.view.calendar;

      return calendar.gotoDate(date);
    },
    [eventInfo]
  );

  return (
    <Popover open={isOpen} modal onOpenChange={handleOpenChange}>
      <PopoverTrigger className='h-full w-full' asChild>
        <div className='h-full w-full'>
          <EventDisplay event={event} eventInfo={eventInfo} isWeekView={isWeekView} isHiddenFirst={isHiddenFirst} />
        </div>
      </PopoverTrigger>
      <PopoverContent collisionPadding={20} side='left' align='center' sideOffset={8}>
        <EventPopoverContent onGotoDate={handleGotoDate} rowId={rowId} onCloseEvent={handleCloseEvent} />
      </PopoverContent>
    </Popover>
  );
});

export default EventWithPopover;
