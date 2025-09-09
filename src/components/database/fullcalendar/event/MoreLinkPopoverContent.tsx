import { CalendarApi, EventContentArg, MoreLinkArg } from "@fullcalendar/core";
import { Draggable } from "@fullcalendar/interaction";
import { useEffect, useRef } from "react";

import { ReactComponent as CloseIcon } from "@/assets/icons/close.svg";
import { dayCellContent } from "@/components/database/fullcalendar/utils/dayCellContent";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import EventWithPopover from "./EventWithPopover";


export function MoreLinkPopoverContent({moreLinkInfo, calendar, onClose}: {
  moreLinkInfo: MoreLinkArg;
  calendar: CalendarApi;
  onClose: () => void;
}) {
  const { allSegs, date, view, hiddenSegs } = moreLinkInfo;

  const dragContainerRef = useRef<HTMLDivElement>(null);
  // Use dayCellContent for consistent date formatting
  const dateDisplay = dayCellContent({
    date,
    dayNumberText: date.getDate().toString(),
    isToday: new Date().toDateString() === date.toDateString(),
    isPopover: true,
  });

  useEffect(() => {
    const element = dragContainerRef.current;

    if (!element) return;

    // Create individual Draggable for this row with performance optimizations
    const draggable = new Draggable(element, {
      itemSelector: '.fc-event-draggable',
      eventData: function (eventEl) {
        return {
          title: eventEl.innerText,
          extendedProps: {
            rowId: eventEl.dataset.rowId,
          },
        };
      },
    });

    return () => {
      draggable.destroy();
    };
  }, []);

  return (
    <>
      <div className='relative mb-2 px-3 pt-2 text-sm font-medium text-text-title'>
        {dateDisplay}
        <div className='absolute right-1 top-1'>
          <Button variant='ghost' size='icon-sm' onClick={onClose}>
            <CloseIcon className='h-4 w-4' />
          </Button>
        </div>
      </div>
      <div
        ref={dragContainerRef}
        className='appflowy-scroller  flex max-h-[140px] flex-col gap-0.5 overflow-y-auto px-2 pb-2'
      >
        {allSegs.map((seg) => {
          // Check if this segment is the first hidden segment
          const isHiddenFirst = hiddenSegs.length > 0 && hiddenSegs[0].event.id === seg.event.id;

          // Construct EventContentArg-like object for EventWithPopover
          const eventInfo: EventContentArg = {
            event: seg.event,
            timeText: seg.event.allDay
              ? ''
              : seg.event.start
              ? seg.event.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              : '',
            borderColor: seg.event.borderColor || '',
            backgroundColor: seg.event.backgroundColor || '',
            textColor: seg.event.textColor || '',
            isStart: seg.isStart,
            isEnd: seg.isEnd,
            isPast: seg.event.end ? seg.event.end < new Date() : false,
            isFuture: seg.event.start ? seg.event.start > new Date() : false,
            isToday: seg.event.start ? seg.event.start.toDateString() === new Date().toDateString() : false,
            view,
          } as EventContentArg;

          const event = calendar.getEventById(seg.event.id) || seg.event;

          return (
            <div
              key={seg.event.id}
              className={cn('fc-event fc-event-draggable w-full', event.classNames)}
              data-row-id={seg.event.extendedProps.rowId}
            >
              <EventWithPopover event={event} eventInfo={eventInfo} isWeekView={false} isHiddenFirst={isHiddenFirst} />
            </div>
          );
        })}
      </div>
    </>
  );
}