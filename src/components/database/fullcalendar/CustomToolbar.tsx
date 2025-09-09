import { CalendarApi } from '@fullcalendar/core';
import dayjs from 'dayjs';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CalendarEvent } from '@/application/database-yjs';
import { ReactComponent as ChevronLeft } from '@/assets/icons/alt_arrow_left.svg';
import { ReactComponent as ChevronRight } from '@/assets/icons/alt_arrow_right.svg';
import { ReactComponent as CalendarIcon } from '@/assets/icons/calendar.svg';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { NoDateButton } from './NoDateButton';
import { CalendarViewType } from './types';

interface CustomToolbarProps {
  calendar: CalendarApi | null;
  onViewChange?: (view: CalendarViewType) => void;
  currentView?: CalendarViewType;
  slideDirection?: 'up' | 'down' | null;
  emptyEvents?: CalendarEvent[];
}

export const CustomToolbar = memo(
  ({
    calendar,
    onViewChange,
    currentView = CalendarViewType.DAY_GRID_MONTH,
    slideDirection,
    emptyEvents = [],
  }: CustomToolbarProps) => {
    const { t } = useTranslation();

    const [currentMonth, setCurrentMonth] = useState('');
    const [animationKey, setAnimationKey] = useState(0);

    const getCurrentMonth = useCallback(() => {
      if (!calendar) return '';
      const currentDate = dayjs(calendar.getDate());

      if (currentView === CalendarViewType.TIME_GRID_WEEK) {
        const view = calendar.view;
        const startDate = dayjs(view.activeStart);
        const endDate = dayjs(view.activeEnd).subtract(1, 'day');

        if (startDate.month() === endDate.month()) {
          return `${startDate.format('MMMM YYYY')}`;
        } else {
          return `${startDate.format('MMM')} - ${endDate.format('MMM YYYY')}`;
        }
      }

      return currentDate.format('MMMM YYYY');
    }, [calendar, currentView]);

    useEffect(() => {
      if (!calendar) return;

      const handleDateChange = () => {
        const newMonth = getCurrentMonth();

        setCurrentMonth(newMonth);
        setAnimationKey((prev) => prev + 1);
      };

      calendar.on('datesSet', handleDateChange);

      const initialMonth = getCurrentMonth();

      setCurrentMonth(initialMonth);

      return () => {
        calendar.off('datesSet', handleDateChange);
      };
    }, [calendar, getCurrentMonth]);

    const handlePrev = useCallback(() => {
      calendar?.prev();
    }, [calendar]);

    const handleNext = useCallback(() => {
      calendar?.next();
    }, [calendar]);

    const handleToday = useCallback(() => {
      calendar?.today();
    }, [calendar]);

    const handleViewChange = useCallback(
      (view: CalendarViewType) => {
        calendar?.changeView(view);
        onViewChange?.(view);
      },
      [calendar, onViewChange]
    );

    const views = useMemo(
      () => [
        { key: CalendarViewType.TIME_GRID_WEEK, label: t('calendar.week'), icon: CalendarIcon },
        { key: CalendarViewType.DAY_GRID_MONTH, label: t('calendar.month'), icon: CalendarIcon },
      ],
      [t]
    );

    const label = useMemo(() => {
      return views.find((view) => view.key === currentView)?.label;
    }, [currentView, views]);

    return (
      <div className='grid grid-cols-3 items-center bg-background-primary px-1 py-4'>
        <div className='relative flex h-8 items-center overflow-hidden'>
          <AnimatePresence mode='wait'>
            <motion.h2
              key={`${currentMonth}-${animationKey}`}
              className='whitespace-nowrap text-xl font-semibold text-text-primary'
              initial={{
                y: slideDirection === 'up' ? 32 : slideDirection === 'down' ? -32 : 0,
                opacity: slideDirection ? 0 : 1,
              }}
              animate={{
                y: 0,
                opacity: 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 25,
                duration: 0.5,
              }}
            >
              {currentMonth}
            </motion.h2>
          </AnimatePresence>
        </div>

        <div className='flex items-center justify-center'>
          <div className='flex items-center gap-0.5 rounded-300 border border-border-primary bg-fill-content p-0.5'>
            {views.map((view) => (
              <Button
                key={view.key}
                variant={'ghost'}
                size='sm'
                onClick={() => handleViewChange(view.key)}
                className={cn(
                  'min-w-[88px] border-transparent text-text-secondary hover:bg-fill-content hover:text-text-primary',

                  currentView === view.key && '!bg-fill-content-hover text-text-primary'
                )}
              >
                {view.label}
              </Button>
            ))}
          </div>
        </div>

        <div className='flex items-center justify-end gap-1 overflow-hidden'>
          <NoDateButton emptyEvents={emptyEvents} isWeekView={currentView === CalendarViewType.TIME_GRID_WEEK} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='ghost' onClick={handlePrev} size='icon'>
                <ChevronLeft className='h-5 w-5' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('calendar.navigation.previous', { view: label })}</TooltipContent>
          </Tooltip>

          <Button variant='outline' size='sm' onClick={handleToday}>
            {t('calendar.navigation.today')}
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='ghost' size='icon' onClick={handleNext}>
                <ChevronRight className='h-5 w-5' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('calendar.navigation.next', { view: label })}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }
);