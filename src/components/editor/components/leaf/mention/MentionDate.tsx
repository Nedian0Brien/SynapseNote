import { useMemo } from 'react';

import { DateFormat } from '@/application/types';
import { MetadataKey } from '@/application/user-metadata';
import { ReactComponent as DateSvg } from '@/assets/icons/date.svg';
import { ReactComponent as ReminderSvg } from '@/assets/icons/reminder_clock.svg';
import { useCurrentUser } from '@/components/main/app.hooks';
import { getDateFormat, renderDate } from '@/utils/time';

function MentionDate({ date, reminder }: { date: string; reminder?: { id: string; option: string } }) {
  const currentUser = useCurrentUser();

  const formattedDate = useMemo(() => {
    const dateFormat = (currentUser?.metadata?.[MetadataKey.DateFormat] as DateFormat) ?? DateFormat.Local;

    return renderDate(date, getDateFormat(dateFormat));
  }, [currentUser?.metadata, date]);

  return (
    <span
      className={'mention-inline items-center gap-0 opacity-70'}
      style={{
        color: reminder ? 'var(--text-action)' : 'var(--text-primary)',
      }}
    >
      <span className={'mention-content ml-0 px-0'}>
        <span>@</span>
        {formattedDate}
      </span>
      {reminder ? <ReminderSvg /> : <DateSvg />}
    </span>
  );
}

export default MentionDate;
