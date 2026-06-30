import * as React from 'react';

import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b border-sn-outline-soft pb-5 md:flex-row md:items-end md:justify-between',
        className
      )}
    >
      <div className='min-w-0'>
        <h1 className='truncate font-hl text-[28px] font-bold leading-tight text-sn-ink'>{title}</h1>
        {subtitle ? <p className='mt-1 text-sm leading-6 text-sn-variant'>{subtitle}</p> : null}
      </div>
      {actions ? <div className='flex shrink-0 flex-wrap items-center gap-2'>{actions}</div> : null}
    </header>
  );
}
