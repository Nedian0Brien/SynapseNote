import { EventApi, EventContentArg } from '@fullcalendar/core';
import { useEffect, useState } from 'react';

import {
  MonthAllDayEvent,
  MonthMultiDayTimedEvent,
  MonthTimedEvent,
  WeekAllDayEvent,
  WeekTimedEvent,
} from './components';

interface EventDisplayProps {
  event: EventApi;
  eventInfo: EventContentArg;
  onClick?: (event: EventApi) => void;
  isWeekView?: boolean;
  showLeftIndicator?: boolean;
  className?: string;
  isHiddenFirst?: boolean;
}

export function EventDisplay({
  event,
  eventInfo,
  onClick,
  isWeekView = false,
  showLeftIndicator = true,
  className,
  isHiddenFirst = false,
}: EventDisplayProps) {
  const rowId = event.extendedProps?.rowId;
  const [showBling, setShowBling] = useState(isHiddenFirst);

  useEffect(() => {
    if (isHiddenFirst) {
      setShowBling(true);
      const timer = setTimeout(() => {
        setShowBling(false);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isHiddenFirst]);

  if (!rowId) return null;

  const isMultiDay = event.start && event.end && event.start.toDateString() !== event.end.toDateString();

  const getEventComponent = () => {
    if (isWeekView) {
      return event.allDay ? WeekAllDayEvent : WeekTimedEvent;
    } else {
      if (event.allDay) {
        return MonthAllDayEvent;
      } else {
        return isMultiDay ? MonthMultiDayTimedEvent : MonthTimedEvent;
      }
    }
  };

  const EventComponent = getEventComponent();

  return (
    <div
      className={showBling ? 'animate-pulse' : ''}
      style={{
        animation: showBling ? 'event-bling 0.9s ease-in-out infinite' : undefined,
      }}
    >
      <EventComponent
        event={event}
        eventInfo={eventInfo}
        onClick={onClick}
        showLeftIndicator={showLeftIndicator}
        className={className}
        rowId={rowId}
      />
    </div>
  );
}

// Export alias for backward compatibility
export { EventDisplay as EventContent };
