import * as React from 'react';

import { cn } from '@/lib/utils';

type PillProps<T extends React.ElementType = 'div'> = {
  as?: T;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as'>;

export function Pill<T extends React.ElementType = 'div'>({ as, className, ...props }: PillProps<T>) {
  const Comp = as || 'div';

  return (
    <Comp
      className={cn(
        'inline-flex items-center gap-2 rounded-sn-full border border-sn-outline bg-sn-surface px-3 py-1.5 text-sm text-sn-ink shadow-sn-sm',
        className
      )}
      {...props}
    />
  );
}
