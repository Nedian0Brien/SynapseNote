import { EventApi, EventContentArg } from '@fullcalendar/core';
import dayjs from 'dayjs';
import { useCallback, useMemo } from 'react';

import { cn } from '@/lib/utils';

import { EventIconButton } from './EventIconButton';

interface WeekTimedEventProps {
  event: EventApi;
  eventInfo: EventContentArg;
  onClick?: (event: EventApi) => void;
  showLeftIndicator?: boolean;
  className?: string;
  rowId: string;
}

const formatTimeDisplay = (date: Date): string => {
  const time = dayjs(date);
  const minutes = time.minute();

  if (minutes === 0) {
    return time.format('h A').toLowerCase();
  } else {
    return time.format('h:mm A').toLowerCase();
  }
};

export function WeekTimedEvent({
  event,
  eventInfo,
  onClick,
  className,
  rowId,
}: WeekTimedEventProps) {
  const isEventStart = eventInfo.isStart;
  const isEventEnd = eventInfo.isEnd;
  const isRange = event.extendedProps.isRange;

  const handleClick = () => {
    onClick?.(event);
  };

  const getDisplayContent = useCallback(() => {
    if (isEventStart) {
      return event.title || 'Untitled';
    }

    if (isEventEnd) {
      return `${event.title || 'Untitled'}`;
    } else {
      return `${event.title || 'Untitled'}`;
    }
  }, [isEventStart, isEventEnd, event.title]);

  const renderTimeEvent = useMemo(() => {
    const moreThanHalfHour = dayjs(event.end).diff(dayjs(event.start), 'minute') > 30;
    const isShortEvent = event.end && dayjs(event.end).diff(dayjs(event.start), 'minute') < 30;

    if (isShortEvent) {
      // For short events (< 30 minutes), use single line layout with minimum height
      return (
        <div className='relative flex min-h-[18px] items-center gap-1 py-0.5 text-xs'>
          <span
            className='event-inner flex-1 truncate font-medium'
            style={{
              fontSize: '11px',
              lineHeight: '1.2',
            }}
          >
            {getDisplayContent()}
          </span>
          <div className='time-slot flex shrink-0 items-center text-[10px] font-normal text-other-colors-text-event'>
            {isEventStart && event.start && <span className='shrink-0'>{formatTimeDisplay(event.start)}</span>}
            <span className='shrink-0'>
              {isEventStart && <span className='mx-0.5'>-</span>}
              {event.end && formatTimeDisplay(event.end)}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          'relative flex pt-[1px] text-xs',
          moreThanHalfHour ? 'h-full max-h-full flex-col' : 'flex-nowrap items-center gap-1 overflow-hidden truncate'
        )}
      >
        <div className={cn('flex min-w-[20px] items-center gap-1', moreThanHalfHour ? 'w-full' : 'truncate')}>
          <EventIconButton rowId={rowId} />
          <span
            className={cn(
              'event-inner font-medium text-other-colors-text-event',
              moreThanHalfHour ? 'flex-shrink overflow-hidden break-words leading-tight' : 'min-w-[28px] truncate'
            )}
            style={
              moreThanHalfHour
                ? {
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: '1.1',
                  }
                : undefined
            }
          >
            {getDisplayContent()}
            {moreThanHalfHour ? '' : ','}
          </span>
        </div>
        <div className='time-slot text-other-colors-text-event-light flex h-[16px] shrink-0 items-center text-xs font-normal'>
          {isEventStart && event.start && <span className='shrink-0'>{formatTimeDisplay(event.start)}</span>}
          {isRange && (
            <span className='shrink-0'>
              {isEventStart && <span className='mx-1'>-</span>}
              {event.end && formatTimeDisplay(event.end)}
            </span>
          )}
        </div>
      </div>
    );
  }, [event.end, event.start, getDisplayContent, isEventStart, rowId, isRange]);

  const isShortEvent = event.end && dayjs(event.end).diff(dayjs(event.start), 'minute') < 30;
  const isCompactLayout = !event.end || isShortEvent;

  return (
    <div
      className={cn(
        'event-content relative flex h-full max-h-full min-h-[22px] w-full cursor-pointer flex-col items-center overflow-hidden text-xs font-medium',
        'text-text-primary',
        'transition-shadow duration-200',
        isCompactLayout ? 'pl-1.5 pr-1 min-h-[12px] py-0' : 'pl-1.5 py-0',
        className
      )}
      onClick={handleClick}
    >
      <div className='relative flex h-full max-h-full w-full flex-1 items-center gap-1 overflow-hidden'>
        <div className='event-inner flex h-full max-h-full w-full flex-1 flex-col justify-center overflow-hidden'>
          {renderTimeEvent}
        </div>
      </div>
    </div>
  );
}