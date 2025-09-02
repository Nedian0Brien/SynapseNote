import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DateFormat, TimeFormat } from '@/application/types';
import { MetadataKey } from '@/application/user-metadata';
import { ReactComponent as ChevronDownIcon } from '@/assets/icons/alt_arrow_down.svg';
import { useCurrentUser, useService } from '@/components/main/app.hooks';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function AccountSettings({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const service = useService();

  const handleSelectDateFormat = useCallback(
    async (dateFormat: number) => {
      if (!service || !currentUser?.metadata) return;

      await service?.updateUserProfile({ ...currentUser.metadata, [MetadataKey.DateFormat]: dateFormat });
    },
    [currentUser, service]
  );

  const handleSelectTimeFormat = useCallback(
    async (timeFormat: number) => {
      if (!service || !currentUser?.metadata) return;

      await service?.updateUserProfile({ ...currentUser.metadata, [MetadataKey.TimeFormat]: timeFormat });
    },
    [currentUser, service]
  );

  const handleSelectStartWeekOn = useCallback(
    async (startWeekOn: number) => {
      if (!service || !currentUser?.metadata) return;

      await service?.updateUserProfile({ ...currentUser.metadata, [MetadataKey.StartWeekOn]: startWeekOn });
    },
    [currentUser, service]
  );

  if (!currentUser || !service) {
    return <></>;
  }

  const dateFormat = Number(currentUser?.metadata?.[MetadataKey.DateFormat] as DateFormat) || DateFormat.Local;
  const timeFormat = Number(currentUser?.metadata?.[MetadataKey.TimeFormat] as TimeFormat) || TimeFormat.TwelveHour;
  const startWeekOn = Number(currentUser?.metadata?.[MetadataKey.StartWeekOn] as number) || 0;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className='flex h-[300px] min-h-0 w-[400px] flex-col gap-3 sm:max-w-[calc(100%-2rem)]'>
        <DialogTitle className='text-md font-bold text-text-primary'>{t('web.accountSettings')}</DialogTitle>
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
                <DropdownMenuRadioItem key={item.value} value={item.value.toString()}>
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
                <DropdownMenuRadioItem key={item.value} value={item.value.toString()}>
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
                <DropdownMenuRadioItem key={item.value} value={item.value.toString()}>
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
