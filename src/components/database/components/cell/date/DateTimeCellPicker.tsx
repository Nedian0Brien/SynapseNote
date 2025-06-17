import { setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import dayjs from 'dayjs';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DateFormat,
  getDateFormat,
  getTimeFormat,
  getTypeOptions, TimeFormat,
  useFieldSelector,
} from '@/application/database-yjs';
import { DateTimeCell } from '@/application/database-yjs/cell.type';
import { useUpdateCellDispatch } from '@/application/database-yjs/dispatch';
import { YjsDatabaseKey } from '@/application/types';
import { ReactComponent as ChevronRight } from '@/assets/icons/alt_arrow_right.svg';
import { ReactComponent as DateSvg } from '@/assets/icons/date.svg';
import { ReactComponent as TimeIcon } from '@/assets/icons/time.svg';
import DateTimeFormatMenu from '@/components/database/components/cell/date/DateTimeFormatMenu';
import DateTimeInput from '@/components/database/components/cell/date/DateTimeInput';
import { Calendar } from '@/components/ui/calendar';
import { dropdownMenuItemVariants } from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

function DateTimeCellPicker ({ open, onOpenChange, cell, fieldId, rowId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cell?: DateTimeCell;
  fieldId: string;
  rowId: string;
}) {
  const { t } = useTranslation();

  const [isRange, setIsRange] = useState<boolean>(() => {
    if (!cell) return false;
    return cell.isRange || false;
  });

  const [includeTime, setIncludeTime] = useState<boolean>(() => {
    if (!cell) return false;
    return cell.includeTime || false;
  });

  const { field, clock } = useFieldSelector(fieldId);

  const currentTime = useMemo(() => {
    return new Date();
  }, []);

  const typeOptionValue = useMemo(() => {
    const typeOption = getTypeOptions(field);

    return {
      timeFormat: getTimeFormat(Number(typeOption.get(YjsDatabaseKey.time_format)) as TimeFormat),
      dateFormat: getDateFormat(Number(typeOption.get(YjsDatabaseKey.date_format)) as DateFormat),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, clock]);

  const updateCell = useUpdateCellDispatch(rowId, fieldId);

  const setCurrentTime = useCallback((date: Date, time?: Date) => {

    let newDate = date;

    const newCurrentTime = time || currentTime;

    newDate = setHours(newDate, newCurrentTime.getHours());
    newDate = setMinutes(newDate, newCurrentTime.getMinutes());
    newDate = setSeconds(newDate, newCurrentTime.getSeconds());
    newDate = setMilliseconds(newDate, newCurrentTime.getMilliseconds());

    return newDate;
  }, [currentTime]);

  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to?: Date | undefined;
  } | undefined>(() => {
    if (!cell) return;
    if (typeof cell.data !== 'string' && typeof cell.data !== 'number') {
      return;
    }

    try {
      const from = cell.data ? new Date(Number(cell.data) * 1000) : undefined;
      const to = cell.endTimestamp ? new Date(Number(cell.endTimestamp) * 1000) : undefined;

      return {
        from,
        to,
      };
    } catch (e) {
      return;
    }

  });

  const dateOptsRef = useRef<{
    includeTime?: boolean;
    isRange?: boolean;
  }>({
    includeTime,
    isRange,
  });

  const onSelect = useCallback((dateRange: { from: Date | undefined; to?: Date | undefined } | undefined) => {
    const newDateRange = dateRange;

    setDateRange(newDateRange);
    const data = newDateRange?.from ? dayjs(newDateRange.from).unix().toString() : '';
    const endTimestamp = newDateRange?.to ? dayjs(newDateRange.to).unix().toString() : undefined;

    updateCell(data, {
      includeTime: dateOptsRef.current?.includeTime,
      isRange: dateOptsRef.current?.isRange,
      endTimestamp,
    });
  }, [updateCell]);

  const [month, setMonth] = useState<Date | undefined>(() => {
    if (!dateRange?.from) {
      return currentTime;
    }

    return dateRange.from;
  });

  const onMonthChange = useCallback((date: Date) => {
    setMonth(date);
  }, []);

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
    >
      <PopoverTrigger
        style={{
          zIndex: open ? 1 : -1,
        }}
        onPointerDown={() => {
          onOpenChange(false);
        }}
        className={'absolute bg-transparent left-0 top-0 w-full h-full z-[-1]'}
      />
      <PopoverContent
        avoidCollisions={true}
        side={'bottom'}
        align={'start'}
        onClick={e => e.stopPropagation()}
        onCloseAutoFocus={e => e.preventDefault()}
        className={'w-[260px] overflow-y-auto'}
      >
        <div className={'flex flex-col w-full gap-2 p-2'}>
          <DateTimeInput
            autoFocus
            timeFormat={typeOptionValue.timeFormat}
            dateFormat={typeOptionValue.dateFormat}
            date={dateRange?.from}
            includeTime={includeTime}
            onDateChange={date => {
              onSelect({
                from: date,
                to: dateRange?.to,
              });
            }}
          />
          {isRange && <DateTimeInput
            timeFormat={typeOptionValue.timeFormat}
            dateFormat={typeOptionValue.dateFormat}
            date={dateRange?.to}
            includeTime={includeTime}
            onDateChange={date => {
              onSelect({
                from: dateRange?.from,
                to: date,
              });
            }}
          />}

        </div>
        <div className={'flex w-full justify-center'}>
          <Calendar
            defaultMonth={dateRange?.from || currentTime}
            showOutsideDays
            month={month}
            onMonthChange={onMonthChange}
            {...(isRange ? {
              mode: 'range',
              selected: dateRange,
              onSelect: (range) => {
                const { from, to } = dateRange || {};

                onSelect(range ? {
                  from: range.from ? setCurrentTime(range.from, from) : undefined,
                  to: range.to ? setCurrentTime(range.to, to) : undefined,
                } : undefined);
              },
            } : {
              mode: 'single',
              selected: dateRange?.from,
              onSelect: (date) => {
                const from = dateRange?.from;

                onSelect({
                  from: date ? setCurrentTime(date, from) : undefined,
                });
              },
            })}
          />
        </div>
        <Separator className={'my-2'} />
        <div className={'px-2'}>
          <div
            className={cn(dropdownMenuItemVariants({
              variant: 'default',
            }), 'hover:bg-transparent  cursor-default w-full')}
          >
            <DateSvg className={'w-5 h-5'} />
            {t('grid.dateFilter.endDate')}
            <Switch
              className={'ml-auto'}
              checked={isRange}
              onCheckedChange={checked => {
                setIsRange(checked);
                dateOptsRef.current = {
                  ...dateOptsRef.current,
                  isRange: checked,
                };
                if (checked) {
                  onSelect({
                    from: dateRange?.from || currentTime,
                    to: dateRange?.to || dateRange?.from || currentTime,
                  });
                } else {
                  onSelect({
                    from: dateRange?.from || currentTime,
                    to: undefined,
                  });
                }
              }}
            />
          </div>
          <div
            className={cn(dropdownMenuItemVariants({
              variant: 'default',
            }), 'hover:bg-transparent cursor-default w-full')}
          >
            <TimeIcon className={'w-5 h-5'} />
            {t('grid.field.includeTime')}
            <Switch
              className={'ml-auto'}
              checked={includeTime}
              onCheckedChange={checked => {
                setIncludeTime(checked);
                dateOptsRef.current = {
                  ...dateOptsRef.current,
                  includeTime: checked,
                };
                onSelect(dateRange ? dateRange : {
                  from: currentTime,
                  to: isRange ? currentTime : undefined,
                });
              }}
            />
          </div>
        </div>
        <Separator className={'my-2'} />
        <div className={'px-2'}>
          <DateTimeFormatMenu fieldId={fieldId}>
            <div
              className={cn(dropdownMenuItemVariants({
                variant: 'default',
              }), 'w-full')}
            >
              {`${t('datePicker.dateFormat')} & ${t('datePicker.timeFormat')}`}

              <ChevronRight className={'ml-auto w-5 h-5 text-text-tertiary'} />

            </div>
          </DateTimeFormatMenu>
        </div>
        <div className={'px-2 pb-2'}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              setIsRange(false);
              setIncludeTime(false);
              dateOptsRef.current = {
                isRange: false,
                includeTime: false,
              };

              onSelect(undefined);

              onOpenChange(false);
            }}
            className={cn(dropdownMenuItemVariants({
              variant: 'default',
            }), 'w-full')}
          >
            {t('grid.field.clearDate')}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DateTimeCellPicker;