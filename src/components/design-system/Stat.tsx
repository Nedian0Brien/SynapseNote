import * as React from 'react';

import { cn } from '@/lib/utils';

type StatProps = {
  value: React.ReactNode;
  label: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export function Stat({ value, label, icon, className }: StatProps) {
  return (
    <div
      className={cn(
        'flex min-h-[84px] items-center gap-3 rounded-sn-lg border border-sn-outline bg-sn-surface p-4',
        className
      )}
    >
      {icon ? (
        <div className='flex size-10 shrink-0 items-center justify-center rounded-sn-sm border border-sn-outline-soft bg-sn-surface-low text-sn-variant'>
          {icon}
        </div>
      ) : null}
      <div className='min-w-0'>
        <div className='font-hl text-[26px] font-extrabold leading-none text-sn-ink tabular-nums'>{value}</div>
        <div className='mt-2 text-[11px] font-bold uppercase tracking-[.09em] text-sn-muted'>{label}</div>
      </div>
    </div>
  );
}
