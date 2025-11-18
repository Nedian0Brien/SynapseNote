import { useMemo } from 'react';

import { parsePersonCellData, useFieldSelector } from '@/application/database-yjs';
import { CellProps, PersonCell as PersonCellType } from '@/application/database-yjs/cell.type';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function PersonCell({ cell, style, placeholder, fieldId, wrap }: CellProps<PersonCellType>) {
  const { field, clock } = useFieldSelector(fieldId);

  const users = useMemo(() => {
    return parsePersonCellData(field, cell?.data ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell?.data, field, clock]);

  const isEmpty = !users || !users.users.length;

  const renderedUsers = useMemo(() => {
    if (!users) return;

    return users?.users.map((user) => (
      <div key={user.id} className='min-w-fit max-w-[120px]'>
        <div className='flex items-center gap-1'>
          <Avatar className='h-5 w-5 border border-border-primary'>
            <AvatarImage src={user.avatar_url} alt={''} />
            <AvatarFallback>
              {user.avatar_url ? <span className='flex justify-center text-sm'>{user.avatar_url}</span> : user.name}
            </AvatarFallback>
          </Avatar>
          <span className='truncate text-sm'>{user.name}</span>
        </div>
      </div>
    ));
  }, [users]);

  return (
    <div
      style={style}
      className={cn(
        'select-option-cell flex w-full items-center gap-1',
        isEmpty && placeholder ? 'text-text-tertiary' : '',
        wrap
          ? 'flex-wrap overflow-x-hidden'
          : 'appflowy-hidden-scroller h-full w-full flex-nowrap overflow-x-auto overflow-y-hidden'
      )}
    >
      {isEmpty ? placeholder || null : renderedUsers}
    </div>
  );
}
