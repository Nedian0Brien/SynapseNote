import { DateSelectArg, EventDropArg } from '@fullcalendar/core';
import { EventResizeDoneArg } from '@fullcalendar/interaction';
import { useCallback } from 'react';


import { useCalendarLayoutSetting, useCreateCalendarEvent, useUpdateStartEndTimeCell } from '@/application/database-yjs';
import { dateToUnixTimestamp, correctAllDayEndForStorage } from '@/utils/time';

import { CalendarViewType } from '../types';

/**
 * Custom hook to handle calendar event interactions (drag, resize, create)
 * Provides functions that can update the database when events are modified
 */
export function useCalendarEvents() {
  const calendarSetting = useCalendarLayoutSetting();
  const fieldId = calendarSetting.fieldId;
  const createCalendarEvent = useCreateCalendarEvent(fieldId);
  const updateCell = useUpdateStartEndTimeCell();

  // Create a function that can update any event's time directly
  const updateEventTime = useCallback(
    (rowId: string, startTimestamp: string, endTimestamp?: string, isAllDay?: boolean) => {
      console.debug('📅 Updating event time:', { rowId, fieldId, startTimestamp, endTimestamp });

      updateCell(rowId, fieldId, startTimestamp, endTimestamp, isAllDay);
    },
    [fieldId, updateCell]
  );

  // Handle event drop (move event to different time)
  const handleEventDrop = useCallback(
    (dropInfo: EventDropArg) => {
      console.debug('📅 Event dropped:', dropInfo.event);

      try {
        // Parse event ID to get rowId
        const rowId = dropInfo.event.id;

        if (!rowId) {
          throw new Error('Invalid event ID format');
        }

        // Convert dates to Unix timestamps
        const startTimestamp = dateToUnixTimestamp(dropInfo.event.start!);
        const isAllDay = dropInfo.event.allDay;
        
        // For all-day events, correct end time for storage if needed
        const endDate = dropInfo.event.end;
        const correctedEndDate = isAllDay && endDate ? correctAllDayEndForStorage(endDate) : endDate;
        const endTimestamp = correctedEndDate ? dateToUnixTimestamp(correctedEndDate) : undefined;

        // Update the event time
        updateEventTime(rowId, startTimestamp, endTimestamp, isAllDay);

        console.debug('📅 Event time updated successfully');
      } catch (error) {
        console.error('❌ Failed to update event time:', error);
        dropInfo.revert();
      }
    },
    [updateEventTime]
  );

  // Handle event resize (change event duration)
  const handleEventResize = useCallback(
    (resizeInfo: EventResizeDoneArg) => {
      console.debug('📅 Event resized:', resizeInfo.event);

      try {
        // Parse event ID to get rowId
        const rowId = resizeInfo.event.id;

        if (!rowId) {
          throw new Error('Invalid event ID format');
        }

        // Convert dates to Unix timestamps
        const startTimestamp = dateToUnixTimestamp(resizeInfo.event.start!);
        const isAllDay = resizeInfo.event.allDay;
        
        // For all-day events, correct end time for storage if needed
        const endDate = resizeInfo.event.end;
        const correctedEndDate = isAllDay && endDate ? correctAllDayEndForStorage(endDate) : endDate;
        const endTimestamp = correctedEndDate ? dateToUnixTimestamp(correctedEndDate) : undefined;

        // Update the event time
        updateEventTime(rowId, startTimestamp, endTimestamp, isAllDay);

        console.debug('📅 Event duration updated successfully');
      } catch (error) {
        console.error('❌ Failed to update event duration:', error);
        resizeInfo.revert();
      }
    },
    [updateEventTime]
  );

  // Handle date selection (create new event)
  const handleSelect = useCallback(
    async (selectInfo: DateSelectArg): Promise<string | null> => {
      console.debug('📅 Date range selected:', selectInfo);


      try {
        // Convert dates to Unix timestamps
        const startTimestamp = dateToUnixTimestamp(selectInfo.start);
        
        // For all-day events, correct end time for storage if needed
        const correctedEndDate = selectInfo.allDay ? correctAllDayEndForStorage(selectInfo.end) : selectInfo.end;
        let endTimestamp = dateToUnixTimestamp(correctedEndDate);

        // For week view time grid selections, default to 1-hour events only for small selections (clicks or short drags)
        if (selectInfo.view.type === CalendarViewType.TIME_GRID_WEEK && !selectInfo.allDay) {
          const selectionDuration = selectInfo.end.getTime() - selectInfo.start.getTime();
          const thirtyMinutesInMs = 30 * 60 * 1000; // 30 minutes in milliseconds
          
          // Only adjust to 1-hour if selection is 30 minutes or less (typically clicks)
          if (selectionDuration <= thirtyMinutesInMs) {
            const startDate = new Date(selectInfo.start);
            const endDate = new Date(startDate);

            endDate.setHours(startDate.getHours() + 1); // Add 1 hour
            
            endTimestamp = dateToUnixTimestamp(endDate);
            console.debug('📅 Week view: Adjusted to 1-hour event for short selection', { 
              originalDuration: `${selectionDuration / 1000 / 60} minutes`,
              original: selectInfo.end, 
              adjusted: endDate 
            });
          } else {
            console.debug('📅 Week view: Keeping original selection duration', {
              duration: `${selectionDuration / 1000 / 60} minutes`
            });
          }
        }

        
        // Create new calendar event
        const rowId = await createCalendarEvent({ startTimestamp, endTimestamp, includeTime: !selectInfo.allDay });

        console.debug('📅 New event created successfully with rowId:', rowId);

        // Clear the selection
        selectInfo.view.calendar.unselect();

        return rowId;
      } catch (error) {
        console.error('❌ Failed to create new event:', error);
        // Clear the selection even if creation failed
        selectInfo.view.calendar.unselect();
        return null;
      }
    },
    [createCalendarEvent]
  );

  // Handle add button click for specific date
  const handleAdd = useCallback(
    async (date: Date): Promise<string | null> => {
      console.debug('📅 Add button clicked for date:', date);

      try {
        // Create event for the selected date at current time or start of day
        const startTimestamp = dateToUnixTimestamp(date);

        // Create new calendar event for the specific date
        const rowId = await createCalendarEvent({ startTimestamp });

        console.debug('📅 New event created successfully with rowId:', rowId);
        return rowId;
      } catch (error) {
        console.error('❌ Failed to create new event:', error);
        return null;
      }
    },
    [createCalendarEvent]
  );

  return {
    handleEventDrop,
    handleEventResize,
    handleSelect,
    handleAdd,
    updateEventTime,
  };
}
