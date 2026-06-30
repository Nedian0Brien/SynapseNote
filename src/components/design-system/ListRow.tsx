import * as React from 'react';

import { cn } from '@/lib/utils';

type ListRowProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  indent?: number;
};

export const ListRow = React.forwardRef<HTMLButtonElement, ListRowProps>(
  ({ icon, title, meta, trailing, indent = 0, className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      style={{ paddingLeft: `${12 + indent * 16}px` }}
      className={cn(
        'group flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition duration-sn ease-sn hover:bg-sn-primary-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className
      )}
      {...props}
    >
      {icon ? (
        <span className='flex size-8 shrink-0 items-center justify-center rounded-sn-xs border border-sn-outline-soft bg-sn-surface-low text-sn-variant'>
          {icon}
        </span>
      ) : null}
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-medium text-sn-ink'>{title}</span>
        {meta ? <span className='mt-0.5 block truncate text-xs text-sn-muted'>{meta}</span> : null}
      </span>
      {trailing ? <span className='shrink-0 text-xs text-sn-muted'>{trailing}</span> : null}
    </button>
  )
);

ListRow.displayName = 'ListRow';
