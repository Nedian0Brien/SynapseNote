import * as React from 'react';

import { cn } from '@/lib/utils';

type ChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'dim' | 'solid' | 'dashed';
  icon?: React.ReactNode;
};

export function Chip({ variant = 'default', icon, className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center gap-1 rounded-sn-full px-2.5 py-1 text-[11px] font-medium leading-none',
        variant === 'default' && 'border border-sn-outline bg-sn-surface text-sn-variant',
        variant === 'dim' && 'border border-transparent bg-sn-primary-dim text-sn-ink',
        variant === 'solid' && 'border border-sn-primary bg-sn-primary text-sn-primary-icon',
        variant === 'dashed' && 'border border-dashed border-sn-outline bg-sn-surface text-sn-variant',
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
