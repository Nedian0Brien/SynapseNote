import { ReactComponent as DateSvg } from '@/assets/icons/date.svg';
import { ReactComponent as ReminderSvg } from '@/assets/icons/reminder_clock.svg';
import { renderDate } from '@/utils/time';
import { useMemo } from 'react';

function MentionDate({ date, reminder }: { date: string; reminder?: { id: string; option: string } }) {
  const dateFormat = useMemo(() => {
    return renderDate(date, 'MMM D, YYYY');
  }, [date]);

  return (
    <span
      className={'mention-inline items-center gap-0 opacity-70'}
      style={{
        color: reminder ? 'var(--text-action)' : 'var(--text-primary)',
      }}
    >
      <span className={'mention-content ml-0 px-0'}>
        <span>@</span>
        {dateFormat}
      </span>
      {reminder ? <ReminderSvg /> : <DateSvg />}
    </span>
  );
}

export default MentionDate;
