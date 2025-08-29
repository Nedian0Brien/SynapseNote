import dayjs from 'dayjs';

import { getTypeOptions } from '@/application/database-yjs';
import { DateTimeCell } from '@/application/database-yjs/cell.type';
import { DateFormat, TimeFormat, User, YDatabaseField, YjsDatabaseKey, YMapFieldTypeOption } from '@/application/types';
import { MetadataKey } from '@/application/user-metadata';
import { getDateFormat, getTimeFormat, renderDate } from '@/utils/time';

function getDateTimeStr({
  timeStamp,
  includeTime,
  typeOptionValue,
}: {
  timeStamp: string;
  includeTime?: boolean;
  typeOptionValue: {
    timeFormat: TimeFormat;
    dateFormat: DateFormat;
  };
}) {
  if (!typeOptionValue || !timeStamp) return null;
  const timeFormat = getTimeFormat(typeOptionValue.timeFormat);
  const dateFormat = getDateFormat(typeOptionValue.dateFormat);
  const format = [dateFormat];

  if (includeTime) {
    format.push(timeFormat);
  }

  return renderDate(timeStamp, format.join(' '), true);
}

export const RIGHTWARDS_ARROW = '→';

export function getRowTimeString(field: YDatabaseField, timeStamp: string, currentUser?: User) {
  const typeOption = getTypeOptions(field);
  const typeOptionValue = getFieldDateTimeFormats(typeOption, currentUser);

  const includeTime = typeOption.get(YjsDatabaseKey.include_time);

  return getDateTimeStr({
    timeStamp,
    includeTime,
    typeOptionValue,
  });
}

export function getFieldDateTimeFormats(typeOption: YMapFieldTypeOption, currentUser?: User) {
  const typeOptionTimeFormat = typeOption.get(YjsDatabaseKey.time_format);
  const typeOptionDateFormat = typeOption.get(YjsDatabaseKey.date_format);

  const dateFormat = typeOptionDateFormat
    ? parseInt(typeOptionDateFormat) as DateFormat
    : currentUser?.metadata?.[MetadataKey.DateFormat] as DateFormat ?? DateFormat.Local;
  const timeFormat = typeOptionTimeFormat
    ? parseInt(typeOptionTimeFormat) as TimeFormat
    : currentUser?.metadata?.[MetadataKey.TimeFormat] as TimeFormat ?? TimeFormat.TwelveHour;

  return {
    dateFormat,
    timeFormat,
  }
}

export function getDateCellStr({ cell, field, currentUser }: { cell: DateTimeCell; field: YDatabaseField, currentUser?: User }) {
  const typeOptionMap = field.get(YjsDatabaseKey.type_option);
  const typeOption = typeOptionMap.get(String(cell.fieldType));

  const typeOptionValue = getFieldDateTimeFormats(typeOption, currentUser);

  const startData = cell.data || '';
  const includeTime = cell.includeTime;

  const startDateTime = getDateTimeStr({
    timeStamp: startData,
    includeTime,
    typeOptionValue,
  });

  const endTimestamp = cell.endTimestamp;

  const isRange = cell.isRange;

  const endDateTime =
    endTimestamp && isRange
      ? getDateTimeStr({
        timeStamp: endTimestamp,
        includeTime,
        typeOptionValue,
      })
      : null;

  return [startDateTime, endDateTime].filter(Boolean).join(` ${RIGHTWARDS_ARROW} `);
}

export function isDate(input: string) {
  const date = dayjs(input);

  return date.isValid();
}

export function safeParseTimestamp(input: string) {
  if (/^\d+$/.test(input)) {
    if (input.length >= 9 && input.length <= 10) {
      return dayjs.unix(parseInt(input, 10));
    } else if (input.length >= 12 && input.length <= 13) {
      return dayjs(parseInt(input, 10));
    }
  }

  return dayjs(input);
}
