import dayjs from 'dayjs';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { DateFormat, TimeFormat } from '@/application/types';
import { MetadataKey } from '@/application/user-metadata';
import { ReactComponent as ChevronDownIcon } from '@/assets/icons/alt_arrow_down.svg';
import { useCurrentUser, useService } from '@/components/main/app.hooks';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function AccountSettings({ 
  children, 
  open, 
  onOpenChange 
}: { 
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const service = useService();

  const [dateFormat, setDateFormat] = useState(
    () => Number(currentUser?.metadata?.[MetadataKey.DateFormat] as DateFormat) || DateFormat.Local
  );
  const [timeFormat, setTimeFormat] = useState(
    () => Number(currentUser?.metadata?.[MetadataKey.TimeFormat] as TimeFormat) || TimeFormat.TwelveHour
  );
  const [startWeekOn, setStartWeekOn] = useState(() => Number(currentUser?.metadata?.[MetadataKey.StartWeekOn]) || 0);

  // Track if we're in the middle of an update to prevent syncing
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync state with currentUser only when dialog opens/remounts
  useEffect(() => {
    // Only sync if controlled mode and dialog is opening AND we're not updating
    if (open !== undefined && open && !isUpdating) {
      const newDateFormat = Number(currentUser?.metadata?.[MetadataKey.DateFormat] as DateFormat) || DateFormat.Local;
      const newTimeFormat = Number(currentUser?.metadata?.[MetadataKey.TimeFormat] as TimeFormat) || TimeFormat.TwelveHour;
      const newStartWeek = Number(currentUser?.metadata?.[MetadataKey.StartWeekOn]) || 0;
      
      setDateFormat(newDateFormat);
      setTimeFormat(newTimeFormat);
      setStartWeekOn(newStartWeek);
    }
  }, [open, currentUser?.metadata, isUpdating]); // Include metadata but only use when opening

  // Reusable helper for optimistic metadata updates
  const updateMetadataOptimistically = useCallback(
    async (
      metadataKey: MetadataKey,
      newValue: number,
      setStateFunction: (value: number) => void,
      previousValue: number,
      errorMessage: string
    ) => {
      if (!service || !currentUser) return;

      // Mark as updating to prevent re-sync
      setIsUpdating(true);
      
      // Optimistic update - update UI immediately
      setStateFunction(newValue);
      
      try {
        const metadata = currentUser.metadata || {};
        const updatedMetadata = { ...metadata, [metadataKey]: newValue };
        
        // Update in memory immediately
        if (currentUser.metadata) {
          currentUser.metadata[metadataKey] = newValue;
        }
        
        // Send update to server
        await service.updateUserProfile(updatedMetadata);
        
        // Delayed getCurrentUser to allow test verification without causing flicker
        setTimeout(() => service.getCurrentUser(), 300);
      } catch (error) {
        // Rollback on failure
        console.error(errorMessage, error);
        setStateFunction(previousValue);
        
        // Restore in-memory value
        if (currentUser.metadata) {
          currentUser.metadata[metadataKey] = previousValue;
        }
      } finally {
        // Clear updating flag after a short delay to ensure WebSocket update has been processed
        setTimeout(() => setIsUpdating(false), 500);
      }
    },
    [currentUser, service]
  );

  const handleSelectDateFormat = useCallback(
    async (dateFormat: number) => {
      const previousFormat = Number(currentUser?.metadata?.[MetadataKey.DateFormat] as DateFormat) || DateFormat.Local;
      
      await updateMetadataOptimistically(
        MetadataKey.DateFormat,
        dateFormat,
        setDateFormat,
        previousFormat,
        'Failed to update date format:'
      );
    },
    [currentUser?.metadata, updateMetadataOptimistically]
  );

  const handleSelectTimeFormat = useCallback(
    async (timeFormat: number) => {
      const previousFormat = Number(currentUser?.metadata?.[MetadataKey.TimeFormat] as TimeFormat) || TimeFormat.TwelveHour;
      
      await updateMetadataOptimistically(
        MetadataKey.TimeFormat,
        timeFormat,
        setTimeFormat,
        previousFormat,
        'Failed to update time format:'
      );
    },
    [currentUser?.metadata, updateMetadataOptimistically]
  );

  const handleSelectStartWeekOn = useCallback(
    async (startWeekOn: number) => {
      const previousValue = Number(currentUser?.metadata?.[MetadataKey.StartWeekOn]) || 0;
      
      await updateMetadataOptimistically(
        MetadataKey.StartWeekOn,
        startWeekOn,
        setStartWeekOn,
        previousValue,
        'Failed to update start week on:'
      );
    },
    [currentUser?.metadata, updateMetadataOptimistically]
  );

  if (!currentUser || !service) {
    return <></>;
  }

  // If open/onOpenChange are provided, use them for controlled mode
  if (open !== undefined && onOpenChange) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="account-settings-dialog" className='flex h-[300px] min-h-0 w-[400px] flex-col gap-3 sm:max-w-[calc(100%-2rem)]'>
          <DialogTitle className='text-md font-bold text-text-primary'>{t('web.accountSettings')}</DialogTitle>
          <DialogDescription className='sr-only'>Configure your account preferences including date format, time format, and week start day</DialogDescription>
          <div className='flex min-h-0 w-full flex-1 flex-col items-start gap-3 py-4'>
            <DateFormatDropdown dateFormat={dateFormat} onSelect={handleSelectDateFormat} />
            <TimeFormatDropdown timeFormat={timeFormat} onSelect={handleSelectTimeFormat} />
            <StartWeekOnDropdown startWeekOn={startWeekOn} onSelect={handleSelectStartWeekOn} />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Legacy mode with children as trigger
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent data-testid="account-settings-dialog" className='flex h-[300px] min-h-0 w-[400px] flex-col gap-3 sm:max-w-[calc(100%-2rem)]'>
        <DialogTitle className='text-md font-bold text-text-primary'>{t('web.accountSettings')}</DialogTitle>
        <DialogDescription className='sr-only'>Configure your account preferences including date format, time format, and week start day</DialogDescription>
        <div className='flex min-h-0 w-full flex-1 flex-col items-start gap-3 py-4'>
          <DateFormatDropdown dateFormat={dateFormat} onSelect={handleSelectDateFormat} />
          <TimeFormatDropdown timeFormat={timeFormat} onSelect={handleSelectTimeFormat} />
          <StartWeekOnDropdown startWeekOn={startWeekOn} onSelect={handleSelectStartWeekOn} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DateFormatDropdown({ dateFormat, onSelect }: { dateFormat: number; onSelect: (dateFormat: number) => void }) {
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);

  const dateFormats = useMemo(
    () => [
      {
        value: DateFormat.Local,
        label: t('grid.field.dateFormatLocal'),
      },
      {
        label: t('grid.field.dateFormatUS'),
        value: DateFormat.US,
      },
      {
        label: t('grid.field.dateFormatISO'),
        value: DateFormat.ISO,
      },
      {
        label: t('grid.field.dateFormatFriendly'),
        value: DateFormat.Friendly,
      },
      {
        label: t('grid.field.dateFormatDayMonthYear'),
        value: DateFormat.DayMonthYear,
      },
    ],
    [t]
  );

  const value = dateFormats.find((format) => format.value === dateFormat);

  return (
    <div className='flex flex-col items-start gap-1'>
      <span className='text-xs font-medium text-text-secondary'>{t('grid.field.dateFormat')}</span>
      <div className='relative'>
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
          <DropdownMenuTrigger
            data-testid="date-format-dropdown"
            asChild
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <div
              className={cn(
                'flex h-8 flex-1 cursor-default items-center gap-1 rounded-300 border px-2 text-sm font-normal',
                isOpen ? 'border-border-theme-thick' : 'border-border-primary hover:border-border-primary-hover'
              )}
            >
              <span className='flex-1 truncate' onMouseDown={(e) => e.preventDefault()}>
                {value?.label || t('settings.workspacePage.dateTime.dateFormat.label')}
              </span>
              <ChevronDownIcon className='text-icon-primary' />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className='w-[--radix-dropdown-menu-trigger-width]' align='start'>
            <DropdownMenuRadioGroup value={dateFormat.toString()} onValueChange={(value) => onSelect(Number(value))}>
              {dateFormats.map((item) => (
                <DropdownMenuRadioItem data-testid={`date-format-${item.value}`} key={item.value} value={item.value.toString()}>
                  {item.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function TimeFormatDropdown({ timeFormat, onSelect }: { timeFormat: number; onSelect: (timeFormat: number) => void }) {
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);

  const timeFormats = useMemo(
    () => [
      {
        value: TimeFormat.TwelveHour,
        label: t('grid.field.timeFormatTwelveHour'),
      },
      {
        label: t('grid.field.timeFormatTwentyFourHour'),
        value: TimeFormat.TwentyFourHour,
      },
    ],
    [t]
  );

  const value = timeFormats.find((format) => format.value === timeFormat);

  return (
    <div className='flex flex-col items-start gap-1'>
      <span className='text-xs font-medium text-text-secondary'>{t('grid.field.timeFormat')}</span>
      <div className='relative'>
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
          <DropdownMenuTrigger
            data-testid="time-format-dropdown"
            asChild
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <div
              className={cn(
                'flex h-8 flex-1 cursor-default items-center gap-1 rounded-300 border px-2 text-sm font-normal',
                isOpen ? 'border-border-theme-thick' : 'border-border-primary hover:border-border-primary-hover'
              )}
            >
              <span className='flex-1 truncate' onMouseDown={(e) => e.preventDefault()}>
                {value?.label || t('grid.field.timeFormatTwelveHour')}
              </span>
              <ChevronDownIcon className='text-icon-primary' />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className='w-[--radix-dropdown-menu-trigger-width]' align='start'>
            <DropdownMenuRadioGroup value={timeFormat.toString()} onValueChange={(value) => onSelect(Number(value))}>
              {timeFormats.map((item) => (
                <DropdownMenuRadioItem data-testid={`time-format-${item.value}`} key={item.value} value={item.value.toString()}>
                  {item.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function StartWeekOnDropdown({
  startWeekOn,
  onSelect,
}: {
  startWeekOn: number;
  onSelect: (startWeekOn: number) => void;
}) {
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);

  const daysOfWeek = [
    {
      value: 0,
      label: dayjs().day(0).format('dddd'),
    },
    {
      value: 1,
      label: dayjs().day(1).format('dddd'),
    },
  ] as const;

  const value = daysOfWeek.find((format) => format.value === startWeekOn);

  return (
    <div className='flex flex-col items-start gap-1'>
      <span className='text-xs font-medium text-text-secondary'>{t('web.startWeekOn')}</span>
      <div className='relative'>
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
          <DropdownMenuTrigger
            data-testid="start-week-on-dropdown"
            asChild
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <div
              className={cn(
                'flex h-8 flex-1 cursor-default items-center gap-1 rounded-300 border px-2 text-sm font-normal',
                isOpen ? 'border-border-theme-thick' : 'border-border-primary hover:border-border-primary-hover'
              )}
            >
              <span className='flex-1 truncate' onMouseDown={(e) => e.preventDefault()}>
                {value?.label || t('grid.field.timeFormatTwelveHour')}
              </span>
              <ChevronDownIcon className='text-icon-primary' />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className='w-[--radix-dropdown-menu-trigger-width]' align='start'>
            <DropdownMenuRadioGroup value={startWeekOn.toString()} onValueChange={(value) => onSelect(Number(value))}>
              {daysOfWeek.map((item) => (
                <DropdownMenuRadioItem data-testid={`start-week-${item.value}`} key={item.value} value={item.value.toString()}>
                  {item.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
