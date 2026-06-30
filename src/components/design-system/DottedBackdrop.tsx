import * as React from 'react';

import { cn } from '@/lib/utils';

export function DottedBackdrop({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-sn-bg', className)}
      style={{
        backgroundImage: 'radial-gradient(var(--g-dot) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
      {...props}
    />
  );
}
