import * as React from 'react';

import { cn } from '@/lib/utils';

export function SectionLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('text-[11px] font-bold uppercase leading-none tracking-[.09em] text-sn-muted', className)}
      {...props}
    />
  );
}
